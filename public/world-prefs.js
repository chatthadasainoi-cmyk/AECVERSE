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
      '.wp-bind-key.listening{border-color:#22d3ee;color:#22d3ee;background:rgba(34,211,238,0.12);}',
      '.wp-meter{height:8px;border-radius:5px;background:var(--panel-2,#111826);border:1px solid var(--border,#1c2531);',
        'overflow:hidden;margin-top:9px;}',
      '.wp-meter i{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#facc15);',
        'transform:scaleX(0);transform-origin:left center;transition:transform .06s linear;}',
      '.wp-note.err{color:#fca5a5;}',
      '.wp-note.ok{color:#4ade80;}'
    ].join('');
    document.head.appendChild(s);
  })();

  // ---------- ไมโครโฟน ----------
  // บอกสาเหตุจริงของความล้มเหลว ไม่ใช่เหมารวมว่า "ไม่ได้รับอนุญาต"
  // (ต้องตรงกับ describeMicError ใน app.js — ผู้ใช้เจอปัญหาเดียวกันได้ทั้งสองที่)
  function micErrorText(err) {
    switch (err && err.name) {
      case 'NotAllowedError':
      case 'PermissionDeniedError':
        return 'เบราว์เซอร์บล็อกไมโครโฟนอยู่ — กดรูปกุญแจหน้า URL แล้วเปลี่ยนสิทธิ์ "ไมโครโฟน" เป็นอนุญาต จากนั้นรีเฟรชหน้า';
      case 'NotFoundError':
      case 'DevicesNotFoundError':
        return 'ไม่พบไมโครโฟนในเครื่องนี้ — เสียบไมค์หรือหูฟังที่มีไมค์แล้วกดตรวจหาใหม่';
      case 'NotReadableError':
      case 'TrackStartError':
        return 'ไมโครโฟนถูกโปรแกรมอื่นใช้อยู่ (เช่น Zoom / Teams / Discord) — ปิดโปรแกรมนั้นก่อน';
      case 'OverconstrainedError':
      case 'ConstraintNotSatisfiedError':
        return 'ไมโครโฟนตัวที่เลือกไว้ไม่มีอยู่แล้ว — เลือกตัวอื่นในรายการ';
      default:
        return 'เข้าถึงไมโครโฟนไม่ได้ (' + ((err && err.name) || 'ไม่ทราบสาเหตุ') + ')';
    }
  }

  function mountMic(container) {
    container.innerHTML =
      '<select id="wp-mic-select" class="wp-select"><option value="">ค่าเริ่มต้นของระบบ</option></select>' +
      '<button id="wp-mic-detect" class="wp-btn">🎙️ ตรวจหาไมโครโฟน</button>' +
      '<button id="wp-mic-test" class="wp-btn" style="margin-top:8px;">🔊 ทดสอบไมค์ (พูดแล้วดูแถบ)</button>' +
      '<div class="wp-meter"><i id="wp-mic-bar"></i></div>' +
      '<div id="wp-mic-note" class="wp-note">กด "ตรวจหาไมโครโฟน" เพื่อให้เบราว์เซอร์อนุญาต แล้วจะเห็นชื่ออุปกรณ์ทั้งหมด</div>';

    const sel = container.querySelector('#wp-mic-select');
    const note = container.querySelector('#wp-mic-note');
    const bar = container.querySelector('#wp-mic-bar');
    const testBtn = container.querySelector('#wp-mic-test');

    const setNote = (text, cls) => { note.textContent = text; note.className = 'wp-note' + (cls ? ' ' + cls : ''); };

    // ไม่ใช่ secure context = navigator.mediaDevices เป็น undefined ตั้งแต่แรก
    // ต้องบอกให้ตรงว่าเป็นเรื่อง https ไม่ใช่เรื่องสิทธิ์
    function mediaUnavailableReason() {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) return null;
      return window.isSecureContext
        ? 'เบราว์เซอร์นี้ไม่รองรับการเลือกอุปกรณ์เสียง'
        : 'หน้านี้ไม่ได้เปิดผ่าน https:// — เบราว์เซอร์จึงไม่ยอมให้ใช้ไมโครโฟน';
    }

    async function listDevices(askPermission) {
      const blocked = mediaUnavailableReason();
      if (blocked) { setNote(blocked, 'err'); return; }
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
        if (!devices.length) setNote('ไม่พบไมโครโฟนในเครื่องนี้', 'err');
        else if (!devices[0].label) setNote(`พบไมโครโฟน ${devices.length} ตัว แต่ยังไม่เห็นชื่อ — กด "ตรวจหาไมโครโฟน" เพื่ออนุญาตสิทธิ์ก่อน`);
        else setNote(`พบไมโครโฟน ${devices.length} ตัว — เลือกแล้วมีผลกับโลก 3D ทันที ไม่ต้องรีเฟรช`, 'ok');
      } catch (err) {
        setNote(micErrorText(err), 'err');
      }
    }

    // ---------- ทดสอบไมค์: เห็นแถบขยับ = ระบบรับเสียงได้จริง ----------
    // จุดสำคัญของการแก้ปัญหา "ไมค์ไม่ทำงาน" คือแยกให้ออกก่อนว่าเสียงเข้าเครื่องได้ไหม
    let testStream = null, testCtx = null, testRaf = 0;
    function stopTest() {
      if (testRaf) cancelAnimationFrame(testRaf);
      testRaf = 0;
      testStream?.getTracks().forEach(t => t.stop());
      try { testCtx?.close(); } catch (e) {}
      testStream = testCtx = null;
      bar.style.transform = 'scaleX(0)';
      testBtn.textContent = '🔊 ทดสอบไมค์ (พูดแล้วดูแถบ)';
    }
    async function startTest() {
      const blocked = mediaUnavailableReason();
      if (blocked) { setNote(blocked, 'err'); return; }
      try {
        const wanted = getMicDeviceId();
        testStream = await navigator.mediaDevices.getUserMedia({
          audio: wanted ? { deviceId: { exact: wanted } } : true
        });
        const Ctx = window.AudioContext || window.webkitAudioContext;
        testCtx = new Ctx();
        testCtx.resume && testCtx.resume();
        const analyser = testCtx.createAnalyser();
        analyser.fftSize = 512;
        // ไม่ต่อไป destination เด็ดขาด ไม่งั้นเสียงตัวเองจะย้อนออกลำโพงแล้วหอน
        testCtx.createMediaStreamSource(testStream).connect(analyser);
        const buf = new Uint8Array(analyser.frequencyBinCount);
        let sawSound = false;
        const track = testStream.getAudioTracks()[0];
        setNote(`กำลังฟังจาก "${track.label || 'ไมโครโฟนตัวเริ่มต้น'}" — ลองพูดดู แถบด้านบนต้องขยับ`);
        testBtn.textContent = '⏹ หยุดทดสอบ';
        const tick = () => {
          testRaf = requestAnimationFrame(tick);
          analyser.getByteTimeDomainData(buf);
          let peak = 0;
          for (let i = 0; i < buf.length; i++) peak = Math.max(peak, Math.abs(buf[i] - 128));
          const level = Math.min(1, (peak / 128) * 2.2);
          bar.style.transform = 'scaleX(' + level.toFixed(3) + ')';
          if (!sawSound && level > 0.08) {
            sawSound = true;
            setNote('✅ ได้ยินเสียงจากไมค์ตัวนี้แล้ว — ใช้งานในโลก 3D ได้เลย', 'ok');
          }
        };
        tick();
      } catch (err) {
        stopTest();
        setNote(micErrorText(err), 'err');
      }
    }
    testBtn.addEventListener('click', () => (testStream ? stopTest() : startTest()));
    // ออกจากหน้า/สลับแท็บทิ้งไว้ ต้องคืนไมค์ให้ระบบ ไม่งั้นไฟไมค์ค้างและแอปอื่นแย่งใช้ไม่ได้
    window.addEventListener('pagehide', stopTest);

    sel.addEventListener('change', () => {
      try { localStorage.setItem(MIC_KEY, sel.value); } catch (e) {}
      setNote('✅ บันทึกแล้ว — มีผลกับโลก 3D ทันที', 'ok');
      if (testStream) { stopTest(); startTest(); } // กำลังทดสอบอยู่ ให้ฟังตัวใหม่ต่อเลย
    });
    container.querySelector('#wp-mic-detect').addEventListener('click', () => listDevices(true));
    listDevices(false); // ลองแสดงเท่าที่เห็นได้ก่อน (ถ้าเคยอนุญาตไว้แล้วจะเห็นชื่อเลย)

    // เสียบ/ถอดไมค์ระหว่างเปิดหน้าอยู่ -> รีเฟรชรายการให้เอง
    navigator.mediaDevices?.addEventListener?.('devicechange', () => listDevices(false));
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
