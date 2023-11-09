const fs = require('fs');
// const fetch = require('node-fetch');

async function downloadFile(url, savePath) {
    const fetch = await import('node-fetch');
    const response = await fetch.default(url);  // Обратите внимание на .default здесь
    const buffer = await response.arrayBuffer();
    fs.writeFile(savePath, buffer, () => {});
}

module.exports = { downloadFile };