var express = require("express");
var bodyParser = require("body-parser");
var nforce = require("nforce");

const run = require('./src/mcUtils');


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


app.get("/setup", function (req, res) {
    res.render("setup", {
        isLocal: isLocal,
        oauthCallbackUrl: oauthCallbackUrl(req),
        herokuApp: herokuApp,
    });
});

app.get("/", async function (req, res) {
    var oauth;
    isLocal = req.hostname.indexOf("localhost") == 0;
    console.log('isLocal', isLocal);
    if (req.hostname.indexOf(".herokuapp.com") > 0) {
        herokuApp = req.hostname.replace(".herokuapp.com", "");
    }

    const channelId = '0apL00000004COkIAM';
    const contentType = [{"Id":"0T1L00000004K6vKAE","MasterLabel":"Content Block","DeveloperName":"ContentBlock"}];
    const contentTypeNodes = [{
        "Id": "0T1L00000004K6vKAE",
        "MasterLabel": "Content Block",
        "DeveloperName": "ContentBlock",
        "managedContentNodeTypes": [{
            "nodeLabel": "Name",
            "nodeName": "Name",
            "assetType": "0"
        }, {
            "nodeLabel": "Headline",
            "nodeName": "Headline",
            "assetType": "15"
        }, {
            "nodeLabel": "Subheadline",
            "nodeName": "Subheadline",
            "assetType": "15"
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
            "assetType": "15"
        }]
    }];
    //const managedContentType = 'ContentBlock';
    //const managedContentType = 'cms_image';

    //const cmsURL = `/services/data/v48.0/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&page=0&pageSize=3&showAbsoluteUrl=true`;

   // const cmsURL = `/services/data/v48.0/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&showAbsoluteUrl=true`;
    //console.log('cmsURL', cmsURL);
    //console.log(isLocal + '>>>' + herokuApp);
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

        try{
            const resp =  await org.authenticate({
                username: process.env.SF_USERNAME,
                password: process.env.SF_PASSWORD,
                securityToken: process.env.SF_SECURITY_TOKEN
            });
            console.log("Salesforce Response: ", resp);
           
            await run(resp, org, contentTypeNodes, channelId);

            /*let results = [];
                await Promise.all(contentTypeNodes.map(async (ele) => {
                    const managedContentType = ele.DeveloperName;
                    const managedContentNodeTypes = ele.managedContentNodeTypes;
                    const cmsURL = `/services/data/v48.0/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&showAbsoluteUrl=true`;
                    console.log('cmsURL', cmsURL);            
                    let result = await org.getUrl(cmsURL); 
                    result.managedContentNodeTypes = managedContentNodeTypes;
                    console.log('result', result);  
                    results = [...results, result]; 
                }));
           
           // console.log("Salesforce Result: ", results); 
            if(results && results.length>0){
                await run(results, resp);
            }*/
            res.send('sent');
            
        }catch(error){
            res.send(error.message);
        }
       

       
    } else {
        res.redirect("/setup");
    }
});



app.post('/', async (req, res, next) => {
    try{
        isLocal = req.hostname.indexOf("localhost") == 0;
        console.log('isLocal', isLocal);
        if (req.hostname.indexOf(".herokuapp.com") > 0) {
            herokuApp = req.hostname.replace(".herokuapp.com", "");
        }
        
        
        console.log(req.body);
        let { contentTypeNodes, contentType, channelId } = req.body;
        
        contentTypeNodes = JSON.parse(contentTypeNodes);
        console.log(contentTypeNodes);
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
    
            try{
                const resp =  await org.authenticate({
                    username: process.env.SF_USERNAME,
                    password: process.env.SF_PASSWORD,
                    securityToken: process.env.SF_SECURITY_TOKEN
                });
                console.log("Salesforce Response: ", resp);
                await run(resp, org, contentTypeNodes, channelId);

                
                res.send('Upload process started');
                
            }catch(error){
                res.send(error.message);
            }
        } else {
            res.redirect("/setup");
        }
    }catch(error){
        res.send(error.message);
    }
    
    
});


// Initialize the app.
var server = app.listen(process.env.PORT || 3000, function () {
    var port = server.address().port;
    console.log(`App now running on port: ${port}`);
});
