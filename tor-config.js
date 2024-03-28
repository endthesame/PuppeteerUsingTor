const { exec } = require('child_process');
const puppeteer = require('puppeteer-extra');
const log = require('./logger');
const { getCurrentIP } = require('./utils');

async function changeTorIp() {
    return new Promise((resolve, reject) => {
        exec('python change_tor_ip.py', (error, stdout, stderr) => {
            if (error) {
                log(`Error: ${error.message}`);
                reject(error);
            }
            if (stderr) {
                log(`Error: ${stderr}`);
                reject(stderr);
            }
            resolve(stdout);
        });
    });
}

async function shouldChangeIP(page) {
    const status = await page.evaluate(() => {
        return document.readyState; // Используйте любые данные или свойства, которые позволяют вам определить состояние страницы.
    });
    const currentURL = page.url();

    // const isTitleAvailable = await page.evaluate(() => {
    //     if (document.querySelector('.citation__title')){
    //         return true;
    //     } else {
    //         return false;
    //     }
    // });

    const isTitleAvailable = await page.evaluate(() => {
        if (document.querySelector('.book-info__title')){
            return true;
        } else {
            return false;
        }
    });

    const isErrorOnPage = await page.evaluate(() => {
        if (document.querySelector('.errorPage')){
            return true;
        } else {return false}
    });

    const actionError = await page.evaluate(() => {
        return document.querySelector('.errorMessage')? document.querySelector('.errorMessage').innerText : "";
    })
    if (actionError == "Your action has resulted in an error. Please click the Back button in your browser and try again."){
        return false;
    }
    const pageNotFind = await page.evaluate(() => {
        return document.querySelector('.error-title')? document.querySelector('.error-title').innerText : ""; 
    });

    if (pageNotFind == "The page youre looking for cannot be found."){
        return false;
    }

    // Условие для смены IP-адреса, включая статус код и паттерн в URL
    if (status > 399 || currentURL.includes("hcvalidate.perfdrive") || isErrorOnPage || !isTitleAvailable) {
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