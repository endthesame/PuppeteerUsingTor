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
        
        let getMetaAttributes = (selectors, attribute, childSelector) => {
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
    
        function getTextFromElementWithoutSpan(elem) {
            let text = '';
            elem.childNodes?.forEach(node => {
                if (node.nodeName !== 'SPAN') {
                    text += node.textContent;
                }
            });
            return text.trim();
        }
    
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
    
        let title = document.querySelector('.si-title ')? document.querySelector('.si-title ').innerText.trim() : "";
        if (title === "") {
            title = getMetaAttribute(['meta[name="citation_title"]'], 'content');
        }
        let date = getMetaAttribute(['meta[name="citation_date"]'], 'content').match(/\d{4}/)?.[0] || '';
        if (date === "") {
            date = document.querySelector('.si-masthead__b__item.si-published')? document.querySelector('.si-masthead__b__item.si-published').innerText.match(/\d{4}/)? document.querySelector('.si-masthead__b__item.si-published').innerText.match(/\d{4}/)[0] : "" : "";
        }
        if (date.length == 4) {
            date = `${date}-01-01`;
        }
        let rawAuthors = Array.from(document.querySelectorAll('meta[name="citation_author"]')).map(author => author.content.trim())
        let authors = [... new Set(rawAuthors)].join('; ')
        if (authors == ""){
            rawAuthors = Array.from(document.querySelectorAll('a[data-analytics="item-detail-author-card-author-btn"]')).map(author => author.innerText.trim())
            authors = [... new Set(rawAuthors)].join('; ')
        }
        let mf_doi = getMetaAttribute(['meta[name="citation_doi"]'], 'content')
        if (mf_doi == ""){
            let doiArr = Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.includes("DOI")).map(elem => elem.querySelector('a').href.match(/doi.org\/(10.*)/)? elem.querySelector('a').href.match(/doi.org\/(10.*)/)[1] : "")
            if (doiArr.length > 0){
                mf_doi = doiArr[0];
            }
        }
        let lang = getMetaAttribute(['meta[name="citation_language"]'], 'content')
        if (lang === 'English'){
            lang = 'eng';
        }
        let publisher = getMetaAttribute(['meta[name="citation_publisher"]'], 'content')
        if (publisher == ""){
            let publisherArr = Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.includes("Publisher")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText: "")
            if (publisherArr.length > 0){
                publisher = publisherArr[0];
            }
        }
        let mf_journal = getMetaAttribute(['meta[name="citation_journal_title"]'], 'content')
        if (mf_journal == ""){
            mf_journal = document.querySelector('#mat-chip-list-1')? document.querySelector('#mat-chip-list-1').innerText.trim() : "";
        }
    
        let volume = getMetaAttribute(['meta[name="citation_volume"]'], 'content')
        let volumeArr = Array.from(document.querySelectorAll('.si-component')).filter(block => block.innerText.toLowerCase().includes("volume")).map(elem => elem.innerText.toLowerCase().match(/volume (\d+)/)? elem.innerText.toLowerCase().match(/volume (\d+)/)[1] : "");
        if (volumeArr.length > 0){
            volume = volumeArr[0];
        }
        if (volume == "" && Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("citation")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)[1] : "" : "")){
            volume = Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("citation")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)[1] : "" : "")[0] || "";
        }
    
        let issue = getMetaAttribute(['meta[name="citation_issue"]'], 'content')
        let issueArr = Array.from(document.querySelectorAll('.si-component')).filter(block => block.innerText.toLowerCase().includes("issue")).map(elem => elem.innerText.toLowerCase().match(/issue (\d+)/)? elem.innerText.toLowerCase().match(/issue (\d+)/)[1] : "");
        if (issueArr.length > 0){
            issue = issueArr[0];
        }
        if (issue == "" && Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("citation")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)[2] : "" : "")){
            issue = Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("citation")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/(\d+)\((\d+)\):\d+-\d+,/)[2] : "" : "")[0] || "";
        }
    
        let print_issn = "";
        let e_issn = "";
        let rawIssnsArr = Array.from(document.querySelectorAll('meta[name="citation_issn"]')).map(elem => elem.content)
        let issns = [... new Set(rawIssnsArr)]
        if (issns.length == 2){
            print_issn = issns[0]
            e_issn = issns[1]
        }
        if (issns.length == 1){
            print_issn = issns[0]
        }
        let abstract = document.querySelector('#cdk-accordion-child-1 .si-data .si-data__set.si-wd-full .si-dataout__c')? document.querySelector('#cdk-accordion-child-1 .si-data .si-data__set.si-wd-full .si-dataout__c').innerText.trim() : "";
        let author_aff = Array.from(document.querySelectorAll('.si-authors .mat-card-header-text')).filter(elem => {
            let author = elem.querySelector('a[data-analytics="item-detail-author-card-author-btn"]')? elem.querySelector('a[data-analytics="item-detail-author-card-author-btn"]').innerText : "";
            let aff = elem.querySelector('a[data-analytics="item-detail-author-card-affiliation-btn"]')? elem.querySelector('a[data-analytics="item-detail-author-card-affiliation-btn"]').innerText : "";
            if (author.length > 1 && aff.length > 1){
                return true;
            } else {
                return false;
            }
        }).map(elem => {
            let author = elem.querySelector('a[data-analytics="item-detail-author-card-author-btn"]')? elem.querySelector('a[data-analytics="item-detail-author-card-author-btn"]').innerText : "";
            let aff = elem.querySelector('a[data-analytics="item-detail-author-card-affiliation-btn"]')? elem.querySelector('a[data-analytics="item-detail-author-card-affiliation-btn"]').innerText : "";
            if (author.length > 1 && aff.length > 1){
                return `${author}:${aff}`
            }
        }).join(";; ")
        let rawTopics = Array.from(document.querySelectorAll('[arialabel="Topics"] .ng-star-inserted')).map(elem => elem.innerText)
        let topics = [... new Set(rawTopics)].join(';') 
        let pages = "";
        if (pages == ""){
            let pagesArr = Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("pages")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim() : "")
            if (pagesArr.length > 0){
                pages = pagesArr[0];
            }
        }
        let first_page = getMetaAttribute(['meta[name="citation_firstpage"]'], 'content')
        let last_page = getMetaAttribute(['meta[name="citation_lastpage"]'], 'content')
        if (Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("citation")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/\(\d+\):(\d+)-(\d+),/)? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/\(\d+\):(\d+)-(\d+),/)[1] : "" : "")){
            first_page = Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("citation")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/\(\d+\):(\d+)-(\d+),/)? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/\(\d+\):(\d+)-(\d+),/)[1] : "" : "")[0] || "";
            last_page = Array.from(document.querySelectorAll('.si-data__set')).filter(block => block.innerText.toLowerCase().includes("citation")).map(elem => elem.querySelector('.si-dataout__c')? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/\(\d+\):(\d+)-(\d+),/)? elem.querySelector('.si-dataout__c').innerText.toLowerCase().trim().match(/\(\d+\):(\d+)-(\d+),/)[2] : "" : "")[0] || "";
        }
    
        var metadata = { '202': title, '200': authors, '233':mf_doi, '235': publisher, '203': date, '232': mf_journal, '184': print_issn, '185': e_issn, '205': lang, '81': abstract, '144': author_aff, '201': topics, '176':volume, '208': issue, '193': pages, '197': first_page, '198': last_page};
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
        console.error('Error saving HTML to file:', err);
      } else {
        console.log('HTML saved to file successfully');
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
            // pdfLinksToDownload = await page.evaluate((url) => {
            //     var pdfLinks = document.querySelector(".toolbar-inner-wrap .pdf")?document.querySelector(".toolbar-inner-wrap .pdf").href : "";
            //     if (!pdfLinks){
            //         return null;
            //     }
            //     return pdfLinks.replace("reader", "pdf").replace("epdf", "pdf");

            //     // const pdfLinks = Array.from(document.querySelectorAll("a[href]"))
            //     // .filter(a => a.href.match(/\/doi\/reader.*/))
            //     // .map(a => a.href.replace("reader", "pdf") + "?download=true");
            //     // return pdfLinks;
            // });
            let pdfLinksToDownload = url;
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
            await page.setViewport({ width: 1920, height: 1080 });

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'networkidle0', timeout: 50000 });
                    await page.waitForSelector('.mat-button-wrapper', { waitUntil: 'networkidle0', timeout: 50000 })

                    //await page.waitForTimeout(1000); // Задержка краулинга

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

async function parsing(jsonFolderPath,  htmlFolderPath,) {
    log('Parsing Starting.');
    {
        let browser;
        let page;

        try {
            browser = await puppeteer.launch({
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
            });

            page = await browser.newPage();

            const htmlFiles = fs.readdirSync(htmlFolderPath);
            const fieldsToUpdate = ['144', '146', '212', '199', '234'];
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
