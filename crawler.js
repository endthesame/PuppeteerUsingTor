const puppeteer = require('puppeteer-extra');
const { TimeoutError } = require('puppeteer');
const StealhPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const {changeTorIp, shouldChangeIP} = require('./tor-config');
const log = require('./logger');
const crypto = require('crypto');
const { getCurrentIP, checkAccess } = require('./utils');

puppeteer.use(StealhPlugin());

async function extractData(page, jsonFolderPath, pdfFolderPath, siteFolderPath, url, downloadPDFmark = true, checkOpenAccess = true) {
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
            // if (values.length === 0) {
            //     return "";
            // }
            return values.join('; ');
        };
    
        const title = getMetaAttributes(['meta[name="citation_title"]'], 'content');
        const date = document.querySelector('meta[name="citation_publication_date"]') ? document.querySelector('meta[name="citation_publication_date"]').content : '';
        var uniqueAuthors = [];
        const authors = Array.from(document.querySelectorAll('.uk-article-author > a > small'))
                            .map(element => element.textContent.replace(/(?:\s*,\s*(?:editor|author))*/g, '').trim())
                            .filter(author => {
                                if (author && !uniqueAuthors.includes(author)) {
                                    uniqueAuthors.push(author);
                                    return true;
                                }
                                return false;
                            })
                            .join('; ');
        const mf_doi = getMetaAttributes(['meta[name="citation_doi"]'], 'content');
        // const mf_journal = getMetaAttributes(['meta[name="citation_journal_title"]'], 'content');
        // const mf_issn = getMetaAttributes(['meta[name="citation_issn"]'], 'content');
        const publisher = getMetaAttributes(['meta[name="citation_publisher"]'], 'content');
        // const volume = getMetaAttributes(['meta[name="citation_volume"]'], 'content');
        // const issue = getMetaAttributes(['meta[name="citation_issue"]'], 'content');
        const first_page = getMetaAttributes(['meta[name="citation_firstpage"]'], 'content');
        const last_page = getMetaAttributes(['meta[name="citation_lastpage"]'], 'content');
        const isbn = document.querySelector('.uk-article-isbn') ? 
                                            document.querySelector('.uk-article-isbn').textContent.includes('DOI') ?'' :
                                            document.querySelector('.uk-article-isbn').textContent.replace('ISBN: ', '') :'';
        // const language = getMetaAttributes(['meta[name="DC.Language"]'], 'content');
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        //keywords
        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        const metadata = { "202": title, "203": date, "200": authors, "233": mf_doi, "235": publisher, "197": first_page, "198": last_page, "240": isbn };
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
        let isOpenAccess = false;
        if (checkOpenAccess) {
            isOpenAccess = await checkAccess(page);
    
            if (!isOpenAccess) {
                console.log(`Skipping downloading PDF from ${url} due to lack of open access.`);
                return; // Если нет open access, пропустить обработку URL
            }
        }

        if (isOpenAccess) {
            pdfLinksToDownload = await page.evaluate(() => {
                const pdfLinks = Array.from(document.querySelectorAll("a[href]"))
                // .filter(a => a.href.match(/.*doi\/pdf\/.*/))
                .filter(a => a.href.match(/.*article-pdf\/.*/))
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
                // args: ['--proxy-server=127.0.0.1:8118'],
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
            });

            page = await browser.newPage();

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                    await page.waitForTimeout(3000); // Задержка краулинга

                    if (await shouldChangeIP(page)) {
                        log(`Retrying after changing IP.`);
                        // Продолжаем внутренний цикл с новым браузером
                        continue mainLoop;
                    }

                    // Проверка, что основной документ полностью загружен
                    await page.waitForSelector('body');

                    // ТОЛЬКО ДЛЯ ЭТОГО РЕСУРСА - ПРОВЕРКА НА 404 - В КНИГАХ
                    let isNotFound = false;
                    const element404 = await page.$('.uk-h1.uk-margin-small');
                    if (element404) {
                        isNotFound = await page.evaluate(element => element.textContent.includes('Not found'), element404);
                    }
                    if (isNotFound) {
                        log(`The page ${url} contains "Not found". Skipping extraction.`);
                        remainingLinks = remainingLinks.slice(1);
                        fs.writeFileSync(linksFilePath, remainingLinks.join('\n'), 'utf-8', (err) => {
                            if (err) {
                                log(`Error writing to file: ${err.message}`);
                            }
                        });
                        continue; // Пропускаем текущую ссылку и переходим к следующей
                    }

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
