// ========== CONFIG ==========
const SQL_SCRIPT = `-- Chạy đoạn SQL này trong Supabase → SQL Editor

-- Bảng thành viên
CREATE TABLE IF NOT EXISTS members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  stt INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng tuần
CREATE TABLE IF NOT EXISTS weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bảng ghi nhận điểm / lỗi
CREATE TABLE IF NOT EXISTS records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_id UUID NOT NULL REFERENCES weeks(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('cong', 'tru')),
  points INTEGER NOT NULL CHECK (points > 0),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Bật RLS (cho phép anon key đọc/ghi - phù hợp app nội bộ lớp)
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE weeks ENABLE ROW LEVEL SECURITY;
ALTER TABLE records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all members" ON members FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all weeks" ON weeks FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all records" ON records FOR ALL USING (true) WITH CHECK (true);

-- Index để truy vấn nhanh
CREATE INDEX IF NOT EXISTS idx_records_week ON records(week_id);
CREATE INDEX IF NOT EXISTS idx_records_member ON records(member_id);
`;

document.getElementById('sql-script').textContent = SQL_SCRIPT;

let supabase = null;
let currentWeekId = null;
let members = [];
let weeks = [];
let records = [];
let tenTo = 'Tổ 1';

// ========== INIT ==========
function init() {
  const saved = localStorage.getItem('thidua_config');
  if (saved) {
    try {
      const cfg = JSON.parse(saved);
      if (cfg.url && cfg.key) {
        document.getElementById('supabase-url').value = cfg.url;
        document.getElementById('supabase-key').value = cfg.key;
        document.getElementById('ten-to').value = cfg.tenTo || 'Tổ 1';
        connectSupabase(cfg.url, cfg.key, cfg.tenTo || 'Tổ 1');
        return;
      }
    } catch (e) {}
  }
  document.getElementById('config-screen').classList.remove('hidden');
  document.getElementById('app').classList.add('hidden');
}

function saveConfig() {
  const url = document.getElementById('supabase-url').value.trim();
  const key = document.getElementById('supabase-key').value.trim();
  const name = document.getElementById('ten-to').value.trim() || 'Tổ 1';
  if (!url || !key) {
    toast('Vui lòng nhập đầy đủ URL và Key');
    return;
  }
  localStorage.setItem('thidua_config', JSON.stringify({ url, key, tenTo: name }));
  connectSupabase(url, key, name);
}

function connectSupabase(url, key, name) {
  try {
    supabase = window.supabase.createClient(url, key);
    tenTo = name;
    document.getElementById('ten-to-display').textContent = tenTo;
    document.getElementById('config-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    loadAll();
  } catch (e) {
    toast('Không kết nối được Supabase. Kiểm tra lại URL/Key.');
    console.error(e);
  }
}

function copySQL() {
  navigator.clipboard.writeText(SQL_SCRIPT).then(() => toast('Đã sao chép SQL'));
}

// ========== DATA LOAD ==========
async function loadAll() {
  try {
    await Promise.all([loadMembers(), loadWeeks()]);
    if (weeks.length === 0) {
      // Tạo tuần mặc định
      await createDefaultWeek();
    } else {
      // Chọn tuần active hoặc tuần mới nhất
      const active = weeks.find(w => w.status === 'active') || weeks[0];
      currentWeekId = active.id;
    }
    await loadRecords();
    renderWeekSelect();
    renderMainTable();
    renderHistory();
  } catch (e) {
    console.error(e);
    toast('Lỗi tải dữ liệu: ' + (e.message || e));
  }
}

async function loadMembers() {
  const { data, error } = await supabase.from('members').select('*').order('stt');
  if (error) throw error;
  members = data || [];
}

async function loadWeeks() {
  const { data, error } = await supabase.from('weeks').select('*').order('start_date', { ascending: false });
  if (error) throw error;
  weeks = data || [];
}

async function loadRecords() {
  if (!currentWeekId) { records = []; return; }
  const { data, error } = await supabase
    .from('records')
    .select('*')
    .eq('week_id', currentWeekId)
    .order('date');
  if (error) throw error;
  records = data || [];
}

async function createDefaultWeek() {
  const today = new Date();
  const start = new Date(today);
  start.setDate(today.getDate() - today.getDay() + 1); // Thứ 2
  const end = new Date(start);
  end.setDate(start.getDate() + 5); // Chủ nhật
  const name = 'Tuần 1';
  const { data, error } = await supabase.from('weeks').insert({
    name,
    start_date: formatDateISO(start),
    end_date: formatDateISO(end),
    status: 'active'
  }).select().single();
  if (error) throw error;
  weeks = [data];
  currentWeekId = data.id;
}

// ========== RENDER ==========
function renderWeekSelect() {
  const sel = document.getElementById('week-select');
  sel.innerHTML = weeks.map(w =>
    `<option value="${w.id}" ${w.id === currentWeekId ? 'selected' : ''}>${w.name}</option>`
  ).join('');
  updateWeekDates();
}

function updateWeekDates() {
  const w = weeks.find(x => x.id === currentWeekId);
  if (!w) return;
  document.getElementById('week-dates').textContent =
    `${formatDateVN(w.start_date)} – ${formatDateVN(w.end_date)}`;
}

function getMemberStats(memberId) {
  const recs = records.filter(r => r.member_id === memberId);
  let cong = 0, tru = 0;
  const contents = [];
  recs.forEach(r => {
    if (r.type === 'cong') cong += r.points;
    else tru += r.points;
    contents.push(r.content);
  });
  return { cong, tru, total: cong - tru, contents: contents.join('; ') || '—' };
}

function renderMainTable() {
  const tbody = document.getElementById('main-tbody');
  const empty = document.getElementById('empty-main');
  if (members.length === 0) {
    tbody.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');
  const sorted = [...members].sort((a, b) => (a.stt || 0) - (b.stt || 0));
  tbody.innerHTML = sorted.map((m, i) => {
    const s = getMemberStats(m.id);
    const totalCls = s.total > 0 ? 'pos' : s.total < 0 ? 'neg' : '';
    return `<tr>
      <td>${m.stt || i + 1}</td>
      <td class="name-link" onclick="showDetail('${m.id}')">${esc(m.name)}</td>
      <td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="${esc(s.contents)}">${esc(s.contents)}</td>
      <td class="points-plus">${s.cong > 0 ? '+' + s.cong : '0'}</td>
      <td class="points-minus">${s.tru > 0 ? '-' + s.tru : '0'}</td>
      <td class="points-total ${totalCls}">${s.total > 0 ? '+' : ''}${s.total}</td>
      <td>
        <button class="btn-icon" title="Sửa" onclick="editMember('${m.id}')">✏️</button>
        <button class="btn-icon del" title="Xóa" onclick="deleteMember('${m.id}')">🗑️</button>
      </td>
    </tr>`;
  }).join('');
}

function renderHistory() {
  const tbody = document.getElementById('history-tbody');
  tbody.innerHTML = weeks.map(w => {
    const status = w.status === 'completed'
      ? '<span class="badge badge-done">Đã tổng kết</span>'
      : '<span class="badge badge-active">Đang thực hiện</span>';
    return `<tr>
      <td><strong>${esc(w.name)}</strong></td>
      <td>${formatDateVN(w.start_date)} – ${formatDateVN(w.end_date)}</td>
      <td>${status}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="viewPastWeek('${w.id}')">Xem</button>
      </td>
    </tr>`;
  }).join('');
}

async function showDetail(memberId) {
  const m = members.find(x => x.id === memberId);
  if (!m) return;
  document.getElementById('detail-name').textContent = m.name;
  const recs = records.filter(r => r.member_id === memberId).sort((a, b) => a.date.localeCompare(b.date));
  const tbody = document.getElementById('detail-tbody');
  let cong = 0, tru = 0;
  tbody.innerHTML = recs.length === 0
    ? '<tr><td colspan="5" style="text-align:center;color:#64748b;">Chưa có ghi nhận nào</td></tr>'
    : recs.map(r => {
        if (r.type === 'cong') cong += r.points; else tru += r.points;
        const diem = r.type === 'cong' ? '+' + r.points : '-' + r.points;
        const cls = r.type === 'cong' ? 'points-plus' : 'points-minus';
        return `<tr>
          <td>${formatDateVN(r.date)}</td>
          <td>${esc(r.content)}</td>
          <td>${r.type === 'cong' ? 'Cộng' : 'Trừ'}</td>
          <td class="${cls}">${diem}</td>
          <td><button class="btn-icon del" onclick="deleteRecord('${r.id}')">🗑️</button></td>
        </tr>`;
      }).join('');
  const total = cong - tru;
  document.getElementById('detail-total').textContent =
    `Tổng cộng: ${total > 0 ? '+' : ''}${total} điểm`;
  document.getElementById('detail-total').className =
    'total-line ' + (total > 0 ? 'points-plus' : total < 0 ? 'points-minus' : '');
  showView('detail');
}

// ========== WEEK ==========
async function changeWeek(id) {
  currentWeekId = id;
  await loadRecords();
  updateWeekDates();
  renderMainTable();
}

async function viewPastWeek(id) {
  currentWeekId = id;
  document.getElementById('week-select').value = id;
  await loadRecords();
  updateWeekDates();
  renderMainTable();
  showView('main');
  // Highlight nav
  document.querySelectorAll('.btn-nav').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-view="main"]')?.classList.add('active');
}

async function saveWeek() {
  const name = document.getElementById('week-name').value.trim();
  const start = document.getElementById('week-start').value;
  const end = document.getElementById('week-end').value;
  if (!name || !start || !end) {
    toast('Vui lòng điền đầy đủ thông tin');
    return;
  }
  if (start > end) {
    toast('Ngày bắt đầu phải trước ngày kết thúc');
    return;
  }
  try {
    // Đánh dấu các tuần active cũ thành completed (tùy chọn)
    // await supabase.from('weeks').update({ status: 'completed' }).eq('status', 'active');
    const { data, error } = await supabase.from('weeks').insert({
      name,
      start_date: start,
      end_date: end,
      status: 'active'
    }).select().single();
    if (error) throw error;
    weeks.unshift(data);
    currentWeekId = data.id;
    records = [];
    closeModal('week-modal');
    renderWeekSelect();
    renderMainTable();
    renderHistory();
    toast('Đã tạo tuần mới');
  } catch (e) {
    toast('Lỗi: ' + (e.message || e));
  }
}

// ========== MEMBERS ==========
function openModal(id) {
  document.getElementById(id).classList.remove('hidden');
  if (id === 'member-modal') {
    document.getElementById('member-modal-title').textContent = 'Thêm thành viên';
    document.getElementById('member-id').value = '';
    document.getElementById('member-name').value = '';
    document.getElementById('member-stt').value = members.length + 1;
  }
  if (id === 'record-modal') {
    const sel = document.getElementById('record-member');
    sel.innerHTML = members.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
    document.getElementById('record-date').value = formatDateISO(new Date());
    document.getElementById('record-content').value = '';
    document.getElementById('record-type').value = 'tru';
    document.getElementById('record-points').value = 1;
  }
  if (id === 'week-modal') {
    const nextNum = weeks.length + 1;
    document.getElementById('week-name').value = `Tuần ${nextNum}`;
    // Gợi ý ngày tuần tiếp theo
    if (weeks.length > 0) {
      const last = weeks[0]; // newest first
      const nextStart = new Date(last.end_date);
      nextStart.setDate(nextStart.getDate() + 1);
      const nextEnd = new Date(nextStart);
      nextEnd.setDate(nextStart.getDate() + 6);
      document.getElementById('week-start').value = formatDateISO(nextStart);
      document.getElementById('week-end').value = formatDateISO(nextEnd);
    } else {
      document.getElementById('week-start').value = formatDateISO(new Date());
      document.getElementById('week-end').value = '';
    }
  }
}

function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
}

function editMember(id) {
  const m = members.find(x => x.id === id);
  if (!m) return;
  document.getElementById('member-modal-title').textContent = 'Sửa thành viên';
  document.getElementById('member-id').value = m.id;
  document.getElementById('member-name').value = m.name;
  document.getElementById('member-stt').value = m.stt || '';
  document.getElementById('member-modal').classList.remove('hidden');
}

async function saveMember() {
  const id = document.getElementById('member-id').value;
  const name = document.getElementById('member-name').value.trim();
  const stt = parseInt(document.getElementById('member-stt').value) || 0;
  if (!name) {
    toast('Vui lòng nhập họ tên');
    return;
  }
  try {
    if (id) {
      const { error } = await supabase.from('members').update({ name, stt }).eq('id', id);
      if (error) throw error;
      const idx = members.findIndex(m => m.id === id);
      if (idx >= 0) members[idx] = { ...members[idx], name, stt };
      toast('Đã cập nhật thành viên');
    } else {
      const { data, error } = await supabase.from('members').insert({ name, stt }).select().single();
      if (error) throw error;
      members.push(data);
      toast('Đã thêm thành viên');
    }
    closeModal('member-modal');
    renderMainTable();
  } catch (e) {
    toast('Lỗi: ' + (e.message || e));
  }
}

async function deleteMember(id) {
  if (!confirm('Xóa thành viên này? Tất cả điểm của thành viên cũng sẽ bị xóa.')) return;
  try {
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (error) throw error;
    members = members.filter(m => m.id !== id);
    records = records.filter(r => r.member_id !== id);
    renderMainTable();
    toast('Đã xóa thành viên');
  } catch (e) {
    toast('Lỗi: ' + (e.message || e));
  }
}

// ========== RECORDS ==========
async function saveRecord() {
  const member_id = document.getElementById('record-member').value;
  const date = document.getElementById('record-date').value;
  const content = document.getElementById('record-content').value.trim();
  const type = document.getElementById('record-type').value;
  const points = parseInt(document.getElementById('record-points').value) || 0;
  if (!member_id || !date || !content || points < 1) {
    toast('Vui lòng điền đầy đủ thông tin');
    return;
  }
  if (!currentWeekId) {
    toast('Chưa có tuần hiện tại');
    return;
  }
  try {
    const { data, error } = await supabase.from('records').insert({
      week_id: currentWeekId,
      member_id,
      date,
      content,
      type,
      points
    }).select().single();
    if (error) throw error;
    records.push(data);
    closeModal('record-modal');
    renderMainTable();
    toast('Đã lưu điểm');
  } catch (e) {
    toast('Lỗi: ' + (e.message || e));
  }
}

async function deleteRecord(id) {
  if (!confirm('Xóa ghi nhận này?')) return;
  try {
    const { error } = await supabase.from('records').delete().eq('id', id);
    if (error) throw error;
    records = records.filter(r => r.id !== id);
    // Refresh detail if open
    const detailName = document.getElementById('detail-name').textContent;
    const m = members.find(x => x.name === detailName);
    if (m && !document.getElementById('view-detail').classList.contains('hidden')) {
      showDetail(m.id);
    }
    renderMainTable();
    toast('Đã xóa');
  } catch (e) {
    toast('Lỗi: ' + (e.message || e));
  }
}

// ========== SUMMARY ==========
function openSummary() {
  const w = weeks.find(x => x.id === currentWeekId);
  if (!w) return;
  document.getElementById('summary-week-info').textContent =
    `${w.name}: ${formatDateVN(w.start_date)} – ${formatDateVN(w.end_date)} | ${tenTo}`;
  const stats = members.map(m => {
    const s = getMemberStats(m.id);
    return { ...m, ...s };
  }).sort((a, b) => b.total - a.total);
  const tbody = document.getElementById('summary-tbody');
  tbody.innerHTML = stats.map((m, i) => {
    const totalCls = m.total > 0 ? 'pos' : m.total < 0 ? 'neg' : '';
    return `<tr>
      <td>${i + 1}</td>
      <td>${esc(m.name)}</td>
      <td class="points-plus">${m.cong > 0 ? '+' + m.cong : '0'}</td>
      <td class="points-minus">${m.tru > 0 ? '-' + m.tru : '0'}</td>
      <td class="points-total ${totalCls}">${m.total > 0 ? '+' : ''}${m.total}</td>
    </tr>`;
  }).join('');
  document.getElementById('summary-modal').classList.remove('hidden');
}

async function markWeekCompleted() {
  if (!currentWeekId) return;
  try {
    const { error } = await supabase.from('weeks').update({ status: 'completed' }).eq('id', currentWeekId);
    if (error) throw error;
    const w = weeks.find(x => x.id === currentWeekId);
    if (w) w.status = 'completed';
    renderHistory();
    toast('Đã đánh dấu tổng kết');
  } catch (e) {
    toast('Lỗi: ' + (e.message || e));
  }
}

// ========== EXPORT ==========
function getExportData() {
  const w = weeks.find(x => x.id === currentWeekId);
  const stats = members.map(m => {
    const s = getMemberStats(m.id);
    const detailRecs = records.filter(r => r.member_id === m.id)
      .map(r => `${formatDateVN(r.date)}: ${r.content} (${r.type === 'cong' ? '+' : '-'}${r.points})`)
      .join(' | ');
    return {
      stt: m.stt,
      name: m.name,
      cong: s.cong,
      tru: s.tru,
      total: s.total,
      details: detailRecs || '—'
    };
  }).sort((a, b) => b.total - a.total);
  return { week: w, stats };
}

function exportExcel() {
  const { week, stats } = getExportData();
  if (!week) return;
  const rows = [
    ['TỔNG KẾT THI ĐUA TỔ'],
    ['Tên tổ', tenTo],
    ['Tuần', week.name],
    ['Từ ngày', formatDateVN(week.start_date)],
    ['Đến ngày', formatDateVN(week.end_date)],
    [],
    ['STT', 'Họ và tên', 'Điểm cộng', 'Điểm trừ', 'Tổng điểm', 'Chi tiết lỗi / điểm']
  ];
  stats.forEach((s, i) => {
    rows.push([i + 1, s.name, s.cong, s.tru, s.total, s.details]);
  });
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 6 }, { wch: 22 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 50 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Tong ket');
  XLSX.writeFile(wb, `Tong_ket_${week.name.replace(/\s/g, '_')}_${tenTo.replace(/\s/g, '_')}.xlsx`);
  toast('Đã xuất file Excel');
}

function exportPDF() {
  const { week, stats } = getExportData();
  if (!week) return;
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(16);
  doc.text('TONG KET THI DUA TO', 105, 18, { align: 'center' });
  doc.setFontSize(11);
  doc.text(`Ten to: ${tenTo}`, 14, 30);
  doc.text(`Tuan: ${week.name}`, 14, 37);
  doc.text(`Tu ngay: ${formatDateVN(week.start_date)} - Den ngay: ${formatDateVN(week.end_date)}`, 14, 44);

  const tableData = stats.map((s, i) => [
    i + 1,
    s.name,
    s.cong,
    s.tru,
    s.total
  ]);
  doc.autoTable({
    startY: 52,
    head: [['STT', 'Ho va ten', 'Diem cong', 'Diem tru', 'Tong diem']],
    body: tableData,
    styles: { fontSize: 10 },
    headStyles: { fillColor: [37, 99, 235] }
  });

  // Chi tiết
  let y = doc.lastAutoTable.finalY + 12;
  doc.setFontSize(12);
  doc.text('Chi tiet loi vi pham / diem cong:', 14, y);
  y += 8;
  doc.setFontSize(9);
  stats.forEach(s => {
    if (s.details === '—') return;
    const lines = doc.splitTextToSize(`${s.name}: ${s.details}`, 180);
    if (y + lines.length * 5 > 280) {
      doc.addPage();
      y = 20;
    }
    doc.text(lines, 14, y);
    y += lines.length * 5 + 3;
  });

  doc.save(`Tong_ket_${week.name.replace(/\s/g, '_')}.pdf`);
  toast('Đã xuất file PDF');
}

// ========== VIEW ==========
function showView(name) {
  document.querySelectorAll('.view').forEach(v => v.classList.add('hidden'));
  document.getElementById('view-' + name).classList.remove('hidden');
  document.querySelectorAll('.btn-nav[data-view]').forEach(b => {
    b.classList.toggle('active', b.dataset.view === name);
  });
}

// ========== UTILS ==========
function formatDateVN(d) {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function formatDateISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function toast(msg) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 2500);
}

// Start
init();
