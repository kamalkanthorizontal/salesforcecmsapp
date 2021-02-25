const https = require('https');
const nforce = require("nforce");
var dotenv = require("dotenv").config();
var path = require('path');


const {
    SF_CMS_CONNECTION_SOQL,
    SF_AUTH_FAILED_MSG,
    ALLOWED_CONNECTION_STATUS,
    CONNETION_STATUS,
    CONNETION_FAILED_STATUS,
    SF_INCORRECT_CMS_CONNECTION_ID_MSG
} = require('../constants');

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

async function downloadBase64FromURL(url, access_token, callback) {
   return new Promise((resolve, reject) => {
        https
            .get(
                url,
                { headers: { Authorization: 'Bearer ' + access_token } },
                (resp) => {
                    if (resp) {
                        resp.setEncoding('base64');
                        body = "data:" + resp.headers["content-type"] + ";base64,";
                        resp.on('data', (data) => { body += data});

                        let imageBody = '';
                        resp.on('data', (data) => {
                            imageBody += data;
                        });
                        resp.on('end', () => {
                            resolve(imageBody);
                        });
                    } else {
                        reject(`Got error: Base 64 creation`);
                    }

                }
            )
            .on('error', (e) => {
                reject(`Got error: ${e.message}`);
            });
    });
}


function isNotBlank(val) {
    if (typeof val !== 'undefined' && val) {
        return true;
    };
    return false;
}


module.exports = {
    getImageAssetTypeId: function (imageExtension) {
        return getImageAssetTypeId(imageExtension);
    },
    getDocumentAssetTypeId: function (docExtension) {
        return getDocumentAssetTypeId(docExtension);
    },
    downloadBase64FromURL: async function (url, access_token, callback) {
        return await downloadBase64FromURL(url, access_token, callback)
    },
    oauthCallbackUrl: function (request) {
        return request.protocol + "://" + request.get("host");
    },
    validateUrl: function (url) {
        const lastChar = url[url.length - 1];
        return lastChar === '/' ? url.substring(0, url.length - 1) : url;
    },
    updateSfRecord: async function (appName, folderId, mcError, dateTime) {
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

            if (org && oauth) {
                const resQuery = await org.query({ query: SF_CMS_CONNECTION_SOQL });

                if (resQuery && resQuery.records && resQuery.records.length) {

                    let sobject = resQuery.records[0];

                    if (mcError) {
                        sobject.set('Connection_Status__c', CONNETION_FAILED_STATUS);
                        sobject.set('Error_Message__c', mcError);
                    } else if (!mcError && dateTime) {
                        console.log('Updating SF Last Sync Time:', new Date().toISOString())
                        sobject.set('Connection_Status__c', CONNETION_STATUS);
                        sobject.set('Error_Message__c', '');
                        sobject.set('Last_Synchronized_Time__c', new Date().toISOString());
                    } else if (!mcError && !dateTime && (sobject._fields.connection_status__c === null
                        || sobject._fields.connection_status__c === ALLOWED_CONNECTION_STATUS
                        || sobject._fields.connection_status__c === CONNETION_FAILED_STATUS
                        || sobject._fields.sfmc_folder_id__c != folderId
                        || sobject._fields.heroku_endpoint__c != appName)) {

                        if (appName) {
                            sobject.set('Heroku_Endpoint__c', appName);
                        }
                        sobject.set('Connection_Status__c', CONNETION_STATUS);
                        sobject.set('Error_Message__c', '');
                        sobject.set('SFMC_Folder_Id__c', folderId);
                    }
                    await org.update({ sobject, oauth });
                } else {
                    console.log(SF_INCORRECT_CMS_CONNECTION_ID_MSG);
                }
            } else {
                console.log(SF_AUTH_FAILED_MSG);
            }
        } catch (err) {
            console.log('Error in salesforce authentication:', err ? err.body ? err.body : err : 'Unknown error');
        }
    },

    isSetup: function() {
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
    },
    oauthCallbackUrl: function(req) {
        return req.protocol + "://" + req.get("host");
    }
}
