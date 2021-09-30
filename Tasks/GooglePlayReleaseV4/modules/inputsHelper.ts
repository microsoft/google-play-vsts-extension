import * as tl from 'azure-pipelines-task-lib/task';

import * as googleutil from './googleutil';
import * as fileHelper from './fileHelper';

/**
 * Fills client key with valid parameters depending on auth type. Returns the filled key.
 * @returns client key
 */
export function getClientKey(): googleutil.ClientKey {
    const authType: string = tl.getInput('authType', true);
    let key: googleutil.ClientKey = {};
    if (authType === 'JsonFile') {
        const serviceAccountKeyFile: string = tl.getPathInput('serviceAccountKey', true, true);

        const stats: tl.FsStats = tl.stats(serviceAccountKeyFile);
        if (stats && stats.isFile()) {
            key = require(serviceAccountKeyFile);
        } else {
            tl.debug(`The service account file path ${serviceAccountKeyFile} points to a directory.`);
            throw new Error(tl.loc('InvalidAuthFile', serviceAccountKeyFile));
        }
    } else if (authType === 'ServiceEndpoint') {
        let serviceEndpoint: tl.EndpointAuthorization = tl.getEndpointAuthorization(tl.getInput('serviceEndpoint', true), false);
        key.client_email = serviceEndpoint.parameters['username'];
        key.private_key = serviceEndpoint.parameters['password'].replace(/\\n/g, '\n');
    }

    return key;
}

const actions = ['OnlyStoreListing', 'SingleBundle', 'SingleApk', 'MultiApkAab'] as const;
export type Action = (typeof actions)[number];

function isOfTypeAction(userInput: string): userInput is Action {
  return (actions as readonly string[]).includes(userInput);
}

/**
 * Checks action value input and verifies it. Throws if non-existing action is specified
 * @returns chosen action
 */
export function getAction(): Action {
    const actionString: string = tl.getInput('action', false);
    if (!isOfTypeAction(actionString)) {
        throw new Error(tl.loc('InvalidActionInputValue', actionString));
    }
    return actionString;
}

/**
 * Gets the right bundles(s) depending on the action. Uses `getApksOrAabs()`
 * @param action user's action
 * @returns a list of bundles
 */
export function getBundles(action: Action): string[] {
    return getApksOrAabs(action, 'SingleBundle', 'bundleFile', 'bundleFiles');
}

/**
 * Gets the right apk(s) depending on the action. Uses `getApksOrAabs()`
 * @param action user's action
 * @returns a list of apks
 */
export function getApks(action: Action): string[] {
    return getApksOrAabs(action, 'SingleApk', 'apkFile', 'apkFiles');
}

/**
 * Gets the right apk(s)/aab(s) depending on the action.
 * This function exists to avoid code duplication: the process of getting APKs and AABs is very similar.
 * @param action user's action
 * @param singleAction which action would be considered a single file upload
 * @param singleInput input containing single file pattern. Used if `action == singleAction`
 * @param multiInput input containing multiple files patterns. Used if `action == 'MultiApkAab'`
 * @returns a list of apks/aabs
 */
export function getApksOrAabs(
    action: Action,
    singleAction: 'SingleApk' | 'SingleBundle',
    singleInput: 'apkFile' | 'bundleFile',
    multiInput: 'apkFiles' | 'bundleFiles',
): string[] {
    if (action === singleAction) {
        const pattern: string = tl.getInput(singleInput, true);
        const path: string | null = fileHelper.resolveGlobPath(pattern);
        if (path === null) {
            throw new Error(tl.loc('ApkOrAabNotFound', singleInput, pattern));
        }
        return [path];
    } else if (action === 'MultiApkAab') {
        const patterns: string[] = tl.getDelimitedInput(multiInput, '\n');
        const allPaths = new Set<string>();
        for (const pattern of patterns) {
            const paths: string[] = fileHelper.resolveGlobPaths(pattern);
            paths.forEach((path) => allPaths.add(path));
        }
        return Array.from(allPaths);
    }

    return [];
}

/**
 * Shows warnings if some actions for the specified action have been set by the user but are not used by the task.
 * @param action user's action
 */
export function warnAboutUnusedInputs(action: Action): void {
    switch (action) {
        case 'MultiApkAab': warnIfUnusedInputsSet('bundleFile', 'apkFile', 'shouldUploadMappingFile', 'mappingFilePath'); break;
        case 'SingleBundle': warnIfUnusedInputsSet('apkFile', 'bundleFiles', 'apkFiles'); break;
        case 'SingleApk': warnIfUnusedInputsSet('bundleFile', 'bundleFiles', 'apkFiles'); break;
        case 'OnlyStoreListing': warnIfUnusedInputsSet('bundleFile', 'apkFile', 'bundleFiles', 'apkFiles', 'track'); break;
    }
}

/**
 * If any of the provided inputs are set, it will show a warning.
 * @param inputs inputs to check
 */
export function warnIfUnusedInputsSet(...inputs: string[]): void {
    for (const input of inputs) {
        tl.debug(`Checking if unused input ${input} is set...`);
        const inputValue: string | undefined = tl.getInput(input);
        if (inputValue !== undefined && inputValue.length !== 0) {
            tl.warning(tl.loc('SetUnusedInput', input));
        }
    }
}

/**
 * Gets correct version codes from replaceList inputs. If any are invalid, throws and logs them.
 * @returns list of valid version codes
 */
export function getVersionCodeListInput(): number[] {
    const versionCodeFilterInput: string[] = tl.getDelimitedInput('replaceList', ',', false);
    const versionCodeFilter: number[] = [];
    const incorrectCodes: string[] = [];

    for (const versionCode of versionCodeFilterInput) {
        const versionCodeNumber: number = parseInt(versionCode.trim(), 10);

        if (versionCodeNumber && (versionCodeNumber > 0)) {
            versionCodeFilter.push(versionCodeNumber);
        } else {
            incorrectCodes.push(versionCode.trim());
        }
    }

    if (incorrectCodes.length > 0) {
        throw new Error(tl.loc('IncorrectVersionCodeFilter', JSON.stringify(incorrectCodes)));
    } else {
        return versionCodeFilter;
    }
}
