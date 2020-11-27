const fetch = require('node-fetch');
const https = require('https');
var request = require('request');
let Queue = require('bull');
const path = require('path');

const MC_ASSETS_API_PATH = '/asset/v1/content/assets';
const MS_AUTH_PATH = '/v2/token'
const MC_CONTENT_CATEGORIES_API_PATH = '/asset/v1/content/categories';

let REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

const getMcAuthBody = {
    grant_type: 'client_credentials',
    client_id: process.env.MC_CLIENT_ID,
    client_secret: process.env.MC_CLIENT_SECRET,
};
const PAGE_SIZE = process.env.PAGE_SIZE || 5;

async function getMcAuth() {
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
            reject(err);
        });
}

async function moveTextToMC(name, value, assetTypeId, folderId, mcAuthResults) {
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
    await createMCAsset(mcAuthResults.access_token, textAssetBody);
}

async function moveImageToMC(imageNode, folderId, mcAuthResults, cmsAuthResults) {
    return new Promise(async (resolve, reject) => {
        const imageUrl = `${imageNode.unauthenticatedUrl}`;
        // console.log('imageNode--->', imageNode);
        const base64ImageBody = await downloadBase64FromURL(
            imageUrl,
            cmsAuthResults.access_token
        );

        const imageExt = path.parse(imageNode.fileName).ext;
        const publishedDate = imageNode.publishedDate ? imageNode.publishedDate.replace(/[^a-zA-Z0-9]/g, "") : '';

        let fileName = imageNode.name ? imageNode.name.replace(/[^a-zA-Z0-9]/g, "") : `${path.parse(imageNode.fileName).name.replace(/[^a-zA-Z0-9]/g, "")}${publishedDate}`;
        fileName = `jpg_${fileName}`; // Need to remove once testing done

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
            await createMCAsset(mcAuthResults.access_token, imageAssetBody);
        } else {
            console.log('Upload on hold!! Please check the prohibited chars in', fileName);
        }
        resolve();
    });
}


async function moveDocumentToMC(documentNode, folderId, mcAuthResults, cmsAuthResults) {
    return new Promise(async (resolve, reject) => {
        const doCUrl = `${documentNode.unauthenticatedUrl}`;
        const base64DocBody = await downloadBase64FromURL(
            doCUrl,
            cmsAuthResults.access_token
        );

        const docExt = path.parse(documentNode.fileName).ext;
        const publishedDate = documentNode.publishedDate ? documentNode.publishedDate.replace(/[^a-zA-Z0-9]/g, "") : '';

        const fileName = documentNode.name ? documentNode.name.replace(/[^a-zA-Z0-9]/g, "") : `${path.parse(documentNode.fileName).name.replace(/[^a-zA-Z0-9]/g, "")}${publishedDate}`;
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
            await createMCAsset(mcAuthResults.access_token, docAssetBody);
        } else {
            console.log('Upload on hold!! Please check the prohibited chars in', fileName);
        }
        resolve();
    });
}

async function downloadBase64FromURL(url, access_token, callback) {
    return new Promise((resolve, reject) => {
        https
            .get(
                url,
                { headers: { Authorization: 'Bearer ' + access_token } },
                (resp) => {
                    resp.setEncoding('base64');
                    let imageBody = '';
                    resp.on('data', (data) => {
                        imageBody += data;
                    });
                    resp.on('end', () => {
                        resolve(imageBody);
                    });
                }
            )
            .on('error', (e) => {
                reject(`Got error: ${e.message}`);
            });
    });
}


function getImageAssetTypeId(imageExtension) {
    let assetTypeId = '8';

    switch (imageExtension.toLowerCase()) {
        case 'ai':
            assetTypeId = '16';
            break;
        case 'psd':
            assetTypeId = '17';
            break;
        case 'pdd':
            assetTypeId = '18';
            break;
        case 'eps':
            assetTypeId = '19';
            break;
        case 'gif':
            assetTypeId = '20';
            break;
        case 'jpe':
            assetTypeId = '21';
            break;
        case 'jpeg':
            assetTypeId = '22';
            break;
        case 'jpg':
            assetTypeId = '23';
            break;
        case 'jp2':
            assetTypeId = '24';
            break;
        case 'jpx':
            assetTypeId = '25';
            break;
        case 'pict':
            assetTypeId = '26';
            break;
        case 'pct':
            assetTypeId = '27';
            break;
        case 'png':
            assetTypeId = '28';
            break;
        case 'tif':
            assetTypeId = '29';
            break;
        case 'tiff':
            assetTypeId = '30';
            break;
        case 'tga':
            assetTypeId = '31';
            break;
        case 'bmp':
            assetTypeId = '32';
            break;
        case 'wmf':
            assetTypeId = '33';
            break;
        case 'vsd':
            assetTypeId = '34';
            break;
        case 'pnm':
            assetTypeId = '35';
            break;
        case 'pgm':
            assetTypeId = '36';
            break;
        case 'pbm':
            assetTypeId = '37';
            break;
        case 'ppm':
            assetTypeId = '38';
            break;
        case 'svg':
            assetTypeId = '39';
            break;
        default:
            break;
    }
    return assetTypeId;
}

function getDocumentAssetTypeId(docExtension) {
    let assetTypeId = '11';

    switch (docExtension.toLowerCase()) {
        case 'indd':
            assetTypeId = '101';
            break;
        case 'indt':
            assetTypeId = '102';
            break;
        case 'incx':
            assetTypeId = '103';
            break;
        case 'wwcx':
            assetTypeId = '104';
            break;
        case 'doc':
            assetTypeId = '105';
            break;
        case 'docx':
            assetTypeId = '106';
            break;
        case 'dot':
            assetTypeId = '107';
            break;
        case 'dotx':
            assetTypeId = '108';
            break;
        case 'mdb':
            assetTypeId = '109';
            break;
        case 'mpp':
            assetTypeId = '110';
            break;
        case 'ics':
            assetTypeId = '111';
            break;
        case 'xls':
            assetTypeId = '112';
            break;
        case 'xlsx':
            assetTypeId = '113';
            break;
        case 'xlk':
            assetTypeId = '114';
            break;
        case 'xlsm':
            assetTypeId = '115';
            break;
        case 'xlt':
            assetTypeId = '116';
            break;
        case 'xltm':
            assetTypeId = '117';
            break;
        case 'csv':
            assetTypeId = '118';
            break;
        case 'tsv':
            assetTypeId = '119';
            break;
        case 'tab':
            assetTypeId = '120';
            break;
        case 'pps':
            assetTypeId = '121';
            break;
        case 'ppsx':
            assetTypeId = '122';
            break;
        case 'ppt':
            assetTypeId = '123';
            break;
        case 'pptx':
            assetTypeId = '124';
            break;
        case 'pot':
            assetTypeId = '125';
            break;
        case 'thmx':
            assetTypeId = '126';
            break;
        case 'pdf':
            assetTypeId = '127';
            break;
        case 'ps':
            assetTypeId = '128';
            break;
        case 'qxd':
            assetTypeId = '129';
            break;
        case 'rtf':
            assetTypeId = '130';
            break;
        case 'sxc':
            assetTypeId = '131';
            break;
        case 'sxi':
            assetTypeId = '132';
            break;
        case 'sxw':
            assetTypeId = '133';
            break;
        case 'odt':
            assetTypeId = '134';
            break;
        case 'ods':
            assetTypeId = '135';
            break;
        case 'ots':
            assetTypeId = '136';
            break;
        case 'odp':
            assetTypeId = '137';
            break;
        case 'otp':
            assetTypeId = '138';
            break;
        case 'epub':
            assetTypeId = '139';
            break;
        case 'dvi':
            assetTypeId = '140';
            break;
        case 'key':
            assetTypeId = '141';
            break;
        case 'keynote':
            assetTypeId = '142';
            break;
        case 'pez':
            assetTypeId = '143';
            break;
        default:
            break;
    }
    return assetTypeId;
}

async function createMCAsset(access_token, assetBody) {
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
                    console.log('validationErrors--->', body.validationErrors); 
                    const msg = body.validationErrors && body.validationErrors.length ? body.validationErrors[0].message : '';
                    const errorCode = body.validationErrors && body.validationErrors.length ? body.validationErrors[0].errorcode : '';
                    console.log(body.id ? `${assetBody.name} uploaded with status code: ${res.statusCode} - Asset id: ${body.id}` : `${assetBody.name} failed with status code: ${res.statusCode} - Error message: ${msg} - Error code: ${errorCode}`);
                    resolve(res);
                }
            }
        );
    });
}

let maxJobsPerWorker = 150;
let jobWorkQueueList = [];

async function startUploadProcess(workQueue) {
    workQueue.on('global:completed', async (jobId, result) => {
        let job = await workQueue.getJob(jobId);
        let state = await job.getState();
        jobWorkQueueList = [...jobWorkQueueList].map(ele => {
            return { ...ele, state: ele.jobId === jobId ? state : ele.state };
        })
    });

    workQueue.on('failed', (jobId, err) => {
        console.log(`Job ${jobId} failed with error ${err.message}`);
        // console.log(`failed jobWorkQueueList`, jobWorkQueueList);

    });

    workQueue.on('progress', function (job, progress) {
        // A job's progress was updated!
        jobWorkQueueList = [...jobWorkQueueList].map(ele => {
            return { ...ele, progress: ele.jobId === job.id ? progress.percents : ele.progress };
        })

    })


    let mcAuthResults = await getMcAuth();
    console.log("Marketing Cloud authentication :", mcAuthResults.access_token ? 'Successful' : 'Failure');

    workQueue.process(maxJobsPerWorker, async (job) => {
        try {
            let { content } = job.data;
            const { result, folderId } = content;
            console.log('folderId--->', folderId);
            if (result) {
                const { managedContentNodeTypes, items } = result;

                // Get name prefix

                const defaultNameNode = managedContentNodeTypes.find(mcNode => mcNode.assetTypeId == 0);
                const nameKey = defaultNameNode ? defaultNameNode.nodeName : null;


                let finalArray = [];

                items.forEach(item => {
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
                                objItem = { ...value, publishedDate };
                            } else if (value.nodeType === 'Media') { // Image Node
                                objItem = { ...value, assetTypeId: assetTypeId, name: `${namePrefix}-${nameSuffix}-${publishedDate}` };
                            } else {
                                objItem = { assetTypeId: assetTypeId, nodeType: value.nodeType, name: `${namePrefix}-${nameSuffix}-${publishedDate}`, value: value.value };
                            }
                            finalArray = [...finalArray, objItem];
                        }
                    });

                })

                //console.log('finalArray->>', finalArray);
                console.log(`Filtered no. of nodes for Job ID ${job.id} : ${finalArray.length}`);

                let counter = 0;
                const totalNumer = finalArray.length;
                //Upload CMS content to Marketing Cloud
                await Promise.all(finalArray.map(async (ele) => {
                    // console.log('ele.assetTypeId ', ele.assetTypeId );
                    if (ele.assetTypeId === '196' || ele.assetTypeId === '197') { // 196 - 'Text' &'MultilineText' and 197 - 'RichText'
                        await moveTextToMC(
                            ele.name,
                            ele.value,
                            ele.assetTypeId,
                            folderId,
                            mcAuthResults
                        );

                        counter++;
                        const percents = ((counter / totalNumer) * 100).toFixed(3);
                        job.progress({ percents, currentStep: "currently we doing another thing" });


                    } else if (ele.assetTypeId === '8') { //image
                        await moveImageToMC(
                            ele,
                            folderId,
                            mcAuthResults,
                            content.cmsAuthResults
                        );


                        counter++;
                        const percents = ((counter / totalNumer) * 100).toFixed(3);
                        job.progress({ percents, currentStep: "currently we doing another thing" });

                    } else if (ele.assetTypeId === '11') { //document

                        await moveDocumentToMC(
                            ele,
                            folderId,
                            mcAuthResults,
                            content.cmsAuthResults
                        );

                        counter++;
                        const percents = ((counter / totalNumer) * 100).toFixed(3);
                        job.progress({ percents, currentStep: "currently we doing another thing" });

                    }
                }));
                // call done when finished
                //done();
            }
        } catch (error) {
            console.log('error', error);
        }
    });

}

module.exports = {
    run: async function (cmsAuthResults, org, contentTypeNodes, channelId, folderId) {
        let workQueue = new Queue(`work-${channelId}`, REDIS_URL);
        await Promise.all(contentTypeNodes.map(async (ele) => {
            try {
                const managedContentType = ele.DeveloperName;
                const managedContentNodeTypes = ele.managedContentNodeTypes;
                const cmsURL = `/services/data/v${process.env.SF_API_VERSION}/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&showAbsoluteUrl=true&pageSize=${PAGE_SIZE}`;
                let result = await org.getUrl(cmsURL);
                if (result && result.items && result.items.length) {
                    result.managedContentNodeTypes = managedContentNodeTypes;

                    const job = await workQueue.add({ content: { result, cmsAuthResults, folderId } });

                    jobWorkQueueList = [...jobWorkQueueList, { channelId, jobId: job.id, state: "queued", items: result.items }];

                    console.log('Hitting Connect REST URL:', cmsURL);
                    console.log('Job Id:', job.id);
                    //console.log('jobWorkQueueList:', jobWorkQueueList);

                }

            } catch (error) {
                console.log(error);
            }
        }));

        startUploadProcess(workQueue);
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
            // reject(err);
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
                // reject(err);
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
                //reject(err);
            });
    },
    jobs: function () {

        return jobWorkQueueList;

    }
};

