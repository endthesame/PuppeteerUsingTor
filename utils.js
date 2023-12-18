const request = require('request');
const log = require('./logger');

async function getCurrentIP() {
    return new Promise((resolve, reject) => {
        const options = {
            url: 'https://api.ipify.org',
            proxy: 'http://127.0.0.1:8118', // Указание прокси
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
        const classesToCheck = ['.free-access', '.open-access', '.icon-availability_open', '.icon-availability_free', '.meta-panel__access--free', '.meta-panel__access--open', 'span[title="This content is available for free"]', 'open-access-icon', '[alt="Open Access"]'];
        for (const classSelector of classesToCheck) {
            const elements = document.querySelectorAll(classSelector);
            if (elements.length > 0) {
                return true; // Нашли хотя бы один элемент
            }
        }
        return false; // Не нашли ни одного элемента
    });
}

module.exports = {getCurrentIP, checkAccess};