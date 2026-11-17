// SINH KHÓA + GENESIS + CẤU HÌNH CHO CẢ MẠNG (chạy lại là xóa dữ liệu cũ)
//   node tools/setup.js  → 3 node trường + node backup chạy chung trên 1 máy (cổng 3001-3003, 3100)
//   node tools/setup.js --backup http://<IP VPS>:3100   → node backup nằm trên VPS thật
const fs = require('fs');
const bc = require('../server/chain');

const schools = ['Đại học A', 'Đại học B', 'Đại học C'];
const schoolUrls = [3001, 3002, 3003].map((port) => `http://localhost:${port}`);
const flag = process.argv.indexOf('--backup');
const backupUrl = flag > 0 ? process.argv[flag + 1] : 'http://localhost:3100';

const admin = bc.generateKeys();
const keys = schools.map(() => bc.generateKeys());
const genesis = bc.createGenesis(admin.publicKey, schools.map((name, i) => ({ name, publicKey: keys[i].publicKey })));
const salt = bc.sha256(String(Math.random())); // dùng để băm mã sinh viên, giống nhau ở mọi node

fs.rmSync('data', { recursive: true, force: true });
function writeConfig(folder, config) {
  fs.mkdirSync('data/' + folder, { recursive: true });
  fs.writeFileSync(`data/${folder}/config.json`, JSON.stringify({ ...config, salt, genesis }, null, 2));
}

schools.forEach((name, i) => writeConfig('node' + (i + 1), {
  name, port: 3001 + i,
  peers: [...schoolUrls.filter((u, j) => j !== i), backupUrl], // gửi block + đẩy chain lên cả node backup
  privateKey: keys[i].privateKey,
  ...(i === 0 ? { adminKey: admin.privateKey } : {}), // chỉ node 1 (máy của Bộ GD&ĐT) giữ khóa Admin
}));

// Node backup: không khóa, không peer — trên VPS nó không gọi vào được máy của các trường,
// nên các trường tự gửi block và đẩy chain lên cho nó. Tắt giả lập tấn công vì nó có thể nằm trên Internet.
writeConfig('backup', { name: 'Backup VPS', readonly: true, noDebug: true, port: Number(new URL(backupUrl).port) || 3100, peers: [] });

// Địa chỉ các node cho giao diện web
fs.writeFileSync('web/config.js', `// Sinh bởi tools/setup.js\nconst NET = ${JSON.stringify({ schools: schoolUrls, backup: backupUrl }, null, 2)};\n`);

console.log(`Đã tạo data/ và web/config.js — node backup: ${backupUrl}`);
console.log(fs.readdirSync('data').map((f) => '  data/' + f).join('\n'));
