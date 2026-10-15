// SINH PDF VĂN BẰNG MẪU vào web/samples/ (mã văn bằng in sẵn trong PDF trước khi băm)
// Chạy: node tools/make-pdf.js
const fs = require('fs');

// Một file PDF tối giản viết tay: 1 trang, font Helvetica (nên chỉ dùng chữ không dấu)
function makePdf(lines) {
  const text = lines.map((l, i) => `BT /F1 ${i ? 13 : 20} Tf 60 ${760 - i * 32} Td (${l}) Tj ET`).join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  pdf += offsets.map((o) => String(o).padStart(10, '0') + ' 00000 n \n').join('');
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return pdf;
}

function diploma(certId, school, student, studentId, gpa) {
  return makePdf(['BANG TOT NGHIEP DAI HOC', 'Truong: ' + school, 'Cap cho: ' + student,
    'Ma sinh vien: ' + studentId, 'Nganh: Cong nghe thong tin', 'Diem trung binh: ' + gpa, 'Ma van bang: ' + certId]);
}

module.exports = { diploma };
if (require.main !== module) return; // được tools/check.js gọi thì chỉ cho mượn hàm diploma, không ghi file

fs.mkdirSync('web/samples', { recursive: true });
const files = {
  'VB2026-001.pdf': diploma('VB2026-001', 'Dai hoc A', 'Nguyen Van An', 'SV001', '7.5'),
  'VB2026-001-da-sua.pdf': diploma('VB2026-001', 'Dai hoc A', 'Nguyen Van An', 'SV001', '9.5'), // sửa 1 ký tự
  'VB2026-002.pdf': diploma('VB2026-002', 'Dai hoc A', 'Tran Thi Binh', 'SV002', '8.1'),
  'GHOST-001.pdf': diploma('GHOST-001', 'Truong ma', 'Nguoi mua bang', 'SV999', '10.0'),
};
for (const [name, content] of Object.entries(files)) fs.writeFileSync('web/samples/' + name, content);
console.log('Đã tạo PDF mẫu trong web/samples/:', Object.keys(files).join(', '));
