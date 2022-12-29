# Visual Studio Team Services Extension for Google Play

[![Build status](https://dev.azure.com/mseng/AzureDevOps/_apis/build/status/CrossPlatform.google-play-vsts-extension.GitHub.CI)](https://dev.azure.com/mseng/AzureDevOps/_build/latest?definitionId=5350)

This extension contains a set of deployment tasks which allow you to automate the release, promotion and rollout of app updates to the Google Play store from your CI environment. This can reduce the effort needed to keep your internal test, alpha, beta, rollout and production deployments up-to-date, since you can simply push changes to the configured source control branches, and let your automated build take care of the rest.

## Prerequisites

This extension supports Visual Studio Team Services (VSTS) and Team Foundation Server (TFS) 2017 and later.

In order to automate the release of app updates to the Google Play store, you need to have manually released at least one version through the [Google Play Developer Console](https://play.google.com/apps/publish/). Additionally, you need to create a service account that is authorized to manage your app(s) releases on your behalf and can be used to authenticate "headlessly" from your VSTS build/release definitions. If you haven't already done so, then perform the following steps to create a service account:
> For a more in depth guide [click this link](https://docs.microsoft.com/en-us/appcenter/distribution/stores/googleplay).

1. Login to the [Google Play Developer Console](https://play.google.com/apps/publish/) and select **Setup** in the left-hand navigation menu (the gear icon)

2. Select the **API access** setting and click the **Create Service Account** button underneath the **Service Accounts** section

3. Follow the provided **Google Developers Console** hyperlink

4. Click the **Create credentials** button in the displayed modal dialog, and select **Service account key** (with the role "Owner")

5. Select **JSON** as the **Key type** and click the **Create** button

6. Save the provided JSON file somewhere safe and memorable. You'll be using it later.

7. Back in the **Google Play Developer Console**, click the **Done** button to close the modal

8. Click the **Grant access** button in the row associated with the service account you just created.

9. Ensure that the **Role** is set to **Release Manager** and then click the **Add user** button

To take advantage of the metadata updating capabilities, files need to be organized using fastlane’s [supply tool](https://github.com/fastlane/fastlane/tree/master/supply#readme) format:

1. Install the supply tool
```
sudo gem install supply
```
2. Navigate to your root folder 
```
cd [your_project_folder]
```
3. Download metadata for an existing app to the  project folder
```
supply init
```

## Quick Start

Once you have created or retrieved credentials for you Google Play service account, then perform the following steps to automate releasing updates from a VSTS build or release definition:

1. Install the Google Play extension from the [VSTS Marketplace](https://marketplace.visualstudio.com/items/DenisRumyantsev.google-play)

2. Go to your Visual Studio Team Services or TFS project, click on the **Build** tab, and create a new build definition (the "+" icon) that is hooked up to your project's appropriate source repo

3. Click **Add build step...** and select the neccessary tasks to generate your release assets (e.g. **Gulp**, **Cordova Build**)

4. Click **Add build step...** and select **Google Play - Release** from the **Deploy** category

5. Configure the **Google Play - Release** task with the JSON private key file created above, the generated APK file, and the desired release track.

6. Click the **Queue Build** button or push a change to your configured repo in order to run the newly defined build pipeline

7. Your app changes will now be automatically published to the Google Play store!

## Configuring Your Google Play Publisher Credentials

In addition to specifying your publisher credentials file directly within each build task, you can also configure your credentials globally and refer to them within each build or release definition as needed. To do this, perform the following steps:

1. Setup a publishing manager (https://play.google.com/apps/publish/) and get the JSON key file from the [Google Developer API console](https://console.developers.google.com/apis)

2. Go into your Visual Studio Team Services or TFS project and click on the gear icon in the lower left corner

3. Click on the **Service Connections** tab

4. Click on **New service connection** and select **Google Play**

5. Give the new endpoint a name and enter the credentials for the publishing manager you generated in step#1. The credentials you need can be found in the JSON file and are the Email and the private key.

6. Select this endpoint via the name you chose in #5 whenever you add either the **Google Play - Release** or **Google Play - Promote** tasks to a build or release definition

## Task Reference

In addition to the custom service endpoint, this extension also contributes the following three build and release tasks:

* [Google Play - Release](#google-play---release) - Allows automating the release of a new Android app version to the Google Play store.

* [Google Play - Promote](#google-play---promote) - Allows automating the promotion of a previously released Android app update from one track to another (e.g. `alpha` -> `beta`).

* [Google Play - Increase Rollout](#google-play---increase-rollout) - Allows automating increasing the rollout percentage of a previous release app update.

* [Google Play - Release Bundle](#google-play---release-bundle) - Allows automating the release of a new Android bundle to the Google Play store.

* [Google Play - Status Update](#google-play---status-update) - Allows you to update the status of an app that was previously released to the selected track.

### Google Play Release

Allows you to release an update to your app on Google Play: release app bundle or apk, attach obb or mapping file, update metadata.
Includes the following options:

1. **JSON Key Path** *(File path)* or **Service Endpoint** - The credentials used to authenticate with Google Play. This can be acquired from the [Google Developer API console](https://console.developers.google.com/apis) and provided either directly to the task (via the `JSON Auth File` authentication method), 

    ![JSON Auth File](images/auth-with-json-file.png)

    or configured within a service endpoint that you reference from the task (via the `Service Endpoint` authentication method). 

    ![Service Endpoint](images/auth-with-endpoint.png)

    Note that in order to use the JSON Auth File method, the JSON file you get from the developer console needs to be checked into your source repo.
    Please also note that from the point of security it's preferrable to store it as [Secure file](https://docs.microsoft.com/azure/devops/pipelines/library/secure-files) and download using [Download Secure File task](https://docs.microsoft.com/azure/devops/pipelines/tasks/utility/download-secure-file).

2. **Application ID** *(String, Required)* - The unique package identifier (e.g. com.foo.myapp) of the bundle you want to release.

3. **Action** *(String, Required)* - Action you want to take in the release. Available options are *Only update store listing*, *Upload single bundle*, *Upload single apk*, *Upload multiple apk/aab files*.

    ![Action Input Options](images/action-input.png)

4. **Bundle Path** *(File path, Required if visible)* - Path or glob pattern to the bundle file you want to publish to the specified track. Only visible if `action` is *Upload single bundle*.

    ![Bundle Path](images/bundle-path.png)

5. **APK Path** *(File path, Required if visible)* - Path or glob pattern to the APK file you want to publish to the specified track. Only visible if `action` is *Upload single apk*.

    ![APK Path](images/apk-path.png)

6. **Bundle paths, APK paths** *(Multiline, Optional)* - Paths or glob patterns to the APK/AAB files you want to publish to the specified track. It's required that at least one APK/AAB is picked up from these inputs, otherwise the task will fail. Only visible if `action` is *Upload multiple apk/aab files*.

    ![APK/AAB Paths](images/apk-aab-paths.png)

7. **Upload OBB for APK** *(Boolean, Optional)* - Whether or not to pick up OBB files for each of the specified APKs. Only visible if `action` is *Upload single apk* or *Upload multiple apk/aab files*.

    ![Attach OBB For APK](images/obb-for-apk.png)

8. **Track** *(String, Required)* - Release track to publish the APK to. This input is editable but provides default options: *Internal test*, *Alpha*, *Beta*, *Production*.

    ![Track](images/track.png)

9. **Update Metadata** *(Boolean, Optional)* - Allows automating metadata updates to the Google Play store by reading the contents of the `Metadata Root Directory`.

    ![Update Metadata](images/update-metadata.png)

10. **Metadata Root Directory** *(String, Required if visible)* - Root directory for metadata related files. Becomes available after enabling the `Update Metadata` option. Expects a format similar to fastlane’s [supply tool](https://github.com/fastlane/fastlane/tree/master/supply#readme) which is summarized below:

```
$(Specified Directory)
   └ $(languageCodes)
     ├ full_description.txt
     ├ short_description.txt
     ├ title.txt
     ├ video.txt
     ├ images
     |  ├ featureGraphic.png    || featureGraphic.jpg   || featureGraphic.jpeg
     |  ├ icon.png              || icon.jpg             || icon.jpeg
     |  ├ promoGraphic.png      || promoGraphic.jpg     || promoGraphic.jpeg
     |  ├ tvBanner.png          || tvBanner.jpg         || tvBanner.jpeg
     |  ├ phoneScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  ├ sevenInchScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  ├ tenInchScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  ├ tvScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  └ wearScreenshots
     |     └ *.png || *.jpg || *.jpeg
     └ changelogs
       ├ $(versioncodes).txt
       └ default.txt
```

11. **Release Notes** *(File path)* - Path to the file specifying the release notes for the release you are publishing. Only visible if `Update metadata` option is disabled.

    ![Release Notes](images/release-notes.png)

12. **Language Code** *(String, Optional)* - An IETF language tag identifying the language of the release notes as specified in the BCP-47 document. Default value is _en-US_. Only visible if `Update metadata` option is disabled.

13. **Update Metadata** *(Boolean, Optional)* - Allows automating metadata updates to the Google Play store by leveraging the contents of the `Metadata Root Directory`.

    ![Update Metadata](images/update-metadata.png)

#### Advanced Options

1. **Set in-app update priority** *(Boolean, Optional)* - Enables to set in-app update priority. Not visible if `action` is *Only update store listing*.

    ![Update Priority](images/update-priority.png)

2. **Update priority** *(Number, Required if visible)* - How strongly to recommend an update to the user. An integer value between 0 and 5, with 0 being the default and 5 being the highest priority. Only visible if `Set in-app update priority` is enabled.

3. **Roll out release** *(Boolean, Optional)* - Allows to roll out the release to a percentage of users. Not visible if `action` is *Only update store listing*.

    ![Rollout Fraction](images/rollout-release.png)

4. **User fraction** *(Number, Required if visible)* - The percentage of users to roll the specified APK out to, specified as a number between 0 and 1 (e.g. `0.5` == `50%` of users).

5. **Upload deobfuscation file** *(Boolean, Optional)* - Allows to attach your proguard mapping.txt file to your aab/apk. Only visible if `action` is *Upload single apk* or *Upload single bundle*.

    ![Mapping File](images/mapping-file.png)

6. **Deobfuscation path** *(File path, Required if visible)* - The path to the proguard mapping.txt file to upload. Glob patterns are supported. Only visible if `Upload deobfuscation file` is enabled.

7. **Upload native debug symbols** *(Boolean, Optional)* - Allows to attach native debug symbols zip archive to your aab/apk. Only visible if `action` is *Upload single apk* or *Upload single bundle*.

    ![Mapping File](images/mapping-file.png)

8. **Deobfuscation path** *(File path, Required if visible)* - The path to the native debug symbols zip archive to upload. Glob patterns are supported. Only visible if `Upload native debug symbols` is enabled.

9.  **Send changes to review** *(Boolean, Optional)* - Select this option to send changes for review in GooglePlay Console. If changes are already sent for review automatically, you shouldn't select this option.

    ![Send Changes To Review](images/send-changes-to-review.png)

10. **Release name** *(String, Optional)* - Allows to set meaningful release name that can be seen in your Google Play Console. It won't be visible to your users.

    ![Send Changes To Review](images/send-changes-to-review.png)

11. **Replace version codes** *(String, Required)* - You may specify which APK version codes should be replaced in the track with this deployment. Available options are: *All*, *List* - comma separated list of version codes, *Regular expression* - a regular expression pattern to select a list of APK version codes to be removed from the track with this deployment, e.g. _.\\*12?(3|4)?5_ 


12. **Replace Version Codes** *(String, Optional)* - Specify version codes to replace in the selected track with the new APKs/AABs: all, the comma separated list, or a regular expression pattern. Not visible if `action` is *Only update store listing*.

    ![Advanced Options](images/replace-version-codes.png)

13. **Version Code List** *(String, Required if visible)* - The comma separated list of version codes to be removed from the track with this deployment. Only available if `Replace Version Codes` value is *List*.

14. **Version Code Pattern** *(String, Required if visible)* - The regular expression pattern to select a list of version codes to be removed from the track with this deployment, e.g. .\*12?(3|4)?5. Only available if `Replace Version Codes` value is *Regular expression*.

### Google Play - Release V3 (deprecated in favor of Google Play - Release V4)

Allows you to release an update to your app on Google Play, and includes the following options:

1. **JSON Key Path** *(File path)* or **Service Endpoint** - The credentials used to authenticate with Google Play. This can be acquired from the [Google Developer API console](https://console.developers.google.com/apis) and provided either directly to the task (via the `JSON Auth File` authentication method), 

    ![JSON Auth File](images/auth-with-json-file.png)

    or configured within a service endpoint that you reference from the task (via the `Service Endpoint` authentication method). 

    ![Service Endpoint](images/auth-with-endpoint.png)

    Note that in order to use the JSON Auth File method, the JSON file you get from the developer console needs to be checked into your source repo.
    Please also note that from the point of security it's preferrable to store it as [Secure file](https://docs.microsoft.com/azure/devops/pipelines/library/secure-files) and download using [Download Secure File task](https://docs.microsoft.com/azure/devops/pipelines/tasks/utility/download-secure-file).

2. **APK Path** *(File path, Required)* - Path to the APK file you want to publish to the specified track.

    ![APK Path](images/apk-path.png)

3. **Track** *(String, Required)* - Release track to publish the APK to.

    ![Track](images/track.png)

4. **Rollout Fraction** *(String, Required if visible)* - The percentage of users to roll the specified APK out to, specified as a number between 0 and 1 (e.g. `0.5` == `50%` of users).

    ![Rollout Fraction](images/rollout-fraction.png)

5. **Release Notes** *(File path)* - Path to the file specifying the release notes for the APK you are publishing.

    ![Release Notes](images/release-notes.png)

6. **Language Code** *(String, Optional)* - An IETF language tag identifying the language of the release notes as specified in the BCP-47 document. Default value is _en-US_.

7. **Update Metadata** *(Boolean, Optional)* - Allows automating metadata updates to the Google Play store by leveraging the contents of the `Metadata Root Directory`.

    ![Update Metadata](images/update-metadata.png)

8. **Metadata Root Directory** *(String, Required if visible)* - Root directory for metadata related files. Becomes available after enabling the `Update Metadata` option. Expects a format similar to fastlane’s [supply tool](https://github.com/fastlane/fastlane/tree/master/supply#readme) which is summarized below:

```
$(Specified Directory)
   └ $(languageCodes)
     ├ full_description.txt
     ├ short_description.txt
     ├ title.txt
     ├ video.txt
     ├ images
     |  ├ featureGraphic.png    || featureGraphic.jpg   || featureGraphic.jpeg
     |  ├ icon.png              || icon.jpg             || icon.jpeg
     |  ├ promoGraphic.png      || promoGraphic.jpg     || promoGraphic.jpeg
     |  ├ tvBanner.png          || tvBanner.jpg         || tvBanner.jpeg
     |  ├ phoneScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  ├ sevenInchScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  ├ tenInchScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  ├ tvScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  └ wearScreenshots
     |     └ *.png || *.jpg || *.jpeg
     └ changelogs
       └ $(versioncodes).txt
```

9. **Update only store listing**  *(Boolean, Optional)* - By default, the task will update the specified track and selected APK file(s) will be assigned to the related track. By selecting this option you can update only store listing. Default value is _false_. 

    ![Advanced Options](images//update-store-listing.png)

10. **Update APK(s)** *(Boolean, Optional)* - By default, the task will update the specified binary APK file(s) on your app release. By unselecting this option you can update metadata keeping the APKs untouched. Default value is _true_.

    ![Update APKs](images/update-apks.png)

#### Advanced Options

1. **Additional APK Path(s)** *(Text box)* - Paths to additional APK files you want to publish to the specified track (e.g. an x86 build) separated by new lines. This option allows the usage of wildcards and/or minimatch patterns. For example, **/*.apk to match the first APK file, in any directory.

    ![Advanced Options](images/advanced-options.png)

2. **Replace version codes** *(String, Required)* - You may specify which APK version codes should be replaced in the track with this deployment. Available options are: *All*, *List* - comma separated list of version codes, *Regular expression* - a regular expression pattern to select a list of APK version codes to be removed from the track with this deployment, e.g. _.\\*12?(3|4)?5_ 

### Google Play - Promote

Allows you to promote a previously released APK from one track to another (e.g. `alpha` -> `beta`), and includes the following options:

![Promote task](images/promote-task.png)

1. **JSON Key Path** *(File path)* or **Service Endpoint** - The credentials used to authenticate with Google Play. This can be acquired from the [Google Developer API console](https://console.developers.google.com/apis) and provided either directly to the task (via the `JSON Auth File` authentication method), or configured within a service endpoint that you reference from the task (via the `Service Endpoint` authentication method). Note that in order to use the JSON Auth File method, the JSON file you get from the developer console needs to be checked into your source repo. Please note that from the point of security it's preferrable to store it as [Secure file](https://docs.microsoft.com/azure/devops/pipelines/library/secure-files) and download using [Download Secure File task](https://docs.microsoft.com/azure/devops/pipelines/tasks/utility/download-secure-file).

2. **Package Name** *(String, Required)* - The unique package identifier (e.g. `com.foo.myapp`) that you wish to promote.

3. **Version Code** *(String, Optional)* - The version code of the apk (e.g. 123) that you whish to promote. If no version code is given, the latest version on the specified track will be promoted.

3. **Source Track** *(Required, Required)* - The track you wish to promote your app from (e.g. `alpha`). This assumes that you previously released an update to this track, potentially using the [`Google Play - Release`](#google-play---release) task.

4. **Destination Track** *(Required, Required)* - The track you wish to promote your app to (e.g. `production`).

5. **Rollout Fraction** *(String, Required if visible)* - The percentage of users to roll the app out to, specified as a number between 0 and 1 (e.g. `0.5` == `50%` of users). If you use rollout, and want to be able to automate the process of increasing the rollout over time, refer to the `Google Play - Increase Rollout` task.

6. **Clean Source Track** *(Boolean, Optional)* - Clean the source track. Default value is _true_.

### Google Play - Increase Rollout

Allows you to increase the rollout percentage of an app that was previously released to the **Rollout** track, and includes the following options:

![Increase task](images/increase-task.png)

1. **JSON Key Path** *(File path)* or **Service Endpoint** - The credentials used to authenticate with Google Play. This can be acquired from the [Google Developer API console](https://console.developers.google.com/apis) and provided either directly to the task (via the `JSON Auth File` authentication method), or configured within a service endpoint that you reference from the task (via the `Service Endpoint` authentication method). Note that in order to use the JSON Auth File method, the JSON file you get from the developer console needs to be checked into your source repo. Please note that from the point of security it's preferrable to store it as [Secure file](https://docs.microsoft.com/azure/devops/pipelines/library/secure-files) and download using [Download Secure File task](https://docs.microsoft.com/azure/devops/pipelines/tasks/utility/download-secure-file).

2. **Package Name** *(String, Required)* - The unique package identifier (e.g. com.foo.myapp) of the app you wish to increase the rollout percentage for.

3. **Rollout Fraction** *(String, Required)* - The new user fraction to increase the rollout to, specified as a number between 0 and 1 (e.g. `0.5` == `50%` of users)

### Google Play - Status Update

Allows you to update the status of an app that was previously released to the selected track (e.g. `inProgress` -> `halted`), and includes the following options:

![Status Update task](images/status-update-task.png)

1. **JSON Key Path** *(File path)* or **Service Endpoint** - The credentials used to authenticate with Google Play. This can be acquired from the [Google Developer API console](https://console.developers.google.com/apis) and provided either directly to the task (via the `JSON Auth File` authentication method), or configured within a service endpoint that you reference from the task (via the `Service Endpoint` authentication method). Note that in order to use the JSON Auth File method, the JSON file you get from the developer console needs to be checked into your source repo. Please note that from the point of security it's preferrable to store it as [Secure file](https://docs.microsoft.com/azure/devops/pipelines/library/secure-files) and download using [Download Secure File task](https://docs.microsoft.com/azure/devops/pipelines/tasks/utility/download-secure-file).

2. **Package Name** *(String, Required)* - The unique package identifier (e.g. com.foo.myapp) of the app you wish to update the status for.

3. **Track** *(String, Required)* - The track you wish to update the status of your app from (e.g. `alpha`). This assumes that you previously released an update to this track, potentially using the [`Google Play - Release`](#google-play---release) task.

4. **Status** *(String, Required)* - The status of the release you want to update to.

    ![Status](images/status.png)

5. **User Fraction** *(String, Optional)* - The new user fraction to update the rollout to, specified as a number between 0 and 1 (e.g. `0.5` == `50%` of users, does not contain 0 and 1). If the input User Fraction is not specified, will maintain the current user fraction without updating (**Notice**: if you want to update the status to `inProgress` or `halted`, make sure current user fraction or the input User Fraction is specified).

### Google Play - Release Bundle (deprecated in favor of Google Play - Release V4)

Allows you to release an app bundle to Google Play, and includes the following options:

1. **JSON Key Path** *(File path)* or **Service Endpoint** - The credentials used to authenticate with Google Play. This can be acquired from the [Google Developer API console](https://console.developers.google.com/apis) and provided either directly to the task (via the `JSON Auth File` authentication method), 

    ![JSON Auth File](images/auth-with-json-file.png)

    or configured within a service endpoint that you reference from the task (via the `Service Endpoint` authentication method). 

    ![Service Endpoint](images/auth-with-endpoint.png)

    Note that in order to use the JSON Auth File method, the JSON file you get from the developer console needs to be checked into your source repo.
    Please note that from the point of security it's preferrable to store it as [Secure file](https://docs.microsoft.com/azure/devops/pipelines/library/secure-files) and download using [Download Secure File task](https://docs.microsoft.com/azure/devops/pipelines/tasks/utility/download-secure-file).


2. **Application Id** *(String, Required)* - The application id of the bundle you want to release, e.g. com.company.MyApp.

    ![Application id](images/bundle-app-id.png)

3. **Bundle Path** *(File path, Required)* - Path to the bundle (.aab) file you want to publish to the specified track. Wildcards can be used. For example, **/*.aab to match the first APK file, in any directory.

4. **Track** *(String, Required)* - Track you want to publish the bundle to.

5. **Roll out Release** *(Boolean, Optional)* - Roll out the release to a percentage of users.

6. **Update Metadata** *(Boolean, Optional)* - Allows automating metadata updates to the Google Play store by leveraging the contents of the `Metadata Root Directory`.

7. **Release Notes (file)** *(File path, Required if visible)* - Path to the file specifying the release notes (change log) for the APK you are publishing.

    ![Release Notes](images/bundle-release-notes.png)

8. **Language Code** *(String, Required if visible)* - An IETF language tag identifying the language of the release notes as specified in the BCP-47 document. Default value is _en-US_.

9. **Deobfuscation Path** *(String, Optional)* - The path to the proguard mapping.txt file to upload.

10. **Rollout Fraction** *(String, Optional)* - The percentage of users the specified APK will be released to for the specified 'Track'. It can be increased later with the 'Google Play - Increase Rollout' task.

11. **Metadata Root Directory** *(String, Required)* - Root directory for metadata related files. Becomes available after enabling the `Update Metadata` option. Expects a format similar to fastlane’s [supply tool](https://github.com/fastlane/fastlane/tree/master/supply#readme) which is summarized below:

```
$(Specified Directory)
   └ $(languageCodes)
     ├ full_description.txt
     ├ short_description.txt
     ├ title.txt
     ├ video.txt
     ├ images
     |  ├ featureGraphic.png    || featureGraphic.jpg   || featureGraphic.jpeg
     |  ├ icon.png              || icon.jpg             || icon.jpeg
     |  ├ promoGraphic.png      || promoGraphic.jpg     || promoGraphic.jpeg
     |  ├ tvBanner.png          || tvBanner.jpg         || tvBanner.jpeg
     |  ├ phoneScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  ├ sevenInchScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  ├ tenInchScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  ├ tvScreenshots
     |  |  └ *.png || *.jpg || *.jpeg
     |  └ wearScreenshots
     |     └ *.png || *.jpg || *.jpeg
     └ changelogs
       └ $(versioncodes).txt
```

12. **Upload Deobfuscation File (mapping.txt)** *(Boolean, Optional)* - Select this option to attach your proguard mapping.txt file to the primary APK.

#### Advanced Options

1. **Replace Version Codes** *(String, Optional)* - Specify version codes to replace in the selected track with the new APKs: all, the comma separated list, or a regular expression pattern.

    ![Advanced Options](images/bundle-advanced-options.png)

2. **Version Code List** *(String, Required if visible)* - The comma separated list of APK version codes to be removed from the track with this deployment. Available options are: *All*, *List* - comma separated list of version codes, *Regular expression* - a regular expression pattern to select a list of APK version codes to be removed from the track with this deployment, e.g. _.\\*12?(3|4)?5_ 

3. **Version Code Pattern** *(String, Required if visible)* - The regular expression pattern to select a list of APK version codes to be removed from the track with this deployment, e.g. .*12?(3|4)?5

## Contact Us

* [Report an issue](https://github.com/Microsoft/google-play-vsts-extension/issues)

Google Play and the Google Play logo are trademarks of Google Inc.

This project has adopted the [Microsoft Open Source Code of Conduct](https://opensource.microsoft.com/codeofconduct/). For more information see the [Code of Conduct FAQ](https://opensource.microsoft.com/codeofconduct/faq/) or contact [opencode@microsoft.com](mailto:opencode@microsoft.com) with any additional questions or comments.
Google Play and the Google Play logo are trademarks of Google Inc.
