const puppeteer = require('puppeteer-extra');
const StealhPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { shouldChangeIP } = require('./tor-config');

puppeteer.use(StealhPlugin());

async function downloadPDFs(linksFilePath, pdfFolderPath) {
    const links = fs.readFileSync(linksFilePath, 'utf-8').split('\n');

    const browser = await puppeteer.launch({
        args: ['--proxy-server=127.0.0.1:8118'],
        headless: false //'new' for "true mode" and false for "debug mode (Browser open))"
    });
    const page = await browser.newPage();

    for (const link of links) {
        if (!link.trim()) {
            continue;
        }

        const [pdfLink, pdfFileName] = link.trim().split(' ');

        const pdfSavePath = path.join(pdfFolderPath, pdfFileName);
        const tempDownloadPath = pdfSavePath.slice(0, -4);

        try {
            await downloadPDF(page, pdfLink, tempDownloadPath);
            console.log(`PDF downloaded successfully from ${pdfLink} and saved as ${pdfSavePath}`);
            await shouldChangeIP(page)
            await new Promise(resolve => setTimeout(resolve, 3000));

            // Получаем список файлов во временной папке
            // const files = fs.readdirSync(tempDownloadPath);
            // console.log(`Files found in ${tempDownloadPath}: ${files}`);
            // // Перемещаем и переименовываем первый найденный файл
            // if (files.length > 0) {
            //     const tempFilePath = path.join(tempDownloadPath, files[0]);
            //     fs.renameSync(tempFilePath, pdfSavePath);
            //     console.log(`File moved and renamed to ${pdfSavePath}`);
            // } else {
            //     console.error(`Error: No files found in ${tempDownloadPath}`);
            // }
            // // Удаляем временную папку
            // fs.rmdirSync(path.dirname(tempDownloadPath), { recursive: true });
            // console.log(`Temporary folder deleted at ${path.dirname(tempDownloadPath)}`);

        } catch (error) {
            console.error(`Error downloading PDF from ${pdfLink}: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
            //changeTorIp();

            // ИЗ-ЗА ТОГО ЧТО КАЖДОЕ СКАЧИВАНИЕ ФАЙЛА - ВЫДАЕТ ОШИБКУ NET::ERR_ABORTED (ПОТОМУ ЧТО СКАЧИВАТЬ НЕЛЬЗЯ, ТО И ТУТ ЗАДАЕТСЯ РЕНЕЙМ ФАЙЛОВ)
            // Получаем список файлов во временной папке
            const files = fs.readdirSync(tempDownloadPath);
            console.log(`Files found in ${tempDownloadPath}: ${files}`);
            // Перемещаем и переименовываем первый найденный файл
            try{
                if (files.length > 0) {
                    const tempFilePath = path.join(tempDownloadPath, files[0]);
                    fs.renameSync(tempFilePath, pdfSavePath);
                    console.log(`File moved and renamed to ${pdfSavePath}`);
                } else {
                    console.error(`Error: No files found in ${tempDownloadPath}`);
                }
                // Удаляем временную папку
                fs.rmdirSync(tempDownloadPath, { recursive: true });
                console.log(`Temporary folder deleted at ${tempDownloadPath}`);
            } catch {
                console.log("error while deleting folder")
            }
        }
    }

    await browser.close();
}

async function downloadPDF(page, pdfLink, tempDownloadPath) {
    await page._client().send('Page.setDownloadBehavior', {
        behavior: 'allow',
        downloadPath: tempDownloadPath
    });
    await page.goto(pdfLink, { waitUntil: 'networkidle0', timeout: 30000 });
}

module.exports = {downloadPDFs, downloadPDF };