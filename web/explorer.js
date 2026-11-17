// BLOCK EXPLORER: hỏi chain của từng node mỗi 2 giây — 3 trường + node backup trên VPS
const short = (h) => (h ? h.slice(-12) : '');
const allNodes = [...NET.schools.map((u, i) => [u, `Node ${i + 1} · ${SCHOOL_NAMES[i]}`]), ...(NET.backup ? [[NET.backup, 'Backup VPS']] : [])];
$('nodes').innerHTML = allNodes.map((n, i) => `<div class="node offline" id="node${i}"><h3>${n[1]}</h3>Đang tải…</div>`).join('');

async function load() {
  allNodes.forEach(async ([url, label], i) => {
    const box = $('node' + i);
    try {
      const d = await api(url, '/chain');
      box.className = 'node' + (d.valid ? '' : ' invalid');
      box.innerHTML = `<h3>${label}</h3>
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
load();
setInterval(load, 2000);
