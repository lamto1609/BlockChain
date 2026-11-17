// TRANG NHÀ TUYỂN DỤNG: xác minh bằng file PDF hoặc mã văn bằng.
// Đọc từ chính node đang mở trang này: node 1 tắt thì mở trang từ node khác (kể cả node backup, cổng 3100).

$('pdf').onchange = async (e) => {
  try {
    $('pdfResult').innerHTML = certHtml(await api(location.origin, '/verify', { pdfBase64: await readFile(e.target.files[0]) }));
  } catch (err) {
    $('pdfResult').innerHTML = `<p class="bad">${esc(err.message)}</p>`;
  }
};

async function lookup(certId) {
  try {
    $('lookupResult').innerHTML = certHtml(await api(location.origin, '/certificates/' + encodeURIComponent(certId)));
  } catch (err) {
    $('lookupResult').innerHTML = `<p class="bad">${esc(err.message)}</p>`;
  }
}
$('lookupForm').onsubmit = (e) => { e.preventDefault(); lookup(e.target.certId.value); };

// Mở từ link/QR sinh viên gửi (?cert=...) → tự tra mã đó
const shared = new URLSearchParams(location.search).get('cert');
if (shared) {
  $('shared').hidden = false;
  $('shared').textContent = `Ứng viên gửi văn bằng ${shared}. Tải file PDF gốc ứng viên gửi để đối chiếu nội dung.`;
  $('lookupForm').certId.value = shared;
  lookup(shared);
}
