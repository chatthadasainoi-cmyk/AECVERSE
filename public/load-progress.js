/* ============================================================
   AEC VERSE — ความคืบหน้าตอนโหลดโลก 3D

   ปัญหาเดิม: พอเชื่อมต่อเซิร์ฟเวอร์ได้ ล็อบบี้ก็บอกว่า "พร้อมแล้ว กดเริ่มสำรวจได้เลย"
   ทั้งที่โมเดลโรงงานยังไม่ได้ดาวน์โหลดด้วยซ้ำ ใครกดตอนนั้นเข้าไปเจอพื้นที่ว่าง
   ส่วนตอนดาวน์โหลดไฟล์หลายสิบเมกะไบต์ก็ไม่มีตัวเลขให้ดูเลย จอนิ่งจนดูเหมือนค้าง

   ตอนนี้: ปุ่มเริ่มจะกดได้เมื่อโมเดลพร้อมจริง และบอกเปอร์เซ็นต์ ขนาดไฟล์ ขั้นตอนที่ทำอยู่
   ถ้าโหลดไม่สำเร็จจะมีปุ่มลองใหม่ ไม่ปล่อยให้ติดอยู่หน้าล็อบบี้

   ไฟล์นี้ไม่ผูกกับ app.js — แยกไว้เพื่อให้ทดสอบเดี่ยวๆ ได้
   ============================================================ */
window.AecLoadUI = (function () {

  const $ = id => document.getElementById(id);
  const mb = n => (n / 1024 / 1024).toFixed(n >= 10 * 1024 * 1024 ? 0 : 1) + ' MB';

  // ---------- ดาวน์โหลดแบบอ่านเป็นก้อนเพื่อรู้ว่าไปถึงไหนแล้ว ----------
  // fetch().arrayBuffer() ธรรมดาไม่บอกอะไรเลยระหว่างทาง
  // ถ้าเซิร์ฟเวอร์ไม่ส่งขนาดไฟล์มาหรืออ่านเป็นก้อนไม่ได้ ก็ตกกลับไปแบบเดิม (ไม่มีเปอร์เซ็นต์ แต่ยังโหลดได้)
  async function fetchWithProgress(url, onProgress, fetchImpl) {
    const doFetch = fetchImpl || fetch;
    const res = await doFetch(url);
    if (!res.ok) throw new Error('ดาวน์โหลดไม่สำเร็จ (HTTP ' + res.status + ')');

    const total = Number(res.headers.get('content-length')) || 0;
    if (!res.body || !res.body.getReader) {
      const buf = await res.arrayBuffer();
      if (onProgress) onProgress(buf.byteLength, buf.byteLength);
      return buf;
    }

    const reader = res.body.getReader();
    const chunks = [];
    let loaded = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      loaded += value.byteLength;
      if (onProgress) onProgress(loaded, total);
    }
    const out = new Uint8Array(loaded);
    let off = 0;
    for (const c of chunks) { out.set(c, off); off += c.byteLength; }
    return out.buffer;
  }

  // ---------- สถานะ ----------
  // connecting = รอเชื่อมต่อเซิร์ฟเวอร์ · loading = กำลังโหลดโมเดล · confirm = โมเดลใหญ่ รอกดยืนยัน
  // ready = พร้อม · empty = ห้องนี้ยังไม่มีโมเดล · failed = โหลดไม่สำเร็จ
  let state = 'connecting';
  let pct = null;                 // null = ไม่รู้ขนาดไฟล์ (แสดงแถบวิ่ง)
  let detail = '';
  let retryFn = null;
  let confirmFn = null;
  let connectTimer = null;
  const CONNECT_TIMEOUT_MS = 15000;

  const START_LABEL = '▶ เริ่มสำรวจ';
  const canStart = () => state === 'ready' || state === 'empty' || state === 'failed';

  function ensureChip() {
    let chip = $('load-chip');
    if (chip) return chip;
    const host = $('canvas-container') || document.body;
    chip = document.createElement('div');
    chip.id = 'load-chip';
    chip.setAttribute('role', 'status');
    chip.setAttribute('aria-live', 'polite');
    chip.innerHTML = '<div class="lc-bar"><i></i></div><div class="lc-text"></div>' +
      '<button type="button" class="lc-btn" hidden></button>';
    host.appendChild(chip);
    return chip;
  }

  function paintBar(el) {
    if (!el) return;
    el.classList.toggle('indet', pct == null && state === 'loading');
    const fill = el.querySelector('i');
    if (fill) fill.style.width = (pct == null ? 40 : Math.max(2, Math.min(100, pct))) + '%';
  }

  function paint() {
    // ---- ล็อบบี้ ----
    const status = $('lobby-status');
    const start = $('lobby-start');
    const bar = $('lobby-progress');
    const act = $('lobby-action');
    if (status) {
      status.textContent = detail;
      status.classList.toggle('bad', state === 'failed');
    }
    if (bar) {
      bar.hidden = !(state === 'loading' || state === 'connecting');
      paintBar(bar);
    }
    if (start) {
      start.disabled = !canStart();
      start.textContent = state === 'loading' && pct != null ? 'กำลังเตรียมโลก ' + Math.round(pct) + '%'
        : state === 'loading' || state === 'connecting' ? 'กำลังเตรียมโลก…'
        : state === 'confirm' ? 'รอการยืนยันโหลดโมเดล'
        : START_LABEL;
    }
    if (act) {
      const show = state === 'failed' || state === 'confirm';
      act.hidden = !show;
      act.textContent = state === 'failed' ? '↻ ลองโหลดใหม่' : 'โหลดโมเดลเลย';
    }

    // ---- ชิปลอยบนฉาก (ใช้ตอนไม่มีล็อบบี้ เช่นหน้าที่ฝังโลก 3D หรือโหลดโมเดลใหม่ระหว่างใช้งาน) ----
    const lobby = $('world-lobby');
    const lobbyUp = !!(lobby && !lobby.classList.contains('lobby-hidden') && lobby.style.display !== 'none');
    const showChip = (state === 'loading' || state === 'failed' || state === 'confirm') && !lobbyUp;
    const chip = showChip ? ensureChip() : $('load-chip');
    if (chip) {
      chip.hidden = !showChip;
      chip.classList.toggle('bad', state === 'failed');
      const t = chip.querySelector('.lc-text'); if (t) t.textContent = detail;
      paintBar(chip.querySelector('.lc-bar'));
      const b = chip.querySelector('.lc-btn');
      if (b) {
        b.hidden = !(state === 'failed' || state === 'confirm');
        b.textContent = state === 'failed' ? '↻ ลองใหม่' : 'โหลดเลย';
      }
    }
  }

  function set(next, text, p) {
    if (next !== 'connecting') clearTimeout(connectTimer);
    state = next; detail = text || ''; pct = p == null ? null : p;
    paint();
  }

  // ---------- API ที่ app.js เรียก ----------
  const api = {
    fetchWithProgress,
    get state() { return state; },
    get percent() { return pct; },
    get text() { return detail; },

    connecting() {
      set('connecting', 'กำลังเชื่อมต่อเซิร์ฟเวอร์…');
      // ถ้าเซิร์ฟเวอร์ไม่ตอบ ปุ่มเริ่มจะถูกปิดไว้ตลอดและผู้ใช้ไม่รู้ว่าต้องทำอะไรต่อ
      clearTimeout(connectTimer);
      connectTimer = setTimeout(() => {
        if (state === 'connecting') api.fail('เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ', () => location.reload());
      }, CONNECT_TIMEOUT_MS);
    },
    empty() { set('empty', 'ยังไม่มีโมเดลในโลกนี้ — เข้าไปได้แต่จะเห็นพื้นที่ว่าง'); },

    begin(name) { set('loading', 'กำลังเตรียมโมเดล' + (name ? ' ' + name : '') + '…', null); },
    cached() { set('loading', 'โหลดจากแคชในเครื่อง ไม่ต้องดาวน์โหลดซ้ำ…', null); },
    download(loaded, total) {
      if (total > 0) set('loading', 'ดาวน์โหลดโมเดล ' + mb(loaded) + ' จาก ' + mb(total), (loaded / total) * 85);
      else set('loading', 'ดาวน์โหลดโมเดล ' + mb(loaded) + '…', null);
    },
    // หลังดาวน์โหลดครบยังต้องแปลงไฟล์และสร้างระบบชน ซึ่งกินเวลาและบล็อกหน้าจอ
    // บอกไว้ก่อน ผู้ใช้จะได้รู้ว่าเครื่องกำลังทำงานอยู่ ไม่ใช่ค้าง
    parsing() { set('loading', 'กำลังประมวลผลโมเดล 3 มิติ (ช่วงนี้หน้าจออาจกระตุกสักครู่)…', 88); },
    building() { set('loading', 'กำลังสร้างระบบชนและป้ายข้อมูล…', 96); },
    done() { set('ready', 'พร้อมแล้ว — กดเริ่มสำรวจได้เลย', 100); },

    fail(msg, onRetry) {
      retryFn = onRetry || null;
      set('failed', (msg || 'โหลดโมเดลไม่สำเร็จ') + ' — ลองใหม่ได้ หรือเข้าไปก่อนแล้วโมเดลจะตามมา');
    },
    needConfirm(name, sizeBytes, onConfirm) {
      confirmFn = onConfirm || null;
      set('confirm', 'โมเดล' + (name ? ' “' + name + '”' : '') + ' ใหญ่ ' + mb(sizeBytes) +
        ' เกินกว่าจะโหลดอัตโนมัติ กดโหลดเมื่อพร้อม');
    },

    // ปุ่มลองใหม่ / ปุ่มยืนยัน
    act() {
      if (state === 'failed' && retryFn) { const f = retryFn; retryFn = null; f(); }
      else if (state === 'confirm' && confirmFn) { const f = confirmFn; confirmFn = null; f(); }
    },
    repaint: paint
  };

  function wire() {
    const a = $('lobby-action');
    if (a && !a.dataset.wired) { a.dataset.wired = '1'; a.addEventListener('click', api.act); }
    document.addEventListener('click', e => {
      if (e.target && e.target.classList && e.target.classList.contains('lc-btn')) api.act();
    });
    if (state === 'connecting') api.connecting();
    paint();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', wire); else wire();

  return api;
})();
