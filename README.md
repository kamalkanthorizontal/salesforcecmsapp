CMS SFMC Connector
----------------

1. Deploying to Heroku?

```
$ heroku create
$ git push heroku master
$ heroku open
```
or

[![Deploy to Heroku](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy)

2. View the newly deployed application and follow the instructions to setup an OAuth Connected App in Salesforce, an Installed Package in Marketing Cloud and then set the config in your Heroku app

3. Running Locally?
Setup a local development environment by downloading your app's source: https://download-heroku-source.herokuapp.com/
Make sure you have [Node.js](http://nodejs.org/) and the [Heroku CLI](https://cli.heroku.com/) installed.

```sh
$ npm install
$ npm start
```

4. Check out the local app at: [http://localhost:3000](http://localhost:3000)
5. Again follow the instructions in your local app to setup local environment variables
6. Make and test some local changes to the app
8. Deploy those changes
