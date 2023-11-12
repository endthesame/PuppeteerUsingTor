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

async function crawl() {
    try {
        await changeTorIp();
    } catch (error) {
        log(`Error changing IP address: ${error.message}`);
        //return;
    }

    // Получить текущий IP-адрес
    await getCurrentIP();

    const browser = await puppeteer.launch({
        args: ['--proxy-server=http://localhost:8118'], // Прокси через Privoxy      
        headless: false //'new' for "true mode" and false for "debug mode (Browser open))"
    });

    //const page = await browser.newPage();

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
        let page;
        while (retryCount < maxRetryCount) {
            try {
                if (page) {
                    await page.close(); // Закрываем предыдущую вкладку
                }
                page = await browser.newPage();
                await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
                if (await shouldChangeIP(page)) {
                    log(`Retrying (${retryCount}/${maxRetryCount}) after changing IP.`);
                    // await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
                    continue; // Перезагрузка страницы после смены IP
                }
                // Проверка, что основной документ полностью загружен
                await page.waitForSelector('body');
                await extractData(page, jsonFolderPath, pdfFolderPath, siteFolderPath, url, downloadPDFmark = true);
                log(`Successfully processed ${url}`);
                break; // Выход из цикла после успешной обработки страницы
            } catch (error) {
                log(`Error processing ${url}: ${error.message}`);
                retryCount++;
                log(`Retrying (${retryCount}/${maxRetryCount}) after an error.`);
            } finally {
                if (page && !page.isClosed()) {
                    await page.close(); // Закрываем текущую вкладку перед переходом к следующей итерации
                }
            }
        }

        if (retryCount === maxRetryCount) {
            log(`Failed to process ${url} after ${maxRetryCount} retries.`);
            // Обработка ситуации, когда не удается обработать страницу после нескольких попыток
        }
    }

    await browser.close();
    log('Crawling finished.');
    await downloadPDFs(path.join(siteFolderPath, 'Links.txt'), pdfFolderPath);
}

async function downloadPDF(pdfLink, pdfSavePath) {
    const proxyUrl = 'http://127.0.0.1:8118';
    const axiosInstance = axios.create({
        proxy: false,  // Отключаем автоматическую обработку прокси Axios
    });

    const response = await axiosInstance({
        method: 'get',
        url: pdfLink,
        responseType: 'stream',
        proxy: {
            protocol: 'http',
            host: '127.0.0.1',
            port: 8118
        }
    });

    const writer = fs.createWriteStream(pdfSavePath);

    return new Promise((resolve, reject) => {
        response.data.pipe(writer);

        let error = null;
        writer.on('error', (err) => {
            error = err;
            writer.close();
            reject(err);
        });

        writer.on('close', () => {
            if (!error) {
                console.log(`PDF downloaded successfully from ${pdfLink} and saved as ${pdfSavePath}`);
                resolve();
            }
        });
    });
}

async function downloadPDFs(linksFilePath, pdfFolderPath) {
    const links = fs.readFileSync(linksFilePath, 'utf-8').split('\n');

    for (const link of links) {
        if (!link.trim()) {
            continue;
        }

        const [pdfLink, pdfFileName] = link.trim().split(' ');

        const pdfSavePath = path.join(pdfFolderPath, pdfFileName);

        try {
            await downloadPDF(pdfLink, pdfSavePath);
            console.log(`PDF downloaded successfully from ${pdfLink} and saved as ${pdfSavePath}`);
        } catch (error) {
            console.error(`Error downloading PDF from ${pdfLink}: ${error.message}`);
        }
    }
}

// async function downloadPDFs(linksFilePath, pdfFolderPath) {
//     const browser = await puppeteer.launch({
//         args: ['--proxy-server=http://localhost:8118'], // Прокси через Privoxy      
//         headless: false //'new' for "true mode" and false for "debug mode (Browser open))"
//     });

//     const page = await browser.newPage();

//     const links = fs.readFileSync(linksFilePath, 'utf-8').split('\n');

//     for (const link of links) {
//         if (!link.trim()) {
//             continue;
//         }

//         const [pdfLink, pdfFileName] = link.trim().split(' ');

//         const pdfSavePath = path.join(pdfFolderPath, pdfFileName);

//         await page.goto(pdfLink, { waitUntil: 'networkidle2', timeout: 30000 });

//         // await page._client.send('Page.setDownloadBehavior', {
//         //     behavior: 'allow',
//         //     downloadPath: pdfSavePath 
//         // });
//         https.get(pdfLink, res => {
//             const stream = fs.createWriteStream(pdfSavePath);
//             res.pipe(stream);
//             stream.on('finish', () => {
//                 stream.close();
//             })
//         })

//         console.log(`PDF downloaded successfully from ${pdfLink} and saved as ${pdfSavePath}`);
//     }
//     await browser.close();
// }

crawl().catch((error) => {
    log(`Error during crawling: ${error.message}`);
    console.error(error);
});
