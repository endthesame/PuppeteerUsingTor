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

        // let firstPage, lastPage, year;

        // const tocHeadings = document.querySelectorAll('.article__tocHeading');

        // tocHeadings.forEach(heading => {
        //     const match = heading.textContent.match(/pp\. (\d+)-(\d+) \((\d{4})\)/) || [];
        //     [_, firstPage, lastPage, year] = match.map(item => item || '');
        // });
    
        const title = document.querySelector('.col-md-7 h1.h3')? document.querySelector('.col-md-7 h1.h3').innerText : ""
        var date = document.querySelector('.btn-info')? document.querySelector('.btn-info').getAttribute('data-content').trim().match(/\s*<br \/>eISBN:\s*(\d+-\d+-\d+-\d+-\d+),\s*(\d{4})/)? document.querySelector('.btn-info').getAttribute('data-content').trim().match(/\s*<br \/>eISBN:\s*(\d+-\d+-\d+-\d+-\d+),\s*(\d{4})/)[2] : "" : "";
        if (date.length == 4){
            date = `${date}-01-01`;
        }
        const authors = Array.from(document.querySelectorAll('.col-md-7 p a.text-secondary')).map(elem => {
            return elem.innerText;
          }).join("; ").replaceAll(" *","") || document.querySelector('#side-b p')? document.querySelector('#side-b p').innerText.trim().match(/Author\(s\):\s*(.*)/)? document.querySelector('#side-b p').innerText.trim().match(/Author\(s\):\s*(.*)/)[1].replaceAll('and', ", ") : "" : "" || "";
        const mf_doi = document.querySelector('.col-md-7')? document.querySelector('.col-md-7').innerText.trim().match(/\s*DOI:\s*(.*)\s*/)? document.querySelector('.col-md-7').innerText.trim().match(/\s*DOI:\s*(.*)\s*/)[1] : "" : "";
        const mf_book = document.querySelector('.media-body .pr-lg-3')? document.querySelector('.media-body .pr-lg-3').innerText : "";
        const mf_isbn = document.querySelector('a[data-original-title="Book Details"]')?document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>ISBN:\s*(\d+-\d+-\d+-\d+-\d+)\s*/)? document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>ISBN:\s*(\d+-\d+-\d+-\d+-\d+)\s*/)[1] : "" : "";
        const mf_eisbn = document.querySelector('a[data-original-title="Book Details"]')?document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>eISBN:\s*(\d+-\d+-\d+-\d+-\d+)\s*/)? document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>eISBN:\s*(\d+-\d+-\d+-\d+-\d+)\s*/)[1] : "" : "";
        //const publisher = getMetaAttributes(['meta[name="dc.Publisher"]'], 'content') || "";
        const volume = document.querySelector('.media-body .h6')? document.querySelector('.media-body .h6').innerText.match(/Volume: (\d+)/)? document.querySelector('.media-body .h6').innerText.match(/Volume: (\d+)/)[1] : "" : "";
        //const issue = getMetaAttributes(['meta[name="citation_issue"]'], 'content');
        const first_page = document.querySelector('.col-md-7')? document.querySelector('.col-md-7').innerText.trim().match(/\s*Pp:\s*(\d+)-(\d+)\s*/)? document.querySelector('.col-md-7').innerText.trim().match(/\s*Pp:\s*(\d+)-(\d+)\s*/)[1] : "" : "";
        const last_page = document.querySelector('.col-md-7')? document.querySelector('.col-md-7').innerText.trim().match(/\s*Pp:\s*(\d+)-(\d+)\s*/)?document.querySelector('.col-md-7').innerText.trim().match(/\s*Pp:\s*(\d+)-(\d+)\s*/)[2] : "" : "";
        //const language = getMetaAttributes(['meta[name="dc.Language"]'], 'content') || "";
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        const keywords = Array.from(document.querySelectorAll('.col-md-8 .card .card-body p')).map(elem => {
            var text = elem.innerText.trim();
            if (text.includes("Keywords:")){
              text = text.replaceAll("Keywords:", "");
            } else {
              text = "";
            }
						return text;
          }).join(" ") || "";
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        const abstract = Array.from(document.querySelectorAll('.col-md-8 .card .card-body p')).map(elem => {
            var text = elem.innerText.trim();
            if (text.includes("Keywords:")){
              text = "";
            }
			return text;
          }).join(" ") || "";
        
        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        var metadata = { "202": title, "200": authors, "233": mf_doi, '197': first_page, '198': last_page, '81': abstract, '242': mf_book, '240': mf_isbn, '241': mf_eisbn, '203': date, '176': volume, '201': keywords};
        if (!title)
        {
            metadata = false
        }
        // log(`Data extracted from ${url}`);
        // log(`Metadata: ${JSON.stringify(metadata)}`);
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
                var pdfLinks = document.querySelector("a.download-button")?document.querySelector("a.download-button").href : "";
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
            await changeTorIp();
            await getCurrentIP();

            browser = await puppeteer.launch({
                //args: ['--proxy-server=127.0.0.1:8118'],
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
