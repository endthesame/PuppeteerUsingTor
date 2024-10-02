const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { extractData } = require('./extractor');
const URLFrontier = require('./frontier'); // Import Frontier
const log = require('./logger');

puppeteer.use(StealthPlugin());

/**
 * Initialize the URL Frontier with seeds from file
 */
function initializeFrontier(seedFilePath) {
    const frontier = new URLFrontier();
    const seeds = fs.readFileSync(seedFilePath, 'utf-8').split('\n').filter(url => url.trim() !== '');
    seeds.forEach(seed => frontier.addUrl(seed.trim()));
    return frontier;
}

/**
 * Crawl function with BFS traversal
 */
async function crawl(seedFilePath, jsonFolderPath, htmlFolderPath, taskPath, options) {
    const frontier = initializeFrontier(seedFilePath);
    const { useTor } = options;

    while (frontier.hasMoreUrls()) {
        let browser, page;
        try {
            if (useTor) {
                await changeTorIp();
                browser = await puppeteer.launch({ args: ['--proxy-server=127.0.0.1:8118'], headless: true });
            } else {
                browser = await puppeteer.launch({ headless: true });
            }

            page = await browser.newPage();
            await page.setViewport({ width: 1920, height: 1080 });

            const url = frontier.getNextUrl();
            if (!url) break;

            frontier.markVisited(url);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

            await extractData(page, jsonFolderPath, htmlFolderPath, taskPath, url);

            const newLinks = await page.evaluate(() => {
                const anchors = Array.from(document.querySelectorAll('a[href]'));
                return anchors.map(a => a.href).filter(link => link.startsWith('http'));
            });

            newLinks.forEach(link => frontier.addUrl(link));

            log(`Successfully processed ${url}`);
        } catch (error) {
            log(`Error processing ${url}: ${error.message}`);
        } finally {
            if (browser) await browser.close();
        }
    }

    log('Crawling finished.');
}

module.exports = { crawl };
