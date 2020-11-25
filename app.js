var express = require("express");
var bodyParser = require("body-parser");
var nforce = require("nforce");
var hbs = require('hbs');
var dotenv = require("dotenv").config();

const {run, getMcFolders, createMcFolder, getMcAuth} = require('./src/mcUtils.js');

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
    /*if (isLocal) {
        require("dotenv").config();
    }*/
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

// Generic error handler used by all endpoints.
//handleError(res, "Invalid user input", "Please enter the Name.", 400); 
function handleError(res, reason, message, code) {
    console.log("ERROR: ", reason);
    res.status(code || 500).json({
        error: message
    });
}

app.get("/setup", function (req, res) {
    res.render("setup", {
        isLocal: isLocal,
        oauthCallbackUrl: oauthCallbackUrl(req),
        herokuApp: herokuApp,
    });
});

app.get("/", async function (req, res) {
    isLocal = req.hostname.indexOf("localhost") == 0;
    if (req.hostname.indexOf(".herokuapp.com") > 0) {
        herokuApp = req.hostname.replace(".herokuapp.com", "");
    }

    const channelId = '0apL00000004COkIAM';
    const contentType = [{
        "Id": "0T1L00000004K6vKAE",
        "MasterLabel": "Content Block",
        "DeveloperName": "ContentBlock"
    }, {
        "Id": "0T1L00000004K6HKAU",
        "MasterLabel": "Case Study Test Collection",
        "DeveloperName": "Case_Study_Test_Collection"
    }];
    const contentTypeNodes = [{
        "Id": "0T1L00000004K6vKAE",
        "MasterLabel": "Content Block",
        "DeveloperName": "ContentBlock",
        "managedContentNodeTypes": [{
            "nodeLabel": "Name",
            "nodeName": "Name",
            "assetTypeId": "0"
        }, {
            "nodeLabel": "Headline",
            "nodeName": "Headline",
            "assetTypeId": "196"
        }, {
            "nodeLabel": "Subheadline",
            "nodeName": "Subheadline",
            "assetTypeId": "196"
        }, {
            "nodeLabel": "Image",
            "nodeName": "Image",
            "assetType": "8"
        }]
    }, {
        "Id": "0T1L00000004K6HKAU",
        "MasterLabel": "Case Study Test Collection",
        "DeveloperName": "Case_Study_Test_Collection",
        "managedContentNodeTypes": [{
            "nodeLabel": "Case Study Title",
            "nodeName": "Title",
            "assetType": "0"
        }, {
            "nodeLabel": "Case Study Description",
            "nodeName": "Case_Study_Description",
            "assetType": "196"
        }]
    }];

    if (isSetup()) {
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

            await run(resp, org, contentTypeNodes, channelId);
            res.send('CMS Content Type is syncing in the background. Please wait..');
        } catch (error) {
            res.send(error.message);
        }
    } else {
        res.redirect("/setup");
    }
});

app.post('/', async (req, res, next) => {
    try {
        isLocal = req.hostname.indexOf("localhost") == 0;
        if (req.hostname.indexOf(".herokuapp.com") > 0) {
            herokuApp = req.hostname.replace(".herokuapp.com", "");
        }

        if (isSetup()) {
            let { contentTypeNodes, contentType, channelId } = req.body;
            contentTypeNodes = JSON.parse(contentTypeNodes);

            //console.log('Request body:', contentTypeNodes);
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
                await run(resp, org, contentTypeNodes, channelId, res);
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




async function updateCallbackUrl(appName = '', folderId = '') {
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

        const query = `SELECT Id, Heroku_Endpoint__c FROM CMS_Connection__c WHERE Id = '${process.env.SF_CMS_CONNECTION_ID}' LIMIT 1`;
        let resQuery = await org.query({ query });
        if (resQuery && resQuery.records && resQuery.records.length) {
            let sobject = resQuery.records[0];
            sobject.set('Heroku_Endpoint__c', appName);
            sobject.set('Connection_Status__c', 'Active');
            sobject.set('SFMC_Folder_Id__c', folderId);
            console.log(sobject)
            const resUpdate = await org.update({ sobject, oauth });

            console.log('resUpdate', resUpdate);
        }

    } catch (error) {
        console.log(error);
    }
}

async function getFolderId(){
    const folderName = process.env.MC_FOLDER_NAME; // Env folder name
    const mcAuthResults = await getMcAuth(); 
    const mcFolders = await getMcFolders(mcAuthResults.access_token); // Getting all folders
    const matchedFolder = [...mcFolders.items].find(ele => ele.name === folderName); // Check is folder already created or not
    if(!matchedFolder){
        //TODO create folder in mc
        const parentFolder = [...mcFolders.items].find(ele => ele.parentId === 0);
        if(parentFolder && parentFolder.id){
            const createdFolder =  await createMcFolder(parentFolder.id, mcAuthResults.access_token);
            console.log("createdFolder >>> ", createdFolder);
            return createdFolder ? createdFolder.id :  null;
        }
    }else{
        return matchedFolder.id;
    }
}

// Initialize the app.
app.listen(process.env.PORT || 3000, async function () {
    //Get App Ul
    const appUrl = `https://${process.env.APP_NAME}.herokuapp.com`;
    console.log("appName >>> ", appUrl);    
    if(appUrl){
        //Get MC Folder Id
        const mcFolderId = await getFolderId();
        console.log('getFolderId', mcFolderId);
        if(mcFolderId){
            //Update call back url and mc folder id
            updateCallbackUrl(appUrl, mcFolderId);    
        }
    }
});
