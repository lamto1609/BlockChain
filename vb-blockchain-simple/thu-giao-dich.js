// Thử phần giao dịch: node thu-giao-dich.js
const bc = require('./server/chain');
 
const admin = bc.generateKeys();
const truongA = bc.generateKeys();
const state = { admin: admin.publicKey, validators: [], issuers: {}, certs: {} };
 
// 1. Admin cấp quyền cho trường A
bc.applyTx(state, bc.signTx({ type: 'ADD_ISSUER', publicKey: truongA.publicKey, name: 'Đại học A', timestamp: 1 }, admin.privateKey), 1);
console.log('Trường có quyền:', Object.values(state.issuers));
 
// 2. Trường A cấp văn bằng
const issue = { type: 'ISSUE', certId: 'VB2026-001', docHash: bc.sha256('pdf'), studentRef: 'x', issuer: truongA.publicKey, issuedAt: 1 };
bc.applyTx(state, bc.signTx(issue, truongA.privateKey), 2);
console.log('Văn bằng:', Object.keys(state.certs));
 
// 3. Cấp trùng mã → phải bị từ chối
try {
  bc.applyTx(state, bc.signTx(issue, truongA.privateKey), 3);
} catch (e) {
  console.log('Bị từ chối:', e.message);
}
 
// 4. Trường không có quyền tự cấp → phải bị từ chối
const ma = bc.generateKeys();
try {
  bc.applyTx(state, bc.signTx({ ...issue, certId: 'GHOST-001', issuer: ma.publicKey }, ma.privateKey), 3);
} catch (e) {
  console.log('Bị từ chối:', e.message);
}
