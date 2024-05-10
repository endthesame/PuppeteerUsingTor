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
    
        let title = document.querySelector('meta[name="citation_title"]')? document.querySelector('meta[name="citation_title"]').content.trim() : "";
        if (title == ""){
            title = document.querySelector('.article-title')? document.querySelector('.article-title').innerText.trim() : "";
        }

        let date = document.querySelector('meta[name="citation_date"]')? document.querySelector('meta[name="citation_date"]').content.trim().match(/\d{4}/)? document.querySelector('meta[name="citation_date"]').content.trim().match(/\d{4}/)[0] : "" : "";
        if (date.length == 4){
            date = `${date}-01-01`;
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

        let mf_doi = document.querySelector('meta[name="citation_doi"]')? document.querySelector('meta[name="citation_doi"]').content.trim() : "";
        if (mf_doi == ""){
            mf_doi = document.querySelector('.article-details')? document.querySelector('.article-details').innerText.trim().match(/DOI: (10.*)/)?document.querySelector('.article-details').innerText.trim().match(/DOI: (10.*)/)[1] : "" : "";
        }

        let mf_book = document.querySelector('.product-head-title')? document.querySelector('.product-head-title').innerText : "";
        if (mf_book == ""){
            mf_book = document.querySelector('meta[name="citation_conference"]')? document.querySelector('meta[name="citation_conference"]').content.trim() : "";
        }
        //let subtitle = "";
        //let book_series = ""; 
        let mf_isbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN Print:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN Print:\n?([0-9-]+)/)[1] : "": "";
        let mf_eisbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN Online:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN Online:\n?([0-9-]+)/)[1] : "": "";
        if (mf_isbn == ""){
            mf_isbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN CD:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN CD:\n?([0-9-]+)/)[1] : "": "";
        }
        if (mf_isbn == ""){
            let possible_isbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Print:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Print:\n?([0-9-]+)/)[1] : "": "";
            if (possible_isbn.length >= 10){
                mf_isbn = possible_isbn
            }
        }
        if (mf_isbn == ""){
            mf_isbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN:\n?([0-9-]+)/)[1] : "": "";
        }
        if (mf_eisbn == ""){
            let possible_eisbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Online:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Online:\n?([0-9-]+)/)[1] : "": "";
            if (possible_eisbn.length >= 10){
                mf_eisbn = possible_eisbn
            }
        }
        if (mf_eisbn == ""){
            mf_eisbn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN online:\n?([0-9-]+)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISBN online:\n?([0-9-]+)/)[1] : "": "";
        }

        let print_issn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Print:\n?(\d{4}-\d+[a-zA-Z]?)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Print:\n?(\d{4}-\d+[a-zA-Z]?)/)[1] : "": "";
        let e_issn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Online:\n?(\d{4}-\d+[a-zA-Z]?)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN Online:\n?(\d{4}-\d+[a-zA-Z]?)/)[1] : "": "";
        if (print_issn == ""){
            print_issn = document.querySelector('.product-head-serials')? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN:\n?(\d{4}-\d+[a-zA-Z]?)/)? document.querySelector('.product-head-serials').innerText.trim().match(/ISSN:\n?(\d{4}-\d+[a-zA-Z]?)/)[1] : "": "";
        }
        //let mf_issn = "";
        let publisher = document.querySelector('meta[name="citation_publisher"]')? document.querySelector('meta[name="citation_publisher"]').content.trim() : "";
        //const volume = "";
        let first_page = document.querySelector('.article-details')? document.querySelector('.article-details').innerText.trim().match(/pages (\d+)-(\d+)/)?document.querySelector('.article-details').innerText.trim().match(/pages (\d+)-(\d+)/)[1] : "" : "";
        let last_page = document.querySelector('.article-details')? document.querySelector('.article-details').innerText.trim().match(/pages (\d+)-(\d+)/)?document.querySelector('.article-details').innerText.trim().match(/pages (\d+)-(\d+)/)[2] : "" : "";
        if (first_page == "" && last_page == ""){
            first_page = document.querySelector('.article-details')? document.querySelector('.article-details').innerText.trim().match(/page (\d+)/)?document.querySelector('.article-details').innerText.trim().match(/page (\d+)/)[1] : "" : "";
            last_page = document.querySelector('.article-details')? document.querySelector('.article-details').innerText.trim().match(/page (\d+)/)?document.querySelector('.article-details').innerText.trim().match(/page (\d+)/)[1] : "" : "";
        }
        
        const type = 'chapter';
        let abstract = document.querySelector('.article_abstract')? document.querySelector('.article_abstract').innerText.replace("ABSTRACT\n","").trim() : "";

        let language = document.querySelector('meta[name="citation_language"]')? document.querySelector('meta[name="citation_language"]').content.trim() : "";
        if (language == "English"){
            language = "eng";
        }
    
        var metadata = {'202': title, '200': authors, '203': date, '240': mf_isbn, '241': mf_eisbn, '239': type, '242': mf_book, '144': author_aff, '81': abstract, '197':first_page, '198': last_page, '233': mf_doi, '184': print_issn, '185': e_issn, '235': publisher, '205':language};
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

    // (async () => {
    //     const htmlSource = await page.content();
    //     fs.writeFile(`${htmlFolderPath}/${baseFileName}.html`, htmlSource, (err) => {
    //       if (err) {
    //         console.error('Error saving HTML to file:', err);
    //       } else {
    //         console.log('HTML saved to file successfully');
    //       }
    //     });
    // })();

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
                var pdfLinks = document.querySelector(".intent_pdf_link")?document.querySelector(".intent_pdf_link").href : "";
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
            await page.setViewport({ width: 1600, height: 900 });

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

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
