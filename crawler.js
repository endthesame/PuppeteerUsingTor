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
    
        const title = getMetaAttributes(['meta[name="dc.Title"]'], 'content');
        const date = getMetaAttributes(['meta[name="dc.Date"]'], 'content');
        const authors = getMetaAttributes(['meta[name="dc.Creator"]'], 'content');
        const mf_doi = getMetaAttributes(['meta[scheme="doi"]'], 'content');
        const mf_journal = getMetaAttributes(['meta[name="citation_journal_title"]'], 'content');
        const mf_issn = document.querySelector('.article__info .rlist')? document.querySelector('.article__info .rlist').innerText.match(/Print ISSN:(\d+-\d+[A-Za-z]?)/)? document.querySelector('.article__info .rlist').innerText.match(/Print ISSN:(\d+-\d+[A-Za-z]?)/)[1] : "" : "";
        const mf_eissn = document.querySelector('.article__info .rlist')? document.querySelector('.article__info .rlist').innerText.match(/Online ISSN:(\d+-\d+[A-Za-z]?)/)? document.querySelector('.article__info .rlist').innerText.match(/Online ISSN:(\d+-\d+[A-Za-z]?)/)[1] : "" : "";
        const publisher = getMetaAttributes(['meta[name="dc.Publisher"]'], 'content') || "";
        const volume = document.querySelector('.article-cover-image span.volume')? document.querySelector('.article-cover-image span.volume').innerText.match(/Volume (.*)/)? document.querySelector('.article-cover-image span.volume').innerText.match(/Volume (.*)/)[1] : "" : "";
        const issue = document.querySelector('.article-cover-image span.issue')? document.querySelector('.article-cover-image span.issue').innerText.match(/Issue (.*)/)? document.querySelector('.article-cover-image span.issue').innerText.match(/Issue (.*)/)[1] : "" : "";
        // const first_page = getMetaAttributes(['meta[name="citation_firstpage"]'], 'content');
        // const last_page = getMetaAttributes(['meta[name="citation_lastpage"]'], 'content');
        //const language = getMetaAttributes(['meta[name="dc.Language"]'], 'content') || "";
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        const keywords = getMetaAttributes(['meta[name="keywords"]'], 'content');
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
    
        var metadata = { "202": title, "203": date, "200": authors, "233": mf_doi, '197': first_page, '198': last_page, '232': mf_journal, '184': mf_issn, '185': mf_eissn, '176': volume, '208': issue, '81': abstract, '235': publisher, '201': keywords};
        if (!title)
        {
            metadata = false
        }

        return metadata;
    }, log);

    if (!meta_data)
    {
        console.log(`Skipping from ${url} due to lack of metadata (title).`);
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
                var pdfLinks = document.querySelector(".article-coolBar--download .download_transportable a")?document.querySelector(".article-coolBar--download .download_transportable a").href : "";
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

async function crawl(jsonFolderPath, pdfFolderPath, siteFolderPath, linksFilePath, downloadPDFmark, checkOpenAccess) {
    mainLoop: while (true) {
        let browser;
        let page;

        try {
            // await changeTorIp();
            // await getCurrentIP();

            browser = await puppeteer.launch({
                //args: ['--proxy-server=127.0.0.1:8118'],
                headless: false //'new' for "true mode" and false for "debug mode (Browser open))"
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
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                    await page.waitForTimeout(3000); // Задержка краулинга

                    // if (await shouldChangeIP(page)) {
                    //     log(`Retrying after changing IP.`);
                    //     // Продолжаем внутренний цикл с новым браузером
                    //     continue mainLoop;
                    // }

                    // Проверка, что основной документ полностью загружен
                    await page.waitForSelector('body');

                    await extractData(page, jsonFolderPath, pdfFolderPath, siteFolderPath, url, downloadPDFmark, checkOpenAccess);
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
            // await changeTorIp(); // Меняем IP при ошибке
        } finally {
            if (browser) {
                await browser.close(); // Закрываем текущий браузер
            }
        }
    }

    log('Crawling finished.');
}

module.exports = { crawl, extractData };
