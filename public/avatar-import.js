/* ============================================================
   AEC VERSE — นำเข้าร่างตัวละคร (.glb)
   เดิมมีแค่ 4 ร่างที่ฝังไว้ในโค้ด เพิ่มร่างต้องแก้ไฟล์แล้ว deploy ใหม่

   ขั้นตอน: เลือกไฟล์ -> ตรวจในเครื่องก่อน -> อัปขึ้นที่เก็บ -> ลงทะเบียนกับ server
   ตรวจก่อนอัปเพราะไฟล์หลายเมกะไบต์ ถ้ารู้ว่าใช้ไม่ได้ตั้งแต่ต้นก็ไม่ต้องเสียเวลาอัป

   เรื่องโครงกระดูก: ท่าเดินของระบบเป็นคลิป Mixamo ถ้าไฟล์ที่นำเข้าไม่มีกระดูก
   แบบเดียวกัน ตัวละครจะยืนแข็งไม่ขยับขา — ตรวจให้รู้ตั้งแต่ตอนนำเข้า
   ไม่ใช่ให้ไปเซอร์ไพรส์เอาในโลก 3D
   ============================================================ */
window.AecAvatarImport = (function () {

  const MAX_MB = 12;                 // ร่างที่มากับระบบอยู่ที่ 2.5–3.2 MB
  const SUPABASE_URL = 'https://hzlokmixfkfrmkuucfhg.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6bG9rbWl4Zmtmcm1rdXVjZmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NzA5NTUsImV4cCI6MjA5ODE0Njk1NX0.DSj0c7XN979948Iq5rGmWqI9ddcbg56OmfKFin--Luo';
  const BUCKET = 'models';

  // id และชื่อไฟล์ต้องเป็น ASCII ล้วน — ที่เก็บไฟล์ปฏิเสธ key ที่มีอักษรไทยหรือจุด
  // (เคยปล่อยอักษรไทยผ่าน แล้วอัปโหลดล้มด้วย InvalidKey: avatars/ร่างของฉัน-4-ก.ย._...glb)
  // ชื่อที่ผู้ใช้ตั้งไว้ยังเก็บครบใน name ซึ่งเป็นตัวที่แสดงบนหน้าจอ
  const slug = t => String(t).toLowerCase().replace(/.glb$/, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 32);
  // ชื่อไทยล้วนจะเหลือค่าว่างหลัง slug — ต้องมี id ที่ใช้ได้เสมอและไม่ชนกัน
  const safeId = name => (slug(name) ? slug(name) + '-' : 'avatar-') +
    Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  async function authHeaders() {
    const { data } = await supabaseClient.auth.getSession();
    const t = data?.session?.access_token;
    return t ? { Authorization: 'Bearer ' + t } : null;
  }

  // อ่านไฟล์ในเครื่องด้วย GLTFLoader เพื่อดูว่ามีอะไรอยู่ข้างในจริงๆ
  function inspectGlb(file) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const loader = new THREE.GLTFLoader();
      if (typeof THREE.DRACOLoader === 'function') {
        const dl = new THREE.DRACOLoader();
        dl.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
        loader.setDRACOLoader(dl);
      }
      loader.load(url, gltf => {
        URL.revokeObjectURL(url);
        const bones = [];
        let meshes = 0, tris = 0;
        gltf.scene.traverse(o => {
          if (o.isBone) bones.push(o.name);
          if (o.isMesh || o.isSkinnedMesh) {
            meshes++;
            const g = o.geometry;
            if (g && g.index) tris += g.index.count / 3;
            else if (g && g.attributes.position) tris += g.attributes.position.count / 3;
          }
        });
        // คลิปเดินของระบบมาจาก Mixamo ซึ่งตั้งชื่อกระดูกขึ้นต้นด้วย mixamorig
        // ระบบตัด prefix ก่อนจับคู่อยู่แล้ว จึงเช็คแค่ว่ามีกระดูกหลักครบไหม
        const bare = bones.map(b => b.replace(/^mixamorig\d*:?/i, '').toLowerCase());
        const need = ['hips', 'spine', 'leftupleg', 'rightupleg'];
        const missing = need.filter(n => !bare.some(b => b === n || b.startsWith(n)));
        const box = new THREE.Box3().setFromObject(gltf.scene);
        const size = box.getSize(new THREE.Vector3());
        resolve({
          bones: bones.length, meshes, tris: Math.round(tris),
          rigged: missing.length === 0,
          missingBones: missing,
          heightM: Math.round(size.y * 100) / 100
        });
      }, undefined, err => { URL.revokeObjectURL(url); reject(err); });
    });
  }

  async function uploadToStorage(file, id) {
    // id ผ่าน safeId มาแล้วจึงเป็น ASCII ล้วน ใช้เป็น key ได้ตรงๆ
    const name = `avatars/${id}.glb`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST',
      // ใช้ application/octet-stream เหมือนการอัปโมเดลโรงงานที่ใช้ได้มานาน
      // ถ้าที่เก็บจำกัดชนิดไฟล์ไว้ model/gltf-binary อาจไม่อยู่ในรายการที่อนุญาต
      headers: { Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' },
      body: file
    });
    if (!res.ok) {
      const raw = await res.text();
      let msg = raw;
      try { const j = JSON.parse(raw); msg = j.message || j.error || raw; } catch (e) { /* ไม่ใช่ JSON ก็ใช้ข้อความดิบ */ }
      throw new Error('อัปโหลดไฟล์ไม่สำเร็จ: ' + String(msg).slice(0, 160));
    }
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name}`;
  }

  // ตรวจ -> อัป -> ลงทะเบียน. onStep(ข้อความ, โทน) ใช้รายงานความคืบหน้าให้หน้าเว็บ
  async function importFile(file, displayName, onStep, opts) {
    const say = (t, tone) => { if (onStep) onStep(t, tone); };

    if (!/\.glb$/i.test(file.name)) throw new Error('รองรับเฉพาะไฟล์ .glb เท่านั้น (ไฟล์ .fbx ให้แปลงเป็น .glb ก่อน)');
    const mb = file.size / 1024 / 1024;
    if (mb > MAX_MB) throw new Error(`ไฟล์ใหญ่ ${mb.toFixed(1)} MB เกินเพดาน ${MAX_MB} MB — ร่างที่มากับระบบอยู่ที่ราว 3 MB`);

    say(`กำลังตรวจไฟล์ (${mb.toFixed(1)} MB)...`);
    let info;
    try { info = await inspectGlb(file); }
    catch (err) { throw new Error('เปิดไฟล์ไม่สำเร็จ — อาจไม่ใช่ .glb ที่ถูกต้องหรือไฟล์เสียหาย'); }

    if (!info.meshes) throw new Error('ไม่พบชิ้นส่วนที่มองเห็นได้ในไฟล์นี้');
    say(`พบ ${info.meshes} ชิ้นส่วน · ${info.tris.toLocaleString()} สามเหลี่ยม · กระดูก ${info.bones} ชิ้น · สูง ${info.heightM} ม.`);

    const id = safeId(displayName || file.name);
    say('กำลังอัปโหลด...');
    const url = await uploadToStorage(file, id);

    say('กำลังลงทะเบียน...');
    const h = await authHeaders();
    if (!h) throw new Error('ต้องเข้าสู่ระบบก่อน');
    const res = await fetch('/api/avatars', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify({
        id, name: displayName || file.name.replace(/\.glb$/i, ''),
        url, sizeMb: mb, rigged: info.rigged,
        personal: !!(opts && opts.personal),
        source: (opts && opts.source) || 'upload'
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'ลงทะเบียนไม่สำเร็จ');
    return { avatar: body.avatar, info };
  }

  // ---------- ตัวสร้างตัวละคร (Avaturn) ----------
  // เดิมจะใช้ Ready Player Me แต่โดเมนนั้นไม่มีอยู่แล้ว (DNS ตอบ NXDOMAIN ทั้งเครื่องผมและเครื่องผู้ใช้)
  // Avaturn ทำงานแบบเดียวกันและยังเปิดอยู่ — ตรวจแล้วว่า demo.avaturn.dev, developer.avaturn.me
  // และ SDK บน jsdelivr เข้าถึงได้จริง
  //
  // ที่สำคัญคือร่างของ Avaturn ใช้โครงกระดูกมาตรฐานที่เข้ากับ Mixamo ได้ ท่าเดินของเราจึงใช้ได้เลย
  //
  // เราไม่เก็บ URL ของเขาไว้ตรงๆ แต่ดึงไฟล์มาเก็บที่เก็บของเราเอง เพราะ
  //  1) ร่างจะไม่หายถ้าวันหนึ่งเขาเปลี่ยนหรือลบไฟล์ฝั่งนั้น (และ url อาจเป็น dataURL ชั่วคราวด้วย)
  //  2) ผ่านการตรวจโครงกระดูกชุดเดียวกับไฟล์ที่อัปเอง ไม่ต้องมีทางลัดพิเศษ
  //  3) ทะเบียนยังคงกฎเดิม — รับเฉพาะไฟล์ในที่เก็บของระบบ
  const AVATURN_SDK = 'https://cdn.jsdelivr.net/npm/@avaturn/sdk/dist/index.js';
  const AVATURN_SUBDOMAIN = (window.AEC_AVATURN_SUBDOMAIN || 'demo').trim();
  const creatorOrigin = () => 'https://' + AVATURN_SUBDOMAIN + '.avaturn.dev';
  const isConfigured = () => !!AVATURN_SUBDOMAIN;
  const usingDemo = () => AVATURN_SUBDOMAIN === 'demo';

  // เช็คว่าเปิดถึงจริงก่อนเริ่ม — ถ้าโดเมนตาย/เน็ตปิดกั้น จะได้บอกเองว่าเกิดอะไรขึ้น
  // แทนที่จะปล่อยให้ SDK ค้างหรือขึ้นหน้า error ของเบราว์เซอร์ในกล่องเรา
  async function creatorReachable() {
    if (!isConfigured()) return false;
    try {
      await fetch(creatorOrigin() + '/', { mode: 'no-cors', signal: AbortSignal.timeout(8000) });
      return true;
    } catch (err) { return false; }
  }

  // เปิดตัวสร้างลงใน container ที่หน้าเว็บเตรียมไว้
  // onExport(url) จะถูกเรียกเมื่อผู้ใช้กดยืนยันร่างของตัวเอง
  let sdkInstance = null;
  async function openCreator(container, onExport) {
    const { AvaturnSDK } = await import(AVATURN_SDK);
    sdkInstance = new AvaturnSDK();
    await sdkInstance.init(container, { url: creatorOrigin() });
    // data: { url, urlType: 'dataURL' | 'httpURL', gender, bodyId, ... }
    sdkInstance.on('export', data => { if (data && data.url) onExport(data.url, data); });
    return sdkInstance;
  }
  function closeCreator() {
    try { if (sdkInstance && sdkInstance.destroy) sdkInstance.destroy(); }
    catch (err) { console.warn('[AVATAR] ปิดตัวสร้างไม่สำเร็จ:', err); }
    sdkInstance = null;
  }

  // ดึงไฟล์ที่ตัวสร้างส่งมา (เป็น http หรือ dataURL ก็ได้) แล้วส่งเข้าสายเดียวกับการอัปโหลดปกติ
  async function importFromUrl(url, displayName, onStep) {
    const say = (t, tone) => { if (onStep) onStep(t, tone); };
    say('กำลังดึงร่างที่สร้างไว้...');
    let blob;
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(String(res.status));
      blob = await res.blob();
    } catch (err) {
      throw new Error('ดึงไฟล์ร่างจากตัวสร้างไม่สำเร็จ — ลองใหม่อีกครั้ง');
    }
    const file = new File([blob], (displayName || 'my-avatar') + '.glb', { type: 'model/gltf-binary' });
    return importFile(file, displayName, say, { personal: true, source: 'rpm' });
  }

  async function list() {
    try {
      // ต้องส่ง token — server ใช้ตัวนี้ตัดสินว่าใครถาม แล้วคืนร่างส่วนตัวของคนนั้นมาด้วย
      // ถ้าไม่ส่ง server จะมองว่าไม่มีใครล็อกอิน แล้วกรองร่างส่วนตัวออกทั้งหมด
      // (นี่คือสาเหตุที่ร่างซึ่งบันทึกสำเร็จแล้วไม่โผล่ในรายการเลย)
      const h = await authHeaders();
      const res = await fetch('/api/avatars', h ? { headers: h } : undefined);
      if (!res.ok) return { builtin: [], imported: [], personal: [] };
      return await res.json();
    } catch (err) { return { builtin: [], imported: [], personal: [] }; }
  }

  // ลบไฟล์ .glb ออกจากที่เก็บด้วย ไม่งั้นทะเบียนหายแต่ไฟล์ค้างสะสมไปเรื่อยๆ
  // ทำหลังจากถอดออกจากทะเบียนสำเร็จแล้วเท่านั้น และถ้าลบไฟล์ไม่ผ่านก็ไม่ถือว่าลบล้มเหลว
  // (ทะเบียนคือสิ่งที่ผู้ใช้เห็น ไฟล์กำพร้าที่เหลือเป็นเรื่องของการเก็บกวาด ไม่ใช่ของผู้ใช้)
  async function removeStorageFile(url) {
    const prefix = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/`;
    if (typeof url !== 'string' || !url.startsWith(prefix)) return;
    try {
      await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/` + url.slice(prefix.length), {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + SUPABASE_ANON_KEY }
      });
    } catch (err) { console.warn('[AVATAR] ลบไฟล์ในที่เก็บไม่สำเร็จ:', err); }
  }

  async function remove(id) {
    const h = await authHeaders();
    if (!h) throw new Error('ต้องเข้าสู่ระบบก่อน');
    const res = await fetch('/api/avatars/' + encodeURIComponent(id), { method: 'DELETE', headers: h });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'ลบไม่สำเร็จ');
    if (body.removed) await removeStorageFile(body.removed.url);
    return body;
  }

  return { importFile, importFromUrl, inspectGlb, list, remove, MAX_MB,
           openCreator, closeCreator, isConfigured, usingDemo, creatorReachable,
           get creatorOrigin() { return creatorOrigin(); } };
})();
