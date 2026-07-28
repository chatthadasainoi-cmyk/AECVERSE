// ════════════════════════════════════════════════════════════════════════
// AEC VERSE — User Portal shared shell + live-data connector
// Loaded by every Public*.html page (after supabaseClient.js + socket.io).
// Keeps the sidebar/topbar markup and the live-plant socket connection in
// ONE place instead of duplicated across 8 pages.
// ════════════════════════════════════════════════════════════════════════

const PORTAL_NAV = [
    { href: 'PublicHome.html', label: 'Home', icon: '<path d="M3 11l9-8 9 8"/><path d="M5 10v10h14V10"/>' },
    { href: 'PublicVirtualTour.html', label: 'Virtual Tour', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 010 18M12 3a9 9 0 000 18M3 12h18"/>' },
    { href: 'PublicDigitalTwin.html', label: 'Digital Twin', icon: '<path d="M9 3L3 6v15l6-3 6 3 6-3V3l-6 3-6-3z"/><path d="M9 3v15M15 6v15"/>' },
    { href: 'PublicProcess.html', label: 'Process', icon: '<path d="M3 12h4l3-8 4 16 3-8h4"/>' },
    { href: 'PublicAboutUs.html', label: 'About Us', icon: '<circle cx="12" cy="12" r="9"/><path d="M12 8h.01M11 12h1v5h1"/>' },
    { href: 'PublicKnowledge.html', label: 'Knowledge check', icon: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/>' },
    { href: 'PublicAvatar.html', label: 'Avatar', icon: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/>' },
    { href: 'PublicSettings.html', label: 'Settings', icon: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.9l.1.1a2 2 0 11-2.9 2.9l-.1-.1a1.7 1.7 0 00-1.9-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1-1.6 1.7 1.7 0 00-1.9.3l-.1.1a2 2 0 11-2.9-2.9l.1-.1a1.7 1.7 0 00.3-1.9 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1 1.7 1.7 0 00-.3-1.9l-.1-.1a2 2 0 112.9-2.9l.1.1a1.7 1.7 0 001.9.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.9-.3l.1-.1a2 2 0 112.9 2.9l-.1.1a1.7 1.7 0 00-.3 1.9V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>' }
];

function renderPortalSidebar(activeHref) {
    const el = document.getElementById('portal-sidebar');
    if (!el) return;
    const nav = PORTAL_NAV.map(item => `
    <div class="nav-item${item.href === activeHref ? ' active' : ''}" onclick="location.href='${item.href}'">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.icon}</svg>
      <span>${item.label}</span>
    </div>`).join('');
    el.innerHTML = `
    <div class="sb-logo">
      <img src="Logo.png" alt="AEC VERSE">
      <div><b>AEC <span class="verse">VERSE</span></b><span>SMART BIOGAS DIGITAL TWIN</span></div>
    </div>
    <nav class="sb-nav">${nav}</nav>
    <div class="sb-live">
      <div class="hd"><b>Live Plant Data</b><span class="live"><span class="dt"></span>LIVE</span></div>
      <div class="row"><span>CH4</span><b id="sbLiveCh4">—</b></div>
      <div class="row"><span>Flow Rate</span><b id="sbLiveFlow">—</b></div>
      <div class="row"><span>Efficiency</span><b id="sbLiveEff">—</b></div>
    </div>`;
}

function renderPortalTopbar(titleEN, titleTH) {
    const el = document.getElementById('portal-topbar');
    if (!el) return;
    el.innerHTML = `
    <div style="font-size:14px;font-weight:700;">${titleEN}${titleTH ? ` <span style="font-size:12px;color:var(--text-2);font-weight:500;">${titleTH}</span>` : ''}</div>
    <div class="search-box">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>
      <input placeholder="Search area, equipment, media...">
    </div>
    <div class="topbar-right">
      <div class="icon-btn" title="การแจ้งเตือน">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8a6 6 0 00-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 01-3.4 0"/></svg>
      </div>
      <div class="user-chip" onclick="handlePortalLogout()" title="บัญชีผู้ใช้ / ออกจากระบบ">
        <div class="avatar">?</div>
        <div><div class="u-name">—</div><div class="u-role">User</div></div>
      </div>
    </div>`;
}

async function handlePortalLogout() {
    await supabaseClient.auth.signOut();
    window.location.href = 'Login.html';
}

// ---------------------------------------------------------------------
// ONBOARDING CHECKLIST — ผูกกับบัญชี (user_metadata.onboardingTasks)
// แต่ละหน้าเรียก markTaskDone(id) เองตอนผู้ใช้ทำสิ่งนั้นสำเร็จ — ติ๊กถูกถาวร
// ไม่มีปุ่ม "เลิกทำ" (เป็น checklist แนะนำการใช้งาน ไม่ใช่ toggle)
// ---------------------------------------------------------------------
const ONBOARDING_TASKS = [
    { id: 'avatarSaved', label: 'ปรับแต่งตัวละคร (Avatar)', href: 'PublicAvatar.html', icon: '🧍' },
    { id: 'virtualTourVisited', label: 'เข้าชม Virtual Tour', href: 'PublicVirtualTour.html', icon: '🧭' },
    { id: 'digitalTwinVisited', label: 'เข้าชม Digital Twin', href: 'PublicDigitalTwin.html', icon: '🗺️' },
    { id: 'knowledgeCheckPassed', label: 'ทำแบบทดสอบผ่านเกณฑ์', href: 'PublicKnowledge.html', icon: '📘' },
    { id: 'settingsVisited', label: 'ตั้งค่า Chat & Voice', href: 'PublicSettings.html', icon: '⚙️' }
];

// ทำเครื่องหมายว่างานนี้เสร็จแล้ว — เขียนเฉพาะตอนยังไม่เคยติ๊กมาก่อน กัน
// เรียก updateUser() ซ้ำโดยไม่จำเป็นทุกครั้งที่เปิดหน้า (เช่นหน้า Virtual Tour ที่
// เรียกทุกครั้งที่เข้า แต่ถ้าติ๊กแล้วไม่ต้องเขียนซ้ำ)
async function markTaskDone(taskId) {
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session) return;
        const current = session.user.user_metadata?.onboardingTasks || {};
        if (current[taskId]) return; // ติ๊กไว้แล้ว ไม่ต้องเขียนซ้ำ
        await supabaseClient.auth.updateUser({ data: { onboardingTasks: { ...current, [taskId]: true } } });
    } catch (err) { /* บันทึกไม่สำเร็จ (เช่นออฟไลน์) — ไม่ใช่ฟีเจอร์หลัก ปล่อยผ่านเงียบๆ */ }
}

// ---------------------------------------------------------------------
// live plant feed — เชื่อมต่อ 1 ครั้งต่อหน้า ใช้ทั้งอัปเดต sidebar mini-panel
// และให้หน้าเฉพาะทาง (Home KPI, Digital Twin building info) ต่อยอดใช้ต่อได้
// ผ่าน window.portalSocket / window.addEventListener('portal:plant_update')
// ---------------------------------------------------------------------
window.portalSocket = null;
async function initPortalLiveFeed() {
    if (typeof io === 'undefined') return null;
    // เชื่อมกลับไปที่โดเมนเดียวกับที่เปิดหน้านี้อยู่เสมอ — ย้าย/เปลี่ยนโดเมนแล้วไม่ต้องแก้โค้ด
    const SERVER = window.AEC_SERVER_URL || location.origin;
    let token = null;
    try {
        const { data: { session } } = await supabaseClient.auth.getSession();
        token = session?.access_token || null;
    } catch (err) { /* ต่อแบบไม่มี token ก็ยังดูข้อมูลได้ แค่ไม่นับ presence */ }

    const socket = io(SERVER, { transports: ['websocket', 'polling'], auth: { token, role: 'watcher' } });
    window.portalSocket = socket;
    socket.on('plant_update', data => {
        const set = (id, txt) => { const e = document.getElementById(id); if (e) e.textContent = txt; };
        if (data && data.plant) {
            set('sbLiveCh4', data.plant.ch4Percent + ' %');
            set('sbLiveFlow', data.plant.flowRate + ' m³/h');
            set('sbLiveEff', data.plant.efficiency + ' %');
        }
        window.dispatchEvent(new CustomEvent('portal:plant_update', { detail: data }));
    });
    return socket;
}
