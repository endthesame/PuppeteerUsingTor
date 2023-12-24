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

        function extractAuthorsAndInstitutions() {
            const authors = Array.from(document.querySelectorAll('meta[name="citation_author"]'));
            const institutions = Array.from(document.querySelectorAll('meta[name="citation_author_institution"]'));
          
            const result = [];
          
            for (const author of authors) {
                const authorName = author.getAttribute('content');
                const authorInstitutions = [];
            
                // сопоставление авторов и аффиляции
                let nextSibling = author.nextElementSibling;
                while (nextSibling && nextSibling.tagName === 'META' && nextSibling.getAttribute('name') === 'citation_author_institution') {
                authorInstitutions.push(nextSibling.getAttribute('content'));
                nextSibling = nextSibling.nextElementSibling;
                }
                if (authorInstitutions.length != 0) {
                    result.push(`${authorName} : ${authorInstitutions.join('!')}`);
                }
            }
          
            return result.join("; ");
          }
          
        const affiliation = extractAuthorsAndInstitutions();
    
        const title = getMetaAttributes(['meta[name="citation_title"]'], 'content') || "";
        const date = getMetaAttributes(['meta[name="citation_publication_date"]'], 'content') || "";
        const authors = getMetaAttributes(['meta[name="citation_author"]'], 'content') || "";
        const mf_doi = getMetaAttributes(['meta[name="citation_doi"]'], 'content') || "";
        const mf_book = document.querySelector('.book-info__title')? document.querySelector('.book-info__title').innerText.trim() : "";
        const mf_isbn = Array.from(document.querySelectorAll('.book-info__isbn'))
        .find(li => li.textContent.includes('ISBN print:'))
        ?.textContent.replace('ISBN print:', '').trim() || "";
        const mf_eisbn = Array.from(document.querySelectorAll('.book-info__isbn'))
                        .find(li => li.textContent.includes('ISBN electronic:'))
                        ?.textContent.replace('ISBN electronic:', '')
                        .trim() || '';
        const publisher = document.querySelector('.book-info__publisher-name')? document.querySelector('.book-info__publisher-name').innerText.trim() : "";
        const volume = document.querySelector('.book-info__volume-number')? document.querySelector('.book-info__volume-number').innerText.trim() : "";
        const typeOfArticle = getMetaAttributes(['meta[property="og:type"]'], 'content') || "";
        const subtitle = document.querySelector('.book-series')? document.querySelector('.book-series').innerText.trim() : "";
        // const volume = (document.querySelector('.volume--title')?.textContent.match(/Volume (\d+),/) || [])[1] || '';
        // const issue = (document.querySelector('.volume--title')?.textContent.match(/Issue (\d+)/) || [])[1] || '';

        // var pagesElement = document.querySelector('.volume--pages');
        // var pagesTextContent = pagesElement ? pagesElement.textContent : '';
        // var match = pagesTextContent.match(/Pages (\d+)-(\d+),/);

        // var first_page = match ? match[1] || '' : '';
        // var last_page = match ? match[2] || '' : '';
        // const first_page = getMetaAttributes(['meta[name="citation_firstpage"]'], 'content') || "";
        // const last_page = getMetaAttributes(['meta[name="citation_lastpage"]'], 'content') || "";
        // const language = getMetaAttributes(['meta[name="dc.Language"]'], 'content');
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        // const keywords = getMetaAttributes(['head > meta[name="keywords"]'], 'content');
        //ABSTRACT
        // const abstract = (document.querySelector(".abstract")? document.querySelector(".abstract").textContent.trim() : '') || "";
        
        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        const metadata = { "202": title, "203": date, "200": authors, "233": mf_doi, "235": publisher, "242": mf_book, "176": volume, '240': mf_isbn, '241': mf_eisbn, '239': typeOfArticle, '212': subtitle};
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
                var pdfLinks = document.querySelector('.article-pdfLink')? document.querySelector('.article-pdfLink').href : "";
                return pdfLinks.replace("epdf", "pdf");
                //"https://pubsonline.informs.org" + 

                // const pdfLinks = Array.from(document.querySelectorAll("a[href]"))
                // .filter(a => a.href.match(/\/doi\/reader.*/))
                // .map(a => a.href.replace("reader", "pdf") + "?download=true");
                // return pdfLinks;
            });
            // pdfLinksToDownload = [...new Set(pdfLinksToDownload)];


            const pdfFileName = baseFileName + '.pdf';
            const linksTxtPath = path.join(siteFolderPath, 'Links.txt');
            if (pdfLinksToDownload) {
                fs.appendFileSync(linksTxtPath, `${pdfLinksToDownload} ${pdfFileName}\n`);
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
                args: ['--proxy-server=127.0.0.1:8118'],
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
            });

            page = await browser.newPage();

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 50000 });

                    await page.waitForTimeout(3000); // Задержка краулинга

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
