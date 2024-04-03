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

        function getBookSeries(mf_book) {
            let regexpVolume = /, Volume .*/;

            let flag = false;
            let result = Array.from(document.querySelectorAll('#breadcrumbs .breadcrumb-item')).find(elem => {
                if (!flag) {
                    flag = elem.innerText.replace(regexpVolume, '') == 'Books';
                } else if (elem.innerText.replace(regexpVolume, '').trim().replaceAll("\n","") == mf_book.replace(regexpVolume, '').trim().replaceAll("\n","")) {
                    flag = false;
                    return false;
                } else {
                    return true;
                }
            });

            let finalResult = "";
            if (result){
                finalResult = result.innerText.replace(regexpVolume, '');
            }
            return finalResult;
        }
    
        let title = getMetaAttributes(['meta[name="dc.Title"]'], 'content')
        if (title == ""){
            title = document.querySelector('.content-title')? document.querySelector('.content-title').innerText : "";
        }
        let date = getMetaAttributes(['meta[name="dc.Title"]'], 'content').match(/\d{4}/)?getMetaAttributes(['meta[name="dc.Title"]'], 'content').match(/\d{4}/)[0] : "";
        if (date == ""){
            date = document.querySelector('.intent_journal_publication_date')? document.querySelector('.intent_journal_publication_date').innerText.match(/\d{4}/)?document.querySelector('.intent_journal_publication_date').innerText.match(/\d{4}/)[0] : "" : "";
        }
        if (date.length == 4){
            date = `${date}-01-01`;
        }
        let authors = getMetaAttributes(['meta[name="dc.Contributor"]'], 'content');
        if (authors == ""){
            let rawAuthors = Array.from(document.querySelectorAll('#intent_contributors .contrib-search-book-part-meta')).map(elem => elem.innerText.replaceAll(",", "").trim())
            authors = Array.from([...new Set(rawAuthors)]).join('; ')
        }

        let mf_doi = document.querySelector('meta[scheme="doi"]')? document.querySelector('meta[scheme="doi"]').content : "";
        // if (mf_doi == ""){
        //     mf_doi = document.querySelector('.article_header-doiurl')?document.querySelector('.article_header-doiurl').innerText?.replaceAll('https://doi.org/', '').replace("DOI: ", "") : "";
        // }
        let mf_book = getMetaAttributes(['meta[name="citation_inbook_title"]'], 'content').trim().replaceAll("\n","");
        if (mf_book == ""){
            mf_book = document.querySelector('.intent_book_title')? document.querySelector('.intent_book_title').innerText : "";
        }
        let book_series = getBookSeries(mf_book) || "";
        const mf_isbn = document.querySelector('.intent_book_p_isbn')? document.querySelector('.intent_book_p_isbn').innerText : "";
        const mf_eisbn = document.querySelector('.intent_book_e_isbn')? document.querySelector('.intent_book_e_isbn').innerText : "";
        let mf_issn = getMetaAttributes(['meta[scheme="issn"]'], 'content');
        if (mf_issn){
            mf_issn = document.querySelector('.intent_journal_issn')? document.querySelector('.intent_journal_issn').innerText : "";
        }
        let publisher = getMetaAttributes(['meta[name="dc.Publisher"]'], 'content')
        // if (publisher == ""){
        //     publisher = document.querySelector('.NLM_publisher-name')? document.querySelector('.NLM_publisher-name').innerText : "";
        // }
        const volume = document.querySelector('meta[name="citation_volume"]')? document.querySelector('meta[name="citation_volume"]').content : "";
        const first_page = romanToNumberOrReturn(getMetaAttributes(['meta[name="citation_firstpage"]'], 'content'));
        const last_page = romanToNumberOrReturn(getMetaAttributes(['meta[name="citation_lastpage"]'], 'content'));
        //const pages = document.querySelector('.cover-pages')? document.querySelector('.cover-pages').innerText.match(/(\d+)\s+pages/)? document.querySelector('.cover-pages').innerText.match(/(\d+)\s+pages/)[1] : "" : "";
        const type = getMetaAttributes(['meta[name="dc.Type"]'], 'content');
        // var editors = Array.from(document.querySelectorAll('.cover-image__details-extra ul[title="list of authors"] li')).map(elem => elem.firstChild.innerText).map(elem => elem.replace("Editors:", "")).map(elem => elem.replace("Editor:", "")).map(elem => elem.replace(",", "")).filter(function(element) {
        //     return element !== "" && element !== " ";
        //   }).join("; ");
        // if (editors.includes("Author")){
        //     editors = "";
        // }

        //const volume 

        let language = getMetaAttributes(['meta[name="dc.Language"]'], 'content');
        if (language == "en"){
            language = "eng";
        }
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        let rawKeywords =Array.from(document.querySelectorAll('#keywords_list .intent_text')).map(elem => elem.innerText.replaceAll(",", "").trim())
        let keywords =Array.from([...new Set(rawKeywords)]).join('; ')
        if (keywords == ""){
            keywords = getMetaAttributes(['meta[name="keywords"]'], 'content')
        }   
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        const abstract = document.querySelector('#abstract .Abstract__block')? document.querySelector('#abstract .Abstract__block').innerText.trim().replaceAll("\n", " ") : "";
        let affiliation = Array.from(document.querySelectorAll('#contribAffiliations .intent_contributor'))
        .filter(elem => {
            let author = elem.querySelector('.contrib-search-book-part-meta')? elem.querySelector('.contrib-search-book-part-meta').innerText.trim() : "";
            let affilation = elem.querySelector('.intent_contributor_affiliate')? elem.querySelector('.intent_contributor_affiliate').innerText.trim().replaceAll("(", "").replaceAll(")", "") : "";
            return author != "" && affilation.length != "";
        })
        .map(elem => {
            let author = elem.querySelector('.contrib-search-book-part-meta').innerText.trim();
            let affilation = elem.querySelector('.intent_contributor_affiliate').innerText.trim().replace("(", "").replace(")", "");
            return `${author}:${affilation}`;
        })
        .join(";; ");
    
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
    
        var metadata = { '202': title, '200': authors, '203': date, '81': abstract, '233': mf_doi, '184': mf_issn, '240': mf_isbn, '241': mf_eisbn, '201': keywords, '239': type, '235': publisher, '144': affiliation, '176': volume, '205': language, '197': first_page, '198': last_page, '243': book_series, '242': mf_book};
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
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                    await page.waitForTimeout(1000); // Задержка краулинга

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
                    await page.goto(urlToHtml, { waitUntil: 'domcontentloaded', timeout: 120000 });
                    
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
