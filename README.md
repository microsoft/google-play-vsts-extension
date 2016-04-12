<table style="width: 100%; border-style: none;"><tr>
<td width="140px" style="text-align: center;"><img src="android_default.png" style="max-width:100%" /></td>
<td><strong>Visual Studio Team Services Extension for Google Play</strong><br />
<i>Provides build/release tasks that enable performing continuous delivery to the Google Play store from an automated VSTS build or release definition</i><br />
<a href="https://marketplace.visualstudio.com/items/ms-vsclient.google-play">Install now!</a>
</td>
</tr></table>

# Visual Studio Team Services Extension for Google Play

This extension contains a set of deployment tasks which allow you to automate the release of app updates to the Google Play store from your CI environment. This can reduce the effort needed to keep your dev/alpha/beta/etc. deployments up-to-date, since you can simply push changes to the configured source control branches, and let your automated build take care of the rest.

## Quick Start

1. Login to the [Google Play Developer Console](https://play.google.com/apps/publish/) and select **Settings** in the left-hand navigation menu

2. Select the **API access** setting and click the **Create Service Account** button underneath the **Service Accounts** section

3. Follow the provided instructions to create your service account and then save the JSON file including your private key in a secure location.

4. Click the **Grant access** button in the row associated with the service account you just created.
 
5. Ensure that the **Manage Production APKs** and **Manage Alpha & Beta APKs** permissions are selected, and then click the **Add user** button

6. Install the Google Play extension from the [VSTS Marketplace](https://marketplace.visualstudio.com/items/ms-vsclient.google-play)

7. Go to your Visual Studio Team Services or TFS project, click on the **Build** tab, and create a new build definition (the "+" icon) that is hooked up to your project's appropriate source repo

8. Click **Add build step...** and select the neccessary tasks to generate your release assets (e.g. **Gulp**, **Cordova Build**)

9. Click **Add build step...** and select **Google Play - Release** from the **Deploy** category

10. Configure the **Google Play - Release** task with the JSON private key file created above, the generated APK file, and the desired release track.

11. Click the **Queue Build** button or push a change to your configured repo in order to run the newly defined build pipeline

12. Your app changes will now be automatically published to the Google Play store!

## Configuring Your Google Play Publisher Credentials

In addition to specifying your publisher credentials file directly within each build task, you can also configure your credentials globally and refer to them within each build or release definition as needed. To do this, perform the following steps:

1. Setup a publishing manager (https://play.google.com/apps/publish/) and get the JSON key file from the [Google Developer API console](https://console.developers.google.com/apis)

2. Go into your Visual Studio Team Services or TFS project and click on the gear icon in the upper right corner

3. Click on the **Services** tab

4. Click on **New Service Endpoint** and select **Google Play**

5. Give the new endpoint a name and enter the credentials for the publishing manager you generated in step#1. The credentials you need can be found in the JSON file and are the Email and the private key.

6. Select this endpoint via the name you chose in #5 whenever you add either the **Google Play - Release** or **Google Play - Promote** tasks to a build or release definition

## Task Option Reference

In addition to the custom service endpoint, this extension also contributes the following three build and release tasks:

### Google Play - Release

The **Google Play - Release** task allows you to release an update to your app on Google Play, and includes the following options:

1. **JSON Key Path** (File path) or **Service Endpoint** - The access key to use to authenticate with Google Play. This can be acquired from the [Google Developer API console](https://console.developers.google.com/apis) and provided either directly to the task (via the `JSON Auth File` authentication method), or configured within a service endpoint that you reference from the task (via the `Service Endpoint` authentication method). Note that in order to use the JSON Auth File method, the JSON file you get from the developer console needs to be checked into your VSTS instance.

2. **APK Path** (File path, Required) - Path to the APK file you want to publish to the specified track.

3. **Track** (String, Required) - Release track to publish the APK to.

4. **User Fraction** (String, Required if visible) - The percentage of users to roll the specified APK out to. This option is only available when the **Track** input is set to **Rollout**.

5. **Release Notes** (File path) - Path to the file specifying the release notes for the APK you are publishing.

### Google Play - Promote

The **Google Play - Promote** task allows you to promote a previously released APK from one track to another, and includes the following options:

1. **JSON Key Path** (File path) or **Service Endpoint** - The access key to use to authenticate with Google Play. This can be acquired from the [Google Developer API console](https://console.developers.google.com/apis) and provided either directly to the task (via the `JSON Auth File` authentication method), or configured within a service endpoint that you reference from the task (via the `Service Endpoint` authentication method). Note that in order to use the JSON Auth File method, the JSON file you get from the developer console needs to be checked into your VSTS instance.

2. **Package Name** (String, Required) - The unique package identifier (e.g. com.foo.myapp) that you wish to promote.

3. **Source Track** (Required) - The track you wish to promote from.

4. **Destination Track** (Required) - The track you wish to promote to.

5. **User Fraction** (String, Required if visible) - The percentage of users to roll the app out to. This option is only available when the **Destination Track** option is set to **Rollout**.

### Google Play - Increase Rollout

The **Google Play - Increase Rollout** task allows you to increase the rollout percentage of an app that was previously released to the **Rollout** track, and includes the following options:

1. **JSON Key Path** (File path) or **Service Endpoint** - The access key to use to authenticate with Google Play. This can be acquired from the [Google Developer API console](https://console.developers.google.com/apis) and provided either directly to the task (via the `JSON Auth File` authentication method), or configured within a service endpoint that you reference from the task (via the `Service Endpoint` authentication method). Note that in order to use the JSON Auth File method, the JSON file you get from the developer console needs to be checked into your VSTS instance.

2. **Package Name** (String, Required) - The unique package identifier (e.g. com.foo.myapp) that you wish to promote.

3. **User Fraction** (String, Required) - The new user fraction to increase the rollout to.

## Installation

### Visual Studio Team Services / Visual Studio Online

1. Install the [Visual Studio Team Services Extension for Google Play](https://marketplace.visualstudio.com/items/ms-vsclient.google-play)

2. You will now find the **Google Player Release**, **Google Play Promote**, and **Google Play Increase Rollout** tasks underneath the **Deploy** category

### TFS 2015 Update 1 or Earlier

1. [Enable basic auth](http://go.microsoft.com/fwlink/?LinkID=699518) in your TFS instance

2. Install the tfx-cli and login

	~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
	npm install -g tfx-cli
	tfx login --authType basic 
	~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

3. Enter your collection URL (Ex: https://localhost:8080/tfs/DefaultCollection) and user name and password 

4. Download the [latest release](https://github.com/Microsoft/google-play-vsts-extension/releases) of the CodePush tasks locally and unzip it

5. Type the following from the root of the repo from Windows:

	~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
	upload
	~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

	Or from a Mac:

	~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
	sh upload.sh
	~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~

## Contact Us
* [Report an issue](https://github.com/Microsoft/google-play-vsts-extension/issues)

## Terms of Use
By downloading and running this project, you agree to the license terms of the third party application software, Microsoft products, and components to be installed. 

The third party software and products are provided to you by third parties. You are responsible for reading and accepting the relevant license terms for all software that will be installed. Microsoft grants you no rights to third party software.

## License

```
The MIT License (MIT)

Copyright (c) Microsoft Corporation

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

Google Play and the Google Play logo are trademarks of Google Inc.
