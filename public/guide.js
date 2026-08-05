/* ============================================================
   AEC VERSE — คู่มือการใช้งานในแอป (กด "❓ วิธีใช้" ที่แถบล่างของโลก 3D)
   อธิบายทีละแผงว่าปุ่มไหนทำอะไร พร้อม "ตัวอย่างปุ่มจริง" วางไว้ข้างคำอธิบาย
   (วาดด้วย CSS ชุดเดียวกับปุ่มจริง จึงหน้าตาตรงกันเสมอแม้ในอนาคตจะแก้สไตล์)

   - หัวข้อ/ปุ่มที่เป็นของแอดมินเท่านั้น จะถูกซ่อนให้ผู้ใช้ทั่วไปอัตโนมัติ
     (อ่านสิทธิ์จาก window.AEC_IS_ADMIN ที่ app.js ตั้งให้ตอนเชื่อมต่อเซิร์ฟเวอร์)
   - แต่ละหัวข้อมีช่องใส่วิดีโอเตรียมไว้แล้ว เติม video: 'ชื่อไฟล์.mp4' ได้ทันที
   ============================================================ */
window.AecGuide = (function () {

  // btn = ตัวอย่างปุ่มที่จะวาดให้ดู | admin = เห็นเฉพาะแอดมิน
  const TOPICS = [
    {
      id: 'model', icon: '📦', title: 'แผงโมเดลโรงงาน',
      intro: 'ใช้เลือกว่าจะให้โลก 3D แสดงโมเดลโรงงานตัวไหน และเก็บ/กู้คืนงานที่ทำไว้',
      video: null,
      items: [
        { btn: '⬆️ เลือกไฟล์ .gltf / .glb / .fbx', style: 'primary', admin: true,
          desc: 'อัปโหลดโมเดล 3 มิติตัวใหม่เข้าโลก — อัปเสร็จทุกคนที่อยู่ในโลกจะเห็นพร้อมกันทันที ไฟล์ใหญ่ระบบจะถามยืนยันก่อนโหลด' },
        { btn: 'ใช้โมเดลนี้', style: 'outline',
          desc: 'เรียกโมเดลที่เคยอัปโหลดไว้ในคลังกลับมาใช้ ไม่ต้องอัปโหลดไฟล์ใหญ่ซ้ำอีกรอบ' },
        { btn: '🔄 รีเฟรชรายการ', style: 'ghost',
          desc: 'โหลดรายชื่อโมเดลในคลังใหม่ ใช้เมื่อเพิ่งมีคนอัปโหลดโมเดลเพิ่ม' },
        { btn: '💾 บันทึกฉากทั้งหมด (.zip)', style: 'primary', admin: true,
          desc: 'เซฟทั้งตัวโมเดลและข้อมูลความปลอดภัยที่กำหนดไว้ทุกชิ้นเป็นไฟล์เดียว เก็บไว้เป็นสำเนาสำรอง' },
        { btn: '📂 โหลดฉากที่บันทึกไว้ (.zip)', style: 'ghost', admin: true,
          desc: 'กู้คืนฉากที่เคยเซฟไว้ กลับมาเหมือนตอนบันทึกทุกอย่าง' }
      ]
    },
    {
      id: 'transform', icon: '🛠️', title: 'ปรับตำแหน่งโมเดล & โครงสร้างพื้นผิว',
      intro: 'การขยับ/หมุน/ย่อขยายโมเดลเป็นสิทธิ์ของแอดมิน เพราะมีผลกับทุกคนในโลกพร้อมกัน — ส่วนโหมดแสดงผลพื้นผิว ทุกคนปรับเองได้',
      video: null,
      items: [
        { btn: '🔓 ปลดล็อกเพื่อแก้ไข', style: 'ok', admin: true,
          desc: 'ค่าเริ่มต้นโมเดลถูกล็อกไว้กันขยับพลาด ต้องกดปลดล็อกก่อนจึงจะปรับตำแหน่งได้' },
        { btn: '↔ Move / ⟳ Rotate / ⤢ Scale', style: 'primary', admin: true,
          desc: 'เลือกโหมดของแกนสีที่ลากได้ในฉาก 3D — ย้ายตำแหน่ง / หมุน / ย่อ-ขยาย' },
        { btn: 'แถบเลื่อน X · Y · Z · หมุน · ขนาด', style: 'slider', admin: true,
          desc: 'ปรับด้วยตัวเลขแทนการลาก ใส่ค่าเองได้ไม่จำกัดช่วง เหมาะกับการจัดตำแหน่งให้เป๊ะ' },
        { btn: 'Solid · Wireframe · X-Ray', style: 'seg',
          desc: 'เปลี่ยนวิธีแสดงผลพื้นผิวโมเดล — Solid คือปกติ, Wireframe เห็นเป็นเส้นโครง, X-Ray โปร่งใสมองทะลุเข้าไปเห็นโครงสร้างข้างใน (ทุกคนใช้ได้)' }
      ]
    },
    {
      id: 'layers', icon: '🛡️', title: 'เลเยอร์ความปลอดภัย',
      intro: 'เปิด/ปิดชั้นข้อมูลความปลอดภัยที่วาดทับลงบนโมเดล อ้างอิงมาตรฐานโรงไฟฟ้าก๊าซชีวภาพ — ติ๊กเพื่อเปิด ติ๊กออกเพื่อซ่อน',
      video: null,
      items: [
        { btn: '☑ พื้นที่อันตราย Ex-Zone 0/1/2', style: 'check',
          desc: 'วงพื้นที่เสี่ยงติดไฟรอบอุปกรณ์ แยกระดับความอันตรายด้วยสี แดง / ส้ม / เหลือง' },
        { btn: '☑ ระยะปลอดภัย / ระยะร่น', style: 'check',
          desc: 'ระยะที่ต้องเว้นรอบอุปกรณ์ตามข้อกำหนด (เช่น บ่อหมัก ≥30 ม., หอเผา ≥7.5 ม.)' },
        { btn: '☑ รัศมีป้องกันฟ้าผ่า', style: 'check',
          desc: 'ขอบเขตที่เสาล่อฟ้าคุ้มครองถึง คำนวณแบบ Rolling Sphere รัศมี ~20 ม.' },
        { btn: '☑ วงเตือนสวม PPE (15 ม.)', style: 'check',
          desc: 'วงรอบอุปกรณ์ที่ต้องสวมอุปกรณ์ป้องกันก่อนเข้า เดินเข้าไปแล้วระบบจะเตือนในแชท' },
        { btn: '☑ ป้ายเตือนลอยเหนืออุปกรณ์', style: 'check',
          desc: 'ป้ายวงกลมลอยเหนือชิ้นส่วน เดินเข้าใกล้แล้วป้ายจะกางออกบอกรายละเอียด' },
        { btn: '📏 วัดระยะ (คลิก 2 จุด)', style: 'ghost',
          desc: 'วัดระยะจริงระหว่างสองจุดในแบบจำลอง มีหน่วยเป็นเมตร ใช้ตรวจว่าระยะร่นพอไหม' },
        { btn: '📍 ปักจุด (คลิกในฉาก)', style: 'cyan',
          desc: 'กดปุ่มแล้วคลิกตรงไหนในฉากก็ได้ จุดจะไปวางตรงนั้นพอดี ไม่ต้องเลือกชิ้นส่วนก่อน — ตั้งชื่อ สี รูปทรง (วงกลม/สี่เหลี่ยม/สามเหลี่ยม) และขนาดป้ายเองได้ ขนาดที่ตั้งจะคงที่ ไม่โตตามขนาดโมเดล' },
        { btn: '🛟 ตั้งจุดระยะปลอดภัย', style: 'ghost',
          desc: 'ปุ่มลายทแยงเหลือง — คลิกในฉากเพื่อวาง "จุดศูนย์กลาง" ของเขตปลอดภัย แล้วลากตั้งรัศมี หรือกด 🎯 คลิกกำหนดรัศมีในฉากก็ได้ ระบบจะบอกระยะเส้นรอบรูปและพื้นที่ให้ทันที วงเขตจะแสดงเฉพาะมุมมอง Top View และจะประกาศในแชทเมื่อมีคนเข้า/ออกเขต' }
      ]
    },
    {
      id: 'parts', icon: '🧩', title: 'รายชื่อชิ้นส่วน & มุมกล้อง',
      intro: 'จุดที่คนใหม่มักงงที่สุด — มี 2 วิธีเปิดดูข้อมูลของชิ้นส่วน และทั้งสองวิธีให้ผลเหมือนกัน',
      highlight: 'คลิกที่ตัวโมเดลในฉาก 3D ตรงๆ ก็เปิดข้อมูลได้เหมือนกัน ไม่จำเป็นต้องหาจากรายการเสมอไป',
      video: null,
      items: [
        { btn: '🔍 ค้นหาชิ้นส่วน...', style: 'input',
          desc: 'พิมพ์ชื่อเพื่อกรองรายการ เมื่อโมเดลมีชิ้นส่วนเยอะมาก' },
        { btn: '⚪ Object_9', style: 'listitem',
          desc: 'คลิกชื่อในรายการ = เลือกชิ้นนั้นและเปิดป้ายข้อมูลของมันขึ้นมา' },
        { btn: '👆 คลิกที่ตัวโมเดลในฉาก', style: 'ghost',
          desc: 'วิธีที่เร็วกว่า — ชี้แล้วคลิกที่ชิ้นส่วนในโลก 3D ได้เลย จะอยู่ไกลแค่ไหนก็คลิกได้ และถ้าเดินตัวละครไปชนก็เด้งข้อมูลขึ้นเองเหมือนกัน' },
        { btn: '3D View · Top View · First Person', style: 'seg',
          desc: 'สลับมุมกล้อง — 3D คือกล้องตามหลังตัวละคร, Top View มองจากด้านบนลงมา, First Person มองผ่านสายตาตัวละครเอง' }
      ]
    },
    {
      id: 'info', icon: '⚙️', title: 'ป้ายข้อมูลชิ้นส่วน (ปุ่มด้านบนป้าย)',
      intro: 'ป้ายนี้จะเด้งขึ้นเมื่อเลือกชิ้นส่วน ด้านบนมีปุ่มทำงานกับชิ้นนั้นโดยเฉพาะ',
      video: null,
      items: [
        { btn: '🚶 เดินไปที่นี่', style: 'ok',
          desc: 'สั่งให้ตัวละครเดินไปหาชิ้นส่วนนั้นเองอัตโนมัติ มีลูกศรบอกทิศระหว่างเดิน ไม่ต้องกดเดินเอง' },
        { btn: '📍 กำหนดจุด', style: 'cyan',
          desc: 'ปักหมุดที่ชิ้นนั้น ตั้งชื่อ สี รูปทรง ขนาด และรัศมีเขตปลอดภัยได้ ป้ายจะลอยอยู่เหนือจุด เดินเข้าใกล้แล้วเห็นชื่อ — คนอื่นเห็นด้วยและไม่หายหลังรีเฟรช (ถ้าอยากวางจุดตรงตำแหน่งอื่นที่ไม่ใช่ชิ้นส่วน ใช้ปุ่ม 📍 ปักจุด ในแท็บเลเยอร์แทน)' },
        { btn: 'กำหนด Type', style: 'purple', admin: true,
          desc: 'ระบุว่าชิ้นนี้เป็นอุปกรณ์ประเภทไหน (ถังหมัก / ท่อ / หอเผา ฯลฯ) แล้วระบบจะดึงข้อมูลความปลอดภัยมาตรฐานของประเภทนั้นมาใส่ให้ พร้อมวาดวง Ex-Zone / PPE ให้อัตโนมัติ' },
        { btn: 'แก้ไขข้อมูล', style: 'outline', admin: true,
          desc: 'พิมพ์แก้ชื่อ คำอธิบาย และข้อกำหนดความปลอดภัยของชิ้นนั้นเอง ข้อมูลจะถูกบันทึกไว้และคนอื่นเห็นตรงกัน' }
      ]
    }
  ];

  const isAdmin = () => !!window.AEC_IS_ADMIN;
  let built = false, activeId = TOPICS[0].id;

  function injectStyle() {
    if (document.getElementById('aec-guide-style')) return;
    const s = document.createElement('style');
    s.id = 'aec-guide-style';
    s.textContent = `
      #aec-guide-overlay{position:fixed;inset:0;z-index:9998;display:none;align-items:center;justify-content:center;
        background:rgba(4,6,10,.74);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);padding:16px;}
      #aec-guide-overlay.open{display:flex;}
      .agd-modal{background:#0e131c;border:1px solid #1c2531;border-radius:16px;width:900px;max-width:100%;
        max-height:88vh;display:flex;flex-direction:column;box-shadow:0 26px 70px rgba(0,0,0,.6);overflow:hidden;}
      .agd-head{display:flex;align-items:center;justify-content:space-between;gap:10px;
        padding:15px 18px;border-bottom:1px solid #1c2531;flex-shrink:0;}
      .agd-head h3{margin:0;font-size:15px;font-weight:800;color:#eef2f7;font-family:"Sora",sans-serif;}
      .agd-head p{margin:3px 0 0;font-size:11.5px;color:#657182;}
      .agd-x{background:none;border:none;color:#657182;font-size:20px;cursor:pointer;padding:4px 6px;border-radius:6px;line-height:1;}
      .agd-x:hover{color:#eef2f7;background:#111826;}
      .agd-body{display:flex;min-height:0;flex:1;}
      .agd-nav{width:210px;flex-shrink:0;border-right:1px solid #1c2531;padding:10px;overflow-y:auto;background:#0b0f17;}
      .agd-nav button{display:flex;align-items:center;gap:9px;width:100%;text-align:left;background:none;border:none;
        color:#9aa7b8;font-family:inherit;font-size:12.5px;font-weight:600;padding:10px 11px;border-radius:9px;cursor:pointer;
        border-left:2px solid transparent;}
      .agd-nav button:hover{background:#111826;color:#eef2f7;}
      .agd-nav button.on{background:rgba(59,130,246,.14);color:#8fb8ff;border-left-color:#3b82f6;}
      .agd-nav .agd-badge{margin-left:auto;font-size:9px;font-weight:800;color:#a78bfa;background:rgba(167,139,250,.16);
        padding:2px 6px;border-radius:20px;}
      .agd-content{flex:1;min-width:0;overflow-y:auto;padding:18px 20px 22px;}
      .agd-content h4{margin:0 0 6px;font-size:15px;font-weight:800;color:#eef2f7;font-family:"Sora",sans-serif;}
      .agd-intro{margin:0 0 14px;font-size:12.5px;color:#9aa7b8;line-height:1.7;}
      .agd-tip{background:rgba(34,211,238,.10);border-left:3px solid #22d3ee;border-radius:0 9px 9px 0;
        padding:10px 12px;font-size:12px;color:#bde9f5;line-height:1.65;margin-bottom:14px;}
      .agd-row{display:flex;gap:13px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #161d29;}
      .agd-row:last-child{border-bottom:none;}
      .agd-demo{flex-shrink:0;width:210px;display:flex;align-items:center;}
      .agd-desc{font-size:12.5px;color:#9aa7b8;line-height:1.7;flex:1;min-width:0;}
      .agd-onlyadmin{font-size:9px;font-weight:800;color:#a78bfa;background:rgba(167,139,250,.16);
        padding:2px 6px;border-radius:20px;margin-left:6px;vertical-align:2px;}
      /* ---- ตัวอย่างปุ่ม (เลียนแบบสไตล์ปุ่มจริงในแอป) ---- */
      .agd-b{display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 12px;border-radius:8px;
        font-size:11.5px;font-weight:700;font-family:inherit;line-height:1.3;text-align:center;
        border:1px solid #1c2531;background:#111826;color:#eef2f7;width:100%;}
      .agd-b.primary{background:linear-gradient(90deg,#3b82f6,#22c55e);color:#04150b;border:none;}
      .agd-b.ok{background:rgba(34,197,94,.14);border-color:rgba(34,197,94,.4);color:#4ade80;}
      .agd-b.cyan{background:rgba(34,211,238,.14);border-color:rgba(34,211,238,.4);color:#22d3ee;}
      .agd-b.purple{background:rgba(168,85,247,.14);border-color:rgba(168,85,247,.4);color:#c084fc;}
      .agd-b.outline{background:transparent;}
      .agd-b.ghost{background:#0b0f17;color:#9aa7b8;}
      .agd-b.input{justify-content:flex-start;background:#0b0f17;color:#657182;font-weight:500;}
      .agd-b.listitem{justify-content:flex-start;background:#0b0f17;color:#eef2f7;font-weight:500;}
      .agd-b.check{justify-content:flex-start;background:#0b0f17;color:#cfe0f0;font-weight:600;}
      .agd-seg{display:flex;gap:3px;background:#111826;border:1px solid #1c2531;border-radius:9px;padding:3px;width:100%;}
      .agd-seg span{flex:1;text-align:center;font-size:10.5px;font-weight:700;color:#657182;padding:6px 4px;border-radius:7px;}
      .agd-seg span:first-child{background:#3b82f6;color:#fff;}
      .agd-slider{width:100%;height:6px;border-radius:4px;background:#1a2330;position:relative;}
      .agd-slider::after{content:"";position:absolute;left:44%;top:-5px;width:16px;height:16px;border-radius:50%;background:#3b82f6;}
      .agd-video{margin-top:16px;border:1px dashed #243347;border-radius:12px;padding:16px;text-align:center;
        color:#657182;font-size:11.5px;line-height:1.7;background:#0b0f17;}
      .agd-video video{width:100%;border-radius:9px;display:block;}
      .agd-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;
        padding:11px 18px;border-top:1px solid #1c2531;flex-shrink:0;background:#0b0f17;}
      .agd-foot label{display:flex;align-items:center;gap:7px;font-size:11.5px;color:#9aa7b8;cursor:pointer;}
      .agd-foot button{background:linear-gradient(90deg,#3b82f6,#22c55e);border:none;color:#04150b;
        font-family:inherit;font-size:12.5px;font-weight:800;padding:9px 20px;border-radius:9px;cursor:pointer;}
      /* ปุ่ม "?" ลอยมุมขวาบนของฉาก 3D — ทางเข้าคู่มือที่มีอยู่เสมอ
         จำเป็นเพราะแถบปุ่มด้านล่าง (#keybind-hud) ถูกซ่อนทั้งแถบบนจอเล็กแนวนอน
         ถ้าไม่มีปุ่มนี้ ผู้ใช้มือถือที่ติ๊ก "ไม่ต้องแสดงอีก" จะเปิดคู่มือกลับมาไม่ได้เลย
         วางไว้ใน #canvas-container จึงไม่ทับแผงข้างซ้าย/ขวาไม่ว่าจอกว้างแค่ไหน */
      .agd-fab{position:absolute;top:10px;right:10px;z-index:40;
        width:34px;height:34px;border-radius:50%;cursor:pointer;
        display:flex;align-items:center;justify-content:center;
        background:rgba(14,19,28,.85);border:1px solid #1c2531;color:#9aa7b8;
        font-size:15px;font-weight:800;font-family:inherit;
        backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);}
      .agd-fab:hover{color:#eef2f7;border-color:#33475e;background:rgba(28,37,49,.92);}
      @media (max-width:760px){
        .agd-body{flex-direction:column;}
        .agd-nav{width:auto;display:flex;gap:6px;overflow-x:auto;border-right:none;border-bottom:1px solid #1c2531;}
        .agd-nav button{white-space:nowrap;width:auto;border-left:none;border-bottom:2px solid transparent;}
        .agd-nav button.on{border-left:none;border-bottom-color:#3b82f6;}
        .agd-row{flex-direction:column;gap:8px;}
        .agd-demo{width:100%;}
      }
    `;
    document.head.appendChild(s);
  }

  function demoHtml(item) {
    if (item.style === 'seg') {
      return `<div class="agd-seg">${item.btn.split('·').map(t => `<span>${t.trim()}</span>`).join('')}</div>`;
    }
    if (item.style === 'slider') return `<div style="width:100%;"><div class="agd-slider"></div></div>`;
    return `<span class="agd-b ${item.style || ''}">${item.btn}</span>`;
  }

  function visibleTopics() { return TOPICS.filter(t => !t.admin || isAdmin()); }

  function render() {
    const nav = document.getElementById('agd-nav');
    const content = document.getElementById('agd-content');
    if (!nav || !content) return;
    const topics = visibleTopics();
    if (!topics.some(t => t.id === activeId)) activeId = topics[0].id;

    nav.innerHTML = topics.map((t, i) =>
      `<button data-id="${t.id}" class="${t.id === activeId ? 'on' : ''}">
         <span>${t.icon}</span><span>${i + 1}. ${t.title}</span>
       </button>`).join('');
    nav.querySelectorAll('button').forEach(b =>
      b.addEventListener('click', () => { activeId = b.dataset.id; render(); document.getElementById('agd-content').scrollTop = 0; }));

    const t = topics.find(x => x.id === activeId);
    // ปุ่มที่เป็นสิทธิ์แอดมิน ผู้ใช้ทั่วไปไม่ต้องเห็น จะได้ไม่สับสนว่าทำไมกดไม่ได้
    const items = t.items.filter(it => !it.admin || isAdmin());
    content.innerHTML =
      `<h4>${t.icon} ${t.title}</h4>
       <p class="agd-intro">${t.intro}</p>
       ${t.highlight ? `<div class="agd-tip">💡 ${t.highlight}</div>` : ''}
       ${items.map(it => `
         <div class="agd-row">
           <div class="agd-demo">${demoHtml(it)}</div>
           <div class="agd-desc">${it.desc}${it.admin ? '<span class="agd-onlyadmin">แอดมิน</span>' : ''}</div>
         </div>`).join('')}
       <div class="agd-video">${t.video
          ? `<video src="${t.video}" controls playsinline preload="none"></video>`
          : '🎬 คลิปสาธิตหัวข้อนี้ — ยังไม่ได้ใส่<br><span style="font-size:10.5px;">เพิ่มได้โดยใส่ชื่อไฟล์วิดีโอในหัวข้อนี้ที่ guide.js</span>'}</div>`;
  }

  function build() {
    if (built) return;
    injectStyle();
    const o = document.createElement('div');
    o.id = 'aec-guide-overlay';
    o.innerHTML = `
      <div class="agd-modal" role="dialog" aria-label="คู่มือการใช้งาน">
        <div class="agd-head">
          <div>
            <h3>📖 คู่มือการใช้งาน</h3>
            <p>แต่ละปุ่มในหน้านี้ทำอะไรได้บ้าง — เลือกหัวข้อทางซ้าย</p>
          </div>
          <button class="agd-x" id="agd-close" aria-label="ปิด">✕</button>
        </div>
        <div class="agd-body">
          <div class="agd-nav" id="agd-nav"></div>
          <div class="agd-content" id="agd-content"></div>
        </div>
        <div class="agd-foot">
          <label><input type="checkbox" id="agd-dont"> ไม่ต้องแสดงคู่มือนี้อัตโนมัติอีก</label>
          <button id="agd-done">เข้าใจแล้ว เริ่มใช้งาน</button>
        </div>
      </div>`;
    document.body.appendChild(o);

    o.addEventListener('click', e => { if (e.target === o) close(); });
    document.getElementById('agd-close').addEventListener('click', close);
    document.getElementById('agd-done').addEventListener('click', close);
    document.getElementById('agd-dont').addEventListener('change', e => {
      try { localStorage.setItem('aec_guide_hidden', e.target.checked ? '1' : '0'); } catch (err) {}
    });
    addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    built = true;
  }

  function open() {
    build();
    try { document.getElementById('agd-dont').checked = localStorage.getItem('aec_guide_hidden') === '1'; } catch (e) {}
    render();
    document.getElementById('aec-guide-overlay').classList.add('open');
  }
  function close() {
    const o = document.getElementById('aec-guide-overlay');
    if (o) o.classList.remove('open');
  }

  // ปุ่ม "?" ลอยมุมขวาบนของฉาก — ทางเข้าคู่มือที่มีเสมอ ไม่ว่าแถบปุ่มด้านล่างจะถูกซ่อนหรือไม่
  function mountFab() {
    if (document.querySelector('.agd-fab')) return;
    injectStyle();
    const host = document.getElementById('canvas-container') || document.body;
    const fab = document.createElement('button');
    fab.className = 'agd-fab';
    fab.type = 'button';
    fab.textContent = '?';
    fab.title = 'คู่มือการใช้งาน — แต่ละปุ่มทำอะไรได้บ้าง';
    fab.setAttribute('aria-label', 'เปิดคู่มือการใช้งาน');
    if (host === document.body) fab.style.position = 'fixed';
    fab.addEventListener('click', open);
    host.appendChild(fab);
  }

  // เปิดให้เองครั้งแรกที่ผู้ใช้เข้ามา (จนกว่าจะติ๊ก "ไม่ต้องแสดงอีก")
  // หน่วงไว้ให้โลก 3D กับสิทธิ์ผู้ใช้โหลดเสร็จก่อน คู่มือจะได้แสดงหัวข้อตรงกับสิทธิ์จริง
  function autoOpenOnce() {
    mountFab();   // ปุ่ม "?" ต้องมีเสมอ แม้ผู้ใช้จะปิดการแสดงอัตโนมัติไปแล้ว
    let hidden = false;
    try { hidden = localStorage.getItem('aec_guide_hidden') === '1'; } catch (e) {}
    if (hidden) return;
    setTimeout(open, 2500);
  }

  return { open, close, autoOpenOnce, mountFab, refresh: () => { if (built) render(); }, TOPICS };
})();
