const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const log = require('./logger');

/**
 * Extract metadata from the page
 */
async function extractMetafields(page, task_path) {
    const getTaskForMFExtractor = require(task_path);
    let meta_data = await page.evaluate(getTaskForMFExtractor);
    return (typeof meta_data === 'object' && meta_data !== null) ? meta_data : null;
}

/**
 * Main function to extract data from the page
 */
async function extractData(page, jsonFolderPath, htmlFolderPath, task_path, url) {
    log(`Processing URL: ${url}`);
    const meta_data = await extractMetafields(page, task_path);

    if (!meta_data) {
        log(`Skipping ${url} due to lack of metadata.`);
        return;
    }

    meta_data["217"] = url;
    const encodedUrl = encodeURIComponent(url);
    const baseFileName = crypto.createHash('md5').update(encodedUrl).digest('hex');
    const jsonFileName = `${baseFileName}.json`;
    const jsonFilePath = path.join(jsonFolderPath, jsonFileName);

    const jsonData = JSON.stringify(meta_data, null, 2);
    fs.writeFileSync(jsonFilePath, jsonData);

    const htmlFilePath = path.join(htmlFolderPath, `${baseFileName}.html`);
    const htmlSource = await page.content();
    fs.writeFile(htmlFilePath, htmlSource, (err) => {
        if (err) {
            log('Error saving HTML to file:', err);
        } else {
            log('HTML saved successfully');
        }
    });
}

module.exports = { extractData, extractMetafields };
