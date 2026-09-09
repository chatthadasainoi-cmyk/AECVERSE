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
  let aimHit = null;         // จุดบนพื้นที่ไกกำลังเล็งอยู่
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
    hint.textContent = 'อนาล็อกซ้าย = เดิน · เหนี่ยวไกค้างแล้วเล็งพื้น ปล่อยเพื่อวาร์ปไปจุดนั้น';
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
      c.addEventListener('selectstart', () => { c.userData.aiming = true; });
      c.addEventListener('selectend', () => {
        c.userData.aiming = false;
        line.visible = false;
        if (marker) marker.visible = false;
        if (aimHit) teleport(aimHit.x, aimHit.z);
        aimHit = null;
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
        marker.position.set(aimHit.x, aimHit.y + 0.02, aimHit.z);
        marker.visible = true;
        shown = true;
      }
      break;
    }
    if (!shown) { marker.visible = false; aimHit = null; }
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
      say('เข้าโหมด VR แล้ว — อนาล็อกซ้ายเดิน เหนี่ยวไกเล็งพื้นเพื่อวาร์ป');
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

  return { init, enter, toggle, update, isActive: () => !!session };
})();
