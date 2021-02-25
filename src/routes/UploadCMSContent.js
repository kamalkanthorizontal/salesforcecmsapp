const nforce = require("nforce");

const { run } = require('../mcUtils.js');
const { updateSfRecord, isSetup, oauthCallbackUrl } = require('../utils/utils');
const { getFolderIdFromServer, getFolderId } = require('../utils/folderId');

const { CONSUMER_KEY, CONSUMER_SECRET, SF_API_VERSION, SF_ENVIRONMENT, SF_USERNAME, SF_PASSWORD, SF_SECURITY_TOKEN } = process.env;

const { MC_AUTH_FAILED_MSG, SF_AUTH_FAILED_MSG } = require('../constants');

const whitelistUserAgent = 'SFDC';

module.exports = (app) => {
    app.post('/uploadCMSContent', async (req, res, next) => {

        if (req.headers['user-agent'] && req.headers['user-agent'].includes(whitelistUserAgent)) {
            try {
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
                                clientId: CONSUMER_KEY,
                                clientSecret: CONSUMER_SECRET,
                                redirectUri: oauthCallbackUrl(req),
                                apiVersion: SF_API_VERSION,
                                mode: "single",
                                environment: SF_ENVIRONMENT,
                                autoRefresh: true
                            });
    
                            const resp = await org.authenticate({
                                username: SF_USERNAME,
                                password: SF_PASSWORD,
                                securityToken: SF_SECURITY_TOKEN
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
        } else {
            res.send('Invalid request.');
        }
    });

    /**
     * Method is use to validate marketing folder id.
     * @param {*} mcFolderId 
     */

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



}