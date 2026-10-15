'use strict';
// LÕI BLOCKCHAIN: băm, chữ ký, Merkle root, giao dịch, block, chain.
const crypto = require('crypto');

// ---------- 1. Băm và chữ ký ----------

// SHA-256 → chuỗi 64 ký tự hex
function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// Biến object thành chuỗi JSON với khóa sắp xếp A→Z,
// để cùng dữ liệu luôn ra cùng một chuỗi (và cùng một hash)
function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  }
  return JSON.stringify(value);
}

// Sinh cặp khóa ECDSA trên đường cong secp256k1 (giống Bitcoin). Lưu dạng hex cho dễ chép.
function generateKeys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'secp256k1' });
  return {
    publicKey: publicKey.export({ type: 'spki', format: 'der' }).toString('hex'),
    privateKey: privateKey.export({ type: 'pkcs8', format: 'der' }).toString('hex'),
  };
}

function sign(text, privateKeyHex) {
  const key = crypto.createPrivateKey({ key: Buffer.from(privateKeyHex, 'hex'), format: 'der', type: 'pkcs8' });
  return crypto.sign('sha256', Buffer.from(text), key).toString('hex');
}

function verify(text, signatureHex, publicKeyHex) {
  try {
    const key = crypto.createPublicKey({ key: Buffer.from(publicKeyHex, 'hex'), format: 'der', type: 'spki' });
    return crypto.verify('sha256', Buffer.from(text), key, Buffer.from(signatureHex, 'hex'));
  } catch {
    return false; // khóa hoặc chữ ký sai định dạng
  }
}

function publicKeyOf(privateKeyHex) {
  const key = crypto.createPrivateKey({ key: Buffer.from(privateKeyHex, 'hex'), format: 'der', type: 'pkcs8' });
  return crypto.createPublicKey(key).export({ type: 'spki', format: 'der' }).toString('hex');
}


// ---------- 2. Merkle root ----------

// Băm từng giao dịch, rồi ghép từng cặp băm tiếp cho tới khi còn 1 hash (lẻ thì nhân đôi phần tử cuối)
function merkleRoot(transactions) {
  if (transactions.length === 0) return sha256('');
  let level = transactions.map((tx) => sha256(canonical(tx)));
  while (level.length > 1) {
    const next = [];
    for (let i = 0; i < level.length; i += 2) next.push(sha256(level[i] + (level[i + 1] || level[i])));
    level = next;
  }
  return level[0];
}


// ---------- 3. Giao dịch ----------

// Chữ ký được tính trên mọi trường của giao dịch, trừ chính trường signature
function txText(tx) {
  const { signature, ...body } = tx;
  return canonical(body);
}

function signTx(body, privateKey) {
  return { ...body, signature: sign(canonical(body), privateKey) };
}

// Áp một giao dịch vào trạng thái (state). Sai luật → ném lỗi, lời nhắn hiện thẳng lên giao diện.
// state = { admin, validators: [khóa], issuers: {khóa: tên}, certs: {mã: văn bằng} }
function applyTx(state, tx, blockIndex) {
  if (tx.type === 'GENESIS') {
    state.admin = tx.admin;
    state.validators = tx.validators.map((v) => v.publicKey);
    return;
  }
  if (tx.type === 'ADD_ISSUER' || tx.type === 'REMOVE_ISSUER') {
    if (!verify(txText(tx), tx.signature, state.admin)) throw new Error(tx.type + ' phải được ký bằng khóa Admin');
    if (tx.type === 'ADD_ISSUER') state.issuers[tx.publicKey] = tx.name;
    else delete state.issuers[tx.publicKey];
    return;
  }
  if (!verify(txText(tx), tx.signature, tx.issuer)) throw new Error('Chữ ký giao dịch ' + tx.type + ' không hợp lệ');
  if (tx.type === 'ISSUE') {
    if (!state.issuers[tx.issuer]) throw new Error('Khóa không nằm trong danh sách được cấp quyền phát hành');
    if (state.certs[tx.certId]) throw new Error('Mã văn bằng ' + tx.certId + ' đã tồn tại');
    state.certs[tx.certId] = {
      certId: tx.certId, docHash: tx.docHash, studentRef: tx.studentRef, issuer: tx.issuer,
      issuerName: state.issuers[tx.issuer], issuedAt: tx.issuedAt, blockIndex, revoked: null,
    };
    return;
  }
  if (tx.type === 'REVOKE') {
    const cert = state.certs[tx.certId];
    if (!cert) throw new Error('Không tìm thấy văn bằng ' + tx.certId);
    if (cert.issuer !== tx.issuer) throw new Error('Chỉ trường đã cấp văn bằng mới được thu hồi');
    if (cert.revoked) throw new Error('Văn bằng ' + tx.certId + ' đã bị thu hồi trước đó');
    cert.revoked = { reason: tx.reason, revokedAt: tx.revokedAt, blockIndex };
    return;
  }
  throw new Error('Loại giao dịch không hợp lệ: ' + tx.type);
}


// ---------- 4. Block và chain ----------

function blockHash(b) {
  return sha256([b.index, b.timestamp, b.prevHash, b.merkleRoot, b.validator].join('|'));
}

function createGenesis(admin, validators) {
  const transactions = [{ type: 'GENESIS', admin, validators }];
  const block = { index: 0, timestamp: Date.now(), prevHash: '0', merkleRoot: merkleRoot(transactions), transactions, validator: '0' };
  block.hash = blockHash(block);
  return block;
}

function createBlock(prev, transactions, privateKey) {
  const block = {
    index: prev.index + 1, timestamp: Date.now(), prevHash: prev.hash,
    merkleRoot: merkleRoot(transactions), transactions, validator: publicKeyOf(privateKey),
  };
  block.hash = blockHash(block);
  block.signature = sign(block.hash, privateKey); // validator ký lên hash của block
  return block;
}

// PoA luân phiên: block ở độ cao h do trường thứ (h mod số trường) tạo
function turnOf(state, index) {
  return state.validators[index % state.validators.length];
}

// Kiểm tra 1 block nối sau block prev; đúng thì áp các giao dịch vào state, sai thì ném lỗi
function applyBlock(state, block, prev) {
  const at = 'Block #' + block.index + ': ';
  if (block.prevHash !== prev.hash) throw new Error(at + 'prevHash không khớp hash block trước');
  if (block.index !== prev.index + 1) throw new Error(at + 'số thứ tự không liên tiếp');
  if (blockHash(block) !== block.hash) throw new Error(at + 'hash tính lại không khớp (dữ liệu đã bị sửa)');
  if (merkleRoot(block.transactions) !== block.merkleRoot) throw new Error(at + 'Merkle root không khớp (giao dịch đã bị sửa)');
  if (block.validator !== turnOf(state, block.index)) throw new Error(at + 'không đúng lượt tạo block (PoA)');
  if (!verify(block.hash, block.signature, block.validator)) throw new Error(at + 'chữ ký của trường tạo block không hợp lệ');
  for (const tx of block.transactions) {
    try { applyTx(state, tx, block.index); } catch (e) { throw new Error(at + e.message); }
  }
}

// Quét cả chain từ genesis: trả về { valid, error, state }. state = chỉ mục dựng lại từ lịch sử.
function validateChain(chain, genesis) {
  const state = { admin: null, validators: [], issuers: {}, certs: {} };
  try {
    if (!chain.length || chain[0].hash !== genesis.hash || blockHash(chain[0]) !== genesis.hash
      || merkleRoot(chain[0].transactions) !== genesis.merkleRoot) {
      throw new Error('Block #0: genesis không khớp genesis của mạng');
    }
    applyTx(state, chain[0].transactions[0], 0);
    for (let i = 1; i < chain.length; i++) applyBlock(state, chain[i], chain[i - 1]);
    return { valid: true, error: null, state };
  } catch (e) {
    return { valid: false, error: e.message, state };
  }
}

module.exports = {
  sha256, canonical, generateKeys, sign, verify, publicKeyOf, merkleRoot,
  txText, signTx, applyTx, blockHash, createGenesis, createBlock, turnOf, applyBlock, validateChain,
};
