
var hbs = require('hbs');
var dotenv = require("dotenv").config();

const fetch = require('node-fetch');
const https = require('https');
var request = require('request');

const MC_ASSETS_API_PATH = '/asset/v1/content/assets';
const MS_AUTH_PATH = '/v2/token';

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


async function moveTextToMC(name, title, mcAuthResults) {
    console.log(`Uploading text to MC: ${name} - ${title}`);

    let textAssetBody = {
        name: Date.now()+name,
        assetType: {
            id: 196,
        },
        content: title,
        category: {
            id: '311558'
        },
    };
    // Create MC Asset
    await createMCAsset(mcAuthResults.access_token, textAssetBody);
}

async function moveImageToMC(name, currentNode, mcAuthResults, cmsAuthResults) {
    return new Promise(async (resolve, reject) => {
      const imageUrl = `${currentNode.unauthenticatedUrl}`;
      console.log(`Uploading Image to MC: ${name} - ${imageUrl}`);

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
  
  module.exports = async function run(cmsContentResults, cmsAuthResults) {
    let mcAuthResults = await getMcAuth();
    console.log('Marketing Cloud Access Token: ', mcAuthResults.access_token.length);

    await cmsContentResults.items.forEach(async (content) => { 
        //console.log({content});
        await moveTextToMC(
                content.contentUrlName,
                content.title,
                mcAuthResults
        );
        
        
        let image = content.contentNodes['Image'];
        if(image) {
            await moveImageToMC(
                image.fileName,
                image,
                mcAuthResults,
                cmsAuthResults
            );
        }
    });
  }
