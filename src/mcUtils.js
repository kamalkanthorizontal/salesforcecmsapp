
var hbs = require('hbs');
var dotenv = require("dotenv").config();

const fetch = require('node-fetch');
const https = require('https');
var request = require('request');
let Queue = require('bull');

const MC_ASSETS_API_PATH = '/asset/v1/content/assets';
const MS_AUTH_PATH = '/v2/token';

let REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

let workQueue = new Queue('work', REDIS_URL);


const getMcAuthBody = {
    grant_type: 'client_credentials',
    client_id: process.env.MC_CLIENT_ID,
    client_secret: process.env.MC_CLIENT_SECRET,
};

async function getMcAuth() {
    console.log('Auth Body: ', JSON.stringify(getMcAuthBody));
    return await fetch(process.env.MC_AUTHENTICATION_BASE_URI + MS_AUTH_PATH, {
            method: 'POST',
            body: JSON.stringify(getMcAuthBody),
            headers: {
                'Content-Type': 'application/json'
            },
        })
        .then(res => res.json()) // expecting a json response
        //.then(json => console.log(json))
        .catch((err) => {
            console.log({
                err
            });
            reject(err);
        });
}


async function moveTextToMC(name, value, mcAuthResults) {
    console.log(`Uploading text to MC: ${name} - ${value}`);

    let textAssetBody = {
        name: name,
        assetType: {
            id: 196,
        },
        content: value,
        category: {
            id: '311558'
        },
    };
    // Create MC Asset
    await createMCAsset(mcAuthResults.access_token, textAssetBody);
}

async function moveImageToMC(currentNode, mcAuthResults, cmsAuthResults) {
  return new Promise(async (resolve, reject) => {
      const imageUrl = `${currentNode.unauthenticatedUrl}`;

      const base64ImageBody = await downloadBase64FromURL(
        imageUrl,
        cmsAuthResults.access_token
      );
  
      const fileName = Date.now()+currentNode.fileName.replace(/\s/g, "");
      let fileNameChunks = fileName.split('.');
      let imageExtension = fileNameChunks[fileNameChunks.length - 1];

      console.log(`fileName: ${fileName}`);
      console.log(`imageExtension: ${imageExtension}`);
      console.log(`base64ImageBody: ${base64ImageBody.length}`);
      console.log(`Uploading Image to MC:  - ${imageUrl}`);

      let imageAssetBody = {
        name: fileName,
        assetType: {
          id: getImageAssetType(imageExtension),
        },
        fileProperties: {
            fileName: fileName,
            extension: imageExtension,
        },
        file: base64ImageBody,
        category: {
            id: '311558'
        },
      };
      // Create MC Asset
      await createMCAsset(mcAuthResults.access_token, imageAssetBody);
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
              console.log('end');
              resolve(imageBody);
            });
          }
        )
        .on('error', (e) => {
          reject(`Got error: ${e.message}`);
        });
    });
}


function getImageAssetType(imageExtension) {
    let assetTypeResults = '8';
  
    switch (imageExtension.toLowerCase()) {
      case 'gif':
        assetTypeResults = 20;
        break;
      case 'jpeg':
        assetTypeResults = 22;
        break;
      case 'jpg':
        assetTypeResults = 23;
        break;
      case 'png':
        assetTypeResults = 28;
        break;
      default:
        break;
    }
  
    return assetTypeResults;
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
                    console.error(error);
                    console.log({
                        assetBody
                    });
                    reject({
                        error
                    });
                } else {
                    //console.log('statusCode: ${res.statusCode}');
                    console.log(body);
                    resolve(res);
                }
            }
        );
    });
  }

  workQueue.on('global:completed', (jobId, result) => {
    console.log(`Job completed with result ${result} ${jobId}`);
  });


  let maxJobsPerWorker = 50;

  async function startUploadProcess() {
    let mcAuthResults = await getMcAuth();
    // Connect to the named work queue
    let workQueue = new Queue('work', REDIS_URL);

    workQueue.process(maxJobsPerWorker, async (job) => {
      try{
        let { content } = job.data;
        console.log('content', content)
        const {result} = content;

        if(result){
          const {managedContentNodeTypes, items} = result;
          
          // Get name prefix
          const contentNodes = items[0].contentNodes; // nodes 
          const defaultNode = managedContentNodeTypes.find(mcNode => mcNode.assetType == 0);      
          const nameKey = defaultNode.nodeName;
          const namePrefix = nameKey && contentNodes[nameKey] ? contentNodes[nameKey].value.replace(/\s+/g,"") : '';
          
          //filter only selected nodes
          let nodes = [...managedContentNodeTypes].map(node => node.nodeLabel).filter(ele=> ele !== 'Name');
          let finalArray = [];
          Object.entries(contentNodes).forEach(([key, value]) => {
            if(nodes.includes(key)){
              const objItem = value.nodeType === 'Media' ? value : { nodeType: value.nodeType,  name: `${namePrefix}-${key}-${Date.now()}`, value: value.value}
              finalArray = [...finalArray,   objItem];
            }
          });

          //upload content to MC
          await Promise.all(finalArray.map(async (ele) => {
            if(ele.nodeType  === 'Text' || ele.nodeType  === 'MultilineText' || ele.nodeType  === 'RichText'){
              console.log('ele', ele);
              await moveTextToMC(
                ele.name.replace(/\s+/g,""), //name
                ele.value, //value
                mcAuthResults
              );
            }else if(ele.nodeType  === 'Media'){
              await moveImageToMC(
                ele,
                mcAuthResults,
                content.cmsAuthResults
            );
            }
         }));
        }

      }catch(error){
        console.log('error', error);  
      }
    });
  }

  module.exports = async function run(cmsAuthResults, org,  contentTypeNodes, channelId ) {
    await Promise.all(contentTypeNodes.map(async (ele) => {
      const managedContentType = ele.DeveloperName;
      const managedContentNodeTypes = ele.managedContentNodeTypes;
      const cmsURL = `/services/data/v48.0/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&showAbsoluteUrl=true`;     
      let result = await org.getUrl(cmsURL); 
      result.managedContentNodeTypes = managedContentNodeTypes;
      
      const job = await workQueue.add({content: {result, cmsAuthResults}});
      console.log('job.id', job.id);
    }));

    startUploadProcess();
  }

  
  