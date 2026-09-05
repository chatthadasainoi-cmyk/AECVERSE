/* ============================================================
   AEC VERSE — ตัวสร้างตัวละคร (ใช้ร่วมกันทุกหน้า)
   เดิมโค้ดก้อนนี้อยู่ในหน้า Avatar.html หน้าเดียว พอจะให้ผู้ใช้ทั่วไปสร้างร่างได้ด้วย
   ทางเลือกคือก๊อปไปวางอีกหน้า ซึ่งเป็นต้นเหตุบั๊กซ้ำๆ ของระบบร่างตัวละครมาตลอด
   (รายชื่อร่างตายตัวเคยกระจายอยู่ 5 ที่ แก้ที่เดียวไม่พอ อาการจึงหายไม่ขาด)

   ที่นี่จึงเป็นชุดเดียว ทั้งกล่อง modal สไตล์ และตรรกะทั้งหมด
   หน้าไหนอยากมีปุ่มสร้างตัวละคร ก็แค่:
     AecAvatarCreator.mount(ปุ่ม, {
       canImportFile: true/false,          // หน้านั้นมีปุ่มอัปไฟล์ .glb ด้วยไหม
       onSaved: async avatar => { ... }    // ร่างใหม่เข้าทะเบียนแล้ว
     });
   ============================================================ */
window.AecAvatarCreator = (function () {

  let modal = null, frameBox = null, statusEl = null;

  function injectStyle() {
    if (document.getElementById('aec-creator-style')) return;
    const s = document.createElement('style');
    s.id = 'aec-creator-style';
    s.textContent = `
      #aec-creator-modal{display:none;position:fixed;inset:0;background:rgba(4,7,12,.85);z-index:1000;
        align-items:center;justify-content:center;padding:16px;}
      #aec-creator-modal.on{display:flex;}
      .acr-box{width:min(940px,100%);height:min(680px,calc(100vh - 32px));background:var(--panel);
        border:1px solid var(--border);border-radius:14px;overflow:hidden;display:flex;flex-direction:column;}
      .acr-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 14px;
        border-bottom:1px solid var(--border-soft);}
      .acr-head b{font-size:13.5px;font-weight:800;color:var(--text-0);display:block;}
      .acr-head span{font-size:10.5px;color:var(--text-2);margin-top:2px;display:block;line-height:1.5;}
      .acr-head button{background:none;border:none;color:var(--text-2);font-size:18px;cursor:pointer;
        font-family:inherit;line-height:1;padding:2px 6px;}
      .acr-frame{flex:1;min-height:0;position:relative;background:#0b0f17;}
      .acr-status{padding:10px 14px;font-size:11.5px;color:var(--text-2);
        border-top:1px solid var(--border-soft);min-height:18px;line-height:1.6;}
    `;
    document.head.appendChild(s);
  }

  // กล่องมีชุดเดียวต่อหน้า ต่อให้ mount หลายปุ่มก็ใช้กล่องเดิม
  function ensureModal() {
    if (modal) return;
    injectStyle();
    modal = document.createElement('div');
    modal.id = 'aec-creator-modal';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'สร้างตัวละครของคุณ');
    modal.innerHTML = `
      <div class="acr-box">
        <div class="acr-head">
          <div>
            <b>สร้างตัวละครของคุณ</b>
            <span>เลือกทรงผม รูปหน้า สีผิว เสื้อผ้า แล้วกดปุ่มยืนยันของตัวสร้าง — ร่างจะถูกดึงกลับมาเก็บในระบบเรา</span>
          </div>
          <button type="button" data-close aria-label="ปิด">✕</button>
        </div>
        <div class="acr-frame"><div id="avaturn-sdk-container" style="width:100%;height:100%;border:none;"></div></div>
        <div class="acr-status"></div>
      </div>`;
    document.body.appendChild(modal);
    frameBox = modal.querySelector('.acr-frame');
    statusEl = modal.querySelector('.acr-status');

    modal.querySelector('[data-close]').addEventListener('click', close);
    modal.addEventListener('click', e => { if (e.target === modal) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && modal.classList.contains('on')) close(); });
  }

  const say = (t, tone) => {
    if (!statusEl) return;
    statusEl.innerHTML = t || '';
    statusEl.style.color = tone === 'bad' ? 'var(--red)' : tone === 'ok' ? 'var(--green)' : 'var(--text-2)';
  };

  function close() {
    if (!modal) return;
    modal.classList.remove('on');
    if (window.AecAvatarImport) AecAvatarImport.closeCreator();
    const c = document.getElementById('avaturn-sdk-container');
    if (c) c.innerHTML = '';        // ถอด iframe ทิ้ง ไม่ให้ค้างกินหน่วยความจำ
    say('');
  }

  // ตัวสร้างเปิดไม่ได้ (ยังไม่ตั้ง subdomain หรือเน็ตเข้าไม่ถึง) -> อธิบายเองในกล่อง
  // ไม่ปล่อยให้เบราว์เซอร์โชว์หน้า "server IP address could not be found" ซึ่งผู้ใช้ทำอะไรต่อไม่ถูก
  function showUnavailable(reason, canImportFile) {
    // ทางออกสำรองต่างกันตามสิทธิ์ของหน้านั้น — บอกให้ไปกดปุ่มที่หน้านั้นไม่มีคือทำให้งงเปล่าๆ
    const fallback = canImportFile
      ? '<b>ระหว่างนี้ยังสร้างตัวละครเองได้</b><br>' +
        'ปั้นร่างจากที่ไหนก็ได้ที่ส่งออกเป็นไฟล์ <b>.glb</b> ได้ (Ready Player Me, VRoid Studio, Blender) ' +
        'แล้วใช้ปุ่ม <b>“เลือกไฟล์ .glb”</b> ด้านล่างอัปเข้ามา — ระบบตรวจโครงกระดูกให้เหมือนกันทุกอย่าง'
      : '<b>ระหว่างนี้ยังเลือกร่างสำเร็จรูปไปใช้ได้ตามปกติ</b><br>' +
        'ถ้าอยากได้ร่างที่ปั้นเอง แจ้งผู้ดูแลระบบให้เปิดตัวสร้างหรือช่วยนำเข้าไฟล์ให้ได้';
    frameBox.innerHTML = `
      <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;
                  gap:12px;text-align:center;padding:28px;">
        <div style="font-size:32px;">🧩</div>
        <div style="font-size:14px;font-weight:800;color:var(--text-0);">ยังใช้ตัวสร้างตัวละครไม่ได้</div>
        <div style="font-size:12px;color:var(--text-2);line-height:1.75;max-width:440px;">${reason}</div>
        <div style="font-size:11.5px;color:var(--text-1);line-height:1.75;max-width:440px;
                    background:var(--panel-2);border:1px solid var(--border);border-radius:10px;padding:12px 14px;">
          ${fallback}
        </div>
      </div>`;
  }

  // ตั้งชื่อจากวันที่ + เวลา — เดิมใช้แค่วันที่ สร้างวันเดียวกันหลายร่างจึงชื่อซ้ำจนแยกไม่ออก
  function defaultName() {
    const now = new Date();
    return 'ร่างของฉัน ' + now.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }) +
      ' ' + now.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
  }

  async function open(opts) {
    ensureModal();
    const canImportFile = !!(opts && opts.canImportFile);
    modal.classList.add('on');
    say('กำลังตรวจการเชื่อมต่อ...');

    if (!window.AecAvatarImport) {
      say('');
      showUnavailable('โหลดส่วนนำเข้าร่างไม่สำเร็จ — ลองรีเฟรชหน้าอีกครั้ง', canImportFile);
      return;
    }
    if (!AecAvatarImport.isConfigured()) {
      say('');
      showUnavailable('ยังไม่ได้ตั้งค่าตัวสร้างตัวละคร — ผู้ดูแลระบบใส่ชื่อ subdomain ลงในไฟล์ <b>app-config.js</b> ก่อน', canImportFile);
      return;
    }
    if (!(await AecAvatarImport.creatorReachable())) {
      say('');
      showUnavailable('เปิด <b>' + AecAvatarImport.creatorOrigin + '</b> ไม่ได้ — อาจเป็นเพราะเครือข่ายนี้เข้าเว็บภายนอกไม่ได้ ' +
        'หรือ subdomain ที่ตั้งไว้ไม่ถูกต้อง', canImportFile);
      return;
    }

    say('กำลังเปิดตัวสร้าง...');
    // showUnavailable อาจเคยวาดทับกล่องนี้ไป ต้องสร้าง container ของ SDK คืนก่อนใช้
    frameBox.innerHTML = '<div id="avaturn-sdk-container" style="width:100%;height:100%;border:none;"></div>';
    const container = document.getElementById('avaturn-sdk-container');
    const btn = opts && opts.button;
    try {
      await AecAvatarImport.openCreator(container, async url => {
        // ผู้ใช้กดยืนยันร่างแล้ว — ดึงไฟล์มาเก็บที่ระบบเราและลงทะเบียนให้
        if (btn) btn.disabled = true;
        try {
          const r = await AecAvatarImport.importFromUrl(url, defaultName(), say);
          say('เพิ่มร่างเรียบร้อย' + (r.info.rigged ? ' — เดินได้ปกติ' : ' — ไม่มีโครงกระดูก จึงยืนนิ่ง'), r.info.rigged ? 'ok' : 'bad');
          if (opts && typeof opts.onSaved === 'function') await opts.onSaved(r.avatar, r.info);
          setTimeout(close, 1400);
        } catch (err) { say(err.message || 'บันทึกร่างไม่สำเร็จ', 'bad'); }
        finally { if (btn) btn.disabled = false; }
      });
      say('เลือกรูปร่าง ทรงผม และเสื้อผ้าได้เลย — เสร็จแล้วกดปุ่มยืนยันในตัวสร้าง' +
        (AecAvatarImport.usingDemo() ? ' · โปรเจกต์ทดลอง (demo) จะให้สมัคร/ล็อกอิน Avaturn ก่อนหนึ่งครั้ง' : ''));
    } catch (err) {
      say('');
      showUnavailable('โหลดตัวสร้างไม่สำเร็จ: ' + (err && err.message ? err.message : 'ไม่ทราบสาเหตุ'), canImportFile);
    }
  }

  function mount(button, opts) {
    if (!button) return;
    button.addEventListener('click', () => open({ ...(opts || {}), button }));
  }

  return { mount, open, close };
})();
