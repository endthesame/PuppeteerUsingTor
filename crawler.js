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
    
        const title = document.querySelector('.col-md-7 h1.h3')? document.querySelector('.col-md-7 h1.h3').innerText : "";
        let date = document.querySelector('.btn-info')? document.querySelector('.btn-info').getAttribute('data-content').trim().match(/\s*<br \/>eISBN:\s*([0-9-]+),\s*(\d{4})/)? document.querySelector('.btn-info').getAttribute('data-content').trim().match(/\s*<br \/>eISBN:\s*([0-9-]+),\s*(\d{4})/)[2] : "" : "";
        if (date.length == 4){
            date = `${date}-01-01`;
        }
        let authors = document.querySelector('#side-b p')? document.querySelector('#side-b p').innerText.trim().match(/Author\(s\):\s*(.*)/)? document.querySelector('#side-b p').innerText.trim().match(/Author\(s\):\s*(.*)/)[1].replaceAll(' and ', ", ").replaceAll("*","") : "" : "";
        if (authors == "") {
            authors = Array.from(document.querySelectorAll('.col-md-7 p a.text-secondary')).map(elem => {
                return elem.innerText;
            }).join("; ").replaceAll(" *","")
        }
        const mf_doi = document.querySelector('.col-md-7')? document.querySelector('.col-md-7').innerText.trim().match(/\s*DOI:\s*(.*)\s*/)? document.querySelector('.col-md-7').innerText.trim().match(/\s*DOI:\s*(.*)\s*/)[1] : "" : "";
        
        const first_part_mf_book = document.querySelector('.media-body .pr-lg-3')? document.querySelector('.media-body .pr-lg-3').innerText : "";
        const second_part_mf_book = document.querySelector('a[data-original-title="Book Details"]')?document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<h5>(.*)<\/h5>/)? document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<h5>(.*)<\/h5>/)[1].trim() : "" : "";
        const third_part_mf_book = document.querySelector('.media-body h3.h6')? document.querySelector('.media-body h3.h6').innerText.trim() : "";
        const mf_book_part = [first_part_mf_book, second_part_mf_book, third_part_mf_book]  
        const mf_book = mf_book_part.filter(elem => elem != "").join(", ")
        
        const mf_isbn = document.querySelector('a[data-original-title="Book Details"]')?document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>ISBN:\s*([0-9-]+)\s*/)? document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>ISBN:\s*([0-9-]+)\s*/)[1] : "" : "";
        const mf_eisbn = document.querySelector('a[data-original-title="Book Details"]')?document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>eISBN:\s*([0-9-]+)\s*/)? document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>eISBN:\s*([0-9-]+)\s*/)[1] : "" : "";
        const mf_issn = document.querySelector('a[data-original-title="Book Details"]')?document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>ISSN:\s+?(\d+-[0-9A-Za-z]+)\s+?<strong>\(Print\)/)? document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>ISSN:\s+?(\d+-[0-9A-Za-z]+)\s+?<strong>\(Print\)/)[1] : "" : "";
        const mf_eissn = document.querySelector('a[data-original-title="Book Details"]')?document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>ISSN:\s+?(\d+-[0-9A-Za-z]+)\s+?<strong>\(Online\)/)? document.querySelector('a[data-original-title="Book Details"]').getAttribute('data-content').match(/<br \/>ISSN:\s+?(\d+-[0-9A-Za-z]+)\s+?<strong>\(Online\)/)[1] : "" : "";
        const publisher = document.querySelector('#CiteWindow .table')? document.querySelector('#CiteWindow .table').innerText.match(/Publisher Name(.*)/)? document.querySelector('#CiteWindow .table').innerText.match(/Publisher Name(.*)/)[1].trim() : "" : "";
        const volume = document.querySelector('.media-body .h6')? document.querySelector('.media-body .h6').innerText.match(/Volume: (\d+)/)? document.querySelector('.media-body .h6').innerText.match(/Volume: (\d+)/)[1] : "" : "";
        //const issue = getMetaAttributes(['meta[name="citation_issue"]'], 'content');
        const first_page = romanToNumberOrReturn(document.querySelector('.col-md-7')? document.querySelector('.col-md-7').innerText.trim().match(/\s*Pp:\s*([a-zA-Z0-9]+)-([a-zA-Z0-9]+)\s*/)? document.querySelector('.col-md-7').innerText.trim().match(/\s*Pp:\s*([a-zA-Z0-9]+)-([a-zA-Z0-9]+)\s*/)[1] : "" : "");
        const last_page = romanToNumberOrReturn(document.querySelector('.col-md-7')? document.querySelector('.col-md-7').innerText.trim().match(/\s*Pp:\s*([a-zA-Z0-9]+)-([a-zA-Z0-9]+)\s*/)? document.querySelector('.col-md-7').innerText.trim().match(/\s*Pp:\s*([a-zA-Z0-9]+)-([a-zA-Z0-9]+)\s*/)[2] : "" : "");
        //const language = getMetaAttributes(['meta[name="dc.Language"]'], 'content') || "";
        // const affiliation = getMetaAttributes(['meta[name="citation_author_institution"]'], 'content');
        const keywords = Array.from(document.querySelectorAll('.col-md-8 .card .card-body p')).map(elem => {
            let text = elem.innerText.trim();
            if (text.includes("Keywords:")){
                text = text.replaceAll("Keywords:", "");
            } else {
                text = "";
            }
            return text;
        }).join(" ").trim() || "";
        //ABSTRACT
        // const abstractXPath = '//div[@class="NLM_abstract"]//p/text()';
        // const abstractSnapshot = document.evaluate(abstractXPath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
        // const abstractTexts = [];
        // for (let i = 0; i < abstractSnapshot.snapshotLength; i++) {
        //     abstractTexts.push(abstractSnapshot.snapshotItem(i).textContent);
        // }
        // const abstract = abstractTexts.join(' ') || "";
        const abstract = Array.from(document.querySelectorAll('.col-md-8 .card .card-body p')).map(elem => {
            var text = elem.innerText.trim();
            if (text.includes("Keywords:")){
              text = "";
            }
			return text;
        }).join(" ").trim() || "";

        const authors_aff = Array.from(document.querySelectorAll('.row .text-secondary'))
        .filter(elem => {
            let author = elem.innerText.replaceAll("*","") || "";
            let affilation = elem.getAttribute("data-content").replace("<ul><li>","").replace("</li></ul>","").trim();
            return author != "" && affilation != "";
        })
        .map(elem => {
            let author = elem.innerText.replaceAll("*","");
            let affilation = elem.getAttribute("data-content").replace("<ul><li>","").replace("</li></ul>","").trim();
            return `${author}:${affilation}`;
        }).join(";; ")
        
        //Type
        // const orcid = getMetaAttributes(['.orcid.ver-b'], 'href', 'a');
    
        var metadata = { "202": title, "200": authors, "233": mf_doi, '197': first_page, '198': last_page, '81': abstract, '242': mf_book, '240': mf_isbn, '241': mf_eisbn, '203': date, '176': volume, '201': keywords, '184': mf_issn, '185': mf_eissn, '235': publisher, '144':authors_aff};
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

    //await page.waitForNavigation(); // Wait for navigation to complete
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
            pdfLinksToDownload = await page.evaluate((url) => {
                var pdfLinks = document.querySelector("#pdf")? url : "";
                if (!pdfLinks){
                    return null;
                }
                return pdfLinks.replace("reader", "pdf").replace("epdf", "pdf");

                // const pdfLinks = Array.from(document.querySelectorAll("a[href]"))
                // .filter(a => a.href.match(/\/doi\/reader.*/))
                // .map(a => a.href.replace("reader", "pdf") + "?download=true");
                // return pdfLinks;
            }, url);
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

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 40000 });

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
            const fieldsToUpdate = ['144', '200'];
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

module.exports = { crawl, extractData, parsing};
