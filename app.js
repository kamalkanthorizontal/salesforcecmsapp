var express = require("express");
var bodyParser = require("body-parser");
var nforce = require("nforce");
const fetch = require('node-fetch');
const cors = require('cors');

var hbs = require('hbs');
var dotenv = require("dotenv").config();
var path = require('path');

const { run, getMcFolders, createMcFolder, getMcAuth, jobs } = require('./src/mcUtils.js');
const { validateUrl, updateSfRecord } = require('./src/utils');

const { 
    MC_CONTENT_CATEGORIES_API_PATH, 
    MC_AUTH_FAILED_MSG,
    MC_FOLDER_CREATION_FAILED_MSG,
    SF_AUTH_FAILED_MSG

} = require('./src/constants');

var isLocal;
var herokuApp;

/*const corsDomains = ENV_URL.split(',');
const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl requests).
    if (!origin) return callback(null, true);

    // Block non-matching origins.
    if (corsDomains.indexOf(origin) === -1) {
      var msg = 'The CORS policy for this site does not allow access from the specified Origin.';

      return callback(new Error(msg), false);
    }

    return callback(null, true);
  },
};*/



let app = express();
app.set('view engine', 'hbs');
app.enable('trust proxy');
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json());
app.use(cors());



function isNotBlank(val) {
    if (typeof val !== 'undefined' && val) {
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
        isNotBlank(process.env.SF_ENVIRONMENT) &&
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
// Kick off a new job by adding it to the work queue
app.get('/jobs', async (req, res) => {
    res.json({ jobs: jobs() });
});



app.get("/setup", function (req, res) {
    res.render("setup", {
        isLocal: isLocal,
        oauthCallbackUrl: oauthCallbackUrl(req),
        herokuApp: herokuApp,
    });
});

// Kick off a new job by adding it to the work queue
app.get('/', async (req, res) => {
    res.send('Welcome to CMS content sync.');
});

app.get("/queue", async function (req, res) {
    const { cmsConnectionId, channelId } = req.query;
    console.log('cmsConnectionId--->',cmsConnectionId);
    console.log('channelId--->', channelId);
    console.log('origin--->', req.get('host'), req.get('origin'));
    if(process.env.SF_CMS_CONNECTION_ID === cmsConnectionId){
        res.sendFile('./queue.html', { root: __dirname });
    }else{
        res.send('Required fields not found.');
    }  
})

app.post('/uploadCMSContent', async (req, res, next) => {
    try {
        const origin = req.get('origin');
       // console.log('origin--->', origin);

        isLocal = req.hostname.indexOf("localhost") == 0;
        if (req.hostname.indexOf(".herokuapp.com") > 0) {
            herokuApp = req.hostname.replace(".herokuapp.com", "");
        }

        let { contentTypeNodes, channelId, mcFolderId, source, channelName } = req.body;

        if (!contentTypeNodes || !channelId || !source || !channelName) {  
            res.send('Required fields not found.');
        }

        if (isSetup()) {
            
            mcFolderId = await checkFolderId(mcFolderId);
            
            if(mcFolderId){
                contentTypeNodes = JSON.parse(contentTypeNodes);
                try {
                    //nforce setup to connect Salesforce
                    let org = nforce.createConnection({
                        clientId: process.env.CONSUMER_KEY,
                        clientSecret: process.env.CONSUMER_SECRET,
                        redirectUri: oauthCallbackUrl(req),
                        apiVersion: process.env.SF_API_VERSION,
                        mode: "single",
                        environment: process.env.SF_ENVIRONMENT,
                        autoRefresh: true
                    });
                    
                    const resp = await org.authenticate({
                        username: process.env.SF_USERNAME,
                        password: process.env.SF_PASSWORD,
                        securityToken: process.env.SF_SECURITY_TOKEN
                    });

                    console.log("Salesforce authentication :", resp.access_token ? 'Successful' : 'Failure');
                    
                    if(resp.access_token){
                        run(resp, org, contentTypeNodes, channelId, mcFolderId, source, channelName);
                        res.send('CMS Content Type is syncing in the background. Please wait..');
                    }else{
                        console.log(SF_AUTH_FAILED_MSG);
                    }                    
                } catch (error) {
                    res.send(error.message);
                }
            }else{
                updateSfRecord(null, null, MC_AUTH_FAILED_MSG);
                res.send(MC_AUTH_FAILED_MSG);
            }
            
        } else {
            res.redirect("/setup");
        }
    } catch (error) {
        res.send(error.message);
    }
});

async function checkFolderId(mcFolderId){
    let validFolderId;
    if (mcFolderId) {
        const resFolderId = await getFolderId(mcFolderId);
        if(resFolderId && resFolderId.id){
            validFolderId = resFolderId.id;
        }else if(resFolderId && resFolderId.status === 401){
            return null;
        }   
    }
    
    if (!validFolderId) {
        mcFolderRes = await getFolderIdFromServer();
        if(mcFolderRes && mcFolderRes.id){
            validFolderId = mcFolderRes.id;
        }else if(mcFolderRes && mcFolderRes.status === 401){
            return null;
        }   
    }

    if (validFolderId !== mcFolderId) {
        await updateSfRecord(null, validFolderId);
    }

    return validFolderId;
}

async function getFolderId(folderId) {
    try {
        const mcAuthResults = await getMcAuth();
        const serviceUrl = `${validateUrl(process.env.MC_REST_BASE_URI)}${MC_CONTENT_CATEGORIES_API_PATH}${folderId}`;
        const res = await fetch(serviceUrl, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${mcAuthResults.access_token}`
            },
        });
        
        const response = await res.json();
    
        if (response && response.id == folderId) {
            return {id: folderId};
        } else {
            mcFolderRes = await getFolderIdFromServer();
            if (mcFolderRes && mcFolderRes.id ) {
                return {id: mcFolderRes.id};
            }else if(mcFolderRes && mcFolderRes.status == 401){
                return {status: 401, errorMsg: MC_AUTH_FAILED_MSG};
            }
        }
    } catch (error) {
        console.log('Error in folder id:', error);
        return folderId;
    }
}


/*async function updateSfRecord(appName, folderId = '', error) {
    try {
        let org = nforce.createConnection({
            clientId: process.env.CONSUMER_KEY,
            clientSecret: process.env.CONSUMER_SECRET,
            redirectUri: process.env.SF_CMS_URL,
            apiVersion: process.env.SF_API_VERSION,
            mode: "single",
            environment: process.env.SF_ENVIRONMENT,
            autoRefresh: true
        });

        const oauth = await org.authenticate({
            username: process.env.SF_USERNAME,
            password: process.env.SF_PASSWORD,
            securityToken: process.env.SF_SECURITY_TOKEN
        });
        if(org && oauth){
            const resQuery = await org.query({ query: FETCH_CMS_FOLDER_DETAIL_QUERY });

            if (resQuery && resQuery.records && resQuery.records.length) {

                let sobject = resQuery.records[0];

                if(error){
                    sobject.set('Connection_Status__c', CONNETION_FAILED_STATUS);
                    sobject.set('Error_Message__c', error);
                    
                }else if (!error && sobject._fields.connection_status__c === null
                    || sobject._fields.connection_status__c === ALLOWED_CONNECTION_STATUS
                    || sobject._fields.sfmc_folder_id__c != folderId
                    || sobject._fields.heroku_endpoint__c != appName) {
    
                    if (appName) {
                        sobject.set('Heroku_Endpoint__c', appName);
                        sobject.set('Connection_Status__c', CONNETION_STATUS);
                    }
    
                    sobject.set('SFMC_Folder_Id__c', folderId);   
                }
                console.log('Updating Salesforce CMS Connection Details:', sobject._fields);

                await org.update({ sobject, oauth });

                
                console.log('resQuery', sobject._fields);
                
            }
        }else{
            console.log('Error in salesforce authentication: ', SF_AUTH_FAILED_MSG);
        }
    } catch (error) {
        console.log('Error in salesforce authentication: ', error);
    }
}*/

async function getFolderIdFromServer() {
    try{
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
                        const createdFolder = await createMcFolder(parentFolder.id, mcAuthResults.access_token);
                        if(createdFolder.errorcode){
                            return { status: 500, errorMsg: `Error in folder creation: ${createdFolder.message}` };
                        }else{
                            const id = createdFolder ? createdFolder.id : null;
                            const status = 200;
                            return { id, status };
                        }
                    }else{
                        return { status: 500, errorMsg: MC_NO_PARENT_FOLDER_MSG };
                    }
                } else {
                    const id = matchedFolder.id ? matchedFolder.id : null;
                    const status = 200;
                    return { id, status };
                }
            }else{
                return { status: 500, errorMsg: MC_FOLDER_CREATION_FAILED_MSG};
            }
        }else{
            return { status: 401, errorMsg: MC_AUTH_FAILED_MSG};
        }
    }catch(error){
        return { status: 500, errorMsg: `${error.message}` };
    }
    
   
}


// Initialize the app.
app.listen(process.env.PORT || 3000, async function () {
    //Get App Ul
    const appUrl = `https://${process.env.APP_NAME}.herokuapp.com`;
    if (appUrl) {
        //Get MC Folder Id
        const mcFolderRes = await getFolderIdFromServer();
        console.log('Launching heroku app --->', mcFolderRes, appUrl);
        if (mcFolderRes && mcFolderRes.id ) {
            //Update call back url and mc folder id
            updateSfRecord(appUrl, mcFolderRes.id);
        }else if(mcFolderRes && mcFolderRes.errorMsg){
            updateSfRecord(null, null, mcFolderRes.errorMsg);
        }
    }
});
