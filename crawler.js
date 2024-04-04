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
    
        // let title = getMetaAttributes(['meta[name="citation_title"]'], 'content')
        // if (title == ""){
        //     title = document.querySelector('.chapter-title')? document.querySelector('.chapter-title').innerText.trim() : "";
        // }
        let date = document.querySelector('.volume--date')? document.querySelector('.volume--date').innerText.match(/\d{4}/)? document.querySelector('.volume--date').innerText.match(/\d{4}/)[0] : "" : "";
        if (date == ""){
            date = document.querySelector('main.content > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > p:nth-child(4) > b:nth-child(1)')? document.querySelector('main.content > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > p:nth-child(4) > b:nth-child(1)').innerText.match(/\d{4}/)? document.querySelector('main.content > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > p:nth-child(4) > b:nth-child(1)').innerText.match(/\d{4}/)[0] : "" : "";
        }
        if (date.length == 4){
            date = `${date}-01-01`;
        }
        let authors = getMetaAttributes(['meta[name="citation_author"]'], 'content');
        let editors = "";
        if (editors == ""){
            editors = document.querySelector('.volume-wrapper .xxlt-grey-bg')? document.querySelector('.volume-wrapper .xxlt-grey-bg').innerText.trim().match(/VOLUME EDITORS?\n?\s+(.*)/) ? document.querySelector('.volume-wrapper .xxlt-grey-bg').innerText.trim().match(/VOLUME EDITORS?\n?\s+(.*)/)[1].replace(", and ", ", ").replace(" and ", ", ").replace(",",";") : "" : "";
            if (editors == ""){
                editors = document.querySelector('main.content > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > p:nth-child(6)')? document.querySelector('main.content > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > p:nth-child(6)').innerText.replace(", and ", ", ").replace(" and ", ", ").replace(",",";") : "";
            }
        }

        let mf_doi = document.querySelector('meta[name="publication_doi"]')? document.querySelector('meta[name="publication_doi"]').content : "";

        let mf_book = document.querySelector('.volume--title')? document.querySelector('.volume--title').innerText.trim() : "";
        if (mf_book == ""){
            mf_book = document.querySelector('meta[property="og:title"]')? document.querySelector('meta[property="og:title"]').content.trim() : "";
            if (mf_book == ""){
                mf_book = document.querySelector('.col-lg-3 span[style="font-size:x-large"] b')? document.querySelector('.col-lg-3 span[style="font-size:x-large"] b').innerText : "";
            }
        }

        let book_series = 'Tutorials in Operations Research'

        let mf_isbn = document.querySelector('.volume-wrapper .xxlt-grey-bg')? document.querySelector('.volume-wrapper .xxlt-grey-bg').innerText.trim().match(/ISBN ([0-9-]+)/)? document.querySelector('.volume-wrapper .xxlt-grey-bg').innerText.trim().match(/ISBN ([0-9-]+)/)[1] : "" : "";
        if (mf_isbn == ""){
            mf_isbn = document.querySelector('main.content > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > p:nth-child(12) > span:nth-child(1) > b:nth-child(1)')? document.querySelector('main.content > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > p:nth-child(12) > span:nth-child(1) > b:nth-child(1)').innerText.match(/ISBN ([0-9-]+)/)? document.querySelector('main.content > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > p:nth-child(12) > span:nth-child(1) > b:nth-child(1)').innerText.match(/ISBN ([0-9-]+)/)[1] : "" : "";
        }
        // if (mf_isbn == ""){
        //     printIsbn = Array.from(document.querySelectorAll('.book-info__isbn')).map(elem => elem.innerText).filter(elem => elem.includes("Paperback ISBN:"));
        //     if (printIsbn.length > 0){
        //         mf_isbn = printIsbn[0].replace("Paperback ISBN: ", "");
        //     }
        // }
        
        // let mf_eisbn = "";
        // let eIsbn = Array.from(document.querySelectorAll('.book-info__isbn')).map(elem => elem.innerText).filter(elem => elem.includes("ISBN electronic:"));
        // if (eIsbn.length > 0){
        //     mf_eisbn = eIsbn[0].replace("ISBN electronic: ", "");
        // }

        // let mf_issn = "";
        // let printIssn = Array.from(document.querySelectorAll('.book-info__isbn')).map(elem => elem.innerText).filter(elem => elem.includes("Print ISSN:"))
        // if (printIssn.length > 0){
        //     mf_issn = printIssn[0].replace("Print ISSN: ", "")
        // }
        
        let publisher = "INFORMS";
        // let volume = document.querySelector('.book-info__volume-number')? document.querySelector('.book-info__volume-number').innerText.trim(): "";
        // if (volume == "" && document.querySelector('.book-info__title').innerText.toLowerCase().includes("volume")){
        //     volume = 
        // }
        // let first_page = document.querySelector('#getCitation')? document.querySelector('#getCitation').innerText.trim().match(/pp. (\d+)-(\d+)/)? document.querySelector('#getCitation').innerText.trim().match(/pp. (\d+)-(\d+)/)[1] : "" : "";
        // if (first_page == ""){
        //     first_page = document.querySelector('.chapter-pagerange-value')? document.querySelector('.chapter-pagerange-value').innerText.trim().match(/(\d+) - (\d+)/)? document.querySelector('.chapter-pagerange-value').innerText.trim().match(/(\d+) - (\d+)/)[1] : "" : "";
        // }
        // let last_page = document.querySelector('#getCitation')? document.querySelector('#getCitation').innerText.trim().match(/pp. (\d+)-(\d+)/)? document.querySelector('#getCitation').innerText.trim().match(/pp. (\d+)-(\d+)/)[2] : "" : "";
        // if (last_page == ""){
        //     last_page = document.querySelector('.chapter-pagerange-value')? document.querySelector('.chapter-pagerange-value').innerText.trim().match(/(\d+) - (\d+)/)? document.querySelector('.chapter-pagerange-value').innerText.trim().match(/(\d+) - (\d+)/)[2] : "" : "";
        // }
        let pages = romanToNumberOrReturn(document.querySelector('.volume--pages')? document.querySelector('.volume--pages').innerText.match(/\d+/)? document.querySelector('.volume--pages').innerText.match(/\d+/)[0] : "" : "");
        if (pages == ""){
            pages = romanToNumberOrReturn(document.querySelector('main.content > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > p:nth-child(4) > span:nth-child(3)')? document.querySelector('main.content > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > p:nth-child(4) > span:nth-child(3)').innerText.match(/Pages (\d+)/)? document.querySelector('main.content > div:nth-child(3) > div:nth-child(1) > div:nth-child(1) > div:nth-child(2) > div:nth-child(1) > p:nth-child(4) > span:nth-child(3)').innerText.match(/Pages (\d+)/)[1] : "" : "");
        }
        const type = 'book';
        
        // let editorsArray = Array.from(document.querySelectorAll('.book-info__authors .editors .al-author-name .linked-name')).map(elem => elem.innerText.trim())
        // let editors = Array.from([...new Set(editorsArray)]).join('; ')

        // let language = document.querySelector('script[type="application/ld+json"]')? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)[1] : "" : "";
        // if (language == "en"){
        //     language = "eng";
        // }
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        //let rawKeywords =Array.from(document.querySelectorAll('#keywords_list .intent_text')).map(elem => elem.innerText.replaceAll(",", "").trim())
        //let keywords = "";
        // if (keywords == ""){
        //     keywords = getMetaAttributes(['meta[name="keywords"]'], 'content')
        // }   
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";

    
        // let orcids = Array.from(document.querySelectorAll('.loa .hlFld-Affiliation')).map(elem => {
        //     let authorNameElement = elem.querySelector('.loa-info-name');
        //     let orcidElements = elem.querySelectorAll('.loa-info-orcid');
          
        //     if(authorNameElement && orcidElements.length > 0) {
        //       let authorName = authorNameElement.innerText;
        //       let orcids = Array.from(orcidElements).map(aff => aff.innerText).join('!');
        //       return `${authorName}::${orcids}`;
        //     }
        //   }).filter(item => item !== undefined).join(";;");

        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        var metadata = { '200': authors, '203': date, '233': mf_doi, '240': mf_isbn, '239': type, '235': publisher, '243': book_series, '242': mf_book, '193': pages, '207': editors};
        if (!mf_book)
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
                var pdfLinks = document.querySelector(".toolbar-inner-wrap .pdf")?document.querySelector(".toolbar-inner-wrap .pdf").href : "";
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
            await page.setViewport({ width: 1280, height: 720 });

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

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

module.exports = { crawl, extractData };
