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

module.exports = {getCurrentIP};