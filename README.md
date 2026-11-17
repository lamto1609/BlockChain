# Hệ thống xác thực văn bằng trên Blockchain (bản đơn giản)

Đồ án môn **Hệ thống ảo và Khả năng mở rộng** — Trường Đại học Sài Gòn.

Blockchain tự viết bằng Node.js **không dùng thư viện ngoài** (chỉ `http`, `crypto`), giao diện web **HTML + CSS + JavaScript thuần**, mỗi vai trò một trang riêng. Cả mạng chạy trên một máy: mỗi trường là một node giữ bản sao chain ở một cổng riêng, thêm một **node backup** giữ bản sao dự phòng.

**Tài liệu hướng dẫn đầy đủ cho người mới:** [`docs/Huong-dan-he-thong-van-bang.docx`](docs/Huong-dan-he-thong-van-bang.docx).

## Giao diện theo vai trò

| Trang | Vai trò | Làm gì |
|---|---|---|
| `index.html` | — | Trang chủ: chọn vai trò |
| `bo.html` | Bộ GD&ĐT | Cấp / gỡ quyền phát hành của các trường |
| `truong.html` | Trường đại học | Chọn trường, cấp văn bằng, yêu cầu và duyệt thu hồi |
| `sinh-vien.html` | Sinh viên | Tra văn bằng bằng mã SV, tạo link + QR |
| `tuyen-dung.html` | Nhà tuyển dụng | Xác minh bằng file PDF hoặc mã văn bằng (mở thẳng từ link/QR) |
| `explorer.html` | Kỹ thuật | Chain trên từng node: 3 trường + backup |

## Chạy

Cần Node.js 22 trở lên. Không cần `npm install`.

```
node tools/setup.js           # sinh khóa, genesis, cấu hình 3 trường + node backup (chạy lại là xóa dữ liệu cũ)
node tools/make-pdf.js        # PDF văn bằng mẫu vào web/samples/
node tools/start-local.js     # chạy 4 node; mở http://localhost:3001
```

Cửa sổ khác: `node tools/check.js` (6 kịch bản demo qua API), `node --test` (24 bài kiểm thử).

| Node | Địa chỉ | Vai trò |
|---|---|---|
| node1 | localhost:3001 | Đại học A + khóa Admin của Bộ |
| node2 | localhost:3002 | Đại học B |
| node3 | localhost:3003 | Đại học C |
| backup | localhost:3100 | Bản sao dự phòng, không có khóa |

## Node backup

Node backup giữ bản sao chain để phòng khi cả 3 trường mất dữ liệu. **Các trường tự gửi block và đẩy chain lên nó** (`POST /chain`), vì đặt trên VPS thì nó không gọi vào được máy của các trường; khi một trường mất chain, nó kéo lại từ backup rồi tự kiểm tra toàn bộ. Node backup không giữ khóa nào và tắt giả lập tấn công. Các trường đều tắt thì mở trang xác minh từ chính nó: `http://localhost:3100/tuyen-dung.html`.

**Đặt trên VPS thật** (Ubuntu, chưa chạy thử). Chạy `node tools/setup.js --backup http://IP_VPS:3100`, rồi:

```
ssh root@IP_VPS "mkdir -p /opt/vb-backup/data/node"
scp -r server web root@IP_VPS:/opt/vb-backup/
scp data/backup/config.json root@IP_VPS:/opt/vb-backup/data/node/config.json
scp deploy/vb-backup.service root@IP_VPS:/etc/systemd/system/
# trên VPS:
node -v || (curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs)
useradd -r -s /usr/sbin/nologin vbbackup 2>/dev/null; chown -R vbbackup /opt/vb-backup
ufw allow 3100/tcp
systemctl daemon-reload && systemctl enable --now vb-backup
journalctl -u vb-backup -n 5     # vài giây sau phải thấy "Nhận chain được đẩy tới"
```

## Cấu trúc

```
server/   chain.js (lõi blockchain), node.js (một node: API, mempool, PoA, đồng bộ HTTP), chain.test.js
web/      index.html + 5 trang vai trò (*.html, *.js), common.js, style.css, vendor/qrcode.js (thư viện QR, MIT)
tools/    setup.js, make-pdf.js, start-local.js, check.js
deploy/   vb-backup.service (systemd, cho VPS thật)
docs/     tài liệu Word, diagrams.html (nguồn các sơ đồ), img/
```

## Hạn chế

- Cả mạng trên một máy: máy hỏng là mất hết các node, trừ khi node backup nằm trên VPS.
- Khóa riêng nằm trong file cấu hình; khóa Admin chỉ ở node 1.
- PoA luân phiên: node tới lượt bị tắt thì giao dịch mới phải chờ (xác minh vẫn chạy).
- Không có cân bằng tải; đồng bộ gửi cả chain mỗi 3 giây — chỉ hợp với mạng nhỏ.
