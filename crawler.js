const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const changeTorIp = require('./tor-config');
const { downloadFile } = require('./download-utils');

let dataBuffer = []; // Буфер для временного хранения данных

async function extractData(page, pdfFolderPath) {
    const data = await page.evaluate(() => {
        let authors_string = '';  // TODO: Extract this
        let full_abstract = '';  // TODO: Extract this
        let formatted_keywords = '';  // TODO: Extract this

        const metaContent = (name) => {
            const element = document.querySelector(`meta[name="${name}"]`);
            return element ? element.content : null;
        };
        return {
            title: metaContent('citation_title'),
            date: metaContent('citation_publication_date'),
            mf_doi: metaContent('citation_doi'),
            //author: authors_string,
            mf_journal: metaContent('citation_journal_title'),
            volume_info: metaContent('citation_volume'),
            issue_info: metaContent('citation_issue'),
            mf_issn: metaContent('citation_issn'),
            mf_publisher: metaContent('citation_publisher'),
            //abstract: full_abstract,
            //keywords: formatted_keywords,
            mf_url: window.location.href
        };
    });

    const [pdfLinkElement] = await page.$x('//a[contains(@href, ".pdf")]');
    if (pdfLinkElement) {
        data.pdf_link = await page.evaluate(el => el.href, pdfLinkElement);

        const pdfFileName = data.pdf_link.split('/').pop();
        const pdfSavePath = path.join(pdfFolderPath, pdfFileName);
        await downloadFile(data.pdf_link, pdfSavePath);
        
        data.path = pdfSavePath;
    }

    return data;
}

async function shouldChangeIP(page) {
    const status = page.status();
    const currentURL = page.url();

    if (status < 200 || status >= 400 || currentURL.includes("hcvalidate")) {
        await changeTorIp();  // функция из модуля tor-config.js
        return true;
    }
    return false;
}

async function saveDataToFile(data, filePath) {
    let existingData = [];
    if (fs.existsSync(filePath)) {
        existingData = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
    const combinedData = [...existingData, ...data];
    fs.writeFileSync(filePath, JSON.stringify(combinedData, null, 2));
}

async function navigateToRecordPages(page, pdfFolderPath, browser) {
    await page.waitForTimeout(10000);
    const journalLinks = await page.$$eval('a[href*="/journal/"]', links => links.map(link => link.href));
    for (const journalLink of journalLinks) {
        await page.goto(journalLink);

        //if (await shouldChangeIP(page)) continue;
        // 3. Нажимаем на кнопку #latestVolumeIssues.
        await page.click('#latestVolumeIssues');

        // 4. Из-за возможного асинхронного поведения сайта добавляем задержку или ожидаем какого-либо элемента.
        await page.waitForTimeout(5000);  // или используйте page.waitForSelector() для ожидания какого-либо элемента на странице.

        // 5. Если после нажатия на кнопку мы находимся на странице /issue/, переходим по ссылке с классом .mr-1.
        if (page.url().includes("/issue/")) {
            //if (await shouldChangeIP(page)) continue;
            await page.click('.mr-1');

            // 6. Собираем все ссылки, которые содержат /article/*/meta.
            const articleLinks = await page.evaluate(() => {
                return Array.from(document.querySelectorAll("a[href]"))
                    .filter(a => a.href.match(/.*\/article\/.*\/meta$/))
                    .map(link => link.href);
            });
            // const articleLinks = await page.$$eval('a[href*="/article/*/meta"]', links => links.map(link => link.href));
            console.log(articleLinks);
            for (const articleLink of articleLinks) {
                // Здесь вы можете перейти на каждую статью и собрать данные согласно вашему предыдущему коду.
                //if (await shouldChangeIP(page)) continue;
                const newPage = await browser.newPage();
                await newPage.goto(articleLink);
                const data = await extractData(page, pdfFolderPath);
                dataBuffer.push(data);

                if (dataBuffer.length >= 10){
                    saveDataToFile(dataBuffer, path.join(pdfFolderPath, 'metadata.json'));
                    dataBuffer = [];
                }

                await newPage.close();
                // fs.writeFileSync(path.join(pdfFolderPath, 'metadata.json'), JSON.stringify(data));
            }
        }
    }
}

async function crawl() {
    const browser = await puppeteer.launch({
        args: ['--proxy-server=127.0.0.1:8118'],
        headless: false
    });

    const page = await browser.newPage();
    await page.goto('https://iopscience.iop.org/journalList');

    const hostName = new URL(page.url()).hostname;
    const dataFolderPath = path.join(__dirname, hostName);
    const pdfFolderPath = path.join(dataFolderPath, 'pdf');

    if (!fs.existsSync(dataFolderPath)) fs.mkdirSync(dataFolderPath);
    if (!fs.existsSync(pdfFolderPath)) fs.mkdirSync(pdfFolderPath);

    await navigateToRecordPages(page, pdfFolderPath, browser);

    await browser.close();
}

crawl().catch(console.error);
