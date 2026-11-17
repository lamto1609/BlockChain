// TRANG SINH VIÊN: tra văn bằng bằng mã SV, tạo link + QR chia sẻ cho nhà tuyển dụng.

$('lookupForm').onsubmit = async (e) => {
  e.preventDefault();
  try {
    const certs = await api(location.origin, `/students/${encodeURIComponent(e.target.studentId.value)}/certificates`);
    $('list').innerHTML = certs.length
      ? '<table><tr><th>Mã văn bằng</th><th>Trường</th><th>Ngày cấp</th><th>Trạng thái</th><th></th></tr>' + certs.map((c) =>
        `<tr><td>${esc(c.certId)}</td><td>${esc(c.issuerName)}</td><td>${time(c.issuedAt)}</td>
         <td>${c.status === 'valid' ? '✅ Hợp lệ' : '⚠️ Đã thu hồi'}</td>
         <td><button data-cert="${esc(c.certId)}">Tạo link / QR</button></td></tr>`).join('') + '</table>'
      : '<p>Chưa có văn bằng nào cho mã sinh viên này.</p>';
  } catch (err) {
    $('list').innerHTML = `<p class="bad">${esc(err.message)}</p>`;
  }
};

// Bấm "Tạo link / QR" ở dòng nào thì chia sẻ văn bằng của dòng đó.
// Link mở thẳng trang Nhà tuyển dụng, tự tra mã văn bằng; QR chứa đúng link đó.
$('list').onclick = (e) => {
  const certId = e.target.dataset.cert;
  if (!certId) return;
  const link = location.href.replace(/sinh-vien\.html.*$/, '') + 'tuyen-dung.html?cert=' + encodeURIComponent(certId);
  const qr = qrcode(0, 'M');
  qr.addData(link);
  qr.make();
  $('share').hidden = false;
  $('share').innerHTML = `<h2>Chia sẻ ${esc(certId)}</h2>${qr.createImgTag(5)}
    <input value="${esc(link)}" readonly onclick="this.select()">
    <p class="hint">Gửi link hoặc QR này cho nhà tuyển dụng, kèm file PDF gốc.</p>`;
};
