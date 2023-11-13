const puppeteer = require('puppeteer-extra');
const { TimeoutError } = require('puppeteer');
const StealhPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const changeTorIp = require('./tor-config');
const { downloadFile } = require('./download-utils');
const readline = require('readline');
const log = require('./logger');
const crypto = require('crypto');
const https = require('https');
const axios = require('axios');

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
        const pdfLinks = await page.$$eval('a', links => links.map(link => link.href));
        pdfLinksToDownload = pdfLinks.filter(link => link.match(/.*article\/.*\/pdf.*/));
        pdfLinksToDownload = [...new Set(pdfLinksToDownload)];

        for (const pdfLink of pdfLinksToDownload) {
            const pdfFileName = baseFileName + '.pdf';
            const linksTxtPath = path.join(siteFolderPath, 'Links.txt');
            fs.appendFileSync(linksTxtPath, `${pdfLink} ${pdfFileName}\n`);
        }
    }
}

async function shouldChangeIP(page) {
    const status = await page.evaluate(() => {
        return document.readyState; // Используйте любые данные или свойства, которые позволяют вам определить состояние страницы.
    });
    const currentURL = page.url();

    // Условие для смены IP-адреса, включая статус код и паттерн в URL
    if (status > 399 || currentURL.includes("hcvalidate.perfdrive")) {
        await new Promise(resolve => setTimeout(resolve, 15000)); // чтобы тор не таймаутил
        await changeTorIp();
        log('IP address changed successfully.');
        await getCurrentIP();
        return true;
    }
    return false;
}

async function getCurrentIP() {
    return new Promise((resolve, reject) => {
        const request = require('request');

        const options = {
            url: 'https://api.ipify.org',
            proxy: 'http://127.0.0.1:8118', // Указание прокси
        };

        request(options, (error, response, body) => {
            if (!error && response.statusCode === 200) {
                log(`Current IP address: ${body}`);
                resolve(body);
            } else {
                log(`Error getting current IP address. Error: ${error.message}`);
                reject(error);
            }
        });
    });
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

async function main() {
    try {
        const hostNameForDir = process.argv[2] || "default_host_name";
        const outputFolderPath = path.join(__dirname, 'output');
        const siteFolderPath = path.join(outputFolderPath, hostNameForDir);
        const jsonFolderPath = path.join(siteFolderPath, 'jsons');
        const pdfFolderPath = path.join(siteFolderPath, 'pdfs');
        const linksFilePath = path.join(siteFolderPath, 'remaining_links.txt');

        // Создать структуру папок, если они не существуют
        if (!fs.existsSync(outputFolderPath)) fs.mkdirSync(outputFolderPath);
        if (!fs.existsSync(siteFolderPath)) fs.mkdirSync(siteFolderPath);
        if (!fs.existsSync(jsonFolderPath)) fs.mkdirSync(jsonFolderPath);
        if (!fs.existsSync(pdfFolderPath)) fs.mkdirSync(pdfFolderPath);

        // Копировать файл с ссылками
        fs.copyFileSync('your_links_file.txt', linksFilePath);

        await crawl(jsonFolderPath, pdfFolderPath, siteFolderPath, linksFilePath);
    } catch (error) {
        log(`Error during setup: ${error.message}`);
    }
}

main().catch((error) => {
    log(`Error during crawling: ${error.message}`);
    console.error(error);
});
