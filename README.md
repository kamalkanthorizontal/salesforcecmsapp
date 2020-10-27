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

- For **App Name**, specify a name for your application. For example, if you specify my-conference, your application will be available at http://my-conference.herokuapp.com. Your app name has to be unique on the herokuapp.com domain.
- Setup an OAuth Connected App in Salesforce and an Installed Package in Marketing Cloud to enter all the environment variables in the deployment wizard.
- Click the **Deploy** button

2. Running Locally?
Setup a local development environment by downloading your app's source: https://download-heroku-source.herokuapp.com/
Make sure you have [Node.js](http://nodejs.org/) and the [Heroku CLI](https://cli.heroku.com/) installed.

```sh
$ npm install
$ npm start
```
- Check out the local app at: [http://localhost:3000](http://localhost:3000)
- Again follow the instructions in your local app to setup local environment variables.
- Make and test some local changes to the app.
- Deploy those changes.
