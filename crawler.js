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
    
        let title = getMetaAttributes(['meta[name="dc.Title"]'], 'content')
        if (title == ""){
            title = document.querySelector('.article_header-title')? document.querySelector('.article_header-title').innerText.trim().replaceAll("\n", " ") : "";
        }
        var date = document.querySelector('.pub-date-value')? document.querySelector('.pub-date-value').innerText.match(/\d{4}/)?document.querySelector('.pub-date-value').innerText.match(/\d{4}/)[0] : "" : "";
        if (date.length == 4){
            date = `${date}-01-01`;
        }
        let authors = getMetaAttributes(['meta[name="dc.Creator"]'], 'content');
        if (authors == ""){
            let rawAuthors = Array.from(document.querySelectorAll('.hlFld-ContribAuthor')).map(elem => elem.innerText)
            authors = Array.from([...new Set(rawAuthors)]).join('; ')
        }

        const mf_doi = getMetaAttributes(['meta[scheme="doi"]'], 'content')
        if (mf_doi == ""){
            mf_doi = document.querySelector('.article_header-doiurl')?document.querySelector('.article_header-doiurl').innerText?.replaceAll('https://doi.org/', '').replace("DOI: ", "") : "";
        }
        const mf_journal = getMetaAttributes(['meta[name="citation_journal_title"]'], 'content');
        const mf_issn = '';
        const mf_eissn = '';
        let publisher = getMetaAttributes(['meta[name="dc.Publisher"]'], 'content')
        if (publisher == ""){
            publisher = document.querySelector('.NLM_publisher-name')? document.querySelector('.NLM_publisher-name').innerText : "";
        }
        let volume = document.querySelector('.cit-volume')? document.querySelector('.cit-volume').innerText.replaceAll(", ", "") : "";
        let issue = document.querySelector('.cit-issue')? document.querySelector('.cit-issue').innerText.replaceAll(", ", "") : "";
        const first_page = document.querySelector('.cit-pageRange')? document.querySelector('.cit-pageRange').innerText.match(/(\d+)–(\d+)/)? document.querySelector('.cit-pageRange').innerText.match(/(\d+)–(\d+)/)[1] : "" : "";
        const last_page = document.querySelector('.cit-pageRange')? document.querySelector('.cit-pageRange').innerText.match(/(\d+)–(\d+)/)? document.querySelector('.cit-pageRange').innerText.match(/(\d+)–(\d+)/)[2] : "" : "";
        //const pages = document.querySelector('.cover-pages')? document.querySelector('.cover-pages').innerText.match(/(\d+)\s+pages/)? document.querySelector('.cover-pages').innerText.match(/(\d+)\s+pages/)[1] : "" : "";
        const type = document.querySelector('.content-navigation__contentType')? document.querySelector('.content-navigation__contentType').innerText : "";
        // var editors = Array.from(document.querySelectorAll('.cover-image__details-extra ul[title="list of authors"] li')).map(elem => elem.firstChild.innerText).map(elem => elem.replace("Editors:", "")).map(elem => elem.replace("Editor:", "")).map(elem => elem.replace(",", "")).filter(function(element) {
        //     return element !== "" && element !== " ";
        //   }).join("; ");
        // if (editors.includes("Author")){
        //     editors = "";
        // }

        //const volume 

        let language = getMetaAttributes(['meta[name="dc.Language"]'], 'content');
        if (language == "EN"){
            language = "eng";
        }
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        const keywords = Array.from(document.querySelectorAll('.keyword')).map(elem => elem.innerText).join("; ");
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        const abstract = document.querySelector('#abstractBox')? document.querySelector('#abstractBox').innerText.trim().replaceAll("\n", " ") : "";
        let affiliation = Array.from(document.querySelectorAll('.loa .hlFld-Affiliation')).map(elem => {
            let authorNameElement = elem.querySelector('.loa-info-name');
            let affilationElements = elem.querySelectorAll('.loa-info-affiliations-info');
          
            if(authorNameElement && affilationElements.length > 0) {
              let authorName = authorNameElement.innerText;
              let affilation = Array.from(affilationElements).map(aff => aff.innerText).join('!');
              return `${authorName}:${affilation}`;
            }
        }).filter(item => item !== undefined).join(";;")

        let orcids = Array.from(document.querySelectorAll('.loa .hlFld-Affiliation')).map(elem => {
            let authorNameElement = elem.querySelector('.loa-info-name');
            let orcidElements = elem.querySelectorAll('.loa-info-orcid');
          
            if(authorNameElement && orcidElements.length > 0) {
              let authorName = authorNameElement.innerText;
              let orcids = Array.from(orcidElements).map(aff => aff.innerText).join('!');
              return `${authorName}::${orcids}`;
            }
          }).filter(item => item !== undefined).join(";;");

        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        var metadata = { '202': title, '200': authors, '203': date, '81': abstract, '233': mf_doi, '184': mf_issn, '185': mf_eissn, '201': keywords, '239': type, '232': mf_journal, '235': publisher, '144': affiliation, '176': volume, '208': issue, '234': orcids, '205': language, '197': first_page, '198': last_page};
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
                var pdfLinks = document.querySelector(".pdf-download__link")?document.querySelector(".pdf-download__link").href : "";
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
                //args: ['--proxy-server=127.0.0.1:8118'],
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
            });

            page = await browser.newPage();
            await page.setViewport({ width: 1600, height: 900 });

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

                    await page.waitForTimeout(1000); // Задержка краулинга

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
