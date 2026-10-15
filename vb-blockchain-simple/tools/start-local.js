// CHẠY CẢ MẠNG TRÊN 1 MÁY (để học, trước khi lên máy ảo): node tools/start-local.js
// Cần chạy "node tools/setup.js local" trước. Ctrl+C để tắt hết.
const { spawn } = require('child_process');
const fs = require('fs');

for (const folder of fs.readdirSync('data')) {
  const child = spawn(process.execPath, ['server/node.js', 'data/' + folder]);
  const print = (d) => d.toString().trim().split('\n').forEach((line) => console.log(folder.padEnd(8) + '| ' + line));
  child.stdout.on('data', print);
  child.stderr.on('data', print);
}
console.log('Mở trình duyệt: http://localhost:3001');
