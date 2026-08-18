const SUPABASE_URL = 'https://hzlokmixfkfrmkuucfhg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6bG9rbWl4Zmtmcm1rdXVjZmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NzA5NTUsImV4cCI6MjA5ODE0Njk1NX0.DSj0c7XN979948Iq5rGmWqI9ddcbg56OmfKFin--Luo';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// เก็บ "หน้า + query string ปัจจุบัน" ไว้ใน ?next= ก่อนเด้งไป Login — ใช้สำหรับ
// deep-link เช่น QR code ที่สแกนแล้วมี ?focus=xxx ต่อท้าย จะได้กลับมาที่หน้าเดิม
// พร้อม query เดิมหลัง login เสร็จ แทนที่จะหลุดไปหน้า default เฉยๆ
function redirectToLoginPreservingPath(){
  const here = location.pathname.split('/').pop() + location.search;
  window.location.href = 'Login.html?next=' + encodeURIComponent(here);
}

// เรียกจากหน้า Dashboard/Analytics/ฯลฯ เท่านั้น (ไม่ใช่หน้า Login/Signup) —
// ถ้ายังไม่ได้ login ให้เด้งกลับไปหน้า Login แทนที่จะโชว์ค่า user-chip ปลอม
async function initUserChip(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { redirectToLoginPreservingPath(); return; }
  const email = session.user.email || '';
  const nameEl = document.querySelector('.user-chip .u-name');
  const avatarEl = document.querySelector('.user-chip .avatar');
  if (nameEl) nameEl.textContent = email;
  if (avatarEl) avatarEl.textContent = email.slice(0, 2).toUpperCase();
}

// ============================================================
// ยามเฝ้าหน้าฝั่งแอดมิน
// เรียกจากหน้าแอดมินทุกหน้า (Dashboard/Analytics/WorkOrder/Emergency/Reports/
// Settings/Digitaltwin/Avatar/KnowledgeAdmin) — user ทั่วไปที่หลุดเข้ามาทาง URL ตรงๆ
// จะถูกเด้งกลับไปพอร์ทัลของตัวเอง
//
// สำคัญ 2 ข้อที่เคยพลาด:
//  1) ต้อง "ปิดหน้าไว้ก่อน" ระหว่างรอผลตรวจสิทธิ์ ไม่ใช่ปล่อยให้หน้าแสดงเต็มแล้วค่อยเด้ง
//     เพราะระหว่างนั้น user กดปุ่มแอดมินได้จริง (เน็ตช้าเท่าไหร่ก็เห็นนานเท่านั้น)
//  2) ตรวจสิทธิ์ไม่สำเร็จต้อง "ไม่ให้ผ่าน" — ของเดิมปล่อยผ่านเวลา fetch พัง
//     ซึ่งแปลว่าแค่ทำให้ API ล้มก็เข้าหน้าแอดมินได้
// ============================================================
function aecShowRoleGate(state, detail){
  let el = document.getElementById('aec-role-gate');
  if (!el) {
    el = document.createElement('div');
    el.id = 'aec-role-gate';
    el.style.cssText = 'position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;' +
      'align-items:center;justify-content:center;gap:14px;text-align:center;padding:24px;' +
      'background:#080b11;color:#eef2f7;font-family:"Inter",system-ui,sans-serif;';
    (document.body || document.documentElement).appendChild(el);
  }
  if (state === 'checking') {
    el.innerHTML = '<div style="font-size:13px;color:#657182;">กำลังตรวจสอบสิทธิ์การเข้าใช้งาน...</div>';
  } else if (state === 'denied') {
    el.innerHTML = '<div style="font-size:34px;">🔒</div>' +
      '<div style="font-size:15px;font-weight:800;">หน้านี้สำหรับผู้ดูแลระบบเท่านั้น</div>' +
      '<div style="font-size:12.5px;color:#657182;line-height:1.7;">' + (detail || '') + '<br>กำลังพากลับไปหน้าของคุณ...</div>';
  } else if (state === 'error') {
    el.innerHTML = '<div style="font-size:34px;">⚠️</div>' +
      '<div style="font-size:15px;font-weight:800;">ตรวจสอบสิทธิ์ไม่สำเร็จ</div>' +
      '<div style="font-size:12.5px;color:#657182;line-height:1.7;">' + (detail || 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้') +
      '<br>เพื่อความปลอดภัย ระบบจะยังไม่เปิดหน้านี้ให้</div>' +
      '<button onclick="location.reload()" style="margin-top:6px;padding:9px 18px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:12.5px;font-weight:700;background:#111826;border:1px solid #1c2531;color:#eef2f7;">ลองใหม่</button>' +
      '<button onclick="location.href=\'PublicHome.html\'" style="padding:9px 18px;border-radius:9px;cursor:pointer;' +
      'font-family:inherit;font-size:12.5px;font-weight:700;background:transparent;border:1px solid #1c2531;color:#9aa7b8;">กลับหน้าหลัก</button>';
  }
  return el;
}

// allowRoles: ระดับสิทธิ์ที่เข้าหน้านี้ได้ (ค่าเริ่มต้น = admin เท่านั้น)
// ส่ง ['admin','engineer'] สำหรับหน้าที่ engineer ควรเข้าได้ด้วย
async function guardAdminOnly(allowRoles){
  const allowed = Array.isArray(allowRoles) && allowRoles.length ? allowRoles : ['admin'];
  const gate = aecShowRoleGate('checking');

  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { redirectToLoginPreservingPath(); return false; }

  let body = null;
  try {
    const res = await fetch('/api/me/role', { headers: { Authorization: 'Bearer ' + session.access_token } });
    if (res.ok) body = await res.json().catch(() => null);
  } catch (err) { /* ตกลงไปที่ทางฝั่งล่าง */ }

  if (!body || !body.role) {
    // ไม่รู้สิทธิ์ = ไม่ให้ผ่าน (fail closed) มีปุ่มลองใหม่ให้แอดมินตัวจริงที่เน็ตสะดุด
    aecShowRoleGate('error');
    return false;
  }
  if (!allowed.includes(body.role)) {
    aecShowRoleGate('denied', 'บัญชีของคุณมีสิทธิ์ระดับ "' + body.role + '"');
    setTimeout(() => { window.location.href = 'PublicHome.html'; }, 1200);
    return false;
  }
  gate.remove();          // ผ่านแล้วค่อยเปิดหน้าให้เห็น
  window.AEC_MY_ROLE = body.role;
  return true;
}

// ============================================================
// นาฬิกา + สภาพอากาศจริง ที่มุมล่างซ้ายของ sidebar (.sb-weather)
// ทำงานอัตโนมัติทุกหน้าที่มี widget นี้ — เดิมเป็นค่า hardcode "20 May 2025"
// อุณหภูมิดึงจาก Open-Meteo (ฟรี ไม่ต้องใช้ API key) พิกัดกรุงเทพฯ
// ============================================================
function initSidebarWeather(){
  const box = document.querySelector('.sb-weather');
  // นอกจาก sidebar แล้ว ยังอัปเดต element ใดๆ ที่ติด class .live-time / .live-date / .live-temp ด้วย
  const liveTimes = document.querySelectorAll('.live-time');
  const liveDates = document.querySelectorAll('.live-date');
  const liveTemps = document.querySelectorAll('.live-temp');
  if (!box && !liveTimes.length && !liveDates.length && !liveTemps.length) return;

  const tempEl = box ? box.querySelector('.temp') : null;
  const timeEl = box ? box.querySelector('.time') : null;
  const dateEls = box ? box.querySelectorAll('.date') : [];

  function tick(){
    const now = new Date();
    const timeTxt = now.toLocaleTimeString('en-GB', { hour12: false, timeZone: 'Asia/Bangkok' });
    const dateTxt = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Bangkok' });
    if (timeEl) timeEl.textContent = timeTxt;
    if (dateEls[0]) dateEls[0].textContent = dateTxt;
    liveTimes.forEach(el => { el.textContent = timeTxt; });
    liveDates.forEach(el => { el.textContent = dateTxt; });
  }
  tick();
  setInterval(tick, 1000);
  // ไม่ขอตำแหน่งผู้ใช้ (กัน popup ขอสิทธิ์ทุกหน้า) — แสดงระดับประเทศตามที่ตกลง
  if (dateEls[1]) dateEls[1].textContent = 'Thailand';
  if (dateEls[2]) dateEls[2].textContent = 'Asia/Bangkok (UTC+7)';

  async function fetchTemp(){
    try {
      const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=13.7563&longitude=100.5018&current=temperature_2m');
      const j = await res.json();
      const t = j && j.current ? j.current.temperature_2m : null;
      if (typeof t === 'number') {
        const txt = Math.round(t) + '°C';
        if (tempEl) tempEl.textContent = txt;
        liveTemps.forEach(el => { el.textContent = txt; });
      }
    } catch (err) { /* ออฟไลน์/โดนบล็อก -> คงค่าเดิมที่แสดงอยู่ */ }
  }
  fetchTemp();
  setInterval(fetchTemp, 10 * 60 * 1000); // อัปเดตทุก 10 นาที
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initSidebarWeather);
else initSidebarWeather();
