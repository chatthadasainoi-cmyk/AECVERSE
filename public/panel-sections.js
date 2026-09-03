/* ============================================================
   AEC VERSE — จัดแผงข้างเป็นหมวดหมู่พับเก็บได้
   เดิมแต่ละแผงเป็นรายการยาวเลื่อนไม่จบ ต้องกวาดตาหาของที่ต้องการเอง
   ตัวนี้ยุบแต่ละหมวดเหลือแถบบรรทัดเดียว กดลูกศรถึงกางออกมา

   ทำงานกับ DOM ที่มีอยู่เดิมโดยไม่แตะ markup: ย้าย node เข้าไปในกล่องใหม่
   ด้วย appendChild (ไม่ใช่ innerHTML) — id, event listener และ reference
   ที่ app.js ถืออยู่จึงยังใช้ได้ทั้งหมด

   หมวดที่เนื้อในถูกซ่อนหมดตามสิทธิ์ผู้ใช้ (refreshRoleUi ซ่อน
   #model-upload-section / #scene-io-section / #model-transform-section)
   จะถูกซ่อนทั้งแถบให้เอง ไม่เหลือหัวข้อว่างๆ ค้างอยู่
   ============================================================ */
window.AecPanelSections = (function () {

  const LS_KEY = 'aec_panel_sections_open';

  // start = จุดเริ่มของหมวด อ้างจาก id ที่มีอยู่แล้วใน markup (ทนต่อการแก้ layout
  // มากกว่าการนับลำดับลูก) — ทุก node ตั้งแต่จุดนั้นจนถึงจุดเริ่มของหมวดถัดไปคือของหมวดนี้
  const PANELS = {
    'dashboard': [
      { icon: '⬆️', label: 'อัปโหลดโมเดล 3D', start: { id: 'model-upload-section' }, open: false },
      { icon: '📚', label: 'คลังโมเดล', hint: 'โมเดลที่เคยอัปโหลดไว้ เลือกแล้วโหลดได้เลย ไม่ต้องอัปโหลดซ้ำ',
        start: { contains: 'model-library-list' }, open: true,
        sub: c => { const n = c.querySelectorAll('#model-library-list > .mlr-item').length; return n ? n + ' ไฟล์' : ''; } },
      { icon: '💾', label: 'เซฟ / โหลดฉาก', start: { id: 'scene-io-section' }, open: false }
    ],
    'transform-panel': [
      { icon: '🛠️', label: 'ปรับตำแหน่งโมเดล', start: { id: 'model-transform-section' }, open: true },
      { icon: '🧊', label: 'โหมดแสดงผลพื้นผิว', start: { contains: 'mode-solid' }, open: true },
      { icon: '🗑️', label: 'ลบโมเดลออกจากฉาก', start: { contains: 'btn-delete-model' }, open: false }
    ],
    'safety-panel': [
      { icon: '🛡️', label: 'ชั้นข้อมูล', hint: 'ติ๊กเพื่อเปิด/ปิดชั้นข้อมูลความปลอดภัยที่วาดทับบนโมเดล',
        start: { contains: 'layer-exzone' }, open: true,
        sub: c => { const b = c.querySelectorAll('input[type=checkbox]'); const on = [...b].filter(x => x.checked).length;
                    return b.length ? on + '/' + b.length : ''; } },
      { icon: '📐', label: 'เครื่องมือ & ปักจุด', start: { labelText: 'เครื่องมือตรวจสอบ' }, open: true }
    ]
  };

  let styled = false;
  function injectStyle() {
    if (styled) return; styled = true;
    const s = document.createElement('style');
    s.textContent = `
      .pnl-sec{border:1px solid var(--border);border-radius:9px;margin-bottom:7px;
        background:var(--panel-2);overflow:hidden;}
      .pnl-sec:last-child{margin-bottom:0;}
      .pnl-sec-h{display:flex;align-items:center;gap:8px;width:100%;padding:9px 10px;
        background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;
        font-size:11.5px;font-weight:700;color:var(--text-1);letter-spacing:.2px;line-height:1.35;}
      .pnl-sec-h:hover{color:var(--text-0);}
      .pnl-sec.open>.pnl-sec-h{color:var(--text-0);}
      .pnl-sec-h .pi{font-size:13px;flex-shrink:0;line-height:1;}
      .pnl-sec-h .pt{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .pnl-sec-h .ps{font-size:10px;color:var(--text-2);font-weight:700;flex-shrink:0;
        background:var(--panel);border:1px solid var(--border);border-radius:20px;padding:1px 7px;}
      .pnl-sec-h .pc{flex-shrink:0;color:var(--text-2);font-size:9px;transition:transform .18s;}
      .pnl-sec.open>.pnl-sec-h .pc{transform:rotate(180deg);}
      .pnl-sec-c{display:none;padding:2px 10px 10px;}
      .pnl-sec.open>.pnl-sec-c{display:block;}
      /* ป้ายหัวข้อเดิมที่ถูกยกขึ้นไปเป็นชื่อแถบแล้ว ไม่ต้องแสดงซ้ำข้างใน */
      .pnl-sec-c > .pnl-title-used{display:none !important;}
      @media (prefers-reduced-motion: reduce){ .pnl-sec-h .pc{transition:none;} }
    `;
    document.head.appendChild(s);
  }

  function loadOpen() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (err) { return {}; }
  }
  function saveOpen(map) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(map)); } catch (err) { /* โหมดส่วนตัวเขียนไม่ได้ ไม่เป็นไร */ }
  }

  // หา index ของลูกที่เป็นจุดเริ่มของหมวด
  function findStart(kids, start) {
    return kids.findIndex(el => {
      if (start.id) return el.id === start.id;
      if (start.contains) return el.id === start.contains || !!el.querySelector('#' + CSS.escape(start.contains));
      if (start.labelText) return el.classList.contains('section-label') && el.textContent.trim() === start.labelText;
      return false;
    });
  }

  function buildPanel(panelId, specs, openMap) {
    const panel = document.getElementById(panelId);
    if (!panel || panel.dataset.sectioned === '1') return;

    const head = panel.querySelector(':scope > .panel-head');
    let kids = [...panel.children].filter(el => el !== head);

    // หาจุดเริ่มของทุกหมวดก่อน ถ้ามีหมวดไหนหาไม่เจอแปลว่า markup เปลี่ยนไปแล้ว
    // -> ไม่แตะแผงนั้นเลย ดีกว่าจัดผิดแล้วผู้ใช้หาปุ่มไม่เจอ
    const starts = specs.map(sp => findStart(kids, sp.start));
    if (starts.some(i => i < 0)) {
      console.warn('[PANEL] ข้ามแผง', panelId, '— หาจุดเริ่มของหมวดไม่ครบ', specs.map((s, i) => s.label + ':' + starts[i]));
      return;
    }

    const built = [];
    specs.forEach((sp, i) => {
      const from = starts[i];
      const to = i + 1 < starts.length ? starts[i + 1] : kids.length;
      const nodes = kids.slice(from, to).filter(el => !el.classList.contains('hr')); // เส้นคั่นเดิมไม่ต้องแล้ว แถบคั่นให้อยู่
      if (!nodes.length) return;

      const key = panelId + ':' + i;
      const isOpen = key in openMap ? !!openMap[key] : !!sp.open;

      const sec = document.createElement('div');
      sec.className = 'pnl-sec' + (isOpen ? ' open' : '');
      sec.innerHTML = `<button class="pnl-sec-h" type="button" aria-expanded="${isOpen}">
          <span class="pi"></span><span class="pt"></span><span class="ps"></span><span class="pc">▼</span>
        </button><div class="pnl-sec-c"></div>`;
      sec.querySelector('.pi').textContent = sp.icon;
      sec.querySelector('.pt').textContent = sp.label;
      const content = sec.querySelector('.pnl-sec-c');
      nodes.forEach(n => content.appendChild(n));   // ย้าย ไม่ใช่ copy — listener/id ยังอยู่ครบ

      // ป้ายหัวข้อเดิมกลายเป็นชื่อแถบแล้ว ซ่อนตัวที่ซ้ำทิ้ง (เฉพาะตัวบนสุด ไม่แตะป้ายย่อยข้างใน)
      // ⚠️ ต้องทำก่อนแทรก hint — ไม่งั้น firstElementChild จะกลายเป็น hint แล้วหาป้ายเดิมไม่เจอ
      const first = content.firstElementChild;
      if (first) {
        if (first.classList.contains('section-label')) first.classList.add('pnl-title-used');
        else {
          const inner = first.querySelector(':scope > .section-label');
          if (inner) inner.style.display = 'none';
        }
      }

      // ชื่อแถบต้องสั้นพอไม่ตัดบรรทัด คำอธิบายที่เดิมต่อท้ายป้ายหัวข้อจึงย้ายลงมาไว้ข้างใน
      if (sp.hint) {
        const h = document.createElement('div');
        h.className = 'hint-text';
        h.style.margin = '0 0 7px';
        h.textContent = sp.hint;
        content.insertBefore(h, content.firstChild);
      }

      const headBtn = sec.querySelector('.pnl-sec-h');
      headBtn.addEventListener('click', () => {
        const nowOpen = !sec.classList.contains('open');
        sec.classList.toggle('open', nowOpen);
        headBtn.setAttribute('aria-expanded', String(nowOpen));
        const m = loadOpen(); m[key] = nowOpen; saveOpen(m);
      });

      panel.appendChild(sec);
      built.push({ sec, content, sub: sp.sub });
    });

    // เส้นคั่นเดิมที่ไม่ได้ถูกดูดเข้าหมวดไหน (เช่นอยู่ก่อนหมวดแรก) — เก็บทิ้ง
    kids.forEach(el => { if (el.classList.contains('hr') && el.parentElement === panel) el.remove(); });

    panel.dataset.sectioned = '1';
    return built;
  }

  // หมวดที่เนื้อในโดนซ่อนหมด (สิทธิ์ผู้ใช้) ต้องซ่อนทั้งแถบ + อัปเดตตัวเลขบนหัวแถบ
  function watch(built) {
    const sync = () => built.forEach(({ sec, content, sub }) => {
      const visible = [...content.children].some(c => getComputedStyle(c).display !== 'none');
      sec.style.display = visible ? '' : 'none';
      if (sub) { try { sec.querySelector('.ps').textContent = sub(content) || ''; } catch (err) { /* ไม่ให้ล้มทั้งแผง */ } }
    });
    sync();
    const mo = new MutationObserver(sync);
    built.forEach(({ content }) => {
      mo.observe(content, { attributes: true, attributeFilter: ['style', 'class'], childList: true, subtree: true });
      // ติ๊ก checkbox เปลี่ยนแค่ property .checked ไม่แตะ attribute — MutationObserver จึงไม่เห็นเลย
      // ตัวเลขบนหัวแถบเคยค้างที่ค่าตอนโหลดตลอดเพราะเหตุนี้ ต้องดัก event ตรงๆ (change/input bubble ขึ้นมาถึงตรงนี้)
      content.addEventListener('change', sync);
      content.addEventListener('input', sync);
    });
    // สิทธิ์มาถึงช้ากว่า DOM — กวาดซ้ำอีกสองสามรอบตอนเริ่ม เผื่อ observer ยังไม่ทันเห็นการเปลี่ยน
    [200, 800, 2500].forEach(ms => setTimeout(sync, ms));
    return sync;
  }

  let syncAll = () => {};
  function init() {
    injectStyle();
    const openMap = loadOpen();
    const all = [];
    Object.entries(PANELS).forEach(([id, specs]) => {
      const built = buildPanel(id, specs, openMap);
      if (built && built.length) all.push(...built);
    });
    if (all.length) syncAll = watch(all);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { init, refresh: () => syncAll() };
})();
