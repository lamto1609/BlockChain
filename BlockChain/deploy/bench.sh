#!/bin/bash
# ĐO TẢI XÁC MINH VĂN BẰNG qua nginx (chạy trên VM gateway): bash bench.sh [số yêu cầu] [số yêu cầu cùng lúc]
N=${1:-2000}
C=${2:-50}
# Một yêu cầu xác minh = gửi file PDF mẫu (dạng base64 trong JSON) tới /api/verify
echo "{\"pdfBase64\":\"$(base64 -w0 /var/www/vb/samples/VB2026-001.pdf)\"}" > /tmp/verify.json
ab -q -n "$N" -c "$C" -p /tmp/verify.json -T application/json http://127.0.0.1/api/verify \
| grep -E "Failed requests|Non-2xx|Requests per second|Time per request.*\(mean\)"
