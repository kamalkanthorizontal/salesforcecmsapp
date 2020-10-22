var express = require("express");
var bodyParser = require("body-parser");
var nforce = require("nforce");
var hbs = require('hbs');
const https = require('https');
var request = require('request');

var app = express();

app.set('view engine', 'hbs');
app.enable('trust proxy');

app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json());


const mc_assets_api_path = '/asset/v1/content/assets';

const marketingCloudAuthBody = {
    grant_type: 'client_credentials',
    client_id: process.env.MC_CLIENT_ID,
    client_secret: process.env.MC_CLIENT_SECRET,
};

async function getMcAuth() {
    return await fetch(MC_AUTHENTICATION_BASE_URI, {
            method: 'POST',
            body: JSON.stringify(marketingCloudAuthBody),

            headers: {
                'Content-Type': 'application/json'
            },
        })
        .then((res) => res.json()) // expecting a json response
        // .then((json) => console.log(json))
        .catch((err) => {
            console.log({
                err
            });
            reject(err);
        });
}

async function createMCAsset(access_token, assetBody) {
    return new Promise((resolve, reject) => {
        request.post(
            mc_host + mc_assets_api_path, {
                headers: {
                    Authorization: 'Bearer ' + access_token,
                },
                json: assetBody,
            },
            (error, res, body) => {
                if (error) {
                    console.error(error);
                    console.log({
                        assetBody
                    });
                    reject({
                        error
                    });
                } else {
                    console.log(`statusCode: ${res.statusCode}`);
                    console.log(body);
                    resolve(res);
                }
            }
        );
    });
}

async function moveTextToMC(name, title, mcAuthResults) {
    console.log(`Uploading text to MC: ${name} - ${title}`);

    let textAssetBody = {
        name: name,
        assetType: {
            id: 196,
        },
        content: title,
        category: {
            id: '6345',
            name: 'Content Builder',
            parentId: 0
        },
    };
    // Create MC Asset
    await createMCAsset(mcAuthResults.access_token, textAssetBody);
}

async function run(cmsContentResults) {
    let mcAuthResults = await getMcAuth();

    await cmsContentResults.items.forEach(async (content) => {
            console.log({
                content
            });

            await moveTextToMC(
                content.contentUrlName,
                content.title,
                mcAuthResults
            );
        })
        .then((res) => res.json()) // expecting a json response
        // .then((json) => console.log(json))
        .catch((err) => {
            console.log({
                err
            });
            reject(err);
        });
};


function isSetup(req) {
    if (req.hostname.indexOf("localhost") == 0) {
        require("dotenv").config();
    }
    return (
        process.env.CONSUMER_KEY != null && process.env.CONSUMER_SECRET != null
    );
}

function oauthCallbackUrl(req) {
    return req.protocol + "://" + req.get("host");
}

// Generic error handler used by all endpoints.
//handleError(res, "Invalid user input", "Please enter the Name.", 400); 
function handleError(res, reason, message, code) {
    console.log("ERROR: " + reason);
    res.status(code || 500).json({
        error: message
    });
}

app.get("/", function (req, res) {
    var url =
        "/services/data/v48.0/connect/cms/delivery/channels/0apL00000004CO6/contents/query?managedContentType=ContentBlock&page=0&pageSize=1";
    if (isSetup(req)) {
        //nforce setup to connect Salesforce
        var org = nforce.createConnection({
            clientId: process.env.CONSUMER_KEY,
            clientSecret: process.env.CONSUMER_SECRET,
            redirectUri: oauthCallbackUrl(req), //"https://APPNAME.herokuapp.com/oauth/_callback",
            //apiVersion: "v37.0", // optional, defaults to current salesforce API version
            mode: "single", // optional, 'single' or 'multi' user mode, multi default
            environment: "sandbox", // optional, salesforce 'sandbox' or 'production', production default,
            autoRefresh: true,
        });

        if (req.query.code !== undefined) {
            // authenticated
            org.authenticate(req.query, function (err) {
                if (!err) console.log("Cached Token: " + org.oauth.access_token);
                else console.log("Error: " + err.message);
                if (!err) {
                    org.getUrl(url, function (err, resp) {
                        if (!err) {
                            run(resp);
                            //if (resp.items && resp.items.length)
                            //res.type('json').send(JSON.stringify(resp.items, null, 2) + '\n');
                            //res.send(resp.items);
                        } else {
                            res.send(err.message);
                        }
                    });
                } else {
                    if (err.message.indexOf("invalid_grant") >= 0) {
                        res.redirect("/");
                    } else {
                        res.send(err.message);
                    }
                }
            });
        } else {
            res.redirect(org.getAuthUri());
        }
    } else {
        res.redirect("/setup");
    }
});

app.get("/setup", function (req, res) {
    if (isSetup()) {
        res.redirect("/");
    } else {
        var isLocal = req.hostname.indexOf("localhost") == 0;
        var herokuApp = null;
        if (req.hostname.indexOf(".herokuapp.com") > 0) {
            herokuApp = req.hostname.replace(".herokuapp.com", "");
        }
        res.render("setup", {
            isLocal: isLocal,
            oauthCallbackUrl: oauthCallbackUrl(req),
            herokuApp: herokuApp,
        });
    }
});

// Initialize the app.
var server = app.listen(process.env.PORT || 3000, function () {
    var port = server.address().port;
    console.log("App now running on port", port);
});
