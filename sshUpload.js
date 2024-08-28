// sshUpload.js
const fs = require('fs');
const path = require('path');
const Client = require('ssh2-sftp-client');
require('dotenv').config(); // Загрузка переменных окружения из .env

async function uploadFilesViaSSH(jsonFilePath, htmlFilePath) {
    const sftp = new Client();

    // Конфигурация SSH из переменных окружения
    const sshConfig = {
        host: process.env.SSH_HOST,
        port: process.env.SSH_PORT,
        username: process.env.SSH_USERNAME,
        password: process.env.SSH_PASSWORD,
        remoteDir: process.env.SSH_REMOTE_DIR,
    };

    try {
        await sftp.connect(sshConfig);

        // Загрузка JSON файла
        const remoteJsonPath = `${sshConfig.remoteDir}/${path.basename(jsonFilePath)}`;
        await sftp.put(jsonFilePath, remoteJsonPath);
        console.log('JSON file uploaded successfully.');

        // Загрузка HTML файла
        const remoteHtmlPath = `${sshConfig.remoteDir}/${path.basename(htmlFilePath)}`;
        await sftp.put(htmlFilePath, remoteHtmlPath);
        console.log('HTML file uploaded successfully.');
    } catch (err) {
        console.error('Error during SFTP operation:', err);
    } finally {
        await sftp.end();
    }
}

module.exports = { uploadFilesViaSSH };