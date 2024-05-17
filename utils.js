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
        // const classesToCheck = ['.free-access', '.open-access', '.icon-availability_open', '.meta-panel__access--free', '.meta-panel__access--open'];
        // for (const classSelector of classesToCheck) {
        //     const elements = document.querySelectorAll(classSelector);
        //     if (elements.length > 0) {
        //         return true; // Нашли хотя бы один элемент
        //     }
        // }
        let iconOAtext = document.querySelector('.si-masthead__m > si-seo-chiplist:nth-child(1) > div:nth-child(1) > div:nth-child(1) > button:nth-child(1) > span:nth-child(1) > mat-icon')? document.querySelector('.si-masthead__m > si-seo-chiplist:nth-child(1) > div:nth-child(1) > div:nth-child(1) > button:nth-child(1) > span:nth-child(1) > mat-icon').innerText : "";
        if (iconOAtext == "lock"){
            return false;
        }
        return true; // Не нашли ни одного элемента
    });
}

module.exports = {getCurrentIP, checkAccess};