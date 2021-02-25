const { SF_CMS_CONNECTION_ID } = process.env;
module.exports = (app) => {
    app.get("/queue", async function (req, res) {
        const { cmsConnectionId, channelId } = req.query;
        if (SF_CMS_CONNECTION_ID === cmsConnectionId) {
            res.sendFile('../../queue.html', { root: __dirname });
        } else {
            res.send('Required fields not found.');
        }
    });
    
}