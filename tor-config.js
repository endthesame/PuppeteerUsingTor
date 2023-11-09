const net = require('net');

function changeTorIp() {
    return new Promise((resolve, reject) => {
        const socket = new net.Socket();

        socket.connect(9051, 'localhost', () => {
            //socket.write('AUTHENTICATE "your_tor_password"\r\n');
            socket.write('SIGNAL NEWNYM\r\n');
            socket.write('QUIT\r\n');
        });

        socket.on('data', (data) => {
            if (data.toString().includes('250 OK')) {
                resolve();
            } else {
                reject(new Error('Failed to change IP'));
            }
        });

        socket.on('error', reject);
    });
}

module.exports = changeTorIp;
