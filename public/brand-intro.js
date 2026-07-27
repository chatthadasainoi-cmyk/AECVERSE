/* ============================================================
   AEC VERSE — อินโทรตอนเข้าแอป
   โลโก้ขึ้นกลางจอพร้อมชื่อแบรนด์ แล้ว "บิน" ไปลงตำแหน่งโลโก้จริงบน sidebar
   จากนั้น UI ทั้งหน้าค่อย fade in เข้ามา

   ใส่เฉพาะหน้า "ปลายทางแรกหลังเข้าระบบ" (Dashboard / PublicHome) เท่านั้น
   และเล่นครั้งเดียวต่อ 1 session — กดเมนูไปมาในแอปจะไม่เล่นซ้ำให้รำคาญ

   หมายเหตุ (บทเรียนจากบั๊กก่อนหน้า): ห้ามซ่อน UI ไว้เป็นค่าเริ่มต้นแล้วรอ JS มาเปิด
   ถ้า JS พลาดจะเหลือจอเปล่า — ที่นี่จึงซ่อนด้วย JS เท่านั้น และมี timeout คืนค่าเสมอ
   ============================================================ */
(function () {
  // เล่นเมื่อ "เพิ่งล็อกอินเข้ามา" เท่านั้น — RoleRedirect.html เป็นคนติดธงนี้ให้ก่อนพามาหน้านี้
  // (เดิมใช้ "เล่นครั้งเดียวต่อ session" ซึ่งแปลว่าเปิดเว็บทิ้งไว้ทั้งวันก็ได้เห็นแค่รอบเดียว
  //  พอเดินเมนูไปมาแล้วกลับมาหน้าแรกก็ไม่เล่นอีก จนดูเหมือนว่าไม่ทำงาน)
  var ENTRY_KEY = 'aec_show_brand_intro';
  try {
    if (sessionStorage.getItem(ENTRY_KEY) !== '1') return;
    sessionStorage.removeItem(ENTRY_KEY); // ใช้ครั้งเดียวต่อการล็อกอินหนึ่งครั้ง
  } catch (e) {
    return; // อ่าน sessionStorage ไม่ได้ -> ไม่เล่น ดีกว่าเล่นซ้ำทุกครั้งที่เปลี่ยนหน้า
  }

  var reduceMotion = false;
  try { reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}

  var HOLD_MS = reduceMotion ? 500 : 950;   // โชว์โลโก้กลางจอนานเท่าไรก่อนบิน
  var FLY_MS = reduceMotion ? 0 : 700;      // เวลาบินไปเกาะ sidebar

  function start() {
    var style = document.createElement('style');
    style.textContent = [
      '#aec-intro{position:fixed;top:0;left:0;right:0;bottom:0;z-index:2147483646;',
        'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;',
        'background:radial-gradient(1200px 800px at 15% 10%,#0d1c2c 0%,#050b14 55%),#050b14;',
        'transition:opacity .5s ease;}',
      '#aec-intro.aec-intro-out{opacity:0;}',
      '#aec-intro-logo{width:118px;height:118px;object-fit:contain;transform-origin:center center;',
        'opacity:0;animation:aecIntroLogoIn .7s cubic-bezier(.2,.8,.25,1) forwards;}',
      '#aec-intro-word{text-align:center;opacity:0;animation:aecIntroWordIn .6s ease .25s forwards;',
        'font-family:"Sora",system-ui,sans-serif;}',
      '#aec-intro-word b{display:block;font-size:34px;font-weight:800;letter-spacing:2px;color:#eef2f7;line-height:1;}',
      '#aec-intro-word b .v{background:linear-gradient(90deg,#4ade80,#22d3ee);-webkit-background-clip:text;background-clip:text;color:transparent;}',
      '#aec-intro-word span{display:block;margin-top:9px;font-size:10.5px;letter-spacing:3.5px;color:#657182;font-weight:700;}',
      '@keyframes aecIntroLogoIn{from{opacity:0;transform:scale(.72);}to{opacity:1;transform:scale(1);}}',
      '@keyframes aecIntroWordIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}',
      // การ "ขยับ" ปิดเมื่อผู้ใช้ขอลดการเคลื่อนไหว แต่การ fade ยังทำงานเสมอ
      '@media (prefers-reduced-motion:reduce){',
        '#aec-intro-logo{animation-name:aecIntroFadeOnly;}',
        '#aec-intro-word{animation-name:aecIntroFadeOnly;}',
      '}',
      '@keyframes aecIntroFadeOnly{from{opacity:0;}to{opacity:1;}}'
    ].join('');
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.id = 'aec-intro';
    overlay.innerHTML =
      '<img id="aec-intro-logo" src="Logo.png" alt="">' +
      '<div id="aec-intro-word"><b>AEC <span class="v">VERSE</span></b><span>SMART BIOGAS DIGITAL TWIN</span></div>';
    document.body.appendChild(overlay);

    // ซ่อน UI ไว้ระหว่างอินโทร แล้วค่อย fade เข้ามา
    var shell = document.querySelector('.app-shell');
    if (shell) {
      shell.style.opacity = '0';
      shell.style.transition = 'opacity .55s ease';
    }

    var finished = false;
    function finish() {
      if (finished) return;
      finished = true;
      if (shell) shell.style.opacity = '1';
      overlay.classList.add('aec-intro-out');
      setTimeout(function () { overlay.remove(); }, 600);
    }
    // กันค้าง: ไม่ว่าจะเกิดอะไรขึ้น UI ต้องกลับมาเสมอ
    setTimeout(finish, HOLD_MS + FLY_MS + 2000);

    setTimeout(function () {
      var logo = document.getElementById('aec-intro-logo');
      var target = document.querySelector('.sb-logo img');
      // ไม่เจอโลโก้ปลายทาง (เช่น sidebar ยังไม่ถูกวาด) -> ข้ามการบิน fade เฉยๆ ก็ยังดูดี
      if (!logo || !target || reduceMotion) { finish(); return; }

      var from = logo.getBoundingClientRect();
      var to = target.getBoundingClientRect();
      if (!to.width || !to.height) { finish(); return; }

      var dx = (to.left + to.width / 2) - (from.left + from.width / 2);
      var dy = (to.top + to.height / 2) - (from.top + from.height / 2);
      var scale = to.width / from.width;

      logo.style.animation = 'none';
      logo.style.transition = 'transform ' + FLY_MS + 'ms cubic-bezier(.55,.06,.3,1)';
      // ใช้ setTimeout ไม่ใช่ requestAnimationFrame — rAF ถูกหยุดเมื่อแท็บ/เฟรมไม่ได้แสดงผล
      // ซึ่งจะทำให้โลโก้ไม่บินเลย ส่วน timer ยังเดินปกติ
      setTimeout(function () {
        logo.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(' + scale + ')';
        var word = document.getElementById('aec-intro-word');
        if (word) { word.style.transition = 'opacity .3s ease'; word.style.opacity = '0'; }
        overlay.style.transition = 'opacity ' + FLY_MS + 'ms ease';
        overlay.style.opacity = '0';
        if (shell) shell.style.opacity = '1';
      });
      setTimeout(finish, FLY_MS + 80);
    }, HOLD_MS);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
