/* ============================================================
   AEC VERSE — เอฟเฟกต์เปลี่ยนหน้า (page transitions)
   ใส่ <script src="page-transitions.js"></script> ใน <head> ของหน้าไหนก็ได้ผลทันที

   วิธีทำงาน: ใช้ "ม่าน" (curtain) ที่วาดด้วย html::before คลุมทั้งจอ
     - เข้าหน้าใหม่ : ม่านทึบอยู่ก่อนตั้งแต่เฟรมแรก แล้วค่อยจางออกให้เห็นหน้าเว็บ
     - ออกจากหน้า  : ม่านจางเข้ามาคลุมจอ แล้วค่อยเปลี่ยนหน้าจริง
   ที่ใช้ ::before บน <html> แทนการหรี่ opacity ของ <body> เพราะ body ของแต่ละหน้า
   มี CSS/สแต็กของตัวเองที่อาจทับกันจนเอฟเฟกต์ไม่ทำงาน — ม่านชั้นนี้ไม่มีอะไรมาทับได้

   หมายเหตุเรื่อง prefers-reduced-motion:
   ตัว "จางเข้า-จางออก" (opacity) ยังทำงานเสมอ เพราะการ fade เฉยๆ ไม่ทำให้เวียนหัว
   สิ่งที่ปิดเมื่อผู้ใช้ตั้งค่าลดการเคลื่อนไหวคือ "การขยับตำแหน่ง" (translate) เท่านั้น
   *** อย่าเอา opacity ไปไว้ใน @media (prefers-reduced-motion:no-preference) เด็ดขาด ***
   เพราะถ้าเครื่องผู้ใช้ปิดอนิเมชันไว้ เอฟเฟกต์จะหายไปทั้งหมดโดยไม่มีสัญญาณอะไรบอก
   ============================================================ */
(function () {
  var COVER_MS = 260;   // เวลาที่ม่านค่อยๆ ทึบก่อนเปลี่ยนหน้า
  var REVEAL_MS = 380;  // เวลาที่ม่านจางออกตอนเข้าหน้าใหม่
  var root = document.documentElement;

  // ---------- 1) ฉีด CSS ของม่าน ----------
  var STYLE_ID = 'aec-page-transition-style';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = [
      'html.aecfx::before{',
        'content:"";position:fixed;top:0;left:0;right:0;bottom:0;',
        'z-index:2147483647;pointer-events:none;', // กันไว้: ต่อให้ม่านค้าง ก็ยังคลิกหน้าเว็บได้
        'background:radial-gradient(1200px 800px at 15% 10%,#0d1c2c 0%,#050b14 55%),#050b14;',
        'opacity:0;transition:opacity ' + (REVEAL_MS / 1000) + 's ease;',
      '}',
      'html.aecfx.aec-cover::before{opacity:1;transition-duration:' + (COVER_MS / 1000) + 's;}',
      // ส่วนที่ "ขยับ" เท่านั้นที่ปิดเมื่อผู้ใช้ขอลดการเคลื่อนไหว
      '@media (prefers-reduced-motion:no-preference){',
        'html.aecfx body{transition:transform ' + (REVEAL_MS / 1000) + 's ease;}',
        'html.aecfx.aec-cover body{transform:translateY(-8px);}',
      '}'
    ].join('');
    (document.head || root).appendChild(style);
  }

  // ---------- 2) เข้าหน้าใหม่: ตั้งม่านทึบตั้งแต่เฟรมแรก แล้วค่อยเปิดออก ----------
  root.classList.add('aecfx', 'aec-cover');

  var revealed = false;
  function reveal() {
    if (revealed) return;
    revealed = true;
    root.classList.remove('aec-cover');
  }
  // เปิดม่านเมื่อ DOM พร้อม (เผื่อ rAF ไม่ทำงานตอนแท็บอยู่เบื้องหลัง จึงมี timeout กันค้างด้วย)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { requestAnimationFrame(reveal); });
  } else {
    requestAnimationFrame(reveal);
  }
  window.addEventListener('load', reveal);
  setTimeout(reveal, 1200); // กันหน้าจอถูกม่านบังค้างถาวรถ้ามีอะไรพลาด

  // ---------- 3) ออกจากหน้า: ปิดม่านก่อนแล้วค่อยเปลี่ยนหน้า ----------
  function navigateWithCurtain(url) {
    root.classList.add('aec-cover');
    setTimeout(function () { window.location.href = url; }, COVER_MS);
  }
  // ให้หน้าที่เปลี่ยนหน้าเองด้วย JS (เช่น Login หลังล็อกอินสำเร็จ) เรียกใช้ได้เหมือนกัน
  window.aecNavigate = navigateWithCurtain;

  function internalHrefOf(el) {
    var href = el.getAttribute('href');
    if (!href) {
      var m = (el.getAttribute('onclick') || '').match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
      href = m ? m[1] : null;
    }
    if (!href) return null;
    if (/^([a-z]+:)?\/\//i.test(href)) return null;              // ลิงก์ออกนอกเว็บ
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) return null; // ไม่ใช่การเปลี่ยนหน้า
    var pathOnly = href.split('#')[0].split('?')[0];
    return (pathOnly === '' || /\.html$/i.test(pathOnly)) ? href : null;
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var el = e.target.closest ? e.target.closest('[href],[onclick]') : null;
    if (!el || el.hasAttribute('download') || el.target === '_blank') return;
    var href = internalHrefOf(el);
    if (!href) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    navigateWithCurtain(href);
  }, true);
})();
