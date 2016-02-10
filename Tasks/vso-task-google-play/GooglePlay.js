var Promise = require("bluebird");
var google = require("googleapis");
var fs = require("fs");
var tl = require("vso-task-lib");
var apkParser = require("node-apk-parser");
var publisher = google.androidpublisher("v2");

// User inputs
var key = require(tl.getPathInput("serviceAccountKey", true));
var apkFile = tl.getPathInput("apkFile", true);
var track = tl.getInput("track", true);
var userFraction = tl.getInput("userFraction", false); // Used for staged rollouts
var changeLogFile = tl.getInput("changeLogFile", false);

// Constants
var GOOGLE_PLAY_SCOPES = ["https://www.googleapis.com/auth/androidpublisher"];
var APK_MIME_TYPE = "application/vnd.android.package-archive";

var globalParams = { auth: null, params: {} };

// The submission process is composed
// of a transction with the following steps:
// -----------------------------------------
// #1) Extract the package name from the specified APK file
// #2) Get an OAuth token by authentincating the service account
// #3) Create a new editing transaction
// #4) Upload the new APK
// #5) Specify the track that should be used for the new APK (e.g. alpha, beta)
// #6) Specify the new change log
// #7) Commit the edit transaction

var packageName = tryGetPackageName(apkFile);
var jwtClient = setupAuthClient(key);
globalParams.auth = jwtClient;
updateGlobalParams("packageName", packageName);

var edits = publisher.edits;
[edits, edits.apks, edits.tracks, edits.apkListings, jwtClient].forEach(Promise.promisifyAll);

console.log("Authenticating with Google Play");
var currentEdit = authorize().then(function (res) {
    getNewEdit(packageName);
});

currentEdit = currentEdit.then(function (res) {
    console.log("Uploading APK file...");
    return addApk(packageName, apkFile);
});

currentEdit = currentEdit.then(function (res) {
    console.log("Updating track information...");
    return updateTrack(packageName, track, res[0].versionCode, userFraction);
});

if (fs.existsSync(changeLogFile)) {
    currentEdit = currentEdit.then(function (res) {
        console.log("Adding changelog file..."); 
        return addChangelog(changeLogFile);
    });
}

currentEdit = currentEdit.commitAsync().then(function (res) {
    console.log("APK successfully published!");
    tl.exit(0);
})
    .catch(function (err) {
    console.error(err);
    tl.exit(0);
});



/**
 * Tries to extract the package name from an apk file
 * @param {Object} apkFile - The apk file from which to attempt name extraction
 * @return {string} packageName - Name extracted from package. null if extraction failed
 */
function tryGetPackageName(apkFile) {
    var packageName = null;
    try {
        packageName = apkParser
            .readFile(apkFile)
            .readManifestSync()
        .package;

        tl.debug("name extraction from apk succeeded: " + packageName);
    }
    catch (e) {
        tl.debug("name extraction from apk failed: " + e.message);
        console.error("The specified APK file isn't valid. Please check the path and try to queue another build.");
    }

    return packageName;
}

/**
 * Setups up a new JWT client for authentication
 * @param {Object} key - parsed object from google play provided JSON authentication informatoin
 * @return {Object} client - Returns object to be used for authenticating calls to the api.
 */
function setupAuthClient(key) {
    return new google.auth.JWT(key.client_email, null, key.private_key, GOOGLE_PLAY_SCOPES, null);
}

function authorize() {
    return jwtClient.authorizeAsync();
}

/**
 * Uses the provided JWT client to request a new edit from the Play store and attach the edit id to all requests made this session
 * Assumes authorized
 * @param {Object} jwtClient - authorized client
 * @param {string} packageName - unique android package name (com.android.etc)
 * @return {Promise} edit - A promise that will return result from inserting a new edit
 */
function getNewEdit(jwtClient, packageName) {
    tl.debug("Creating a new edit");
    var requestParameters = {
        packageName: packageName
    };

    tl.debug("Additional Parameters: " + JSON.stringify(requestParameters));

    return edits.insertAsync(requestParameters).then(function (res) {
        updateGlobalParams("editId", res[0].id);
        return res;
    });
}

/**
 * Adds an apk to an existing edit
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @param {string} apkFile - path to apk file
 * @returns {Promise} apk - A promise that will return result from uploading an apk 
 *                          { versionCode: integer, binary: { sha1: string } }
 */
function addApk(packageName, apkFile) {
    tl.debug("Uploading a new apk");
    var requestParameters = {
        packageName: packageName,
        media: {
            body: fs.createReadStream(apkFile),
            mimeType: APK_MIME_TYPE
        }
    };

    tl.debug("Additional Parameters: " + JSON.stringify(requestParameters));

    return edits.apks.uploadAsync(requestParameters).then(function (res) {
        updateGlobalParams("apkVersionCode", res[0].versionCode)
        return res;
    })
}

/**
 * Update a given release track with the given information
 * Assumes authorized
 * @param {string} packageName - unique android package name (com.android.etc)
 * @param {string} track - one of the values {"alpha", "beta", "production", "rollout"}
 * @param {integer} versionCode - version code returned from an apk call.
 * @param {double} userFraction - for rollout, fraction of users to get update
 */
function updateTrack(packageName, track, versionCode, userFraction) {
    tl.debug("Updating track");
    var requestParameters = {
        packageName: packageName,
        track: track,
        resource: {
            track: track,
            versionCodes: [versionCode]
        }
    };

    if (track == "rollout") {
        requestParameters.resource.userFraction = userFraction;
    }

    tl.debug("Additional Parameters: " + JSON.stringify(requestParameters));

    return edits.tracks.updateAsync(requestParameters);
}

/**
 * Add a changelog to an edit
 * Assumes authorized
 * @param {changeLogFile} string - path to changelog file. We assume this exists (behaviour may change)
 * @return {}
 */
function addChangelog(changeLogFile) {
    tl.debug("Adding changelog file");
    var requestParameters = {
        apkVersionCode: globalParams.params.apkVersionCode,
        language: "en-US",
        resource: {
            language: "en-US",
            recentChanges: fs.readFileSync(changeLogFile)
        }
    };

    tl.debug("Additional Parameters: " + JSON.stringify(requestParameters));
    return edits.tracks.patchAsync(requestParameters);
}

function updateGlobalParams(paramName, value) {
    tl.debug("Updating Global Parameters");
    tl.debug("SETTING " + paramName + " TO " + JSON.stringify(value));
    globalParams.params[paramName] = value;
    google.options(globalParams);
}

// Future features:
// ----------------
// 1) Adding testers
// 2) Adding new images
// 3) Adding expansion files
// 4) Updating contact info