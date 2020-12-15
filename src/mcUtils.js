const fetch = require('node-fetch');
var request = require('request');
let Queue = require('bull');
const path = require('path');
const decode = require('unescape');
const { getImageAssetTypeId, getDocumentAssetTypeId, downloadBase64FromURL, validateUrl, updateSfRecord } = require('./utils.js');
const { MC_ASSETS_API_PATH, MS_AUTH_PATH, MC_CONTENT_CATEGORIES_API_PATH, REDIS_URL } = require('./constants');


let maxJobsPerWorker = 150;
let jobWorkQueueList = [];


const allowedBase64Count = 50;
let base64Count = 0;
let totalBase64Items = 0;
let totalUploadItems = 0;
let base64SkipedItems = 0;
let nextUploadBase64Items = 0;

const getMcAuthBody = {
    grant_type: 'client_credentials',
    client_id: process.env.MC_CLIENT_ID,
    client_secret: process.env.MC_CLIENT_SECRET,
};


const MC_AUTHENTICATION_BASE_URI = process.env.MC_AUTHENTICATION_BASE_URI;
const MC_REST_BASE_URI = process.env.MC_REST_BASE_URI;
const SF_CMS_CONNECTION_ID = process.env.SF_CMS_CONNECTION_ID;
const SF_CMS_URL = process.env.SF_CMS_URL;
const SF_API_VERSION  = process.env.SF_API_VERSION;
const MC_FOLDER_NAME = process.env.MC_FOLDER_NAME;
const IMG_PREFIX  = process.env.IMG_PREFIX || '';

async function uploadAllBase64(accessToken) {
    try {
        const body = {   cmsConnectionId: SF_CMS_CONNECTION_ID }

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

        console.log('resQuery', response);

    } catch (error) {
        console.log('Error in next call:', error);
    }
}

async function getValidFileName(fileName) {
    try {
        const mcAuthResults = await getMcAuth();
        const serviceUrl = `${validateUrl(MC_REST_BASE_URI)}${MC_ASSETS_API_PATH}?$filter=Name%20like%20'${fileName}'`;
    
        const res = await fetch(serviceUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${mcAuthResults.access_token}`
            },
        });

        const response = await res.json();
        const notInMc = response.count === 0 ? true : false;

        return notInMc;
    } catch (error) {
        console.log('Error in file Name:', error);
        return false;
    }
}

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
            reject(err);
        });
}

async function moveTextToMC(name, value, assetTypeId, folderId, mcAuthResults,  jobId, referenceId, org) {
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
    await createMCAsset(mcAuthResults.access_token, textAssetBody, jobId, referenceId,name, false, null,org);
}


async function moveImageToMC(imageNode, folderId, mcAuthResults, cmsAuthResults, jobId, org) {
    return new Promise(async (resolve, reject) => {
        try{
            
            const imageUrl = imageNode.url || null;
            const fileName = imageNode.fileName || null;
            const imageExt = imageNode.ext || null;
           
            if(imageUrl){
                const referenceId =  imageNode.referenceId || null;
                const name =  imageNode.name;
             
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
                var mcRegex = /^[a-z](?!\w*__)(?:\w*[^\W_])?$/i;
                // Create Marketing Cloud Image Asset
                if (mcRegex.test(fileName)) {
                    await createMCAsset(mcAuthResults.access_token, imageAssetBody, jobId, referenceId, name, true, fileName, org);
                } else {
                    const response = `FileProperties.fileName contains prohibited characters. ${fileName}`; 
                    const uploadStatus ='Failed';

                    // update job status    
                    if(jobId && response){
                        updateJobProgress(jobId, response, name, uploadStatus, referenceId);
                    }
                }
            }
            
            resolve();
        }catch(error){
            console.log('Upload error -->', error);
        }
    });
}

async function moveDocumentToMC(documentNode, folderId, mcAuthResults, cmsAuthResults,  jobId, org) {
    return new Promise(async (resolve, reject) => {
        const docUrl = documentNode.url || null;
        const fileName = documentNode.fileName || null;
        const docExt = documentNode.ext || null;
        
        if(docUrl){
            const referenceId =  documentNode.referenceId || null;
            const name =  documentNode.name;
    
            const base64DocBody = await downloadBase64FromURL(
                docUrl,
                cmsAuthResults.access_token
            );
    
            base64Count = base64Count+1;
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
                await createMCAsset(mcAuthResults.access_token, docAssetBody, jobId, referenceId, name, true, fileName, org);
            } else {
                const response = `FileProperties.fileName contains prohibited characters. ${fileName}`; 
                const uploadStatus ='Failed';

                
                // update job status    
                if(jobId && response){
                    updateJobProgress(jobId, response, name, uploadStatus, referenceId);
                }
            }
           
        }
        
        resolve();
    });
}



async function createMCAsset(access_token, assetBody, jobId, referenceId, name, isMedia, fileName, org) {
    return new Promise((resolve, reject) => {
        request.post(validateUrl(MC_REST_BASE_URI) + MC_ASSETS_API_PATH, {
            headers: {
                Authorization: 'Bearer ' + access_token
            },
            json: assetBody,
        },
            async(error, res, body) => {
                
                totalUploadItems = totalUploadItems-1; 

                if (error) {

                    const response = `Error for:${assetBody.name} ${error}`; 
                    const uploadStatus ='Failed';

                    // update job status    
                    if(jobId && response){
                        updateJobProgress(jobId, response, name, uploadStatus, referenceId);
                    }

                    reject(error);
                } else {

                    try{
                        const msg = body.validationErrors && body.validationErrors.length ? body.validationErrors[0].message : '';
                        const errorCode = body.validationErrors && body.validationErrors.length ? body.validationErrors[0].errorcode : '';
                        
                        if(isMedia){
                            base64Count = base64Count-1;
                        }
                        const response = body.id ? `Uploaded with Asset id: ${body.id}`: `failed with Error code: ${errorCode} - Error message: ${msg} `; 
                        const uploadStatus = body.id ? 'Uploaded' : 'Failed';
    
                        console.log(body.id ? `${assetBody.name} uploaded with status code: ${res.statusCode} - Asset id: ${body.id}` : `${assetBody.name} failed with status code: ${res.statusCode} - Error message: ${msg} - Error code: ${errorCode}`);        
                        
                        // update job status    
                        if(jobId && response){
                            updateJobProgress(jobId, response, name, uploadStatus, referenceId);
                        }
                        
                        // Call next service
                        if(nextUploadBase64Items > 0 && base64Count === 1){
                            
                            setTimeout(async() => {
                                uploadAllBase64(org.oauth.access_token); 
                            }, 10000);

                        }else if(totalUploadItems === 0 && nextUploadBase64Items === 0 && base64Count === 0 ){
                            
                            setTimeout(async() => {
                                updateSfRecord(null, null, null, true); 
                            }, 10000);

                        }
                    }catch(err){
                        console.log(`Error for: `, err);
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


async function getMediaSourceFile(node){
    const referenceId =  node.referenceId || null;
    const name =  node.name;

    const url = node.unauthenticatedUrl ?  `${node.unauthenticatedUrl}` : null;

    if(url){
        
        const ext = node.fileName ? path.parse(node.fileName).ext: null;
        const publishedDate = node.publishedDate ? node.publishedDate.replace(/[^a-zA-Z0-9]/g, "") : '';

        let fileName = node.name ? node.name.replace(/[^a-zA-Z0-9]/g, "") : `${path.parse(node.fileName).name.replace(/[^a-zA-Z0-9]/g, "")}${publishedDate}`;
        
        fileName = `${IMG_PREFIX}${fileName}`;
        
        const notInMC = await getValidFileName(fileName + ext);
        if(notInMC){
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
        }else{
            return fileName + ext;
        }
    }
}

function updateAlreadySyncImageStatus(items, name, referenceId, fileName){
    const serverResponse = `failed with Error code: 118039 - Error message: Asset names within a category and asset type must be unique. is already taken. Suggested name: ${name}`; 
    const serverStatus = 'Uploaded';
    return items = [...items].map(item =>{
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
        return {...item, response, status, name: fileName ? fileName: name  }
    })
}

async function addProcessInQueue(workQueue, cmsAuthResults, org, contentTypeNodes, channelId, folderId, source, channelName) {
    let localBase64Count = 0;
    await Promise.all(contentTypeNodes.map(async (ele) => {
        try {
            const managedContentType = ele.DeveloperName;
            const managedContentNodeTypes = ele.managedContentNodeTypes;
            const cmsURL = `/services/data/v${SF_API_VERSION}/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&showAbsoluteUrl=true&pageSize=250`;
           
            const serviceResults = await getAllContent(org, cmsURL);
            
            if (serviceResults && serviceResults.length) {
                const result = {items: serviceResults, managedContentNodeTypes};
                let items = getAssestsWithProperNaming(result);
              
                const mediaCount = items.filter(ele => ele.assetTypeId === '8' || ele.assetTypeId === '11').length;
                
                totalBase64Items = totalBase64Items+mediaCount;
                totalUploadItems = totalUploadItems + items.length;

                const contents =  items.filter(ele => ele.assetTypeId === '196' || ele.assetTypeId === '197');
                const itemDocuments = items.filter(ele => ele.assetTypeId === '11');
                const itemImages = items.filter(ele => ele.assetTypeId === '8');
                
                // Images 
                let images = []; 
                let localSkiped = 0;
                await Promise.all(itemImages.map(async (imageNode) => {
                   const node =  await getMediaSourceFile(imageNode)
                   
                   if(typeof node == "string"){
                        localSkiped = localSkiped+1;
                        const referenceId =  imageNode.referenceId || null;
                        const name =  imageNode.name;
                        items = updateAlreadySyncImageStatus(items, name, referenceId, node);
                   }else if(node){
                        if(localBase64Count < allowedBase64Count){
                            localBase64Count = localBase64Count+1;
                            images = [...images, node];
                        }
                   }
                   
                }));


                let documents = []; 
                await Promise.all(itemDocuments.map(async (docNode) => {
                   const node =  await getMediaSourceFile(docNode);


                    if(typeof node == "string"){
                        localSkiped = localSkiped+1;
                        const referenceId =  docNode.referenceId || null;
                        const name =  docNode.name;
                        items = updateAlreadySyncImageStatus(items, name, referenceId, node);
                    }else if(node){
                        if(localBase64Count < allowedBase64Count){
                            localBase64Count = localBase64Count+1;
                            documents = [...documents, node];
                        }
                    }
                }));

                base64SkipedItems = base64SkipedItems+localSkiped;
                
                //Sync content based on source
                const jobItems = source === 'Heroku' ? [...documents, ...images] : [...contents, ...documents, ...images];
                if(jobItems && jobItems.length){
                    
                    // content type
                    const job = await workQueue.add({ content: { items: jobItems, cmsAuthResults, folderId, totalItems: items.length, org } }, {
                        attempts: 1,
                        lifo: true
                    });

                    jobWorkQueueList = [...jobWorkQueueList, { queueName: ele.MasterLabel, id: ele.Id, channelId, jobId: job.id, state: "Queued", items, response: '', counter: 0, channelName }];

                }
            }
        } catch (error) {
            console.log(error);
        }
    }));
    totalUploadItems = totalUploadItems - base64SkipedItems;
    nextUploadBase64Items = totalBase64Items - (base64SkipedItems + localBase64Count);
    base64Count = localBase64Count;

    // Call the upload start
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
                //await Promise.all(
            
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
                        
                    } else if (ele.assetTypeId === '8') { //image
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
    run: function (cmsAuthResults, org, contentTypeNodes, channelId, folderId, source, channelName) {
        
        base64Count = 0;
        totalBase64Items = 0;
        totalUploadItems = 0;
        base64SkipedItems = 0;
        nextUploadBase64Items = 0;

        if(source !== 'Heroku'){
            jobWorkQueueList = [];
        }

        const workQueue = new Queue(`work-${channelId}`, REDIS_URL);
        addProcessInQueue(workQueue, cmsAuthResults, org, contentTypeNodes, channelId, folderId, source, channelName)
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
    jobs: function () {
        return jobWorkQueueList;
    }
};

