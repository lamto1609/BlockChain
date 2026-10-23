// KIỂM THỬ LÕI BLOCKCHAIN. Chạy: node --test server/
const test = require('node:test');
const assert = require('node:assert');
const bc = require('./chain');
 
// Dựng một mạng nhỏ: Admin + 3 trường, và hàm thêm block đúng lượt PoA
function network() {
  const admin = bc.generateKeys();
  const keys = [bc.generateKeys(), bc.generateKeys(), bc.generateKeys()];
  const genesis = bc.createGenesis(admin.publicKey, keys.map((k, i) => ({ name: 'Trường ' + i, publicKey: k.publicKey })));
  const chain = [genesis];
  const add = (txs, key = keys[chain.length % 3]) => chain.push(bc.createBlock(chain[chain.length - 1], txs, key.privateKey));
  const issue = (certId, key = keys[0]) => bc.signTx({ type: 'ISSUE', certId, docHash: bc.sha256(certId), studentRef: 'sv', issuer: key.publicKey, issuedAt: 1 }, key.privateKey);
  const grant = (key) => bc.signTx({ type: 'ADD_ISSUER', publicKey: key.publicKey, name: 'A', timestamp: 1 }, admin.privateKey);
  const check = () => bc.validateChain(chain, genesis);
  return { admin, keys, genesis, chain, add, issue, grant, check };
}
 
// Mạng đã có: block 1 cấp quyền cho trường 0, block 2 cấp văn bằng VB-1
function issued() {
  const n = network();
  n.add([n.grant(n.keys[0])]);
  n.add([n.issue('VB-1')]);
  return n;
}
 
test('SHA-256: cùng đầu vào cùng kết quả, đổi 1 ký tự thì khác hẳn', () => {
  assert.strictEqual(bc.sha256('abc'), bc.sha256('abc'));
  assert.notStrictEqual(bc.sha256('abc'), bc.sha256('abd'));
  assert.strictEqual(bc.sha256('abc').length, 64);
});
 
test('canonical: thứ tự khóa không làm đổi chuỗi', () => {
  assert.strictEqual(bc.canonical({ a: 1, b: { c: 2, d: 3 } }), bc.canonical({ b: { d: 3, c: 2 }, a: 1 }));
});
 
test('Merkle root: đổi 1 giao dịch thì root đổi', () => {
  assert.notStrictEqual(bc.merkleRoot([{ n: 1 }, { n: 2 }, { n: 3 }]), bc.merkleRoot([{ n: 1 }, { n: 9 }, { n: 3 }]));
});
 
test('Merkle root: cùng danh sách giao dịch luôn ra cùng root', () => {
  assert.strictEqual(bc.merkleRoot([{ a: 1, b: 2 }, { n: 2 }]), bc.merkleRoot([{ b: 2, a: 1 }, { n: 2 }]));
});
 
test('PoA: lượt tạo block xoay vòng 3 trường theo độ cao', () => {
  const n = network();
  const s = n.check().state;
  assert.deepStrictEqual([1, 2, 3, 4].map((h) => bc.turnOf(s, h)), [1, 2, 0, 1].map((i) => n.keys[i].publicKey));
});
 
test('Chữ ký: đúng khóa thì hợp lệ, sai khóa hoặc sửa dữ liệu thì không', () => {
  const k = bc.generateKeys();
  const other = bc.generateKeys();
  const sig = bc.sign('dữ liệu', k.privateKey);
  assert.ok(bc.verify('dữ liệu', sig, k.publicKey));
  assert.ok(!bc.verify('dữ liệu', sig, other.publicKey));
  assert.ok(!bc.verify('dữ liệu!', sig, k.publicKey));
});
 
test('Chain hợp lệ dựng lại được trạng thái văn bằng', () => {
  const r = issued().check();
  assert.ok(r.valid, r.error);
  assert.strictEqual(r.state.certs['VB-1'].blockIndex, 2);
});
 
for (const [field, change] of [
  ['docHash trong giao dịch', (b) => { b.transactions[0].docHash = 'gia'; }],
  ['timestamp', (b) => { b.timestamp++; }],
  ['prevHash', (b) => { b.prevHash = 'x'; }],
  ['hash', (b) => { b.hash = bc.sha256('x'); }],
]) {
  test('Sửa ' + field + ' thì chain không còn hợp lệ', () => {
    const n = issued();
    change(n.chain[2]);
    assert.ok(!n.check().valid);
  });
}
 
test('Sửa dữ liệu rồi tính lại hash vẫn bị phát hiện (chữ ký của trường tạo block không khớp)', () => {
  const n = issued();
  const b = n.chain[2];
  b.transactions[0].docHash = 'gia';
  b.merkleRoot = bc.merkleRoot(b.transactions);
  b.hash = bc.blockHash(b);
  assert.match(n.check().error, /chữ ký/);
});
 
test('PoA: trường tạo block sai lượt bị từ chối', () => {
  const n = network();
  n.add([], n.keys[2]); // block #1 lẽ ra là của trường 1
  assert.match(n.check().error, /lượt/);
});
 
test('Khóa chưa được Admin cấp quyền thì không cấp được văn bằng', () => {
  const n = network();
  n.add([n.issue('GHOST-1', bc.generateKeys())]);
  assert.match(n.check().error, /cấp quyền/);
});
 
test('ADD_ISSUER không ký bằng khóa Admin bị từ chối', () => {
  const n = network();
  const fake = bc.signTx({ type: 'ADD_ISSUER', publicKey: n.keys[0].publicKey, name: 'A', timestamp: 1 }, n.keys[0].privateKey);
  n.add([fake]);
  assert.match(n.check().error, /Admin/);
});
 
test('Trường bị gỡ quyền (REMOVE_ISSUER) không cấp được nữa', () => {
  const n = issued();
  n.add([bc.signTx({ type: 'REMOVE_ISSUER', publicKey: n.keys[0].publicKey, timestamp: 2 }, n.admin.privateKey)]);
  n.add([n.issue('VB-2')]);
  assert.match(n.check().error, /cấp quyền/);
});
 
test('Mã văn bằng trùng bị từ chối', () => {
  const n = issued();
  n.add([n.issue('VB-1')]);
  assert.match(n.check().error, /đã tồn tại/);
});
 
test('Chỉ trường đã cấp mới thu hồi được', () => {
  const n = issued();
  const B = n.keys[1];
  n.add([n.grant(B)]);
  n.add([bc.signTx({ type: 'REVOKE', certId: 'VB-1', reason: 'x', issuer: B.publicKey, revokedAt: 2 }, B.privateKey)]);
  assert.match(n.check().error, /Chỉ trường đã cấp/);
});
 
test('Sau REVOKE trạng thái là đã thu hồi, có lý do', () => {
  const n = issued();
  n.add([bc.signTx({ type: 'REVOKE', certId: 'VB-1', reason: 'Gian lận', issuer: n.keys[0].publicKey, revokedAt: 2 }, n.keys[0].privateKey)]);
  assert.strictEqual(n.check().state.certs['VB-1'].revoked.reason, 'Gian lận');
});
 
test('Genesis khác genesis của mạng bị từ chối', () => {
  const n = issued();
  assert.ok(!bc.validateChain(n.chain, network().genesis).valid);
});
