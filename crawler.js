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
    
        const title = document.querySelector('.f-s-7-1')? document.querySelector('.f-s-7-1').textContent : "" || document.querySelector('.articleTitleGroup > h1')? document.querySelector('.articleTitleGroup > h1').textContent : "";
        const date = (document.querySelector('.citation-text > div > span > div')?.textContent.match(/\b\d{4}\b/) ?? [])[0] || (document.querySelector('.articleCitationText')?.textContent.match(/\b\d{4}\b/) ?? [])[0] || "";
        const authors = Array.from(document.querySelectorAll('.linked-author')).map(element => element.textContent.trim()).join('; ') || Array.from(document.querySelectorAll('.authorGroup')).map(element => element.textContent.trim()).join('; ') || "";
        const mf_doi = (document.querySelector('.citation-text > div > span > div')?.textContent.trim().match(/https:\/\/doi\.org\/(.+)/) || [])[1] || "";
        var emText = document.querySelector('.citation-text > div > span > div > em')?.textContent;
        var articleEmText = document.querySelector('.articleCitationText > em')?.textContent;

        var [mf_journal, volume] = emText
        ? emText.split(',').map(item => item.trim())
        : articleEmText
            ? articleEmText.split(',').map(item => item.trim())
            : [null, null];
        // const mf_issn = (Array.from(document.querySelectorAll('.rlist li')).find(li => li.textContent.includes('Print ISSN'))?.querySelector('a')?.textContent || '').trim();
        // const mf_eissn = (Array.from(document.querySelectorAll('.rlist li')).find(li => li.textContent.includes('Online ISSN'))?.querySelector('a')?.textContent || '').trim();
        const issue = (document.querySelector('.citation-text > div > span > div')?.textContent.match(/(\d+)\((\d+)\)/) || [])[2] || (document.querySelector('.articleCitationText')?.textContent.match(/(\d+)\((\d+)\)/) || [])[2] || "";

        var emTextP = document.querySelector('.citation-text > div > span > div')?.textContent;
        var articleEmTextP = document.querySelector('.articleCitationText')?.textContent;

        var [mf_journal, volume] = emTextP
        ? emTextP.split(',').map(item => item.trim())
        : articleEmTextP
            ? articleEmTextP.split(',').map(item => item.trim())
            : [null, null];



        const citationTextContent = document.querySelector('.citation-text > div > span > div')?.textContent;
        const articleCitationTextContent = document.querySelector('.articleCitationText')?.textContent;
        
        const [first_page, last_page] = citationTextContent
            ? (citationTextContent.match(/(\d+)–(\d+)\./) || []).slice(1)
            : articleCitationTextContent
            ? (articleCitationTextContent.match(/(\d+)–(\d+)\./) || []).slice(1)
            : ["", ""];
        // const first_page = getMetaAttributes(['meta[name="citation_firstpage"]'], 'content');
        // const last_page = getMetaAttributes(['meta[name="citation_lastpage"]'], 'content');
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        // const keywords = getMetaAttributes(['head > meta[name="keywords"]'], 'content');
        //ABSTRACT
        const abstractXPath = '//*[@class="row abstract"]//text()';
        const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        const abstractTexts = [];
        for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
            abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        }
        const abstract = abstractTexts.join(' ');
        
        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        const metadata = { "202": title, "203": date, "200": authors, "233": mf_doi, "232": mf_journal, "176": volume, "208": issue, '81': abstract, '197': first_page, '198': last_page };
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
                var pdfLinks = document.querySelectorAll('a[title="PDF"]') || '';
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
            fs.appendFileSync(linksTxtPath, `${pdfLinksToDownload} ${pdfFileName}\n`);
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
                headless: false //'new' for "true mode" and false for "debug mode (Browser open))"
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

                    await extractData(page, jsonFolderPath, pdfFolderPath, siteFolderPath, url, downloadPDFmark = true, checkOpenAccess = false);   
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
