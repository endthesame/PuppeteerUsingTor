const puppeteer = require('puppeteer-extra');
const { TimeoutError } = require('puppeteer');
const StealhPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const {changeTorIp, shouldChangeIP} = require('./tor-config');
const log = require('./logger');
const crypto = require('crypto');
const { getCurrentIP, checkAccess } = require('./utils');
//const { lang } = require('moment');

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

        function getOrcids() {
            let orcids = Array.from(document.querySelectorAll('.al-author-name')).map(author => {
                let authorName = author.querySelector('.linked-name')? author.querySelector('.linked-name').innerText : "";
                let orchid = author.querySelector('.info-card-location')? author.querySelector('.info-card-location').innerText.trim() : "";
                if (authorName.length > 2 && orchid.length > 2 && orchid.includes("orcid.org")){
                  return `${authorName}::${orchid}`
                }
            }).filter(item => item !== undefined).join(";; ")
            if (orcids == ""){
                orcids = Array.from(document.querySelectorAll('.al-author-name-more')).map(author => {
                    let authorName = author.querySelector('.linked-name')? author.querySelector('.linked-name').innerText : "";
                    let orchid = author.querySelector('.info-card-location')? author.querySelector('.info-card-location').innerText.trim() : "";
                    if (authorName.length > 2 && orchid.length > 2 && orchid.includes("orcid.org")){
                      return `${authorName}::${orchid}`
                    }
                }).filter(item => item !== undefined).join(";; ")
            }
            return orcids;
        }

        function getAff() {
            let affs = Array.from(document.querySelectorAll('.al-author-name')).map(author => {
                let authorName = author.querySelector('.linked-name')? author.querySelector('.linked-name').innerText : "";
                let aff = author.querySelector('.aff')? author.querySelector('.aff').innerText.trim() : "";
                if (authorName.length > 2 && aff.length > 2 ){
                  return `${authorName} : ${aff}`
                }
            }).filter(item => item !== undefined).join(";; ")
            if (affs == ""){
                affs = Array.from(document.querySelectorAll('.al-author-name-more')).map(author => {
                    let authorName = author.querySelector('.linked-name')? author.querySelector('.linked-name').innerText : "";
                    let aff = author.querySelector('.aff')? author.querySelector('.aff').innerText.trim() : "";
                    if (authorName.length > 2 && aff.length > 2 ){
                      return `${authorName} : ${aff}`
                    }
                }).filter(item => item !== undefined).join(";; ")
            }
            return affs;
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
          
        let affiliation = getAff();
        if (affiliation == ""){
            affiliation = extractAuthorsAndInstitutions();
        }
    
        let title = getMetaAttributes(['meta[name="citation_title"]'], 'content') || "";
        if (title == ""){
            title = document.querySelector('.article-title-main')? document.querySelector('.article-title-main').innerText.trim() : "";
        }
        let date = getMetaAttributes(['meta[name="citation_publication_date"]'], 'content').replaceAll("/","-") || "";
        if (date == ""){
            date = document.querySelector('.citation-date')? document.querySelector('.citation-date').innerText.match(/\d{4}/)? document.querySelector('.citation-date').innerText.match(/\d{4}/)[0] : "" : "";
        }
        if (date.length == 4){
            date = `${date}-01-01`;
        }
        let authors = getMetaAttributes(['meta[name="citation_author"]'], 'content') || "";
        if (authors == ""){
            authors = Array.from(document.querySelectorAll('.al-authors-list .linked-name')).map(author => author.innerText).join("; ");
        }
        let mf_doi = document.querySelector('meta[name="citation_doi"]')? document.querySelector('meta[name="citation_doi"]').content : "";
        if (mf_doi == ""){
            mf_doi = document.querySelector('.ww-citation-primary')? document.querySelector('.ww-citation-primary').textContent.match(/doi.org.*/)? document.querySelector('.ww-citation-primary').textContent.match(/doi.org.*/)[0].replace("doi.org/", "") : "" : "";
        }
        const mf_journal = getMetaAttributes(['meta[name="citation_journal_title"]'], 'content') || "";
        
        let mf_issn = "";
        let mf_eissn = "";
        Array.from(document.querySelectorAll('.journal-footer-colophon li')).map(elem => {
            let elemText = elem.innerText;
            if (elemText.includes("Online ISSN")){
                mf_eissn = elemText.replace("Online ISSN ", "");
            }
            else if (elemText.includes("Print ISSN")){
                mf_issn = elemText.replace("Print ISSN ", "");
            }
        })
        if (mf_issn == "" && mf_eissn == ""){
            let issns = Array.from(document.querySelectorAll('meta[name="citation_issn"]')).map(elem => elem.content);
            if (issns.length == 2){
                mf_issn = issns[0];
                mf_eissn = issns[1];
            }
            else if (issns.length == 1){
                mf_issn = issns[0];
            }
        }
        
        const publisher = getMetaAttributes(['meta[name="citation_publisher"]'], 'content') || "";
        const volume = getMetaAttributes(['meta[name="citation_volume"]'], 'content') || "";
        const issue = getMetaAttributes(['meta[name="citation_issue"]'], 'content') || "";
        // const volume = (document.querySelector('.volume--title')?.textContent.match(/Volume (\d+),/) || [])[1] || '';
        // const issue = (document.querySelector('.volume--title')?.textContent.match(/Issue (\d+)/) || [])[1] || '';

        let first_page = romanToNumberOrReturn(getMetaAttributes(['meta[name="citation_firstpage"]'], 'content') || "");
        let last_page = romanToNumberOrReturn(getMetaAttributes(['meta[name="citation_lastpage"]'], 'content') || "");
        if (first_page == "" && last_page == ""){
            first_page = document.querySelector('.ww-citation-primary')? document.querySelector('.ww-citation-primary').innerText.match(/Pages (\d+)–(\d+)/)? document.querySelector('.ww-citation-primary').innerText.match(/Pages (\d+)–(\d+)/)[1] : "" : "";
            last_page = document.querySelector('.ww-citation-primary')? document.querySelector('.ww-citation-primary').innerText.match(/Pages (\d+)–(\d+)/)? document.querySelector('.ww-citation-primary').innerText.match(/Pages (\d+)–(\d+)/)[2] : "" : "";
        }

        let language = document.querySelector('script[type="application/ld+json"]') ? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)[1] : "" : "";;
        if (language == "en"){
            language = "eng";
        }

        let author_orcids = getOrcids();

        const type = document.querySelector('.journal-info__format-label')? document.querySelector('.journal-info__format-label').innerText : "";
        // const language = getMetaAttributes(['meta[name="dc.Language"]'], 'content');
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        const keywords = Array.from(document.querySelectorAll('.kwd-part')).map(keyword => keyword.textContent.trim()).filter(Boolean).join('; ') || '';
        //ABSTRACT
        const abstract = document.querySelector(".abstract")? document.querySelector(".abstract").textContent.trim() : '';
    
        var metadata = { "202": title, "144": affiliation, "203": date, "200": authors, "233": mf_doi, "232": mf_journal, "184": mf_issn, "185": mf_eissn, "235": publisher, "176": volume, "208": issue, "197": first_page, "198": last_page, "205": language, "239": type, "201": keywords, "81": abstract, '234': author_orcids};
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
                let pdfLinks = document.querySelector(".article-pdfLink")? document.querySelector(".article-pdfLink").href : '';
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
            await page.setViewport({ width: 1280, height: 720 });
            await page.waitForTimeout(5000)

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

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
