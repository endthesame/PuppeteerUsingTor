const net = require('net');

function changingIPProcess() {
    return new Promise((resolve, reject) => {
        const torControlPort = 9051;
        const torControlHost = '127.0.0.1';
        const controlPassword = ''; // Если вы настроили пароль, укажите его здесь

        const client = net.createConnection({
            port: torControlPort,
            host: torControlHost,
        }, () => {
            // Аутентификация с паролем, если он установлен
            if (controlPassword) {
                client.write(`AUTHENTICATE "${controlPassword}"\r\n`);
            } else {
                client.write('AUTHENTICATE\r\n');
            }
        });

        let commandSent = false; // Флаг для отслеживания отправки команды

        client.on('data', (data) => {
            const response = data.toString();

            if (response.startsWith('250 OK') && !commandSent) {
                // Аутентификация прошла успешно, отправляем команду SIGNAL NEWNYM
                client.write('SIGNAL NEWNYM\r\n');
                commandSent = true; // Устанавливаем флаг после отправки команды
            } else if (response.includes('250 OK') && commandSent) {
                // Команда SIGNAL NEWNYM прошла успешно
                resolve('IP changed successfully');
                client.end();
            } else if (response.startsWith('515')) {
                reject(new Error('Tor authentication failed: ' + response));
                client.end();
            } else {
                reject(new Error('Tor command failed: ' + response));
                client.end();
            }
        });

        client.on('error', (err) => {
            reject(err);
        });
    });
}

module.exports = { changingIPProcess };
