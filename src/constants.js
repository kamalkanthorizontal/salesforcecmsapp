module.exports = {
    MC_ASSETS_API_PATH: '/asset/v1/content/assets',
    MS_AUTH_PATH: '/v2/token',
    MC_CONTENT_CATEGORIES_API_PATH: '/asset/v1/content/categories',
    MC_CONTENT_QUERY_API_PATH: '/asset/v1/content/assets/query',
    REDIS_URL: process.env.REDIS_URL || 'redis://127.0.0.1:6379',

    SF_CMS_CONNECTION_SOQL: `SELECT Id, Heroku_Endpoint__c, SFMC_Folder_Id__c, Connection_Status__c FROM CMS_Connection__c WHERE Id = '${process.env.SF_CMS_CONNECTION_ID}' LIMIT 1`,
    ALLOWED_CONNECTION_STATUS: 'Not Configured',
    CONNETION_STATUS: 'Active',
    CONNETION_FAILED_STATUS: 'Failed',

    MC_AUTH_FAILED_MSG: 'Marketing Cloud authentication failed. Please check environment variables in Heroku.',
    MC_FOLDER_CREATION_FAILED_MSG: 'Marketing Cloud folder creation failed. Please try again.',
    MC_NO_PARENT_FOLDER_MSG: 'No parent folder available in Marketing Cloud.',

    SF_AUTH_FAILED_MSG: 'Salesforce authentication failed. Please check environment variables in Heroku.',
    SF_INCORRECT_CMS_CONNECTION_ID_MSG: 'Please verify SF_CMS_CONNECTION_ID environment variable in Heroku.'
}
