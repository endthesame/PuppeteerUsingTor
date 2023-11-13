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
        const getMetaAttributes = (selectors, attribute, childSelector) => {
            let values = [];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    values = Array.from(elements).map(element => {
                        const targetElement = childSelector ? element.querySelector(childSelector) : element;
                        return targetElement.getAttribute(attribute);
                    });
                    break; // Прерываем цикл после первого успешного поиска
                }
            }
            return values.join('; ');
        };
    
        const title = getMetaAttributes(['meta[name="citation_title"]'], 'content');
        const date = getMetaAttributes(['meta[name="citation_publication_date"]', 'meta[name="citation_online_date"]'], 'content');
        const authors = getMetaAttributes(['meta[name="citation_author"]'], 'content');
        const mf_doi = getMetaAttributes(['meta[name="citation_doi"]'], 'content');
        const mf_journal = getMetaAttributes(['meta[name="citation_journal_title"]'], 'content');
        const mf_issn = getMetaAttributes(['meta[name="citation_issn"]'], 'content');
        const publisher = getMetaAttributes(['meta[name="DC.publisher"]'], 'content');
        const volume = getMetaAttributes(['meta[name="citation_volume"]'], 'content');
        const issue = getMetaAttributes(['meta[name="citation_issue"]'], 'content');
        const first_page = getMetaAttributes(['meta[name="citation_firstpage"]'], 'content');
        const last_page = getMetaAttributes(['meta[name="citation_lastpage"]'], 'content');
        const language = getMetaAttributes(['meta[name="DC.Language"]'], 'content');
        const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');

        const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        const metadata = { "202": title, "203": date, "200": authors, "233": mf_doi, "232": mf_journal, "184": mf_issn, "235": publisher, "234": orcid, "176": volume, "208": issue, "197": first_page, "198": last_page, "205": language, "144": affiliation };
        // log(`Data extracted from ${url}`);
        // log(`Metadata: ${JSON.stringify(metadata)}`);
        return metadata;
    }, log);
    meta_data["217"] = url; //mf_url
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

        isOpenAccess = await page.evaluate(() => {
            // Проверка наличия элемента с классом .c__16
            const hasClassC16 = document.querySelector('.c__16');
            if (hasClassC16) {
                return true;
            } else { 
                return false;
            }
        });
        if (isOpenAccess) {
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
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
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
