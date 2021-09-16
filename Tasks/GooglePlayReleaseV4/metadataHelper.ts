import * as fs from 'fs';
import * as path from 'path';
import * as tl from 'azure-pipelines-task-lib/task';

import { androidpublisher_v3 as pub3 } from 'googleapis';

/**
 * Uploads change log files if specified for all the version codes in the update
 * @param changelogFile
 * @param versionCodes
 * @returns nothing
 */
export async function getCommonReleaseNotes(languageCode: string, changelogFile: string): Promise<pub3.Schema$LocalizedText | null> {
    const stats: tl.FsStats = tl.stats(changelogFile);

    let releaseNotes: pub3.Schema$LocalizedText = null;
    if (stats && stats.isFile()) {
        console.log(tl.loc('AppendChangelog', changelogFile));
        releaseNotes = {
            language: languageCode,
            text: getChangelog(changelogFile)
        };

    } else {
        tl.debug(`The change log path ${changelogFile} either does not exist or points to a directory. Ignoring...`);
    }
    return releaseNotes;
}

/**
 * Reads a change log from a file
 * Assumes authorized
 * @param {string} changelogFile Path to changelog file.
 * @returns {string} change log file content as a string.
 */
function getChangelog(changelogFile: string): string {
    tl.debug(`Reading change log from ${changelogFile}`);
    try {
        return fs.readFileSync(changelogFile).toString();
    } catch (e) {
        tl.debug(`Change log reading from ${changelogFile} failed`);
        tl.debug(e);
        throw new Error(tl.loc('CannotReadChangeLog', changelogFile));
    }
}

/**
 * Adds all release notes found in directory to an edit. Pulls version code from file name.
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory with a changesogs folder where release notes can be found.
 * @returns nothing
 */
async function addAllReleaseNotes(versionCodes: number[], languageCode: string, directory: string): Promise<pub3.Schema$LocalizedText[]> {
    const changelogDir: string = path.join(directory, 'changelogs');

    const changelogs: string[] = filterDirectoryContents(changelogDir, stat => stat.isFile());

    if (changelogs.length === 0) {
        return [];
    }

    const releaseNotes: pub3.Schema$LocalizedText[] = [];
    for (const changelogFile of changelogs) {
        const changelogName: string = path.basename(changelogFile, path.extname(changelogFile));
        const changelogVersion: number = parseInt(changelogName, 10);
        if (!isNaN(changelogVersion) && (versionCodes.indexOf(changelogVersion) !== -1)) {
            const fullChangelogPath: string = path.join(changelogDir, changelogFile);

            console.log(tl.loc('AppendChangelog', fullChangelogPath));
            releaseNotes.push({
                language: languageCode,
                text: getChangelog(fullChangelogPath)
            });
            tl.debug(`Found release notes version ${changelogVersion} from ${fullChangelogPath} for language code ${languageCode}`);
        } else {
            tl.debug(`The name of the file ${changelogFile} is not a valid version code. Skipping it.`);
        }
    }

    tl.debug(`All release notes found for ${changelogDir}: ${JSON.stringify(releaseNotes)}`);
    return releaseNotes;
}

/**
 * Filters the directory contents to find files or directories
 * @param {string} directory the directory to search
 * @param {(stats: tl.FsStats) => boolean} filter callback on every item in the directory, return true to keep the results
 * @returns the filtered contents of the directory
 */
function filterDirectoryContents(directory: string, filter: (stats: tl.FsStats) => boolean): string[] {
    return fs.readdirSync(directory).filter(subPath => {
        try {
            const fullPath: string = path.join(directory, subPath);
            tl.debug(`Checking path ${fullPath}`);
            return filter(tl.stats(fullPath));
        } catch (e) {
            tl.debug(`Failed to stat path ${subPath}:`);
            tl.debug(e);
            tl.debug('Ignoring...');
            return false;
        }
    });
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
 * @returns nothing
 */
export async function addMetadata(edits: pub3.Resource$Edits, versionCodes: number[], metadataRootDirectory: string): Promise<pub3.Schema$LocalizedText[]> {
    const metadataLanguageCodes: string[] = filterDirectoryContents(metadataRootDirectory, stat => stat.isDirectory());
    tl.debug(`Found language codes: ${metadataLanguageCodes}`);

    let allReleaseNotes: pub3.Schema$LocalizedText[] = [];
    for (const languageCode of metadataLanguageCodes) {
        const metadataDirectory: string = path.join(metadataRootDirectory, languageCode);

        tl.debug(`Uploading metadata from ${metadataDirectory} for language code ${languageCode} and version codes ${versionCodes}`);
        const releaseNotesForLanguage = await uploadMetadataWithLanguageCode(edits, versionCodes, languageCode, metadataDirectory);
        allReleaseNotes = allReleaseNotes.concat(releaseNotesForLanguage);
    }

    tl.debug(`Collected ${allReleaseNotes.length} release notes`);
    return allReleaseNotes;
}

/**
 * Updates the details for a language with new information
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns nothing
 */
async function uploadMetadataWithLanguageCode(edits: pub3.Resource$Edits, versionCodes: number[], languageCode: string, directory: string): Promise<pub3.Schema$LocalizedText[]> {
    console.log(tl.loc('UploadingMetadataForLanguage', directory, languageCode));

    tl.debug(`Adding localized store listing for language code ${languageCode} from ${directory}`);
    await addLanguageListing(edits, languageCode, directory);

    tl.debug(`Uploading change logs for language code ${languageCode} from ${directory}`);
    const releaseNotes: pub3.Schema$LocalizedText[] = await addAllReleaseNotes(versionCodes, languageCode, directory);

    tl.debug(`Uploading images for language code ${languageCode} from ${directory}`);
    await attachImages(edits, languageCode, directory);

    return releaseNotes;
}

/**
 * Updates the details for a language with new information
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns nothing
 */
async function addLanguageListing(edits: pub3.Resource$Edits, languageCode: string, directory: string) {
    const listingResource: pub3.Schema$Listing = createListingResource(languageCode, directory);

    const isPatch:boolean = (!listingResource.fullDescription) ||
                          (!listingResource.shortDescription) ||
                          (!listingResource.title);

    const isEmpty:boolean = (!listingResource.fullDescription) &&
                          (!listingResource.shortDescription) &&
                          (!listingResource.video) &&
                          (!listingResource.title);

    const listingRequestParameters: pub3.Params$Resource$Edits$Listings$Patch = {
        language: languageCode,
        requestBody: listingResource
    };

    try {

        if (isEmpty) {
            tl.debug(`Skip localized ${languageCode} store listing.`);
        } else if (isPatch) {
            tl.debug(`Patching an existing localized ${languageCode} store listing.`);
            tl.debug('Request Parameters: ' + JSON.stringify(listingRequestParameters));
            await edits.listings.patch(listingRequestParameters);
            tl.debug(`Successfully patched the localized ${languageCode} store listing.`);
        } else {
            // The patch method fails if the listing for the language does not exist already,
            // while update actually updates or creates.
            tl.debug(`Updating a localized ${languageCode} store listing.`);
            tl.debug('Request Parameters: ' + JSON.stringify(listingRequestParameters));
            await edits.listings.update(listingRequestParameters);
            tl.debug(`Successfully updated the localized ${languageCode} store listing.`);
        }
    } catch (e) {
        tl.debug(`Failed to create the localized ${languageCode} store listing.`);
        tl.debug(e);
        throw new Error(tl.loc('CannotCreateListing', languageCode, e));
    }
}

/**
 * Helper method for creating the resource for the edits.listings.update method.
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns {AndroidListingResource} resource A crafted resource for the edits.listings.update method.
 *          { languageCode: string, fullDescription: string, shortDescription: string, title: string, video: string }
 */
function createListingResource(languageCode: string, directory: string): pub3.Schema$Listing {
    tl.debug(`Constructing resource to update listing with language code ${languageCode} from ${directory}`);

    const resourceParts = {
        fullDescription: 'full_description.txt',
        shortDescription: 'short_description.txt',
        title: 'title.txt',
        video: 'video.txt'
    };

    const resource: pub3.Schema$Listing = {
        language: languageCode
    };

    for (const i in resourceParts) {
        if (resourceParts.hasOwnProperty(i)) {
            const file: string = path.join(directory, resourceParts[i]);
            try {
                const fileContents: Buffer = fs.readFileSync(file);
                resource[i] = fileContents.toString();
            } catch (e) {
                tl.debug(`Failed to read metadata file ${file}:`);
                tl.debug(e);
                tl.debug('Ignoring...');
            }
        }
    }

    tl.debug(`Finished constructing listing resource ${JSON.stringify(resource)}`);
    return resource;
}

/**
 * Upload images to the app listing.
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} directory Directory where updated listing details can be found.
 * @returns nothing
 */
async function attachImages(edits: pub3.Resource$Edits, languageCode: string, directory: string) {
    const imageList: { [key: string]: string[] } = getImageList(directory);
    tl.debug(`Found ${languageCode} images: ${JSON.stringify(imageList)}`);

    let cnt: number = 0;
    for (const imageType of Object.keys(imageList)) {
        const images: string[] = imageList[imageType];
        tl.debug(`Uploading images of type ${imageType}: ${JSON.stringify(images)}`);

        if (images.length > 0) {
            await removeOldImages(edits, languageCode, imageType);
        }

        for (const image of images) {
            tl.debug(`Uploading image of type ${imageType} from ${image}`);
            await uploadImage(edits, languageCode, imageType, image);
            cnt++;
        }
    }

    tl.debug(`${cnt} image(s) uploaded.`);
}

/**
 * Remove existing images from the app listing.
 * See the user Story 955465 and https://github.com/Microsoft/google-play-vsts-extension/issues/34.
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} imageType type of images.
 * @returns nothing
 */
async function removeOldImages(edits: pub3.Resource$Edits, languageCode: string, imageType: string) {
    try {
        let imageRequest: pub3.Params$Resource$Edits$Images$Deleteall = {
            language: languageCode,
            imageType: imageType
        };

        tl.debug(`Removing old images of type ${imageType} for language ${languageCode}.`);
        tl.debug('Request Parameters: ' + JSON.stringify(imageRequest));
        await edits.images.deleteall(imageRequest);
        tl.debug(`Successfully removed old images of type ${imageType} for language ${languageCode}.`);
    } catch (e) {
        tl.debug(`Failed to remove old images of type ${imageType} for language ${languageCode}.`);
        tl.debug(e);
    }
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
function getImageList(directory: string): { [key: string]: string[] } {
    const imageTypes: string[] = ['featureGraphic', 'icon', 'promoGraphic', 'tvBanner', 'phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots', 'tvScreenshots', 'wearScreenshots'];
    const acceptedExtensions: string[] = ['.png', '.jpg', '.jpeg'];

    const imageDirectory: string = path.join(directory, 'images');
    const imageList: { [key: string]: string[] }  = {};

    for (const imageType of imageTypes) {
        let shouldAttemptUpload: boolean = false;

        imageList[imageType] = [];

        tl.debug(`Attempting to get images of type ${imageType}`);
        switch (imageType) {
            case 'featureGraphic':
            case 'icon':
            case 'promoGraphic':
            case 'tvBanner':
                for (let acceptedExtension of acceptedExtensions) {
                    let fullPathToFileToCheck: string = path.join(imageDirectory, imageType + acceptedExtension);
                    try {
                        let imageStat: tl.FsStats = tl.stats(fullPathToFileToCheck);
                        if (imageStat) {
                            shouldAttemptUpload = imageStat.isFile();
                            if (shouldAttemptUpload) {
                                console.log(tl.loc('FoundImageAtPath', imageType, fullPathToFileToCheck));
                                imageList[imageType].push(fullPathToFileToCheck);
                                break;
                            }
                        }
                    } catch (e) {
                        tl.debug(`File ${fullPathToFileToCheck} doesn't exist. Skipping...`);
                    }
                }

                if (!shouldAttemptUpload) {
                    console.log(tl.loc('ImageTypeNotFound', imageType));
                }
                break;
            case 'phoneScreenshots':
            case 'sevenInchScreenshots':
            case 'tenInchScreenshots':
            case 'tvScreenshots':
            case 'wearScreenshots':
                try {
                    let fullPathToDirToCheck: string = path.join(imageDirectory, imageType);
                    let imageStat: fs.Stats = fs.statSync(fullPathToDirToCheck);
                    if (imageStat) {
                        tl.debug(`Found something for type ${imageType}`);
                        shouldAttemptUpload = imageStat.isDirectory();
                        if (!shouldAttemptUpload) {
                            console.log(tl.loc('StatNotDirectory', imageType));
                        } else {
                            imageList[imageType] = fs.readdirSync(fullPathToDirToCheck)
                                .filter(function (image) {
                                    try {
                                        return fs.statSync(path.join(fullPathToDirToCheck, image)).isFile();
                                    } catch (e) {
                                        tl.debug(e);
                                        tl.debug(`Failed to stat path ${image}. Ignoring...`);
                                    }

                                    return false;
                                })
                                .map(function (image) {
                                    return path.join(fullPathToDirToCheck, image);
                                });
                        }
                    }
                } catch (e) {
                    tl.debug(e);
                    console.log(tl.loc('ImageDirNotFound', imageType));
                }
                break;
            default:
                tl.debug(`Image type ${imageType} is an unknown type and was ignored`);
                continue;
        }
    }

    tl.debug(`Finished enumerating images: ${JSON.stringify(imageList)}`);
    return imageList;
}

/**
 * Attempts to upload the specified image to the edit
 * Assumes authorized
 * @param {string} languageCode Language code (a BCP-47 language tag) of the localized listing to update
 * @param {string} imageType One of the following values: "featureGraphic", "icon", "promoGraphic", "tvBanner", "phoneScreenshots", "sevenInchScreenshots", "tenInchScreenshots", "tvScreenshots", "wearScreenshots"
 * @param {string} imagePath Path to image to attempt upload with
 * @returns nothing
 */
async function uploadImage(edits: pub3.Resource$Edits, languageCode: string, imageType: string, imagePath: string) {
    // Docs at https://developers.google.com/android-publisher/api-ref/edits/images/upload
    const imageRequest: pub3.Params$Resource$Edits$Images$Upload = {
        language: languageCode,
        imageType: imageType
    };
    // imageRequest.uploadType = 'media';
    imageRequest.media = {
        body: fs.createReadStream(imagePath),
        mimeType: helperResolveImageMimeType(imagePath)
    };

    try {
        tl.debug(`Uploading image ${imagePath} of type ${imageType}.`);
        tl.debug('Request Parameters: ' + JSON.stringify(imageRequest));
        await edits.images.upload(imageRequest);
        tl.debug(`Successfully uploaded image ${imagePath} of type ${imageType}.`);
    } catch (e) {
        tl.debug(`Failed to upload image ${imagePath} of type ${imageType}.`);
        tl.debug(e);
        throw new Error(tl.loc('UploadImageFail'));
    }
}

/**
 * Attempts to resolve the image mime type of the given path.
 * Not compelete. DO NOT REUSE.
 * @param {string} imagePath Path to attempt to resolve image mime for.
 * @returns {string} mimeType Google Play accepted image mime type that imagePath most closely maps to.
 */
function helperResolveImageMimeType(imagePath: string): string {
    const extension: string = imagePath.split('.').pop();

    switch (extension) {
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        default:
            tl.debug(`Could not resolve image mime type for ${imagePath}. Defaulting to jpeg.`);
            return 'image/jpeg';
    }
}
