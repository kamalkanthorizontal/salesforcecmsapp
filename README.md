# CMS Connect

The CMS Connect gives you a convenient point-and-click way to move cms content types to Marketing Cloud.

Read [this](https://docs.google.com/presentation/d/1GdpW7RTiCU-lTvp-bhaChILnzGOk4yhpeX11k5FUKT4/edit?usp=sharing) to learn more about the application.
----------------

Follow the instructions below to deploy your own instance of the application:

## 1. Install and Configure the CMS Connect Salesforce App

1. Install the CMS Connect Salesforce application first. See instructions here: <a href="https://github.com/horizontalintegration/CMS-Connect-SF">https://github.com/horizontalintegration/CMS-Connect-SF</a>

1. In **Setup > Users**, create an integration user that you will use to connect to Salesforce from the Node.js app. Select **Salesforce** as the license type and **System Administrator** as the profile. 

1. Log in (at least once) as that user via your browser. For scratch orgs, use <a href="https://test.salesforce.com">https://test.salesforce.com</a> as the login URL. For Develper Edition orgs, use <a href="https://login.salesforce.com">https://login.salesforce.com</a>. Choose to not register your phone number.

1. Create a Connected App in your scratch org or your developer edition:
    - In **Setup > Apps > App Manager**, click **New Connected App**
    - Specify a Connected App Name. For example, **CMS Heroku App**
    - Enter your email address for **Contact Email**
    - Enter **http://localhost:3000/oauth/_callback** as the Callback URL (This URL is not used in the application)
    - Check **Enable OAuth Settings**
    - Add **Full access (full)** **Perform requests on your behalf at any time (refresh_token, offline_access)** to the **Selected OAuth Scopes**
    - Click **Save** and click **Continue**

## 2. Install the CMS Connect Node App

### Option 1: Install the CMS Connect Node App using the Heroku button

1. Make sure you are logged in to the Heroku Dashboard
1. Click the button below to deploy the manufacturing app on Heroku:

    [![Deploy](https://www.herokucdn.com/deploy/button.png)](https://heroku.com/deploy)

1. For **App Name**, specify a name for your application. For example, if you specify my-conference, your application will be available at http://my-conference.herokuapp.com. Your app name has to be unique on the herokuapp.com domain.
1. Setup an OAuth Connected App in Salesforce and an Installed Package in Marketing Cloud to enter all the environment variables in the deployment wizard.
1. Click the **Deploy** button

### Option 2: Install the CMS Connect Node App locally

Make sure you have [Node.js](http://nodejs.org/) and the [Heroku CLI](https://cli.heroku.com/) installed.

1. Clone this repository:
    ```
    git clone https://github.com/horizontalintegration/CMS-Connect
    cd CMS-Connect
    ```

1. Run the commands in the console

    ```sh
    $ npm install
    $ npm start
    ```
- Check out the local app at: [http://localhost:3000](http://localhost:3000)
- Again follow the instructions in your local app to setup local environment variables.
- Make and test some local changes to the app.
- Deploy those changes.

## Troubleshooting

- Make sure you can successfully login with your integration user in a browser window (using https://test.salesforce.com for scratch orgs or https://login.salesforce.com for regular developer editions)
- Make sure the System Administrator profile has an IP Range set from 0.0.0.0 to 255.255.255.255.
- Check the Heroku logs
