module.exports = {
    MC_ASSETS_API_PATH :'/asset/v1/content/assets',
    MS_AUTH_PATH : '/v2/token',
    MC_CONTENT_CATEGORIES_API_PATH : '/asset/v1/content/categories',
    REDIS_URL : process.env.REDIS_URL || 'redis://127.0.0.1:6379',

    ALLOWED_CONNECTION_STATUS : 'Not Configured',
    MC_CONTENT_CATEGORIES_API_PATH: '/asset/v1/content/categories/',
    FETCH_CMS_FOLDER_DETAIL_QUERY:`SELECT Id, Heroku_Endpoint__c, SFMC_Folder_Id__c, Connection_Status__c FROM CMS_Connection__c WHERE Id = '${process.env.SF_CMS_CONNECTION_ID}' LIMIT 1`,
    CONNETION_STATUS: 'Active'
}
