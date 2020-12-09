const fetch = require('node-fetch');
var request = require('request');
let Queue = require('bull');
const path = require('path');
const nforce = require("nforce");

const { getImageAssetTypeId, getDocumentAssetTypeId, downloadBase64FromURL, oauthCallbackUrl } = require('./utils.js');
const { MC_ASSETS_API_PATH, MS_AUTH_PATH, MC_CONTENT_CATEGORIES_API_PATH, REDIS_URL } = require('./constants');


let maxJobsPerWorker = 150;
let jobWorkQueueList = [];


const allowedBase64Count = 50;
let base64Count = 0;
let totalBase64Items = 0;
let totalUploadItems = 0;
let base64SkipedItems = 0;


const getMcAuthBody = {
    grant_type: 'client_credentials',
    client_id: process.env.MC_CLIENT_ID,
    client_secret: process.env.MC_CLIENT_SECRET,
};
const PAGE_SIZE = process.env.PAGE_SIZE || 5;



async function updateBase64Status(){
    const totalUploadedBase65Count = base64SkipedItems+base64Count; //50

    //if( totalUploadItems === 0 && totalBase64Items > 0 && totalUploadedBase65Count === totalBase64Items ){
                   if( totalUploadItems === 0){
                    console.log('base64SkipedItems--->', base64SkipedItems);
                    console.log('base64Count--->', base64Count);                        
                    console.log('totalUploadedBase65Count--->', totalUploadedBase65Count);
                    console.log('totalBase64Items--->', totalBase64Items);
            
                    console.log('Total Base 64 Count--->', totalBase64Items);
                   
        // call the service that hit service again
        
        // Call the next service hit after all process close
        /*setTimeout(async() => {
            await uploadAllBase64(sfToken);
        }, 10000);*/
    }
}

async function uploadAllBase64(accessToken) {
    try {

        let org = nforce.createConnection({
            clientId: process.env.CONSUMER_KEY,
            clientSecret: process.env.CONSUMER_SECRET,
            redirectUri: process.env.SF_CMS_URL,
            apiVersion: process.env.SF_API_VERSION,
            mode: "single",
            environment: "sandbox",
            autoRefresh: true
        });

        const oauth = await org.authenticate({
            username: process.env.SF_USERNAME,
            password: process.env.SF_PASSWORD,
            securityToken: process.env.SF_SECURITY_TOKEN
        });


       const body = {  
            "cmsConnectionId":   "a2IL0000001MIYfMAO"
         }
        const url = `${process.env.SF_CMS_URL}/services/apexrest/CMSSFMC/callHeroku`;
        //const resQuery = await org.postUrl({ oauth, url, body });
        //console.log('resQuery', resQuery);
       // 
        
       /* console.log('serviceUrl---->', serviceUrl);
        const res = await fetch(serviceUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`
            },
        });

        const response = await res.json();
        
        console.log('uploadAllBase64---->', response);*/

       // return notInMc;
    } catch (error) {
        console.log('Error in file Name:', error);
        return false;
    }
}

async function getValidFileName(fileName) {
    try {
        const mcAuthResults = await getMcAuth();
        const serviceUrl = `${process.env.MC_REST_BASE_URI}${MC_ASSETS_API_PATH}?$filter=Name%20like%20'${fileName}'`;
    
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
    return await fetch(`${process.env.MC_AUTHENTICATION_BASE_URI}${MS_AUTH_PATH}`, {
        method: 'POST',
        body: JSON.stringify(getMcAuthBody),
        headers: {
            'Content-Type': 'application/json'
        },
    })
        .then(res => res.json())
        .catch((err) => {
            //console.log(err);
            reject(err);
        });
}

async function moveTextToMC(name, value, assetTypeId, folderId, mcAuthResults,  jobId, referenceId) {
    //console.log(`Uploading txt to MC: ${name} with body length ${value.length}`);
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
   // return new Promise(async (resolve, reject) => {
        try{
            const imageUrl = `${imageNode.unauthenticatedUrl}`;
            const referenceId =  imageNode.referenceId;
            const name =  imageNode.name;
            
            
            const imageExt = path.parse(imageNode.fileName).ext;
            const publishedDate = imageNode.publishedDate ? imageNode.publishedDate.replace(/[^a-zA-Z0-9]/g, "") : '';
    
            let fileName = imageNode.name ? imageNode.name.replace(/[^a-zA-Z0-9]/g, "") : `${path.parse(imageNode.fileName).name.replace(/[^a-zA-Z0-9]/g, "")}${publishedDate}`;
            
            const imagePreFix = process.env.IMG_PREFIX || '';
            fileName = `${imagePreFix}${fileName}`;
    
            const notInMC = await getValidFileName(fileName + imageExt);
    
            if(notInMC){
                if(base64Count < 50){
                    const base64ImageBody = await downloadBase64FromURL(
                        imageUrl,
                        cmsAuthResults.access_token
                    );
                    
                    base64Count = base64Count+1;
                    console.log('base64Count--->', base64Count);
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
                        //console.log(`Uploading img to MC: ${fileName + imageExt} with base64ImageBody length ${base64ImageBody.length}`);
                        await createMCAsset(mcAuthResults.access_token, imageAssetBody, jobId, referenceId, name);
                    } else {
                        console.log('Upload on hold!! Please check the prohibited chars in', fileName);
                    }
                }
                
            }else{
                const response = `failed with Error code: 118039 - Error message: Asset names within a category and asset type must be unique. is already taken. Suggested name: ${fileName}`; 
                const uploadStatus = 'Failed';
    
                base64SkipedItems = base64SkipedItems+1;
                totalUploadItems = totalUploadItems-1;
                await updateBase64Status();
    
                // update job status
                if(jobId && response){
                    updateJobProgress(jobId, response, name, uploadStatus, referenceId);
                }
                console.log(' notInMC failed with Error code: 118039 - Error message: Asset names within a category and asset type must be unique. is already taken. Suggested name: ', fileName);
            }
            
           // resolve();
        }catch(error){
            console.log('Upload error -->', error)
        }
        
    //});
}

async function moveDocumentToMC(documentNode, folderId, mcAuthResults, cmsAuthResults,  jobId) {
    return new Promise(async (resolve, reject) => {
        const docUrl = `${documentNode.unauthenticatedUrl}`;
        const referenceId =  documentNode.referenceId;
        const name =  documentNode.name;
       

        const docExt = path.parse(documentNode.fileName).ext;
        const publishedDate = documentNode.publishedDate ? documentNode.publishedDate.replace(/[^a-zA-Z0-9]/g, "") : '';

        let fileName = documentNode.name ? documentNode.name.replace(/[^a-zA-Z0-9]/g, "") : `${path.parse(documentNode.fileName).name.replace(/[^a-zA-Z0-9]/g, "")}${publishedDate}`;

        const imagePreFix = process.env.IMG_PREFIX || '';
        fileName = `${imagePreFix}${fileName}`;

        const notInMC = await getValidFileName(fileName + docExt);

        if(notInMC){
            if(base64Count < 50){
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
                //  console.log(`Uploading doc to MC: ${fileName + docExt} with base64DocBody length ${base64DocBody.length}`);
                    await createMCAsset(mcAuthResults.access_token, docAssetBody, jobId, referenceId, name);
                } else {
                    console.log('FileProperties.fileName contains prohibited characters.', fileName);
                }
            }
            
        }else{
            const response = `failed with Error code: 118039 - Error message: Asset names within a category and asset type must be unique. is already taken. Suggested name: ${fileName}`; 
            const uploadStatus = 'Failed';

            base64SkipedItems = base64SkipedItems+1;
            totalUploadItems = totalUploadItems-1;
            await updateBase64Status();

            // update job status
            if(jobId && response){
                updateJobProgress(jobId, response, name, uploadStatus, referenceId);
            }

            console.log(' notInMC failed with Error code: 118039 - Error message: Asset names within a category and asset type must be unique. is already taken. Suggested name: ', fileName);
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
            async(error, res, body) => {
                if (error) {
                    console.log('error', error)
                    console.log(`Error for:${assetBody.name}`, error);
                    reject(error);
                } else {
                    //console.log('body--> ', body);
                    const msg = body.validationErrors && body.validationErrors.length ? body.validationErrors[0].message : '';
                    const errorCode = body.validationErrors && body.validationErrors.length ? body.validationErrors[0].errorcode : '';

                    const response = body.id ? `Uploaded with Asset id: ${body.id}`: `failed with Error code: ${errorCode} - Error message: ${msg} `; 
                    const uploadStatus = body.id ? 'Uploaded' : 'Failed';

                    console.log(body.id ? `${assetBody.name} uploaded with status code: ${res.statusCode} - Asset id: ${body.id}` : `${assetBody.name} failed with status code: ${res.statusCode} - Error message: ${msg} - Error code: ${errorCode}`);        

                    totalUploadItems = totalUploadItems-1; 

                     await updateBase64Status();
                   
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
    await Promise.all(contentTypeNodes.map(async (ele) => {
        try {
            const managedContentType = ele.DeveloperName;
            const managedContentNodeTypes = ele.managedContentNodeTypes;
            const cmsURL = `/services/data/v${process.env.SF_API_VERSION}/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&showAbsoluteUrl=true&pageSize=250`;
           
            const serviceResults = await getAllContent(org, cmsURL);
            
            if (serviceResults && serviceResults.length) {
                const result = {items: serviceResults, managedContentNodeTypes};
                const items = getAssestsWithProperNaming(result);

                const mediaCount = items.filter(ele => ele.assetTypeId === '8' || ele.assetTypeId === '11').length;

                totalBase64Items = totalBase64Items+mediaCount;
                totalUploadItems = totalUploadItems + items.length;
                
                const job = await workQueue.add({ content: { items, cmsAuthResults, folderId, totalItems: items.length } }, {
                    attempts: 1
                });

                jobWorkQueueList = [...jobWorkQueueList, { queueName: ele.MasterLabel, id: ele.Id, channelId, jobId: job.id, state: "Queued", items, response: '', counter: 0 }];

                console.log('Job Id:', job.id);

            }
        } catch (error) {
            console.log(error);
        }
    }));

    console.log('Total Base 64 Count--->', totalBase64Items);
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


    let mcAuthResults = await getMcAuth();
    console.log("Marketing Cloud authentication :", mcAuthResults.access_token ? 'Successful' : 'Failure');

    workQueue.process(maxJobsPerWorker, async (job, done) => {
        try {
            let { content } = job.data;
            const { items, folderId } = content;
            if (items) {
                console.log(`Filtered no. of nodes for Job ID ${job.id} : ${items.length}`);
                
                // totalBase64Items = items.filter(ele => ele.assetTypeId === '8' || ele.assetTypeId === '11').length;
                
                // totalUploadItems = items.length;//items.filter(ele => ele.assetTypeId === '196' || ele.assetTypeId === '197').length +totalBase64Count;
                
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
                        if(base64Count <  allowedBase64Count){
                            await moveImageToMC(
                                ele,
                                folderId,
                                mcAuthResults,
                                content.cmsAuthResults,
                                job.id
                            );
                        }else{
                            console.log('50 base64 synced');
                        }
                    } else if (ele.assetTypeId === '11') { //document
                        if(base64Count <  allowedBase64Count){
                            await moveDocumentToMC(
                                ele,
                                folderId,
                                mcAuthResults,
                                content.cmsAuthResults,
                                job.id
                            );
                        }else{
                            console.log('50 base64 synced');
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
        totalBase64Items = 0;
        totalUploadItems = 0;
        base64SkipedItems = 0;

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

