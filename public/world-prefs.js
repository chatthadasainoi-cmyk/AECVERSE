/* ============================================================
   AEC VERSE — ตั้งค่าส่วนตัวของผู้ใช้สำหรับโลก 3D
     1) เลือกไมโครโฟนเองได้ (บางเครื่องมีหลายตัว เบราว์เซอร์เลือกผิดตัวแล้วพูดไม่ออก)
     2) เปลี่ยนปุ่มควบคุม (keybind) เองได้

   เก็บใน localStorage คีย์ aec_mic_device_id / aec_keybinds — โลก 3D (app.js)
   อ่านค่าพวกนี้ตอนใช้งานจริง หน้า Settings แค่เขียนค่าลงไป

   ใช้งาน: AecWorldPrefs.mountMic(el) / AecWorldPrefs.mountKeybinds(el)
   ============================================================ */
window.AecWorldPrefs = (function () {
  const MIC_KEY = 'aec_mic_device_id';
  const BIND_KEY = 'aec_keybinds';

  // action -> { label, default }  ค่าเก็บเป็น e.key ตัวพิมพ์เล็ก (หรือชื่อปุ่มพิเศษ)
  const ACTIONS = {
    forward:  { label: 'เดินหน้า',        def: 'w' },
    backward: { label: 'ถอยหลัง',         def: 's' },
    left:     { label: 'หันซ้าย',         def: 'a' },
    right:    { label: 'หันขวา',          def: 'd' },
    jump:     { label: 'กระโดด',          def: ' ' },
    mic:      { label: 'เปิด/ปิดไมค์',     def: 'v' },
    chat:     { label: 'พิมพ์แชท',        def: '/' },
    freelook: { label: 'สลับ Free Look',  def: 'f' },
    resetcam: { label: 'รีเซ็ตมุมกล้อง',  def: 'r' }
  };

  function loadBinds() {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem(BIND_KEY) || '{}') || {}; } catch (e) {}
    const out = {};
    Object.keys(ACTIONS).forEach(a => {
      out[a] = (typeof saved[a] === 'string' && saved[a].length) ? saved[a] : ACTIONS[a].def;
    });
    return out;
  }
  function saveBinds(b) { try { localStorage.setItem(BIND_KEY, JSON.stringify(b)); } catch (e) {} }
  const getMicDeviceId = () => { try { return localStorage.getItem(MIC_KEY) || ''; } catch (e) { return ''; } };

  const keyLabel = k => k === ' ' ? 'Space' : (k.length === 1 ? k.toUpperCase() : k);

  // สไตล์ติดมากับโมดูลเลย จะได้ใช้ได้ทุกหน้าโดยไม่ต้องไปก๊อป CSS ซ้ำในแต่ละหน้า
  (function injectStyle() {
    if (document.getElementById('aec-world-prefs-style')) return;
    const s = document.createElement('style');
    s.id = 'aec-world-prefs-style';
    s.textContent = [
      '.wp-select{width:100%;background:var(--panel-2,#111826);border:1px solid var(--border,#1c2531);border-radius:8px;',
        'padding:9px 11px;color:var(--text-0,#eef2f7);font-size:12.5px;font-family:inherit;outline:none;margin-bottom:9px;}',
      '.wp-btn{width:100%;background:var(--panel-2,#111826);border:1px solid var(--border,#1c2531);border-radius:8px;',
        'padding:9px 11px;color:var(--text-0,#eef2f7);font-size:12px;font-weight:600;cursor:pointer;font-family:inherit;}',
      '.wp-btn:hover{border-color:#33475e;}',
      '.wp-note{font-size:11px;color:var(--text-2,#657182);line-height:1.6;margin-top:8px;}',
      '.wp-bind-row{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:6px 0;}',
      '.wp-bind-label{font-size:12px;color:var(--text-1,#9aa7b8);}',
      '.wp-bind-key{min-width:104px;background:var(--panel-2,#111826);border:1px solid var(--border,#1c2531);',
        'border-radius:7px;padding:6px 10px;color:var(--text-0,#eef2f7);font-size:11.5px;font-weight:700;',
        'font-family:ui-monospace,"Cascadia Mono",monospace;cursor:pointer;}',
      '.wp-bind-key:hover{border-color:#33475e;}',
      '.wp-bind-key.listening{border-color:#22d3ee;color:#22d3ee;background:rgba(34,211,238,0.12);}'
    ].join('');
    document.head.appendChild(s);
  })();

  // ---------- ไมโครโฟน ----------
  function mountMic(container) {
    container.innerHTML =
      '<select id="wp-mic-select" class="wp-select"><option value="">ค่าเริ่มต้นของระบบ</option></select>' +
      '<button id="wp-mic-detect" class="wp-btn">🎙️ ตรวจหาไมโครโฟน</button>' +
      '<div id="wp-mic-note" class="wp-note">กด "ตรวจหาไมโครโฟน" เพื่อให้เบราว์เซอร์อนุญาต แล้วจะเห็นชื่ออุปกรณ์ทั้งหมด</div>';

    const sel = container.querySelector('#wp-mic-select');
    const note = container.querySelector('#wp-mic-note');

    async function listDevices(askPermission) {
      if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
        note.textContent = 'เบราว์เซอร์นี้ไม่รองรับการเลือกอุปกรณ์เสียง';
        return;
      }
      try {
        // ชื่ออุปกรณ์จะว่างเปล่าจนกว่าจะเคยได้รับอนุญาตใช้ไมค์ — ขอสิทธิ์ก่อนแล้วปิดทิ้งทันที
        if (askPermission) {
          const tmp = await navigator.mediaDevices.getUserMedia({ audio: true });
          tmp.getTracks().forEach(t => t.stop());
        }
        const devices = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'audioinput');
        const saved = getMicDeviceId();
        sel.innerHTML = '<option value="">ค่าเริ่มต้นของระบบ</option>' +
          devices.map((d, i) =>
            `<option value="${d.deviceId}"${d.deviceId === saved ? ' selected' : ''}>${(d.label || ('ไมโครโฟน ' + (i + 1))).replace(/[<>]/g, '')}</option>`
          ).join('');
        note.textContent = devices.length
          ? `พบไมโครโฟน ${devices.length} ตัว — เลือกแล้วมีผลกับโลก 3D ทันทีที่เปิดไมค์ครั้งถัดไป`
          : 'ไม่พบไมโครโฟนในเครื่องนี้';
      } catch (err) {
        note.textContent = 'เข้าถึงไมโครโฟนไม่ได้ — ตรวจสอบว่าอนุญาตสิทธิ์ไมค์ให้เว็บนี้แล้ว';
      }
    }

    sel.addEventListener('change', () => {
      try { localStorage.setItem(MIC_KEY, sel.value); } catch (e) {}
      note.textContent = '✅ บันทึกแล้ว';
    });
    container.querySelector('#wp-mic-detect').addEventListener('click', () => listDevices(true));
    listDevices(false); // ลองแสดงเท่าที่เห็นได้ก่อน (ถ้าเคยอนุญาตไว้แล้วจะเห็นชื่อเลย)
  }

  // ---------- ปุ่มควบคุม ----------
  function mountKeybinds(container) {
    let binds = loadBinds();
    let listeningFor = null;

    function render() {
      container.innerHTML =
        Object.keys(ACTIONS).map(a =>
          `<div class="wp-bind-row">
             <span class="wp-bind-label">${ACTIONS[a].label}</span>
             <button class="wp-bind-key${listeningFor === a ? ' listening' : ''}" data-action="${a}">${listeningFor === a ? 'กดปุ่มที่ต้องการ...' : keyLabel(binds[a])}</button>
           </div>`
        ).join('') +
        '<button id="wp-bind-reset" class="wp-btn" style="margin-top:10px;">คืนค่าปุ่มเริ่มต้น</button>' +
        '<div class="wp-note" id="wp-bind-note">คลิกที่ปุ่มด้านขวาแล้วกดปุ่มใหม่ที่ต้องการ</div>';

      container.querySelectorAll('.wp-bind-key').forEach(btn => {
        btn.addEventListener('click', () => { listeningFor = btn.dataset.action; render(); });
      });
      container.querySelector('#wp-bind-reset').addEventListener('click', () => {
        binds = {}; Object.keys(ACTIONS).forEach(a => { binds[a] = ACTIONS[a].def; });
        saveBinds(binds); listeningFor = null; render();
        container.querySelector('#wp-bind-note').textContent = '✅ คืนค่าปุ่มเริ่มต้นแล้ว';
      });
    }

    // ดักที่ระดับ window เพราะปุ่มที่กดอาจเป็นปุ่มที่เบราว์เซอร์ไม่ส่งให้ปุ่ม <button> โดยตรง
    window.addEventListener('keydown', e => {
      if (!listeningFor) return;
      e.preventDefault();
      if (e.key === 'Escape') { listeningFor = null; render(); return; }
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      // ปุ่มซ้ำกันไม่ได้ ไม่งั้นกดทีเดียวทำสองอย่างพร้อมกัน
      const clash = Object.keys(binds).find(a => a !== listeningFor && binds[a] === k);
      if (clash) {
        const note = container.querySelector('#wp-bind-note');
        listeningFor = null; render();
        const n2 = container.querySelector('#wp-bind-note');
        if (n2) n2.textContent = `⚠️ ปุ่ม ${keyLabel(k)} ถูกใช้กับ "${ACTIONS[clash].label}" อยู่แล้ว`;
        return;
      }
      binds[listeningFor] = k;
      saveBinds(binds);
      listeningFor = null;
      render();
    });

    render();
  }

  return { mountMic, mountKeybinds, loadBinds, getMicDeviceId, ACTIONS };
})();
