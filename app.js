var express = require("express");
var bodyParser = require("body-parser");
const cors = require('cors');

var dotenv = require("dotenv").config();
var path = require('path');

const { updateSfRecord, } = require('./src/utils/utils');
const { getFolderIdFromServer } = require('./src/utils/folderId');


const helmet = require("helmet");

const { ENV_URL, IMAGE_CDN } = process.env;

const corsDomains = ENV_URL.split(',');
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
};
/*
 * CONFIGURE EXPRESS SERVER
 */

let app = express();
app.enable('trust proxy');
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(cors(corsOptions));
app.use(express.static(__dirname + '/client/build'));
app.disable('x-powered-by');
app.use(helmet.hidePoweredBy())
app.use((req, res, next) => {
  res.set('Cache-Control','public', 'no-cache, no-store, must-revalidate');
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
  res.set( 'x-powered-by', false );
  res.set('Content-Security-Policy',   `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *.google-analytics.com *.googletagmanager.com tagmanager.google.com; object-src 'none'; style-src 'self' 'unsafe-inline' *.typekit.net tagmanager.google.com fonts.googleapis.com; img-src 'self' data: *.google-analytics.com *.googletagmanager.com *.sfmc-content.com ssl.gstatic.com www.gstatic.com ${IMAGE_CDN}; frame-ancestors 'none'; frame-src 'none'; font-src 'self' data: *.typekit.net fonts.gstatic.com; connect-src 'self' *.google-analytics.com *.g.doubleclick.net;`);
  res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.set('Strict-Transport-Security', 'max-age=200'); 
  res.set('X-Content-Security-Policy', `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *.google-analytics.com *.googletagmanager.com tagmanager.google.com; object-src 'none'; style-src 'self' 'unsafe-inline' *.typekit.net tagmanager.google.com fonts.googleapis.com; img-src 'self' data: *.google-analytics.com *.googletagmanager.com *.sfmc-content.com ssl.gstatic.com www.gstatic.com ${IMAGE_CDN}; frame-ancestors 'none'; frame-src 'none'; font-src 'self' data: *.typekit.net fonts.gstatic.com; connect-src 'self' *.google-analytics.com *.g.doubleclick.net;`);
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'deny');
  res.set('X-WebKit-CSP', `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' *.google-analytics.com *.googletagmanager.com tagmanager.google.com; object-src 'none'; style-src 'self' 'unsafe-inline' *.typekit.net tagmanager.google.com fonts.googleapis.com; img-src 'self' data: *.google-analytics.com *.googletagmanager.com *.sfmc-content.com ssl.gstatic.com www.gstatic.com ${IMAGE_CDN}; frame-ancestors 'none'; frame-src 'none'; font-src 'self' data: *.typekit.net fonts.gstatic.com; connect-src 'self' *.google-analytics.com *.g.doubleclick.net;`);
  res.set('X-XSS-Protection', '1; mode=block');
  res.set('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
  res.set('Access-Control-Allow-Credentials', 'true');
  next();
});



/*let app = express();
app.enable('trust proxy');
app.use(express.static(__dirname + "/public"));
app.use(bodyParser.json());
app.use(cors());

app.use((req, res, next) => {
    res.set('Cache-Control', 'no-cache');
    res.set('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.set('Strict-Transport-Security', 'max-age=200');
    res.set('X-Powered-By', '');
    res.set('X-XSS-Protection', '1; mode=block');
    next();
});
*/



// Kick off a new job by adding it to the work queue
app.get('/', async (req, res) => {
    res.send('Welcome to CMS Connect Heroku App.');
});

require('./src/routes/UploadCMSContent')(app);
require('./src/routes/Jobs')(app);
require('./src/routes/Queue')(app);

// Initialize the app.
app.listen(process.env.PORT || 3000, async function () {
    //Get App Ul
    const appUrl = `https://${process.env.APP_NAME}.herokuapp.com`;
    console.log('appUrl', appUrl);
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
