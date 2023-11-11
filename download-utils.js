const puppeteer = require('puppeteer');

async function downloadFile(url, savePath, page) {
    // const browser = await puppeteer.launch();
    // const page = await browser.newPage();

    await page.goto(url, { waitUntil: 'networkidle0' });
    await page.pdf({ path: savePath, format: 'A4', printBackground: true });

    // await browser.close();
}

module.exports = { downloadFile };