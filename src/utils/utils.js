const request = require('request');
const log = require('../logger');

async function getCurrentIP() {
    return new Promise((resolve, reject) => {
        const options = {
            url: 'https://api.ipify.org',
            proxy: 'http://127.0.0.1:8118', // Proxy
        };

        request(options, (error, response, body) => {
            if (!error && response.statusCode === 200) {
                log(`Current IP: ${body}`);
                resolve(body);
            } else {
                reject(error);
            }
        });
    });
}


async function checkAccess(page) {
    return await page.evaluate(() => {
        const classesToCheck = ['.free-access', '.open-access', '.icon-availability_open', '.meta-panel__access--free', '.meta-panel__access--open'];
        for (const classSelector of classesToCheck) {
            const elements = document.querySelectorAll(classSelector);
            if (elements.length > 0) {
                return true;
            }
        }
        return false;
    });
}

module.exports = {getCurrentIP, checkAccess};