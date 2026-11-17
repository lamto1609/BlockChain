// TRANG BỘ GD&ĐT: cấp / gỡ quyền phát hành. Gửi tới node 1 — máy giữ khóa Admin của Bộ (trong bản demo).
const BO = NET.schools[0];

async function load() {
  const info = await api(BO, '/info').catch(() => null);
  $('nodeInfo').innerHTML = info
    ? `Node 1 (máy của Bộ) · độ cao ${info.height} · ${info.valid ? '● hợp lệ' : '● KHÔNG hợp lệ'}`
    : '<span class="bad">Node 1 (máy của Bộ) đang tắt</span>';
  const { issuers, schools } = await api(BO, '/issuers');
  $('table').innerHTML = schools.map((s) => {
    const has = issuers[s.publicKey];
    return `<tr><td>${esc(s.name)}</td><td>${has ? '✅ Có' : '— Chưa'}</td>
      <td><button class="${has ? 'danger' : ''}" data-key="${esc(s.publicKey)}" data-name="${esc(s.name)}" data-grant="${has ? '' : '1'}">
      ${has ? 'Gỡ quyền' : 'Cấp quyền'}</button></td></tr>`;
  }).join('');
}
load();

$('table').onclick = async (e) => {
  const { key, name, grant } = e.target.dataset;
  if (!key) return;
  try {
    const r = grant ? await api(BO, '/issuers', { publicKey: key, name }) : await api(BO, '/issuers/' + key, null, 'DELETE');
    show('msg', true, '✔ ' + r.message);
    setTimeout(load, 6000); // quyền chỉ đổi sau khi block được tạo
  } catch (err) {
    show('msg', false, '✖ ' + err.message);
  }
};
