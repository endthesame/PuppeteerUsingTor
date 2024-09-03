const puppeteer = require('puppeteer-extra');
const { TimeoutError } = require('puppeteer');
const StealhPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const {changeTorIp, shouldChangeIP} = require('./utils/tor-config');
const log = require('./logger');
const crypto = require('crypto');
const { getCurrentIP, checkAccess } = require('./utils/utils');
const { uploadFilesViaSSH } = require('./utils/sshUpload');

puppeteer.use(StealhPlugin());

async function extractMetafields(page, task_path) {
    const getTaskForMFExtractor = require(task_path);
    let meta_data = await page.evaluate(getTaskForMFExtractor);
    if (typeof meta_data === 'object' && meta_data !== null) {
        return meta_data;
    } else {
        return null;
    }
}

async function extractData(page, jsonFolderPath, pdfFolderPath, htmlFolderPath, siteFolderPath, task_path, url, downloadPDFmark = false, checkOpenAccess = false, onlyjson = false, uploadViaSSH = false) {
    log(`Processing URL: ${url}`);
    const meta_data = await extractMetafields(page, task_path);
    if (meta_data == false)
    {
        console.log(`Skipping from ${url} due to lack of metadata (title).`);
        return;
    }
    if (meta_data == null) {
        console.log(`Skipping from ${url} due to bad task or bad loaded page.`);
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

    const htmlFilePath = path.join(htmlFolderPath, `${baseFileName}.html`);
    const htmlSource = await page.content();
    fs.writeFile(htmlFilePath, htmlSource, (err) => {
      if (err) {
        log('Error saving HTML to file:', err);
      } else {
        log('HTML saved to file successfully');
      }
    });

    if (uploadViaSSH) {
        await uploadFilesViaSSH(jsonFilePath, htmlFilePath);
    }

    if (downloadPDFmark) {
        let isOpenAccess = true;
        if (checkOpenAccess) {
            isOpenAccess = await checkAccess(page);
    
            if (!isOpenAccess) {
                log(`Skipping downloading PDF from ${url} due to lack of open access.`);
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
                log(`PDF link for ${url} was found`)
                const pdfFileName = baseFileName + '.pdf';
                const linksTxtPath = path.join(siteFolderPath, 'Links.txt');
                fs.appendFileSync(linksTxtPath, `${pdfLinksToDownload} ${pdfFileName}\n`);
            }
        }
    }
}

async function crawl(jsonFolderPath, pdfFolderPath, htmlFolderPath, siteFolderPath, linksFilePath, options) {
    const { taskPath, downloadPDFmark, checkOpenAccess, useTor, uploadViaSSH } = options;
    mainLoop: while (true) {
        let browser;
        let page;

        try {
            if (useTor) {
                await changeTorIp();
                await getCurrentIP();
                browser = await puppeteer.launch({
                    args: ['--proxy-server=127.0.0.1:8118'],
                    headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
                });
            } else {
                browser = await puppeteer.launch({
                    //args: ['--proxy-server=127.0.0.1:8118'],
                    headless: 'new' //'new' for "true mode" and false for "debug mode (Browser open))"
                });
            }

            page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });

            // Проверка, есть ли еще ссылки для краулинга
            let remainingLinks = fs.readFileSync(linksFilePath, 'utf-8').split('\n').filter(link => link.trim() !== '');

            while (remainingLinks.length > 0) {
                const url = remainingLinks[0].trim();

                try {
                    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    //await page.waitForTimeout(1000); // Задержка краулинга

                    if (useTor && await shouldChangeIP(page)) {
                        log(`Retrying after changing IP.`);
                        // Продолжаем внутренний цикл с новым браузером
                        continue mainLoop;
                    }

                    // Проверка, что основной документ полностью загружен
                    await page.waitForSelector('body');

                    await extractData(page, jsonFolderPath, pdfFolderPath, htmlFolderPath, siteFolderPath, taskPath, url, downloadPDFmark, checkOpenAccess, uploadViaSSH);
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
            if (useTor) await changeTorIp(); // Меняем IP при ошибке
        } finally {
            if (browser) {
                await browser.close(); // Закрываем текущий браузер
            }
        }
    }

    log('Crawling finished.');
}

module.exports = { crawl, extractData, extractMetafields };
