import * as fs from 'fs';
import * as path from 'path';
import * as glob from 'glob';
import * as tl from 'azure-pipelines-task-lib/task';

/**
 * Get the appropriate file from the provided pattern
 * @param path The minimatch pattern of glob to be resolved to file path
 * @returns path path of the file resolved by glob. Returns null if not found or if `path` argument was not provided
 */
export function resolveGlobPath(path: string): string {
    if (path) {
        // VSTS tries to be smart when passing in paths with spaces in them by quoting the whole path. Unfortunately, this actually breaks everything, so remove them here.
        path = path.replace(/\"/g, '');

        const filesList: string[] = glob.sync(path);
        if (filesList.length > 0) {
            return filesList[0];
        }

        return null;
    }

    return null;
}

/**
 * Get the appropriate files from the provided pattern
 * @param path The minimatch pattern of glob to be resolved to file path
 * @returns paths of the files resolved by glob
 */
export function resolveGlobPaths(path: string): string[] {
    if (path) {
        // Convert the path pattern to a rooted one. We do this to mimic for string inputs the behaviour of filePath inputs provided by Build Agent.
        path = tl.resolve(tl.getVariable('System.DefaultWorkingDirectory'), path);

        let filesList: string[] = glob.sync(path);
        tl.debug(`Additional paths: ${JSON.stringify(filesList)}`);

        return filesList;
    }

    return [];
}

/**
 * Get obb file. Returns any file with .obb extension if present in parent directory else returns
 * from apk directory with pattern: main.<versionCode>.<packageName>.obb
 * @param apkPath apk file path
 * @param packageName package name of the apk
 * @param versionCode version code of the apk
 * @returns ObbPathFile of the obb file is present else null
 */
export function getObbFile(apkPath: string, packageName: string, versionCode: number): string | null {
    const currentDirectory: string = path.dirname(apkPath);
    const parentDirectory: string = path.dirname(currentDirectory);

    const fileNamesInParentDirectory: string[] = fs.readdirSync(parentDirectory);
    const obbPathFileInParent: string | undefined = fileNamesInParentDirectory.find(file => path.extname(file) === '.obb');

    if (obbPathFileInParent) {
        tl.debug(`Found Obb file for upload in parent directory: ${obbPathFileInParent}`);
        return path.join(parentDirectory, obbPathFileInParent);
    }

    const fileNamesInApkDirectory: string[] = fs.readdirSync(currentDirectory);
    const expectedMainObbFile: string = `main.${versionCode}.${packageName}.obb`;
    const obbPathFileInCurrent: string | undefined = fileNamesInApkDirectory.find(file => file.toString() === expectedMainObbFile);

    if (!obbPathFileInCurrent) {
        tl.debug(`No Obb found for ${apkPath}, skipping upload`);
        return null;
    }

    tl.debug(`Found Obb file for upload in current directory: ${obbPathFileInCurrent}`);
    return path.join(currentDirectory, obbPathFileInCurrent);
}

/**
 * Get mapping file. Returns mapping file from apk directory with name: mapping.txt
 * @param apkPath apk file path
 * @returns file path of the mapping file if present else null
 */
export function getMappingFile(apkPath: string): string | null {
    const currentDirectory: string = path.dirname(apkPath);
    const fileNamesInApkDirectory: string[] = fs.readdirSync(currentDirectory);
    const expectedMappingFile: string = 'mapping.txt';
    const mappingPathFileInCurrent: string | undefined = fileNamesInApkDirectory.find(file => file.toString() === expectedMappingFile);

    if (!mappingPathFileInCurrent) {
        tl.debug(`No Mapping file found for ${apkPath}, skipping upload`);
        return null;
    }

    tl.debug(`Found Mapping file for upload in current directory: ${mappingPathFileInCurrent}`);
    return path.join(currentDirectory, mappingPathFileInCurrent);
}

/**
 * Get symbols zip file. Returns symbols zip file from apk directory with name: symbols.zip
 * @param apkPath apk file path
 * @returns file path of the symbols zip file if present else null
 */
export function getSymbolsFile(apkPath: string): string | null {
    const currentDirectory: string = path.dirname(apkPath);
    const fileNamesInApkDirectory: string[] = fs.readdirSync(currentDirectory);
    const expectedSymbolsFile: string = 'symbols.zip';
    const symbolsPathFileInCurrent: string | undefined = fileNamesInApkDirectory.find(file => file.toString() === expectedSymbolsFile);

    if (!symbolsPathFileInCurrent) {
        tl.debug(`No Symbols file found for ${apkPath}, skipping upload`);
        return null;
    }

    tl.debug(`Found Symbols file for upload in current directory: ${symbolsPathFileInCurrent}`);
    return path.join(currentDirectory, symbolsPathFileInCurrent);
}
