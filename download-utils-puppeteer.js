const puppeteer = require('puppeteer-extra');
const StealhPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

puppeteer.use(StealhPlugin());

async function downloadPDFs(linksFilePath, pdfFolderPath) {
    const links = fs.readFileSync(linksFilePath, 'utf-8').split('\n');

    const browser = await puppeteer.launch({
        // args: ['--proxy-server=127.0.0.1:8118'],
        headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
    });
    const page = await browser.newPage();

    for (const link of links) {
        if (!link.trim()) {
            continue;
        }

        const [pdfLink, pdfFileName] = link.trim().split(' ');

        const pdfSavePath = path.join(pdfFolderPath, pdfFileName);

        try {
            await downloadPDF(page, pdfLink, pdfSavePath);
            console.log(`PDF downloaded successfully from ${pdfLink} and saved as ${pdfSavePath}`);
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.error(`Error downloading PDF from ${pdfLink}: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 15000));
            //changeTorIp();
        }
    }

    await browser.close();
}

async function downloadPDF(page, pdfLink, pdfSavePath) {
    await page._client().send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: pdfSavePath.slice(0, -4)
    });
    await page.goto(pdfLink, { waitUntil: 'networkidle0', timeout: 30000 });
}

module.exports = {downloadPDFs, downloadPDF };