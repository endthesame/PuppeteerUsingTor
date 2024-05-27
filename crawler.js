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

        function getOrcids() {
            // Получаем все мета-теги
            var metaTags = document.getElementsByTagName('meta');

            // Создаем объекты для хранения информации об авторах и их ORCID
            let authors = {};
            var currentAuthor = "";

            // Проходим по всем мета-тегам
            for (let i = 0; i < metaTags.length; i++) {
                let metaTag = metaTags[i];
                // Если мета-тег содержит информацию об авторе
                if (metaTag.getAttribute('name') === 'citation_author') {
                    currentAuthor = metaTag.getAttribute('content');
                }
                // Если мета-тег содержит информацию об ORCID автора
                else if (metaTag.getAttribute('name') === 'citation_author_orcid') {
                    let authorOrcid = metaTag.getAttribute('content');
                    // Добавляем автора и его ORCID в объект
                    authors[currentAuthor] = authorOrcid;
                }
            }
            // Формируем строку в нужном формате "author1:orcid;;author2:orcid..."
            let result = "";
            for (let author in authors) {
                result += author + "::" + authors[author] + ";;";
            }
            return result;
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
                    result.push(`${authorName}:${authorInstitutions.join('!')}`);
                }
            }
          
            return result.join(";; ");
        }

        function extractAuthorsAndEditors(rawAuthors, rawEditors) {
            const authorsMeta = Array.from(document.querySelectorAll('meta[name="citation_author"]'));
            const institutionsMeta = Array.from(document.querySelectorAll('meta[name="citation_author_institution"]'));
        
            const result = [];
        
            // Сопоставление авторов и аффиляций
            for (const author of authorsMeta) {
                const authorName = author.getAttribute('content');
                const authorInstitutions = [];
        
                let nextSibling = author.nextElementSibling;
                while (nextSibling && nextSibling.tagName === 'META' && nextSibling.getAttribute('name') === 'citation_author_institution') {
                    authorInstitutions.push(nextSibling.getAttribute('content'));
                    nextSibling = nextSibling.nextElementSibling;
                }
        
                if (authorInstitutions.length !== 0) {
                    result.push(`${authorName}:${authorInstitutions.join('!')}`);
                }
            }
        
            const authors = [];
            const editors = [];
        
            // Приведение имен из rawAuthors и rawEditors к нижнему регистру
            const rawAuthorsLower = rawAuthors.map(name => name.toLowerCase());
            const rawEditorsLower = rawEditors.map(name => name.toLowerCase());
        
            // Разделение авторов и редакторов
            for (const entry of result) {
                const [name, institutions] = entry.split(':');
                const nameLower = name.toLowerCase();
        
                if (rawAuthorsLower.includes(nameLower)) {
                    authors.push(entry);
                } else if (rawEditorsLower.includes(nameLower)) {
                    editors.push(entry);
                }
            }
        
            return {
                authors: authors.join(";; "),
                editors: editors.join(";; ")
            };
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

        const affiliation = extractAuthorsAndInstitutions();

        const rawBookString = document.querySelector('.publication-title')? document.querySelector('.publication-title').innerText : "";
        let mf_book = rawBookString.trim();
        if (mf_book == ""){
            mf_book = getMetaAttribute(['meta[name="citation_title"]'], 'content');
        }
        const subtitle = document.querySelector('.publication-sub-title')? document.querySelector('.publication-sub-title').innerText : "";
        const book_version = rawBookString.match(/(\(.* Edition\))/)? rawBookString.match(/(\(.* Edition\))/)[1].replace("(","").replace(")","") : "";
        const volume = rawBookString.match(/Volume (\d+)/)? rawBookString.match(/Volume (\d+)/)[1] : "";
        
        let date = getMetaAttribute(['meta[name="dc.date"]'], 'content') || getMetaAttribute(['meta[name="citation_publication_date"]'], 'content')
        if (date == ""){
            date = document.querySelector('meta[name="citation_online_date"]')? document.querySelector('meta[name="citation_online_date"]').content.match(/\d{4}/)? document.querySelector('meta[name="citation_online_date"]').content.match(/\d{4}/)[0] : "" : "";
        }
        if (date.length > 7){
            date = date.replaceAll("/","-");
        }
        if (date.length != 10){
            date = "";
        }
        if (date == "" || !date.match(/\d{4}-\d{2}-\d{2}/)){
            date = document.querySelector('#wd-book-pub-date')? document.querySelector('#wd-book-pub-date').innerText.match(/\d{4}/)? document.querySelector('#wd-book-pub-date').innerText.match(/\d{4}/)[0] : "" : "";
        }
        if (date.length == 4){
            date = `${date}-01-01`;
        }
        let rawAuthors = Array.from(document.querySelectorAll('#wd-book-author span[itemprop="author"]')).map(elem => elem.innerText.trim());
        rawAuthors = Array.from(new Set(rawAuthors));
        let authors = Array.from([...new Set(rawAuthors)]).join('; ')

        let rawEditors = Array.from(document.querySelectorAll('#wd-book-editor [itemprop="author"]')).map(editor => editor.innerText.trim());
        rawEditors = Array.from(new Set(rawEditors));
        let editors = Array.from([...new Set(rawEditors)]).join('; ')

        const { authors: author_aff_raw, editors: editor_aff_raw } = extractAuthorsAndEditors(rawAuthors, rawEditors);
        let author_aff = author_aff_raw || "";
        let editor_aff = editor_aff_raw || "";

        if (authors == "" && editors == ""){
            rawAuthors = Array.from(document.querySelectorAll('meta[name="citation_author"]')).map(author => author.content.trim())
            authors = Array.from([...new Set(rawAuthors)]).join('; ')
            author_aff = affiliation || "";
        }


        let mf_doi = getMetaAttribute(['meta[name="citation_doi"]'], 'content');
        if (mf_doi == ""){
            mf_doi = document.querySelector('#wd-bk-pg-doi')? document.querySelector('#wd-bk-pg-doi').innerText.match(/https:\/\/doi.org\/(10.*)/)? document.querySelector('#wd-bk-pg-doi').innerText.match(/https:\/\/doi.org\/(10.*)/)[1] : "" : "";
        }

        let mf_issn = getMetaAttribute(['meta[name="citation_issn"]'], 'content');

        let mf_isbn = document.querySelector('#wd-book-print-isbn')? document.querySelector('#wd-book-print-isbn').innerText.replace("Print ISBN:","").trim() : "";
        let mf_eisbn = document.querySelector('#wd-book-online-isbn')? document.querySelector('#wd-book-online-isbn').innerText.replace("Online ISBN:","").trim() : "";
        if (mf_isbn == "" && mf_eisbn == ""){
            mf_eisbn = document.querySelector('meta[name="citation_isbn"]')? document.querySelector('meta[name="citation_isbn"]').content.trim() : "";
        }

        const publisher = getMetaAttribute(['meta[name="citation_publisher"]'], 'content');

        const pages = document.querySelector('#wd-bk-pg-extent')? document.querySelector('#wd-bk-pg-extent').innerText.match(/(\d+)pp/)? document.querySelector('#wd-bk-pg-extent').innerText.match(/(\d+)pp/)[1] : "" : "";

        let language = getMetaAttributes(['meta[name="citation_language"]'], 'content');
        if (language === 'en'){
            language = 'eng';
        }
        else if (language === 'ru'){
            language = 'rus';
        }
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        const keywords = document.querySelector('[class*="keyword"][class*="wd-jnl"] p')? document.querySelector('[class*="keyword"][class*="wd-jnl"] p').innerText : "";
        const mf_type = 'book'
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        let abstract_part = document.querySelector('#wd-book-page-intro')? document.querySelector('#wd-book-page-intro').innerText.trim().replaceAll('\n', ' ')  : "";
        let abstract_part_hidden = Array.from(document.querySelectorAll('#wd-book-page-intro .mb-1 p')).map(elem => elem.innerText.trim()).join("")
        let abstract = abstract_part.concat(abstract_part_hidden) || "";
        
        //Type
        let authorOrcArr = Array.from(document.querySelectorAll('[itemprop="author"]')).map(author_block => {
            let author_name = author_block.querySelector('[itemprop="name"]')? author_block.querySelector('[itemprop="name"]').innerText.trim() : "";
            let orcid = "";
            let orcidArr = Array.from(author_block.querySelectorAll('a')).filter(elem => elem.href.includes("orcid.org")).map(orc => orc.href)
            if (orcidArr.length > 0){
                orcid = orcidArr[0]
            }
            if (author_name != "" && orcid != ""){
                return `${author_name}::${orcid}`;
            }
        }).filter(item => item !== undefined)
          
        let orcid = getOrcids() || [... new Set(authorOrcArr)].join(';;');
    
        var metadata = { "242": mf_book, "203": date, "200": authors, '207': editors, "233": mf_doi, '184': mf_issn, '176': volume, '81': abstract, '235': publisher, '201': keywords, '205': language, '144': author_aff, '146': editor_aff, '239': mf_type, '234': orcid, '212': subtitle, '199': book_version, '193': pages, '240': mf_isbn, '241': mf_eisbn};
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
                let pdfLinks = "";
                if (document.querySelector('.book-page-cover-w-meta .eyebrow .red')){
                    pdfLinks = document.querySelector('#wd-book-pdf-but')? document.querySelector('#wd-book-pdf-but').href : "";
                }
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
                args: ['--proxy-server=127.0.0.1:8118'],
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
            });

            page = await browser.newPage();
            await page.setViewport({ width: 1280, height: 720 });

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');
            await page.goto('https://iopscience.iop.org/', { waitUntil: 'domcontentloaded', timeout: 30000 });

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
