/* ============================================================
   AEC VERSE — หัวข้อพับเก็บได้ (ใช้ซ้ำได้ทุกหน้า)
   แพตเทิร์นเดียวกับแผงข้างในโลก 3D และหน้า Settings: หัวข้อใหญ่กดย่อ/กางได้
   ข้างในเป็นรายการย่อย ผู้ใช้จึงเจอข้อมูลทีละก้อน ไม่ใช่กำแพงยาวทั้งหน้า

   ย้าย element ที่มีอยู่แล้วเข้าไปด้วย appendChild (ไม่ใช่ innerHTML)
   id, event listener และ reference ที่โค้ดอื่นถืออยู่จึงยังใช้ได้ทั้งหมด

   วิธีใช้:
     AecCollapseGroup.build(host, [
       { key:'mine', icon:'✨', label:'ร่างของฉัน', open:true, nodes:[el1, el2] },
       ...
     ], { storeKey: 'aec_avatar_groups' });
   ============================================================ */
window.AecCollapseGroup = (function () {

  function injectStyle() {
    if (document.getElementById('aec-cg-style')) return;
    const s = document.createElement('style');
    s.id = 'aec-cg-style';
    s.textContent = `
      .cg{border:1px solid var(--border);border-radius:10px;margin-bottom:8px;
        background:var(--panel-2);overflow:hidden;}
      .cg:last-child{margin-bottom:0;}
      .cg-h{display:flex;align-items:center;gap:9px;width:100%;padding:11px 12px;
        background:none;border:none;cursor:pointer;font-family:inherit;text-align:left;
        color:var(--text-1);font-size:12px;font-weight:700;line-height:1.4;}
      .cg-h:hover{color:var(--text-0);}
      .cg.open>.cg-h{color:var(--text-0);}
      .cg-h .cg-i{font-size:14px;flex-shrink:0;line-height:1;}
      .cg-h .cg-t{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
      .cg-h .cg-n{flex-shrink:0;font-size:10px;font-weight:800;color:var(--text-2);
        background:var(--panel);border:1px solid var(--border);border-radius:20px;padding:1px 8px;}
      .cg-h .cg-c{flex-shrink:0;color:var(--text-2);font-size:9px;transition:transform .18s;}
      .cg.open>.cg-h .cg-c{transform:rotate(180deg);}
      .cg-b{display:none;padding:0 10px 10px;}
      .cg.open>.cg-b{display:block;}
      .cg-empty{font-size:11px;color:var(--text-2);line-height:1.6;padding:6px 2px;}
      @media (prefers-reduced-motion: reduce){ .cg-h .cg-c{transition:none;} }
    `;
    document.head.appendChild(s);
  }

  const load = k => { try { return JSON.parse(localStorage.getItem(k) || '{}'); } catch (e) { return {}; } };
  const save = (k, m) => { try { localStorage.setItem(k, JSON.stringify(m)); } catch (e) { /* โหมดส่วนตัว */ } };

  // host   = element ที่จะเอากลุ่มไปวาง (เนื้อในเดิมจะไม่ถูกลบ ย้ายเข้ากลุ่มเท่านั้น)
  // groups = [{ key, icon, label, nodes:[], open, empty, count }]
  //   count: false = ไม่ต้องโชว์ตัวเลข (บางหมวดนับจำนวนแล้วไม่มีความหมาย เช่น กล่องสีกล่องเดียว)
  //   countNode  = ให้นับลูกของ element นี้แทน ใช้เมื่อของจริงอยู่ในกล่องครอบอีกชั้น
  //                (ถ้าไม่ระบุจะนับลูกของตัวหมวดเอง ซึ่งจะได้ 1 = จำนวนกล่องครอบ ไม่ใช่จำนวนของ)
  function build(host, groups, opts) {
    if (!host) return [];
    injectStyle();
    const storeKey = (opts && opts.storeKey) || 'aec_collapse_groups';
    const openMap = load(storeKey);
    const built = [];

    groups.forEach(g => {
      const nodes = (g.nodes || []).filter(Boolean);
      const isOpen = g.key in openMap ? !!openMap[g.key] : !!g.open;

      const el = document.createElement('div');
      el.className = 'cg' + (isOpen ? ' open' : '');
      el.dataset.cg = g.key;
      el.innerHTML = `<button class="cg-h" type="button" aria-expanded="${isOpen}">
          <span class="cg-i"></span><span class="cg-t"></span><span class="cg-n"></span><span class="cg-c">▼</span>
        </button><div class="cg-b"></div>`;
      el.querySelector('.cg-i').textContent = g.icon || '';
      el.querySelector('.cg-t').textContent = g.label || '';
      const body = el.querySelector('.cg-b');
      nodes.forEach(n => body.appendChild(n));   // ย้าย ไม่ใช่ copy

      const head = el.querySelector('.cg-h');
      head.addEventListener('click', () => {
        const now = !el.classList.contains('open');
        el.classList.toggle('open', now);
        head.setAttribute('aria-expanded', String(now));
        const m = load(storeKey); m[g.key] = now; save(storeKey, m);
      });

      host.appendChild(el);
      built.push({ key: g.key, el, body, empty: g.empty, count: g.count !== false, countNode: g.countNode || null });
    });

    built.forEach(b => refresh(b));
    return built;
  }

  // เรียกเมื่อเนื้อในเปลี่ยน (เช่นเพิ่ง/ลบร่าง) — อัปเดตตัวเลขและข้อความตอนว่าง
  // กลุ่มที่ว่างยังต้องเห็นหัวข้ออยู่ ผู้ใช้จะได้รู้ว่ามีหมวดนี้และมันยังไม่มีของ
  function refresh(b) {
    if (!b || !b.el) return;
    const src = b.countNode || b.body;
    const items = src.querySelectorAll(':scope > *:not(.cg-empty)').length;
    const n = b.el.querySelector('.cg-n');
    if (b.count === false) n.style.display = 'none';
    else n.textContent = items ? String(items) : '0';
    let ph = b.body.querySelector(':scope > .cg-empty');
    if (!items && b.empty) {
      if (!ph) { ph = document.createElement('div'); ph.className = 'cg-empty'; b.body.appendChild(ph); }
      ph.textContent = b.empty;
    } else if (ph) ph.remove();
  }

  return { build, refresh };
})();
