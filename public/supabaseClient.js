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

// เรียกจากหน้าฝั่งแอดมินเท่านั้น (Dashboard/Analytics/WorkOrder/Emergency/Reports/
// Settings/Digitaltwin/Avatar เวอร์ชันแอดมิน) — user ทั่วไปที่หลุดเข้ามาทาง URL ตรงๆ
// (ไม่ได้ผ่าน RoleRedirect ตอน login) จะถูกเด้งกลับไปพอร์ทัลของตัวเองแทน
async function guardAdminOnly(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'Login.html'; return; }
  try {
    const res = await fetch('/api/me/role', { headers: { Authorization: 'Bearer ' + session.access_token } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.isAdmin) window.location.href = 'PublicHome.html';
  } catch (err) {
    // เช็คสิทธิ์ไม่ได้ (เช่น server สะดุดชั่วคราว) — ปล่อยผ่านไปก่อน ดีกว่าเด้ง admin จริงออกจากหน้าตัวเอง
  }
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
