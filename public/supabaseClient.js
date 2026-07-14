const SUPABASE_URL = 'https://hzlokmixfkfrmkuucfhg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6bG9rbWl4Zmtmcm1rdXVjZmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NzA5NTUsImV4cCI6MjA5ODE0Njk1NX0.DSj0c7XN979948Iq5rGmWqI9ddcbg56OmfKFin--Luo';
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// เรียกจากหน้า Dashboard/Analytics/ฯลฯ เท่านั้น (ไม่ใช่หน้า Login/Signup) —
// ถ้ายังไม่ได้ login ให้เด้งกลับไปหน้า Login แทนที่จะโชว์ค่า user-chip ปลอม
async function initUserChip(){
  const { data: { session } } = await supabaseClient.auth.getSession();
  if (!session) { window.location.href = 'Login.html'; return; }
  const email = session.user.email || '';
  const nameEl = document.querySelector('.user-chip .u-name');
  const avatarEl = document.querySelector('.user-chip .avatar');
  if (nameEl) nameEl.textContent = email;
  if (avatarEl) avatarEl.textContent = email.slice(0, 2).toUpperCase();
}
