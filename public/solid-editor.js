/* ============================================================
   AEC VERSE — ตั้งชิ้นส่วนให้ "ตัน" (เดินทะลุไม่ได้)
   เดิมโลก 3D เดินทะลุได้ทุกอย่าง กำแพงกับท่อจึงไม่ต่างจากอากาศ

   ทำอัตโนมัติทั้งหมดไม่ได้ เพราะไฟล์โมเดลไม่ได้บอกว่าชิ้นไหนคือของแข็งที่ต้องกั้น
   ชิ้นไหนคือพื้นผิวประดับ (ลานหญ้า ผิวน้ำ เส้นบอกแนว) — เดาผิดแล้วผู้ใช้จะติดกำแพง
   ล่องหนกลางที่โล่งโดยไม่รู้สาเหตุ ซึ่งแย่กว่าการเดินทะลุ

   จึงให้ admin เป็นคนเลือก แต่ไม่ต้องเลือกทีละชิ้นจาก 1,959 ชิ้น — เลือกได้ทั้ง
   "กลุ่มที่สีเดียวกัน" (กลุ่มสีเทาทั้งหมดคือคลิกเดียว) และ "ทั้งประเภทเดียวกัน"

   ต้องใช้ร่วมกับ app.js — อ้างถึงตัวแปรของมันตรงๆ (factoryModel, solidParts, ...)
   จึงต้องโหลดไฟล์นี้ต่อจาก app.js เสมอ
   ============================================================ */
window.AecSolidEditor = (function () {

  let box = null, targetMesh = null;

  function injectStyle() {
    if (document.getElementById('aec-solid-style')) return;
    const s = document.createElement('style');
    s.id = 'aec-solid-style';
    s.textContent = `
      #solid-ov{position:fixed;inset:0;background:rgba(4,7,12,.8);z-index:10001;
        display:flex;align-items:center;justify-content:center;padding:16px;}
      #solid-card{background:var(--panel,#0e131c);border:1px solid var(--border,#1c2531);
        border-radius:14px;width:min(460px,100%);max-height:calc(100vh - 32px);overflow-y:auto;
        color:var(--text-0,#eef2f7);font-size:13px;box-shadow:0 24px 64px rgba(0,0,0,.6);}
      .sld-h{display:flex;align-items:center;gap:9px;padding:13px 15px;
        border-bottom:1px solid var(--border-soft,#161d29);}
      .sld-h b{font-size:13.5px;font-weight:800;}
      .sld-h .sub{font-size:10.5px;color:var(--text-2,#657182);margin-top:2px;display:block;}
      .sld-x{margin-left:auto;background:none;border:none;color:var(--text-2,#657182);
        font-size:17px;cursor:pointer;line-height:1;}
      .sld-b{padding:13px 15px 15px;}
      .sld-row{display:flex;align-items:center;gap:10px;padding:10px 11px;border-radius:10px;
        border:1px solid var(--border,#1c2531);background:var(--panel-2,#111826);margin-bottom:10px;}
      .sld-row .t{flex:1;min-width:0;}
      .sld-row .t b{display:block;font-size:12.5px;font-weight:700;}
      .sld-row .t span{display:block;font-size:10.5px;color:var(--text-2,#657182);
        margin-top:3px;line-height:1.55;}
      .sld-sw{width:40px;height:22px;border-radius:99px;background:#374151;position:relative;
        cursor:pointer;flex-shrink:0;border:none;transition:background .15s;}
      .sld-sw::after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;
        border-radius:50%;background:#fff;transition:transform .15s;}
      .sld-sw.on{background:var(--green,#22c55e);}
      .sld-sw.on::after{transform:translateX(18px);}
      .sld-lab{display:flex;justify-content:space-between;align-items:baseline;gap:8px;
        font-size:12px;font-weight:600;margin-bottom:6px;}
      .sld-lab .v{font-weight:800;color:var(--blue,#3b82f6);}
      .sld-b input[type=range]{width:100%;}
      .sld-hint{font-size:10.5px;color:var(--text-2,#657182);line-height:1.6;margin-top:5px;}
      .sld-scope{display:flex;flex-direction:column;gap:7px;margin:12px 0 4px;}
      .sld-sc{display:flex;align-items:center;gap:9px;padding:10px 11px;border-radius:10px;
        border:1px solid var(--border,#1c2531);background:var(--panel-2,#111826);cursor:pointer;
        font-family:inherit;text-align:left;color:inherit;width:100%;}
      .sld-sc.sel{border-color:var(--blue,#3b82f6);background:var(--blue-soft,rgba(59,130,246,.12));}
      .sld-sc .dot{width:14px;height:14px;border-radius:50%;flex-shrink:0;
        border:1px solid rgba(255,255,255,.25);}
      .sld-sc .n{flex:1;min-width:0;font-size:12px;font-weight:700;}
      .sld-sc .c{font-size:10.5px;color:var(--text-2,#657182);flex-shrink:0;}
      .sld-act{display:flex;gap:8px;margin-top:14px;}
      .sld-act button{flex:1;padding:10px;border-radius:9px;border:none;cursor:pointer;
        font-family:inherit;font-size:12px;font-weight:800;}
      .sld-go{background:var(--blue,#3b82f6);color:#fff;}
      .sld-no{background:var(--panel-2,#111826);border:1px solid var(--border,#1c2531)!important;
        color:var(--text-1,#9aa7b8);}
      .sld-sum{font-size:11px;color:var(--text-2,#657182);line-height:1.6;margin-top:11px;
        padding-top:11px;border-top:1px solid var(--border-soft,#161d29);}
    `;
    document.head.appendChild(s);
  }

  const nameOf = m => (m && (m._original3DName || m.name)) || '';

  // สีของชิ้นส่วน — ใช้วัสดุต้นฉบับเสมอ ไม่ใช่วัสดุที่แสดงอยู่ตอนนั้น
  // เพราะชิ้นที่กำลังถูกไฮไลท์อยู่จะเป็นสีฟ้าชั่วคราว ถ้าอ่านจากตรงนั้นจะจัดกลุ่มผิด
  function colorOf(mesh) {
    const orig = (typeof originalMaterials !== 'undefined') && originalMaterials.get(mesh.uuid);
    const mat = orig || mesh.material;
    const m = Array.isArray(mat) ? mat[0] : mat;
    return (m && m.color) ? m.color.getHex() : 0x888888;
  }

  // จัดกลุ่มชิ้นส่วนทั้งโมเดลตามสี — "กลุ่มสีเทา" ที่ผู้ใช้เห็นก็คือกลุ่มหนึ่งในนี้
  function groupsByColor() {
    const map = new Map();
    if (typeof factoryModel === 'undefined' || !factoryModel) return map;
    factoryModel.traverse(child => {
      if (!child.isMesh) return;
      const c = colorOf(child);
      if (!map.has(c)) map.set(c, []);
      map.get(c).push(child);
    });
    return map;
  }

  function sameTypeMeshes(mesh) {
    const key = typeof resolveTypeKey === 'function' ? resolveTypeKey(mesh, mesh.name) : null;
    if (!key || typeof factoryModel === 'undefined' || !factoryModel) return [];
    const out = [];
    factoryModel.traverse(child => {
      if (child.isMesh && resolveTypeKey(child, child.name) === key) out.push(child);
    });
    return out;
  }

  function close() {
    if (box) box.remove();
    box = null; targetMesh = null;
  }

  function open(mesh) {
    if (!mesh) return;
    if (typeof canEditData === 'function' && !canEditData()) return;
    injectStyle();
    close();
    targetMesh = mesh;

    const key = nameOf(mesh);
    const cur = solidParts[key];
    const isOn = typeof cur === 'number';
    const startPad = isOn ? cur : 0.1;
    const isGround = !!groundParts[key];

    const colorGroup = groupsByColor().get(colorOf(mesh)) || [mesh];
    const typeGroup = sameTypeMeshes(mesh);
    const hex = '#' + colorOf(mesh).toString(16).padStart(6, '0');

    box = document.createElement('div');
    box.id = 'solid-ov';
    box.innerHTML = `
      <div id="solid-card">
        <div class="sld-h">
          <span style="font-size:19px;line-height:1;">🧱</span>
          <div style="flex:1;min-width:0;">
            <b>ตั้งให้เดินทะลุไม่ได้</b>
            <span class="sub">${key || 'ชิ้นส่วนที่เลือกอยู่'}</span>
          </div>
          <button class="sld-x" data-x aria-label="ปิด">✕</button>
        </div>
        <div class="sld-b">
          <div class="sld-row">
            <div class="t">
              <b>ตัน — เดินชนแล้วผ่านไม่ได้</b>
              <span>ปิดไว้ = เดินทะลุได้เหมือนเดิม แต่ยังกดดูข้อมูลได้ตามปกติ</span>
            </div>
            <button class="sld-sw${isOn ? ' on' : ''}" data-sw aria-label="เปิด/ปิด"></button>
          </div>

          <div class="sld-row">
            <div class="t">
              <b>พื้นสำหรับเดิน</b>
              <span>ชี้ว่าชิ้นนี้คือพื้น ระบบจะใช้ความสูงของมันเป็นระดับที่ตัวละครยืน
                แก้อาการเดินแล้วจมพื้นหรือลอยเหนือพื้น</span>
            </div>
            <button class="sld-sw${isGround ? ' on' : ''}" data-gsw aria-label="เปิด/ปิด"></button>
          </div>

          <div data-padwrap style="${isOn ? '' : 'opacity:.45;pointer-events:none;'}">
            <div class="sld-lab"><span>ระยะกันชนรอบชิ้น</span><span class="v" data-padv></span></div>
            <input type="range" min="0" max="1.5" step="0.05" value="${startPad}" data-pad>
            <div class="sld-hint">0 = ชนพอดีขอบของโมเดล · ค่ามากขึ้นคือกันให้ห่างขึ้น
              เหมาะกับท่อบางๆ ที่ถ้าชนพอดีขอบแล้วตัวละครจะแทรกเข้าไปดูเหมือนทะลุ</div>
          </div>

          <div class="sld-scope" data-scope>
            <button class="sld-sc sel" data-mode="one">
              <span class="dot" style="background:${hex};"></span>
              <span class="n">เฉพาะชิ้นนี้</span><span class="c">1 ชิ้น</span>
            </button>
            <button class="sld-sc" data-mode="color">
              <span class="dot" style="background:${hex};"></span>
              <span class="n">ทุกชิ้นที่สีเดียวกัน</span><span class="c">${colorGroup.length} ชิ้น</span>
            </button>
            ${typeGroup.length > 1 ? `<button class="sld-sc" data-mode="type">
              <span class="dot" style="background:${hex};"></span>
              <span class="n">ทุกชิ้นที่เป็นประเภทเดียวกัน</span><span class="c">${typeGroup.length} ชิ้น</span>
            </button>` : ''}
          </div>

          <div class="sld-act">
            <button class="sld-go" data-go>ใช้กับ <span data-count>1</span> ชิ้น</button>
            <button class="sld-no" data-x>ยกเลิก</button>
          </div>
          <div class="sld-sum" data-sum></div>
        </div>
      </div>`;
    document.body.appendChild(box);

    let on = isOn, ground = isGround, mode = 'one';
    const el = q => box.querySelector(q);
    const padIn = el('[data-pad]');

    const targetsFor = m => m === 'color' ? colorGroup : m === 'type' ? typeGroup : [mesh];
    const paint = () => {
      el('[data-padv]').textContent = Number(padIn.value).toFixed(2) + ' ม.';
      el('[data-padwrap]').style.cssText = on ? '' : 'opacity:.45;pointer-events:none;';
      el('[data-sw]').classList.toggle('on', on);
      el('[data-gsw]').classList.toggle('on', ground);
      const n = targetsFor(mode).length;
      el('[data-count]').textContent = n;
      el('[data-go]').firstChild.textContent = on ? 'ตั้งให้ตัน ' : 'ยกเลิกความตันของ ';
      const total = Object.keys(solidParts).length;
      el('[data-sum]').textContent = `ตอนนี้ทั้งโมเดลมีชิ้นที่ตันอยู่ ${total} ชิ้น` +
        (on ? ` — กดแล้วจะเป็น ${total + targetsFor(mode).filter(t => !(nameOf(t) in solidParts)).length} ชิ้น` : '');
    };

    el('[data-sw]').addEventListener('click', () => { on = !on; paint(); });
    el('[data-gsw]').addEventListener('click', () => { ground = !ground; paint(); });
    padIn.addEventListener('input', paint);
    box.querySelectorAll('[data-mode]').forEach(b => b.addEventListener('click', () => {
      mode = b.dataset.mode;
      box.querySelectorAll('[data-mode]').forEach(x => x.classList.toggle('sel', x === b));
      paint();
    }));
    box.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', close));
    box.addEventListener('click', e => { if (e.target === box) close(); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape' && box) { close(); document.removeEventListener('keydown', esc); }
    });

    el('[data-go]').addEventListener('click', () => {
      // ส่งเป็นรายชื่อชุดเดียว ไม่ยิงทีละชิ้น — เลือกทั้งกลุ่มสีทีหนึ่งเป็นพันชิ้นได้
      const keys = [...new Set(targetsFor(mode).map(nameOf).filter(Boolean))];
      const pad = Number(padIn.value) || 0;
      if (!keys.length) { close(); return; }
      const send = (kind, flag) => {
        if (typeof mpSocket !== 'undefined' && mpSocket && mpSocket.connected) {
          mpSocket.emit('set_solid', { keys, pad, on: flag, kind });
        }
      };
      send('solid', on);
      // ส่งเรื่องพื้นเฉพาะตอนที่ค่าเปลี่ยนจริง จะได้ไม่ไปทับค่าของชิ้นอื่นในกลุ่มโดยไม่ตั้งใจ
      if (ground !== isGround) send('ground', ground);
      // ทำให้เห็นผลทันทีในเครื่องตัวเอง ไม่ต้องรอ server ตอบกลับ
      keys.forEach(k => { if (on) solidParts[k] = pad; else delete solidParts[k]; });
      if (ground !== isGround) keys.forEach(k => { if (ground) groundParts[k] = true; else delete groundParts[k]; });
      if (typeof buildColliders === 'function') buildColliders();
      refresh();
      close();
    });

    paint();
  }

  // อัปเดตหน้าตาปุ่มในแผงข้อมูลให้ตรงกับสถานะจริงของชิ้นที่เลือกอยู่
  function refresh() {
    const btn = document.getElementById('btn-solid');
    if (!btn) return;
    const canEdit = typeof canEditData !== 'function' || canEditData();
    const sel = (typeof selection !== 'undefined') && selection.uuid;
    btn.style.display = (canEdit && sel) ? '' : 'none';
    if (!sel) return;
    const col = (typeof colliderByUuid !== 'undefined') && colliderByUuid.get(selection.uuid);
    const key = col ? col.nameKey : '';
    const on = key && (key in solidParts);
    btn.textContent = on ? '🧱 ตันอยู่' : '🧱 ตั้งเป็นตัน';
    btn.style.background = on ? 'rgba(34,197,94,0.14)' : 'rgba(148,163,184,0.14)';
    btn.style.borderColor = on ? 'rgba(34,197,94,0.4)' : 'rgba(148,163,184,0.35)';
    btn.style.color = on ? 'var(--green)' : 'var(--text-1)';
  }

  function openForActive() {
    if (typeof selection === 'undefined' || !selection.uuid) return;
    const col = (typeof colliderByUuid !== 'undefined') && colliderByUuid.get(selection.uuid);
    if (col) open(col.mesh);
  }

  return { open, openForActive, refresh, close };
})();

// app.js เรียกตัวนี้หลังอัปเดตข้อมูล — เผื่อไฟล์นี้โหลดไม่สำเร็จก็ไม่ทำให้ทั้งแอปพัง
function refreshSolidUI() {
  if (window.AecSolidEditor) window.AecSolidEditor.refresh();
}
window.openSolidEditor = () => window.AecSolidEditor && window.AecSolidEditor.openForActive();
