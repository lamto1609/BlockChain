// SINH KHÓA + GENESIS + CẤU HÌNH CHO CẢ MẠNG (chạy MỘT lần, rồi chép thư mục data/ sang các máy)
//   node tools/setup.js local  → 3 node trường + 1 node chỉ đọc chạy chung trên 1 máy (cổng 3001-3003, 3011)
//   node tools/setup.js vm     → mỗi node một máy ảo: 192.168.56.11-13 (trường), .21/.22 (chỉ đọc), cổng 3000
const fs = require('fs');
const bc = require('../server/chain');

const mode = process.argv[2];
if (mode !== 'local' && mode !== 'vm') { console.log('Cách chạy: node tools/setup.js local | vm'); process.exit(1); }

const schools = ['Đại học A', 'Đại học B', 'Đại học C'];
const url = (ip, localPort) => (mode === 'vm' ? `http://${ip}:3000` : `http://localhost:${localPort}`);
const schoolUrls = [url('192.168.56.11', 3001), url('192.168.56.12', 3002), url('192.168.56.13', 3003)];
const readerUrls = [url('192.168.56.21', 3011), url('192.168.56.22', 3012)];

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
  name, port: mode === 'vm' ? 3000 : 3001 + i,
  peers: schoolUrls.filter((u, j) => j !== i),
  privateKey: keys[i].privateKey,
  ...(i === 0 ? { adminKey: admin.privateKey } : {}), // chỉ node 1 (máy của Bộ GD&ĐT) giữ khóa Admin
}));

// Node chỉ đọc: không có khóa, chỉ đồng bộ chain từ 3 trường. Trên máy ảo mọi node chỉ đọc dùng chung 1 cấu hình.
if (mode === 'vm') writeConfig('reader', { readonly: true, port: 3000, peers: schoolUrls });
else readerUrls.forEach((u, i) => writeConfig('reader' + (i + 1), { name: 'Chỉ đọc ' + (i + 1), readonly: true, port: 3011 + i, peers: schoolUrls }));

// Danh sách node cho giao diện web. Trên máy ảo, trang web gọi qua nginx (/n1, /api...) nên dùng đường dẫn tương đối.
const web = mode === 'vm'
  ? { api: '/api', schools: ['/n1', '/n2', '/n3'], readers: ['/r1', '/r2'] }
  : { api: schoolUrls[0], schools: schoolUrls, readers: readerUrls };
fs.writeFileSync('web/config.js', `// Sinh bởi tools/setup.js ${mode}\nconst NET = ${JSON.stringify(web, null, 2)};\n`);

console.log(`Đã tạo data/ (chế độ ${mode}) và web/config.js`);
console.log(fs.readdirSync('data').map((f) => '  data/' + f).join('\n'));
