/* ============================================================
   AEC VERSE — กระดิ่งแจ้งเตือน
   อยู่บนแถบบนของหน้าเว็บ (นอกโลก 3D) จึงเห็นได้ทุกหน้า ไม่ต้องเข้าไปในฉากก่อน

   ที่มาของการแจ้งเตือน:
   - มอบหมายใบสั่งงาน -> ผู้รับได้ทันที (server ยิงผ่าน socket ห้อง user:<id>)
   - เหตุฉุกเฉิน -> ทุกคนที่เกี่ยวข้อง
   เปิดหน้าค้างไว้จะเด้งเองแบบเรียลไทม์ ถ้าเพิ่งเปิดหน้าจะดึงของเก่ามาแสดง
   ============================================================ */
window.AecNotifications = (function () {

  let items = [], unread = 0, open = false, booted = false;

  const esc = t => String(t == null ? '' : t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  function timeAgo(iso) {
    const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'เมื่อสักครู่';
    if (s < 3600) return `${Math.floor(s / 60)} นาทีที่แล้ว`;
    if (s < 86400) return `${Math.floor(s / 3600)} ชั่วโมงที่แล้ว`;
    if (s < 604800) return `${Math.floor(s / 86400)} วันที่แล้ว`;
    return new Date(iso).toLocaleDateString('th-TH');
  }
  const ICON = { work_order: '📋', emergency: '🚨', info: 'ℹ️' };

  function injectStyle() {
    if (document.getElementById('aec-notif-style')) return;
    const s = document.createElement('style');
    s.id = 'aec-notif-style';
    s.textContent = `
      .notif-wrap{position:relative;}
      .notif-dot{position:absolute;bottom:-4px;right:-4px;min-width:16px;height:16px;padding:0 4px;
        border-radius:9px;background:var(--red);color:#fff;font-size:9.5px;font-weight:800;
        display:none;align-items:center;justify-content:center;line-height:1;
        border:2px solid var(--panel);box-sizing:content-box;}
      .notif-dot.on{display:flex;}
      .notif-panel{position:absolute;top:calc(100% + 9px);right:0;width:min(340px,calc(100vw - 24px));
        background:var(--panel);border:1px solid var(--border);border-radius:12px;
        box-shadow:0 18px 44px rgba(0,0,0,.55);z-index:900;display:none;overflow:hidden;}
      .notif-panel.on{display:block;}
      .notif-head{display:flex;align-items:center;justify-content:space-between;gap:8px;
        padding:11px 13px;border-bottom:1px solid var(--border-soft);}
      .notif-head b{font-size:12.5px;font-weight:800;color:var(--text-0);}
      .notif-head button{background:none;border:none;color:var(--blue);font-size:11px;font-weight:700;
        cursor:pointer;font-family:inherit;padding:2px 4px;}
      .notif-head button:disabled{color:var(--text-2);cursor:default;}
      .notif-list{max-height:min(60vh,380px);overflow-y:auto;}
      .notif-item{display:flex;gap:10px;padding:11px 13px;border-bottom:1px solid var(--border-soft);
        text-decoration:none;color:inherit;}
      .notif-item:last-child{border-bottom:none;}
      .notif-item.unread{background:var(--blue-soft);}
      .notif-item:hover{background:var(--panel-2);}
      .notif-item .ni-ic{font-size:15px;line-height:1.3;flex-shrink:0;}
      .notif-item .ni-t{display:block;font-size:12px;font-weight:700;color:var(--text-0);line-height:1.45;}
      .notif-item .ni-b{display:block;font-size:11px;color:var(--text-1);line-height:1.55;margin-top:2px;}
      .notif-item .ni-w{display:block;font-size:10px;color:var(--text-2);margin-top:4px;}
      .notif-empty{padding:26px 14px;text-align:center;color:var(--text-2);font-size:11.5px;line-height:1.7;}
    `;
    document.head.appendChild(s);
  }

  function bellHost() {
    // แถบบนมีสองแบบ: หน้าพอร์ทัลวาดด้วย renderPortalTopbar (มี title) ส่วนหน้าแอดมิน
    // เขียน markup ไว้ในไฟล์เอง ไม่มี title — เดิมเลือกด้วย title อย่างเดียวจึงหาไม่เจอ
    // และแผงแจ้งเตือนไม่เคยติดตั้งบนหน้าแอดมินเลย หาจากรูปกระดิ่งจริงแทนจะแน่นอนกว่า
    const byTitle = document.querySelector('.topbar-right .icon-btn[title="การแจ้งเตือน"]');
    if (byTitle) return byTitle;
    return [...document.querySelectorAll('.topbar-right .icon-btn')]
      .find(b => b.querySelector('path[d^="M18 8a6 6"]') || b.querySelector('#alert-count-badge')) || null;
  }

  // หน้าแอดมินมีจุดนับ alert ของโรงงานติดอยู่บนกระดิ่งเดียวกันอยู่แล้ว
  // สองจุดซ้อนมุมเดียวกันจะทับกัน และมันยังโชว์เลข 0 ค้างไว้ซึ่งไม่มีความหมาย
  // -> ย้ายของเดิมไปมุมล่าง และซ่อนเมื่อเป็น 0
  function tameLegacyBadge(bell) {
    const legacy = bell.querySelector('.badge-dot');
    if (!legacy) return;
    // ปล่อยไว้มุมบนตามเดิม — ตัวมันเล็กกว่าและไม่มีขอบหนา จึงไม่บังรูปกระดิ่ง
    // ที่ต้องแก้คือมันโชว์เลข 0 ค้างไว้ ซึ่งไม่ได้บอกอะไรเลย
    const sync = () => { legacy.style.display = (legacy.textContent || '').trim() === '0' ? 'none' : ''; };
    sync();
    new MutationObserver(sync).observe(legacy, { childList: true, characterData: true, subtree: true });
  }

  function render() {
    const panel = document.getElementById('aec-notif-panel');
    const dot = document.getElementById('aec-notif-dot');
    if (dot) { dot.classList.toggle('on', unread > 0); dot.textContent = unread > 9 ? '9+' : String(unread); }
    if (!panel) return;
    panel.querySelector('.notif-list').innerHTML = items.length ? items.map(n => `
      <a class="notif-item${n.readAt ? '' : ' unread'}" href="${esc(n.link || '#')}">
        <span class="ni-ic">${ICON[n.kind] || ICON.info}</span>
        <span style="min-width:0;">
          <span class="ni-t">${esc(n.title)}</span>
          ${n.body ? `<span class="ni-b">${esc(n.body)}</span>` : ''}
          <span class="ni-w">${esc(timeAgo(n.createdAt))}</span>
        </span>
      </a>`).join('')
      : '<div class="notif-empty">ยังไม่มีการแจ้งเตือน<br>เมื่อมีคนมอบหมายงานให้คุณ หรือเกิดเหตุฉุกเฉิน จะขึ้นที่นี่</div>';
    const btn = panel.querySelector('[data-readall]');
    if (btn) btn.disabled = unread === 0;
  }

  async function authHeaders() {
    try {
      const { data } = await supabaseClient.auth.getSession();
      const t = data?.session?.access_token;
      return t ? { Authorization: `Bearer ${t}` } : null;
    } catch (err) { return null; }
  }

  async function refresh() {
    const h = await authHeaders();
    if (!h) return;                       // ยังไม่ล็อกอิน — กระดิ่งอยู่เฉยๆ ไม่ต้องเรียก API
    try {
      const res = await fetch('/api/notifications', { headers: h });
      if (!res.ok) return;
      const body = await res.json();
      items = body.notifications || [];
      unread = body.unread || 0;
      render();
    } catch (err) { console.warn('[NOTIF] ดึงการแจ้งเตือนไม่สำเร็จ:', err); }
  }

  async function markAllRead() {
    const h = await authHeaders();
    if (!h) return;
    try {
      await fetch('/api/notifications/read', { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: '{}' });
      items = items.map(n => ({ ...n, readAt: n.readAt || new Date().toISOString() }));
      unread = 0;
      render();
    } catch (err) { console.warn('[NOTIF] ทำเครื่องหมายอ่านแล้วไม่สำเร็จ:', err); }
  }

  function toggle(force) {
    const panel = document.getElementById('aec-notif-panel');
    if (!panel) return;
    open = force !== undefined ? force : !open;
    panel.classList.toggle('on', open);
    if (open) refresh();
  }

  function mount() {
    if (booted) return;
    const bell = bellHost();
    if (!bell) return;                    // แถบบนยังไม่ถูกวาด — ตัวเรียกจะลองใหม่
    booted = true;
    injectStyle();
    tameLegacyBadge(bell);
    bell.classList.add('notif-wrap');
    bell.style.cursor = 'pointer';
    bell.insertAdjacentHTML('beforeend', `
      <span class="notif-dot" id="aec-notif-dot"></span>
      <div class="notif-panel" id="aec-notif-panel" role="dialog" aria-label="การแจ้งเตือน">
        <div class="notif-head"><b>การแจ้งเตือน</b><button type="button" data-readall>อ่านทั้งหมดแล้ว</button></div>
        <div class="notif-list"></div>
      </div>`);

    bell.addEventListener('click', e => {
      if (e.target.closest('.notif-panel')) return;   // คลิกในแผงไม่ใช่การกดกระดิ่ง
      e.stopPropagation();
      toggle();
    });
    document.getElementById('aec-notif-panel').querySelector('[data-readall]')
      .addEventListener('click', e => { e.stopPropagation(); markAllRead(); });
    document.addEventListener('click', e => { if (open && !e.target.closest('.notif-wrap')) toggle(false); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && open) toggle(false); });

    render();
    refresh();

    // เด้งทันทีเมื่อมีคนสั่งงานให้เรา — server ยิงมาที่ห้องส่วนตัวของบัญชีนี้
    if (window.portalSocket) window.portalSocket.on('notification', onPush);
    window.addEventListener('aec-portal-socket', e => e.detail?.on('notification', onPush));
  }

  function onPush(n) {
    if (!n || !n.id) return;
    if (items.some(x => x.id === n.id)) return;      // กันซ้ำเวลา refresh ชนกับ socket
    items.unshift(n);
    // เรียงตามเวลาจริงเสมอ ไม่ใช่ลำดับที่วิ่งเข้ามา — ตอน refresh ชนกับ socket
    // ของเก่าอาจมาทีหลังของใหม่ได้ ถ้าไม่เรียงจะสลับที่กันบนแผง
    items.sort((x, y) => new Date(y.createdAt) - new Date(x.createdAt));
    unread++;
    render();
  }

  // แถบบนถูกวาดด้วย JS จึงอาจยังไม่มีตอนสคริปต์นี้รัน — ลองซ้ำสั้นๆ จนกว่าจะเจอ
  function boot() {
    mount();
    if (!booted) {
      let tries = 0;
      const t = setInterval(() => { mount(); if (booted || ++tries > 20) clearInterval(t); }, 150);
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();

  return { refresh, mount, push: onPush, toggle };
})();
