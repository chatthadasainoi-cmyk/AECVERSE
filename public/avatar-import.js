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

  const slug = t => String(t).toLowerCase().replace(/\.glb$/, '')
    .replace(/[^a-z0-9ก-๙]+/gi, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'avatar';

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
    const name = `avatars/${id}_${Date.now()}.glb`;
    const res = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${name}`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + SUPABASE_ANON_KEY, 'Content-Type': 'model/gltf-binary', 'x-upsert': 'true' },
      body: file
    });
    if (!res.ok) throw new Error(await res.text());
    return `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${name}`;
  }

  // ตรวจ -> อัป -> ลงทะเบียน. onStep(ข้อความ, โทน) ใช้รายงานความคืบหน้าให้หน้าเว็บ
  async function importFile(file, displayName, onStep) {
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

    const id = slug(displayName || file.name);
    say('กำลังอัปโหลด...');
    const url = await uploadToStorage(file, id);

    say('กำลังลงทะเบียน...');
    const h = await authHeaders();
    if (!h) throw new Error('ต้องเข้าสู่ระบบก่อน');
    const res = await fetch('/api/avatars', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...h },
      body: JSON.stringify({
        id, name: displayName || file.name.replace(/\.glb$/i, ''),
        url, sizeMb: mb, rigged: info.rigged
      })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'ลงทะเบียนไม่สำเร็จ');
    return { avatar: body.avatar, info };
  }

  async function list() {
    try {
      const res = await fetch('/api/avatars');
      if (!res.ok) return { builtin: [], imported: [] };
      return await res.json();
    } catch (err) { return { builtin: [], imported: [] }; }
  }

  async function remove(id) {
    const h = await authHeaders();
    if (!h) throw new Error('ต้องเข้าสู่ระบบก่อน');
    const res = await fetch('/api/avatars/' + encodeURIComponent(id), { method: 'DELETE', headers: h });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || 'ลบไม่สำเร็จ');
    return body;
  }

  return { importFile, inspectGlb, list, remove, MAX_MB };
})();
