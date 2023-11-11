const fs = require('fs');
//const fetch = require('node-fetch');

async function downloadFile(url, savePath) {
    const agent = new fetch.Agent({ // agent для прокси через Privoxy и Tor
        http: 'http://localhost:8118', // Прокси через Privoxy
        https: 'http://localhost:8118' // Прокси через Privoxy
    });

    const response = await fetch(url, { agent }); // Передача agent в fetch

    if (!response.ok) {
        throw new Error(`Failed to fetch: ${url}`);
    }

    const buffer = await response.buffer(); // Используйте buffer() для получения буфера данных
    fs.writeFileSync(savePath, buffer); // Запишите буфер в файл
}

module.exports = { downloadFile };
