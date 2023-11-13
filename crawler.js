const puppeteer = require('puppeteer-extra');
const { TimeoutError } = require('puppeteer');
const StealhPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const {changeTorIp, shouldChangeIP} = require('./tor-config');
const log = require('./logger');
const crypto = require('crypto');
const { getCurrentIP } = require('./utils');

puppeteer.use(StealhPlugin());

async function extractData(page, jsonFolderPath, pdfFolderPath, siteFolderPath, url, downloadPDFmark = true) {
    log(`Processing URL: ${url}`);
    const meta_data = await page.evaluate(() => {
        const getMetaContent = (selectors) => {
            const contents = [];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    const elementContents = Array.from(elements).map(element => element.content);
                    contents.push(elementContents.join(', '));
                }
            }
            return contents.join(', ');
        };
    
        const title = getMetaContent(['meta[name="citation_title"]']);
        const date = getMetaContent(['meta[name="citation_publication_date"]', 'meta[name="citation_online_date"]']);
        const authors = getMetaContent(['meta[name="citation_author"]']);
        const mf_doi = getMetaContent(['meta[name="citation_doi"]']);
        const mf_journal = getMetaContent(['meta[name="citation_journal_title"]']);
        const mf_issn = getMetaContent(['meta[name="citation_issn"]']);
        const publisher = getMetaContent(['meta[name="citation_publisher"]']);
        const orcid = getMetaContent(['meta[name="citation_author_orcid"]']);
        const volume = getMetaContent(['meta[name="citation_volume"]']);
        const issue = getMetaContent(['meta[name="citation_issue"]']);
        const first_page = getMetaContent(['meta[name="citation_firstpage"]']);
        const language = getMetaContent(['meta[name="citation_language"]']);
    
        const metadata = { "title": title, "date": date, "authors": authors, "mf_doi": mf_doi, "mf_journal": mf_journal, "mf_issn": mf_issn, "publisher": publisher, "orcid": orcid, "volume": volume, "issue": issue, "first_page": first_page, "language": language };
        // log(`Data extracted from ${url}`);
        // log(`Metadata: ${JSON.stringify(metadata)}`);
        return metadata;
    }, log);

    const data = meta_data;

    var pdfLinksToDownload = [];

    const encodedUrl = encodeURIComponent(url);
    const baseFileName = crypto.createHash('md5').update(encodedUrl).digest('hex');
    const jsonFileName = baseFileName + '.json';
    const jsonFilePath = path.join(jsonFolderPath, jsonFileName);
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(jsonFilePath, jsonData);

    if (downloadPDFmark) {

        // const pdfLinks = await page.$$eval('a', links => links.map(link => link.href));
        // pdfLinksToDownload = pdfLinks.filter(link => link.match(/.*content\/articlepdf.*/));
        pdfLinksToDownload = await page.evaluate(() => {
            const pdfLink = document.querySelectorAll('meta[name="citation_pdf_url"]');
            const pdfLinks = Array.from(pdfLink).map(pdfLink => pdfLink.content);
            return pdfLinks;
        });
        pdfLinksToDownload = [...new Set(pdfLinksToDownload)];

        for (const pdfLink of pdfLinksToDownload) {
            const pdfFileName = baseFileName + '.pdf';
            const linksTxtPath = path.join(siteFolderPath, 'Links.txt');
            fs.appendFileSync(linksTxtPath, `${pdfLink} ${pdfFileName}\n`);
        }
    }
}

async function crawl(jsonFolderPath, pdfFolderPath, siteFolderPath, linksFilePath) {
    mainLoop: while (true) {
        let browser;
        let page;

        try {
            await changeTorIp();
            await getCurrentIP();

            browser = await puppeteer.launch({
                args: ['--proxy-server=http://localhost:8118'],
                headless: false //'new' for "true mode" and false for "debug mode (Browser open))"
            });

            page = await browser.newPage();

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                    if (await shouldChangeIP(page)) {
                        log(`Retrying after changing IP.`);
                        // Продолжаем внутренний цикл с новым браузером
                        continue mainLoop;
                    }

                    // Проверка, что основной документ полностью загружен
                    await page.waitForSelector('body');
                    await extractData(page, jsonFolderPath, pdfFolderPath, siteFolderPath, url, downloadPDFmark = true);
                    log(`Successfully processed ${url}`);

                    // Убираем обработанную ссылку из файла
                    remainingLinks = remainingLinks.slice(1);
                    // Асинхронная запись в файл
                    fs.writeFileSync(linksFilePath, remainingLinks.join('\n'), 'utf-8', (err) => {
                        if (err) {
                            log(`Error writing to file: ${err.message}`);
                        }
                    });
                } catch (error) {
                    log(`Error processing ${url}: ${error.message}`);
                    // Продолжаем внутренний цикл при ошибке
                    continue;
                }
            }

            if (remainingLinks.length === 0) {
                log('No remaining links to crawl. Exiting.');
                break mainLoop; // Выход из внешнего цикла, если нет оставшихся ссылок
            }
        } catch (error) {
            log(`Error during crawling: ${error.message}`);
            await changeTorIp(); // Меняем IP при ошибке
        } finally {
            if (browser) {
                await browser.close(); // Закрываем текущий браузер
            }
        }
    }

    log('Crawling finished.');
}

module.exports = { crawl, extractData };
