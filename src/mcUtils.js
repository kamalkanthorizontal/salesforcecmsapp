const fetch = require('node-fetch');
var request = require('request');
let Queue = require('bull');
const path = require('path');

const { getImageAssetTypeId, getDocumentAssetTypeId, downloadBase64FromURL } = require('./utils.js');
const { MC_ASSETS_API_PATH, MS_AUTH_PATH, MC_CONTENT_CATEGORIES_API_PATH, REDIS_URL } = require('./constants');


let maxJobsPerWorker = 150;
let jobWorkQueueList = [];
let base64Count = 0;


const getMcAuthBody = {
    grant_type: 'client_credentials',
    client_id: process.env.MC_CLIENT_ID,
    client_secret: process.env.MC_CLIENT_SECRET,
};
const PAGE_SIZE = process.env.PAGE_SIZE || 5;


async function getValidFileName(fileName) {
    try {
        const mcAuthResults = await getMcAuth();
        const serviceUrl = `https://mcyl0bsfb6nnjg5v3n6gbh9v6gc0.rest.marketingcloudapis.com/asset/v1/content/assets?$filter=Name%20like%20'TestContentBlock1Image20201201T131502000Z.png'`;
        console.log('serviceUrl', mcAuthResults.access_token);
        const res = await fetch(serviceUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${mcAuthResults.access_token}`
            },
        });

        //console.log('getValidFileName--->', res.items);
        return true;
    } catch (error) {
        console.log('Error in file Name:', error);
        return false;
    }
}

async function getMcAuth() {
    return await fetch(`${process.env.MC_AUTHENTICATION_BASE_URI}${MS_AUTH_PATH}`, {
        method: 'POST',
        body: JSON.stringify(getMcAuthBody),
        headers: {
            'Content-Type': 'application/json'
        },
    })
        .then(res => res.json())
        .catch((err) => {
            console.log(err);
            reject(err);
        });
}

async function moveTextToMC(name, value, assetTypeId, folderId, mcAuthResults,  jobId, referenceId) {
    console.log(`Uploading txt to MC: ${name} with body length ${value.length}`);

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
    await createMCAsset(mcAuthResults.access_token, textAssetBody, jobId, referenceId,name);
}


async function moveImageToMC(imageNode, folderId, mcAuthResults, cmsAuthResults, jobId) {
    return new Promise(async (resolve, reject) => {
        const imageUrl = `${imageNode.unauthenticatedUrl}`;
        const referenceId =  imageNode.referenceId;
        const name =  imageNode.name;
        
        
        const imageExt = path.parse(imageNode.fileName).ext;
        const publishedDate = imageNode.publishedDate ? imageNode.publishedDate.replace(/[^a-zA-Z0-9]/g, "") : '';

        let fileName = imageNode.name ? imageNode.name.replace(/[^a-zA-Z0-9]/g, "") : `${path.parse(imageNode.fileName).name.replace(/[^a-zA-Z0-9]/g, "")}${publishedDate}`;
        
        const notInMC = true;//await getValidFileName(fileName + imageExt);

        if(notInMC){
            const base64ImageBody = await downloadBase64FromURL(
                imageUrl,
                cmsAuthResults.access_token
            );
            
            base64Count = base64Count+1;
            
          //  fileName = `${process.env.IMG_PREFIX}_${fileName}`; // Need to remove once testing done
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
            var mcRegex = /^[a-z](?!\w*__)(?:\w*[^\W_])?$/i;
            // Create Marketing Cloud Image Asset
            if (mcRegex.test(fileName)) {
                console.log(`Uploading img to MC: ${fileName + imageExt} with base64ImageBody length ${base64ImageBody.length}`);
                await createMCAsset(mcAuthResults.access_token, imageAssetBody, jobId, referenceId, name);
            } else {
                console.log('Upload on hold!! Please check the prohibited chars in', fileName);
            }
        }else{
            console.log('failed with Error code: 118039 - Error message: Asset names within a category and asset type must be unique. is already taken. Suggested name: ', fileName);
        }
        
        resolve();
    });
}

async function moveDocumentToMC(documentNode, folderId, mcAuthResults, cmsAuthResults,  jobId) {
    return new Promise(async (resolve, reject) => {
        const doCUrl = `${documentNode.unauthenticatedUrl}`;
        const referenceId =  documentNode.referenceId;
        const name =  documentNode.name;
        const base64DocBody = await downloadBase64FromURL(
            doCUrl,
            cmsAuthResults.access_token
        );

        const docExt = path.parse(documentNode.fileName).ext;
        const publishedDate = documentNode.publishedDate ? documentNode.publishedDate.replace(/[^a-zA-Z0-9]/g, "") : '';

        let fileName = documentNode.name ? documentNode.name.replace(/[^a-zA-Z0-9]/g, "") : `${path.parse(documentNode.fileName).name.replace(/[^a-zA-Z0-9]/g, "")}${publishedDate}`;
      //  fileName = `${process.env.IMG_PREFIX}_${fileName}`; // Need to remove once testing done

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
        var mcRegex = /^[a-z](?!\w*__)(?:\w*[^\W_])?$/i;
        // Create Marketing Cloud Image Asset
        if (mcRegex.test(fileName)) {
            console.log(`Uploading doc to MC: ${fileName + docExt} with base64DocBody length ${base64DocBody.length}`);
            await createMCAsset(mcAuthResults.access_token, docAssetBody, jobId, referenceId, name);
        } else {
            console.log('FileProperties.fileName contains prohibited characters.', fileName);
        }
        resolve();
    });
}



async function createMCAsset(access_token, assetBody, jobId, referenceId, name) {
    return new Promise((resolve, reject) => {
        request.post(process.env.MC_REST_BASE_URI + MC_ASSETS_API_PATH, {
            headers: {
                Authorization: 'Bearer ' + access_token
            },
            json: assetBody,
        },
            (error, res, body) => {
                if (error) {
                    console.log(`Error for:${assetBody.name}`, error);
                    reject(error);
                } else {
                    
                    const msg = body.validationErrors && body.validationErrors.length ? body.validationErrors[0].message : '';
                    const errorCode = body.validationErrors && body.validationErrors.length ? body.validationErrors[0].errorcode : '';

                    const response = body.id ? `Uploaded with Asset id: ${body.id}`: `failed with Error code: ${errorCode} - Error message: ${msg} `; 
                    const uploadStatus = body.id ? 'Uploaded' : 'Failed';

                    console.log(body.id ? `${assetBody.name} uploaded with status code: ${res.statusCode} - Asset id: ${body.id}` : `${assetBody.name} failed with status code: ${res.statusCode} - Error message: ${msg} - Error code: ${errorCode}`);
                    /*
                        // Memory status
                        const formatMemmoryUsage = (data) => `${Math.round(data / 1024 / 1024 * 100) / 100} MB`

                        const memoryData = process.memoryUsage()
                        
                        const memmoryUsage= { 'rss': `${formatMemmoryUsage(memoryData.rss)} -> Resident Set Size - total memory allocated for the process execution`,
                                    heapTotal: `${formatMemmoryUsage(memoryData.heapTotal)} -> total size of the allocated heap`,
                                    heapUsed: `${formatMemmoryUsage(memoryData.heapUsed)} -> actual memory used during the execution`,
                                    external: `${formatMemmoryUsage(memoryData.external)} -> V8 external memory`,
                                }
                    */


                    // update job status
                    if(jobId && response){
                        updateJobProgress(jobId, response, name, uploadStatus, referenceId);
                    }
                    
                    
                    resolve(res);
                }
            }
        );
    });
}


async function getAllContent(org, cmsURL, items=[]){
    let result = await org.getUrl(cmsURL);
    if(result){
        items = result.items || [];
        if(result.nextPageUrl){
           const recursiveItems = await getAllContent(org, result.nextPageUrl, result.items);
           items = [...items, ...recursiveItems];
    
        }
        return items;    
    }
    return [];
}

async function addProcessInQueue(workQueue, cmsAuthResults, org, contentTypeNodes, channelId, folderId) {
    console.log('contentTypeNodes--->', contentTypeNodes.length);
    await Promise.all(contentTypeNodes.map(async (ele) => {
        try {
            const managedContentType = ele.DeveloperName;
            const managedContentNodeTypes = ele.managedContentNodeTypes;
            const cmsURL = `/services/data/v${process.env.SF_API_VERSION}/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&showAbsoluteUrl=true&pageSize=100`;
           
            const serviceResults = await getAllContent(org, cmsURL);
            
            if (serviceResults && serviceResults.length) {
                 const result = {items: serviceResults, managedContentNodeTypes};
                 const items = getAssestsWithProperNaming(result);
                 //console.log('serviceResults--->', items);
                const job = await workQueue.add({ content: { items, cmsAuthResults, folderId, totalItems: items.length } }, {
                    attempts: 1
                });

                jobWorkQueueList = [...jobWorkQueueList, { queueName: ele.MasterLabel, id: ele.Id, channelId, jobId: job.id, state: "Queued", items, response: '', counter: 0 }];

                //console.log('Hitting Connect REST URL:', cmsURL);
                console.log('Job Id:', job.id);

            }
        } catch (error) {
            console.log(error);
        }
    }));

    startUploadProcess(workQueue);
}

function getAssestsWithProperNaming(result){
    const { managedContentNodeTypes, items } = result;

    // Get name prefix

    const defaultNameNode = managedContentNodeTypes.find(mcNode => mcNode.assetTypeId == 0);
    const nameKey = defaultNameNode ? defaultNameNode.nodeName : null;


    let finalArray = [];

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
                    objItem = { ...value, assetTypeId: assetTypeId, name: `${namePrefix}-${nameSuffix}-${publishedDate}` , title, type, status: 'Queued', response: ''};
                } else {
                    objItem = { assetTypeId: assetTypeId, nodeType: value.nodeType, name: `${namePrefix}-${nameSuffix}-${publishedDate}`, value: value.value , title, type, status: 'Queued', response: ''};
                }
                finalArray = [...finalArray, objItem];
            }
        });

    });
    return finalArray;
}

function updateJobProgress(jobId, serverResponse, name, serverStatus, referenceId){
    jobWorkQueueList = [...jobWorkQueueList].map(ele => {
        let percents = ele.progress;
        let counter = ele.counter || 0;
        const totalItems = ele.items.length;
        let items = ele.items;

        if(ele.jobId === jobId){
            counter = counter+1;  
            percents = ((counter / totalItems) * 100).toFixed(1);

            items = [...ele.items].map(item =>{
                // response
                let response = item.response;
                let status = item.status;
                if(name && item.name === name ){
                    response = serverResponse;
                    status = serverStatus;
                }else if(referenceId && item.referenceId === referenceId ){
                    response = serverResponse;
                    status = serverStatus;
                }

                return {...item, response, status }
            })
        }
        const state = percents == 100.0 ? 'completed' : 'In-Progress';
        return { ...ele, progress: percents, counter, state, items ,counter };
    });

    // console.log('jobWorkQueueList--->', jobWorkQueueList);
}


async function startUploadProcess(workQueue) {
  
    workQueue.on('failed', (jobId, err) => {
        console.log(`Job ${jobId} failed with error ${err.message}`);
    });


    let mcAuthResults = await getMcAuth();
    console.log("Marketing Cloud authentication :", mcAuthResults.access_token ? 'Successful' : 'Failure');

    workQueue.process(maxJobsPerWorker, async (job, done) => {
        //console.log('base64Count--->', base64Count);
        try {
            let { content } = job.data;
            const { items, folderId } = content;
            if (items) {
                console.log(`Filtered no. of nodes for Job ID ${job.id} : ${items.length}`);

                //Upload CMS content to Marketing Cloud
                //await Promise.all(

                items.map(async (ele) => { 
                    if (ele.assetTypeId === '196' || ele.assetTypeId === '197') { // 196 - 'Text' &'MultilineText' and 197 - 'RichText'
                        await moveTextToMC(
                            ele.name,
                            ele.value,
                            ele.assetTypeId,
                            folderId,
                            mcAuthResults,
                            job.id,
                            ele.referenceId
                        );  
                    } else if (ele.assetTypeId === '8') { //image

                        if(base64Count <  50){
                            await moveImageToMC(
                                ele,
                                folderId,
                                mcAuthResults,
                                content.cmsAuthResults,
                                job.id
                            );
                        }else{
                            console.log('50 Iages synced');
                        }
                       

                    } else if (ele.assetTypeId === '11') { //document
                        if(base64Count <  50){
                            await moveDocumentToMC(
                                ele,
                                folderId,
                                mcAuthResults,
                                content.cmsAuthResults,
                                job.id
                            );
                        }else{
                            console.log('50 Iages synced');
                        }
                        
                    }
                })
                // )
                //await Promise.all());
                // call done when finished
                // workQueue.getJobCounts().then(res => console.log('Job Count:\n',res));

                workQueue.close()
                done();
            }
        } catch (error) {
            console.log('error', error);
        }
    });

}

module.exports = {
    run: function (cmsAuthResults, org, contentTypeNodes, channelId, folderId) {
        base64Count = 0;

        let workQueue = new Queue(`work-${channelId}`, REDIS_URL);
        addProcessInQueue(workQueue, cmsAuthResults, org, contentTypeNodes, channelId, folderId)
    },

    getMcFolders: async function (accessToken) {
        const serviceUrl = `${process.env.MC_REST_BASE_URI}${MC_CONTENT_CATEGORIES_API_PATH}`;
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
        const serviceUrl = `${process.env.MC_REST_BASE_URI}${MC_CONTENT_CATEGORIES_API_PATH}`;
        const body = JSON.stringify({
            Name: process.env.MC_FOLDER_NAME,
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

    getMcAuth: async function () {
        return await fetch(process.env.MC_AUTHENTICATION_BASE_URI + MS_AUTH_PATH, {
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
    jobs: function () {
        return jobWorkQueueList;
    }
};

