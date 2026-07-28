/* ============================================================
   AEC VERSE — แท็บสลับมุมกล้องของโลก 3D (3D View / Top View / First Person)
   โลก 3D อยู่ใน iframe คนละ document จึงสั่งผ่าน postMessage แล้วให้ app.js จัดการกล้องเอง

   ใช้ในหน้าไหนก็ได้ที่ฝัง index.html ไว้ (Dashboard ฝั่งแอดมิน / Virtual Tour ฝั่งผู้ใช้):
     <div class="tabs" id="view-mode-tabs">
       <div class="tab active" data-view="third">3D View</div>
       <div class="tab" data-view="top">Top View</div>
       <div class="tab" data-view="first">First Person</div>
     </div>
     AecViewTabs.mount(document.getElementById('view-mode-tabs'), document.getElementById('myFrame'));
   ============================================================ */
window.AecViewTabs = (function () {

  function mount(tabsEl, frameEl) {
    if (!tabsEl || !frameEl) return;

    function send(mode) {
      // iframe อาจยังโหลดไม่เสร็จตอนผู้ใช้กดเร็วๆ — contentWindow ยังไม่พร้อมก็ข้ามไป
      // ไม่ต้อง throw เพราะแท็บที่กดค้างไว้จะถูกส่งซ้ำอีกทีตอน frame โหลดเสร็จ
      if (!frameEl.contentWindow) return;
      // targetOrigin เป็น origin ตัวเอง เพราะ iframe เสิร์ฟจากโดเมนเดียวกัน (ไม่ใช้ '*' โดยไม่จำเป็น)
      frameEl.contentWindow.postMessage({ type: 'aec_view_mode', mode }, location.origin);
    }

    tabsEl.addEventListener('click', e => {
      const tab = e.target.closest('.tab');
      if (!tab || !tab.dataset.view) return;
      tabsEl.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      send(tab.dataset.view);
    });

    // โลก 3D เพิ่งโหลดเสร็จ (หรือผู้ใช้รีเฟรชเฟรม) — ส่งโหมดที่เลือกค้างไว้ให้อีกครั้ง
    // ไม่งั้นแท็บจะโชว์ว่าเลือก Top View อยู่ แต่กล้องในโลกกลับเป็นมุมปกติ
    frameEl.addEventListener('load', () => {
      const active = tabsEl.querySelector('.tab.active');
      if (active && active.dataset.view && active.dataset.view !== 'third') send(active.dataset.view);
    });
  }

  return { mount };
})();
