const { jobs } = require('../src/mcUtils.js');
module.exports = (app) => {
    app.get('/jobs', async (req, res) => {
        res.json({ jobs: jobs() });
    });
}