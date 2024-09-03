const path = require('path');
const { exec } = require('child_process');
const log = require('../logger');
const { getCurrentIP } = require('./utils');
const { changingIPProcess } = require('./changeTorIp')

async function changeTorIp() {
    try {
        const result = await changingIPProcess();
        log(result); // Сообщение о успешной смене IP
    } catch (error) {
        log('Error changing IP:', error.message); // Сообщение об ошибке
    }
}

async function shouldChangeIP(page) {
    const status = await page.evaluate(() => {
        return document.readyState; // Используйте любые данные или свойства, которые позволяют вам определить состояние страницы.
    });
    const currentURL = page.url();

    const isTitleAvailable = await page.evaluate(() => {
        let title = document.querySelector('.article-title-main')? document.querySelector('.article-title-main').innerText.trim() : "";
        if (title == ""){
            return false;
        } else {
            return true;
        }
    });

    // const isTitleAvailable = await page.evaluate(() => {
    //     if (document.querySelector('.uk-article-title')){
    //         return true;
    //     } else {
    //         return false;
    //     }
    // });

    // const error403 = await page.evaluate(() => {
    //     if (document.querySelector('.explanation-message')){
    //         return true
    //     }
    //     else if (document.querySelector('h1')){
    //         if (document.querySelector('h1')?.textContent === "403 Forbidden"){
    //             return true;
    //         }
    //     }
    //     else {
    //         return false
    //     }
    // });

    // Условие для смены IP-адреса, включая статус код и паттерн в URL
    if (status > 399 || currentURL.includes("hcvalidate.perfdrive") || currentURL.includes("crawlprevention") || !isTitleAvailable || currentURL.includes("oup2-idp")) {
        log('Changing IP address...');
        await new Promise(resolve => setTimeout(resolve, 15000)); // чтобы тор не таймаутил
        await changeTorIp();
        log('IP address changed successfully.');
        await getCurrentIP();
        return true;
    }
    return false;
}

 module.exports = {changeTorIp, shouldChangeIP};