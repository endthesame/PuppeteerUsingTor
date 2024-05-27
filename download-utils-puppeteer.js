const puppeteer = require('puppeteer-extra');
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
            },
            plugins: {
                always_open_pdf_externally: true,
                plugins_disabled: ["Chrome PDF Viewer"],
            },
        }
    }));


    const links = fs.readFileSync(linksFilePath, 'utf-8').split('\n');

    let browser = await puppeteer.launch({
        args: ['--proxy-server=127.0.0.1:8118'],
        headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
    });

    for (const link of links) {
        if (!link.trim()) {
            continue;
        }
        let page = await browser.newPage();
        const [pdfLink, pdfFileName] = link.trim().split(' ');

        const pdfSavePath = path.join(pdfFolderPath, pdfFileName);
        const tempDownloadPath = pdfSavePath.slice(0, -4);
        try{
            await downloadPDF(page, pdfLink, tempDownloadPath);
            await new Promise(resolve => setTimeout(resolve, 30000)); //timeout (waiting for the download to complete)
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
            await browser.close();
            await changeTorIp();
            await new Promise(resolve => setTimeout(resolve, 20000));
            browser = await puppeteer.launch({
                args: ['--proxy-server=127.0.0.1:8118'],
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
            });
        }
    }
    await browser.close();
}

async function downloadPDF(page, pdfLink, tempDownloadPath) {
    await page._client().send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: tempDownloadPath
    });
    await page.goto('about:blank'); // Переход на пустую страницу

    await page.evaluate((pdfLink) => {
        // Создание кнопки
        const downloadButton = document.createElement('a');
        downloadButton.href = pdfLink;
        downloadButton.download = 'downloaded_file.pdf';
        downloadButton.style.display = 'none'; // Скрыть кнопку
        document.body.appendChild(downloadButton);

        downloadButton.click();
        downloadButton.remove();
    }, pdfLink);

    // Ожидание завершения скачивания
    //await page.waitForTimeout(6000);
}

module.exports = {downloadPDFs, downloadPDF };