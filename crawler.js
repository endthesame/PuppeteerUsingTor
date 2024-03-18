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

async function extractData(page, jsonFolderPath, pdfFolderPath, htmlFolderPath, siteFolderPath, url, downloadPDFmark = true, checkOpenAccess = true) {
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

        // Функция для извлечения текста из элемента без span
        function getTextFromElementWithoutSpan(elem) {
            let text = '';
            elem.childNodes.forEach(node => {
                if (node.nodeName !== 'SPAN') {
                    text += node.textContent;
                }
            });
            return text.trim();
        }
    
        let title = getMetaAttributes(['meta[name="citation_title"]'], 'content');
        if (title == ""){
            title = getMetaAttributes(['meta[property="og:title"]'], 'content');
            if (title == ""){
                title = document.querySelector('.chapter-title')? document.querySelector('.chapter-title').innerText : "";
            }
        }
        let date = getMetaAttributes(['meta[name="citation_publication_date"]'], 'content').match(/\d{4}/)? getMetaAttributes(['meta[name="citation_publication_date"]'], 'content').match(/\d{4}/)[0] : "";
        if (date == ""){
            date = document.querySelector('.chapter-publication-date')? document.querySelector('.chapter-publication-date').innerText.match(/\d{4}/)? document.querySelector('.chapter-publication-date').innerText.match(/\d{4}/)[0] : "" : "";
        }
        if (date.length == 4){
            date = date = `${date}-01-01`;
        }
        let authors = getMetaAttributes(['meta[name="citation_author"]'], 'content');
        if (authors == ""){
            authors = Array.from(document.querySelectorAll('.authors .al-author-name')).map(elem => elem.innerText).join('; ')
        }
        let mf_doi = document.querySelector('meta[name="citation_doi"]')? document.querySelector('meta[name="citation_doi"]').content : "";
        if (mf_doi == ""){
            mf_doi = document.querySelector('.chapter-doi-link')? document.querySelector('.chapter-doi-link').innerText.replace("https://doi.org/", "") : "";
        }
        const h1Element = document.querySelector('.book-info__meta .book-info__title');
        const mf_book = getTextFromElementWithoutSpan(h1Element).trim().replaceAll('\n', '');
        const subtitle = document.querySelector(".book-info__title .subtitle")?document.querySelector(".book-info__title .subtitle").textContent.trim().replaceAll('\n', '') : "";
        const mf_eisbn = document.querySelector('.book-info__meta .book-info__isbn') ? document.querySelector('.book-info__meta .book-info__isbn').innerText.replaceAll('\n', " ").match(/ISBN electronic: (.*)/)? document.querySelector('.book-info__meta .book-info__isbn').innerText.replaceAll('\n', " ").match(/ISBN electronic: (.*)/)[1].replaceAll('-','') : "" : "";
        const publisher = document.querySelector('.book-info__meta .book-info__publisher-name') ? document.querySelector('.book-info__meta .book-info__publisher-name').innerText.replaceAll('\n', " ") : "";
        let book_series = document.querySelector('.book-series')? document.querySelector('.book-series').innerText : "";
        // const first_page = getMetaAttributes(['meta[name="citation_firstpage"]'], 'content');
        // const last_page = getMetaAttributes(['meta[name="citation_lastpage"]'], 'content');
        //const language = getMetaAttributes(['meta[name="dc.Language"]'], 'content') || "";
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        const keywords = Array.from(document.querySelectorAll('.kwd-part')).map(elem => elem.innerText).join('; ') || "";
        const type = document.querySelector('.chapterTopInfo  .chapter-groups') ? document.querySelector('.chapterTopInfo  .chapter-groups').innerText.replaceAll('\n', " ") : "";
        const editors = Array.from(document.querySelectorAll('.editors .al-author-name')).map(elem => elem.innerText).join('; ') || "";
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        const abstract = document.querySelector('.abstract')? document.querySelector('.abstract').innerText.replaceAll('\n', ' ') : Array.from(document.querySelectorAll('div[data-widgetname="ArticleFulltext"] p')).map(elem => elem.innerText.replace("\n", " ")).join(' ') || "";
        
        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        var metadata = { '202': title, '203': date, '200': authors, '233': mf_doi, '81': abstract, '235': publisher, '201': keywords, '207': editors, '242': mf_book, '212': subtitle, '241':mf_eisbn, '239': type, '243': book_series };
        if (!title || !mf_book)
        {
            metadata = false
        }

        return metadata;
    }, log);

    if (!meta_data)
    {
        console.log(`Skipping from ${url} due to lack of metadata (mf_book).`);
        return;
    }

    meta_data["217"] = url; //mf_url
    const data = meta_data;

    var pdfLinksToDownload = [];

    const encodedUrl = encodeURIComponent(url);
    const baseFileName = crypto.createHash('md5').update(encodedUrl).digest('hex');
    const jsonFileName = baseFileName + '.json';
    const jsonFilePath = path.join(jsonFolderPath, jsonFileName);
    const jsonData = JSON.stringify(data, null, 2);
    fs.writeFileSync(jsonFilePath, jsonData);

    (async () => {
        const htmlSource = await page.content();
        fs.writeFile(`${htmlFolderPath}/${baseFileName}.html`, htmlSource, (err) => {
          if (err) {
            console.error('Error saving HTML to file:', err);
          } else {
            console.log('HTML saved to file successfully');
          }
        });
      })();

    if (downloadPDFmark) {
        let isOpenAccess = true;
        if (checkOpenAccess) {
            isOpenAccess = await checkAccess(page);
    
            if (!isOpenAccess) {
                console.log(`Skipping downloading PDF from ${url} due to lack of open access.`);
                return; // Если нет open access, пропустить обработку URL
            }
        }

        if (isOpenAccess) {
            pdfLinksToDownload = await page.evaluate(() => {
                var pdfLinks = document.querySelector("#Toolbar .pdf")?document.querySelector("#Toolbar .pdf").href : "";
                if (!pdfLinks){
                    return null;
                }
                return pdfLinks.replace("reader", "pdf").replace("epdf", "pdf");

                // const pdfLinks = Array.from(document.querySelectorAll("a[href]"))
                // .filter(a => a.href.match(/\/doi\/reader.*/))
                // .map(a => a.href.replace("reader", "pdf") + "?download=true");
                // return pdfLinks;
            });
            // pdfLinksToDownload = [...new Set(pdfLinksToDownload)];

            if (pdfLinksToDownload){
                const pdfFileName = baseFileName + '.pdf';
                const linksTxtPath = path.join(siteFolderPath, 'Links.txt');
                fs.appendFileSync(linksTxtPath, `${pdfLinksToDownload} ${pdfFileName}\n`);
            }
        }
    }
}

async function crawl(jsonFolderPath, pdfFolderPath, htmlFolderPath, siteFolderPath, linksFilePath, downloadPDFmark, checkOpenAccess) {
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

            await page.setViewport({
                width: 1400,
                height: 800,
                deviceScaleFactor: 1,
              });

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                    await page.waitForTimeout(2000); // Задержка краулинга

                    if (await shouldChangeIP(page)) {
                        log(`Retrying after changing IP.`);
                        // Продолжаем внутренний цикл с новым браузером
                        continue mainLoop;
                    }

                    // Проверка, что основной документ полностью загружен
                    await page.waitForSelector('body');

                    await extractData(page, jsonFolderPath, pdfFolderPath, htmlFolderPath, siteFolderPath, url, downloadPDFmark, checkOpenAccess);
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
