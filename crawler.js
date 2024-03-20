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
    
        let title = getMetaAttributes(['meta[name="citation_title"]'], 'content') || "";
        if (title == ""){
            title = document.querySelector('.wi-article-title')? document.querySelector('.wi-article-title').innerText : "";
        }
        let date = getMetaAttributes(['meta[name="citation_publication_date"]'], 'content').replaceAll("/","-") || "";
        if(date == ""){
            date = document.querySelector('.ii-pub-date')? document.querySelector('.ii-pub-date').innerText.match(/\d{4}/)? document.querySelector('.ii-pub-date').innerText.match(/\d{4}/)[0] : "" : "";
            if(date == ""){
                date = document.querySelector('.article-date')? document.querySelector('.article-date').innerText.match(/\d{4}/)? document.querySelector('.article-date').innerText.match(/\d{4}/)[0] : "" : "";
            }
        }
        if (date.length == 4){
            date = `${date}-01-01`
        }
        let authors = getMetaAttributes(['meta[name="citation_author"]'], 'content') || "";
        if (authors == ""){
            rawAuthorsArray = Array.from(document.querySelectorAll('.wi-authors .al-authors-list .al-author-name .linked-name')).map(elem => elem.innerText.trim())
            authors = Array.from([...new Set(rawAuthorsArray)]).join('; ')
        }
        let mf_doi = getMetaAttributes(['meta[name="citation_doi"]'], 'content') || "";
        if (mf_doi == ""){
            mf_doi = document.querySelector('.citation-doi')? document.querySelector('.citation-doi').innerText.replace("https://doi.org/", "") : "";
        }
        const mf_journal = getMetaAttributes(['meta[name="citation_journal_title"]'], 'content') || "";
        let mf_issn = (Array.from(document.querySelectorAll('.journal-footer-colophon li')).map(elem => elem.innerText).find(elem => elem.includes("Print ISSN")) || "").replace("Print ISSN","").trim();
        let mf_eissn = (Array.from(document.querySelectorAll('.journal-footer-colophon li')).map(elem => elem.innerText).find(elem => elem.includes("Online ISSN")) || "").replace("Online ISSN","").trim();
        if (mf_issn == "" && mf_eissn == ""){
            mf_issn = getMetaAttributes(['meta[name="citation_issn"]'], 'content');
        }
        const publisher = getMetaAttributes(['meta[name="citation_publisher"]'], 'content') || "";
        const volume = getMetaAttributes(['meta[name="citation_volume"]'], 'content') || "";
        const issue = getMetaAttributes(['meta[name="citation_issue"]'], 'content') || "";
        // const volume = (document.querySelector('.volume--title')?.textContent.match(/Volume (\d+),/) || [])[1] || '';
        // const issue = (document.querySelector('.volume--title')?.textContent.match(/Issue (\d+)/) || [])[1] || '';

        // var pagesElement = document.querySelector('.volume--pages');
        // var pagesTextContent = pagesElement ? pagesElement.textContent : '';
        // var match = pagesTextContent.match(/Pages (\d+)-(\d+),/);

        // var first_page = match ? match[1] || '' : '';
        // var last_page = match ? match[2] || '' : '';
        const first_page = romanToNumberOrReturn(getMetaAttributes(['meta[name="citation_firstpage"]'], 'content')) || "";
        const last_page = romanToNumberOrReturn(getMetaAttributes(['meta[name="citation_lastpage"]'], 'content')) || "";
        let language = document.querySelector('script[type="application/ld+json"]') ? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)[1] : "" : "";;
        if (language == "en"){
            language = "eng";
        }
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        let keywords = document.querySelector('.content-metadata-keywords')? document.querySelector('.content-metadata-keywords').innerText.replace("Keywords:", "").trim() : "";
        //ABSTRACT
        const abstract = document.querySelector(".abstract")? document.querySelector(".abstract").textContent.trim() : "";
        
        const docType = document.querySelector('.article-client_type')? document.querySelector('.article-client_type').innerText.trim() : "";
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        var metadata = { "202": title, "203": date, "200": authors, "233": mf_doi, "235": publisher, "232": mf_journal, "176": volume, "208": issue, '81': abstract, '197': first_page, '198': last_page, '144': affiliation, '184': mf_issn, '185': mf_eissn, '201': keywords, '205': language, '239': docType};
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
                var pdfLinks = document.querySelector('.article-pdfLink')? document.querySelector('.article-pdfLink').href : '';
                if (!pdfLinks){
                    return null;
                }
                return pdfLinks.replace("epdf", "pdf");
                //"https://pubsonline.informs.org" + 

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

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 50000 });

                    //await page.waitForTimeout(3000); // Задержка краулинга

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
