const puppeteer = require('puppeteer-extra');
const { TimeoutError } = require('puppeteer');
const StealhPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const {changeTorIp, shouldChangeIP} = require('./tor-config');
const log = require('./logger');
const crypto = require('crypto');
const { getCurrentIP, checkAccess } = require('./utils');
const { lang } = require('moment');

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
                result += author + ":" + authors[author] + ";;";
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
                    result.push(`${authorName} : ${authorInstitutions.join('!')}`);
                }
            }
          
            return result.join(";; ");
          }
          
        const affiliation = extractAuthorsAndInstitutions();
    
        let title = getMetaAttributes(['meta[name="citation_title"]'], 'content');
        if (title == ""){
            title = document.querySelector('#head .title')? document.querySelector('#head .title').innerText.trim() : "";
        }
        let date = getMetaAttributes(['meta[name="citation_publication_date"]'], 'content').replaceAll("/","-");
        if (date == ""){
            date = getMetaAttributes(['meta[name="citation_online_date"]'], 'content').replaceAll("/","-");
        }
        if (date.length == 4){
            date = `${date}-01-01`;
        }
        let authors = getMetaAttributes(['meta[name="citation_author"]'], 'content');
        if (authors == ""){
            let rawAuthors = Array.from(document.querySelectorAll('.article-authors .author')).map(elem => elem.innerText)
            authors = Array.from([...new Set(rawAuthors)]).join('; ')
        }

        const mf_doi = getMetaAttributes(['meta[name="citation_doi"]'], 'content').replace("doi:", "");
        const mf_journal = getMetaAttributes(['meta[name="citation_journal_title"]'], 'content');
        let issns = Array.from(document.querySelectorAll('meta[name="citation_issn"]')).map(elem => elem.content)
        let mf_issn = document.querySelector('meta[name="prism.issn"]')? document.querySelector('meta[name="prism.issn"]').content : "";
        let mf_eissn = document.querySelector('meta[name="prism.eIssn"]')? document.querySelector('meta[name="prism.eIssn"]').content : "";
        if (issns.length == 2 && !mf_eissn){
            mf_eissn = issns[1];
        }
        if (issns.length == 2 && !mf_issn){
            mf_eissn = issns[0];
        }
        const publisher = getMetaAttributes(['meta[name="citation_publisher"]'], 'content');
        const volume = getMetaAttributes(['meta[name="citation_volume"]'], 'content');
        const issue = getMetaAttributes(['meta[name="citation_issue"]'], 'content');
        const first_page = getMetaAttributes(['meta[name="citation_firstpage"]'], 'content');
        const last_page = getMetaAttributes(['meta[name="citation_lastpage"]'], 'content');
        const type = getMetaAttributes(['meta[name="citation_article_type"]'], 'content');
        // var editors = Array.from(document.querySelectorAll('.cover-image__details-extra ul[title="list of authors"] li')).map(elem => elem.firstChild.innerText).map(elem => elem.replace("Editors:", "")).map(elem => elem.replace("Editor:", "")).map(elem => elem.replace(",", "")).filter(function(element) {
        //     return element !== "" && element !== " ";
        //   }).join("; ");

        let language = getMetaAttributes(['meta[name="citation_language"]'], 'content') || "";
        if (language == 'en'){
            language = 'eng';
        }
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        const keywords = getMetaAttributes(['meta[name="citation_keyword"]'], 'content');
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        let abstract = '';
        let rawP = Array.from(document.querySelectorAll('#head p')).map(elem => elem.innerText)
        for(let i = 0; i < rawP.length; i++){
            if (rawP[i] == 'Abstract'){
                if (i +1 <= rawP.length){
                    abstract = rawP[i+1].trim().replaceAll("\n", " ");
                    break;
                }
            }
        }
        
        //Type
        const orcids = getOrcids() || "";
    
        var metadata = { "202": title, "203": date, "200": authors, "233": mf_doi, '197': first_page, '198': last_page, '232': mf_journal, '176': volume, '208': issue, '81': abstract, '235': publisher, '239': type, '201': keywords, '184': mf_issn, '185': mf_eissn, '234': orcids, '144': affiliation, '205': language};
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
                var pdfLinks = Array.from(document.querySelectorAll('.article_doc a')).map(elem => elem.href).filter(elem => elem.includes("/pdf/")) ? Array.from(document.querySelectorAll('.article_doc a')).map(elem => elem.href).filter(elem => elem.includes("/pdf/"))[0] : "";
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

                    //await page.waitForTimeout(000); // Задержка краулинга

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
