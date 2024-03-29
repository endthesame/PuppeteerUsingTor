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
    
        let date = getMetaAttributes(['meta[name="citation_year"]'], 'content').match(/\d{4}/)? getMetaAttributes(['meta[name="citation_year"]'], 'content').match(/\d{4}/)[0] : "";
        if (date == ""){
            let dateArr = Array.from(document.querySelectorAll('.meta')).map(elem => elem.innerText).filter(elem => elem.includes("Year :"))
            if (dateArr.length > 0){
                date = dateArr[0].match(/\d{4}/)? dateArr[0].match(/\d{4}/)[0] : "";
            }
        }
        if (date.length == 4){
            date = `${date}-01-01`;
        }

        let bookAuthorsArray = Array.from(document.querySelectorAll('#numero .auteurs .auteur')).map(elem => elem.innerText.trim())
        let bookAuthors = Array.from([...new Set(bookAuthorsArray)]).join('; ')

        let mf_doi = document.querySelector('meta[name="citation_doi"]')? document.querySelector('meta[name="citation_doi"]').content : "";
        // if (mf_doi == ""){
        //     mf_doi = document.querySelector('.chapter-doi-link')? document.querySelector('.chapter-doi-link').innerText.replace("https://doi.org/", "") : "";
        // }

        let mf_book = document.querySelector('.titre-numero')? document.querySelector('.titre-numero').innerText.trim() : "";

        let subtitle = document.querySelector('.sous-titre-numero')? document.querySelector('.sous-titre-numero').innerText.trim() : "";
        // let book_version = "";
        // if (subtitle.includes("Edition") || subtitle.includes("Version")){
        //     book_version = subtitle;
        // }

        //let book_series = document.querySelector('.special-collections-wrap')? document.querySelector('.special-collections-wrap').innerText.trim().match(/Series: (.*)/)? document.querySelector('.special-collections-wrap').innerText.trim().match(/Series: (.*)/)[1] : "" : "";
        let mf_isbn = document.querySelector('#article-details')? document.querySelector('#article-details').innerText.match(/\nISBN (.*)/)? document.querySelector('#article-details').innerText.match(/\nISBN (.*)/)[1] : "" : "";
        let mf_eisbn = document.querySelector('#article-details')? document.querySelector('#article-details').innerText.match(/\nISBN digital (.*)/)? document.querySelector('#article-details').innerText.match(/\nISBN digital (.*)/)[1] : "" : "";

        if (mf_eisbn == "" && mf_isbn == ""){
            mf_isbn = document.querySelector('meta[name="citation_isbn"]')? document.querySelector('meta[name="citation_isbn"]').content : "";
        }

        let mf_issn = document.querySelector('meta[name="citation_issn"]')? document.querySelector('meta[name="citation_issn"]').content : "";
        
        let publisher = getMetaAttributes(['meta[name="citation_publisher"]'], 'content')
        if (publisher == ""){
            let publisherArr = Array.from(document.querySelectorAll('.meta')).map(elem => elem.innerText).filter(elem => elem.includes("Publisher :"))
            if (publisherArr.length > 0){
                publisher = publisherArr[0].replace("Publisher :", "").trim()
            }
        }
        const volume = romanToNumberOrReturn(document.querySelector(".article-meta")?document.querySelector(".article-meta").innerText.match(/Volume ([A-Z0-9])/)? document.querySelector(".article-meta").innerText.match(/Volume ([A-Z0-9])/)[1] : "" : "");

        let pages = "";
        let pagesArr = Array.from(document.querySelectorAll('.meta')).map(elem => elem.innerText).filter(elem => elem.includes("Pages :"));
        if (pagesArr.length > 0){
            pages = pagesArr[0].replace("Pages :", "").trim();
        }
        const type = "book";
        // let editorsArray = Array.from(document.querySelectorAll('.book-info__authors .al-authors-list.editors .linked-name')).map(elem => elem.innerText.trim())
        // let editors = Array.from([...new Set(editorsArray)]).join('; ')
        // let raw_editors_aff = Array.from(document.querySelectorAll('.book-info__authors .editors .al-author-name .info-card-author'))
        // .filter(elem => {
        //     let author = elem.querySelector('.info-card-name')? elem.querySelector('.info-card-name').innerText.trim() : "";
        //     let affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim() : "";
        //     return author != "" && affilation.length != "";
        // })
        // .map(elem => {
        //     let author = elem.querySelector('.info-card-name').innerText.trim();
        //     let affilation = Array.from(elem.querySelectorAll('.aff > div, .aff > a'))
        //         .map(block => block.textContent.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '')).join(" ");
        //     if (affilation == ""){
        //         affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '') : "";
        //     }
        //     return `${author}:${affilation}`;
        // })
        // let editors_aff = Array.from([...new Set(raw_editors_aff)]).join(";; ");

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
        const abstract = document.querySelector('#cairn-panel-content #article-texte')? document.querySelector('#cairn-panel-content #article-texte').innerText.trim() : "";
        // let raw_affiliation = Array.from(document.querySelectorAll('.wi-authors .info-card-author'))
        // .filter(elem => {
        //     let author = elem.querySelector('.info-card-name')? elem.querySelector('.info-card-name').innerText.trim() : "";
        //     let affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim() : "";
        //     return author != "" && affilation.length != "";
        // })
        // .map(elem => {
        //     let author = elem.querySelector('.info-card-name').innerText.trim();
        //     let affilation = Array.from(elem.querySelectorAll('.aff > div, .aff > a'))
        //         .map(block => block.textContent.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '')).join(" ");
        //     if (affilation == ""){
        //         affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '') : "";
        //     }
        //     return `${author}:${affilation}`;
        // })
        // let affiliation = Array.from([...new Set(raw_affiliation)]).join(";; ");

        // let raw_book_author_affiliation = Array.from(document.querySelectorAll('.wi-authors .info-card-author'))
        // .filter(elem => {
        //     let author = elem.querySelector('.info-card-name')? elem.querySelector('.info-card-name').innerText.trim() : "";
        //     let affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim() : "";
        //     return author != "" && affilation.length != "";
        // })
        // .map(elem => {
        //     let author = elem.querySelector('.info-card-name').innerText.trim();
        //     let affilation = Array.from(elem.querySelectorAll('.aff > div, .aff > a'))
        //         .map(block => block.textContent.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '')).join(" ");
        //     if (affilation == ""){
        //         affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '') : "";
        //     }
        //     return `${author}:${affilation}`;
        // })
        // let book_author_affiliation = Array.from([...new Set(raw_book_author_affiliation)]).join(";; ");

        // if (affiliation == "" && authors == bookAuthors){
        //     affiliation = book_author_affiliation;
        // }
    
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
    
        var metadata = { '200': bookAuthors, '203': date, '81': abstract, '233': mf_doi, '184': mf_issn, '240': mf_isbn, '241': mf_eisbn, '239': type, '235': publisher, '176': volume, '242': mf_book, '193': pages, '212': subtitle};
        if (!mf_book)
        {
            metadata = false
        }
        // log(`Data extracted from ${url}`);
        // log(`Metadata: ${JSON.stringify(metadata)}`);
        return metadata;
    });
    return meta_data;
}

async function extractData(page, jsonFolderPath, pdfFolderPath, htmlFolderPath, siteFolderPath, url, downloadPDFmark = true, checkOpenAccess = true, onlyjson = false) {
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
                var pdfLinks = document.querySelector(".pdf")?document.querySelector(".pdf").href : "";
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
                args: ['--no-sandbox', '--disable-setuid-sandbox'],
                headless: false //'new' for "true mode" and false for "debug mode (Browser open))"
            });

            page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });
            await page.goto('https://www.cairn-int.info/children-whose-parents-use-drugs--9789287191861.htm', { waitUntil: 'networkidle2', timeout: 30000 });
            await page.waitForTimeout(10000);

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
            const fieldsToUpdate = ['240', '241'];
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
