const fetch = require('node-fetch');
var request = require('request');
let Queue = require('bull');
const path = require('path');
const decode = require('unescape');
const { getImageAssetTypeId, getDocumentAssetTypeId, downloadBase64FromURL, validateUrl, updateSfRecord } = require('./utils.js');
const { MC_ASSETS_API_PATH, MS_AUTH_PATH, MC_CONTENT_CATEGORIES_API_PATH, REDIS_URL, MC_CONTENT_QUERY_API_PATH } = require('./constants');

const MC_AUTHENTICATION_BASE_URI = process.env.MC_AUTHENTICATION_BASE_URI;
const MC_REST_BASE_URI = process.env.MC_REST_BASE_URI;
const SF_CMS_CONNECTION_ID = process.env.SF_CMS_CONNECTION_ID;
const SF_CMS_URL = process.env.SF_CMS_URL;
const SF_API_VERSION = process.env.SF_API_VERSION;
const MC_FOLDER_NAME = process.env.MC_FOLDER_NAME;
const ASSETNAME_PREFIX = process.env.ASSETNAME_PREFIX || '';

let maxJobsPerWorker = 150;
let jobWorkQueueList = [];

let totalUploadItems = 0;
let failedItemsCount = 0;
let skippedItemsCount = 0;

let nextPageUrl = '';
let ctIndex = 0;

const getMcAuthBody = {
    grant_type: 'client_credentials',
    client_id: process.env.MC_CLIENT_ID,
    client_secret: process.env.MC_CLIENT_SECRET,
};


//Method is use to call api for next available batch 
async function callNextBatchService(accessToken) {
    console.log('Failed Items --->', failedItemsCount);
    console.log('Skipped Items --->', skippedItemsCount);
    try {
        const body = { cmsConnectionId: SF_CMS_CONNECTION_ID }

        const url = `${validateUrl(SF_CMS_URL)}/services/apexrest/CMSSFMC/callHeroku`;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
            body: JSON.stringify(body)
        });

        const response = await res.json();
        console.log('Saleforce Web Service API Called');
    } catch (error) {
        console.log('Error in next call:', error);
    }
}

// Marketing cloud API calling

/**
 * method use for check is file is already avalibale or not in marketing cloud folder
 * @param {*} folderId 
 * @param {*} fileName 
 */

async function checkFileInMc(folderId, fileName) {
    const mcAuthResults = await getMcAuth();
    const serviceUrl = `${validateUrl(MC_REST_BASE_URI)}${MC_CONTENT_QUERY_API_PATH}`;

    const body = JSON.stringify({
        "page":
        {
            "pageSize": 1 //fixed
        },

        "query":
        {
            "leftOperand":
            {
                "property": "category.id",
                "simpleOperator": "equal",
                "value": folderId // folderid
            },
            "logicalOperator": "AND",
            "rightOperand":
            {
                "property": "name",
                "simpleOperator": "like",
                "value": fileName
            }
        },
        "fields":
            [
                "id",
                "assetType",
                "name"
            ]
    });

    return await fetch(serviceUrl, {
        method: 'POST',
        body,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mcAuthResults.access_token}`
        },
    })
        .then(res => res.json())
        .catch((err) => {
            console.log(err);
        });
}

/**
 * Metod is use for get all content from marketing cloud for a folder
 * @param {*} folderId 
 */
async function getPresentMCAssets(folderId) {
    const mcAuthResults = await getMcAuth();
    const serviceUrl = `${validateUrl(MC_REST_BASE_URI)}${MC_CONTENT_QUERY_API_PATH}`;

    const body = JSON.stringify({
        "page":
        {
            "pageSize": 7500 //fixed
        },

        "query":
        {
            "leftOperand":
            {
                "property": "category.id",
                "simpleOperator": "equal",
                "value": folderId // folderid
            },
            "logicalOperator": "AND",
            "rightOperand":
            {
                "property": "assetType.displayName",
                "simpleOperator": "like",
                "value": "Document,Image,Text Block,HTML Block"
            }
        },
        "fields":
            [
                "id",
                "assetType",
                "name"
            ]
    });
    return await fetch(serviceUrl, {
        method: 'POST',
        body,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mcAuthResults.access_token}`
        },
    })
        .then(res => res.json())
        .catch((err) => {
            console.log(err);
        });
}

/**
 * Method check is given file already sync or not in marketing cloud
 * @param {*} folderId 
 * @param {*} fileName 
 * @param {*} alreadySyncedContents 
 */
async function verfiyFileNameMCFolder(folderId, fileName, alreadySyncedContents) {
    if (alreadySyncedContents && alreadySyncedContents.items && alreadySyncedContents.items.length) {
        const item = [...alreadySyncedContents.items].find(ele => ele.name === fileName);
        return item ? false : true;
    } else {
        const result = await checkFileInMc(folderId, fileName);
        return result && result.items && result.items.length ? false : true;
    }
}

/**
 * Method use for get the marketing cloud authonication token. 
 */
async function getMcAuth() {
    return await fetch(`${validateUrl(MC_AUTHENTICATION_BASE_URI)}${MS_AUTH_PATH}`, {
        method: 'POST',
        body: JSON.stringify(getMcAuthBody),
        headers: {
            'Content-Type': 'application/json'
        },
    })
        .then(res => res.json())
        .catch((err) => {
            console.log(err)
        });
}

// Move content to marketing cloud


// Method is use for move rich text, html content and normal text.
async function moveTextToMC(name, value, assetTypeId, folderId, mcAuthResults, jobId, referenceId, org) {
    name = `${ASSETNAME_PREFIX}${name}`;
    try {
        let textAssetBody = {
            name: name,
            assetType: {
                id: assetTypeId,
            },
            content: value,
            category: {
                id: folderId
            },
        };
        // Create Marketing Cloud Block Asset
        await createMCAsset(mcAuthResults.access_token, textAssetBody, jobId, referenceId, name, false, null, org);
    } catch (error) {
        console.log('Upload error -->', error);

        // update file status in job queue

        totalUploadItems = totalUploadItems - 1;
        failedItemsCount = failedItemsCount + 1;

        const response = `There is an error ${error}`;
        const uploadStatus = 'Failed';
        // update job status    
        if (jobId && response) {
            updateJobProgress(jobId, response, name, uploadStatus, referenceId);
        }

        updateStatusToServer(org);
    }
}

// Method is use for move base 64 images to marketing cloud
async function moveImageToMC(imageNode, folderId, mcAuthResults, cmsAuthResults, jobId, org) {
    return new Promise(async (resolve, reject) => {
        const imageUrl = imageNode.unauthenticatedUrl ? imageNode.unauthenticatedUrl : imageNode.url;
        const fileName = imageNode.fileName || null;
        const imageExt = imageNode.ext || null;
        const referenceId = imageNode.referenceId || null;
        const name = imageNode.name;

        try {

            if (imageUrl) {
                const base64ImageBody = await downloadBase64FromURL(
                    imageUrl,
                    cmsAuthResults.access_token
                );

                
                let imageAssetBody = {
                    name: fileName + imageExt,
                    assetType: {
                        id: getImageAssetTypeId(imageExt.replace('.', '')),
                    },
                    fileProperties: {
                        fileName: fileName + imageExt,
                        extension: imageExt,
                    },
                    file: base64ImageBody,
                    category: {
                        id: folderId
                    },
                };

                //Marketing Cloud Regex for file fullName i.e. Developer name
                let mcRegex = /^[a-z](?!\w*__)(?:\w*[^\W_])?$/i;
                // Create Marketing Cloud Image Asset
                if (mcRegex.test(fileName)) {
                    await createMCAsset(mcAuthResults.access_token, imageAssetBody, jobId, referenceId, name, true, fileName, org);
                } else {
                    console.log('Error--->', response);

                    // update file status in job queue
                    totalUploadItems = totalUploadItems - 1;
                    failedItemsCount = failedItemsCount + 1;
                
                    const response = `FileProperties.fileName contains prohibited characters: ${fileName}`;
                    const uploadStatus = 'Failed';
                    // update job status    
                    if (jobId && response) {
                        updateJobProgress(jobId, response, name, uploadStatus, referenceId);
                    }   
                }
            }else{
                console.log('Image url not available-->', fileName + imageExt)
            }
            resolve();
        } catch (error) {

            console.log('Upload error -->', error);

            // update file status in job queue
            totalUploadItems = totalUploadItems - 1;
            failedItemsCount = failedItemsCount + 1;
            const response = `There is an error ${error}`;
            const uploadStatus = 'Failed';
            // update job status    
            if (jobId && response) {
                updateJobProgress(jobId, response, name, uploadStatus, referenceId);
            }

            updateStatusToServer(org);
        }
    });
}

// Method is use for move base 64 document to marketing cloud

async function moveDocumentToMC(documentNode, folderId, mcAuthResults, cmsAuthResults, jobId, org) {
    return new Promise(async (resolve, reject) => {
        const docUrl = documentNode.unauthenticatedUrl ? documentNode.unauthenticatedUrl : documentNode.url;
        const fileName = documentNode.fileName || null;
        const docExt = documentNode.ext || null;
        const referenceId = documentNode.referenceId || null;
        const name = documentNode.name;

        try {
            if (docUrl) {
                const base64DocBody = await downloadBase64FromURL(
                    docUrl,
                    cmsAuthResults.access_token
                );

                let docAssetBody = {
                    name: fileName + docExt,
                    assetType: {
                        id: getDocumentAssetTypeId(docExt.replace('.', '')),
                    },
                    fileProperties: {
                        fileName: fileName + docExt,
                        extension: docExt,
                    },
                    file: base64DocBody,
                    category: {
                        id: folderId
                    },
                };

                //Marketing Cloud Regex for file fullName i.e. Developer name
                let mcRegex = /^[a-z](?!\w*__)(?:\w*[^\W_])?$/i;
                // Create Marketing Cloud Image Asset
                if (mcRegex.test(fileName)) {
                    await createMCAsset(mcAuthResults.access_token, docAssetBody, jobId, referenceId, name, true, fileName, org);
                } else {
                    const response = `FileProperties.fileName contains prohibited characters: ${fileName}`;
                    const uploadStatus = 'Failed';
                    // update job status    
                    if (jobId && response) {
                        updateJobProgress(jobId, response, name, uploadStatus, referenceId);
                    }
                }
            }
            resolve();
        } catch (error) {
            console.log('Upload error -->', error);

            // update file status in job queue
            totalUploadItems = totalUploadItems - 1;
            failedItemsCount = failedItemsCount + 1;

            const response = `There is an error ${error}`;
            const uploadStatus = 'Failed';

            // update job status    
            if (jobId && response) {
                updateJobProgress(jobId, response, name, uploadStatus, referenceId);
            }
            updateStatusToServer(org);
        }
    });
}


// Method is use for send conent to marketing cloud
async function createMCAsset(access_token, assetBody, jobId, referenceId, name, isMedia, fileName, org) {
    console.log('name', name);
    return new Promise((resolve, reject) => {
        request.post(validateUrl(MC_REST_BASE_URI) + MC_ASSETS_API_PATH, {
            headers: {
                Authorization: 'Bearer ' + access_token
            },
            json: assetBody,
        },
            async (error, res, body) => {
                totalUploadItems = totalUploadItems - 1;
                
                
                if (error) {
                    // update job status    
                    failedItemsCount = failedItemsCount + 1;
                    const response = `Error for:${assetBody.name} ${error}`;
                    const uploadStatus = 'Failed';
                    if (jobId && response) {
                        updateJobProgress(jobId, response, name, uploadStatus, referenceId);
                    }
                    updateStatusToServer(org);
                    reject(error);
                } else {
                    try {
                        const msg = body.validationErrors && body.validationErrors.length ? body.validationErrors[0].message : '';
                        const errorCode = body.validationErrors && body.validationErrors.length ? body.validationErrors[0].errorcode : '';
                        const response = body.id ? `Uploaded with Asset Id: ${body.id}` : `Failed with Error code: ${errorCode} - Error message: ${msg}`;
                        const uploadStatus = body.id ? 'Uploaded' : 'Failed';

                        console.log(body.id ? `${assetBody.name} uploaded with status code: ${res.statusCode} - Asset Id: ${body.id}` : `${assetBody.name} failed with status code: ${res.statusCode} - Error code: ${errorCode} - Error message: ${msg}`);
                        if (errorCode) {
                            failedItemsCount = failedItemsCount + 1;
                        }
                        // update job status    
                        if (jobId && response) {
                            updateJobProgress(jobId, response, name, uploadStatus, referenceId);
                        }
                        updateStatusToServer(org);
                    } catch (err) {
                        console.log(`Error for: `, err);
                    }
                    resolve(res);
                }
            }
        );
    });
}

// Method is use to call the next batch service
async function updateStatusToServer(org) {
    // Csll the next betch service
    if (totalUploadItems === 0) {
        setTimeout(async () => {
            callNextBatchService(org.oauth.access_token);
        }, 50000);
    }
}

async function getMediaSourceFile(node, alreadySyncedContents, folderId) {
    const referenceId = node.referenceId || null;
    const name = node.name;

    const url = node.unauthenticatedUrl ? `${node.unauthenticatedUrl}` : null;

    if (url) {
        const ext = node.fileName ? path.parse(node.fileName).ext : null;
        const publishedDate = node.publishedDate ? node.publishedDate.replace(/[^a-zA-Z0-9]/g, "") : '';

        let fileName = node.name ? node.name.replace(/[^a-zA-Z0-9]/g, "") : `${path.parse(node.fileName).name.replace(/[^a-zA-Z0-9]/g, "")}${publishedDate}`;

        fileName = `${ASSETNAME_PREFIX}${fileName}`;

        const notInMC = await verfiyFileNameMCFolder(folderId, fileName + ext, alreadySyncedContents);
        if (notInMC) {
            return {
                assetTypeId: node.assetTypeId,
                title: node.title,
                type: node.type,
                status: node.status,
                url,
                fileName,
                ext,
                referenceId,
                name
            }
        } else {
            return fileName + ext;
        }
    }
}

function updateAlreadySyncMediaStatus(skippedItems) {
    try {
        skippedItems.forEach(ele => {
            jobWorkQueueList = jobWorkQueueList.map(job => {

                const serverResponse = `Failed with Error code: 118039 - Error message: Asset names within a category and asset type must be unique.`;
                const serverStatus = 'Already Uploaded';
                items = [...job.items].map(jobEle => {

                    // response
                    let response = jobEle.response;
                    let status = jobEle.status;
                    if (jobEle.name && ele.name && jobEle.name == ele.name) {
                        response = serverResponse;
                        status = serverStatus;
                    } else if (jobEle.fileName && ele.fileName && jobEle.fileName == ele.fileName) {
                        response = serverResponse;
                        status = serverStatus;
                    } else if (jobEle.referenceId && ele.referenceId && jobEle.referenceId == ele.referenceId) {
                        response = serverResponse;
                        status = serverStatus;
                    }
                    return { ...jobEle, response, status, name: jobEle.fileName ? jobEle.fileName : jobEle.name }
                })

                return { ...job, items }
            })
        });
    } catch (error) {
        console.log(error);
    }
}






/**
 * Method is use for get proper name according to version and content type
 * @param {*} result 
 */
function getAssestsWithProperNaming(result) {
    let finalArray = [];
    try{
        const { managedContentNodeTypes, items } = result;
        // Get name prefix
    
        const defaultNameNode = managedContentNodeTypes.find(mcNode => mcNode.assetTypeId == 0);
        const nameKey = defaultNameNode ? defaultNameNode.nodeName : null;
    
        items.forEach(item => {
            const title = item.title;
            const type = item.type;
            const contentNodes = item.contentNodes; // nodes 
            const namePrefix = nameKey && contentNodes[nameKey] ? contentNodes[nameKey].value : '';
            const publishedDate = item.publishedDate ? item.publishedDate : '';
    
            //Filter node.nodeName except node with assetTypeId = 0
            let nodes = [...managedContentNodeTypes].filter(node => node.assetTypeId !== '0').map(node => node.nodeName);
    
            //Filter nodes from the REST response as per the Salesforce CMS Content Type Node mapping
            Object.entries(contentNodes).forEach(([key, value]) => {
                if (nodes.includes(key)) {
                    const mcNodes = managedContentNodeTypes.find(mcNode => mcNode.nodeName === key);
                    const nameSuffix = mcNodes ? mcNodes.nodeLabel : '';
                    const assetTypeId = mcNodes ? mcNodes.assetTypeId : '';
                    let objItem;
    
                    if (value.nodeType === 'MediaSource') { // MediaSource - cms_image and cms_document
                        value.assetTypeId = assetTypeId;
                        objItem = { ...value, publishedDate, title, type, status: 'Queued', response: '' };
                    } else if (value.nodeType === 'Media') { // Image Node
                        objItem = { ...value, assetTypeId: assetTypeId, name: `${namePrefix}-${nameSuffix}-${publishedDate}`, title, type, status: 'Queued', response: '' };
                    } else {
                        objItem = { assetTypeId: assetTypeId, nodeType: value.nodeType, name: `${namePrefix}-${nameSuffix}-${publishedDate}`, value: value.value, title, type, status: 'Queued', response: '' };
                    }
                    finalArray = [...finalArray, objItem];
                }
            });
    
        });
    }catch(error){
        console.log(`Error in name`,  error);
    }
    
    return finalArray;
}


// Method is use to update progress in job queue for logs screen

function updateJobProgress(jobId, serverResponse, name, serverStatus, referenceId) { 
    jobWorkQueueList = [...jobWorkQueueList].map(ele => {
        let percents = ele.progress;
        let counter = ele.counter || 0;
        const totalItems = ele.items.length;
        let items = ele.items;
        if (ele.jobId === jobId) {
            counter = counter + 1;
            percents = ((counter / totalItems) * 100).toFixed(1);

            items = [...ele.items].map(item => {
                // response
                let response = item.response;
                let status = item.status;
                if (name && (`${ASSETNAME_PREFIX}${item.name}` === name || item.name === name) && !item.response) {   
                    response = serverResponse;
                    status = serverStatus;
                }else if (referenceId && item.referenceId === referenceId && !item.response) {
                    response = serverResponse;
                    status = serverStatus;
                }

                return { ...item, response, status }
            })
        }
        const state = percents == 100.0 ? 'Completed' : 'In-Progress';
        return { ...ele, progress: percents, counter, state, items, counter };
    });
}

async function startUploadProcess(workQueue) {
    workQueue.on('failed', (jobId, err) => {
        console.log(`Job ${jobId} failed with error ${err.message}`);
    });

    const mcAuthResults = await getMcAuth();
    workQueue.process(maxJobsPerWorker, async (job, done) => {
        try {
            let { content } = job.data;
            const { items, folderId, org } = content;
            if (items) {
                //Upload CMS content to Marketing Cloud
                items.map(async (ele) => {
                    if (ele.assetTypeId === '196' || ele.assetTypeId === '197') { // 196 - 'Text' &'MultilineText' and 197 - 'RichText'
                        await moveTextToMC(
                            ele.name,
                            decode(ele.value),
                            ele.assetTypeId,
                            folderId,
                            mcAuthResults,
                            job.id,
                            ele.referenceId,
                            org
                        );
                    } else if (ele.assetTypeId == '8') { //image
                        await moveImageToMC(
                            ele,
                            folderId,
                            mcAuthResults,
                            content.cmsAuthResults,
                            job.id,
                            org
                        );
                    } else if (ele.assetTypeId === '11') { //document
                        await moveDocumentToMC(
                            ele,
                            folderId,
                            mcAuthResults,
                            content.cmsAuthResults,
                            job.id,
                            org
                        );
                    }else{
                        console.log(ele.assetTypeId);
                    }
                })
                workQueue.close()
                done();
            }
        } catch (error) {
            console.log('error', error);
        }
    });
}

/**
 * Method is use for create job queue based content type and also check 
 * content is already sync or not in mc.
 */

async function createJobQueue(serviceResults, workQueue, cmsAuthResults, org, contentTypeNodes, channelId, folderId, channelName, skippedItems, managedContentNodeTypes, managedContentTypeLabel, Id) {
    try {
        const alreadySyncedContents = await getPresentMCAssets(folderId);

        if (serviceResults && serviceResults.length) {
            const result = { items: serviceResults, managedContentNodeTypes };
            let items = getAssestsWithProperNaming(result);
            totalUploadItems = items.length;
            let jobItems = [];

            await Promise.all([...items].map(async (ele) => {
                // Content
                if (ele.assetTypeId === '196' || ele.assetTypeId === '197') {
                    const notInMC = await verfiyFileNameMCFolder(folderId, `${ASSETNAME_PREFIX}${ele.name}`, alreadySyncedContents);
                    if (notInMC) {
                        jobItems = [...jobItems, ele];
                    } else {
                        const referenceId = ele.referenceId || null;
                        skippedItems = [...skippedItems, { referenceId, name: ele.name }];
                    }
                }
                // Image and Document
                else if (ele => ele.assetTypeId === '8' || ele.assetTypeId === '11') {
                    const node = await getMediaSourceFile(ele, alreadySyncedContents, folderId);
                    if (typeof node == "string") {
                        const referenceId = ele.referenceId || null;
                        let name = ele.name;
                        skippedItems = ele.assetTypeId === '8' ? [...skippedItems, { referenceId, name, fileName: ele.fileName }] : [...skippedItems, { referenceId, name }];
                    } else if (node) {
                        jobItems = [...jobItems, node];
                    }
                }
            }))

            if (jobItems && jobItems.length) {
                // content type
                const job = await workQueue.add({ content: { items: jobItems, cmsAuthResults, folderId, totalItems: items.length, org } }, {
                    attempts: 1,
                    lifo: true
                });
                jobWorkQueueList = [...jobWorkQueueList, { queueName: managedContentTypeLabel, id: Id, channelId, jobId: job.id, state: "Queued", items, response: '', counter: 0, channelName }];
                return skippedItems;
            } else {
                jobWorkQueueList = [...jobWorkQueueList, { queueName: managedContentTypeLabel, id: Id, channelId, jobId: 0, state: "Skipped", items, response: '', counter: 0, channelName }];

                return skippedItems;
            }
        }
    } catch (error) {
        console.log(error);
    }
}

//Method is use to get all data form salesforce cms and create job for upload into marketing cloud. 
async function addProcessInQueue(workQueue, cmsAuthResults, org, contentTypeNodes, channelId, channelName, folderId) {
    console.log('Total CMS Content Type --->', contentTypeNodes ? contentTypeNodes.length : 0);
    console.log('Content Type Index --->', ctIndex);
    console.log('nextPageUrl --->', nextPageUrl);

    if (contentTypeNodes[ctIndex] && ctIndex < contentTypeNodes.length) {
        let skippedItems = [];

        const managedContentTypeAPI = contentTypeNodes[ctIndex].DeveloperName;
        const managedContentNodeTypes = contentTypeNodes[ctIndex].managedContentNodeTypes;
        const managedContentTypeLabel = contentTypeNodes[ctIndex].MasterLabel;
        const Id = contentTypeNodes[ctIndex].Id;

        const ctPageSize = process.env.SF_CT_PAGESIZE ? process.env.SF_CT_PAGESIZE : 15;
        const cmsURL = nextPageUrl ? nextPageUrl : `/services/data/v${SF_API_VERSION}/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentTypeAPI}&showAbsoluteUrl=true&pageSize=${ctPageSize}`;
        
        let result = await org.getUrl(cmsURL); // Get the data from salesforce cms

        if (result) {
            let serviceResults = result.items || [];
            nextPageUrl = result.nextPageUrl ? `${result.nextPageUrl}&showAbsoluteUrl=true` : undefined;
            if (!nextPageUrl) {
                ctIndex = ctIndex + 1;
            } else if (contentTypeNodes.length === ctIndex && !nextPageUrl) {
                ctIndex = 0;
            }

            skippedItems = await createJobQueue(serviceResults, workQueue, cmsAuthResults, org, contentTypeNodes, channelId, folderId, channelName, skippedItems, managedContentNodeTypes, managedContentTypeLabel, Id)

            const skippedItemsSize = skippedItems ? skippedItems.length : 0;
            if (skippedItemsSize === totalUploadItems) {
                totalUploadItems = totalUploadItems - skippedItemsSize;
                updateStatusToServer(org);
            } else {
                totalUploadItems = totalUploadItems - skippedItemsSize;
                // Call the upload start
                startUploadProcess(workQueue);
            }
            console.log('Total Skipped Items --->', skippedItemsSize);
            console.log('Total Items --->', totalUploadItems);    
        }

        console.log('CMS NextPage Url --->', nextPageUrl);
        console.log('Content Type Index --->', ctIndex);

        skippedItemsCount = skippedItemsCount + skippedItems ? skippedItems.length : 0;
        if (skippedItems) {
            updateAlreadySyncMediaStatus(skippedItems);
        }

    } else {
        console.log('All Content Type synced');
        console.log('Failed Items --->', failedItemsCount);
        console.log('Skipped Items --->', skippedItemsCount);
        
        nextPageUrl = '';
        ctIndex = 0;
        totalUploadItems = 0;
        skippedItemsCount = 0;
        failedItemsCount = 0;
        setTimeout(async () => {
            updateSfRecord(null, null, null, true);
        }, 10000);
        global.gc();
    }
}

module.exports = {
    run: function (cmsAuthResults, org, contentTypeNodes, channelId, channelName, mcFolderId, source) {
        if (source !== 'Heroku') {
            jobWorkQueueList = [];
        }
        const workQueue = new Queue(`work-${channelId}`, REDIS_URL);
        addProcessInQueue(workQueue, cmsAuthResults, org, contentTypeNodes, channelId, channelName, mcFolderId)
    },

    getMcAuth: async function () {
        return await fetch(validateUrl(MC_AUTHENTICATION_BASE_URI) + MS_AUTH_PATH, {
            method: 'POST',
            body: JSON.stringify(getMcAuthBody),
            headers: {
                'Content-Type': 'application/json'
            },
        })
            .then(res => res.json())
            .catch((err) => {
                console.log(err);
            });
    },

    getMcFolders: async function (accessToken) {
        const serviceUrl = `${validateUrl(MC_REST_BASE_URI)}${MC_CONTENT_CATEGORIES_API_PATH}?$pagesize=500`;
        return await fetch(serviceUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
        }).then(res => res.json()).catch((err) => {
            console.log(err);
        });
    },

    createMcFolder: async function (ParentId, accessToken) {
        const serviceUrl = `${validateUrl(MC_REST_BASE_URI)}${MC_CONTENT_CATEGORIES_API_PATH}`;
        const body = JSON.stringify({
            Name: MC_FOLDER_NAME,
            ParentId
        });
        return await fetch(serviceUrl, {
            method: 'POST',
            body,
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
        })
            .then(res => res.json())
            .catch((err) => {
                console.log(err);
            });
    },

    jobs: function () {
        return jobWorkQueueList;
    }
};

