const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

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

module.exports = { downloadPDF };