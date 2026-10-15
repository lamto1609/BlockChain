// TỰ CHẠY 6 KỊCH BẢN DEMO QUA API và báo ĐẠT/LỖI.
//   Trên 1 máy:   node tools/check.js
//   Máy ảo:       node tools/check.js http://192.168.56.10      (địa chỉ VM gateway)
const fs = require('fs');
const assert = require('assert');
const { diploma } = require('./make-pdf');

const base = process.argv[2] || '';
const NET = JSON.parse(fs.readFileSync('web/config.js', 'utf8').split('=')[1].trim().replace(/;$/, ''));
const [A, B, C] = NET.schools;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(node, path, body, method) {
  const res = await fetch(base + node + path, {
    method: method || (body ? 'POST' : 'GET'), headers: { 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  return { http: res.status, ...(await res.json()) };
}

// Thử lại tới khi điều kiện đúng (tối đa 25 giây) — vì block chỉ được tạo khoảng 5 giây một lần
async function waitFor(fn) {
  for (let t = 0; t < 50; t++) { const v = await fn(); if (v) return v; await sleep(500); }
  throw new Error('Hết thời gian chờ');
}

let passed = 0, total = 0;
async function scenario(name, fn) {
  total++;
  try { console.log(`ĐẠT  ${name}\n     ${await fn()}`); passed++; } catch (e) { console.log(`LỖI  ${name}\n     ${e.message}`); }
}

(async () => {
  const certId = 'VB-T' + (Date.now() % 100000); // mã mới mỗi lần chạy nên chạy lại được
  const pdf = Buffer.from(diploma(certId, 'Dai hoc A', 'Nguyen Van An', 'SV001', '7.5')).toString('base64');
  const fake = Buffer.from(diploma(certId, 'Dai hoc A', 'Nguyen Van An', 'SV001', '9.5')).toString('base64');

  await scenario('0. Admin (node 1) cấp quyền cho Đại học A; node 2 thì không cấp được', async () => {
    const { schools, issuers } = await api(A, '/issuers');
    const refused = await api(B, '/issuers', { publicKey: schools[1].publicKey, name: schools[1].name });
    assert.strictEqual(refused.http, 403);
    if (!issuers[schools[0].publicKey]) await api(A, '/issuers', { publicKey: schools[0].publicKey, name: schools[0].name });
    await waitFor(async () => (await api(NET.api, '/issuers')).issuers[schools[0].publicKey]);
    return 'node 2 bị từ chối: ' + refused.error;
  });

  await scenario('1. Cấp văn bằng và đồng bộ ra mọi node', async () => {
    const r = await api(A, '/certificates', { certId, studentId: 'SV001', pdfBase64: pdf });
    assert.ok(r.ok, r.error);
    const nodes = [...NET.schools, ...NET.readers];
    await waitFor(async () => {
      const all = await Promise.all(nodes.map((n) => api(n, '/certificates/' + certId).catch(() => ({}))));
      return all.filter((c) => c.status === 'valid').length >= 3;
    });
    const heights = await Promise.all(nodes.map((n) => api(n, '/info').then((i) => i.height, () => 'tắt')));
    return 'độ cao các node: ' + heights.join(' / ');
  });

  await scenario('2. Xác minh PDF thật', async () => {
    const r = await api(NET.api, '/verify', { pdfBase64: pdf });
    assert.strictEqual(r.status, 'valid');
    return `hợp lệ — ${r.issuerName}, block #${r.blockIndex}`;
  });

  await scenario('3. PDF bị sửa 1 ký tự', async () => {
    assert.strictEqual((await api(NET.api, '/verify', { pdfBase64: fake })).status, 'not_found');
    return 'không tìm thấy (hash khác)';
  });

  await scenario('4. Trường chưa được cấp quyền (node 3) tự cấp bằng', async () => {
    const r = await api(C, '/certificates', { certId: certId + '-GHOST', studentId: 'SV999', pdfBase64: fake });
    assert.strictEqual(r.http, 403);
    return 'bị từ chối: ' + r.error;
  });

  await scenario('5. Sửa dữ liệu block trên node 2 → node 2 tự khôi phục', async () => {
    const t = await api(B, '/debug/tamper', {});
    assert.strictEqual(t.valid, false);
    const start = Date.now();
    await waitFor(async () => (await api(B, '/info')).valid);
    return `đỏ ("${t.error}") → xanh lại sau ${((Date.now() - start) / 1000).toFixed(1)} giây`;
  });

  await scenario('6. Thu hồi văn bằng', async () => {
    await api(A, `/certificates/${certId}/revoke`, { reason: 'Gian lận thi cử' });
    const r = await waitFor(async () => { const x = await api(NET.api, '/verify', { pdfBase64: pdf }); return x.status === 'revoked' && x; });
    return `đã thu hồi — lý do "${r.revoked.reason}"`;
  });

  console.log(`\nKết quả: ${passed}/${total} đạt`);
  process.exit(passed === total ? 0 : 1);
})();
