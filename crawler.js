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

        // function getOrcids() {
        //     // Получаем все мета-теги
        //     var metaTags = document.getElementsByTagName('meta');

        //     // Создаем объекты для хранения информации об авторах и их ORCID
        //     let authors = {};
        //     var currentAuthor = "";

        //     // Проходим по всем мета-тегам
        //     for (let i = 0; i < metaTags.length; i++) {
        //         let metaTag = metaTags[i];
        //         // Если мета-тег содержит информацию об авторе
        //         if (metaTag.getAttribute('name') === 'citation_author') {
        //             currentAuthor = metaTag.getAttribute('content');
        //         }
        //         // Если мета-тег содержит информацию об ORCID автора
        //         else if (metaTag.getAttribute('name') === 'citation_author_orcid') {
        //             let authorOrcid = metaTag.getAttribute('content');
        //             // Добавляем автора и его ORCID в объект
        //             authors[currentAuthor] = authorOrcid;
        //         }
        //     }
        //     // Формируем строку в нужном формате "author1:orcid;;author2:orcid..."
        //     let result = "";
        //     for (let author in authors) {
        //         result += author + "::" + authors[author] + ";;";
        //     }
        //     return result;
        // }
    
        // function extractAuthorsAndInstitutions() {
        //     const authors = Array.from(document.querySelectorAll('meta[name="citation_author"]'));
        //     const institutions = Array.from(document.querySelectorAll('meta[name="citation_author_institution"]'));
          
        //     const result = [];
          
        //     for (const author of authors) {
        //         const authorName = author.getAttribute('content');
        //         const authorInstitutions = [];
            
        //         // сопоставление авторов и аффиляции
        //         let nextSibling = author.nextElementSibling;
        //         while (nextSibling && nextSibling.tagName === 'META' && nextSibling.getAttribute('name') === 'citation_author_institution') {
        //         authorInstitutions.push(nextSibling.getAttribute('content'));
        //         nextSibling = nextSibling.nextElementSibling;
        //         }
        //         if (authorInstitutions.length != 0) {
        //             result.push(`${authorName}:${authorInstitutions.join('!')}`);
        //         }
        //     }
          
        //     return result.join(";; ");
        // }
        
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

        //const affiliation = extractAuthorsAndInstitutions();

        let title = getMetaAttribute(['meta[name="dc.Title"]'], 'content');
        if (title == ""){
            title = document.querySelector('.core-container [property="name"]')? document.querySelector('.core-container [property="name"]').innerText.trim() : "";
        }
        let date = getMetaAttribute(['meta[name="dc.date"]'], 'content')
        if (date.length > 7){
            date = date.replaceAll("/","-");
        }
        if (date == "" || !date.match(/\d{4}-\d{2}-\d{2}/)){
            date = document.querySelector('.meta-panel__onlineDate')? document.querySelector('.meta-panel__onlineDate').innerText.match(/\d{4}/)? document.querySelector('.meta-panel__onlineDate').innerText.match(/\d{4}/)[0] : "" : "";
        }
        if (date.length == 4){
            date = `${date}-01-01`;
        }
        let rawAuthors = Array.from(document.querySelectorAll('meta[name="dc.Creator"]')).map(author => author.content.replaceAll("  ", " ").trim())
        let authors = Array.from([...new Set(rawAuthors)]).join('; ')
        if (authors == ""){
            rawAuthors = Array.from(document.querySelectorAll('.authors [property="author"]')).map(elem => {
                let name = elem.querySelector('[property="givenName"]')? elem.querySelector('[property="givenName"]').innerText.trim() : "";
                let surname = elem.querySelector('[property="familyName"]')? elem.querySelector('[property="familyName"]').innerText.trim() : "";
                if (name != "" || surname != ""){
                    return `${name} ${surname}`;
                } else {
                    return undefined;
                }
            }).filter(elem => elem != undefined)
            authors = Array.from([...new Set(rawAuthors)]).join('; ')
        }
        let mf_doi = getMetaAttribute(['meta[name="dc.Identifier"][scheme="doi"]'], 'content');
        if (mf_doi == ""){
            mf_doi = document.querySelector('.core-container .doi')? document.querySelector('.core-container .doi').innerText.match(/https:\/\/doi.org\/(10.*)/)? document.querySelector('.core-container .doi').innerText.match(/https:\/\/doi.org\/(10.*)/)[1] : "" : "";
        }
        let mf_journal = getMetaAttribute(['meta[name="citation_journal_title"]'], 'content');
        if (mf_journal == ""){
            mf_journal = document.querySelector('.banner-widget__heading')? document.querySelector('.banner-widget__heading').innerText.trim() : ""
        }

        let mf_issn_arr = Array.from(document.querySelectorAll('.footer__nav')).filter(block => block.innerText.includes("ISSN")).map(elem => elem.innerText.match(/^ISSN: (\d+-[0-9A-Za-z])/) ? elem.innerText.match(/^ISSN: (\d+-[0-9A-Za-z]+)/)[1] : undefined).filter(issn_elem => issn_elem!=undefined)
        let mf_issn = "";
        if (mf_issn_arr.length > 0 ){
            mf_issn = mf_issn_arr[0] || "";
        }

        let mf_eissn_arr = Array.from(document.querySelectorAll('.footer__nav')).filter(block => block.innerText.includes("ISSN")).map(elem => elem.innerText.match(/Online ISSN: (\d+-[0-9A-Za-z])/) ? elem.innerText.match(/Online ISSN: (\d+-[0-9A-Za-z]+)/)[1] : undefined).filter(issn_elem => issn_elem!=undefined)
        let mf_eissn = "";
        if (mf_eissn_arr.length > 0 ){
            mf_eissn = mf_eissn_arr[0] || "";
        }

        const publisher = getMetaAttribute(['meta[name="dc.Publisher"]'], 'content');
        
        let volume = document.querySelector('[property="volumeNumber"]')? document.querySelector('[property="volumeNumber"]').innerText.trim() : ""
        // if (volume == ""){
        //     volume = document.querySelector('.wd-jnl-art-breadcrumb-vol [itemprop="volumeNumber"]')? document.querySelector('.wd-jnl-art-breadcrumb-vol [itemprop="volumeNumber"]').innerText.match(/Volume (\d+)/)? document.querySelector('.wd-jnl-art-breadcrumb-vol [itemprop="volumeNumber"]').innerText.match(/Volume (\d+)/)[1] : "" : "";
        // }
        let issue = document.querySelector('[property="issueNumber"]')? document.querySelector('[property="issueNumber"]').innerText.trim() : ""
        // if (issue == ""){
        //     issue = document.querySelector('.wd-jnl-art-breadcrumb-issue')? document.querySelector('.wd-jnl-art-breadcrumb-issue').innerText.match(/Number (\d+)/)? document.querySelector('.wd-jnl-art-breadcrumb-issue').innerText.match(/Number (\d+)/)[1] : "" : "";
        // }
        // let first_page = getMetaAttribute(['meta[name="citation_firstpage"]'], 'content');
        // first_page = romanToNumberOrReturn(first_page);
        // let last_page = getMetaAttribute(['meta[name="citation_lastpage"]'], 'content');
        // last_page = romanToNumberOrReturn(last_page);
        let language = getMetaAttributes(['meta[name="dc.Language"]'], 'content');
        if (language === 'en'){
            language = 'eng';
        }
        else if (language === 'ru'){
            language = 'rus';
        }
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        let keywords = Array.from(document.querySelectorAll('[property="keywords"] li')).map(elem => elem.innerText.trim()).filter(elem => elem!=undefined).join("; ")
        if (keywords == ""){
            keywords = document.querySelector('meta[name="keywords"]')? document.querySelector('meta[name="keywords"]').content.replaceAll(",", "; ") : "";
        }
        const mf_type = 'article'
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        const abstract = document.querySelector('#abstract')? document.querySelector('#abstract').innerText.replace("Abstract", "").trim() : "";
        
        //Type
        let authorOrcArr = Array.from(document.querySelectorAll('.authors [property="author"]')).map(elem => {
            let name = elem.querySelector('[property="givenName"]')? elem.querySelector('[property="givenName"]').innerText.trim() : "";
            let surname = elem.querySelector('[property="familyName"]')? elem.querySelector('[property="familyName"]').innerText.trim() : "";
            let orcid = elem.querySelector('.orcid-id')? elem.querySelector('.orcid-id').innerText.trim() : "";
            if ((name != "" || surname != "") && orcid != ""){
                return `${name} ${surname}::${orcid}`;
            } else {
                return undefined;
            }
        }).filter(elem => elem != undefined)
        let orcid = [...new Set(authorOrcArr)].join(';;');

        let affiliationArr = Array.from(document.querySelectorAll('#tab-contributors [property="author"]')).map(elem => {
            let name = elem.querySelector('.heading')? elem.querySelector('.heading').innerText.trim() : "";
            let aff = Array.from(elem.querySelectorAll('.affiliations [property="affiliation"]')).map(aff => aff.innerText.trim()).join("!")
            if (name != "" && aff != ""){
                return `${name}:${aff}`;
            } else {
                return undefined;
            }
        }).filter(elem => elem != undefined)
        let affiliation = [...new Set(affiliationArr)].join(';;');
    
        var metadata = { "202": title, "203": date, "200": authors, "233": mf_doi, '232': mf_journal, '184': mf_issn, '185': mf_eissn, '176': volume, '208': issue, '81': abstract, '235': publisher, '201': keywords, '205': language, '144': affiliation, '239': mf_type, '234': orcid};
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
            pdfLinksToDownload = await page.evaluate(() => {
                var pdfLinks = document.querySelector('[data-id="article-toolbar-pdf-epub"]')?document.querySelector('[data-id="article-toolbar-pdf-epub"]').href : "";
                if (!pdfLinks){
                    return null;
                }
                return pdfLinks.replace("reader", "pdf");

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
