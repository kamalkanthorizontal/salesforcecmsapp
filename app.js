var express = require("express");
var bodyParser = require("body-parser");
var nforce = require("nforce");
const fetch = require('node-fetch');

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

let app = express();
app.enable('trust proxy');
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json());

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
        isNotBlank(process.env.SF_ENVIRONMENT) &&
        isNotBlank(process.env.SF_USERNAME) &&
        isNotBlank(process.env.SF_PASSWORD) &&
        isNotBlank(process.env.SF_SECURITY_TOKEN) &&
        isNotBlank(process.env.SF_API_VERSION) &&
        isNotBlank(process.env.SF_CMS_CONNECTION_ID) &&
        isNotBlank(process.env.SF_CMS_URL) &&
        isNotBlank(process.env.MC_CLIENT_ID) &&
        isNotBlank(process.env.MC_CLIENT_SECRET) &&
        isNotBlank(process.env.MC_AUTHENTICATION_BASE_URI) &&
        isNotBlank(process.env.MC_REST_BASE_URI) &&
        isNotBlank(process.env.MC_FOLDER_NAME)
    );
}

function oauthCallbackUrl(req) {
    return req.protocol + "://" + req.get("host");
}
// Kick off a new job by adding it to the work queue
app.get('/jobs', async (req, res) => {
    res.json({ jobs: jobs() });
});

// Kick off a new job by adding it to the work queue
app.get('/', async (req, res) => {
    res.send('Welcome to CMS SFMC Sync Heroku App.');
});

app.get("/queue", async function (req, res) {
    const { cmsConnectionId, channelId } = req.query;
    if (process.env.SF_CMS_CONNECTION_ID === cmsConnectionId) {
        res.sendFile('./queue.html', { root: __dirname });
    } else {
        res.send('Required fields not found.');
    }
})

app.post('/uploadCMSContent', async (req, res, next) => {
    try {
        const origin = req.get('origin');

        isLocal = req.hostname.indexOf("localhost") == 0;
        if (req.hostname.indexOf(".herokuapp.com") > 0) {
            herokuApp = req.hostname.replace(".herokuapp.com", "");
        }

        let { contentTypeNodes, channelId, channelName, mcFolderId, source } = req.body;

        if (!contentTypeNodes || !channelId || !channelName || !source) {
            res.send('Required fields not found.');
        }

        if (isSetup()) {

            mcFolderId = await checkFolderId(mcFolderId);

            if (mcFolderId) {
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

                    if (resp.access_token) {
                        run(resp, org, contentTypeNodes, channelId, channelName, mcFolderId, source);
                        res.send('CMS Content Type is syncing in the background. Please wait..');
                    } else {
                        console.log(SF_AUTH_FAILED_MSG);
                    }
                } catch (error) {
                    res.send(error.message);
                }
            } else {
                updateSfRecord(null, null, MC_AUTH_FAILED_MSG);
                res.send(MC_AUTH_FAILED_MSG);
            }

        } else {
            res.send('Required environment variables not found.');
        }
    } catch (error) {
        res.send(error.message);
    }
});

async function checkFolderId(mcFolderId) {
    let validFolderId;
    if (mcFolderId) {
        const resFolderId = await getFolderId(mcFolderId);
        if (resFolderId && resFolderId.id) {
            validFolderId = resFolderId.id;
        } else if (resFolderId && resFolderId.status === 401) {
            return null;
        }
    }

    if (!validFolderId) {
        mcFolderRes = await getFolderIdFromServer();
        if (mcFolderRes && mcFolderRes.id) {
            validFolderId = mcFolderRes.id;
        } else if (mcFolderRes && mcFolderRes.status === 401) {
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
            return { id: folderId };
        } else {
            mcFolderRes = await getFolderIdFromServer();
            if (mcFolderRes && mcFolderRes.id) {
                return { id: mcFolderRes.id };
            } else if (mcFolderRes && mcFolderRes.status == 401) {
                return { status: 401, errorMsg: MC_AUTH_FAILED_MSG };
            }
        }
    } catch (error) {
        console.log('Error in folder id:', error);
        return folderId;
    }
}

async function getFolderIdFromServer() {
    try {
        const folderName = process.env.MC_FOLDER_NAME || 'CMS SFMC Sync Folder'; // Env folder name
        const mcAuthResults = await getMcAuth();
        if (mcAuthResults && mcAuthResults.access_token) {
            const mcFolders = await getMcFolders(mcAuthResults.access_token); // Getting all folders

            if (mcFolders && mcFolders.items) {
                const matchedFolder = [...mcFolders.items].find(ele => ele.name === folderName); // Check is folder already created or not
                if (!matchedFolder) {
                    //Create folder in MC
                    const parentFolder = [...mcFolders.items].find(ele => ele.parentId === 0);
                    if (parentFolder && parentFolder.id) {
                        const createdFolder = await createMcFolder(parentFolder.id, mcAuthResults.access_token);
                        if (createdFolder.errorcode) {
                            return { status: 500, errorMsg: `Error in folder creation: ${createdFolder.message}` };
                        } else {
                            const id = createdFolder ? createdFolder.id : null;
                            const status = 200;
                            return { id, status };
                        }
                    } else {
                        return { status: 500, errorMsg: MC_NO_PARENT_FOLDER_MSG };
                    }
                } else {
                    const id = matchedFolder.id ? matchedFolder.id : null;
                    const status = 200;
                    return { id, status };
                }
            } else {
                return { status: 500, errorMsg: MC_FOLDER_CREATION_FAILED_MSG };
            }
        } else {
            return { status: 401, errorMsg: MC_AUTH_FAILED_MSG };
        }
    } catch (error) {
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
        console.log(`Launching Heroku App with URL ${appUrl} and MC Folder Id:`, mcFolderRes);
        if (mcFolderRes && mcFolderRes.id) {
            //Update call back url and mc folder id
            updateSfRecord(appUrl, mcFolderRes.id);
        } else if (mcFolderRes && mcFolderRes.errorMsg) {
            updateSfRecord(null, null, mcFolderRes.errorMsg);
        }
    }
});
