var express = require("express");
var bodyParser = require("body-parser");
var nforce = require("nforce");
const fetch = require('node-fetch');
var hbs = require('hbs');
var dotenv = require("dotenv").config();
var path = require('path');

const { run, getMcFolders, createMcFolder, getMcAuth, jobs } = require('./src/mcUtils.js');

const { ALLOWED_CONNECTION_STATUS, MC_CONTENT_CATEGORIES_API_PATH, FETCH_CMS_FOLDER_DETAIL_QUERY,CONNETION_STATUS } = require('./src/constants');

var isLocal;
var herokuApp;

let app = express();
app.set('view engine', 'hbs');
app.enable('trust proxy');
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json());


function isNotBlank(val) {
    if (typeof val !== 'undefined' && val) {
        //console.log('>>> ' + val);
        return true;
    };
    return false;
}

function isSetup() {
    return (
        isNotBlank(process.env.APP_NAME) &&
        isNotBlank(process.env.CONSUMER_KEY) &&
        isNotBlank(process.env.CONSUMER_SECRET) &&
        isNotBlank(process.env.MC_CLIENT_ID) &&
        isNotBlank(process.env.MC_CLIENT_SECRET) &&
        isNotBlank(process.env.MC_AUTHENTICATION_BASE_URI) &&
        isNotBlank(process.env.MC_REST_BASE_URI) &&
        isNotBlank(process.env.MC_FOLDER_NAME) &&
        isNotBlank(process.env.SF_USERNAME) &&
        isNotBlank(process.env.SF_PASSWORD) &&
        isNotBlank(process.env.SF_SECURITY_TOKEN) &&
        isNotBlank(process.env.SF_API_VERSION) &&
        isNotBlank(process.env.SF_CMS_CONNECTION_ID) &&
        isNotBlank(process.env.SF_CMS_URL)
    );
}

function oauthCallbackUrl(req) {
    return req.protocol + "://" + req.get("host");
}

app.get("/setup", function (req, res) {
    res.render("setup", {
        isLocal: isLocal,
        oauthCallbackUrl: oauthCallbackUrl(req),
        herokuApp: herokuApp,
    });
});

// Kick off a new job by adding it to the work queue
app.get('/jobs', async (req, res) => {
    res.json({ jobs: jobs() });
});

app.get("/queue", async function (req, res) {
    res.sendFile('./queue.html', { root: __dirname });
})

app.post('/', async (req, res, next) => {
    try {
        isLocal = req.hostname.indexOf("localhost") == 0;
        if (req.hostname.indexOf(".herokuapp.com") > 0) {
            herokuApp = req.hostname.replace(".herokuapp.com", "");
        }

        if (isSetup()) {
            let { contentTypeNodes, contentType, channelId, mcFolderId } = req.body;
            let validFolderId;
            if (mcFolderId) {
                validFolderId = await getValidFolderId(mcFolderId);
            }
            console.log('validFolderId--->', validFolderId)
            if (!validFolderId) {
                mcFolderRes = await getFolderIdFromServer();
                console.log('validFolderId--->', validFolderId);
                if(mcFolderRes && mcFolderRes.id){
                    validFolderId = mcFolderRes.id;
                }
                
            }

            if (validFolderId !== mcFolderId) {
                await updateCallbackUrl(null, validFolderId);
            }

            mcFolderId = validFolderId;

            contentTypeNodes = JSON.parse(contentTypeNodes);

            //nforce setup to connect Salesforce
            let org = nforce.createConnection({
                clientId: process.env.CONSUMER_KEY,
                clientSecret: process.env.CONSUMER_SECRET,
                redirectUri: oauthCallbackUrl(req),
                apiVersion: process.env.SF_API_VERSION,
                mode: "single",
                environment: "sandbox",
                autoRefresh: true
            });

            try {
                const resp = await org.authenticate({
                    username: process.env.SF_USERNAME,
                    password: process.env.SF_PASSWORD,
                    securityToken: process.env.SF_SECURITY_TOKEN
                });
                console.log("Salesforce authentication :", resp.access_token ? 'Successful' : 'Failure');
                run(resp, org, contentTypeNodes, channelId, mcFolderId);
                res.send('CMS Content Type is syncing in the background. Please wait..');
            } catch (error) {
                res.send(error.message);
            }
        } else {
            res.redirect("/setup");
        }
    } catch (error) {
        res.send(error.message);
    }
});

async function getValidFolderId(folderId) {
    try {
        const mcAuthResults = await getMcAuth();
        const serviceUrl = `${process.env.MC_REST_BASE_URI}${MC_CONTENT_CATEGORIES_API_PATH}${folderId}`;
        const res = await fetch(serviceUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${mcAuthResults.access_token}`
            },
        });
        
        const response = await res.json();
    
        if (response && response.id == folderId) {
            return folderId;
        } else {
            mcFolderRes = await getFolderIdFromServer();
            if (mcFolderRes && mcFolderRes.id ) {
                return mcFolderRes.id
            }
            
        }
    } catch (error) {
        console.log('Error in folder id:', error);
        return folderId;
    }
}

async function updateCallbackUrl(appName, folderId = '') {
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


        const resQuery = await org.query({ query: FETCH_CMS_FOLDER_DETAIL_QUERY });

        if (resQuery && resQuery.records && resQuery.records.length) {
            let sobject = resQuery.records[0];
            console.log('resQuery', sobject._fields);
            if (sobject._fields.connection_status__c === null
                || sobject._fields.connection_status__c === ALLOWED_CONNECTION_STATUS
                || sobject._fields.sfmc_folder_id__c != folderId
                || sobject._fields.heroku_endpoint__c != appName) {

                if (appName) {
                    sobject.set('Heroku_Endpoint__c', appName);
                    sobject.set('Connection_Status__c', CONNETION_STATUS);
                }

                sobject.set('SFMC_Folder_Id__c', folderId);
                console.log('Updating Salesforce CMS Connection Details:', sobject._fields);
                await org.update({ sobject, oauth });
            }

        }
    } catch (error) {
        console.log(error);
    }
}

async function getFolderId() {
    const folderName = process.env.MC_FOLDER_NAME; // Env folder name
    const mcAuthResults = await getMcAuth();
    const mcFolders = await getMcFolders(mcAuthResults.access_token); // Getting all folders
    const matchedFolder = [...mcFolders.items].find(ele => ele.name === folderName); // Check is folder already created or not
    if (!matchedFolder) {
        //Create folder in MC
        const parentFolder = [...mcFolders.items].find(ele => ele.parentId === 0);
        if (parentFolder && parentFolder.id) {
            console.log("Folder is being created");
            const createdFolder = await createMcFolder(parentFolder.id, mcAuthResults.access_token);
            return createdFolder ? createdFolder.id : null;
        }
    } else {
        return matchedFolder.id;
    }
}


async function getFolderIdFromServer() {
    const folderName = process.env.MC_FOLDER_NAME || 'CMS-SFMC-Connector'; // Env folder name
    const mcAuthResults = await getMcAuth();
    if(mcAuthResults && mcAuthResults.access_token){
        const mcFolders = await getMcFolders(mcAuthResults.access_token); // Getting all folders

        if(mcFolders && mcFolders.items){
            const matchedFolder = [...mcFolders.items].find(ele => ele.name === folderName); // Check is folder already created or not
            if (!matchedFolder) {
                //Create folder in MC
                const parentFolder = [...mcFolders.items].find(ele => ele.parentId === 0);
                if (parentFolder && parentFolder.id) {
                    console.log("Folder is being created");
                    const createdFolder = await createMcFolder(parentFolder.id, mcAuthResults.access_token);
                    const id = createdFolder ? createdFolder.id : null;
                    const status = 200;
                    return { id, status };
                }
            } else {
                const id = matchedFolder.id ? matchedFolder.id : null;
                const status = 200;
                return { id, status };
            }
        }else{
            return { status: 500, errorMsg: 'Marketing cloud folder creation failed.' };
        }
    }else{
        return { status: 500, errorMsg: 'Marketing cloud authentication failed.' };
    }
   
}


// Initialize the app.

// Initialize the app.
app.listen(process.env.PORT || 3000, async function () {
    //Get App Ul
    const appUrl = `https://${process.env.APP_NAME}.herokuapp.com`;
    console.log("appName >>> ", appUrl);
    if (appUrl) {
        //Get MC Folder Id
        const mcFolderRes = await getFolderIdFromServer();

        console.log('MC Folder Id:', mcFolderRes);
        if (mcFolderRes && mcFolderRes.id ) {
            //Update call back url and mc folder id
            updateCallbackUrl(appUrl, mcFolderRes.id);
        }else if(mcFolderRes && mcFolderRes.errorMsg){
            console.log('Error msg:', mcFolderRes.errorMsg);
        }
    }
});