// const net = require('net');

// function changeTorIp() {
//     return new Promise((resolve, reject) => {
//         const socket = new net.Socket();

//         socket.connect(9051, '127.0.0.1', () => {
//             //socket.write('AUTHENTICATE "your_tor_password"\r\n');
//             socket.write('SIGNAL NEWNYM\r\n');
//             socket.write('QUIT\r\n');
//         });

//         socket.on('data', (data) => {
//             if (data.toString().includes('250 OK')) {
//                 resolve();
//             } else {
//                 reject(new Error('Failed to change IP'));
//             }
//         });

//         socket.on('error', reject);
//     });
// }

// module.exports = changeTorIp;

const { exec } = require('child_process');

async function changeTorIp() {
    return new Promise((resolve, reject) => {
        exec('python change_tor_ip.py', (error, stdout, stderr) => {
            if (error) {
                console.error(`Error: ${error.message}`);
                reject(error);
            }
            if (stderr) {
                console.error(`Error: ${stderr}`);
                reject(stderr);
            }
            console.log(`Tor IP changed: ${stdout}`);
            resolve(stdout);
        });
    });
}

 module.exports = changeTorIp;