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

        function extractAuthorInstitution() {
            // Получаем все блоки с информацией об авторе
            const authorBlocks = document.querySelectorAll('.authorInfo_ChapterTopInfo_Chapter');

            // Создаем пустую строку для хранения результата
            let result = '';

            // Проходимся по каждому блоку с информацией об авторе
            authorBlocks.forEach(authorBlock => {
                // Получаем имя автора
                const authorName = authorBlock.querySelector('.info-card-name').textContent.trim();
                
                // Получаем все блоки с аффиляциями автора
                const affiliationBlocks = authorBlock.querySelectorAll('.info-card-affilitation .aff');
                
                // Создаем массив для хранения аффиляций
                const affiliations = [];
                
                // Проходимся по каждой аффиляции и извлекаем текст, исключая буквы из .label title-label
                affiliationBlocks.forEach(affiliationBlock => {
                    // Извлекаем текст аффиляции и удаляем буквы из тега <span>
                    const affiliationText = affiliationBlock.textContent;
                    affiliations.push(affiliationText);
                });
                
                // Формируем строку для текущего автора
                const authorInfo = `${authorName}: ${affiliations.join('!')};; `;
                
                // Добавляем информацию об авторе к результату
                if (affiliations.length >=1){
                    result += authorInfo;
                }
            });

            // Удаляем последний символ ";;" из результата
            if (result.length > 4){
                result = result.slice(0, -3);
            }
            return result;
        }
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
        //             result.push(`${authorName} : ${authorInstitutions.join('!')}`);
        //         }
        //     }
          
        //     return result.join("; ");
        //   }
          
        // const affiliation = extractAuthorsAndInstitutions();
    
        const title = getMetaAttributes(['meta[name="citation_title"]'], 'content') || "";
        let date = getMetaAttributes(['meta[name="citation_publication_date"]'], 'content').replaceAll("/","-") || "";
        if (date.length >= 4){
            date = date.match(/\d{4}/)? `${date.match(/\d{4}/)[0]}-01-01` : date;
        }
        const authors = getMetaAttributes(['meta[name="citation_author"]'], 'content') || Array.from(document.querySelectorAll('.authors .book-info__author')).map(elem=>elem.innerText).join("; ") || "";
        const mf_doi = getMetaAttributes(['meta[name="citation_doi"]'], 'content') || "";
        let mf_book = document.querySelector('.book-info__title')? document.querySelector('.book-info__title').innerText.trim() : "";
        const mf_isbn = Array.from(document.querySelectorAll('.book-info__isbn'))
        .find(li => li.textContent.includes('ISBN print:'))
        ?.textContent.replace('ISBN print:', '').trim() || "";
        const mf_eisbn = Array.from(document.querySelectorAll('.book-info__isbn'))
                        .find(li => li.textContent.includes('ISBN electronic:'))
                        ?.textContent.replace('ISBN electronic:', '')
                        .trim() || '';
        const publisher = document.querySelector('.book-info__publisher-name')? document.querySelector('.book-info__publisher-name').innerText.trim() : "";
        const volume = document.querySelector('.book-info__volume-number')? document.querySelector('.book-info__volume-number').innerText.trim() : "";
        const typeOfArticle = getMetaAttributes(['meta[property="og:type"]'], 'content') || "";
        const subtitle = document.querySelector('.subtitle')? document.querySelector('.subtitle').innerText.trim() : "";
        if (mf_book.includes(subtitle)){
            mf_book = mf_book.replace(`: ${subtitle}`, "");
        }
        const editors = Array.from(document.querySelectorAll('.editors .al-author-name')).map(elem => elem.innerText).join("; ");
        let language = document.querySelector('script[type="application/ld+json"]')? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)? document.querySelector('script[type="application/ld+json"]').innerText.match(/"inLanguage":"([a-zA-Z]+)"/)[1] : "" : "";
        if (language == 'en'){
            language = 'eng';
        }
        if (language.length > 4){
            language = "";
        }

        // let authorsStringAffilation = document.querySelector('script[type="application/ld+json"]')? document.querySelector('script[type="application/ld+json"]').innerText.match(/"author":(\[.*\]),/)? document.querySelector('script[type="application/ld+json"]').innerText.match(/"author":(\[.*\]),/)[1] : "" : "";
        // let authorsStringFormattedAffulation = ""
        // if (authorsStringAffilation != ""){
        //     try{
        //         let authorsAffilation = JSON.parse(authorsStringAffilation);
        //         authorsStringFormattedAffulation = authorsAffilation.map(author => `${author.name}: ${author.affiliation}`).join(';; ');
        //     } catch {
        //         console.log("bad affilation");
        //         authorsStringFormattedAffulation = "";
        //     }
        // }

        const affilation = extractAuthorInstitution();
        // const volume = (document.querySelector('.volume--title')?.textContent.match(/Volume (\d+),/) || [])[1] || '';
        // const issue = (document.querySelector('.volume--title')?.textContent.match(/Issue (\d+)/) || [])[1] || '';

        // var pagesElement = document.querySelector('.volume--pages');
        // var pagesTextContent = pagesElement ? pagesElement.textContent : '';
        // var match = pagesTextContent.match(/Pages (\d+)-(\d+),/);

        // var first_page = match ? match[1] || '' : '';
        // var last_page = match ? match[2] || '' : '';
        // const first_page = getMetaAttributes(['meta[name="citation_firstpage"]'], 'content') || "";
        // const last_page = getMetaAttributes(['meta[name="citation_lastpage"]'], 'content') || "";
        // const language = getMetaAttributes(['meta[name="dc.Language"]'], 'content');
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        // const keywords = getMetaAttributes(['head > meta[name="keywords"]'], 'content');
        //ABSTRACT
        // const abstract = (document.querySelector(".abstract")? document.querySelector(".abstract").textContent.trim() : '') || "";
        
        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        var metadata = { "202": title, "203": date, "200": authors, "233": mf_doi, "235": publisher, "242": mf_book, "176": volume, '240': mf_isbn, '241': mf_eisbn, '239': typeOfArticle, '212': subtitle, '207': editors, '205': language, '144': affilation};
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
                var pdfLinks = document.querySelector('.pdf')?document.querySelector('.pdf').href : "";
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

async function crawl(jsonFolderPath, pdfFolderPath, siteFolderPath, linksFilePath) {
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

                    await page.waitForTimeout(3000); // Задержка краулинга

                    if (await shouldChangeIP(page)) {
                        log(`Retrying after changing IP.`);
                        // Продолжаем внутренний цикл с новым браузером
                        continue mainLoop;
                    }

                    // Проверка, что основной документ полностью загружен
                    await page.waitForSelector('body');

                    await extractData(page, jsonFolderPath, pdfFolderPath, siteFolderPath, url, downloadPDFmark = true);
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
