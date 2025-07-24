const http = require('http');
import { add } from './wasm-loader.js';

const hostname = "127.0.0.1";
const port = 3000;

const server = http.createServer((req, res) => {
    res.writeHead(200, {
        'Content-type': 'application/json'
    });
    res.end(`Hello, World! The output of the imported zig method is: ${wasm_loader.add(1,2)}`);
});

server.listen(port, hostname, () => {
    console.log(`Server running at http://${hostname}:${port}/`)
});