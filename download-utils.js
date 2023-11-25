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
            await new Promise(resolve => setTimeout(resolve, 3000));
        } catch (error) {
            console.error(`Error downloading PDF from ${pdfLink}: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 15000));
            changeTorIp();
        }
    }
}

function downloadPDF(pdfLink, pdfSavePath) {
    return new Promise((resolve, reject) => {
        const proxyOptions = {
            host: 'http://127.0.0.1:8118',
            //port: 8118, // НЕ РАЗКОМЕНТИРОВАТЬ
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_11_2) AppleWebKit/601.3.9 (KHTML, like Gecko) Version/9.0.2 Safari/601.3.9',
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