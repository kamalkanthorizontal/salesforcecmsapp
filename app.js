var express = require("express");
var bodyParser = require("body-parser");
var nforce = require("nforce");
var hbs = require('hbs');
var dotenv = require("dotenv").config();

const fetch = require('node-fetch');
const https = require('https');
var request = require('request');

var app = express();
var isLocal;
var herokuApp = null;

app.set('view engine', 'hbs');
app.enable('trust proxy');

app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json());

function isNotBlank(val) {
    if (typeof val !== 'undefined' && val) {
        console.log('>>> ' + val);
        return true;
    };
    return false;
}


function isSetup() {
    /*if (isLocal) {
        require("dotenv").config();
    }*/
    return (
        isNotBlank(process.env.CONSUMER_KEY) &&
        isNotBlank(process.env.CONSUMER_SECRET) &&
        isNotBlank(process.env.MC_CLIENT_ID) &&
        isNotBlank(process.env.MC_CLIENT_SECRET) &&
        isNotBlank(process.env.MC_AUTHENTICATION_BASE_URI) &&
        isNotBlank(process.env.MC_REST_BASE_URI) &&
        isNotBlank(process.env.SF_USERNAME) &&
        isNotBlank(process.env.SF_PASSWORD) &&
        isNotBlank(process.env.SF_SECURITY_TOKEN)
    );
}

function oauthCallbackUrl(req) {
    return req.protocol + "://" + req.get("host");
}

// Generic error handler used by all endpoints.
//handleError(res, "Invalid user input", "Please enter the Name.", 400); 
function handleError(res, reason, message, code) {
    console.log("ERROR: ", reason);
    res.status(code || 500).json({
        error: message
    });
}

app.get("/", function (req, res) {
    var oauth;
    isLocal = req.hostname.indexOf("localhost") == 0;

    if (req.hostname.indexOf(".herokuapp.com") > 0) {
        herokuApp = req.hostname.replace(".herokuapp.com", "");
    }
    var cmsURL =
        "/services/data/v48.0/connect/cms/delivery/channels/0apL00000004CO6/contents/query?managedContentType=ContentBlock&page=0&pageSize=1";

    //console.log(isLocal + '>>>' + herokuApp);
    if (isSetup()) {
        //nforce setup to connect Salesforce
        var org = nforce.createConnection({
            clientId: process.env.CONSUMER_KEY,
            clientSecret: process.env.CONSUMER_SECRET,
            redirectUri: oauthCallbackUrl(req), //"https://APPNAME.herokuapp.com/oauth/_callback",
            //apiVersion: "v37.0", // optional, defaults to current salesforce API version
            mode: "single", // optional, 'single' or 'multi' user mode, multi default
            environment: "sandbox", // optional, salesforce 'sandbox' or 'production', production default,
            autoRefresh: true
        });

        org.authenticate({
            username: process.env.SF_USERNAME,
            password: process.env.SF_PASSWORD,
            securityToken: process.env.SF_SECURITY_TOKEN
        }, async function (err, resp) {
            if (!err) {
                console.log("Salesforce Access Token: " , resp.access_token);
                //res.send("Salesforce Access Token: " + resp.access_token);

                try{
                    const res = await org.getUrl(cmsURL);
                    console.log("Response: ", JSON.stringify(res));
                    //res.type('json').send(JSON.stringify(resp.items, null, 2) + '\n');
                    run(res);
                }catch(error){
                    res.send(err.message);
                }
                

                /*org.getUrl(cmsURL).then(res => {
                    //  run(res);
                      console.log("Salesforce Access Token: " + JSON.stringify(res));
                  }).catch(error =>{
                      res.send(error.message);
                  });
  

                org.getUrl(cmsURL, function (err, resp) {
                    if (!err) {
                        run(resp);
                        //if (resp.items && resp.items.length)
                    } else {
                        res.send(err.message);
                    }
                });*/
            } else {
                res.send(err.message);
            }
        });
    } else {
        res.redirect("/setup");
    }
});

app.get("/setup", function (req, res) {
    res.render("setup", {
        isLocal: isLocal,
        oauthCallbackUrl: oauthCallbackUrl(req),
        herokuApp: herokuApp,
    });
});

async function run(cmsContentResults) {
    let mcAuthResults = await getMcAuth();
    let cmsAuthResults = await sfAuth();
    await cmsContentResults.items.forEach(async (content) => {
        let contentTitle = `CMS Promotion - ${content.title}`;    
        let image = content.contentNodes['Image'];
        //console.log({content});
        await moveTextToMC(
                content.contentUrlName,
                content.title,
                mcAuthResults
        );


        await moveImageToMC(
            `${contentTitle} - secondImage - ${image.fileName}`,
            image,
            mcAuthResults,
            cmsAuthResults
        );
    });
};

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
    console.log('Marketing Cloud Access Token: ', mcAuthResults.access_token);
    console.log('Uploading text to MC: ', name +'-'+ title);

    let textAssetBody = {
        name: name,
        assetType: {
            id: 196,
        },
        content: title,
        category: {
            id: '6345',
            name: 'Content Builder',
            parentId: 0
        },
    };
    // Create MC Asset
    await createMCAsset(mcAuthResults.access_token, textAssetBody);
}


async function moveImageToMC(name, currentNode, mcAuthResults, cmsAuthResults) {
    return new Promise(async (resolve, reject) => {
      const imageUrl = `${cmsAuthResults.instance_url}${currentNode.resourceUrl}`;
  
      const base64ImageBody = await downloadBase64FromURL(
        imageUrl,
        cmsAuthResults.access_token
      );
  
      console.log(`Uploading Image to MC: ${name} - ${imageUrl}`);
  
      let imageAssetBody = {
        name: name,
        assetType: {
          id: getImageAssetType(currentNode.fileName),
        },
        file: base64ImageBody,
        category: {
          id: '1520210',
        },
      };
      // Create MC Asset
      await createMCAsset(mcAuthResults.access_token, imageAssetBody);
      resolve();
    });
  }

  function getImageAssetType(imageName) {
    let assetTypeResults = '8';
  
    let fileNameChunks = imageName.split('.');
  
    let imageExtension = fileNameChunks[fileNameChunks.length - 1];
  
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

// Initialize the app.
var server = app.listen(process.env.PORT || 3000, function () {
    var port = server.address().port;
    console.log("App now running on port", port);
});
