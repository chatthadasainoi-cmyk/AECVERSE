/* ============================================================
   AEC VERSE — จัดหน้า General Settings เป็นหมวดพับเก็บได้
   เดิม Chat & Voice กับ AR & QR แยกเป็นแท็บบนสุดของตัวเอง ทั้งที่เป็น
   "ตั้งค่าทั่วไป" เหมือนกัน ผู้ใช้ต้องจำว่าของอยู่แท็บไหน

   ตอนนี้รวมมาไว้ใน General เป็นหัวข้อพับเก็บได้ กดแล้วค่อยกางดูของข้างใน
   ใช้แพตเทิร์นเดียวกับแผงข้างในโลก 3D (panel-sections.js)

   ย้ายด้วย appendChild ไม่ใช่ innerHTML — id, event listener และ reference
   ที่โค้ดหน้า Settings ถืออยู่จึงยังทำงานได้ทั้งหมด
   ============================================================ */
window.AecSettingsSections = (function () {

  const LS_KEY = 'aec_settings_sections_open';

  // การ์ดที่อยู่ใน General อยู่แล้ว — จับใส่หัวข้อพับเก็บได้เหมือนกัน
  // ไม่งั้นหน้าจะเป็นการ์ดยาวสองใบ แล้วตามด้วยหัวข้อพับได้อีกสองอัน ดูเป็นคนละระบบ
  // จับคู่ด้วยข้อความใน h3 เพราะการ์ดพวกนี้ไม่มี id
  const OWN = {
    'General Settings':    { icon: '⚙️', label: 'ตั้งค่าทั่วไป', open: true,
      hint: 'ชื่อระบบ ภาษา โซนเวลา และค่าพื้นฐานของทั้งระบบ' },
    'System Information': { icon: 'ℹ️', label: 'ข้อมูลระบบ', open: false,
      hint: 'เวอร์ชัน สถานะเซิร์ฟเวอร์ และรายละเอียดการติดตั้ง' }
  };

  // เอาแผงของแท็บไหนมารวมเป็นหมวดใน General บ้าง
  const MERGE = [
    { from: 'settings-panel-chatvoice', tab: 'chatvoice',
      icon: '💬', label: 'แชท & เสียงพูดคุย', open: false,
      hint: 'เปิด/ปิดแชทและไมค์ในโลก 3D · เลือกไมโครโฟน · ปุ่มควบคุม' },
    { from: 'settings-panel-sysconfig', tab: 'sysconfig',
      icon: '🥽', label: 'AR & QR Code', open: false,
      hint: 'สร้าง QR ให้สแกนดูโมเดลลอยในที่จริง' }
  ];

  function injectStyle() {
    if (document.getElementById('aec-settings-sections-style')) return;
    const s = document.createElement('style');
    s.id = 'aec-settings-sections-style';
    s.textContent = `
      .set-sec{border:1px solid var(--border);border-radius:11px;margin-top:14px;
        background:var(--panel);overflow:hidden;}
      .set-sec-h{display:flex;align-items:center;gap:11px;width:100%;padding:14px 16px;
        background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;color:var(--text-0);}
      .set-sec-h:hover{background:var(--panel-2);}
      .set-sec-h .si{font-size:17px;flex-shrink:0;line-height:1;}
      .set-sec-h .st{flex:1;min-width:0;}
      .set-sec-h .st b{display:block;font-size:13px;font-weight:800;}
      .set-sec-h .st span{display:block;font-size:11px;color:var(--text-2);margin-top:3px;line-height:1.5;}
      .set-sec-h .sc{flex-shrink:0;color:var(--text-2);font-size:11px;transition:transform .18s;}
      .set-sec.open>.set-sec-h .sc{transform:rotate(180deg);}
      .set-sec-c{display:none;padding:0 16px 16px;}
      .set-sec.open>.set-sec-c{display:block;}
      /* การ์ดข้างในไม่ต้องมีกรอบซ้อนกรอบอีกชั้น */
      .set-sec-c .card{border:none;padding-left:0;padding-right:0;background:transparent;}
      .set-sec-c .grid{gap:14px;}
      @media (prefers-reduced-motion: reduce){ .set-sec-h .sc{transition:none;} }
    `;
    document.head.appendChild(s);
  }

  const loadOpen = () => { try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); } catch (e) { return {}; } };
  const saveOpen = m => { try { localStorage.setItem(LS_KEY, JSON.stringify(m)); } catch (e) { /* โหมดส่วนตัว */ } };

  // สร้างกล่องหัวข้อหนึ่งอัน แล้วคืนที่ว่างข้างในให้ผู้เรียกเอาของไปใส่
  function makeSection(key, m, openMap) {
    const isOpen = key in openMap ? !!openMap[key] : !!m.open;
    const sec = document.createElement('div');
    sec.className = 'set-sec' + (isOpen ? ' open' : '');
    sec.innerHTML = `<button class="set-sec-h" type="button" aria-expanded="${isOpen}">
        <span class="si"></span><span class="st"><b></b><span></span></span><span class="sc">▼</span>
      </button><div class="set-sec-c"></div>`;
    sec.querySelector('.si').textContent = m.icon;
    sec.querySelector('.st b').textContent = m.label;
    sec.querySelector('.st span').textContent = m.hint || '';
    const head = sec.querySelector('.set-sec-h');
    head.addEventListener('click', () => {
      const now = !sec.classList.contains('open');
      sec.classList.toggle('open', now);
      head.setAttribute('aria-expanded', String(now));
      const map = loadOpen(); map[key] = now; saveOpen(map);
    });
    return sec;
  }

  function init() {
    const general = document.getElementById('settings-panel-general');
    if (!general || general.dataset.sectioned === '1') return;

    // ถ้าหาแผงไหนไม่เจอ แปลว่า markup เปลี่ยนไปแล้ว — ไม่แตะอะไรเลย
    // ดีกว่าย้ายไปได้ครึ่งเดียวแล้วผู้ใช้หาของไม่เจอทั้งสองที่
    const found = MERGE.map(m => document.getElementById(m.from));
    if (found.some(el => !el)) {
      console.warn('[SETTINGS] ข้ามการจัดหมวด — หาแผงไม่ครบ',
        MERGE.map((m, i) => m.from + ':' + !!found[i]));
      return;
    }

    injectStyle();
    const openMap = loadOpen();

    // การ์ดที่อยู่ใน General มาแต่เดิม
    // การ์ดพวกนี้ไม่ได้เป็นลูกตรงของแผง แต่อยู่ในกริดสองคอลัมน์อีกชั้น จึงต้องหาแบบไม่จำกัดความลึก
    // เก็บรายการไว้ก่อนแล้วค่อยย้าย เพราะการย้ายทำให้รายการลูกเปลี่ยนระหว่างวน
    const wrappers = new Set();
    [...general.querySelectorAll('.card')].forEach(card => {
      const h3 = card.querySelector('.card-head h3');
      const m = h3 && OWN[h3.textContent.trim()];
      if (!m) return;                      // การ์ดที่ไม่รู้จัก ปล่อยไว้ที่เดิม ดีกว่าเดาแล้วซ่อนผิดตัว
      if (card.parentElement !== general) wrappers.add(card.parentElement);
      const key = 'own:' + h3.textContent.trim();
      const sec = makeSection(key, m, openMap);
      general.appendChild(sec);
      sec.querySelector('.set-sec-c').appendChild(card);   // ย้ายทั้งใบ ไม่แตะข้างใน
      card.querySelector('.card-head').style.display = 'none';  // หัวข้อย้ายขึ้นไปอยู่บนแถบแล้ว
    });
    // กริดที่ของถูกย้ายออกไปหมดแล้วจะเหลือเป็นช่องว่างเปล่าคั่นกลาง
    wrappers.forEach(w => { if (!w.children.length) w.remove(); });

    MERGE.forEach((m, i) => {
      const panel = found[i];
      const key = m.from;
      const sec = makeSection(key, m, openMap);
      const content = sec.querySelector('.set-sec-c');
      // ย้ายลูกของแผงเดิมเข้ามา (ตัวแผงเองยังอยู่ในหน้า แต่ว่างเปล่าและซ่อนไว้
      // เผื่อโค้ดที่อื่นยัง getElementById หามันอยู่ จะได้ไม่ได้ null)
      while (panel.firstChild) content.appendChild(panel.firstChild);
      panel.style.display = 'none';

      general.appendChild(sec);

      // แท็บบนสุดของหัวข้อที่ย้ายมาแล้วไม่ต้องมี — ของอยู่ใน General หมดแล้ว
      const tab = document.querySelector(`.tab[data-tab="${m.tab}"]`);
      if (tab) tab.remove();
    });

    general.dataset.sectioned = '1';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { init };
})();
