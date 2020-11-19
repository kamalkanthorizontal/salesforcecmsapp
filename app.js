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
    //const managedContentType = 'ContentBlock';
    const managedContentType = 'cms_image';

    //const cmsURL = `/services/data/v48.0/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&page=0&pageSize=3&showAbsoluteUrl=true`;

    const cmsURL = `/services/data/v48.0/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&showAbsoluteUrl=true`;
    console.log('cmsURL', cmsURL);
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
    
            const result = await org.getUrl(cmsURL); 
            console.log("Salesforce Result: ", result);
            await run(result, resp);
            res.send('sent');

        }catch(error){
            res.send(error.message);
        }
       

        /*org.authenticate({
            username: process.env.SF_USERNAME,
            password: process.env.SF_PASSWORD,
            securityToken: process.env.SF_SECURITY_TOKEN
        }, async function (err, resp) {
            if (!err) {
               console.log("Salesforce Response: ", resp);

                try {
                    const result = await org.getUrl(cmsURL); 
                    console.log("Salesforce Result: ", result);
                    await run(result, resp);
                    res.send('sent');
                } catch(error) {
                    res.send(error.message);
                }
            } else {
                res.send(err.message);
            }
        });*/
    } else {
        res.redirect("/setup");
    }
});

app.post('/', async (req, res, next) => {
    
    isLocal = req.hostname.indexOf("localhost") == 0;
    console.log('isLocal', isLocal);
    if (req.hostname.indexOf(".herokuapp.com") > 0) {
        herokuApp = req.hostname.replace(".herokuapp.com", "");
    }
    
    
    console.log(req.body);
    const { contentTypeNodes, contentType, channelId } = req.body;

    

    //const cmsURL = `/services/data/v48.0/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&page=0&pageSize=3&showAbsoluteUrl=true`;

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
    
            let results = [];
            contentType.forEach(async(ele) =>{
                const managedContentType = ele.DeveloperName;
                const cmsURL = `/services/data/v48.0/connect/cms/delivery/channels/${channelId}/contents/query?managedContentType=${managedContentType}&showAbsoluteUrl=true`;
                console.log('cmsURL', cmsURL);            
                // const result = await org.getUrl(cmsURL); 
                // results = [...results, result];
                
            });
            console.log("Salesforce Result: ", results); 
            if(results && results.length>0){
                await run(results, resp);
            }
            

            res.send('sent');
            
        }catch(error){
            res.send(error.message);
        }
    } else {
        res.redirect("/setup");
    }
});







// Initialize the app.
var server = app.listen(process.env.PORT || 3000, function () {
    var port = server.address().port;
    console.log(`App now running on port: ${port}`);
});
