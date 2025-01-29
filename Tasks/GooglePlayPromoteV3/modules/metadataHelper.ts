import * as fs from 'fs';
import { JSDOM } from 'jsdom';
import * as tl from 'azure-pipelines-task-lib/task';

import { androidpublisher_v3 as pub3 } from 'googleapis';

/**
 * Uploads change log files if specified for all the version codes in the update
 * @param {string} languageCode
 * @param {string} changelogFile
 * @param {boolean} releaseNotesContainLanguageTags
 * @returns {pub3.Schema$LocalizedText[]} `[{ language: 'en-US|fr-FR|it-IT|...', text: 'Localized_Release_Notes' }, ...]`
 */
export async function getCommonReleaseNotes(languageCode: string, changelogFile: string, releaseNotesContainLanguageTags: boolean): Promise<pub3.Schema$LocalizedText[]> {
    const stats: tl.FsStats = tl.stats(changelogFile);
    const releaseNotes: pub3.Schema$LocalizedText[] = [];

    if (stats && stats.isFile()) {
        console.log(tl.loc('AppendChangelog', changelogFile));
        const changelog: string = getChangelog(changelogFile);

        if (changelog) {
            if (releaseNotesContainLanguageTags) {
                for (const node of new JSDOM(changelog).window.document.body.childNodes.values()) {
                    const language = node['tagName'];
                    const text = node.textContent.trim();

                    if (language && text) {
                        releaseNotes.push({ language, text });
                    }
                }
            } else {
                releaseNotes.push({
                    language: languageCode,
                    text: changelog
                });
            }
        }
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
        return fs.readFileSync(changelogFile).toString().trim();
    } catch (e) {
        tl.debug(`Change log reading from ${changelogFile} failed`);
        tl.debug(e);
        throw new Error(tl.loc('CannotReadChangeLog', changelogFile));
    }
}
