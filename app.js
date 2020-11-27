var express = require("express");
var bodyParser = require("body-parser");
var nforce = require("nforce");
var hbs = require('hbs');
var dotenv = require("dotenv").config();
var path = require('path');
const { run, getMcFolders, createMcFolder, getMcAuth, jobs } = require('./src/mcUtils.js');

var isLocal;
var herokuApp;

let app = express();
app.set('view engine', 'hbs');
app.enable('trust proxy');
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json());

const ALLOWED_CONNECTION_STATUS = 'Not Configured';

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

// Kick off a new job by adding it to the work queue
app.get('/jobs', async (req, res) => {
    res.json({ jobs: jobs() });
});


app.get("/queue", async function (req, res) {
    console.log('jobs', jobs());
    //res.render("queue.ejs");
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
            // console.log('mcFolderId--->', mcFolderId);
            // console.log('contentTypeNodes--->', contentTypeNodes);

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
                await run(resp, org, contentTypeNodes, channelId, mcFolderId);
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

        const query = `SELECT Id, Heroku_Endpoint__c, SFMC_Folder_Id__c, Connection_Status__c FROM CMS_Connection__c WHERE Id = '${process.env.SF_CMS_CONNECTION_ID}' LIMIT 1`;
        const resQuery = await org.query({ query });

        if (resQuery && resQuery.records && resQuery.records.length) {
            let sobject = resQuery.records[0];
            console.log('resQuery', sobject._fields);
            if (sobject._fields.connection_status__c === null
                || sobject._fields.connection_status__c === ALLOWED_CONNECTION_STATUS
                || sobject._fields.sfmc_folder_id__c != folderId
                || sobject._fields.heroku_endpoint__c != appName) {
                sobject.set('Heroku_Endpoint__c', appName);
                sobject.set('Connection_Status__c', 'Active');
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

// Initialize the app.
app.listen(process.env.PORT || 3000, async function () {
    //Get App Ul
    const appUrl = `https://${process.env.APP_NAME}.herokuapp.com`;
    console.log("appName >>> ", appUrl);
    if (appUrl) {
        //Get MC Folder Id
        const mcFolderId = await getFolderId();
        console.log('MC Folder Id:', mcFolderId);
        if (mcFolderId) {
            //Update call back url and mc folder id
            updateCallbackUrl(appUrl, mcFolderId);
        }
    }
});
