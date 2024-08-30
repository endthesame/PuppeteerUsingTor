const fs = require('fs');
const path = require('path');
const { PROJECT_ROOT } = require('../config');

const logsFolderPath = path.join(PROJECT_ROOT, 'logs');

// Создать структуру папок для логов, если она не существует
if (!fs.existsSync(logsFolderPath)) fs.mkdirSync(logsFolderPath);

// Создать файл для логов с текущим временем в названии
const logFileName = `log_${new Date().toLocaleString().replace(/[/:,\s]/g, '_')}.log`;
const logFilePath = path.join(logsFolderPath, logFileName);

// Функция для логирования
function log(message) {
    const logMessage = `[${new Date().toLocaleString()}] ${message}\n`;
    fs.appendFileSync(logFilePath, logMessage);
    console.log(logMessage);
}

module.exports = log;