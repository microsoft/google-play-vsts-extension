var Promise = require("bluebird");
var google = require("googleapis");
var fs = require("fs");
var path = require("path");
var tl = require("vso-task-lib");
var apkParser = require("node-apk-parser");
var publisher = google.androidpublisher("v2");
var glob = require("glob");

// User inputs;
var authType = tl.getInput("authType", true);
var key = {};
if (authType === "JsonFile") {
    var serviceAccountKeyFile = tl.getPathInput("serviceAccountKey", false);
    try {
        var stats = fs.statSync(serviceAccountKeyFile);
        if (stats && stats.isFile()) {
            key = require(serviceAccountKeyFile);
        } else {
            console.error("Specified Auth file was invalid");
            tl.setResult(1, serviceAccountKeyFile + " was not a valid auth file");
        }
    } catch (e) {
        tl.debug(`Couldn't stat keyfile ${serviceAccountKeyFile}. This task will likely fail due to unauthorised.`)
    }
} else if (authType === "ServiceEndpoint") {
    var serviceEndpoint = tl.getEndpointAuthorization(tl.getInput("serviceEndpoint", true));
    key.client_email = serviceEndpoint.parameters.username;
    key.private_key = serviceEndpoint.parameters.password.replace(/\\n/g, "\n");
}

var apkFile = resolveGlobPath(tl.getPathInput("apkFile", true));
var apkFileList = [apkFile];
var additionalApks = tl.getDelimitedInput("additionalApks", "\n");
if (additionalApks.length > 0) {
    for (var i in additionalApks) {
        apkFileList.push(resolveGlobPath(additionalApks[i]));
    }

    console.log("Found multiple Apks to upload: ");
    console.log(apkFileList);
}

var track = tl.getInput("track", true);
var userFraction = tl.getInput("userFraction", false); // Used for staged rollouts
var changelogFile = tl.getInput("changelogFile", false);
var shouldAttachMetadata = JSON.parse(tl.getInput("shouldAttachMetadata", false));

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
// #4) Upload the new APK(s)
// #5) Specify the track that should be used for the new APK (e.g. alpha, beta)
// #6) Specify the new change log
// #7) Commit the edit transaction

var packageName = tryGetPackageName(apkFile);
var jwtClient = setupAuthClient(key);
var edits = publisher.edits;
[edits, edits.apklistings, edits.apks, edits.tracks, edits.listings, edits.images, jwtClient].forEach(Promise.promisifyAll);

globalParams.auth = jwtClient;
updateGlobalParams("packageName", packageName);

var currentEdit = authorize().then(function (res) {
    console.log("Authenticated with Google Play and getting new edit");
    return getNewEdit(packageName);
});

for (var apk in apkFileList) {
    currentEdit = currentEdit.then(function (res) {
        console.log(`Uploading APK file ${apkFileList[apk]}...`);
        return addApk(packageName, apkFileList[apk]);
    });
}

currentEdit = currentEdit.then(function (res) {
    console.log("Updating track information...");
    return updateTrack(packageName, track, globalParams.params.apkVersionCode, userFraction);
});

if (shouldAttachMetadata) {
    var metadataRootPath = tl.getInput("metadataRootPath", true);
    currentEdit = currentEdit.then(function (res) {
        console.log(`Attempting to attach metadata to release...`);
        return addMetadata(metadataRootPath);
    });
}

// This block will likely be deprecated by the metadata awareness
try {
    var stats = fs.statSync(changelogFile);
    if (stats && stats.isFile()) {
        currentEdit = currentEdit.then(function (res) {
            console.log("Adding changelog file...");
            return addChangelog("en-US", changelogFile);
        });

    }
} catch (e) {
    tl.debug("No changelog found. Log path was " + changelogFile);
}

currentEdit = currentEdit.then(function (res) {
    return edits.commitAsync().then(function (res) {
        console.log("APK successfully published!");
        console.log("Track: " + track);
        tl.exit(0);
    });
}).catch(function (err) {
    console.error(err);
    tl.exit(1);
});



/**
 * Tries to extract the package name from an apk file
 * @param {Object} apkFile The apk file from which to attempt name extraction
 * @return {string} packageName Name extracted from package. null if extraction failed
 */
function tryGetPackageName(apkFile) {
    tl.debug("Candidate package: " + apkFile);
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
 * @param {Object} key parsed object from google play provided JSON authentication informatoin
 * @return {Object} client Returns object to be used for authenticating calls to the api.
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
 * @param {string} packageName unique android package name (com.android.etc)
 * @return {Promise} edit A promise that will return result from inserting a new edit
 *                          { id: string, expiryTimeSeconds: string }
 */
function getNewEdit(packageName) {
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
 * @param {string} packageName unique android package name (com.android.etc)
 * @param {string} apkFile path to apk file
 * @returns {Promise} apk A promise that will return result from uploading an apk 
 *                          { versionCode: integer, binary: { sha1: string } }
 */
function addApk(packageName, apkFile) {
    tl.debug("Uploading a new apk: " + apkFile);
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
 * @param {string} packageName unique android package name (com.android.etc)
 * @param {string} track one of the values {"alpha", "beta", "production", "rollout"}
 * @param {(number|number[])} versionCode version code returned from an apk call. will take either a number or a number[]
 * @param {double} userFraction for rollout, fraction of users to get update
 * @returns {Promise} track A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
function updateTrack(packageName, track, versionCode, userFraction) {
    tl.debug("Updating track");
    var requestParameters = {
        packageName: packageName,
        track: track,
        resource: {
            track: track,
            versionCodes: (typeof versionCode === "number" ? [versionCode] : versionCode)
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
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} changelogFile Path to changelog file.
 * @returns {Promise} track A promise that will return result from updating a track
 *                            { track: string, versionCodes: [integer], userFraction: double }
 */
function addChangelog(languageCode, changelogFile) {
    tl.debug("Adding changelog file: " + changelogFile);

    var versionCode = globalParams.params.apkVersionCode;
    try {
        var changelogVersion = path.basename(changelogFile).replace(/\.[^/.]+$/g, "");
        versionCode = parseInt(changelogVersion);
    } catch (e) {
        tl.debug(e);
        tl.debug(`Failed to extract version code from file ${changelogFile}. Defaulting to global version code ${globalParams.params.apkVersionCode}`);
    }

    try {
        var requestParameters = {
            apkVersionCode: versionCode,
            language: languageCode,
            resource: {
                language: languageCode,
                recentChanges: fs.readFileSync(changelogFile).toString()
            }
        };

        tl.debug("Additional Parameters: " + JSON.stringify(requestParameters));
        return edits.apklistings.updateAsync(requestParameters).catch(function (err) {
            tl.debug(err);
            tl.error("Failed to upload changelogs. See log for details.");
        });
    } catch (e) {
        tl.debug(e);
        tl.debug(`Most likely failed to read specified changelog.`);
    }

    return Promise.reject(new Error(`Changelog upload failed for log ${changelogFile}. Check logs for details.`));
}

/**
 * Adds all changelogs found in directory to an edit. Pulls version code from file name. Failing this, assumes the global version code inferred from apk
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory with a changesogs folder where changelogs can be found.
 * @returns {Promise} track A promise that will return result from updating an apk listing
 *                            { language: string, recentChanges: string }
 */
function addAllChangelogs(languageCode, directory) {
    var changelogDir = path.join(directory, "changelogs");

    var addAllChangelogsPromise = Promise.resolve();

    try {
        var changelogs = fs.readdirSync(changelogDir).filter(function (subPath) {
            var pathIsFile = false;
            try {
                var fileToCheck = path.join(changelogDir, subPath);
                tl.debug(`Checking File ${fileToCheck}`);
                pathIsFile = fs.statSync(fileToCheck).isFile();
            } catch (e) {
                tl.debug(e);
                tl.debug(`Failed to stat path ${subPath}. Ignoring...`);
            }

            return pathIsFile;
        });

        for (var i in changelogs) {
            var fullChangelogPath = path.join(changelogDir, changelogs[i]);
            addAllChangelogsPromise = addAllChangelogsPromise.then(function (changelog) {
                console.log(`Appending changelog ${changelog}`);
                return addChangelog.bind(this, languageCode, changelog)();
            }.bind(this, fullChangelogPath));
        }
    } catch (e) {
        tl.debug(e);
        tl.debug(`no changelogs found in ${changelogDir}`);
    }

    return addAllChangelogsPromise;
}

/**
 * Attaches the metadata in the specified directory to the edit. Assumes the metadata structure specified by Fastlane.
 * Assumes authorized
 * 
 * Metadata Structure:
 * metadata
 *  └ $(languageCodes)
 *    ├ full_description.txt
 *    ├ short_description.txt
 *    ├ title.txt
 *    ├ video.txt
 *    ├ images
 *    |  ├ featureGraphic.png    || featureGraphic.jpg   || featureGraphic.jpeg
 *    |  ├ icon.png              || icon.jpg             || icon.jpeg
 *    |  ├ promoGraphic.png      || promoGraphic.jpg     || promoGraphic.jpeg
 *    |  ├ tvBanner.png          || tvBanner.jpg         || tvBanner.jpeg
 *    |  ├ phoneScreenshots
 *    |  |  └ *.png || *.jpg || *.jpeg
 *    |  ├ sevenInchScreenshots
 *    |  |  └ *.png || *.jpg || *.jpeg
 *    |  ├ tenInchScreenshots
 *    |  |  └ *.png || *.jpg || *.jpeg
 *    |  ├ tvScreenshots
 *    |  |  └ *.png || *.jpg || *.jpeg
 *    |  └ wearScreenshots
 *    |     └ *.png || *.jpg || *.jpeg
 *    └ changelogs
 *      └ $(versioncodes).txt
 * 
 * @param {string} metadataRootDirectory Path to the folder where the Fastlane metadata structure is found. eg the folders under this directory should be the language codes
 * @returns {Promise}  A promise that will return the result from last metadata change that was attempted. Currently, this is most likely an image upload.
 *                     { image: { id: string, url: string, sha1: string } }
 */
function addMetadata(metadataRootDirectory) {
    tl.debug("Attempting to add metadata...");
    tl.debug(`Adding metadata from ${metadataRootDirectory}`);

    var metadataLanguageCodes = fs.readdirSync(metadataRootDirectory).filter(function (subPath) {
        var pathIsDir = false;
        try {
            pathIsDir = fs.statSync(path.join(metadataRootDirectory, subPath)).isDirectory();
        } catch (e) {
            tl.debug(e);
            tl.debug(`Failed to stat path ${subPath}. Ignoring...`);
        }

        return pathIsDir;
    });

    var addingAllMetadataPromise = Promise.resolve();

    for (var i in metadataLanguageCodes) {
        var nextLanguageCode = metadataLanguageCodes[i];
        var nextDir = path.join(metadataRootDirectory, nextLanguageCode);
        addingAllMetadataPromise = addingAllMetadataPromise.then(function (languageCode, directory) {
            tl.debug(`Processing metadata for language code ${languageCode}`);
            return uploadMetadataWithLanguageCode.bind(this, languageCode, directory)();
        }.bind(this, nextLanguageCode, nextDir));
    }

    return addingAllMetadataPromise;
}

/**
 * Updates the details for a language with new information
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns {Promise} A Promise that will return after all metadata updating operations are completed.
 */
function uploadMetadataWithLanguageCode(languageCode, directory) {
    console.log(`Attempting to upload metadata in ${directory} for language code ${languageCode}`);

    var updatingMetadataPromise;

    var patchListingRequestParameters = {
        language: languageCode
    };

    patchListingRequestParameters.resource = createPatchListingResource(languageCode, directory);
    updatingMetadataPromise = edits.listings.patchAsync(patchListingRequestParameters);

    updatingMetadataPromise = updatingMetadataPromise.then(function () {
        return addAllChangelogs.bind(this, languageCode, directory)();
    });

    updatingMetadataPromise = updatingMetadataPromise.then(function () {
        return attachImages.bind(this, languageCode, directory)();
    });

    return updatingMetadataPromise;
}

/**
 * Helper method for creating the resource for the edits.listings.patch method.
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns {Object} resource A crafted resource for the edits.listings.patch method.
 *                              { languageCode: string, fullDescription: string, shortDescription: string, title: string, video: string }
 */
function createPatchListingResource(languageCode, directory) {
    tl.debug(`Constructing resource to patch listing with language code ${languageCode} from ${directory}`);
    var resourceParts = {
        "fullDescription": "full_description.txt",
        "shortDescription": "short_description.txt",
        "title": "title.txt",
        "video": "video.txt"
    };

    var resource = {
        language: languageCode
    };

    for (var i in resourceParts) {
        var file = path.join(directory, resourceParts[i]);
        var fileContents;
        try {
            fileContents = fs.readFileSync(file);
            resource[i] = fileContents.toString();
        } catch (e) {
            tl.debug(`Failed to read metadata file ${file}. Ignoring...`);
        }

    }

    tl.debug(`Finished constructing resource ${JSON.stringify(resource) }`);
    return resource;
}

/**
 * Upload images to the app listing.
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns {Promise} response Response from last attempted image upload
 *                             { image: { id: string, url: string, sha1: string } }
 */
function attachImages(languageCode, directory) {
    tl.debug(`Starting upload of images with language code ${languageCode} from ${directory}`);

    var imageList = getImageList(directory);

    var uploadImagesPromise = Promise.resolve();

    for (var imageType in imageList) {
        var images = imageList[imageType];
        for (var i in images) {
            uploadImagesPromise = uploadImagesPromise.then(function (languageCode, imageType, image) {
                return uploadImage(languageCode, imageType, image);
            }.bind(this, languageCode, imageType, images[i]));
        }
    }

    tl.debug(`All image uploads queued`);
    return uploadImagesPromise;
}

/**
 * Get all the images in the metadata directory that need to be uploaded.
 * Assumes all files are in a folder labeled "images" at the root of directory
 * directory
 *  └ images
 *    ├ featureGraphic.png    || featureGraphic.jpg   || featureGraphic.jpeg
 *    ├ icon.png              || icon.jpg             || icon.jpeg
 *    ├ promoGraphic.png      || promoGraphic.jpg     || promoGraphic.jpeg
 *    ├ tvBanner.png          || tvBanner.jpg         || tvBanner.jpeg
 *    ├ phoneScreenshots
 *    |  └ *.png || *.jpg || *.jpeg
 *    ├ sevenInchScreenshots
 *    |  └ *.png || *.jpg || *.jpeg
 *    ├ tenInchScreenshots
 *    |  └ *.png || *.jpg || *.jpeg
 *    ├ tvScreenshots
 *    |  └ *.png || *.jpg || *.jpeg
 *    └ wearScreenshots
 *       └ *.png || *.jpg || *.jpeg
 * @param {string} directory Directory where the "images" folder is found matching the structure specified above
 * @returns {Object} imageList Map of image types to lists of images matching that type.
 *                              { [imageType]: string[] }
 */
function getImageList(directory) {
    var imageTypes = ["featureGraphic", "icon", "promoGraphic", "tvBanner", "phoneScreenshots", "sevenInchScreenshots", "tenInchScreenshots", "tvScreenshots", "wearScreenshots"];
    var acceptedExtensions = [".png", ".jpg", ".jpeg"];

    var imageDirectory = path.join(directory, "images");
    var imageList = {};

    for (var i in imageTypes) {
        var shouldAttemptUpload = false;
        var imageType = imageTypes[i];

        imageList[imageType] = [];

        tl.debug(`Attempting to get images of type ${imageType}`);
        switch (imageType) {
            case "featureGraphic":
            case "icon":
            case "promoGraphic":
            case "tvBanner":
                for (var i = 0; i < acceptedExtensions.length && !shouldAttemptUpload; i++) {
                    var fullPathToFileToCheck = path.join(imageDirectory, imageType + acceptedExtensions[i]);
                    try {
                        var imageStat = fs.statSync(fullPathToFileToCheck);
                        if (imageStat) {
                            shouldAttemptUpload = imageStat.isFile();
                            if (shouldAttemptUpload) {
                                console.log(`Found image for type ${imageType} at ${fullPathToFileToCheck}`);
                                imageList[imageType].push(fullPathToFileToCheck);
                                break;
                            }
                        }
                    } catch (e) {
                        tl.debug(`File ${fullPathToFileToCheck} doesn't exist. Skipping...`);
                    }
                }

                if (!shouldAttemptUpload) {
                    console.log(`Image for ${imageType} was not found. Skipping...`);
                }
                break;
            case "phoneScreenshots":
            case "sevenInchScreenshots":
            case "tenInchScreenshots":
            case "tvScreenshots":
            case "wearScreenshots":
                try {
                    var fullPathToDirToCheck = path.join(imageDirectory, imageType);
                    var imageStat = fs.statSync(fullPathToDirToCheck);
                    if (imageStat) {
                        tl.debug(`Found something for type ${imageType}`);
                        shouldAttemptUpload = imageStat.isDirectory();
                        if (!shouldAttemptUpload) {
                            console.log(`Stat returned that ${imageType} was not a directory. Is there a file that shares this name?`);
                        } else {
                            imageList[imageType] = fs.readdirSync(fullPathToDirToCheck).filter(function (image) {
                                var pathIsFile = false;
                                try {
                                    pathIsFile = fs.statSync(path.join(fullPathToDirToCheck, image)).isFile();
                                } catch (e) {
                                    tl.debug(e);
                                    tl.debug(`Failed to stat path ${image}. Ignoring...`);
                                }

                                return pathIsFile;
                            });
                        }
                    }
                } catch (e) {
                    tl.debug(e);
                    console.log(`Image directory for ${imageType} was not found. Skipping...`);
                }
                break;
            default:
                tl.debug(`Image type ${imageType} is an unknown type and was ignored`);
                continue;
        }
    }

    tl.debug(`Finished enumerating images: ${JSON.stringify(imageList) }`);
    return imageList;
}

/**
 * Attempts to upload the specified image to the edit
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} imageType One of the following values: "featureGraphic", "icon", "promoGraphic", "tvBanner", "phoneScreenshots", "sevenInchScreenshots", "tenInchScreenshots", "tvScreenshots", "wearScreenshots"
 * @param {string} imagePath Path to image to attempt upload with
 * @returns {Promise} imageUploadPromise A promise that will return after the image upload has completed or failed. Upon success, returns an object
 *                                       { image: [ { id: string, url: string, sha1: string } ] }
 */
function uploadImage(languageCode, imageType, imagePath) {
    tl.debug(`Uploading image of type ${imageType} from ${imagePath}`);
    var imageUploadRequest = {
        language: languageCode,
        imageType: imageType,
        uploadType: "media",
        media: {
            body: fs.createReadStream(imagePath),
            mimeType: helperResolveImageMimeType(imagePath)
        }
    };

    tl.debug(`Making image upload request: ${JSON.stringify(imageUploadRequest) }`);
    return edits.images.uploadAsync(imageUploadRequest).catch(function (request, err) {
        tl.debug(err);
        tl.error("Failed to upload image.");
        tl.setResult(1, `Request Details: ${JSON.stringify(request) }`);
    }.bind(this, imageUploadRequest));
}

/**
 * Attempts to resolve the image mime type of the given path.
 * Not compelete. DO NOT REUSE.
 * @param {string} imagePath Path to attempt to resolve image mime for.
 * @returns {string} mimeType Google Play accepted image mime type that imagePath most closely maps to.
 */
function helperResolveImageMimeType(imagePath) {
    var extension = imagePath.split(".").pop();

    switch (extension) {
        case "png":
            return "image/png";
        case "jpg":
        case "jpeg":
            return "image/jpeg";
        default:
            tl.debug(`Could not resolve image mime type for ${imagePath}. Defaulting to jpeg.`);
            return "image/jpeg";
    }
}

/**
 * Update the universal parameters attached to every request
 * @param {string} paramName Name of parameter to add/update
 * @param {any} value value to assign to paramName. Any value is admissible.
 * @returns {void} void
 */
function updateGlobalParams(paramName, value) {
    tl.debug("Updating Global Parameters");
    tl.debug("SETTING " + paramName + " TO " + JSON.stringify(value));
    globalParams.params[paramName] = value;
    google.options(globalParams);
}

/**
 * Get the appropriate file from the provided pattern
 * @param {string} path The minimatch pattern of glob to be resolved to file path
 * @returns {string} path path of the file resolved by glob
 */
function resolveGlobPath(path) {
    if (path) {
        // VSTS tries to be smart when passing in paths with spaces in them by quoting the whole path. Unfortunately, this actually breaks everything, so remove them here.
        path = path.replace(/\"/g, "");

        var filesList = glob.sync(path);
        if (filesList.length > 0) {
            path = filesList[0];
        }
    }

    return path;
}


// Future features:
// ----------------
// 1) Adding testers
// 2) Adding new images
// 3) Adding expansion files
// 4) Updating contact info
