const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');
const {changeTorIp} = require('./tor-config');

async function downloadPDFs(linksFilePath, pdfFolderPath) {
    const links = fs.readFileSync(linksFilePath, 'utf-8').split('\n');

    for (const link of links) {
        if (!link.trim()) {
            continue;
        }

        const [pdfLink, pdfFileName] = link.trim().split(' ');

        const pdfSavePath = path.join(pdfFolderPath, pdfFileName);

        try {
            await downloadPDF(pdfLink, pdfSavePath);
            console.log(`PDF downloaded successfully from ${pdfLink} and saved as ${pdfSavePath}`);
        } catch (error) {
            console.error(`Error downloading PDF from ${pdfLink}: ${error.message}`);
            await changeTorIp();
            await new Promise(resolve => setTimeout(resolve, 15000));
        }
    }
}

function downloadPDF(pdfLink, pdfSavePath) {
    return new Promise((resolve, reject) => {
        const proxyOptions = {
            host: 'http://127.0.0.1:8118',
            //port: 8118,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:120.0) Gecko/20100101 Firefox/120.0',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                // 'Accept-Encoding': 'gzip, deflate, br',
                // 'Accept-Language': 'ru-RU,ru;q=0.8,en-US;q=0.5,en;q=0.3',
                // 'Connection': 'keep-alive',
                // 'Origin': 'https://iopscience.iop.org',
                // 'Referer': 'https://iopscience.iop.org/',
                // 'Cookie': '__uzma=5b312d6f-5190-4a11-81f0-dce3638b30c7; __uzmb=1695607141; __uzme=2463; __uzmc=1549276027478; __uzmd=1700991659; IOP_session_live=%2F%2F1700991659305%7Cfe56979a-4a2f-4422-a303-80a58367fb6b%7Cefd26e5b-6b6a-427b-aad2-cb2c89aec92c%7C%7C%7C%7C%7C%7C%7C%7C%7Cguest%2Fb322e9fc6e6ae64b7980e4b3b4ef97a2; JSESSIONID=A2D82C9C242ADD61C25EF4ACD8DF390E; AWSALB=GivUHS/Yy/a3qkJBU4G9iDlsEnzm9sgneCZ5QNvZVJCRGHcfQyXXYCMVUzsT9FKI/Am16lNQGMAAKutK5PYkxoTGfG1bxAYL0xF89WfTF30+b1u04OK0L4tKhD/w; AWSALBCORS=GivUHS/Yy/a3qkJBU4G9iDlsEnzm9sgneCZ5QNvZVJCRGHcfQyXXYCMVUzsT9FKI/Am16lNQGMAAKutK5PYkxoTGfG1bxAYL0xF89WfTF30+b1u04OK0L4tKhD/w',
                // 'Sec-Fetch-Dest': 'document',
                // 'Sec-Fetch-Mode': 'navigate',
                // 'Sec-Fetch-Site': 'same-origin',
                // 'Sec-Fetch-User': '?1'
            },
        };

        const downloader = pdfLink.startsWith('https') ? https : http;

        const request = downloader.get(pdfLink, proxyOptions, (response) => {
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location.includes('perfdrive')) {
                reject(new Error('Redirecting to a perfdrive URL. Handle accordingly.'));
                return;
            }
            if (response.statusCode >= 400) {
                reject(new Error(`Error: HTTP status code ${response.statusCode}`));
                return;
            }

            const fileStream = fs.createWriteStream(pdfSavePath);

            response.pipe(fileStream);

            fileStream.on('finish', () => {
                fileStream.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(pdfSavePath, () => {});
            reject(new Error(`Error downloading file: ${err.message}`));
        });

        request.on('socket', (socket) => {
            // Настройка прокси
            // socket.on('connect', () => {
            //   socket.write(`CONNECT ${proxyOptions.host}:${proxyOptions.port} HTTP/1.1\r\n\r\n`);
            // });
        });
    });
}

module.exports = {downloadPDFs, downloadPDF };