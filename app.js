var express = require("express");
var bodyParser = require("body-parser");
var nforce = require("nforce");
var hbs = require('hbs');
var dotenv = require("dotenv").config();

const run = require('./src/mcUtils');

var isLocal;
var herokuApp;

var app = express();
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
        isNotBlank(process.env.API_VERSION) &&
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

    //const cmsURL = `/services/data/v48.0/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&page=0&pageSize=3&showAbsoluteUrl=true`;
    //const cmsURL = `/services/data/v48.0/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&showAbsoluteUrl=true`;
    //console.log('cmsURL', cmsURL);

    if (isSetup()) {
        //nforce setup to connect Salesforce
        let org = nforce.createConnection({
            clientId: process.env.CONSUMER_KEY,
            clientSecret: process.env.CONSUMER_SECRET,
            redirectUri: oauthCallbackUrl(req), //"https://APPNAME.herokuapp.com/oauth/_callback",
            //apiVersion: "v37.0", // optional, defaults to current salesforce API version
            mode: "single", // optional, 'single' or 'multi' user mode, multi default
            environment: "sandbox", // optional, salesforce 'sandbox' or 'production', production default,
            autoRefresh: true
        });

        try {
            const resp = await org.authenticate({
                username: process.env.SF_USERNAME,
                password: process.env.SF_PASSWORD,
                securityToken: process.env.SF_SECURITY_TOKEN
            });
            console.log("Salesforce access:", resp.access_token ? 'Successful' : 'Failure');

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

            console.log(contentTypeNodes);
            //nforce setup to connect Salesforce
            let org = nforce.createConnection({
                clientId: process.env.CONSUMER_KEY,
                clientSecret: process.env.CONSUMER_SECRET,
                redirectUri: oauthCallbackUrl(req), //"https://APPNAME.herokuapp.com/oauth/_callback",
                //apiVersion: "v37.0", // optional, defaults to current salesforce API version
                mode: "single", // optional, 'single' or 'multi' user mode, multi default
                environment: "sandbox", // optional, salesforce 'sandbox' or 'production', production default,
                autoRefresh: true
            });

            try {
                const resp = await org.authenticate({
                    username: process.env.SF_USERNAME,
                    password: process.env.SF_PASSWORD,
                    securityToken: process.env.SF_SECURITY_TOKEN
                });
                console.log("Salesforce access:", resp.access_token ? 'Successful' : 'Failure');
                await run(resp, org, contentTypeNodes, channelId);
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

// Initialize the app.
var server = app.listen(process.env.PORT || 3000, function () {
    var port = server.address().port;
    console.log(`App now running on port: ${port}`);
});
