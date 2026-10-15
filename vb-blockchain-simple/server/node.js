'use strict';
// SERVER CỦA MỘT NODE: giữ bản sao chain, nhận giao dịch, tạo block đúng lượt, đồng bộ với node khác, phục vụ API và giao diện.
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const bc = require('./chain');

// ---------- 1. Đọc cấu hình ----------
const dir = process.argv[2];
if (!dir) { console.log('Cách chạy: node server/node.js <thư mục node>, ví dụ data/node1'); process.exit(1); }
const config = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
const name = config.name || os.hostname(); // node chỉ đọc lấy tên máy làm tên
const chainFile = path.join(dir, 'chain.json');
const genesis = config.genesis;
const myKey = config.privateKey ? bc.publicKeyOf(config.privateKey) : null;

// ---------- 2. Trạng thái của node ----------
let chain = fs.existsSync(chainFile) ? JSON.parse(fs.readFileSync(chainFile, 'utf8')) : [genesis];
if (chain[0].hash !== genesis.hash) chain = [genesis]; // chain.json của lần cài trước → bỏ
let mempool = [];      // giao dịch đang chờ vào block
let status, state;     // kết quả kiểm tra chain + chỉ mục dựng lại từ chain
let invalidSince = null;

function refresh() {
  const r = bc.validateChain(chain, genesis);
  status = { valid: r.valid, error: r.error };
  state = r.state;
  invalidSince = r.valid ? null : invalidSince || Date.now();
}
function save() { fs.writeFileSync(chainFile, JSON.stringify(chain, null, 2)); }
refresh();
save();
const tip = () => chain[chain.length - 1];

// Ai đó sửa tay chain.json khi node đang chạy (kịch bản 5) → đọc lại và kiểm tra ngay
fs.watchFile(chainFile, { interval: 1000 }, () => {
  const text = fs.readFileSync(chainFile, 'utf8');
  if (text === JSON.stringify(chain, null, 2)) return; // chính node vừa ghi file
  try { chain = JSON.parse(text); } catch { return; } // đang lưu dở, lần sau đọc lại
  console.log('chain.json vừa bị sửa tay → kiểm tra lại chain');
  refresh();
});

// ---------- 3. Mempool và tạo block ----------

// Nhận giao dịch: thử áp lên "state + các giao dịch đang chờ", sai thì ném lỗi
function addTx(tx) {
  if (mempool.some((t) => t.signature === tx.signature)) return false;
  const s = structuredClone(state);
  for (const t of [...mempool, tx]) bc.applyTx(s, t, tip().index + 1);
  mempool.push(tx);
  return true;
}

// Bỏ khỏi mempool giao dịch đã vào chain hoặc không còn hợp lệ
function cleanMempool() {
  const inChain = new Set(chain.flatMap((b) => b.transactions.map((t) => t.signature)));
  const s = structuredClone(state);
  mempool = mempool.filter((tx) => {
    if (inChain.has(tx.signature)) return false;
    try { bc.applyTx(s, tx, tip().index + 1); return true; } catch { return false; }
  });
}

// Nhận block từ chính mình hoặc từ node khác; chỉ nối nếu đúng là block kế tiếp và hợp lệ
function receiveBlock(block) {
  if (block.index !== tip().index + 1) return false;
  const s = structuredClone(state);
  try { bc.applyBlock(s, block, tip()); } catch (e) { console.log('Từ chối block:', e.message); return false; }
  chain.push(block);
  state = s;
  cleanMempool();
  save();
  return true;
}

// Mỗi giây: nếu tới lượt mình (PoA), có giao dịch chờ và đã qua 5 giây từ block trước → tạo block
function tick() {
  if (config.readonly || !status.valid || !mempool.length) return;
  if (bc.turnOf(state, tip().index + 1) !== myKey) return;
  if (Date.now() - tip().timestamp < 5000) return;
  const block = bc.createBlock(tip(), mempool, config.privateKey);
  if (receiveBlock(block)) {
    console.log(`Tạo block #${block.index} (${block.transactions.length} giao dịch)`);
    broadcast('/blocks', block);
  }
}

// ---------- 4. Đồng bộ với các node khác qua HTTP ----------

function broadcast(urlPath, body) {
  for (const peer of config.peers) {
    fetch(peer + urlPath, { method: 'POST', body: JSON.stringify(body), signal: AbortSignal.timeout(2000) }).catch(() => {});
  }
}

// Mỗi 3 giây hỏi chain của từng peer: lấy chain dài nhất hợp lệ; chain mình bị sửa quá 6 giây thì lấy chain hợp lệ
// (chờ 6 giây để người xem demo kịp thấy màu đỏ)
async function sync() {
  for (const peer of config.peers) {
    try {
      const res = await fetch(peer + '/chain', { signal: AbortSignal.timeout(2000) });
      const other = await res.json();
      const healTime = invalidSince && Date.now() - invalidSince > 6000;
      if (other.chain.length > chain.length || (healTime && other.chain.length >= chain.length)) {
        if (bc.validateChain(other.chain, genesis).valid) {
          console.log(`Đồng bộ chain từ ${peer} (độ cao ${other.chain.length - 1})`);
          chain = other.chain;
          refresh();
          save();
        }
      }
      // nhận luôn giao dịch đang chờ của peer (phòng khi mình lỡ lúc mất mạng)
      for (const tx of other.mempool) { try { addTx(tx); } catch {} }
      cleanMempool();
    } catch { /* peer đang tắt: bỏ qua */ }
  }
}

// ---------- 5. Các hàm phục vụ API ----------

function findCert(by, value) {
  const cert = Object.values(state.certs).find((c) => c[by] === value);
  if (cert) return { ...cert, status: cert.revoked ? 'revoked' : 'valid' };
  const pending = mempool.find((t) => t.type === 'ISSUE' && t[by] === value);
  if (pending) return { certId: pending.certId, status: 'pending' };
  return { [by]: value, status: 'not_found' };
}

function pdfHash(pdfBase64) {
  const buf = Buffer.from(pdfBase64 || '', 'base64');
  if (buf.subarray(0, 5).toString() !== '%PDF-') throw httpError(400, 'File tải lên không phải PDF');
  return bc.sha256(buf);
}

function httpError(code, message) { return Object.assign(new Error(message), { code }); }

function needKey(key, what) {
  if (config.readonly) throw httpError(403, 'Đây là node chỉ đọc, không cấp/thu hồi được');
  if (!key) throw httpError(403, `Node này không giữ ${what}`);
  return key;
}

// Tạo giao dịch tại node này rồi gửi cho các node khác
function submit(tx) {
  try { addTx(tx); } catch (e) { throw httpError(403, e.message); }
  broadcast('/tx', tx);
  return { ok: true, message: 'Đã nhận, chờ tới lượt trường tạo block (khoảng 5 giây)' };
}

// Bảng định tuyến: [phương thức, đường dẫn (regex), hàm xử lý(body, tham số trong URL)]
const routes = [
  ['GET', /^\/info$/, () => ({ name, readonly: !!config.readonly, height: tip().index, ...status,
    isIssuer: !!state.issuers[myKey], hasAdminKey: !!config.adminKey })],
  ['GET', /^\/chain$/, () => ({ name, readonly: !!config.readonly, height: tip().index, ...status, chain, mempool })],
  ['POST', /^\/tx$/, (tx) => ({ ok: addTx(tx) })],
  ['POST', /^\/blocks$/, (block) => ({ ok: receiveBlock(block) })],
  ['POST', /^\/certificates$/, (b) => {
    if (!b.certId || !b.studentId) throw httpError(400, 'Cần mã văn bằng và mã sinh viên');
    const key = needKey(config.privateKey, 'khóa của trường');
    return submit(bc.signTx({ type: 'ISSUE', certId: b.certId.trim(), docHash: pdfHash(b.pdfBase64),
      studentRef: bc.sha256(b.studentId.trim() + config.salt), issuer: myKey, issuedAt: Date.now() }, key));
  }],
  ['POST', /^\/certificates\/([^/]+)\/revoke$/, (b, id) => {
    if (!b.reason) throw httpError(400, 'Cần nhập lý do thu hồi');
    const key = needKey(config.privateKey, 'khóa của trường');
    return submit(bc.signTx({ type: 'REVOKE', certId: id, reason: b.reason, issuer: myKey, revokedAt: Date.now() }, key));
  }],
  ['POST', /^\/verify$/, (b) => findCert('docHash', pdfHash(b.pdfBase64))],
  ['GET', /^\/certificates\/([^/]+)$/, (b, id) => findCert('certId', id)],
  ['GET', /^\/students\/([^/]+)\/certificates$/, (b, sv) => {
    const ref = bc.sha256(sv.trim() + config.salt);
    return Object.values(state.certs).filter((c) => c.studentRef === ref).map((c) => findCert('certId', c.certId));
  }],
  ['GET', /^\/issuers$/, () => ({ issuers: state.issuers, schools: genesis.transactions[0].validators })],
  ['POST', /^\/issuers$/, (b) => submit(bc.signTx({ type: 'ADD_ISSUER', publicKey: b.publicKey, name: b.name, timestamp: Date.now() },
    needKey(config.adminKey, 'khóa Admin — chỉ node 1 (máy của Bộ GD&ĐT) cấp/gỡ quyền được')))],
  ['DELETE', /^\/issuers\/([^/]+)$/, (b, key) => submit(bc.signTx({ type: 'REMOVE_ISSUER', publicKey: key, timestamp: Date.now() },
    needKey(config.adminKey, 'khóa Admin — chỉ node 1 (máy của Bộ GD&ĐT) cấp/gỡ quyền được')))],
  // Giả lập tấn công cho tools/check.js: sửa dữ liệu block cuối ngay trong file chain.json của node này
  // (khi demo thì sửa tay file chain.json — giao diện không có nút này)
  ['POST', /^\/debug\/tamper$/, () => {
    if (chain.length < 2) throw httpError(400, 'Chưa có block nào ngoài genesis để sửa');
    const tx = tip().transactions[0];
    tx.docHash = bc.sha256('bằng giả ' + Date.now());
    save();
    refresh();
    return { ok: true, ...status };
  }],
];

// Phục vụ các file giao diện trong thư mục web/ (khi chạy trên 1 máy, không có nginx)
const webDir = path.join(__dirname, '..', 'web');
const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.pdf': 'application/pdf' };
function serveWeb(url, res) {
  const file = path.join(webDir, path.normalize(url === '/' ? '/index.html' : url));
  if (!file.startsWith(webDir) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404);
    return res.end('Not found');
  }
  res.writeHead(200, { 'Content-Type': (types[path.extname(file)] || 'application/octet-stream') + '; charset=utf-8' });
  fs.createReadStream(file).pipe(res);
}

// ---------- 6. HTTP server ----------
const server = http.createServer(async (req, res) => {
  // Cho phép trang web ở địa chỉ khác gọi API (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.end();

  let code = 200, result;
  try {
    const url = new URL(req.url, 'http://x').pathname.replace(/^\/(api|n\d+|r\d+)(?=\/)/, '');
    const route = routes.find(([m, re]) => m === req.method && re.test(url));
    if (!route && req.method === 'GET') return serveWeb(url, res);
    if (!route) throw httpError(404, 'Không có đường dẫn ' + req.method + ' ' + url);
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 15e6) throw httpError(413, 'File quá lớn');
    }
    const params = url.match(route[1]).slice(1).map(decodeURIComponent);
    result = route[2](raw ? JSON.parse(raw) : {}, ...params);
  } catch (e) {
    code = e.code || 500;
    result = { error: e.message };
  }
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(result));
});

server.listen(config.port, () => {
  console.log(`${name} chạy ở cổng ${config.port} | ${config.readonly ? 'node chỉ đọc' : 'node trường'} | độ cao ${tip().index} | chain ${status.valid ? 'hợp lệ' : 'KHÔNG hợp lệ: ' + status.error}`);
});
setInterval(tick, 1000);
setInterval(sync, 3000);
