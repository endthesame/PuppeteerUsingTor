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
          
            return result.join(";; ");
          }
          
        const affiliation = extractAuthorsAndInstitutions();

        let title = getMetaAttributes(['meta[name="citation_title"]'], 'content');
        if (title == ""){
            title = document.querySelector('.article-title')? document.querySelector('.article-title').innerText.trim() : "";
        }
        let date = document.querySelector('meta[name="citation_date"]')? document.querySelector('meta[name="citation_date"]').content.match(/\d{4}/)? document.querySelector('meta[name="citation_date"]').content.match(/\d{4}/)[0] : "" : "";
        if (date.length == 4){
            date = `${date}-01-01`
        }
        let rawAuthors = Array.from(document.querySelectorAll('.article-authors .article-author b')).map(author => author.innerText.trim())
        let authors = Array.from([...new Set(rawAuthors)]).join('; ')
        if (authors == "" || !authors){
            rawAuthors = Array.from(document.querySelectorAll('meta[name="citation_author"]')).map(elem => elem.content.trim())
            authors = Array.from([...new Set(rawAuthors)]).join('; ')
        }

        let author_aff = Array.from(document.querySelectorAll('.article-authors .article-author')).map(elem => {
            let author = elem.querySelector('b')?elem.querySelector('b').innerText.replace("(open in a new tab)").trim() : "";
            let aff = elem.querySelector('i')? elem.querySelector('i').innerText.replace("(open in a new tab)").trim() : "";
            if (aff != "" && author != ""){
                return `${author}:${aff}`;
            }
        }).filter(elem => elem != undefined).join(";; ")
        if (author_aff == ""){
            author_aff = affiliation;
        }

        let mf_doi = document.querySelector('meta[name="citation_doi"]')? document.querySelector('meta[name="citation_doi"]').content.trim() : "";
        if (mf_doi == ""){
            mf_doi = document.querySelector('.article-details')? document.querySelector('.article-details').innerText.trim().match(/DOI: (10.*)/)?document.querySelector('.article-details').innerText.trim().match(/DOI: (10.*)/)[1] : "" : "";
            if (mf_doi == ""){
                mf_doi = document.querySelector('.article-pages')? document.querySelector('.article-pages').innerText.trim().match(/DOI: (10.*)/)?document.querySelector('.article-pages').innerText.trim().match(/DOI: (10.*)/)[1] : "" : "";
            }
        }

        let mf_journal = getMetaAttributes(['meta[name="citation_journal_title"]'], 'content');
        if (mf_journal == ""){
            mf_journal = document.querySelector('.product-head-title')? document.querySelector('.product-head-title').innerText.trim() : "";
        }
        let print_issn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Print:\n?(\d{4}-\d+[a-zA-Z]?)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Print:\n?(\d{4}-\d+[a-zA-Z]?)/)[1] : "": "";
        let e_issn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Online:\n?(\d{4}-\d+[a-zA-Z]?)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Online:\n?(\d{4}-\d+[a-zA-Z]?)/)[1] : "": "";
        if (print_issn == ""){
            print_issn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN:\n?(\d{4}-\d+[a-zA-Z]?)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN:\n?(\d{4}-\d+[a-zA-Z]?)/)[1] : "": "";
        }
        let issns = Array.from(document.querySelectorAll('meta[name="citation_issn"]'))
        if (!print_issn && !e_issn){
            if (issns.length == 1){
                print_issn = issns[0]?.content.match(/\d{4}-\d+[a-zA-Z]?/)? issns[0]?.content.match(/\d{4}-\d+[a-zA-Z]?/)[0] : "";
            }
            if (issns.length > 1){
                print_issn = issns[0]?.content.match(/\d{4}-\d+[a-zA-Z]?/)? issns[0]?.content.match(/\d{4}-\d+[a-zA-Z]?/)[0] : "";
                e_issn = issns[1]?.content.match(/\d{4}-\d+[a-zA-Z]?/)? issns[1]?.content.match(/\d{4}-\d+[a-zA-Z]?/)[0] : "";
            }
        }

        let publisher = document.querySelector('meta[name="citation_publisher"]')? document.querySelector('meta[name="citation_publisher"]').content.trim() : "";
        
        let first_page = romanToNumberOrReturn(document.querySelector('.article-details')? document.querySelector('.article-details').innerText.match(/pp. ([a-zA-Z0-9]+)-([a-zA-Z0-9]+)/)? document.querySelector('.article-details').innerText.match(/pp. ([a-zA-Z0-9]+)-([a-zA-Z0-9]+)/)[1] : "" : "");
        let last_page = romanToNumberOrReturn(document.querySelector('.article-details')? document.querySelector('.article-details').innerText.match(/pp. ([a-zA-Z0-9]+)-([a-zA-Z0-9]+)/)? document.querySelector('.article-details').innerText.match(/pp. ([a-zA-Z0-9]+)-([a-zA-Z0-9]+)/)[2] : "" : "");
        if (first_page == "" && last_page == ""){
            first_page = document.querySelector('.article-details')? document.querySelector('.article-details').innerText.trim().match(/pages (\d+)-(\d+)/)?document.querySelector('.article-details').innerText.trim().match(/pages (\d+)-(\d+)/)[1] : "" : "";
            last_page = document.querySelector('.article-details')? document.querySelector('.article-details').innerText.trim().match(/pages (\d+)-(\d+)/)?document.querySelector('.article-details').innerText.trim().match(/pages (\d+)-(\d+)/)[2] : "" : "";
            if (first_page == "" && last_page == ""){
                first_page = document.querySelector('.article-details')? document.querySelector('.article-details').innerText.trim().match(/page (\d+)/)?document.querySelector('.article-details').innerText.trim().match(/page (\d+)/)[1] : "" : "";
                last_page = document.querySelector('.article-details')? document.querySelector('.article-details').innerText.trim().match(/page (\d+)/)?document.querySelector('.article-details').innerText.trim().match(/page (\d+)/)[1] : "" : "";
            }
        }
        const volume = document.querySelector('meta[name="citation_volume"]')? document.querySelector('meta[name="citation_volume"]').content.trim() : "";
        const issue = document.querySelector('meta[name="citation_issue"]')? document.querySelector('meta[name="citation_issue"]').content.trim() : "";
        const keywords = document.querySelector('meta[name="keywords"]')? document.querySelector('meta[name="keywords"]').content.trim().replaceAll(", ", "; ") : "";
        let language = document.querySelector('meta[name="citation_language"]')? document.querySelector('meta[name="citation_language"]').content.trim() : "";
        if (language == "English"){
            language = "eng";
        } 
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        //const keywords = Array.from(document.querySelectorAll('div#keywords > ul > li')? document.querySelectorAll('div#keywords > ul > li') : "").map(elem => {return elem.innerText? elem.innerText : ""} ).join('; ') || "";
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        let abstract = document.querySelector('.article_abstract')? document.querySelector('.article_abstract').innerText.replace("ABSTRACT\n","").trim() : "";
        if (abstract == ""){
            abstract = document.querySelector('.common-text')? document.querySelector('.common-text').innerText.trim() : "";
        }
        const type = "article"
        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        var metadata = { '202': title, '200': authors, '203': date, '81': abstract, '233': mf_doi, '184': print_issn, '185': e_issn, '201': keywords, '239': type, '232': mf_journal, '235': publisher, '144': author_aff, '176': volume, '208': issue, '205': language, '197': first_page, '198': last_page};
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
                var pdfLinks = document.querySelector('.article_get_access_link')? document.querySelector('.article_get_access_link').innerText === "Download"? document.querySelector('.article_get_access_link').href : '' : '';
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
                args: ['--proxy-server=127.0.0.1:8118'],
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
            });

            page = await browser.newPage();

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'networkidle0', timeout: 60000 });

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
