module.exports = {
    MC_ASSETS_API_PATH :'/asset/v1/content/assets',
    MS_AUTH_PATH : '/v2/token',
    MC_CONTENT_CATEGORIES_API_PATH : '/asset/v1/content/categories',
    REDIS_URL : process.env.REDIS_URL || 'redis://127.0.0.1:6379',


    FETCH_CMS_FOLDER_DETAIL_QUERY:`SELECT Id, Heroku_Endpoint__c, SFMC_Folder_Id__c, Connection_Status__c FROM CMS_Connection__c WHERE Id = '${process.env.SF_CMS_CONNECTION_ID}' LIMIT 1`,
    ALLOWED_CONNECTION_STATUS : 'Not Configured',
    CONNETION_STATUS: 'Active',
    CONNETION_FAILED_STATUS: 'Failed',

    MC_AUTH_FAILED_MSG: 'Marketing cloud authentication failed. Please check environment variables in heroku.',
    MC_FOLDER_CREATION_FAILED_MSG: 'Marketing cloud folder creation failed. Please try again.' ,
    MC_NO_PARENT_FOLDER_MSG: `No parent folder available in marketing cloud.`,

    SF_AUTH_FAILED_MSG: 'Salesforce authentication failed. Please check environment variables in heroku.'
}
