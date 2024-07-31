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
        let getMetaAttribute = (selector, attribute, childSelector) => {
            const element = document.querySelector(selector);
            if (element) {
                const targetElement = childSelector ? element.querySelector(childSelector) : element;
                return targetElement.getAttribute(attribute) || "";
            }
            return "";
        };

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

        function romanToNumberOrReturn(input) {
            const romanNumerals = {
                'I': 1,
                'V': 5,
                'X': 10,
                'L': 50,
                'C': 100,
                'D': 500,
                'M': 1000,
                'i': 1,
                'v': 5,
                'x': 10,
                'l': 50,
                'c': 100,
                'd': 500,
                'm': 1000

            };
        
            // Проверка, является ли входное значение римской цифрой
            function isRoman(input) {
                return /^[IVXLCDMivxlcdm]+$/i.test(input);
            }
        
            // Если входное значение не является римской цифрой, возвращаем его без изменений
            if (!isRoman(input)) {
                return input;
            }
        
            let result = 0;
            let prevValue = 0;
        
            // Преобразование римской цифры в число
            for (let i = input.length - 1; i >= 0; i--) {
                let currentValue = romanNumerals[input[i]];
        
                if (currentValue < prevValue) {
                    result -= currentValue;
                } else {
                    result += currentValue;
                }
        
                prevValue = currentValue;
            }
        
            // Преобразование числа в строку и возвращение результата
            return result.toString();
        }
    
        let title = document.querySelector('.citation__title')? document.querySelector('.citation__title').innerText.trim().replaceAll("\n", " ") : "";
        if (title == ""){
            let rawTitle =  document.querySelector('meta[name="dc.Title"]') ? document.querySelector('meta[name="dc.Title"]').content : "";
            let titleSubtitle = document.querySelector('meta[name="dc.Title.Subtitle"]') ? document.querySelector('meta[name="dc.Title.Subtitle"]').content : "";
            if (titleSubtitle != ""){
                title = `${rawTitle} : ${titleSubtitle}`;
            } else {
                title = rawTitle;
            }
            
        }
        let date = getMetaAttribute(['meta[name="dc.Date"]'], 'content').match(/\d{4}/)? getMetaAttribute(['meta[name="dc.Date"]'], 'content').match(/\d{4}/)[0] : "";
        if (date == ""){
            date = document.querySelector('.CitationCoverDate')? document.querySelector('.CitationCoverDate').innerText.match(/\d{4}/)?document.querySelector('.CitationCoverDate').innerText.match(/\d{4}/)[0] : "" : "";
        }
        if (date == ""){
            date = document.querySelector('.core-date-published')? document.querySelector('.core-date-published').innerText.match(/\d{4}/)?document.querySelector('.core-date-published').innerText.match(/\d{4}/)[0] : "" : ""
        }
        if (date == ""){
            date = document.querySelector('.cover-date')? document.querySelector('.cover-date').innerText.match(/\d{4}/)? document.querySelector('.cover-date').innerText.match(/\d{4}/)[0] : "" : "";
        }
        if (date.length == 4){
            date = `${date}-01-01`;
        }
        // const authors = getMetaAttributes(['meta[name="dc.Creator"]'], 'content');
        let rawAuthors = Array.from(document.querySelectorAll('.loa__author-name span')).map(elem => elem.innerText)
        let authors = Array.from([...new Set(rawAuthors)]).join('; ')
        if (authors == ""){
            rawAuthors =  Array.from(document.querySelectorAll('meta[name="dc.Creator"]')).map(elem => elem.content) 
            authors = Array.from([...new Set(rawAuthors)]).join('; ')
        }
        if (authors == ""){
            rawAuthors =  Array.from(document.querySelectorAll('.authors span[property="author"]')).map(elem => elem.innerText)
            authors = Array.from([...new Set(rawAuthors)]).join('; ')
        }

        let mf_doi = getMetaAttributes(['meta[scheme="doi"]'], 'content'); 
        if (mf_doi == ""){
            mf_doi = document.querySelector('.issue-item__doi') ? document.querySelector('.issue-item__doi').innerText.replaceAll('https://doi.org/', '') : "";
        }
        if (mf_doi == ""){
            mf_doi = document.querySelector('meta[name="publication_doi"]')? document.querySelector('meta[name="publication_doi"]').content.trim() : "";
        }
        if (mf_doi == ""){
            mf_doi = document.querySelector('.core-self-citation .doi') ? document.querySelector('.core-self-citation .doi').innerText.replaceAll('https://doi.org/', '') : "";
        }
        if (mf_doi == ""){
            mf_doi = document.querySelector('.published-info')? document.querySelector('.published-info').innerText.trim().match(/DOI:(.*)/) ? document.querySelector('.published-info').innerText.trim().match(/DOI:(.*)/)[1].replace("https://doi.org/", "") : "" : "";
        }

        let mf_journal = getMetaAttributes(['meta[name="citation_journal_title"]'], 'content');
        if (mf_journal == ""){
            mf_journal = document.querySelector('.issue-item__detail .epub-section__title')? document.querySelector('.issue-item__detail .epub-section__title').innerText : "";
        }
        const mf_issn = document.querySelector('.cover-image__details-extra')? document.querySelector('.cover-image__details-extra').innerText.match(/^ISSN:\n?(\d{4}-\d{3}[a-zA-Z]|\d{4}-\d{4})/)? document.querySelector('.cover-image__details-extra').innerText.match(/^ISSN:\n?(\d{4}-\d{3}[a-zA-Z]|\d{4}-\d{4})/)[1] : "" : "";
        const mf_eissn = document.querySelector('.cover-image__details-extra')? document.querySelector('.cover-image__details-extra').innerText.match(/EISSN:\n?(\d{4}-\d{3}[a-zA-Z]|\d{4}-\d{4})/)? document.querySelector('.cover-image__details-extra').innerText.match(/EISSN:\n?(\d{4}-\d{3}[a-zA-Z]|\d{4}-\d{4})/)[1] : "" : "";
        const publisher = document.querySelector('.publisher__name')? document.querySelector('.publisher__name').innerText : "";
        let volume = document.querySelector('.issue-item__detail')? document.querySelector('.issue-item__detail').innerText.match(/Volume (\d+)/) ? document.querySelector('.issue-item__detail').innerText.match(/Volume (\d+)/)[1] : "" : "";
        if (volume == ""){
            volume = document.querySelector('.journal-meta .serial-info')? document.querySelector('.journal-meta .serial-info').innerText.match(/Volume (\d+)/) ? document.querySelector('.journal-meta .serial-info').innerText.match(/Volume (\d+)/)[1] : "" : "";
        }
        let issue = document.querySelector('.issue-item__detail')? document.querySelector('.issue-item__detail').innerText.match(/Issue (\d+)/) ? document.querySelector('.issue-item__detail').innerText.match(/Issue (\d+)/)[1] : "" : "";
        if (issue == ""){
            issue = document.querySelector('.journal-meta .serial-info')? document.querySelector('.journal-meta .serial-info').innerText.match(/Issue (\d+)/) ? document.querySelector('.journal-meta .serial-info').innerText.match(/Issue (\d+)/)[1] : "" : "";
        }
        let first_page = document.querySelector('.issue-item__detail')? document.querySelector('.issue-item__detail').innerText.match(/pp (\d+)–(\d+)/) ? document.querySelector('.issue-item__detail').innerText.match(/pp (\d+)–(\d+)/)[1] : "" : "";
        if (first_page == ""){
            first_page = document.querySelector('[property="pageStart"]')? document.querySelector('[property="pageStart"]').innerText : "";
        }
        let last_page = document.querySelector('.issue-item__detail')? document.querySelector('.issue-item__detail').innerText.match(/pp (\d+)–(\d+)/) ? document.querySelector('.issue-item__detail').innerText.match(/pp (\d+)–(\d+)/)[2] : "" : "";
        if (last_page == ""){
            last_page = document.querySelector('[property="pageEnd"]')? document.querySelector('[property="pageEnd"]').innerText : "";
        }
        let type = 'article'
        let editors = Array.from(document.querySelectorAll('.cover-image__details-extra ul[title="list of authors"] li')).map(elem => elem.firstChild.innerText).map(elem => elem.replace("Editors:", "")).map(elem => elem.replace("Editor:", "")).map(elem => elem.replace(",", "")).filter(function(element) {
            return element !== "" && element !== " ";
          }).join("; ");

        let language = getMetaAttributes(['meta[name="dc.Language"]'], 'content');
        if (language == "EN"){
            language = "eng";
        }
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        const keywords = getMetaAttribute(['meta[name="keywords"]'], 'content');
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        let abstract = document.querySelector('.abstractSection')? document.querySelector('.abstractSection').innerText.trim().replaceAll("\n", " ") : "";
        if (abstract == ""){
            abstract = document.querySelector('#abstract')? document.querySelector('#abstract').innerText.trim().replaceAll("\n", " ") : "";
        }
        
        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        var metadata = { "202": title, "203": date, "200": authors, "233": mf_doi, '197': first_page, '198': last_page, '232': mf_journal, '176': volume, '208': issue, '81': abstract, '235': publisher, '239': type, '201': keywords, '207': editors, '184': mf_issn, '185': mf_eissn, '205': language};
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

    const htmlSource = await page.content();
    fs.writeFile(`${htmlFolderPath}/${baseFileName}.html`, htmlSource, (err) => {
      if (err) {
        log('Error saving HTML to file:', err);
      } else {
        log('HTML saved to file successfully');
      }
    });

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
                let pdfLinks = document.querySelector(".pdf-file a")?document.querySelector(".pdf-file a").href : "";
                if (pdfLinks == ""){
                    pdfLinks = document.querySelector(".info-panel__item .btn--pdf")?document.querySelector(".info-panel__item .btn--pdf").href : "";
                }
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
            // await changeTorIp();
            // await getCurrentIP();

            browser = await puppeteer.launch({
                //args: ['--proxy-server=127.0.0.1:8118'],
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
            });

            page = await browser.newPage();
            await page.setViewport({ width: 1600, height: 900 });
            await page.setJavaScriptEnabled(false)

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                    //await page.waitForTimeout(3000); // Задержка краулинга

                    // if (await shouldChangeIP(page)) {
                    //     log(`Retrying after changing IP.`);
                    //     // Продолжаем внутренний цикл с новым браузером
                    //     continue mainLoop;
                    // }

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
            //await changeTorIp(); // Меняем IP при ошибке
        } finally {
            if (browser) {
                await browser.close(); // Закрываем текущий браузер
            }
        }
    }

    log('Crawling finished.');
}

module.exports = { crawl, extractData };
