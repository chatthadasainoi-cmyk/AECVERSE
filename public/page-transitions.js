/* ============================================================
   AEC VERSE — เอฟเฟกต์เปลี่ยนหน้า (page transitions)
   ใส่ <script src="page-transitions.js"></script> ในหน้าไหนก็ได้ผลทันที ไม่ต้องเพิ่ม CSS/markup เอง:
     1) fade เข้าตอนโหลดหน้าใหม่ (แทนที่จะ "ผลุบ" โผล่มาเต็มจอทันที)
     2) fade ออกก่อนค่อยเปลี่ยนหน้าจริง เมื่อกดเมนู sidebar หรือลิงก์ภายในเว็บเดียวกัน
        (แทนที่จะ "วาร์ป" ตัดฉากทันทีที่กด)
   หน้าไหนมีเอฟเฟกต์ entrance ของตัวเองอยู่แล้ว (เช่น Login.html) ใส่ data-no-entrance-fade
   ที่ <html> ไว้ได้ เพื่อข้ามส่วน fade-in ทั่วไปนี้ แต่ยังได้ fade-out ตอนกดลิงก์เหมือนเดิม
   ============================================================ */
(function () {
  var STYLE_ID = 'aec-page-transition-style';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      'html.aec-pre-fade body{opacity:0 !important;}' +
      '@media (prefers-reduced-motion:no-preference){' +
        'body{transition:opacity .32s ease, transform .32s ease;}' +
        'html.aec-leaving body{opacity:0 !important;transform:translateY(-8px);}' +
      '}';
    document.head.appendChild(style);
  }

  if (!document.documentElement.hasAttribute('data-no-entrance-fade')) {
    document.documentElement.classList.add('aec-pre-fade');
    var reveal = function () {
      requestAnimationFrame(function () {
        requestAnimationFrame(function () {
          document.documentElement.classList.remove('aec-pre-fade');
        });
      });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', reveal);
    else reveal();
    // กันค้าง: เผื่อกรณี requestAnimationFrame ไม่ยอมทำงาน (เช่นแท็บอยู่เบื้องหลังตอนโหลด)
    // reveal() ไม่ทำงานเลย อย่างน้อยต้องโชว์หน้าภายในเวลาสั้นๆ ดีกว่าจอมืดค้าง
    setTimeout(function () { document.documentElement.classList.remove('aec-pre-fade'); }, 500);
  }

  // ---- fade ออกก่อนเปลี่ยนหน้าจริง เมื่อกดลิงก์ <a href> หรือเมนูที่ใช้ onclick="location.href='...'" ----
  function extractInternalHref(el) {
    var href = el.getAttribute('href');
    if (href) return href;
    var onclickAttr = el.getAttribute('onclick') || '';
    var m = onclickAttr.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
    return m ? m[1] : null;
  }
  function isInternalNavPath(href) {
    if (!href) return false;
    if (/^([a-z]+:)?\/\//i.test(href)) return false; // ลิงก์นอกเว็บ (http://, //cdn... ฯลฯ)
    if (/^(#|mailto:|tel:|javascript:)/i.test(href)) return false;
    var pathOnly = href.split('#')[0].split('?')[0];
    return pathOnly === '' || /\.html$/i.test(pathOnly);
  }

  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var el = e.target.closest('[href],[onclick]');
    if (!el || el.hasAttribute('download') || el.target === '_blank') return;
    var href = extractInternalHref(el);
    if (!isInternalNavPath(href)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    document.documentElement.classList.add('aec-leaving');
    setTimeout(function () { window.location.href = href; }, 200);
  }, true);
})();
