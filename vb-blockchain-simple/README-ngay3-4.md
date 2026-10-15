# Giao diện web (G10–G13) — đã có sẵn trong web/

Chạy trong PowerShell, tại thư mục dự án (cần Node.js 22+):

    node tools/setup.js local      # sinh khóa, genesis, web/config.js (chạy lại sẽ xóa data/)
    node tools/make-pdf.js         # tạo 4 PDF mẫu trong web/samples/
    node tools/start-local.js      # chạy 5 node, để nguyên cửa sổ này

Mở trình duyệt: http://localhost:3001  (5 tab: Trường, Người học, Xác minh, Admin, Block Explorer)

Thứ tự thử 6 kịch bản:
 0. Tab Admin -> gửi từ Node 1 -> "Cấp quyền" cho Đại học A (chờ ~5 giây). Thử từ Node 2 -> bị từ chối.
 1. Tab Trường (Node 1) -> cấp VB2026-001 / SV001 / samples/VB2026-001.pdf. Xem Block Explorer.
 2. Tab Xác minh -> chọn VB2026-001.pdf -> Hợp lệ. (Tab Người học: nhập SV001 -> tạo link/QR)
 3. Xác minh VB2026-001-da-sua.pdf -> Không tìm thấy.
 4. Tab Trường chọn Node 3 -> cấp GHOST-001.pdf -> bị từ chối (chưa có quyền).
 5. Mở data/node2/chain.json, đổi 1 ký tự trong docHash, lưu -> Explorer: Node 2 đỏ, ~8 giây sau tự xanh lại.
 6. Tab Trường (Node 1) -> Thu hồi VB2026-001 -> Xác minh lại -> Đã thu hồi.

Tự động kiểm tra (cửa sổ PowerShell thứ hai): node tools/check.js  (phải ra 7/7 đạt)
