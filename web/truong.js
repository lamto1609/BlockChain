// TRANG TRƯỜNG: cấp văn bằng, yêu cầu thu hồi (kèm bằng chứng), duyệt yêu cầu thu hồi của trường khác.
// Yêu cầu ghi gửi thẳng tới node của trường đang chọn (khóa trường nằm ở đó).

// Trang khóa vào ĐÚNG MỘT trường theo địa chỉ: truong.html?truong=1 (Đại học A), 2, 3.
// Mọi thao tác chỉ gửi tới node của trường đó; chưa chọn thì chỉ hiện danh sách trường để chọn.
const idx = Number(new URLSearchParams(location.search).get('truong')) - 1;
const node = () => NET.schools[idx];
const me = () => idx;

if (NET.schools[idx]) {
  $('page').hidden = false;
  $('title').textContent = SCHOOL_NAMES[idx];
  document.title = SCHOOL_NAMES[idx] + ' — Xác thực văn bằng';
  refresh();
  setInterval(refresh, 3000);
} else {
  $('choose').hidden = false;
  $('schoolLinks').innerHTML = SCHOOL_NAMES.map((name, i) =>
    `<a class="role truong" href="truong.html?truong=${i + 1}"><b>${name}</b><span>Đăng nhập — làm việc trên node ${i + 1} của trường</span></a>`).join('');
}

// Thanh tiêu đề chỉ hiện node của trường này: độ cao, hợp lệ, quyền phát hành
async function refresh() {
  try {
    const info = await api(node(), '/info');
    $('nodeInfo').innerHTML = `Node ${idx + 1} · độ cao ${info.height} · ${info.valid ? '● hợp lệ' : '● KHÔNG hợp lệ'} · `
      + (info.isIssuer ? '<span class="ok">có quyền phát hành</span>' : '<span class="bad">chưa được Bộ cấp quyền</span>')
      + ' · <a href="truong.html">Đổi trường</a>';
    loadRequests();
  } catch {
    $('nodeInfo').innerHTML = `<span class="bad">Node ${idx + 1} (máy của trường) đang tắt</span> · <a href="truong.html">Đổi trường</a>`;
  }
}
if (NET.schools[idx]) loadIssued();

// Văn bằng do trường này cấp: lấy giao dịch ISSUE của trường trong chain, hỏi trạng thái từng văn bằng
async function loadIssued() {
  const [{ chain }, { schools }] = await Promise.all([api(node(), '/chain'), api(node(), '/issuers')]);
  const key = schools[me()].publicKey;
  const issued = chain.flatMap((b) => b.transactions).filter((t) => t.type === 'ISSUE' && t.issuer === key).reverse();
  const certs = await Promise.all(issued.map((t) => api(node(), '/certificates/' + encodeURIComponent(t.certId))));
  const label = (c) => (c.status === 'revoked' ? '⚠️ Đã thu hồi' : c.revokeRequest ? '⏳ Chờ duyệt thu hồi' : '✅ Hợp lệ');
  $('issued').innerHTML = certs.length
    ? '<table><tr><th>Mã văn bằng</th><th>Ngày cấp</th><th>Block</th><th>Trạng thái</th></tr>' + certs.map((c) =>
      `<tr><td>${esc(c.certId)}</td><td>${time(c.issuedAt)}</td><td>#${c.blockIndex}</td><td>${label(c)}</td></tr>`).join('') + '</table>'
    : '<p class="hint">Chưa cấp văn bằng nào.</p>';
}

// Yêu cầu thu hồi đang chờ: trường khác thấy nút "Chấp nhận"; bằng chứng mở từ máy của trường gửi yêu cầu
async function loadRequests() {
  try {
    const list = await api(node(), '/revoke-requests');
    $('requests').innerHTML = list.length
      ? '<table><tr><th>Mã văn bằng</th><th>Trường yêu cầu</th><th>Lý do</th><th>Bằng chứng</th><th>Đã chấp nhận</th><th></th></tr>' + list.map((r) => {
        const action = r.requester === me() ? '<span class="hint">Chờ các trường khác duyệt</span>'
          : r.approvals.includes(me()) ? '✔ Đã chấp nhận'
          : `<button data-approve="${esc(r.certId)}">Chấp nhận</button>`;
        return `<tr><td>${esc(r.certId)}</td><td>${SCHOOL_NAMES[r.requester]}</td><td>${esc(r.reason)}</td>
          <td><a href="${NET.schools[r.requester]}/evidence/${r.evidenceHash}" target="_blank">${esc(r.evidenceName)}</a></td>
          <td>${1 + r.approvals.length}/${r.needed} trường</td><td>${action}</td></tr>`;
      }).join('') + '</table>'
      : '<p class="hint">Không có yêu cầu nào.</p>';
  } catch { /* máy trường đang tắt: giữ nguyên bảng cũ */ }
}

// Bấm "Chấp nhận": ký giao dịch REVOKE_APPROVE bằng khóa của trường đang đăng nhập
$('requests').onclick = async (e) => {
  const certId = e.target.dataset.approve;
  if (!certId) return;
  try {
    const r = await api(node(), `/certificates/${encodeURIComponent(certId)}/approve-revoke`, {});
    show('msg', true, '✔ ' + r.message);
    setTimeout(() => { loadRequests(); loadIssued(); }, 7000);
  } catch (err) {
    show('msg', false, '✖ ' + err.message);
  }
};

$('issueForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  try {
    const r = await api(node(), '/certificates', { certId: f.certId.value, studentId: f.studentId.value, pdfBase64: await readFile(f.pdf.files[0]) });
    show('msg', true, '✔ ' + r.message);
    setTimeout(loadIssued, 7000); // văn bằng chỉ hiện sau khi block được tạo
  } catch (err) {
    show('msg', false, '✖ Bị từ chối: ' + err.message);
  }
};

$('revokeForm').onsubmit = async (e) => {
  e.preventDefault();
  const f = e.target;
  const file = f.evidence.files[0];
  try {
    const r = await api(node(), `/certificates/${encodeURIComponent(f.certId.value)}/revoke`,
      { reason: f.reason.value, evidenceBase64: await readFile(file), evidenceName: file.name });
    show('msg', true, '✔ ' + r.message);
    setTimeout(() => { loadRequests(); loadIssued(); }, 7000);
  } catch (err) {
    show('msg', false, '✖ Bị từ chối: ' + err.message);
  }
};
