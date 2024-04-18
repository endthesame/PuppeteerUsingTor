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
    
        let date = document.querySelector('.cover-date')? document.querySelector('.cover-date').innerText.trim().match(/\d{4}/)? document.querySelector('.cover-date').innerText.trim().match(/\d{4}/)[0] : "" : "";
        // if (date == ""){
        //     date = 
        // }
        if (date.length == 4){
            date = `${date}-01-01`;
        }

        const authors = Array.from(document.querySelectorAll('.loa')).filter(elem => elem.innerText.includes("author")).map(elem =>{
            let authorsArr = Array.from(elem.querySelectorAll('a')).map(author_block => author_block.innerText.trim())
            let authors_string = [... new Set(authorsArr)]
            return authors_string.join("; ")
        }).join("; ")
        const author_aff = Array.from(document.querySelectorAll('.loa')).filter(elem => elem.innerText.includes("author")).map(elem =>{
            let authorsArr = Array.from(elem.querySelectorAll('.hlFld-ContribAuthor')).map(author_block => {
              let author_name = author_block.querySelector('a').innerText.trim();
              let affs = Array.from(author_block.querySelectorAll('i')).map(aff => aff.innerText.trim()).join("!")
              return `${author_name}:${affs}`
            })
            let authors_string = [... new Set(authorsArr)]
            return authors_string.join(";; ")
        }).join(";; ")
        const editors = Array.from(document.querySelectorAll('.loa')).filter(elem => elem.innerText.includes("Editor-in-chief") || elem.innerText.includes("Edited By") || elem.innerText.includes("Associate editor")).map(elem =>{
            let authorsArr = Array.from(elem.querySelectorAll('a')).map(author_block => author_block.innerText.trim())
            let authors_string = [... new Set(authorsArr)]
            return authors_string.join("; ")
        }).join("; ")
        const editors_aff = Array.from(document.querySelectorAll('.loa')).filter(elem => elem.innerText.includes("Editor-in-chief") || elem.innerText.includes("Edited By") || elem.innerText.includes("Associate editor")).map(elem =>{
            let authorsArr = Array.from(elem.querySelectorAll('.hlFld-ContribAuthor')).map(author_block => {
              let author_name = author_block.querySelector('a').innerText.trim();
              let affs = Array.from(author_block.querySelectorAll('i')).map(aff => aff.innerText.trim()).join("!")
              return `${author_name}:${affs}`
            })
            let authors_string = [... new Set(authorsArr)]
            return authors_string.join(";; ")
        }).join(";; ")

        let mf_doi = getMetaAttributes(['meta[name="publication_doi"]'], 'content');
        if (mf_doi == ""){
            mf_doi = document.querySelector('.epub-section__doi__text')? document.querySelector('.epub-section__doi__text').href.replace('https://doi.org/', "") : "";
        }
        let book_series_raw = document.querySelector('.meta__seriestitle')? document.querySelector('.meta__seriestitle').innerText.trim(): "";
        let book_series = ""
        let volume = ""
        if (book_series_raw.includes(": Volume")){
            book_series = book_series_raw.match(/(.*): Volume.*/)[1].trim();
            volume = romanToNumberOrReturn(book_series_raw.match(/.*: Volume(.*)/)[1].trim());
        } else {
            book_series = book_series_raw;
        }
        let subtitle = document.querySelector('.meta__info .subtitle')? document.querySelector('.meta__info .subtitle').innerText.trim(): "";
        const mf_book = document.querySelector('.meta__title')? document.querySelector('.meta__title').innerText.trim(): "";
        const pages = document.querySelector('.pagecount')? document.querySelector('.pagecount').innerText.trim().match(/Pages: (\d+)/)? document.querySelector('.pagecount').innerText.trim().match(/Pages: (\d+)/)[1] : "": "";
        let mf_isbn = document.querySelector('#eisbndisplay')? document.querySelector('#eisbndisplay').innerText.match(/ISBN: (\d+-\d+-\d+-\d+-\d+)/)? document.querySelector('#eisbndisplay').innerText.match(/ISBN: (\d+-\d+-\d+-\d+-\d+)/)[1] : "" : "";
        if (mf_isbn == ""){
            mf_isbn = document.body.innerText.trim().match(/\s*ISBN:\s*(\d+-\d+-\d+-\d+-\d+)\s*\(hardcover\)\s*/)? document.body.innerText.trim().match(/\s*ISBN:\s*(\d+-\d+-\d+-\d+-\d+)\s*\(hardcover\)\s*/)[1] : "";
        }
        if (mf_isbn == ""){
            mf_isbn = document.body.innerText.trim().match(/\s*ISBN:\s*(\d+-\d+-\d+-\d+-\d+)\s*\(softcover\)\s*/)? document.body.innerText.trim().match(/\s*ISBN:\s*(\d+-\d+-\d+-\d+-\d+)\s*\(softcover\)\s*/)[1] : "";
        }
        const mf_eisbn = document.body.innerText.trim().match(/\s*ISBN:\s*(\d+-\d+-\d+-\d+-\d+)\s*\(ebook\)\s*/)? document.body.innerText.trim().match(/\s*ISBN:\s*(\d+-\d+-\d+-\d+-\d+)\s*\(ebook\)\s*/)[1] : "";
        //const publisher = getMetaAttributes(['meta[name="dc.Publisher"]'], 'content') || "";
        //const volume = (document.querySelector('.meta > strong > a')?.textContent.match(/Vol\. (\d+),/) || [])[1] || '';
        //const issue = (document.querySelector('.meta > strong > a')?.textContent.match(/No\. (\d+)/) || [])[1] || '';

        let language = getMetaAttributes(['meta[name="dc.Language"]'], 'content') || "";
        if (language == "en"){
            language = "eng";
        }
        if (language == "ru"){
            language = "rus";
        } 
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        const keywords = Array.from(document.querySelectorAll('div#keywords > ul > li')? document.querySelectorAll('div#keywords > ul > li') : "").map(elem => {return elem.innerText? elem.innerText : ""} ).join('; ') || "";
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        const abstract = Array.from(document.querySelectorAll('#aboutBook p')).filter(elem => !elem.innerText.includes("Sample Chapter")).map(elem => elem.innerText.trim()).join( )
        
        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        var metadata = { "203": date, "200": authors, "233": mf_doi, "242": mf_book, "205": language, "201": keywords, '81': abstract, '144':author_aff, '207': editors, '146': editors_aff, '176': volume, '212': subtitle, '243': book_series, '193': pages, '240': mf_isbn, '241': mf_eisbn};
        if (!mf_book)
        {
            metadata = false
        }

        return metadata;
    }, log);

    if (!meta_data)
    {
        console.log(`Skipping from ${url} due to lack of metadata (title).`);
        return false;
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
                return true; // Если нет open access, пропустить обработку URL
            }
        }

        if (isOpenAccess) {
            pdfLinksToDownload = await page.evaluate(() => {
                var pdfLinks = document.querySelector(".book-download > a")?document.querySelector(".book-download > a").href : "";
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
    return true;
}

async function crawl(jsonFolderPath, pdfFolderPath, siteFolderPath, linksFilePath, downloadPDFmark, checkOpenAccess) {
    mainLoop: while (true) {
        let browser;
        let page;

        try {
            // await changeTorIp();
            // await getCurrentIP();

            browser = await puppeteer.launch({
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                //args: ['--proxy-server=127.0.0.1:8118'],
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
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
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });

                    await page.waitForTimeout(2000); // Задержка краулинга

                    // if (await shouldChangeIP(page)) {
                    //     log(`Retrying after changing IP.`);
                    //     // Продолжаем внутренний цикл с новым браузером
                    //     continue mainLoop;
                    // }

                    // Проверка, что основной документ полностью загружен
                    await page.waitForSelector('body');
                    //ИЗМЕНЕНО ДЛЯ COLAB: ЕСЛИ НЕ НАЙДЕНО ЧТО-ТО ИЗ ВАЖНОЕ ИЗ МЕТЫ ТО СТОПИТСЯ ПРОЦЕСС
                    var isOkay = await extractData(page, jsonFolderPath, pdfFolderPath, siteFolderPath, url, downloadPDFmark, checkOpenAccess);

                    if (isOkay) {
                        log(`Successfully processed ${url}`);
                        // Убираем обработанную ссылку из файла
                        remainingLinks = remainingLinks.slice(1);
                        // Асинхронная запись в файл
                        fs.writeFileSync(linksFilePath, remainingLinks.join('\n'), 'utf-8', (err) => {
                            if (err) {
                                log(`Error writing to file: ${err.message}`);
                            }
                        });
                    } else {
                        log(`No important data, probably need to change IP: ${url}`);
                    }

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
