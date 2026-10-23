// Thử phần block và chain: node thu-chain.js
const bc = require('./server/chain');
 
const admin = bc.generateKeys();
const truong = [bc.generateKeys(), bc.generateKeys(), bc.generateKeys()];
const genesis = bc.createGenesis(admin.publicKey, truong.map((k, i) => ({ name: 'Trường ' + i, publicKey: k.publicKey })));
const chain = [genesis];
 
// Block #1 thuộc lượt trường 1 (1 mod 3 = 1): Admin cấp quyền cho trường 0
const grant = bc.signTx({ type: 'ADD_ISSUER', publicKey: truong[0].publicKey, name: 'Đại học A', timestamp: 1 }, admin.privateKey);
chain.push(bc.createBlock(genesis, [grant], truong[1].privateKey));
console.log('Chain hợp lệ?', bc.validateChain(chain, genesis).valid);
 
// Sửa dữ liệu block #1 → phải bị phát hiện
chain[1].transactions[0].name = 'Trường ma';
const r = bc.validateChain(chain, genesis);
console.log('Sau khi sửa:', r.valid, '-', r.error);
