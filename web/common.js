// DÙNG CHUNG CHO MỌI TRANG: gọi API, đọc file, hiện kết quả.
// NET (trong config.js) = địa chỉ các node: NET.schools (3 trường), NET.backup.

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
const show = (id, ok, text) => { $(id).className = ok ? 'ok' : 'bad'; $(id).textContent = text; };
const SCHOOL_NAMES = ['Đại học A', 'Đại học B', 'Đại học C'];

// Thẻ kết quả văn bằng: ✅ hợp lệ / ⚠️ đã thu hồi / ⏳ đang chờ / ❌ không tìm thấy
function certHtml(c) {
  if (c.status === 'valid') {
    const pending = c.revokeRequest ? `<br><b>⏳ Có yêu cầu thu hồi đang chờ các trường duyệt</b> (lý do: ${esc(c.revokeRequest.reason)})` : '';
    return `<div class="ok"><b>✅ Hợp lệ</b><br>Mã: ${esc(c.certId)}<br>Trường cấp: ${esc(c.issuerName)}
      <br>Ngày cấp: ${time(c.issuedAt)}<br>Nằm ở block #${c.blockIndex}${pending}</div>`;
  }
  if (c.status === 'revoked') {
    return `<div class="warn"><b>⚠️ Đã thu hồi</b><br>Mã: ${esc(c.certId)}<br>Trường cấp: ${esc(c.issuerName)}
      <br>Lý do: ${esc(c.revoked.reason)}<br>Ngày thu hồi: ${time(c.revoked.revokedAt)}
      <br>Các trường đã chấp nhận: ${esc((c.revoked.approvedBy || []).join(', '))}</div>`;
  }
  if (c.status === 'pending') return `<div class="warn"><b>⏳ Đang chờ</b><br>${esc(c.certId)} chưa vào block, thử lại sau vài giây.</div>`;
  return '<div class="bad"><b>❌ Không tìm thấy</b><br>File bị sửa hoặc không do trường nào cấp.</div>';
}
