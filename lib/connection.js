var nforce = require('nforce');
require('dotenv').config();

/**
 *  Initialise connection parameters for Salesforce Connected App
 */
const org = nforce.createConnection({
    clientId: process.env.CONSUMER_KEY,
    clientSecret: process.env.CONSUMER_SECRET,
    redirectUri: 'http://localhost:3000', //process.env.CALLBACK_URL,
    //apiVersion: 'v34.0',  // optional, defaults to current salesforce API version
    environment: 'sandbox', // optional, salesforce 'sandbox' or 'production', production default
    mode: 'single', // optional, 'single' or 'multi' user mode, multi default
    autoRefresh: true
});

module.exports = async function () {
    return await authenticate();
};

async function authenticate() {
    return new Promise((resolve, reject) => {
        // Authenticate using multi user mode
        org.authenticate({
                username: process.env.USERNAME,
                password: process.env.PASSWORD,
                securityToken: process.env.SECURITYTOKEN
            },
            (error, response) => {
                if (!error) {
                    resolve(response)
                } else {
                    reject(error)
                }
            }
        )
    });
}
