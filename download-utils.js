const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer-extra');
const StealhPlugin = require('puppeteer-extra-plugin-stealth');

puppeteer.use(StealhPlugin());

async function downloadPDFs(linksFilePath, pdfFolderPath) {
    const links = fs.readFileSync(linksFilePath, 'utf-8').split('\n');

    for (const link of links) {
        if (!link.trim()) {
            continue;
        }

        const [pdfLink, pdfFileName] = link.trim().split(' ');

        const pdfSavePath = path.join(pdfFolderPath, pdfFileName);

        try {
            await downloadPDF(pdfLink, pdfSavePath);
            console.log(`PDF downloaded successfully from ${pdfLink} and saved as ${pdfSavePath}`);
        } catch (error) {
            console.error(`Error downloading PDF from ${pdfLink}: ${error.message}`);
        }
    }
}

async function downloadPDF(pdfLink, pdfSavePath) {
    const browser = await puppeteer.launch({
        args: ['--proxy-server=http://localhost:8118'],
        headless: false
    });

    const page = await browser.newPage();

    await page._client().send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: path.dirname(pdfSavePath)
    });

    await page.goto(pdfLink, { waitUntil: 'networkidle2' });

    // В данном контексте необходимо взаимодействовать с элементами страницы, которые инициируют скачивание PDF.
    // Например, кликнуть на кнопку "Скачать".
    await page.click('#download');

    // Ждем, пока завершится загрузка
    await page.waitForNavigation({ waitUntil: 'networkidle2' });

    await browser.close();
}

module.exports = {downloadPDFs, downloadPDF };