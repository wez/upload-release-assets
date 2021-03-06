const github = require('@actions/github');
const core = require('@actions/core');
import fg from 'fast-glob';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';

async function run() {
    try {
        let release_id: number = 0;
        const repo = github.context.repo;
        const glob = core.getInput('files', { required: true });
        const tag = core.getInput('release-tag');
        const token = core.getInput('repo-token', { required: true });
        const octokit = new github.GitHub(token);

        if (tag) {
            core.debug(`Getting release id for ${tag}...`);
            const release = await octokit.repos.getReleaseByTag({ ...repo, tag });

            release_id = release.data.id;
        } else {
            const action = github.context.payload.action;

            switch (action) {
                case 'published':
                case 'created':
                case 'prereleased':
                    break;
                default:
                    // Stop if not correct state, but do not fail
                    core.warning(`Cannot upload assets for release which has github.context.payload.action=${action}`)
                    return;
            }

            release_id = github.context.payload.release.id;
        }

        if (!release_id) {
            core.setFailed('Could not find release');
            return;
        }

        console.log(`Uploading assets to release: ${release_id}...`);

        const files = await fg(glob.split(';'));
        if (!files.length) {
            core.setFailed('No files found');
            return;
        }

        const { data: { upload_url: url } } = await octokit.repos.getRelease({ ...repo, release_id });

        async function deleteReleaseAsset(file: string) {
            const { data: existingAssets } = await octokit.repos.listAssetsForRelease({ ...repo, release_id });
            const existingAsset = existingAssets.find(a => a.name === file);
            if (existingAsset) {
                console.log(`Removing existing asset '${file}' with ID ${existingAsset.id}...`);
                await octokit.repos.deleteReleaseAsset({ ...repo, asset_id: existingAsset.id });
            }
        }

        for (let file of files) {
            const contentType = mime.lookup(file) || 'application/zip';
            const fileName = path.basename(file);

            for (let i = 3; i >= 0; --i) {
                try {
                    await deleteReleaseAsset(file);

                    const fileStream = fs.createReadStream(file);
                    const headers = {
                        'content-type': contentType,
                        'content-length': fs.statSync(file).size
                    };

                    console.log(`Uploading ${file} with content-type '${contentType}'...`);
                    await octokit.repos.uploadReleaseAsset({ url, headers, name: fileName, data: fileStream });
                    console.log(`Successfully uploaded '${fileName}' to '${url}'`);
                    break;
                } catch (error) {
                    console.log(`Error uploading '${fileName}' to '${url}': ${error.message} ('${error}')`);
                    if (i == 0) {
                        throw error;
                    }
                }
            }
        }
    } catch (error) {
        core.setFailed(error.message);
    }
}

run();
