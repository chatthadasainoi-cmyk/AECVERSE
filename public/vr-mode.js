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
    hint.textContent = 'อนาล็อกซ้าย = เดิน · เหนี่ยวไกเล็งอุปกรณ์แล้วปล่อย = ดูข้อมูลที่ข้อมือ · ปุ่มบีบเล็งพื้นแล้วปล่อย = วาร์ป';
    host.appendChild(hint);
    btn.addEventListener('click', toggle);

    // ขึ้นปุ่มเฉพาะเครื่องที่รองรับจริง ไม่ให้ผู้ใช้เจอปุ่มที่กดแล้วขึ้น error
    if (!navigator.xr || !navigator.xr.isSessionSupported) return;
    navigator.xr.isSessionSupported('immersive-vr').then(yes => {
      if (yes) btn.classList.add('on');
    }).catch(() => {});
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
  const PANEL_W = 512, PANEL_H = 320;   // ความละเอียดผืนผ้าใบที่วาดตัวหนังสือ
  let panel = null, panelCtx = null, panelTex = null;

  function makeWristPanel() {
    const cv = document.createElement('canvas');
    cv.width = PANEL_W; cv.height = PANEL_H;
    panelCtx = cv.getContext('2d');
    panelTex = new THREE.CanvasTexture(cv);
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(0.26, 0.1625),
      new THREE.MeshBasicMaterial({ map: panelTex, transparent: true, side: THREE.DoubleSide, depthTest: false })
    );
    mesh.renderOrder = 999;      // ให้อยู่หน้าสุดเสมอ ไม่ถูกท่อบัง
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

  function drawWristPanel(info) {
    if (!panelCtx) return;
    const c = panelCtx;
    c.clearRect(0, 0, PANEL_W, PANEL_H);

    c.fillStyle = 'rgba(10,15,23,0.96)';
    roundRect(c, 4, 4, PANEL_W - 8, PANEL_H - 8, 18);
    c.fill();
    c.strokeStyle = info.accent || '#3b82f6';
    c.lineWidth = 3;
    c.stroke();

    // แถบสีบอกระดับความสำคัญ อ่านได้จากหางตาโดยไม่ต้องอ่านตัวหนังสือ
    c.fillStyle = info.accent || '#3b82f6';
    roundRect(c, 4, 4, 10, PANEL_H - 8, 6);
    c.fill();

    c.textBaseline = 'top';
    c.fillStyle = '#eef2f7';
    c.font = 'bold 30px "Sora", system-ui, sans-serif';
    wrapText(c, info.title || 'ชิ้นส่วน', PANEL_W - 60, 2).forEach((l, i) => c.fillText(l, 34, 24 + i * 36));

    c.font = '20px system-ui, sans-serif';
    c.fillStyle = '#9aa7b8';
    const descTop = 100;
    wrapText(c, info.desc || 'ยังไม่มีข้อมูลความปลอดภัยของชิ้นนี้', PANEL_W - 60, 4)
      .forEach((l, i) => c.fillText(l, 34, descTop + i * 28));

    if (info.step) {
      c.fillStyle = 'rgba(59,130,246,0.16)';
      roundRect(c, 30, PANEL_H - 78, PANEL_W - 64, 52, 10);
      c.fill();
      c.fillStyle = '#8fb8ff';
      c.font = 'bold 18px system-ui, sans-serif';
      wrapText(c, '● ' + info.step, PANEL_W - 92, 2).forEach((l, i) => c.fillText(l, 44, PANEL_H - 68 + i * 24));
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
    // เรียกตัวเลือกชิ้นส่วนของระบบเดิมด้วย เพื่อให้ไฮไลท์ ป้ายบนจอ และสถานะอื่นตรงกันหมด
    // ส่ง force ไว้ เพราะการจิ้มซ้ำชิ้นเดิมใน VR ควรเป็นการ "ดูอีกที" ไม่ใช่ปิดป้ายทิ้ง
    if (typeof selectPart === 'function') selectPart(mesh, '🥽 จิ้มเลือกใน VR', { force: true });

    let data = null, key = 'default';
    try {
      key = typeof resolveDatabaseKey === 'function' ? resolveDatabaseKey(mesh, mesh.name) : 'default';
      data = (typeof workflowDatabase !== 'undefined') ? (workflowDatabase[key] || workflowDatabase.default) : null;
    } catch (e) { /* ไม่มีข้อมูลก็ยังโชว์ชื่อชิ้นได้ */ }

    drawWristPanel({
      title: (data && data.name) || mesh.name || 'ชิ้นส่วน',
      desc: data && data.desc,
      step: data && Array.isArray(data.steps) && data.steps.length ? data.steps[0] : '',
      accent: ACCENT[(data && data.colorClass) || 'tag-blue']
    });

    // ติดป้ายไว้กับมือที่จิ้ม — เอียงเข้าหาตัวเหมือนดูนาฬิกา
    const host = controller || controllers[0];
    if (host && panel) {
      if (panel.parent !== host) host.add(panel);
      panel.position.set(0, 0.09, -0.06);
      panel.rotation.set(-Math.PI / 3.2, 0, 0);
      panel.visible = true;
    }
    say('ดูข้อมูล: ' + ((data && data.name) || mesh.name || 'ชิ้นส่วน'));
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
        c.userData.aiming = null;
        line.visible = false;
        if (marker) marker.visible = false;
        if (aimMesh) showPartInfo(aimMesh, c);
        aimHit = null; aimMesh = null;
      });
      c.addEventListener('squeezestart', () => { c.userData.aiming = 'warp'; });
      c.addEventListener('squeezeend', () => {
        c.userData.aiming = null;
        line.visible = false;
        if (marker) marker.visible = false;
        if (aimHit) teleport(aimHit.x, aimHit.z);
        aimHit = null; aimMesh = null;
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
      say('เข้าโหมด VR แล้ว — อนาล็อกเดิน · ไกจิ้มดูข้อมูล · ปุ่มบีบวาร์ป');
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

  function toggle() {
    if (session) session.end().catch(() => {});
    else enter();
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
