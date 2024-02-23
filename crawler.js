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
        //         result += author + ":" + authors[author] + ";;";
        //     }
        //     return result;
        // }

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
    
        const title = document.querySelector('.txtc b')? document.querySelector('.txtc b').innerText : "";
        // var date = getMetaAttributes(['meta[name="citation_publication_date"]'], 'content').replaceAll("/","-") || getMetaAttributes(['meta[name="citation_online_date"]'], 'content').replaceAll("/","-") || document.querySelector('.ww-citation-primary')? document.querySelector('.ww-citation-primary').innerText.match(/(\d{4})/)? document.querySelector('.ww-citation-primary').innerText.match(/\((\d{4})\)/)[1] : "" : "";;
        // if (date.length == 4){
        //     date = `${date}-01-01`;
        // }
        const authors = document.querySelector('p.txtc:nth-child(4)')? document.querySelector('p.txtc:nth-child(4)').innerText.replaceAll('\n','') : "";
        // var rawAuthors = Array.from(document.querySelectorAll('.loa__author-name span')).map(elem => elem.innerText)
        // var authors = Array.from([...new Set(rawAuthors)]).join('; ')


        //const mf_doi = getMetaAttributes(['meta[name="citation_doi"]'], 'content').replace("doi:", "");
        const mf_journal = 'Известия Академии наук. Серия химическая'
        let mf_issn = '1026-3500';
        let mf_eissn = '2658-784X';
        //const publisher = getMetaAttributes(['meta[name="citation_publisher"]'], 'content');
        //const volume = getMetaAttributes(['meta[name="citation_volume"]'], 'content');
        //const issue = getMetaAttributes(['meta[name="citation_issue"]'], 'content');
        //const first_page = getMetaAttributes(['meta[name="citation_firstpage"]'], 'content');
        //const last_page = getMetaAttributes(['meta[name="citation_lastpage"]'], 'content');
        //const type = document.querySelector('.article-client_type')? document.querySelector('.article-client_type').innerText : "";
        // var editors = Array.from(document.querySelectorAll('.cover-image__details-extra ul[title="list of authors"] li')).map(elem => elem.firstChild.innerText).map(elem => elem.replace("Editors:", "")).map(elem => elem.replace("Editor:", "")).map(elem => elem.replace(",", "")).filter(function(element) {
        //     return element !== "" && element !== " ";
        //   }).join("; ");

        let language = 'rus';
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        // const keywords = getMetaAttributes(['meta[name="citation_keyword"]'], 'content');
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        let abstract = document.querySelector('.txttbj')? document.querySelector('.txttbj').innerText.trim().replace('\n','') : "";
        
        //Type
        // const orcids = Array.from(document.querySelectorAll('.al-author-name')).map(author => {
        //     const authorName = author.querySelector('.linked-name').textContent.trim();
        //     const orcidUrl = author.querySelector('.al-orcid-url');
        //     const orcid = orcidUrl ? orcidUrl.getAttribute('href') : null;
        //     return orcid ? `${authorName}:${orcid}` : null;
        // }).filter(author => author !== null).join(';');
    
        var metadata = { "202": title, "200": authors, '232': mf_journal, '81': abstract, '184': mf_issn, '185': mf_eissn, '205': language};
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
                var pdfLinks = document.querySelector('#Toolbar .pdf')? document.querySelector('#Toolbar .pdf').href : "";
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

async function crawl(jsonFolderPath, pdfFolderPath, siteFolderPath, linksFilePath, downloadPDFmark, checkOpenAccess) {
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

                    await page.waitForTimeout(3000); // Задержка краулинга

                    if (await shouldChangeIP(page)) {
                        log(`Retrying after changing IP.`);
                        // Продолжаем внутренний цикл с новым браузером
                        continue mainLoop;
                    }

                    // Проверка, что основной документ полностью загружен
                    await page.waitForSelector('body');

                    await extractData(page, jsonFolderPath, pdfFolderPath, siteFolderPath, url, downloadPDFmark, checkOpenAccess);
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
