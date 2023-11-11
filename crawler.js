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

puppeteer.use(StealhPlugin());

async function extractData(page, jsonFolderPath, pdfFolderPath, siteFolderPath, url, downloadPDF = true) {
    log(`Processing URL: ${url}`);
    const meta_data = await page.evaluate(() => {
        const getMetaContent = (selectors) => {
            for (const selector of selectors) {
                const element = document.querySelector(selector);
                if (element) {
                    return element.content;
                }
            }
            return '';
        };
    
        const title = getMetaContent(['meta[name="citation_title"]']);
        const date = getMetaContent(['meta[name="citation_publication_date"]', 'meta[name="citation_online_date"]']);
        const mf_doi = getMetaContent(['meta[name="citation_doi"]']);
        const mf_journal = getMetaContent(['meta[name="citation_journal_title"]']);
        const mf_issn = getMetaContent(['meta[name="citation_issn"]']);
        const publisher = getMetaContent(['meta[name="citation_publisher"]']);
        const orcid = getMetaContent(['meta[name="citation_author_orcid"]']);
        const volume = getMetaContent(['meta[name="citation_volume"]']);
        const issue = getMetaContent(['meta[name="citation_issue"]']);
        const first_page = getMetaContent(['meta[name="citation_firstpage"]']);
        const language = getMetaContent(['meta[name="citation_language"]']);
    
        const metadata = { "title": title, "date": date, "mf_doi": mf_doi, "mf_journal": mf_journal, "mf_issn": mf_issn, "publisher": publisher, "orcid": orcid, "volume": volume, "issue": issue, "first_page": first_page, "language": language };
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

    if (downloadPDF) {
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

async function crawl() {
    try {
        await changeTorIp();
    } catch (error) {
        log(`Error changing IP address: ${error.message}`);
        //return;
    }

    // Получить текущий IP-адрес
    const currentIP = await getCurrentIP();

    console.log('Текущий IP-адрес:', currentIP);


    const browser = await puppeteer.launch({
        args: ['--proxy-server=http://localhost:8118'], // Прокси через Privoxy      
        headless: 'new' //new for "true mode" and false for "debug mode (Browser open))"
    });

    const page = await browser.newPage();

    const hostNameForDir = process.argv[2] || "default_host_name";
    const outputFolderPath = path.join(__dirname, 'output');
    const siteFolderPath = path.join(outputFolderPath, hostNameForDir);
    const jsonFolderPath = path.join(siteFolderPath, 'jsons');
    const pdfFolderPath = path.join(siteFolderPath, 'pdfs');

    // Создать структуру папок, если они не существуют
    if (!fs.existsSync(outputFolderPath)) fs.mkdirSync(outputFolderPath);
    if (!fs.existsSync(siteFolderPath)) fs.mkdirSync(siteFolderPath);
    if (!fs.existsSync(jsonFolderPath)) fs.mkdirSync(jsonFolderPath);
    if (!fs.existsSync(pdfFolderPath)) fs.mkdirSync(pdfFolderPath);

    const rl = readline.createInterface({
        input: fs.createReadStream('your_links_file.txt') // Путь к файлу с ссылками
    });
    log('Crawling started.');
    for await (const line of rl) {
        const url = line.trim();
        const maxRetryCount = 3; // Максимальное количество попыток загрузки страницы после смены IP

        let retryCount = 0;
        while (retryCount < maxRetryCount) {
            try {
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
                if (await shouldChangeIP(page)) {
                    retryCount++;
                    log(`Retrying (${retryCount}/${maxRetryCount}) after changing IP.`);
                    continue; // Перезагрузка страницы после смены IP
                }
                await extractData(page, jsonFolderPath, pdfFolderPath, siteFolderPath, url, downloadPDF = true);
                log(`Successfully processed ${url}`);
                break; // Выход из цикла после успешной обработки страницы
            } catch (error) {
                log(`Error processing ${url}: ${error.message}`);
                retryCount++;
                log(`Retrying (${retryCount}/${maxRetryCount}) after an error.`);
            }
        }

        if (retryCount === maxRetryCount) {
            log(`Failed to process ${url} after ${maxRetryCount} retries.`);
            // Обработка ситуации, когда не удается обработать страницу после нескольких попыток
        }
    }

    await browser.close();
    log('Crawling finished.');
}

crawl().catch((error) => {
    log(`Error during crawling: ${error.message}`);
    console.error(error);
});
