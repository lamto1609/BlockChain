// ---------- 1. Hàm tiện ích ----------
// Gọi API của một node. Lỗi HTTP → ném Error mang lời nhắn của node.
async function api(base, path, body, method) {
const res = await fetch(base + path, {
method: method || (body ? 'POST' : 'GET'),
headers: { 'Content-Type': 'application/json' },
body: body ? JSON.stringify(body) : undefined,
});
const data = await res.json();
if (!res.ok) throw new Error(data.error);
return data;
}
// Đọc file người dùng chọn thành chuỗi base64 để gửi trong JSON
function readFile(file) {
return new Promise((resolve) => {
const reader = new FileReader();
reader.onload = () => resolve(reader.result.split(',')[1]);
reader.readAsDataURL(file);
});
}
// Chống chèn mã HTML: mọi chữ lấy từ người dùng/chain đều đi qua hàm này trước khi đưa vào trang
function esc(text) {
return String(text ?? '').replace(/[&<>"']/g, (c) => '&#' + c.charCodeAt(0) + ';');
}
const $ = (id) => document.getElementById(id);
const time = (t) => new Date(t).toLocaleString('vi-VN');
const short = (h) => (h ? h.slice(-12) : '');
const show = (id, ok, text) => { $(id).className = ok ? 'ok' : 'bad'; $(id).textContent = text; };
// Thẻ kết quả văn bằng: ✅ hợp lệ / ⚠️ đã thu hồi / ⏳ đang chờ / ❌ không tìm thấy
function certHtml(c) {
if (c.status === 'valid') {
return `<div class="ok"><b>✅ Hợp lệ</b><br>Mã: ${esc(c.certId)}<br>Trường cấp: ${esc(c.issuerName)}
<br>Ngày cấp: ${time(c.issuedAt)}<br>Nằm ở block #${c.blockIndex}</div>`;
}
if (c.status === 'revoked') {
return `<div class="warn"><b>⚠️ Đã thu hồi</b><br>Mã: ${esc(c.certId)}<br>Trường cấp: ${esc(c.issuerName)}
<br>Lý do: ${esc(c.revoked.reason)}<br>Ngày thu hồi: ${time(c.revoked.revokedAt)}</div>`;
}
if (c.status === 'pending') return `<div class="warn"><b>⏳ Đang chờ</b><br>${esc(c.certId)} chưa vào block, thử lại sau vài giây.</div>`;
return '<div class="bad"><b>❌ Không tìm thấy</b><br>File bị sửa hoặc không do trường nào cấp.</div>';
}
// ---------- 2. Chuyển tab ----------
document.querySelectorAll('nav button').forEach((btn) => {
btn.onclick = () => {
document.querySelectorAll('nav button').forEach((b) => b.classList.toggle('active', b === btn));
document.querySelectorAll('main section').forEach((s) => { s.hidden = s.id !== btn.dataset.tab; });
if (btn.dataset.tab === 'admin') loadAdmin();
if (btn.dataset.tab === 'explorer') loadExplorer();
};
});
// Hai ô chọn node: tab Trường (mình là trường nào) và tab Admin (gửi từ node nào)
for (const select of [$('schoolNode'), $('adminNode')]) {
NET.schools.forEach((url, i) => select.add(new Option(`Node ${i + 1} · Đại học ${'ABC'[i]}`, url)));
}
// ---------- 3. Tab Trường ----------
async function loadSchoolInfo() {
try {
const info = await api($('schoolNode').value, '/info');
$('schoolInfo').innerHTML = info.isIssuer
? '<span class="ok">có quyền phát hành</span>'
: '<span class="bad">chưa được Admin cấp quyền</span>';
} catch {
$('schoolInfo').innerHTML = '<span class="bad">node đang tắt</span>';
}
}
$('schoolNode').onchange = loadSchoolInfo;
loadSchoolInfo();
$('issueForm').onsubmit = async (e) => {
e.preventDefault();
const f = e.target;
try {
const r = await api($('schoolNode').value, '/certificates', {
certId: f.certId.value, studentId: f.studentId.value, pdfBase64: await readFile(f.pdf.files[0]),
});
show('schoolMsg', true, '✔ ' + r.message);
} catch (err) {
show('schoolMsg', false, '✖ Bị từ chối: ' + err.message);
}
};
$('revokeForm').onsubmit = async (e) => {
e.preventDefault();
const f = e.target;
try {
const r = await api($('schoolNode').value, `/certificates/${encodeURIComponent(f.certId.value)}/revoke`, { reason: f.reason.value });
show('schoolMsg', true, '✔ ' + r.message);
} catch (err) {
show('schoolMsg', false, '✖ Bị từ chối: ' + err.message);
}
};
// ---------- 4. Tab Người học ----------
$('studentForm').onsubmit = async (e) => {
e.preventDefault();
try {
const certs = await api(NET.api, `/students/${encodeURIComponent(e.target.studentId.value)}/certificates`);
$('studentList').innerHTML = certs.length
? '<table><tr><th>Mã văn bằng</th><th>Trường</th><th>Ngày cấp</th><th>Trạng thái</th><th></th></tr>' + certs.map((c) =>
`<tr><td>${esc(c.certId)}</td><td>${esc(c.issuerName)}</td><td>${time(c.issuedAt)}</td>
<td>${c.status === 'valid' ? 'Hợp lệ' : 'Đã thu hồi'}</td>
<td><button data-cert="${esc(c.certId)}">Tạo link / QR</button></td></tr>`).join('') + '</table>'
: '<p>Chưa có văn bằng nào.</p>';
} catch (err) {
$('studentList').innerHTML = `<p class="bad">${esc(err.message)}</p>`;
}
};
// Bấm nút "Tạo link / QR" ở dòng nào thì chia sẻ văn bằng của dòng đó
$('studentList').onclick = (e) => { if (e.target.dataset.cert) share(e.target.dataset.cert); };
// Link chia sẻ = địa chỉ trang này + ?cert=mã. QR chứa đúng link đó.
function share(certId) {
const link = location.origin + location.pathname + '?cert=' + encodeURIComponent(certId);
const qr = qrcode(0, 'M');
qr.addData(link);
qr.make();
$('share').hidden = false;
$('share').innerHTML = `<h2>Chia sẻ ${esc(certId)}</h2>${qr.createImgTag(5)}
<input value="${esc(link)}" readonly onclick="this.select()">
<p class="hint">Gửi link hoặc QR này cho nhà tuyển dụng, kèm file PDF gốc.</p>`;
}
// ---------- 5. Tab Xác minh ----------
$('verifyFile').onchange = async (e) => {
try {
$('verifyPdfResult').innerHTML = certHtml(await api(NET.api, '/verify', { pdfBase64: await readFile(e.target.files[0]) }));
} catch (err) {
$('verifyPdfResult').innerHTML = `<p class="bad">${esc(err.message)}</p>`;
}
};
async function lookup(certId) {
try {
$('lookupResult').innerHTML = certHtml(await api(NET.api, '/certificates/' + encodeURIComponent(certId)));
} catch (err) {
$('lookupResult').innerHTML = `<p class="bad">${esc(err.message)}</p>`;
}
}
$('lookupForm').onsubmit = (e) => { e.preventDefault(); lookup(e.target.certId.value); };
// Mở trang từ link/QR chia sẻ (?cert=...) → vào thẳng tab Xác minh và tra mã đó
const sharedCert = new URLSearchParams(location.search).get('cert');
if (sharedCert) {
document.querySelector('[data-tab="verify"]').click();
$('lookupForm').certId.value = sharedCert;
lookup(sharedCert);
}
// ---------- 6. Tab Admin ----------
async function loadAdmin() {
const { issuers, schools } = await api(NET.api, '/issuers');
$('adminTable').innerHTML = schools.map((s) => {
const has = issuers[s.publicKey];
return `<tr><td>${esc(s.name)}</td><td>${has ? '✅ Có' : '— Chưa'}</td>
<td><button class="${has ? 'danger' : ''}" data-key="${esc(s.publicKey)}" data-name="${esc(s.name)}" data-grant="${has ? '' : '1'}">
${has ? 'Gỡ quyền' : 'Cấp quyền'}</button></td></tr>`;
}).join('');
}
$('adminTable').onclick = async (e) => {
const { key, name, grant } = e.target.dataset;
if (!key) return;
try {
const node = $('adminNode').value;
const r = grant ? await api(node, '/issuers', { publicKey: key, name }) : await api(node, '/issuers/' + key, null, 'DELETE');
show('adminMsg', true, '✔ ' + r.message);
setTimeout(loadAdmin, 6000); // quyền chỉ đổi sau khi block được tạo
} catch (err) {
show('adminMsg', false, '✖ ' + err.message);
}
};
// ---------- 7. Block Explorer: hỏi chain của từng node mỗi 2 giây ----------
const allNodes = [...NET.schools.map((u, i) => [u, 'Node ' + (i + 1)]), ...NET.readers.map((u, i) => [u, 'Chỉ đọc ' + (i + 1)])];
$('nodes').innerHTML = allNodes.map((n, i) => `<div class="node offline" id="node${i}"><h3>${n[1]}</h3>Đang tải…</div>`).join('');
async function loadExplorer() {
if ($('explorer').hidden) return;
allNodes.forEach(async ([url, label], i) => {
const box = $('node' + i);
try {
const d = await api(url, '/chain');
box.className = 'node' + (d.valid ? '' : ' invalid');
box.innerHTML = `<h3>${label}${d.name === label ? '' : ' · ' + esc(d.name)}</h3>
<b>${d.valid ? '● Chain hợp lệ' : '● Chain KHÔNG hợp lệ'}</b> ${d.valid ? '' : '<br>' + esc(d.error)}
<br>Độ cao ${d.height} · chờ ${d.mempool.length} giao dịch` +
d.chain.slice(-6).reverse().map((b) => `<div class="block"><b>#${b.index}</b> <span class="mono">…${short(b.hash)}</span><br>
${b.transactions.map((t) => esc(t.type + ' ' + (t.certId || t.name || ''))).join('<br>')}</div>`).join('');
} catch {
box.className = 'node offline';
box.innerHTML = `<h3>${label}</h3>Không kết nối được (máy đang tắt?)`;
}
});
}
setInterval(loadExplorer, 2000);
