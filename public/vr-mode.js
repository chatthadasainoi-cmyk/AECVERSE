/* ============================================================
   AEC VERSE — โหมด VR (WebXR)
   สวมแว่นแล้วเดินสำรวจโรงงานได้จริง ใช้ WebXR Device API ที่ Three.js r128
   รองรับอยู่แล้ว จึงไม่ต้องเปลี่ยนเอนจิ้นหรือ export ใหม่

   สามอย่างที่ต้องมีตามหลักการ VR บนเว็บ:
     1. ปุ่มเข้าโหมด VR              -> ปุ่มลอยมุมขวาบน ขึ้นเฉพาะเครื่องที่รองรับจริง
     2. เรนเดอร์สองตา (stereoscopic) -> renderer.xr.enabled + setAnimationLoop
     3. คอนโทรลเลอร์                 -> อนาล็อกเดินลื่น + ไกวาร์ปไปจุดที่เล็ง

   ทำเป็นไฟล์แยกและไม่แตะโค้ดเดิมเลยนอกจากบรรทัดเดียวในลูปวาดภาพ
   ถ้าไฟล์นี้โหลดไม่สำเร็จหรือเครื่องไม่รองรับ VR ทุกอย่างยังทำงานเหมือนเดิมทุกประการ

   ต้องเปิดผ่าน HTTPS เท่านั้น (WebXR บังคับ) ซึ่ง Railway ให้อยู่แล้ว
   ============================================================ */
window.AecVR = (function () {

  let dolly = null;          // "แท่นยืน" ของผู้เล่นในโลก VR — ขยับอันนี้ = ผู้เล่นเคลื่อนที่
  let session = null;
  let controllers = [];
  let marker = null;         // วงกลมบอกจุดที่จะวาร์ปไป
  let aimHit = null;         // จุดที่ลำแสงชนอยู่ตอนนี้
  let aimMesh = null;        // ชิ้นส่วนที่ลำแสงชน — ใช้ตอนจิ้มดูข้อมูล
  let ready = false;

  const SPEED = 2.4;         // เมตรต่อวินาที ตอนเดินด้วยอนาล็อก
  const DEADZONE = 0.15;     // ปัดค่าอนาล็อกที่สั่นเองรอบๆ ศูนย์ทิ้ง

  const _fwd = new THREE.Vector3();
  const _right = new THREE.Vector3();
  const _rayOrigin = new THREE.Vector3();
  const _rayDir = new THREE.Vector3();
  const _mat = new THREE.Matrix4();
  const raycaster = new THREE.Raycaster();

  function say(text, color) {
    if (typeof mpAppendChat === 'function') mpAppendChat({ name: '🥽 VR', color: color || '#a855f7', text });
  }

  // ---------- ปุ่มเข้า VR ----------
  function injectStyle() {
    if (document.getElementById('aec-vr-style')) return;
    const s = document.createElement('style');
    s.id = 'aec-vr-style';
    s.textContent = `
      #vr-enter{position:absolute;top:14px;right:14px;z-index:70;display:none;align-items:center;gap:7px;
        padding:9px 14px;border-radius:10px;cursor:pointer;font-family:inherit;font-size:12px;font-weight:800;
        background:linear-gradient(135deg,#7c3aed,#a855f7);color:#fff;border:none;
        box-shadow:0 6px 20px rgba(168,85,247,.35);}
      #vr-enter:hover{filter:brightness(1.1);}
      #vr-enter.on{display:inline-flex;}
      #vr-enter.busy{opacity:.6;cursor:default;}
      /* เข้า VR ไม่ได้ก็ยังโชว์ปุ่มไว้ แต่ทำให้ดูจางลงและบอกสาเหตุตอนกด
         ดีกว่าซ่อนหายจนผู้ใช้เห็นจอเปล่าแล้วไม่รู้ว่าเกิดอะไรขึ้น */
      #vr-enter.off{background:rgba(148,163,184,.22);color:var(--text-1,#9aa7b8);
        box-shadow:none;font-weight:700;}
      #vr-hint{position:absolute;top:56px;right:14px;z-index:70;display:none;max-width:250px;
        padding:9px 12px;border-radius:9px;background:rgba(4,7,12,.9);border:1px solid var(--border,#1c2531);
        color:var(--text-1,#9aa7b8);font-size:10.5px;line-height:1.65;}
      #vr-hint.on{display:block;}
    `;
    document.head.appendChild(s);
  }

  function mountButton() {
    injectStyle();
    const host = document.getElementById('canvas-container');
    if (!host || document.getElementById('vr-enter')) return;
    const btn = document.createElement('button');
    btn.id = 'vr-enter';
    btn.type = 'button';
    btn.innerHTML = '🥽 <span>เข้าโหมด VR</span>';
    host.appendChild(btn);
    const hint = document.createElement('div');
    hint.id = 'vr-hint';
    hint.textContent = 'อนาล็อกซ้าย = เดิน · เหนี่ยวไกเล็งอุปกรณ์แล้วปล่อย = ดูข้อมูลที่ข้อมือ (จิ้มซ้ำได้เรื่อยๆ เล็งที่ว่างแล้วปล่อย = ปิดป้าย) · ปุ่มบีบเล็งพื้นแล้วปล่อย = วาร์ป';
    host.appendChild(hint);
    btn.addEventListener('click', toggle);

    // ปุ่มต้องโผล่เสมอ
    //
    // เดิมซ่อนปุ่มไว้ถ้า isSessionSupported ตอบว่าไม่รองรับ ผลคือผู้ใช้ที่ใส่แว่นจริง
    // เห็นแค่หน้าเว็บแบนๆ ลอยอยู่ ไม่มีอะไรให้กด และไม่รู้ว่าทำไม
    // สาเหตุที่เจอจริง: หน้าเว็บถูกฝังใน iframe ที่ไม่ได้ให้สิทธิ์ xr-spatial-tracking
    // เบราว์เซอร์จึงตอบว่าไม่รองรับทั้งที่แว่นรองรับเต็มที่
    //
    // ตอนนี้โชว์ปุ่มเสมอแล้วบอกสาเหตุตรงๆ ตอนกด — รู้ปัญหาได้ทันทีดีกว่าจอเปล่า
    btn.classList.add('on');
    refreshSupport();
  }

  // ตรวจว่าเครื่องนี้เข้า VR ได้ไหม แล้วปรับข้อความบนปุ่มให้ตรงความจริง
  let vrSupported = null;      // null = ยังไม่รู้ผล
  function refreshSupport() {
    const btn = document.getElementById('vr-enter');
    const label = btn && btn.querySelector('span');
    if (!navigator.xr || !navigator.xr.isSessionSupported) {
      vrSupported = false;
      if (label) label.textContent = 'เบราว์เซอร์นี้ไม่รองรับ VR';
      if (btn) btn.classList.add('off');
      return Promise.resolve(false);
    }
    return navigator.xr.isSessionSupported('immersive-vr').then(yes => {
      vrSupported = !!yes;
      if (label) label.textContent = yes ? 'เข้าโหมด VR' : 'กดเพื่อเปิดโลกแบบเต็มหน้า';
      if (btn) btn.classList.toggle('off', !yes);
      return vrSupported;
    }).catch(() => { vrSupported = false; return false; });
  }

  // อยู่ใน iframe หรือเปล่า — ถ้าใช่และเข้า VR ไม่ได้ ให้เปิดหน้าโลกตรงๆ แทน
  // WebXR ทำงานได้ดีที่สุดตอนเป็นหน้าบนสุด ไม่ได้ถูกฝังในหน้าอื่น
  const inFrame = () => { try { return window.self !== window.top; } catch (e) { return true; } };

  function openWorldDirectly() {
    const url = window.location.pathname.replace(/[^/]*$/, 'index.html');
    try { window.top.location.href = url; }
    catch (e) { window.open(url, '_blank', 'noopener'); }
  }

  // ---------- แท่นยืนของผู้เล่น ----------
  // ในโหมด VR ตำแหน่งกล้องถูกแว่นกำหนดเอง เราแตะ camera.position ตรงๆ ไม่ได้
  // วิธีมาตรฐานคือเอากล้องไปไว้ในกลุ่ม แล้วขยับกลุ่มแทน
  // ตอนอยู่โหมดปกติ กลุ่มนี้อยู่ที่จุดกำเนิดและไม่หมุน กล้องจึงทำงานเหมือนเดิมทุกอย่าง
  function ensureDolly() {
    if (dolly) return dolly;
    dolly = new THREE.Group();
    dolly.name = 'vr-dolly';
    scene.add(dolly);
    dolly.add(camera);
    return dolly;
  }

  function makeMarker() {
    const g = new THREE.Group();
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.38, 32),
      new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.85, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    g.add(ring);
    g.visible = false;
    scene.add(g);
    return g;
  }

  // ---------- ป้ายข้อมูลที่ข้อมือ ----------
  // ใน VR ไม่มีเมาส์และไม่มีแผงข้อมูลบนจอให้ดู (แผงเดิมเป็น HTML อยู่นอกฉาก 3D
  // ซึ่งในโหมด VR มองไม่เห็นเลย) จึงต้องวาดข้อมูลเป็นวัตถุในฉากแล้วติดไว้กับคอนโทรลเลอร์
  // เหมือนดูนาฬิกาข้อมือ — ยกมือขึ้นดูได้ทุกเมื่อ ไม่ต้องหันไปหาจอ
  // ผืนผ้าใบใหญ่ ตัวหนังสือจึงคมและใส่ข้อมูลได้ครบทั้งชุด
  // ของเดิม 512x320 เล็กเกินจนต้องตัดคำอธิบายทิ้งด้วย "…" และโชว์ขั้นตอนได้ข้อเดียว
  const PANEL_W = 1024, PANEL_H = 768;
  let panel = null, panelCtx = null, panelTex = null;

  function makeWristPanel() {
    const cv = document.createElement('canvas');
    cv.width = PANEL_W; cv.height = PANEL_H;
    panelCtx = cv.getContext('2d');
    panelTex = new THREE.CanvasTexture(cv);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.34, 0.255),
      new THREE.MeshBasicMaterial({
        map: panelTex, transparent: true, side: THREE.DoubleSide,
        // depthTest ปิด = วาดทับทุกอย่าง ไม่ถูกท่อบัง
        // depthWrite ต้องปิดตามด้วย ไม่งั้นป้ายจะเขียนค่าความลึกของตัวเอง (ซึ่งใกล้ตามาก)
        // ลงบัฟเฟอร์ แล้วไปบังของที่วาดทีหลังจนฉากหายเป็นแถบ
        depthTest: false, depthWrite: false
      })
    );
    mesh.renderOrder = 999;      // ให้อยู่หน้าสุดเสมอ
    mesh.visible = false;
    return mesh;
  }

  // ตัดข้อความไทยขึ้นบรรทัดใหม่ — วัดความกว้างจริงทีละตัว
  // ภาษาไทยไม่มีช่องว่างระหว่างคำ ตัดตามช่องว่างอย่างเดียวจะได้บรรทัดยาวล้นขอบ
  function wrapText(ctx, text, maxW, maxLines) {
    const out = [];
    let line = '';
    for (const ch of String(text || '')) {
      if (ch === '\n') { out.push(line); line = ''; if (out.length >= maxLines) break; continue; }
      const next = line + ch;
      if (ctx.measureText(next).width > maxW && line) {
        out.push(line);
        line = ch;
        if (out.length >= maxLines) break;
      } else line = next;
    }
    if (line && out.length < maxLines) out.push(line);
    if (out.length === maxLines && line) out[maxLines - 1] = out[maxLines - 1].slice(0, -1) + '…';
    return out;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // วาดข้อมูลลงป้าย — ต้องได้ครบทั้งชุด ไม่ใช่ตัดทิ้งด้วย "…"
  // วิธี: ลองย่อขนาดตัวหนังสือลงทีละขั้น จนกว่าทุกอย่างจะลงพอดีในกรอบ
  // ข้อมูลสั้นก็ได้ตัวใหญ่อ่านสบาย ข้อมูลยาวก็ยังได้อ่านครบ ไม่หายไปไหน
  const PAD = 46;                       // ขอบใน
  const SCALES = [1, 0.9, 0.8, 0.72, 0.64, 0.56, 0.5, 0.45, 0.4];

  // จัดหน้าเป็นรายการบรรทัดพร้อมสไตล์ คืน null ถ้าเกินกรอบ (จะได้ลองย่อลงอีกขั้น)
  function layoutPanel(c, info, k) {
    const maxW = PANEL_W - PAD * 2;
    const lines = [];
    let y = PAD;

    const put = (text, font, color, lh, gapBefore, indent) => {
      c.font = font;
      const rows = wrapText(c, text, maxW - (indent || 0), 999);
      y += gapBefore || 0;
      for (const r of rows) {
        lines.push({ text: r, font, color, x: PAD + (indent || 0), y });
        y += lh;
      }
    };

    put(info.title || 'ชิ้นส่วน', 'bold ' + Math.round(44 * k) + 'px "Sora", system-ui, sans-serif',
        '#eef2f7', Math.round(54 * k), 0, 22);

    const divider = { rule: true, y: y + Math.round(10 * k) };
    lines.push(divider);
    y += Math.round(26 * k);

    put(info.desc || 'ยังไม่มีข้อมูลความปลอดภัยของชิ้นนี้',
        Math.round(30 * k) + 'px system-ui, sans-serif', '#b8c4d4', Math.round(40 * k), 0, 22);

    const steps = Array.isArray(info.steps) ? info.steps.filter(Boolean) : [];
    if (steps.length) {
      put('ขั้นตอนการทำงาน', 'bold ' + Math.round(26 * k) + 'px system-ui, sans-serif',
          '#8fb8ff', Math.round(38 * k), Math.round(26 * k), 22);
      steps.forEach((st, i) => {
        put((i + 1) + '. ' + st, Math.round(27 * k) + 'px system-ui, sans-serif',
            '#dbe4f0', Math.round(36 * k), Math.round(6 * k), 34);
      });
    }

    return y <= PANEL_H - PAD ? lines : null;
  }

  function drawWristPanel(info) {
    if (!panelCtx) return;
    const c = panelCtx;
    c.clearRect(0, 0, PANEL_W, PANEL_H);

    c.fillStyle = 'rgba(10,15,23,0.97)';
    roundRect(c, 6, 6, PANEL_W - 12, PANEL_H - 12, 26);
    c.fill();
    c.strokeStyle = info.accent || '#3b82f6';
    c.lineWidth = 5;
    c.stroke();

    // แถบสีบอกระดับความสำคัญ อ่านได้จากหางตาโดยไม่ต้องอ่านตัวหนังสือ
    c.fillStyle = info.accent || '#3b82f6';
    roundRect(c, 6, 6, 16, PANEL_H - 12, 8);
    c.fill();

    c.textBaseline = 'top';
    let lines = null;
    for (const k of SCALES) {
      lines = layoutPanel(c, info, k);
      if (lines) break;
    }
    // ยาวเกินจริงๆ แม้ย่อสุดแล้ว — ใช้ขนาดเล็กสุดแล้ววาดเท่าที่กรอบรับไหว
    if (!lines) lines = layoutPanel(c, info, SCALES[SCALES.length - 1]) || [];

    for (const l of lines) {
      if (l.rule) {
        c.fillStyle = 'rgba(148,163,184,0.28)';
        c.fillRect(PAD + 22, l.y, PANEL_W - PAD * 2 - 22, 2);
        continue;
      }
      if (l.y > PANEL_H - PAD) break;
      c.font = l.font;
      c.fillStyle = l.color;
      c.fillText(l.text, l.x, l.y);
    }
    panelTex.needsUpdate = true;
  }

  // สีขอบตามระดับความสำคัญที่ตั้งไว้ในข้อมูลชิ้นส่วน (colorClass เดียวกับแผงบนจอ)
  const ACCENT = { 'tag-red': '#ef4444', 'tag-yellow': '#f59e0b', 'tag-green': '#22c55e', 'tag-blue': '#3b82f6' };

  // จิ้มชิ้นส่วนแล้วขึ้นข้อมูล — ใช้ข้อมูลชุดเดียวกับการคลิกบนจอทุกประการ
  function showPartInfo(mesh, controller) {
    if (!mesh) return;
    // สร้างป้ายเมื่อต้องใช้ ไม่ผูกกับการเข้าโหมด VR
    // จะได้เรียกทดสอบจากคอนโซลบนจอปกติได้ด้วยโดยไม่ต้องมีแว่น
    if (!panel) panel = makeWristPanel();

    let data = null, key = 'default';
    try {
      key = typeof resolveDatabaseKey === 'function' ? resolveDatabaseKey(mesh, mesh.name) : 'default';
      data = (typeof workflowDatabase !== 'undefined') ? (workflowDatabase[key] || workflowDatabase.default) : null;
    } catch (e) { /* ไม่มีข้อมูลก็ยังโชว์ชื่อชิ้นได้ */ }

    const title = (data && data.name) || mesh.name || 'ชิ้นส่วน';

    // วาดป้าย VR ก่อนเสมอ แล้วค่อยไปยุ่งกับแผงบนจอ
    // ถ้าแผงบนจอพังขึ้นมา (มันเป็นโค้ดคนละส่วน แตะ DOM หลายจุด) ป้ายในแว่นต้อง
    // เปลี่ยนตามไปแล้ว ไม่งั้นจะกลายเป็น "จิ้มได้ครั้งเดียว" — ป้ายค้างข้อมูลชิ้นแรกตลอด
    drawWristPanel({
      title,
      desc: data && data.desc,
      steps: data && Array.isArray(data.steps) ? data.steps : [],
      accent: ACCENT[(data && data.colorClass) || 'tag-blue']
    });

    // ติดป้ายไว้กับมือที่จิ้ม — ยกขึ้นมาดูเหมือนดูนาฬิกา
    // วางไว้ "เหนือและเยื้องมาทางตัว" ไม่ใช่ปลายลำแสง ป้ายจะได้ไม่บังเป้าที่กำลังเล็ง
    const host = controller || controllers[0];
    if (host && panel) {
      if (panel.parent !== host) host.add(panel);
      panel.position.set(0, 0.17, 0.03);
      panel.rotation.set(-Math.PI / 3, 0, 0);
      panel.visible = true;
    }

    // เรียกตัวเลือกชิ้นส่วนของระบบเดิมด้วย เพื่อให้ไฮไลท์และป้ายบนจอตรงกัน
    // ส่ง force ไว้ เพราะการจิ้มซ้ำชิ้นเดิมใน VR ควรเป็นการ "ดูอีกที" ไม่ใช่ปิดป้ายทิ้ง
    try {
      if (typeof selectPart === 'function') selectPart(mesh, '🥽 จิ้มเลือกใน VR', { force: true });
    } catch (err) {
      console.warn('[VR] แผงข้อมูลบนจอทำงานไม่สำเร็จ แต่ป้ายในแว่นยังใช้ได้:', err);
    }

    say('ดูข้อมูล: ' + title);
  }

  function hideWristPanel() {
    if (panel) panel.visible = false;
  }

  // ---------- คอนโทรลเลอร์ ----------
  function setupControllers() {
    controllers = [];
    for (let i = 0; i < 2; i++) {
      const c = renderer.xr.getController(i);
      c.userData.index = i;
      // เส้นเล็งยิงออกจากหัวคอนโทรลเลอร์ ให้ผู้ใช้รู้ว่ากำลังชี้ไปทางไหน
      const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -6)]),
        new THREE.LineBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.6 })
      );
      line.name = 'aim';
      line.visible = false;
      c.add(line);
      // ไก = จิ้มดูข้อมูลชิ้นส่วน (เทียบเท่าการคลิกเมาส์บนจอ)
      // ปุ่มบีบ (grip) = วาร์ปไปจุดที่เล็ง
      // แยกสองปุ่มเพราะถ้าใช้ปุ่มเดียวแล้วเดาเอาว่าเล็งพื้นหรือเล็งอุปกรณ์
      // จะเดาผิดบ่อยมาก — อุปกรณ์ตั้งอยู่บนพื้น เล็งพลาดนิดเดียวก็ได้คนละอย่าง
      c.addEventListener('selectstart', () => { c.userData.aiming = 'info'; });
      c.addEventListener('selectend', () => {
        // เก็บเป้าไว้ก่อน แล้วล้างสถานะให้เรียบร้อยทันที
        // ถ้าปล่อยให้ล้างทีหลังแล้วโค้ดตรงกลางพลาดขึ้นมา สถานะจะค้าง
        // และการจิ้มครั้งต่อไปจะไม่ทำงาน — กลายเป็น "จิ้มได้ครั้งเดียว"
        const target = aimMesh;
        c.userData.aiming = null;
        line.visible = false;
        if (marker) marker.visible = false;
        aimHit = null; aimMesh = null;
        // จิ้มโดนชิ้นส่วน = ดูข้อมูล · จิ้มที่ว่างเปล่า = ปิดป้ายทิ้ง (วิธีปิดป้ายในแว่น)
        try { if (target) showPartInfo(target, c); else hideWristPanel(); }
        catch (err) { console.warn('[VR] จิ้มดูข้อมูลไม่สำเร็จ:', err); }
      });
      c.addEventListener('squeezestart', () => { c.userData.aiming = 'warp'; });
      c.addEventListener('squeezeend', () => {
        const to = aimHit;
        c.userData.aiming = null;
        line.visible = false;
        if (marker) marker.visible = false;
        aimHit = null; aimMesh = null;
        try { if (to) teleport(to.x, to.z); }
        catch (err) { console.warn('[VR] วาร์ปไม่สำเร็จ:', err); }
      });
      dolly.add(c);
      controllers.push(c);
    }
  }

  // ---------- การเคลื่อนที่ ----------
  function teleport(x, z) {
    dolly.position.x = x;
    dolly.position.z = z;
    syncAvatar();
    say('วาร์ปไปจุดที่เล็งไว้');
  }

  // ให้ตัวละครในโลกตามตำแหน่งของคนใส่แว่น คนอื่นจะได้เห็นว่าเราอยู่ตรงไหน
  function syncAvatar() {
    if (typeof avatarModel === 'undefined' || !avatarModel) return;
    avatarModel.position.x = dolly.position.x;
    avatarModel.position.z = dolly.position.z;
    if (typeof groundSnapped !== 'undefined') groundSnapped = false;   // หาระดับพื้นของที่ใหม่
  }

  // ยกแท่นยืนให้อยู่ระดับพื้นตรงนั้น ระบบหาพื้นเดิมคำนวณให้อยู่แล้ว
  function followGround() {
    if (typeof dynamicGroundY === 'undefined') return;
    if (dynamicGroundY !== null) dolly.position.y = dynamicGroundY;
  }

  function readStick(src) {
    const gp = src && src.gamepad;
    if (!gp || !gp.axes) return null;
    // มาตรฐาน xr-standard: axes[2],[3] คืออนาล็อก ส่วนบางเครื่องเก่าใช้ [0],[1]
    const x = gp.axes.length > 3 ? gp.axes[2] : gp.axes[0];
    const y = gp.axes.length > 3 ? gp.axes[3] : gp.axes[1];
    if (Math.abs(x) < DEADZONE && Math.abs(y) < DEADZONE) return null;
    return { x, y };
  }

  function updateLocomotion(dt) {
    if (!session) return;
    const sources = session.inputSources;
    if (!sources) return;
    for (const src of sources) {
      const stick = readStick(src);
      if (!stick) continue;
      // เดินตามทิศที่ "หันหน้าอยู่จริง" ไม่ใช่ทิศของแท่นยืน — ผู้ใช้หันหัวไปทางไหนก็เดินทางนั้น
      const cam = renderer.xr.getCamera ? renderer.xr.getCamera(camera) : camera;
      cam.getWorldDirection(_fwd);
      _fwd.y = 0;
      if (_fwd.lengthSq() < 1e-6) continue;
      _fwd.normalize();
      _right.set(_fwd.z, 0, -_fwd.x);          // ตั้งฉากกับทิศหน้าบนระนาบพื้น
      const step = SPEED * dt;
      dolly.position.x += (_fwd.x * -stick.y + _right.x * stick.x) * step;
      dolly.position.z += (_fwd.z * -stick.y + _right.z * stick.x) * step;
      syncAvatar();
      break;                                   // ใช้อนาล็อกอันเดียวพอ ไม่ให้สองมือสั่งสวนกัน
    }
  }

  function updateAim() {
    if (!marker) return;
    let shown = false;
    for (const c of controllers) {
      const line = c.getObjectByName('aim');
      if (!c.userData.aiming) { if (line) line.visible = false; continue; }
      if (line) line.visible = true;
      _mat.identity().extractRotation(c.matrixWorld);
      _rayOrigin.setFromMatrixPosition(c.matrixWorld);
      _rayDir.set(0, 0, -1).applyMatrix4(_mat).normalize();
      raycaster.set(_rayOrigin, _rayDir);
      raycaster.far = 40;
      const targets = [];
      if (typeof factoryModel !== 'undefined' && factoryModel) targets.push(factoryModel);
      if (!targets.length) break;
      const hits = raycaster.intersectObjects(targets, true);
      if (hits.length) {
        aimHit = hits[0].point;
        aimMesh = hits[0].object;
        // ฟ้าตอนจิ้มดูข้อมูล ม่วงตอนวาร์ป — รู้ได้ทันทีว่ากำลังจะทำอะไร
        const info = c.userData.aiming === 'info';
        if (line.material) line.material.color.setHex(info ? 0x22d3ee : 0xa855f7);
        marker.position.set(aimHit.x, aimHit.y + 0.02, aimHit.z);
        marker.visible = !info;      // วงวาร์ปโชว์เฉพาะตอนจะวาร์ป
        shown = true;
      }
      break;
    }
    if (!shown) { marker.visible = false; aimHit = null; aimMesh = null; }
  }

  // เรียกจากลูปวาดภาพหลักทุกเฟรม
  function update(dt) {
    if (!session) return;
    updateLocomotion(dt || 0.016);
    updateAim();
    followGround();
  }

  // ---------- เข้า/ออกโหมด VR ----------
  async function enter() {
    if (!navigator.xr) { say('เบราว์เซอร์นี้ไม่รองรับ WebXR', '#ef4444'); return; }
    const btn = document.getElementById('vr-enter');
    if (btn) btn.classList.add('busy');
    try {
      ensureDolly();
      if (!marker) marker = makeMarker();
      if (!panel) panel = makeWristPanel();
      renderer.xr.enabled = true;

      const s = await navigator.xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor']
      });
      await renderer.xr.setSession(s);
      session = s;
      window.AEC_XR_ACTIVE = true;             // ลูปวาดภาพหลักจะหยุดใช้ requestAnimationFrame

      // เริ่มยืนตรงจุดที่ตัวละครอยู่ตอนนั้น
      if (typeof avatarModel !== 'undefined' && avatarModel) {
        dolly.position.set(avatarModel.position.x, avatarModel.position.y, avatarModel.position.z);
      }
      camera.position.set(0, 0, 0);            // ตำแหน่งหัวมาจากแว่น ไม่ใช่จากโค้ดเรา
      camera.rotation.set(0, 0, 0);

      setupControllers();
      renderer.setAnimationLoop(animate);
      s.addEventListener('end', onEnded);

      document.getElementById('vr-hint')?.classList.add('on');
      if (btn) { btn.classList.remove('busy'); btn.querySelector('span').textContent = 'ออกจากโหมด VR'; }
      say('เข้าโหมด VR แล้ว — อนาล็อกเดิน · ไกจิ้มดูข้อมูล (เล็งที่ว่างแล้วปล่อย = ปิดป้าย) · ปุ่มบีบวาร์ป');
    } catch (err) {
      if (btn) btn.classList.remove('busy');
      console.warn('[VR] เข้าโหมด VR ไม่สำเร็จ:', err);
      say('เข้าโหมด VR ไม่สำเร็จ: ' + (err && err.message ? err.message : 'ไม่ทราบสาเหตุ'), '#ef4444');
    }
  }

  function onEnded() {
    session = null;
    window.AEC_XR_ACTIVE = false;
    renderer.setAnimationLoop(null);
    renderer.xr.enabled = false;
    if (marker) marker.visible = false;
    hideWristPanel();
    controllers.forEach(c => { const l = c.getObjectByName('aim'); if (l) l.visible = false; });
    // คืนกล้องให้โค้ดเดิมคุมต่อ — โค้ดเดิมสั่ง camera.position เป็นพิกัดโลก
    // ถ้าปล่อยแท่นยืนค้างไว้ที่อื่น กล้องจะเพี้ยนไปทั้งระบบ
    if (dolly) dolly.position.set(0, 0, 0);
    document.getElementById('vr-hint')?.classList.remove('on');
    const btn = document.getElementById('vr-enter');
    if (btn) btn.querySelector('span').textContent = 'เข้าโหมด VR';
    if (typeof resetCameraToAvatar === 'function') resetCameraToAvatar();
    if (typeof animate === 'function') animate();     // กลับไปวาดด้วย requestAnimationFrame ตามเดิม
    say('ออกจากโหมด VR แล้ว', '#94a3b8');
  }

  async function toggle() {
    if (session) { session.end().catch(() => {}); return; }
    // เช็คสดทุกครั้งที่กด สิทธิ์อาจเพิ่งถูกให้หลังโหลดหน้าไปแล้ว
    const okNow = await refreshSupport();
    if (okNow) { enter(); return; }
    // เข้าไม่ได้เพราะถูกฝังใน iframe -> พาไปเปิดหน้าโลกตรงๆ ซึ่ง WebXR ทำงานได้แน่นอน
    if (inFrame()) {
      say('หน้านี้ถูกฝังอยู่ในหน้าอื่น กำลังเปิดโลก 3D แบบเต็มหน้าให้ — กดปุ่มแว่นอีกครั้งที่หน้านั้น', '#f59e0b');
      openWorldDirectly();
      return;
    }
    say('เครื่องนี้เข้าโหมด VR ไม่ได้ — ต้องเปิดผ่านเบราว์เซอร์ในแว่น (เช่น Meta Quest Browser) และหน้าเว็บต้องเป็น HTTPS', '#ef4444');
  }

  function init() {
    if (ready) return;
    if (typeof renderer === 'undefined' || typeof scene === 'undefined' || typeof camera === 'undefined') return;
    ready = true;
    ensureDolly();
    mountButton();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  return { init, enter, toggle, update, showPartInfo, hideWristPanel, isActive: () => !!session };
})();
