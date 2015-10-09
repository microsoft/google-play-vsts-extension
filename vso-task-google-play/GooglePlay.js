var Promise   = require("bluebird");
var google    = require("googleapis");
var fs        = require("fs");
var tl        = require("vso-task-lib");
var apkParser = require("node-apk-parser");

// User inputs
var key           = require(tl.getPathInput("serviceAccountKey", true));
var apkFile       = tl.getPathInput("apkFile", true);
var track         = tl.getInput("track", true);
var userFraction  = tl.getInput("userFraction", false); // Used for staged rollouts
var changeLogFile = tl.getInput("changeLogFile", false);

// Constants
var GOOGLE_PLAY_SCOPES = ["https://www.googleapis.com/auth/androidpublisher"];
var APK_MIME_TYPE      = "application/vnd.android.package-archive";

// Helpers
var currentStep = 0;
var stepCount   = 7;
function updateStatus(desc) {
  console.log(++currentStep + "/" + stepCount + ": " + desc + " (" + packageName + ")");
}

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

var packageName = null;

try {
  packageName = apkParser
                .readFile(apkFile)
                .readManifestSync()
                .package;

  updateStatus("Extracted package name from APK");
}
catch (e) {
  console.error("The specified APK file isn't valid. Please check the path and try to queue another build.");
  tl.exit(0);
}

var jwtClient = new google.auth.JWT(key.client_email, null, key.private_key, GOOGLE_PLAY_SCOPES, null);
google.options({ auth: jwtClient, params: { packageName: packageName } });

var edits = google.androidpublisher("v2").edits;
[edits, edits.apks, edits.tracks, edits.apkListings, jwtClient].forEach(Promise.promisifyAll);
var versionCode = null;

updateStatus("Authenticating with Google Play");
jwtClient.authorizeAsync()
.then(function (res) {
  updateStatus("Creating new Play store edit transaction");
  return edits.insertAsync();
})
.then(function (res) {
  google.options({ auth: jwtClient, params: { editId: res[0].id, packageName: packageName } })

  var media = {
    body: fs.createReadStream(apkFile),
    mimeType: APK_MIME_TYPE
  };

  updateStatus("Uploading APK file");
  return edits.apks.uploadAsync({ media: media });
})
.then(function (res) {
   versionCode = res[0].versionCode;

  var trackListing = {
    track: track,
    versionCodes: [versionCode]
  };

  if (track === "rollout") {
    track.userFraction = userFraction;
  }

  updateStatus("Assigning APK version " + versionCode + " to the " + track + " track");
  return edits.tracks.updateAsync({ track: track, resource: trackListing });
})
.then(function (res) {
  if (!fs.existsSync(changeLogFile)) {
    return Promise.resolve(true);
  }

  var changeLog = {
    language: "en-US",
    recentChanges: fs.readFileSync(changeLogFile)
  };

  updateStatus("Updating APK listing information");
  return edits.apkListings.patchAsync({ apkVersionCode: versionCode, resource: changeLog, language: "en-US" });
})
.then(function (res) {
  updateStatus("Commiting transaction");
  return edits.commitAsync();
})
.then(function (res) {
  console.log("APK successfully published!");
})
.catch(function (err) {
  console.error(err);
  tl.exit(0);
});

// Future features:
// ----------------
// 1) Adding testers
// 2) Adding new images
// 3) Adding expansion files
// 4) Updating contact info