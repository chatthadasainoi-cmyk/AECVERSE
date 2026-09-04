/* ============================================================
   AEC VERSE — ตัวช่วยฝั่ง "หน้าแม่" ของรอบเยี่ยมชมเต็มจอ
   ใช้ในหน้าที่ฝัง index.html ไว้ (Dashboard ฝั่งแอดมิน / Virtual Tour ฝั่งผู้ใช้)

   ทำไมต้องมีไฟล์นี้:
   Keyboard Lock API (ตัวเดียวที่เบราว์เซอร์ยอมให้ดักปุ่ม Esc ตอนเต็มจอ) เรียกได้
   เฉพาะจาก "หน้าบนสุด" เท่านั้น — เรียกจากใน iframe จะได้ InvalidStateError ทันที
   ("lock() must be called from a primary top-level browsing context")
   โลก 3D อยู่ใน iframe จึงสั่งเองไม่ได้ ต้องส่งข้อความมาให้หน้านี้ทำให้แทน

   ข้อจำกัดที่ถอดไม่ได้: เบราว์เซอร์การันตี "กด Esc ค้างไว้" ให้ออกจากเต็มจอเสมอ
   และ Keyboard Lock มีเฉพาะ Chrome/Edge บนเดสก์ท็อป — Firefox/Safari จะล็อกไม่ได้
   ============================================================ */
(function () {
  const frameOf = () => document.getElementById('world-frame') || document.getElementById('tourFrame')
    || document.querySelector('iframe[src*="index.html"]');

  let escapeLocked = false;

  function tell(msg) {
    const f = frameOf();
    if (f && f.contentWindow) f.contentWindow.postMessage(msg, location.origin);
  }
  function reportState() {
    tell({ type: 'aec_tour_state', fullscreen: !!document.fullscreenElement, escapeLocked });
  }

  async function lockEscape() {
    escapeLocked = false;
    try {
      if (!navigator.keyboard || !navigator.keyboard.lock) return;
      await navigator.keyboard.lock(['Escape']);
      escapeLocked = true;
    } catch (err) {
      console.warn('[TOUR-HOST] ล็อกปุ่ม Esc ไม่สำเร็จ:', err);
    }
  }
  function unlockEscape() {
    escapeLocked = false;
    try { navigator.keyboard && navigator.keyboard.unlock && navigator.keyboard.unlock(); } catch (err) { /* ไม่รองรับก็ข้าม */ }
  }

  // การกดในiframe ส่งต่อ user activation ขึ้นมาถึงหน้านี้ด้วย จึงขอ fullscreen ได้
  // แต่ต้องทำทันทีที่ได้รับข้อความ ปล่อยให้ช้าเกินไป activation จะหมดอายุ
  async function enterFullscreen() {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
      await lockEscape();
    } catch (err) {
      console.warn('[TOUR-HOST] เข้าเต็มจอไม่สำเร็จ:', err);
    }
    reportState();
  }

  window.addEventListener('message', async e => {
    if (e.origin !== location.origin) return;                 // รับเฉพาะข้อความจากโดเมนตัวเอง
    const d = e.data;
    if (!d || typeof d.type !== 'string' || !d.type.startsWith('aec_tour_')) return;

    if (d.type === 'aec_tour_start' || d.type === 'aec_tour_resume') { await enterFullscreen(); return; }

    if (d.type === 'aec_tour_exit') {
      unlockEscape();
      try { if (document.fullscreenElement) await document.exitFullscreen(); }
      catch (err) { console.warn('[TOUR-HOST] ออกจากเต็มจอไม่สำเร็จ:', err); }
      // พาทั้งหน้าไปแบบทดสอบ — ปลายทางมาจากโลก 3D แต่ต้องเป็น path ในโดเมนเดียวกันเท่านั้น
      const url = new URL(String(d.url || 'PublicKnowledge.html'), location.href);
      if (url.origin === location.origin) location.href = url.href;
      return;
    }
    if (d.type === 'aec_tour_ask_state') reportState();
  });

  // Esc ถูกล็อกไว้ -> เหตุการณ์วิ่งมาถึงหน้านี้แทนที่จะพาออกจากเต็มจอ
  // ส่งต่อให้โลก 3D สะกิดปุ่มออกให้ผู้ใช้เห็นว่าทางออกอยู่ตรงไหน
  window.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !escapeLocked || !document.fullscreenElement) return;
    e.preventDefault();
    tell({ type: 'aec_tour_esc' });
  }, true);

  document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) unlockEscape();   // หลุดออกมาแล้วต้องคืนปุ่ม Esc ให้ระบบเสมอ
    reportState();
  });
})();
