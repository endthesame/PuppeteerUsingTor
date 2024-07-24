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

async function extractMetafields(page) {
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
            title = document.querySelector('.core-container h1[property="name"]')? document.querySelector('.core-container h1[property="name"]').innerText.trim().replaceAll("\n", " ") : "";
        }
        if (title == ""){
            title = document.querySelector('.item-meta .colored-block__title')? document.querySelector('.item-meta .colored-block__title').innerText.trim().replaceAll("\n", " ") : "";
        }
        if (title == ""){
            let rawTitle =  document.querySelector('meta[name="dc.Title"]') ? document.querySelector('meta[name="dc.Title"]').content : "";
            let titleSubtitle = document.querySelector('meta[name="dc.Title.Subtitle"]') ? document.querySelector('meta[name="dc.Title.Subtitle"]').content : "";
            title = `${rawTitle} : ${titleSubtitle}`;
            if (rawTitle == "" && titleSubtitle == ""){
                title = "";
            }
        }
        let date = getMetaAttribute(['meta[name="dc.Date"]'], 'content')?getMetaAttribute(['meta[name="dc.Date"]'], 'content').match(/\d{4}/)? getMetaAttribute(['meta[name="dc.Date"]'], 'content').match(/\d{4}/)[0] : "" : "";
        if (date == ""){
            date = document.querySelector('.CitationCoverDate')? document.querySelector('.CitationCoverDate').innerText.match(/\d{4}/)?document.querySelector('.CitationCoverDate').innerText.match(/\d{4}/)[0] : "" : "" || document.querySelector('.cover-date')? document.querySelector('.cover-date').innerText.match(/\d{4}/)? document.querySelector('.cover-date').innerText.match(/\d{4}/)[0] : "" : "";
        }
        if (date == ""){
            let rawDateBlocks = Array.from(document.querySelectorAll('.item-meta__info .item-meta-row')).filter(elem => elem.querySelector('.item-meta-row__label')?.innerText?.includes("Published")).map(divBlock => divBlock.querySelector('.item-meta-row__value')?.innerText)
            if (rawDateBlocks.length > 0){
                date = rawDateBlocks[0].match(/\d{4}/)? rawDateBlocks[0].match(/\d{4}/)[0] : "";
            }
        }
        if (date.length == 4){
            date = `${date}-01-01`;
        }
        // const authors = getMetaAttributes(['meta[name="dc.Creator"]'], 'content');
        let authors = "";
        let editors = "";
        let rawAuthorsDivBlock = document.querySelector('.item-meta__info .item-meta-row [title="list of authors"]')
        if (rawAuthorsDivBlock){
            let rawAuthorsArr = Array.from(rawAuthorsDivBlock.querySelectorAll('.item-meta__info .item-meta-row [title="list of authors"] li a span')).map(elem => elem.innerText.trim())
            if (rawAuthorsDivBlock.querySelector('.label')?.innerText?.includes("Editor")){
                editors = Array.from([...new Set(rawAuthorsArr)]).join('; ')
            } else {
                authors = Array.from([...new Set(rawAuthorsArr)]).join('; ')
            }
        }

        // let rawAuthors = Array.from(document.querySelectorAll('.loa__author-name span')).map(elem => elem.innerText)
        // let authors = Array.from([...new Set(rawAuthors)]).join('; ')
        // if (authors == ""){
        //     rawAuthors = Array.from(document.querySelectorAll('span[property="author"]')).map(elem => elem.innerText)
        //     authors = Array.from([...new Set(rawAuthors)]).join('; ')
        // }

        let mf_doi = getMetaAttribute(['meta[scheme="doi"]'], 'content'); 
        if (mf_doi == ""){
            mf_doi = document.querySelector('meta[name="publication_doi"]')? document.querySelector('meta[name="publication_doi"]').content.trim() : "";
        }
        if (mf_doi == ""){
            mf_doi = document.querySelector('.core-self-citation .doi') ? document.querySelector('.core-self-citation .doi').innerText.replaceAll('https://doi.org/', '') : "";
        }
        if (mf_doi == ""){
            mf_doi = document.querySelector('.published-info')? document.querySelector('.published-info').innerText.trim().match(/DOI:(.*)/) ? document.querySelector('.published-info').innerText.trim().match(/DOI:(.*)/)[1].replace("https://doi.org/", "") : "" : "";
        }

        const mf_issn = document.querySelector('.cover-image__details-extra')? document.querySelector('.cover-image__details-extra').innerText.match(/^ISSN:\n?(\d{4}-\d{3}[a-zA-Z]|\d{4}-\d{4})/)? document.querySelector('.cover-image__details-extra').innerText.match(/^ISSN:\n?(\d{4}-\d{3}[a-zA-Z]|\d{4}-\d{4})/)[1] : "" : "";
        const mf_eissn = document.querySelector('.cover-image__details-extra')? document.querySelector('.cover-image__details-extra').innerText.match(/EISSN:\n?(\d{4}-\d{3}[a-zA-Z]|\d{4}-\d{4})/)? document.querySelector('.cover-image__details-extra').innerText.match(/EISSN:\n?(\d{4}-\d{3}[a-zA-Z]|\d{4}-\d{4})/)[1] : "" : "";
        
        let mf_isbn = document.querySelector('.published-info')? document.querySelector('.published-info').innerText.trim().match(/ISBN:([0-9-]+)/) ? document.querySelector('.published-info').innerText.trim().match(/ISBN:([0-9-]+)/)[1] : "" : "";
        if (mf_isbn == ""){
            let rawISBN = Array.from(document.querySelectorAll('.item-meta-row')).filter(elem => elem.innerText.includes("ISBN")).map(elem => elem.innerText)
            if (rawISBN.length > 0){
                mf_isbn = rawISBN[0].match(/[0-9-]+/)? rawISBN[0].match(/[0-9-]+/)[0] : "";
            }
        }

        let publisher = document.querySelector('.publisher__name')? document.querySelector('.publisher__name').innerText : "";
        if (publisher == ""){
            let publisherBlock = Array.from(document.querySelectorAll('.item-meta__info .item-meta-row')).filter(elem => elem.querySelector('.item-meta-row__label')?.innerText?.includes("Publisher")).map(divBlock => divBlock.querySelector('.item-meta-row__value'))
            if (publisherBlock.length > 0){
                publisher = publisherBlock[0].querySelector('li')? publisherBlock[0].querySelector('li').innerText : "";
            }
        }
        
        let type = "conference"

        let language = getMetaAttribute(['meta[name="dc.Language"]'], 'content');
        if (language == "EN"){
            language = "eng";
        }
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
        let abstract = document.querySelector('.abstractSection')? document.querySelector('.abstractSection').innerText.trim().replaceAll("\n", " ").replaceAll("No abstract available.", "") : "";
        if (abstract == ""){
            abstract = document.querySelector('#abstract')? document.querySelector('#abstract').innerText.trim().replaceAll("\n", " ") : "";
        }

        let book_pages = document.querySelector('.cover-image__details .cover-pages')? document.querySelector('.cover-image__details .cover-pages').innerText.match(/\d+/)? document.querySelector('.cover-image__details .cover-pages').innerText.match(/\d+/)[0] : "" : "";
        if (book_pages == ""){
            book_pages = Array.from(document.querySelectorAll('.item-meta-row')).filter(elem => elem.innerText.includes("Pages")).map(elem => elem.innerText.trim().replaceAll("\n","").match(/\d+/)? elem.innerText.trim().replaceAll("\n","").match(/\d+/)[0] : "" ).join(";")
        }
        
        ///////////////////////////////////CONF META
        let conference_name = document.querySelector('.core-conference .core-conference-right a')? document.querySelector('.core-conference .core-conference-right a').innerText.trim() : "";
        let conference_dates = document.querySelector('.core-conference .core-conference-calender')? document.querySelector('.core-conference .core-conference-calender').innerText.trim() : "";
        let conference_place = document.querySelector('.core-conference .core-conference-map')? document.querySelector('.core-conference .core-conference-map').innerText.trim() : "";

        let conferenceBlock = Array.from(document.querySelectorAll('.item-meta__info .item-meta-row')).filter(elem => elem.querySelector('.item-meta-row__label')?.innerText?.includes("Conference")).map(divBlock => divBlock.querySelector('.item-meta-row__value'))
        let conferenceBlocksArr = []
        if (conferenceBlock.length > 0){
            conferenceBlocksArr = Array.from(conferenceBlock[0].querySelectorAll('div span')).map(elem => elem.innerText.trim())
        } else {
            let breadcrumbsArr = document.querySelectorAll('.article__breadcrumbs .article__tocHeading');
            if (breadcrumbsArr.length > 0) {
                conference_name = breadcrumbsArr[breadcrumbsArr.length - 1].innerText.trim();
            }
        }
        if (conferenceBlocksArr.length == 3){
            conference_name = conferenceBlocksArr[0] || "";
            conference_place = conferenceBlocksArr[1] || "";
            conference_dates = conferenceBlocksArr[2] || "";
        }
        else if (conferenceBlocksArr.length == 2){
            let conf_title = document.querySelector("h1.title")? document.querySelector("h1.title").innerText.trim().toLowerCase() : null;
            if (conf_title && conferenceBlocksArr[0].toLowerCase().includes(conf_title)){
                conference_name = conferenceBlocksArr[0] || "";
                if (!conferenceBlocksArr[1].match(/\d+/)){
                    conference_place = conferenceBlocksArr[1] || "";
                } else {
                    conference_dates = conferenceBlocksArr[1] || "";
                }
            } else {
                let breadcrumbsArr = document.querySelectorAll('.article__breadcrumbs .article__tocHeading');
                if (breadcrumbsArr.length > 0) {
                    conference_name = breadcrumbsArr[breadcrumbsArr.length - 1].innerText.trim();
                }
                conference_place = conferenceBlocksArr[0] || "";
                conference_dates = conferenceBlocksArr[1] || "";
            }
        }
        else if (conferenceBlocksArr.length == 1){
            let breadcrumbsArr = document.querySelectorAll('.article__breadcrumbs .article__tocHeading');
            if (breadcrumbsArr.length > 0) {
                conference_name = breadcrumbsArr[breadcrumbsArr.length - 1].innerText.trim();
            }
            if (conferenceBlocksArr[0].match(/\d+ - \d+, \d+/)){
                conference_dates = conferenceBlocksArr[0] || ""
            }
        }
    
        var metadata = { "202": title, "203": date, "200": authors, "233": mf_doi, '81': abstract, '235': publisher, '239': type, '201': keywords, '207': editors, '184': mf_issn, '185': mf_eissn, '205': language, '255': conference_place, '254': conference_name, '149': conference_dates, '193': book_pages, '240': mf_isbn};
        if (!title)
        {
            metadata = false
        }
        // log(`Data extracted from ${url}`);
        // log(`Metadata: ${JSON.stringify(metadata)}`);
        return metadata;
    });
    return meta_data;
}

async function extractData(page, jsonFolderPath, pdfFolderPath, htmlFolderPath, siteFolderPath, url, downloadPDFmark = true, checkOpenAccess = true) {
    log(`Processing URL: ${url}`);
    const meta_data = await extractMetafields(page);
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
                var pdfLinks = document.querySelector(".issue-downloads__item a")?document.querySelector(".issue-downloads__item a").href : "";
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
                    await new Promise(resolve => setTimeout(resolve, 1000));
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
            await changeTorIp(); // Меняем IP при ошибке
        } finally {
            if (browser) {
                await browser.close(); // Закрываем текущий браузер
            }
        }
    }

    log('Crawling finished.');
}

async function parsing(jsonFolderPath,  htmlFolderPath,) {
    log('Parsing Starting.');
    {
        let browser;
        let page;

        try {
            browser = await puppeteer.launch({
                //args: ['--proxy-server=127.0.0.1:8118'],
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
            });

            page = await browser.newPage();

            const htmlFiles = fs.readdirSync(htmlFolderPath);
            const fieldsToUpdate = ['149', '254', '255'];
            log(`Fields to update: ${fieldsToUpdate.join(", ")}`);
            for (const htmlFile of htmlFiles) {
                const htmlFilePath = path.join(htmlFolderPath, htmlFile);
                const jsonFilePath = path.join(jsonFolderPath, htmlFile.replace('.html', '.json'));
                if (fs.existsSync(jsonFilePath)) {
                    const urlToHtml = `file:///${htmlFilePath}`
                    //const urlToHtml = htmlFilePath
                    log(`Parsing html file: ${htmlFilePath}`);
                    await page.goto(urlToHtml, { waitUntil: 'domcontentloaded', timeout: 70000 });
                    
                    log(`Html loaded: ${htmlFilePath}`);
                    const updatedData = await extractMetafields(page);
                    log(`New data from html file: ${htmlFilePath} parsed`);
                    const jsonData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
                    for (const key of fieldsToUpdate) {
                        if (updatedData.hasOwnProperty(key)) {
                            jsonData[key] = updatedData[key];
                        }
                    }
                    log(`Metafields successfully updates`);
                    fs.writeFileSync(jsonFilePath, JSON.stringify(jsonData, null, 2));
                } else {
                    log(`html files ${htmlFilePath}, doesnt exist json file: ${jsonFilePath}`)
                }
            }
            
        } catch (error) {
            log(`Error during parsing: ${error.message}`);
        } finally {
            if (browser) {
                await browser.close(); // Закрываем текущий браузер
            }
        }
    }

    log('Parsing finished.');
}

module.exports = { crawl, extractData, parsing };
