const puppeteer = require('puppeteer-extra');
const { TimeoutError } = require('puppeteer');
const StealhPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const {changeTorIp, shouldChangeIP} = require('./tor-config');
const log = require('./logger');

puppeteer.use(StealhPlugin());


async function downloadPDFs(linksFilePath, pdfFolderPath) {

    puppeteer.use(require('puppeteer-extra-plugin-user-preferences')({
        userPrefs: {
            download: {
                prompt_for_download: false,
                directory_upgrade: true,
                default_directory:  pdfFolderPath,
                extensions_to_open: "applications/pdf",
            }
        }
    }));


    const links = fs.readFileSync(linksFilePath, 'utf-8').split('\n');

    let browser = await puppeteer.launch({
        //product: 'firefox',
        //args: ['--no-sandbox', '--disable-setuid-sandbox'],
        //args: ['--proxy-server=127.0.0.1:8118'],
        headless: false //'new' for "true mode" and false for "debug mode (Browser open))"
    });
    let page;
    let newPage = await browser.newPage();
    await newPage.setViewport({ width: 1280, height: 720 });
    await newPage.goto('https://www.cairn-int.info/50-years-of-financial-crises--9782738144683-page-9.htm', { waitUntil: 'networkidle2', timeout: 50000 });
    await newPage.waitForTimeout(8000);
    await newPage.close();

    for (const link of links) {
        if (!link.trim()) {
            continue;
        }
        page = await browser.newPage();
        await page.setViewport({ width: 1280, height: 720 });
        // await page.goto('https://www.cairn-int.info/50-years-of-financial-crises--9782738144683-page-9.htm', { waitUntil: 'networkidle2', timeout: 50000 });
        // await page.waitForTimeout(8000);
        const [pdfLink, pdfFileName] = link.trim().split(' ');

        const pdfSavePath = path.join(pdfFolderPath, pdfFileName);
        const tempDownloadPath = pdfSavePath.slice(0, -4);
        try{
            await downloadPDF(page, pdfLink, tempDownloadPath);
            await new Promise(resolve => setTimeout(resolve, 5000)); //timeout (waiting for the download to complete)
            log(`Processing link: ${pdfLink}; and path: ${pdfSavePath}`);
            await page.close();
            const files = fs.readdirSync(tempDownloadPath);
            log(`Files found in ${tempDownloadPath}: ${files}`);
            if (files.length > 0) {
                const tempFilePath = path.join(tempDownloadPath, files[0]);
                fs.renameSync(tempFilePath, pdfSavePath);
                log(`File moved and renamed to ${pdfSavePath}`);
            } else {
                console.error(`Error: No files found in ${tempDownloadPath}`);
            }
            // Удаляем временную папку
            try {
                fs.rmSync(tempDownloadPath, { recursive: true });
                log(`Temporary folder deleted at ${path.dirname(tempDownloadPath)}`);
                log(`PDF downloaded successfully from ${pdfLink} and saved as ${pdfSavePath}`);
            } catch (error) {
                log("Cannot remove dir: ", error)
            }
        } catch (error) {
            log(`Cant download PDF file: ${error}`)
        }
    }
    await browser.close();
}

async function downloadPDF(page, pdfLink, tempDownloadPath) {
    await page._client().send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: tempDownloadPath
    });
    //await page.setViewport({ width: 1280, height: 720 });
    await page.goto(pdfLink, { waitUntil: 'networkidle2', timeout: 50000 }); // Переход на пустую страницу
    await page.evaluate(() => {
        // Создание кнопки
        const downloadButton = document.querySelector("#link-pdf a");
        if (downloadButton){
            downloadButton.click();
            downloadButton.remove();
        }
    });

    // Ожидание завершения скачивания
    await page.waitForTimeout(4000);
}

module.exports = {downloadPDFs, downloadPDF };