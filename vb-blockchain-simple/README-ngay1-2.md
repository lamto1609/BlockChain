# Ngày 1 + 2 (G1–G9): lõi blockchain + server + mạng 5 node local

Chạy trong PowerShell, tại thư mục dự án:

    node --test                    # G5: pass 20, fail 0
    node tools/setup.js local      # G6: sinh khóa, genesis, cấu hình (chạy lại sẽ xóa data/)
    node tools/make-pdf.js         # G8: tạo 4 PDF mẫu
    node tools/start-local.js      # G8: chạy 5 node, để nguyên cửa sổ này

Mở cửa sổ PowerShell thứ hai:

    node tools/check.js            # G9: phải ra "7/7 đạt"

Lưu ý: data/ chứa khóa riêng, không đưa lên GitHub (đã có trong .gitignore).
