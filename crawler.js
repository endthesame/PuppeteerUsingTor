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

        function getMFDict(){
            let scriptElement = document.querySelector('#LayoutWrapper > div:nth-child(1) > div:nth-child(1) > script:nth-child(4)');
            let scriptText = scriptElement.textContent;
            let dictionary = xplGlobal.document.metadata;
            return dictionary
        }
        let mf_dict = getMFDict();
    
        let title = document.querySelector('.document-title')? document.querySelector('.document-title').innerText.trim() : "";
        if (title == ""){
            title = document.querySelector('meta[property="og:title"]')? document.querySelector('meta[property="og:title"]').content.trim() : "";
            if (title == ""){
                title = mf_dict["title"] || "";
            }
        }

        let date = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Date of Publication:.*(\d{4})/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Date of Publication:.*(\d{4})/)[1] : "" : "";
        if (date == ""){
            date = mf_dict["copyrightYear"] || mf_dict["publicationYear"] ||  ""
            //date = document.querySelector('#LayoutWrapper > div:nth-child(1) > div:nth-child(1) > script:nth-child(4)')? document.querySelector('#LayoutWrapper > div:nth-child(1) > div:nth-child(1) > script:nth-child(4)').innerText.match(/"copyrightYear":"(\d{4})"/)? document.querySelector('#LayoutWrapper > div:nth-child(1) > div:nth-child(1) > script:nth-child(4)').innerText.match(/"copyrightYear":"(\d{4})"/)[1] : "" : "";
        }
        if (date.length == 4){
            date = `${date}-01-01`;
        }

        let authors = Array.from(document.querySelectorAll('meta[name="parsely-author"]')).map(elem => elem.content.trim().replace(";", "")).join("; ")
        if (authors == ""){
            let rawAuthors = document.querySelector('.authors-info-container')?document.querySelector('.authors-info-container').innerText : "";
            if (!rawAuthors.includes("Editor")){
                authors = Array.from(document.querySelectorAll('.authors-info')).map(elem => elem.innerText.trim().replace(";", "")).join("; ")
            }
            if (authors == ""){
                authors = mf_dict["authorNames"] || "";
            }
            if (authors == ""){
                mf_dict.authors?.forEach(function(author, index) {
                    // Проверяем, есть ли у автора аффиляции
                    if (author?.name?.length > 0) {
                        // Добавляем в переменную affiliations имя автора и его аффиляции в нужном формате
                        authors += author.name;
                        // Добавляем ";;" после каждого автора, кроме последнего
                        if (index !== mf_dict.authors.length - 1) {
                            authors += '; ';
                        }
                    }
                });
            }
        }
        let author_aff = "";
        mf_dict.authors?.forEach(function(author, index) {
            // Проверяем, есть ли у автора аффиляции
            if (author?.affiliation?.length > 0) {
                // Добавляем в переменную affiliations имя автора и его аффиляции в нужном формате
                author_aff += author.name + ":" + author.affiliation.join('!');
                // Добавляем ";;" после каждого автора, кроме последнего
                if (index !== mf_dict.authors.length - 1) {
                    author_aff += ";; ";
                }
            }
        });

        let authors_orcid = "";
        mf_dict.authors?.forEach(function(author, index) {
            // Проверяем, есть ли у автора аффиляции
            if (author?.orcid) {
                // Добавляем в переменную affiliations имя автора и его аффиляции в нужном формате
                authors_orcid += author.name + "::" + "https://orcid.org/" + author.orcid;
                // Добавляем ";;" после каждого автора, кроме последнего
                if (index !== mf_dict.authors.length - 1) {
                    authors_orcid += ";; ";
                }
            }
        });

        let mf_doi = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/DOI: (10.*)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/DOI: (10.*)/)[1] : "" : "";
        if (mf_doi == ""){
            mf_doi = mf_dict["doi"] || "";
        }

        //let full_book_name_node = document.querySelector('.book-info__title');
        let mf_journal = mf_dict["publicationTitle"] || "";
        if (mf_journal == ""){
            mf_journal = document.querySelector('a.stats-document-abstract-publishedIn')? document.querySelector('a.stats-document-abstract-publishedIn').innerText.trim() : "";
        }
        
        let volume = mf_dict["volume"] || "";
        if (volume == ""){
            volume = document.querySelector('.stats-document-abstract-publishedIn')? document.querySelector('.stats-document-abstract-publishedIn').innerText.match(/Volume: (\d+),/)? document.querySelector('.stats-document-abstract-publishedIn').innerText.match(/Volume: (\d+),/)[1] : "" : "";
        }
        let issue = mf_dict["issue"] || "";
        if (issue == ""){
            issue = document.querySelector('.stats-document-abstract-publishedIn')? document.querySelector('.stats-document-abstract-publishedIn').innerText.match(/Issue: (\d+),/)? document.querySelector('.stats-document-abstract-publishedIn').innerText.match(/Issue: (\d+),/)[1] : "" : "";
        }

        let printIssnObj = mf_dict.issn.find(function(issnObj) {
            return issnObj.format === "Print ISSN";
        });
        let mf_issn = printIssnObj?.value || "";
        if (mf_issn == ""){
            mf_issn = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Print ISSN: ([0-9-]+)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Print ISSN: ([0-9-]+)/)[1] : "" : "";
        }
        
        let eIssnObj = mf_dict.issn.filter(function(issnObj) {
            return issnObj.format == "Online ISSN" || issnObj.format == "Electronic ISSN";
        });
        let mf_eissn = eIssnObj.map(elem => elem.value).join(";") || "";
        if (mf_eissn == ""){
            mf_eissn = Array.from(document.querySelectorAll('.row.g-0.u-pt-1 .abstract-metadata-indent div')).filter(isbn => isbn.innerText.includes("Online ISSN") || isbn.innerText.includes("Electronic ISSN")).map(isbn => isbn.innerText.replaceAll("Online ISSN: ", "").replaceAll("Electronic ISSN: ", "")).join(";")
            if (mf_eissn){
                mf_eissn = Array.from(document.querySelectorAll('.row.g-0.u-pt-1 .u-pb-1')).filter(isbn => isbn.innerText.includes("Online ISSN") || isbn.innerText.includes("Electronic ISSN")).map(isbn => isbn.innerText.replaceAll("Online ISSN:", "").replaceAll("Electronic ISSN:", "").trim()).join(";")
            }
        }

        // let mf_issn = "";
        // let printIssn = Array.from(document.querySelectorAll('.book-info__isbn')).map(elem => elem.innerText).filter(elem => elem.includes("Print ISSN:"))
        // if (printIssn.length > 0){
        //     mf_issn = printIssn[0].replace("Print ISSN:", "").trim();
        // }
        
        let publisher = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Publisher: (.*)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Publisher: (.*)/)[1].trim() : "" : "";
        if (publisher == ""){
            publisher = mf_dict["publisher"] || "";
        }
        // const volume = document.querySelector('.book-info__volume-number')? document.querySelector('.book-info__volume-number').innerText.trim(): "";
        let first_page = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Page\(s\): (\d+) - (\d+)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Page\(s\): (\d+) - (\d+)/)[1].trim() : "" : "";
        if (first_page == "" && mf_dict["startPage"]?.length <=5){
            first_page = mf_dict["startPage"] || "";
        }
        let last_page = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Page\(s\): (\d+) - (\d+)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Page\(s\): (\d+) - (\d+)/)[2].trim() : "" : "";
        if (last_page == "" && mf_dict["endPage"]?.length <=5){
            last_page = mf_dict["endPage"] || "";
        }
        // let pages = document.querySelector('.row.g-0.u-pt-1')? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Pages: (\d+)/)? document.querySelector('.row.g-0.u-pt-1').innerText.match(/Pages: (\d+)/)[1] : "" : "";
        // if (pages == ""){
        //     pages = mf_dict["pages"] || ""
        // }
        const type = "article"
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
        //     let affilation = Array.from(elem.querySelectorAll('.aff'))
        //         .map(divAff => Array.from(divAff.querySelectorAll('div, a')).map(block => block.textContent.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '')).join(" ")).join("!");
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
        let keywords = "";
        if (mf_dict.keywords && mf_dict.keywords[0] && mf_dict.keywords[0].kwd) {
            keywords = mf_dict.keywords[0].kwd.join(";");
        }
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        let abstract = mf_dict["abstract"]?.replaceAll(/<[^>]+>/g, '').replace("No Abstract.","") || "";
        if (abstract == ""){
            abstract = document.querySelector('.document-abstract .abstract-text')? document.querySelector('.document-abstract .abstract-text').innerText.replace("Abstract:","").trim() : "";
        }
        // let raw_affiliation = Array.from(document.querySelectorAll('.wi-authors .info-card-author'))
        // .filter(elem => {
        //     let author = elem.querySelector('.info-card-name')? elem.querySelector('.info-card-name').innerText.trim() : "";
        //     let affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim() : "";
        //     return author != "" && affilation.length != "";
        // })
        // .map(elem => {
        //     let author = elem.querySelector('.info-card-name').innerText.trim();
        //     let affilation = Array.from(elem.querySelectorAll('.aff'))
        //         .map(divAff => Array.from(divAff.querySelectorAll('div, a')).map(block => block.textContent.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '')).join(" ")).join("!");
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
        //     let affilation = Array.from(elem.querySelectorAll('.aff'))
        //         .map(divAff => Array.from(divAff.querySelectorAll('div, a')).map(block => block.textContent.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '')).join(" ")).join("!");
        //     if (affilation == ""){
        //         affilation = elem.querySelector('.aff')? elem.querySelector('.aff').innerText.trim().replace(elem.querySelector('.label')?elem.querySelector('.label').innerText : "", '') : "";
        //     }
        //     return `${author}:${affilation}`;
        // })
        // let book_author_affiliation = Array.from([...new Set(raw_book_author_affiliation)]).join(";; ");

        // if (affiliation == "" && authors == bookAuthors){
        //     affiliation = book_author_affiliation;
        // }
    
        // let orcidsRaw = Array.from(document.querySelectorAll('.wi-authors .info-card-author'))
        // .filter(elem => {
        //     let author = elem.querySelector('.info-card-name')? elem.querySelector('.info-card-name').innerText.trim() : "";
        //     let orcid = elem.querySelector('.info-card-location')? elem.querySelector('.info-card-location').innerText.trim() : "";
        //     return author != "" && orcid.length != "" && orcid.includes("orcid.org");
        // })
        // .map(elem => {
        //     let author = elem.querySelector('.info-card-name').innerText.trim();
        //     let orcid = Array.from(elem.querySelectorAll('.info-card-location'))
        //         .map(orc => orc.innerText.trim()).join("!");
        //     return `${author}::${orcid}`;
        // })
        // let orcids = Array.from([...new Set(orcidsRaw)]).join(";; ");

        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        var metadata = {'202': title, '200': authors, '203': date, '81': abstract, '184': mf_issn, '185': mf_eissn, '201': keywords, '239': type, '235': publisher, '144': author_aff, '234': authors_orcid, '232': mf_journal, '233': mf_doi, '197':first_page, '198':last_page, '176': volume, '208': issue};
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
                let pdfLinks = document.querySelector(".pdf-btn-link")?document.querySelector(".pdf-btn-link").href : "";
                if (!pdfLinks || pdfLinks.includes("javascript:void()")){
                    pdfLinks = document.querySelector(".document-header-title-container .stats-document-lh-action-downloadPdf_3")?document.querySelector(".document-header-title-container .stats-document-lh-action-downloadPdf_3").href : "";
                    if (!pdfLinks || pdfLinks.includes("javascript:void()")){
                        return null;
                    }
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
            //await changeTorIp();
            //await getCurrentIP();

            browser = await puppeteer.launch({
                //args: ['--proxy-server=127.0.0.1:8118'],
                headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
            });

            page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });

                    //await page.waitForTimeout(1000); // Задержка краулинга

                    // if (await shouldChangeIP(page)) {
                    //     log(`Retrying after changing IP.`);
                    //     // Продолжаем внутренний цикл с новым браузером
                    //     continue mainLoop;
                    // }

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
            //await changeTorIp(); // Меняем IP при ошибке
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
