// ════════════════════════════════════════════════════════════════════════
// BIOGAS DIGITAL TWIN — REWORK PROTOTYPE (v2)
// ────────────────────────────────────────────────────────────────────────
// สถาปัตยกรรมใหม่: ทุกฟังก์ชันถูกประกาศ "ครั้งเดียว" เรียงลำดับตามการทำงานจริง
// ไม่มีการ monkey-patch ทับ renderer.render / buildColliders / highlightAndShowWorkflow
// ซ้ำหลายชั้นแบบเวอร์ชันเดิม (ซึ่งเป็นสาเหตุหลักที่ทำให้ระบบ "ค้าง/ติดขัด" —
// เพราะถ้าฟังก์ชันที่ถูกห่อไว้ชั้นในสุด throw error หนึ่งจุด การ render เฟรมนั้นทั้งเฟรมจะพังทันที)
// แทนที่ด้วย animate() loop เดียว เรียกแต่ละระบบย่อยผ่าน safeCall() ที่ดัก error
// ไม่ให้ระบบหนึ่งล้มแล้วลากทั้งแอปตายไปด้วย
// ════════════════════════════════════════════════════════════════════════

// ============================================================
// 0. UTIL
// ============================================================
function safeCall(fn, label) {
    try { fn(); } catch (err) {
        console.error(`[SAFE-CALL FAIL] ${label}:`, err);
    }
}
function $(id) { return document.getElementById(id); }
function hexToRgb(hex) {
    const r = parseInt(hex.slice(1, 3), 16), g = parseInt(hex.slice(3, 5), 16), b = parseInt(hex.slice(5, 7), 16);
    return `${r},${g},${b}`;
}

// โหมด viewer: ไม่มี avatar/ตัวละคร — ใช้สำหรับฝัง iframe ในหน้า Digital Twin
// (Dashboard-style inspection view) แยกจากประสบการณ์ multiplayer เดิมที่ index.html
// ยังทำงานตามปกติทุกอย่างถ้าไม่มี ?mode=viewer ต่อท้าย URL
const VIEWER_MODE = new URLSearchParams(window.location.search).get('mode') === 'viewer';
if (VIEWER_MODE) {
    ['multiplayer-panel', 'mobile-controls-container', 'hud-multiplayer', 'hud-reset-camera', 'freelook-btn', 'hud-jump']
        .forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
}

// ============================================================
// 1. SCENE / CAMERA / RENDERER
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f14);

const canvasContainer = $('canvas-container');
const camera = new THREE.PerspectiveCamera(60, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
camera.position.set(0, 6, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
canvasContainer.appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.5;
controls.maxDistance = 60;

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

scene.add(new THREE.GridHelper(60, 60, 0x00ffff, 0x1e293b));

window.addEventListener('resize', () => {
    camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
});

// ============================================================
// 2. SAFETY DATABASE — ตามคู่มือ "Interactive Biogas Safety Standard Metaverse"
// requiresPPE: true  => จุดนี้จะมีวงกลมเตือน PPE รัศมี 15 เมตร (REQ 5)
// ============================================================
const workflowDatabase = {
    "default": {
        name: "โครงสร้างทั่วไป",
        desc: "พื้นที่ส่วนสนับสนุนและโครงสร้างทั่วไปภายในสถานประกอบการแก๊สชีวภาพ",
        tagText: "🛡️ พื้นที่ทั่วไป — โปรดปฏิบัติตามป้ายเตือนใกล้เคียง",
        colorClass: "tag-blue", requiresPPE: false,
        steps: ["🛡️ สวมใส่เครื่องตรวจวัดก๊าซรั่วพกพา (4-Gas Detector)", "🔒 ปฏิบัติตามระบบ LOTO อย่างเคร่งครัดก่อนเปิดฝาบำรุงรักษา"]
    },
    "manhole": {
        name: "ปากบ่อแมนโฮล (Manhole) — หลังคาถังหมัก",
        desc: "จุดเข้าออกของพื้นที่อับอากาศบนหลังคาถังหมัก ห้ามเปิดหรือเข้าโดยไม่ได้รับอนุญาตจากผู้ควบคุมงานเด็ดขาด",
        tagText: "⚠️ อันตราย! ที่อับอากาศ ห้ามเข้าโดยไม่ได้รับอนุญาต",
        colorClass: "tag-red", requiresPPE: true,
        steps: ["⚠️ พื้นที่อับอากาศอันตรายสูงสุด (Confined Space) ต้องมีใบอนุญาตทำงานเท่านั้น", "🪪 ต้องผ่านการอบรม Confined Space Entry และมีผู้เฝ้าระวัง (Standby Man)", "🚫 ห้ามเปิดฝาแมนโฮลโดยไม่มีการตรวจวัดก๊าซก่อนเข้า"]
    },
    "tank": {
        name: "บ่อหมักและโดมเก็บก๊าซ (Digester Tank)",
        desc: "ระบบถังหมักแบบ CSTR ปิดคลุมด้วยผ้าใบแรงดันสูง (HDPE Layer) ภายในเป็นพื้นที่ Ex-Zone 0 ที่มีก๊าซไวไฟสะสมตลอดเวลา",
        tagText: "🔴 EX-ZONE 0: พื้นที่มีก๊าซไวไฟตลอดเวลา ห้ามเกิดประกายไฟเด็ดขาด",
        colorClass: "tag-red", requiresPPE: true,
        steps: ["🔴 EX-ZONE 0: ห้ามประกายไฟ อุปกรณ์ไฟฟ้าต้องเป็นชนิด Explosion-Proof", "📏 ระยะร่น 30 เมตรจากแนวเขตที่ดินตามข้อกำหนด", "🧯 ห้ามนำแหล่งกำเนิดประกายไฟทุกชนิดเข้าใกล้พื้นที่"]
    },
    "pvrv": {
        name: "จุดเชื่อมต่อ PVRV (Pressure/Vacuum Relief Valve)",
        desc: "รอยต่อท่อระหว่างฐานหลังคาบ่อหมักกับอุปกรณ์นิรภัย PVRV ห้ามมีสิ่งกีดขวางทางออกของก๊าซเด็ดขาด",
        tagText: "❌ ห้ามติดตั้งวาล์วปิดกั้น (Isolation Valve) คั่นกลางบ่อหมักกับ PVRV โดยเด็ดขาด!",
        colorClass: "tag-red", requiresPPE: true,
        steps: ["❌ ห้ามปิดวาล์วทางออกระหว่างโดมหมักกับอุปกรณ์นิรภัย PVRV เด็ดขาด", "🔍 ตรวจสอบ PVRV ตามรอบบำรุงรักษาเพื่อป้องกันการอุดตัน", "📋 บันทึกผลตรวจสอบทุกครั้งลงในใบ Checklist"]
    },
    "flame_arrester": {
        name: "Flame Arrester — จุดดักเปลวไฟย้อนกลับ",
        desc: "อุปกรณ์ป้องกันเปลวไฟย้อนกลับเข้าสู่ระบบ ติดตั้งก่อนเข้าหอเผาก๊าซและเครื่องยนต์",
        tagText: "🔥 Flame Arrester: ป้องกันเปลวไฟย้อนกลับ ต้องล้างไส้กรองสม่ำเสมอ",
        colorClass: "tag-orange", requiresPPE: false,
        steps: ["🔥 Flame Arrester: อุปกรณ์ดักเปลวไฟย้อนกลับ ต้องถอดล้างไส้กรองตามรอบ", "📅 กำหนดรอบการตรวจสอบและล้างไส้กรองอย่างน้อยทุก 3 เดือน", "🧤 สวมถุงมือกันสารเคมีขณะถอดล้างไส้กรอง"]
    },
    "pipe": {
        name: "ระบบท่อส่งแก๊สชีวภาพ (Biogas Piping)",
        desc: "แนวเส้นท่อสำหรับส่งผ่านก๊าซมีเทนดิบผ่านจุดดักน้ำและชุดกรองเพื่อเตรียมใช้งาน",
        tagText: "ท่อก๊าซชีวภาพ (Biogas) ➡ [ความลาดเอียง 2% เพื่อดักน้ำ]",
        colorClass: "tag-orange", requiresPPE: false,
        steps: ["➡ แนวท่อต้องลาดเอียงไม่น้อยกว่า 2% มุ่งสู่ถังดักน้ำเพื่อป้องกันน้ำขังขวางทางก๊าซ", "🔧 ตรวจสอบจุดเชื่อมต่อท่อไม่ให้มีการรั่วซึมเป็นประจำ", "🟡 ทาสีท่อก๊าซชีวภาพเป็นสีเหลืองตามมาตรฐานเพื่อความชัดเจน"]
    },
    "lightning_rod": {
        name: "เสาล่อฟ้าแบบแยกอิสระ",
        desc: "ระบบป้องกันฟ้าผ่าที่ติดตั้งแยกอิสระจากโครงสร้างถังหมัก ต้องครอบคลุมรัศมีป้องกันโดมก๊าซได้ทั้งหมด 100%",
        tagText: "⚡ เสาล่อฟ้าแบบแยกอิสระ (ครอบคลุมโดมก๊าซ 100%)",
        colorClass: "tag-orange", requiresPPE: false,
        steps: ["⚡ เสาล่อฟ้าต้องคลุมรัศมีโดมเก็บก๊าซทั้งหมด 100%", "🔌 ตรวจสอบค่าความต้านทานดิน (Grounding) ตามรอบประจำปี", "📏 ระยะห่างจากโดมก๊าซต้องเป็นไปตามมาตรฐานป้องกันฟ้าผ่า"]
    },
    "loto": {
        name: "จุดทำ LOTO — ตู้ควบคุมไฟฟ้าหลัก (MCC)",
        desc: "จุดติดตั้งระบบ Lockout/Tagout บริเวณหน้าตู้ควบคุมไฟฟ้าหลัก (MCC) และพวงมาลัยวาล์วก๊าซหลัก",
        tagText: "🔒 จุดทำ LOTO: คล้องกุญแจและแขวนป้ายก่อนซ่อมบำรุง",
        colorClass: "tag-blue", requiresPPE: false,
        steps: ["🔒 คล้องกุญแจ Lockout และแขวนป้าย Tagout ก่อนเริ่มงานซ่อมบำรุงทุกครั้ง", "🪪 ผู้ปฏิบัติงานต้องถือกุญแจส่วนตัวเท่านั้น ห้ามใช้กุญแจร่วมกัน", "✅ ตรวจสอบศูนย์พลังงานเป็นศูนย์ (Zero Energy) ก่อนเริ่มงาน"]
    },
    "ppe_checkpoint": {
        name: "จุดตรวจ PPE — ทางเข้าลานบ่อหมัก",
        desc: "จุดตรวจสอบอุปกรณ์ป้องกันส่วนบุคคลก่อนเข้าพื้นที่ปฏิบัติงาน",
        tagText: "🛡️ สวมใส่เครื่องวัดก๊าซพกพา (4-Gas Detector) ก่อนเข้าพื้นที่",
        colorClass: "tag-blue", requiresPPE: false,
        steps: ["🛡️ สวมใส่เครื่องตรวจวัดก๊าซรั่วพกพา (4-Gas Detector) ก่อนเข้าพื้นที่ทุกครั้ง", "🥾 สวมรองเท้านิรภัยและหมวกนิรภัยตลอดเวลาที่อยู่ในพื้นที่", "👓 สวมแว่นตานิรภัยเมื่อปฏิบัติงานใกล้อุปกรณ์แรงดัน"]
    },
    "esd": {
        name: "ปุ่มหยุดฉุกเฉิน (ESD) — หน้าอาคารเครื่องยนต์",
        desc: "ปุ่มฉุกเฉินสีแดงติดตั้งหน้าอาคารเครื่องยนต์ ใช้สำหรับตัดการทำงานของเครื่องยนต์และวาล์วทันทีในกรณีฉุกเฉิน",
        tagText: "🚨 ESD Button: กดเพื่อตัดการทำงานเครื่องยนต์และวาล์วทันที",
        colorClass: "tag-green", requiresPPE: false,
        steps: ["🚨 ติดตั้งปุ่มหยุดฉุกเฉิน (ESD) นอกห้องเครื่องยนต์ในตำแหน่งเข้าถึงง่าย", "🔴 ทดสอบการทำงานของปุ่ม ESD ตามรอบที่กำหนด", "📢 ผู้ปฏิบัติงานทุกคนต้องทราบตำแหน่งปุ่ม ESD ใกล้ที่สุด"]
    },
    "utilization": {
        name: "ระบบใช้ประโยชน์ก๊าซ & เครื่องยนต์ (Genset)",
        desc: "อาคารติดตั้งเครื่องยนต์ผลิตกระแสไฟฟ้าจากก๊าซชีวภาพและแผงควบคุมไฟแรงดันสูง",
        tagText: "📏 ระยะห่างเครื่องยนต์: ต้องห่างจากบ่อหมักอย่างน้อย 15 เมตร",
        colorClass: "tag-green", requiresPPE: false,
        steps: ["📏 ระยะห่างอาคารเครื่องกำเนิดไฟฟ้าต้องอยู่ห่างบ่อหมักไม่น้อยกว่า 15 เมตร", "🔒 ตัดสับคัตเอาต์พร้อมลงกลอน Lockout/Tagout ก่อนเอื้อมมือซ่อมห้องเครื่อง", "🔇 ติดตั้งระบบลดเสียงดังตามมาตรฐานความปลอดภัยในการทำงาน"]
    },
    "flare": {
        name: "หอเผาก๊าซทิ้งฉุกเฉิน (Enclosed Flare)",
        desc: "ระบบเผาทำลายก๊าซชีวภาพส่วนเกินอัตโนมัติ เพื่อป้องกันแรงดันสะสมในระบบมากเกินไป",
        tagText: "📏 ระยะปลอดภัย: หอเผาก๊าซต้องห่างอาคาร/ถนนอย่างน้อย 7.5 เมตร",
        colorClass: "tag-green", requiresPPE: true,
        steps: ["📏 ตัวหอเผาต้องเว้นระยะห่างอย่างปลอดภัยจากถนนและอาคารอื่นไม่ต่ำกว่า 7.5 เมตร", "🔥 ชุดหัวจุดประกายไฟต้องเชื่อมระบบอัตโนมัติกับเซนเซอร์วัดแรงดันบ่อหมัก", "🌡️ ตรวจสอบอุณหภูมิการเผาไหม้ให้สมบูรณ์ตามมาตรฐานสิ่งแวดล้อม"]
    }
};

const TYPE_OPTIONS = [
    { key: 'tank', icon: '🟤', label: 'บ่อหมัก / Digester Tank', color: 'tag-red' },
    { key: 'manhole', icon: '🔴', label: 'ปากบ่อ Manhole', color: 'tag-red' },
    { key: 'pvrv', icon: '🔴', label: 'วาล์วนิรภัย PVRV', color: 'tag-red' },
    { key: 'flame_arrester', icon: '🟠', label: 'Flame Arrester', color: 'tag-orange' },
    { key: 'pipe', icon: '🟠', label: 'ท่อก๊าซชีวภาพ', color: 'tag-orange' },
    { key: 'lightning_rod', icon: '🟠', label: 'เสาล่อฟ้า', color: 'tag-orange' },
    { key: 'loto', icon: '🔵', label: 'จุด LOTO / MCC', color: 'tag-blue' },
    { key: 'ppe_checkpoint', icon: '🔵', label: 'จุดตรวจ PPE', color: 'tag-blue' },
    { key: 'esd', icon: '🟢', label: 'ปุ่มฉุกเฉิน ESD', color: 'tag-green' },
    { key: 'utilization', icon: '🟢', label: 'อาคารเครื่องยนต์ Genset', color: 'tag-green' },
    { key: 'flare', icon: '🟢', label: 'หอเผาก๊าซ Flare', color: 'tag-green' },
    { key: 'default', icon: '⚪', label: 'โครงสร้างทั่วไป (Default)', color: 'tag-blue' }
];
function getIconForType(typeKeyOrColorClass) {
    if (!typeKeyOrColorClass) return '🏭';
    let opt = TYPE_OPTIONS.find(o => o.key === typeKeyOrColorClass);
    if (!opt) opt = TYPE_OPTIONS.find(o => o.color === typeKeyOrColorClass);
    return opt ? opt.icon : '🏭';
}

// mapping ที่ admin กำหนดเอง: meshUUID / originalName -> typeKey
const userDefinedTypes = {};

function resolveDatabaseKey(mesh, fallbackName) {
    if (!mesh) return 'default';
    if (userDefinedTypes[mesh.uuid]) return userDefinedTypes[mesh.uuid];
    const nameKey = mesh._original3DName || mesh.name;
    if (nameKey && userDefinedTypes[nameKey]) return userDefinedTypes[nameKey];

    if (workflowDatabase[nameKey]) return nameKey;
    if (workflowDatabase[mesh.name]) return mesh.name;
    if (workflowDatabase[mesh.uuid]) return mesh.uuid;

    const n = (nameKey || fallbackName || '').toLowerCase();
    if (n.includes('manhole') || n.includes('แมนโฮล')) return 'manhole';
    if (n.includes('pvrv')) return 'pvrv';
    if (n.includes('flame') || n.includes('arrester') || n.includes('ดักไฟ')) return 'flame_arrester';
    if (n.includes('lightning') || n.includes('ล่อฟ้า') || n.includes('rod')) return 'lightning_rod';
    if (n.includes('loto') || n.includes('mcc') || n.includes('ควบคุมไฟฟ้า')) return 'loto';
    if (n.includes('ppe') || n.includes('checkpoint') || n.includes('ตรวจ')) return 'ppe_checkpoint';
    if (n.includes('esd') || (n.includes('ฉุกเฉิน') && n.includes('ปุ่ม'))) return 'esd';
    if (n.includes('tank') || n.includes('ถัง') || n.includes('บ่อหมัก') || n.includes('digester')) return 'tank';
    if (n.includes('pipe') || n.includes('ท่อ') || n.includes('line')) return 'pipe';
    if (n.includes('engine') || n.includes('อาคาร') || n.includes('generator') || n.includes('utilization') || n.includes('genset')) return 'utilization';
    if (n.includes('flare') || n.includes('เผา')) return 'flare';
    return 'default';
}

// ============================================================
// 3. AVATAR — สัดส่วนมนุษย์จริง (~1.75m) ประกาศครั้งเดียว ไม่มี override ซ้อน
// ============================================================
function createEngineerAvatar(helmetColor) {
    const group = new THREE.Group();
    const hex = helmetColor ? parseInt(String(helmetColor).replace('#', ''), 16) : 0xff9900;

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xf4c08a, roughness: 0.7 });
    const suitMat = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.6 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.8 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3, metalness: 0.3 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.45 });
    const visibMat = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const bootMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), skinMat);
    head.position.y = 1.62; group.add(head);

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skinMat);
    neck.position.y = 1.49; group.add(neck);

    const helmetTop = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.26), helmetMat);
    helmetTop.position.y = 1.78; group.add(helmetTop);
    const helmetBrim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.3), helmetMat);
    helmetBrim.position.y = 1.72; group.add(helmetBrim);

    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.03), glassMat);
    visor.position.set(0, 1.62, -0.12); group.add(visor);

    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02), eyeMat);
    eyeL.position.set(-0.05, 1.63, -0.112); group.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.set(0.05, 1.63, -0.112); group.add(eyeR);

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.2), suitMat);
    torso.position.y = 1.14; group.add(torso);

    const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.05, 0.21), visibMat);
    stripe1.position.y = 1.22; group.add(stripe1);
    const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.05, 0.21), visibMat);
    stripe2.position.y = 1.08; group.add(stripe2);

    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.45, 0.21), darkMat);
    zip.position.y = 1.14; group.add(zip);

    const upperArmGeo = new THREE.BoxGeometry(0.11, 0.28, 0.13);
    const lowerArmGeo = new THREE.BoxGeometry(0.1, 0.25, 0.12);
    const handGeo = new THREE.BoxGeometry(0.09, 0.1, 0.05);

    const uArmL = new THREE.Mesh(upperArmGeo, suitMat); uArmL.position.set(-0.265, 1.24, 0); group.add(uArmL);
    const lArmL = new THREE.Mesh(lowerArmGeo, suitMat); lArmL.position.set(-0.265, 0.94, 0); group.add(lArmL);
    const handL = new THREE.Mesh(handGeo, skinMat); handL.position.set(-0.265, 0.77, 0); group.add(handL);
    const asL = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.04, 0.135), visibMat); asL.position.set(-0.265, 1.14, 0); group.add(asL);

    const uArmR = new THREE.Mesh(upperArmGeo, suitMat); uArmR.position.set(0.265, 1.24, 0); group.add(uArmR);
    const lArmR = new THREE.Mesh(lowerArmGeo, suitMat); lArmR.position.set(0.265, 0.94, 0); group.add(lArmR);
    const handR = new THREE.Mesh(handGeo, skinMat); handR.position.set(0.265, 0.77, 0); group.add(handR);
    const asR = asL.clone(); asR.position.set(0.265, 1.14, 0); group.add(asR);

    const waist = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.18), darkMat);
    waist.position.y = 0.88; group.add(waist);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.05, 0.19), new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.5 }));
    belt.position.y = 0.92; group.add(belt);

    const legGeo = new THREE.BoxGeometry(0.14, 0.42, 0.15);
    const legL = new THREE.Mesh(legGeo, suitMat); legL.position.set(-0.1, 0.6, 0); group.add(legL);
    const legR = new THREE.Mesh(legGeo, suitMat); legR.position.set(0.1, 0.6, 0); group.add(legR);

    const lsL = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.04, 0.155), visibMat); lsL.position.set(-0.1, 0.52, 0); group.add(lsL);
    const lsR = lsL.clone(); lsR.position.set(0.1, 0.52, 0); group.add(lsR);

    const bootGeo = new THREE.BoxGeometry(0.16, 0.1, 0.22);
    const bootL = new THREE.Mesh(bootGeo, bootMat); bootL.position.set(-0.1, 0.33, -0.03); group.add(bootL);
    const bootR = bootL.clone(); bootR.position.set(0.1, 0.33, -0.03); group.add(bootR);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.18 }));
    shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.01; group.add(shadow);

    group.userData.armL = uArmL; group.userData.armR = uArmR;
    group.userData.lArmL = lArmL; group.userData.lArmR = lArmR;
    group.userData.legL = legL; group.userData.legR = legR;
    group.userData.walkPhase = 0;
    return group;
}

function animateEngineerWalk(g, isMoving) {
    if (!g || !g.userData.legL) return;
    if (isMoving) g.userData.walkPhase += 0.1;
    else g.userData.walkPhase *= 0.8;
    const s = Math.sin(g.userData.walkPhase) * 0.45;
    if (g.userData.armL) g.userData.armL.rotation.x = s;
    if (g.userData.armR) g.userData.armR.rotation.x = -s;
    if (g.userData.lArmL) g.userData.lArmL.rotation.x = s * 0.5;
    if (g.userData.lArmR) g.userData.lArmR.rotation.x = -s * 0.5;
    if (g.userData.legL) g.userData.legL.rotation.x = -s;
    if (g.userData.legR) g.userData.legR.rotation.x = s;
}

let avatarModel = null;
const jumpConfig = { velocity: 0, gravity: -0.012, jumpForce: 0.24, isJumping: false, groundY: 0.9 };
const defaultCameraOffset = new THREE.Vector3(0, 2.5, 5);

function createProceduralAvatar() {
    const avatarGroup = createEngineerAvatar('#ff9900');
    avatarGroup.position.set(0, jumpConfig.groundY, 8);
    scene.add(avatarGroup);
    avatarModel = avatarGroup;
}
if (!VIEWER_MODE) createProceduralAvatar();

function triggerAvatarJump() {
    if (avatarModel && !jumpConfig.isJumping) {
        jumpConfig.velocity = jumpConfig.jumpForce;
        jumpConfig.isJumping = true;
    }
}
function resetCameraToAvatar() {
    if (!avatarModel) return;
    camera.position.copy(defaultCameraOffset.clone().applyMatrix4(avatarModel.matrixWorld));
    controls.target.set(avatarModel.position.x, avatarModel.position.y + 0.6, avatarModel.position.z);
    controls.update();
}

// ============================================================
// 4. MOVEMENT INPUT — keyboard + mobile joystick
// ============================================================
const moveStatus = { forward: false, backward: false, left: false, right: false };
const avatarConfig = { speed: 0.12, turnSpeed: 0.045, radius: 0.35 };
let isFreeLook = VIEWER_MODE;
const freeLookSpeed = 0.2;

function isTypingInField() {
    const t = document.activeElement.tagName;
    return t === 'INPUT' || t === 'TEXTAREA';
}

window.addEventListener('keydown', (e) => {
    if (isTypingInField()) return;
    const key = e.key.toLowerCase();

    if (key === 'f' || key === 'ด') {
        isFreeLook = !isFreeLook;
        if (!isFreeLook) resetCameraToAvatar();
        mpAppendChat({ name: 'ระบบกล้อง', color: '#00ffff', text: isFreeLook ? '🎥 โหมด Free Look (W A S D บินกล้องอิสระ)' : '👤 กลับสู่โหมดติดตามตัวละคร' });
        return;
    }
    if (e.key === 'ArrowUp' || key === 'w' || key === 'ฟ' || key === 'ไ') moveStatus.forward = true;
    if (e.key === 'ArrowDown' || key === 's' || key === 'ห') moveStatus.backward = true;
    if (e.key === 'ArrowLeft' || key === 'a' || key === 'ฟ' || key === 'ภ') moveStatus.left = true;
    if (e.key === 'ArrowRight' || key === 'd' || key === 'ด' || key === 'ก') moveStatus.right = true;
    if (e.key === ' ' && !jumpConfig.isJumping && !isFreeLook) triggerAvatarJump();

    if (key === 'h' || key === 'อ') togglePanelElement('dashboard');
    if (key === 'm' || key === 'ท') togglePanelElement('details-panel');
    if (key === 't' || key === 'ะ') togglePanelElement('transform-panel');
    if (key === 'u') togglePanelElement('multiplayer-panel');
    if (key === 'r' || key === 'พ') resetCameraToAvatar();
});
window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (e.key === 'ArrowUp' || key === 'w' || key === 'ฟ' || key === 'ไ') moveStatus.forward = false;
    if (e.key === 'ArrowDown' || key === 's' || key === 'ห') moveStatus.backward = false;
    if (e.key === 'ArrowLeft' || key === 'a' || key === 'ฟ' || key === 'ภ') moveStatus.left = false;
    if (e.key === 'ArrowRight' || key === 'd' || key === 'ด' || key === 'ก') moveStatus.right = false;
});

function togglePanelElement(elementId) {
    const el = $(elementId);
    if (el) el.style.display = (el.style.display === 'none') ? 'block' : 'none';
}

function initMobileJoystick() {
    const zone = $('mobile-joystick-zone');
    if (!zone || typeof nipplejs === 'undefined') return;
    zone.innerHTML = '';
    const manager = nipplejs.create({ zone, mode: 'static', position: { left: '50%', top: '50%' }, color: '#00ffff', size: 100 });
    manager.on('move', (evt, data) => {
        if (!data.vector) return;
        const forward = data.vector.y, turn = data.vector.x, threshold = 0.2;
        moveStatus.forward = forward > threshold;
        moveStatus.backward = forward < -threshold;
        moveStatus.left = turn < -threshold;
        moveStatus.right = turn > threshold;
    });
    manager.on('end', () => { moveStatus.forward = moveStatus.backward = moveStatus.left = moveStatus.right = false; });
}
window.addEventListener('DOMContentLoaded', () => {
    initMobileJoystick();
    injectMobileCloseButtons();
});
window.addEventListener('resize', () => setTimeout(initMobileJoystick, 200));

$('btn-mobile-jump')?.addEventListener('touchstart', (e) => { e.preventDefault(); triggerAvatarJump(); });
$('btn-mobile-interact')?.addEventListener('touchstart', (e) => {
    e.preventDefault();
    interactNearestMesh();
});

function injectMobileCloseButtons() {
    document.querySelectorAll('.panel').forEach(panel => {
        if (panel.querySelector('.mobile-close-panel-btn')) return;
        const btn = document.createElement('button');
        btn.className = 'mobile-close-panel-btn';
        btn.innerHTML = '✕';
        btn.title = 'ปิดหน้าต่าง';
        btn.addEventListener('click', (e) => { e.stopPropagation(); panel.style.display = 'none'; });
        panel.appendChild(btn);
    });
}

// ============================================================
// 5. MODEL LOADING — factory model (local upload → Supabase, or cloud URL)
// ============================================================
let factoryModel = null;
let originalMaterials = new Map();
let currentMaterialMode = 'solid';
let initialFactoryScale = 1;
let factoryColliders = [];

const HITBOX_PADDING = 0.6; // ขยาย hitbox ให้ชนง่ายขึ้น ไม่ต้องเดินตามขอบโมเดลเป๊ะๆ

function getLoaderForFile(fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    return (ext === 'fbx') ? new THREE.FBXLoader() : new THREE.GLTFLoader();
}

// ปรับแต่ง mesh ให้เรนเดอร์เบาลง เหมาะกับโมเดลโรงงานที่มีชิ้นส่วนจำนวนมาก
function optimizeMeshForRender(mesh) {
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (mesh.material) {
        if (mesh.material.roughness !== undefined) mesh.material.roughness = 0.8;
        if (mesh.material.metalness !== undefined) mesh.material.metalness = 0.2;
    }
}

function populateMeshList(root) {
    let meshCount = 0;
    const container = $('mesh-container');
    container.innerHTML = '';
    root.traverse(child => {
        if (!child.isMesh) return;
        meshCount++;
        originalMaterials.set(child.uuid, child.material.clone());
        if (!child._original3DName) child._original3DName = child.name || `Object_${meshCount}`;
        optimizeMeshForRender(child);

        const key = resolveDatabaseKey(child, child.name);
        const item = document.createElement('div');
        item.className = 'mesh-item';
        item.innerText = `${getIconForType(key)} ${child.name || child._original3DName}`;
        item.id = `mesh-item-${child.uuid}`;
        item.addEventListener('click', () => selectPart(child, '📋 คลิกจากรายการ'));
        item.addEventListener('contextmenu', (e) => { e.preventDefault(); openTypeSelector(child, child.name); });
        container.appendChild(item);
    });
    $('model-meta').innerHTML = `<span class="info-tag">ตรวจพบชิ้นส่วน: ${meshCount} รายการ</span>`;
    $('details-panel').style.display = 'block';
    return meshCount;
}

function applyTransform(t) {
    if (!factoryModel || !t) return;
    factoryModel.position.set(t.posX || 0, t.posY || 0, t.posZ || 0);
    factoryModel.rotation.y = t.rotY || 0;
    const sc = t.scale || 1;
    factoryModel.scale.set(initialFactoryScale * sc, initialFactoryScale * sc, initialFactoryScale * sc);
    syncSlidersWithModel();
    buildColliders();
}

function finalizeModelLoad(obj, opts) {
    factoryModel = obj.scene ? obj.scene : obj;
    populateMeshList(factoryModel);

    const box = new THREE.Box3().setFromObject(factoryModel);
    const size = box.getSize(new THREE.Vector3());
    initialFactoryScale = 12 / Math.max(size.x, size.y, size.z, 0.001);

    if (opts && opts.transform) {
        applyTransform(opts.transform);
    } else {
        factoryModel.scale.set(initialFactoryScale, initialFactoryScale, initialFactoryScale);
        const center = box.getCenter(new THREE.Vector3());
        factoryModel.position.set(-center.x * initialFactoryScale, 0, -center.z * initialFactoryScale);
    }

    scene.add(factoryModel);
    $('factory-status').innerText = `✓ โหลดสำเร็จ: ${opts && opts.label || ''}`;
    setFactoryMaterialMode(currentMaterialMode);
    buildColliders();
    buildProximityTags();
    buildPPEZones();
    syncSlidersWithModel();
    refreshTransformUiPermissions();
}

function disposeFactoryModel() {
    if (!factoryModel) return;
    factoryModel.traverse(child => {
        if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) (Array.isArray(child.material) ? child.material : [child.material]).forEach(m => m.dispose());
        }
    });
    scene.remove(factoryModel);
    factoryModel = null;
}

function loadModelFromUrl(url, fileName, transform) {
    currentSceneModelUrl = url;
    currentSceneModelName = fileName;
    fetch(url).then(r => r.arrayBuffer()).then(buf => {
        currentModelRawBuffer = buf;
        currentModelRawFileName = fileName;
    }).catch(err => console.warn('ดึงไฟล์ดิบมาแคชไม่สำเร็จ (ไม่กระทบการแสดงผล):', err));

    disposeFactoryModel();
    originalMaterials.clear(); factoryColliders = [];
    $('factory-status').innerText = `⬇️ กำลังโหลดโมเดลจาก Cloud...`;
    getLoaderForFile(fileName || url).load(url, obj => {
        finalizeModelLoad(obj, { label: fileName, transform });
    }, undefined, err => {
        $('factory-status').innerText = `❌ โหลดล้มเหลว`;
        console.error(err);
    });
}

function loadModelFromBlobUrl(blobUrl, fileName, transform, onDone) {
    disposeFactoryModel();
    originalMaterials.clear(); factoryColliders = [];
    $('factory-status').innerText = `⬇️ กำลังโหลดโมเดลจากไฟล์เซฟ...`;
    getLoaderForFile(fileName).load(blobUrl, obj => {
        finalizeModelLoad(obj, { label: `${fileName} (จากไฟล์เซฟ)`, transform });
        if (onDone) onDone();
    }, undefined, err => {
        $('factory-status').innerText = `❌ โหลดโมเดลจากไฟล์เซฟล้มเหลว`;
        console.error(err);
    });
}

// ---------- Supabase upload (เก็บ config เดิมของผู้ใช้ไว้ ไม่แตะระบบ backend) ----------
const SUPABASE_URL = 'https://hzlokmixfkfrmkuucfhg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6bG9rbWl4Zmtmcm1rdXVjZmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NzA5NTUsImV4cCI6MjA5ODE0Njk1NX0.DSj0c7XN979948Iq5rGmWqI9ddcbg56OmfKFin--Luo';
const SUPABASE_BUCKET = 'models';

async function uploadToSupabase(file) {
    const fileName = `model_${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${fileName}`;
    $('factory-status').innerText = `⬆️ กำลังอัปโหลด ${file.name}... (${(file.size / 1024 / 1024).toFixed(1)} MB)`;
    const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' },
        body: file
    });
    if (!res.ok) throw new Error(await res.text());
    return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${fileName}`;
}
async function deleteFromSupabaseStorage(fileUrl) {
    if (!fileUrl) return;
    try {
        const fileName = decodeURIComponent(fileUrl.split('/').pop());
        await fetch(`${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${fileName}`, {
            method: 'DELETE', headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` }
        });
    } catch (err) { console.warn('ลบไฟล์ออกจาก Supabase Storage ไม่สำเร็จ:', err); }
}

let currentSceneModelUrl = null, currentSceneModelName = null;
let currentModelRawBuffer = null, currentModelRawFileName = null;

$('factory-input')?.addEventListener('change', async function (event) {
    const files = event.target.files;
    if (!files.length) return;
    let modelFile = null;
    for (const f of files) { if (['gltf', 'glb', 'fbx'].includes(f.name.split('.').pop().toLowerCase())) { modelFile = f; break; } }
    if (!modelFile) { $('factory-status').innerText = '❌ ไม่พบไฟล์ 3D หลัก (.gltf/.glb/.fbx)'; return; }
    try {
        currentModelRawBuffer = await modelFile.arrayBuffer();
        currentModelRawFileName = modelFile.name;
        const url = await uploadToSupabase(modelFile);
        if (mpSocket && mpSocket.connected) mpSocket.emit('model_shared', { url, fileName: modelFile.name });
        else loadModelFromUrl(url, modelFile.name);
    } catch (err) {
        $('factory-status').innerText = `❌ อัปโหลดล้มเหลว: ${err.message}`;
    }
});

function buildColliders() {
    factoryColliders = [];
    if (!factoryModel) return;
    factoryModel.updateMatrixWorld(true);
    factoryModel.traverse(child => {
        if (!child.isMesh) return;
        const box = new THREE.Box3().setFromObject(child);
        box.expandByScalar(HITBOX_PADDING);
        factoryColliders.push({ uuid: child.uuid, mesh: child, box });
    });
}

function setFactoryMaterialMode(mode) {
    currentMaterialMode = mode;
    ['mode-solid', 'mode-wireframe', 'mode-xray'].forEach(m => { const el = $(m); if (el) el.className = `mode-btn ${m === 'mode-' + mode ? 'active' : ''}`; });
    if (!factoryModel) return;
    factoryModel.traverse(child => {
        if (!child.isMesh) return;
        const orig = originalMaterials.get(child.uuid);
        if (!orig) return;
        child.material.dispose();
        if (mode === 'solid') child.material = orig.clone();
        else if (mode === 'wireframe') child.material = new THREE.MeshStandardMaterial({ color: 0x00ffff, wireframe: true });
        else child.material = new THREE.MeshStandardMaterial({ color: 0x00aaff, transparent: true, opacity: 0.2, depthWrite: false });
    });
}
window.setFactoryMaterialMode = setFactoryMaterialMode;

// ============================================================
// 6. SELECTION / INTERACTION — REQ 4 & 6
// "ชี้" (raycast click/tap) หรือ "เดินชน" (collision) เพื่อขึ้นข้อมูล
// ชี้ซ้ำที่จุดเดิม หรือเดินออกไปไกล -> ข้อมูลหายอัตโนมัติ
// ไม่มีการ "จับ/ลาก" ชิ้นส่วนใดๆ (ตามที่ระบุว่าจะทำให้ระบบซับซ้อนเกินไป)
// ============================================================
const selection = { uuid: null, key: 'default' };
const raycaster = new THREE.Raycaster();
const pointerNDC = new THREE.Vector2();
const PROXIMITY_RANGE = 3.0;   // ระยะขยายป้าย (ตามคู่มือ 2-3 เมตร)
const DESELECT_DISTANCE = 6;   // ระยะที่ถือว่า "เดินเลยวัตถุ" แล้วปิดป้าย

function isEditingActive() {
    const grp = $('edit-actions-group');
    return grp && grp.style.display !== 'none';
}

function applyHighlight(uuid) {
    if (!factoryModel || currentMaterialMode !== 'solid') return;
    factoryModel.traverse(child => {
        if (!child.isMesh) return;
        if (child.uuid === uuid) child.material = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x001a1a });
        else if (originalMaterials.has(child.uuid)) child.material = originalMaterials.get(child.uuid).clone();
    });
}

function selectPart(mesh, method) {
    if (!mesh || !factoryModel) return;
    if (isEditingActive()) return; // ห้ามสลับชิ้นส่วนระหว่างแก้ไขข้อมูลค้างอยู่

    // REQ 6: "ชี้ซ้ำ" ที่จุดเดิม -> ปิดป้าย (toggle)
    if (selection.uuid === mesh.uuid) { deselectPart(); return; }

    selection.uuid = mesh.uuid;
    const key = resolveDatabaseKey(mesh, mesh.name);
    selection.key = key;
    applyHighlight(mesh.uuid);

    const data = workflowDatabase[key] || workflowDatabase.default;
    renderWorkflowUI(data.name || mesh.name, data.desc, data.steps, method, data.colorClass || 'tag-blue');
    cancelLiveEdit();
    $('process-panel').style.display = 'block';
}

function deselectPart() {
    selection.uuid = null;
    selection.key = 'default';
    $('process-panel').style.display = 'none';
    if (factoryModel && currentMaterialMode === 'solid') {
        factoryModel.traverse(child => {
            if (child.isMesh && originalMaterials.has(child.uuid)) child.material = originalMaterials.get(child.uuid).clone();
        });
    }
}

// ชี้ (คลิกเมาส์ / แตะจอ) — แยกจาก drag กล้อง โดยเช็คระยะขยับของ pointer
let pointerDownPos = null, pointerDownTime = 0;
renderer.domElement.addEventListener('pointerdown', (e) => { pointerDownPos = { x: e.clientX, y: e.clientY }; pointerDownTime = Date.now(); });
renderer.domElement.addEventListener('pointerup', (e) => {
    if (!pointerDownPos) return;
    const moved = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
    const elapsed = Date.now() - pointerDownTime;
    pointerDownPos = null;
    if (moved > 6 || elapsed > 600) return; // ถือว่าเป็นการลากกล้อง ไม่ใช่การชี้เลือก

    if (!factoryModel) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const hits = raycaster.intersectObject(factoryModel, true);
    if (hits.length > 0) selectPart(hits[0].object, '👆 ชี้เลือกอุปกรณ์');
    else deselectPart(); // ชี้พื้นที่ว่าง -> ปิดป้าย
});

function interactNearestMesh() {
    if (!factoryModel || !avatarModel) return;
    let closest = null, minDist = 5;
    factoryModel.traverse(child => {
        if (!child.isMesh) return;
        const p = new THREE.Vector3(); child.getWorldPosition(p);
        const d = avatarModel.position.distanceTo(p);
        if (d < minDist) { minDist = d; closest = child; }
    });
    if (closest) selectPart(closest, '📱 แตะปุ่ม Interact');
}

// REQ 4: เดินชน hitbox -> ขึ้นข้อมูลทันที (ไม่บล็อกการเดิน เดินทะลุได้อิสระ)
function checkWalkCollision(nextX, nextZ, currentY) {
    for (const col of factoryColliders) {
        const box = col.box;
        if (nextX + avatarConfig.radius > box.min.x && nextX - avatarConfig.radius < box.max.x &&
            nextZ + avatarConfig.radius > box.min.z && nextZ - avatarConfig.radius < box.max.z &&
            currentY < box.max.y && currentY + 1.6 > box.min.y) {
            if (selection.uuid !== col.uuid) selectPart(col.mesh, '🚶 ตัวละครเดินชนวัตถุ');
            return;
        }
    }
}

// REQ 6: เดินออกไปไกลจากจุดที่เลือกไว้ -> ปิดป้ายอัตโนมัติ
function checkAutoDeselect() {
    if (!avatarModel || !factoryModel || !selection.uuid) return;
    if (isEditingActive()) return;
    let pos = null;
    factoryModel.traverse(child => { if (child.isMesh && child.uuid === selection.uuid) { pos = new THREE.Vector3(); child.getWorldPosition(pos); } });
    if (!pos) return;
    if (avatarModel.position.distanceTo(pos) > DESELECT_DISTANCE) deselectPart();
}

// ============================================================
// 7. WORKFLOW UI — render / live edit / type selector
// ============================================================
function renderWorkflowUI(name, desc, stepsArray, method, colorClass) {
    $('process-panel').className = `panel floating-safety-panel ${colorClass}`;
    $('title-container').innerHTML = `
        <span id="process-title" style="font-weight:bold;font-size:15px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">⚙️ โซน: ${name}</span>
        <span id="detection-method" class="method-tag" style="flex-shrink:0;"></span>`;
    $('desc-view-area').innerText = desc;
    $('detection-method').innerText = method;

    const container = $('steps-view-area');
    container.innerHTML = '';
    (stepsArray || []).forEach(step => {
        const box = document.createElement('div');
        box.className = 'step-box';
        box.innerHTML = `<span class="badge">REGULATION</span><span></span>`;
        box.querySelector('span:last-child').innerText = step;
        container.appendChild(box);
    });
}

function enableLiveEdit() {
    if (!selection.uuid) return;
    const data = workflowDatabase[selection.key] || workflowDatabase.default;
    const methodText = $('detection-method') ? $('detection-method').innerText : '';
    $('title-container').innerHTML = `
        <input type="text" id="input-edit-title" class="ui-edit-input" style="font-weight:bold;flex:1;" value="">
        <span id="detection-method" class="method-tag" style="flex-shrink:0;">${methodText}</span>`;
    $('input-edit-title').value = data.name;
    $('input-edit-desc').value = data.desc;
    $('input-edit-steps').value = (data.steps || []).join(', ');

    $('desc-view-area').style.display = 'none';
    $('steps-view-area').style.display = 'none';
    $('desc-edit-area').style.display = 'block';
    $('steps-edit-area').style.display = 'block';
    $('btn-edit-mode').style.display = 'none';
    $('edit-actions-group').style.display = 'flex';
}

function closeLiveEditFields() {
    $('desc-view-area').style.display = 'block';
    $('steps-view-area').style.display = 'block';
    $('desc-edit-area').style.display = 'none';
    $('steps-edit-area').style.display = 'none';
    $('btn-edit-mode').style.display = 'block';
    $('edit-actions-group').style.display = 'none';
}

function cancelLiveEdit() {
    closeLiveEditFields();
    if (selection.uuid) {
        const data = workflowDatabase[selection.key] || workflowDatabase.default;
        renderWorkflowUI(data.name, data.desc, data.steps, $('detection-method') ? $('detection-method').innerText : '', data.colorClass || 'tag-blue');
    }
}

function saveLiveEdit() {
    if (!selection.uuid) return;
    const newTitle = $('input-edit-title').value.trim();
    const newDesc = $('input-edit-desc').value.trim();
    const newSteps = $('input-edit-steps').value.split(',').map(s => s.trim()).filter(Boolean);

    let nameKey = selection.uuid;
    let requiresPPE = false;
    factoryModel.traverse(child => {
        if (child.isMesh && child.uuid === selection.uuid) {
            nameKey = child._original3DName || child.name || child.uuid;
            if (!child._original3DName) child._original3DName = nameKey;
            child.name = newTitle;
            const existing = workflowDatabase[resolveDatabaseKey(child, newTitle)];
            requiresPPE = existing ? !!existing.requiresPPE : false;
        }
    });

    const record = { name: newTitle, desc: newDesc, steps: newSteps, colorClass: 'tag-blue', requiresPPE };
    workflowDatabase[nameKey] = record;
    selection.key = nameKey;

    const listItem = $(`mesh-item-${selection.uuid}`);
    if (listItem) listItem.innerText = `${getIconForType(userDefinedTypes[selection.uuid] || nameKey)} ${newTitle}`;

    renderWorkflowUI(newTitle, newDesc, newSteps, '✏️ บันทึกโดยผู้ใช้', 'tag-blue');
    closeLiveEditFields();
    buildProximityTags();
    buildPPEZones();

    if (mpSocket && mpSocket.connected) {
        mpSocket.emit('workflow_update', { key: nameKey, name: newTitle, desc: newDesc, steps: newSteps, colorClass: 'tag-blue', requiresPPE, targetUuid: selection.uuid });
    }
}
window.enableLiveEdit = enableLiveEdit;
window.cancelLiveEdit = cancelLiveEdit;
window.saveLiveEdit = saveLiveEdit;

// ---------- Type selector modal ----------
let typeSelectorTargetMesh = null;
function openTypeSelector(mesh, meshName) {
    typeSelectorTargetMesh = mesh;
    const overlay = $('type-selector-overlay'), grid = $('type-selector-grid');
    if (!overlay || !grid) return;
    $('type-selector-mesh-name').innerText = `📦 ชิ้นส่วน: ${meshName || mesh.name || mesh.uuid.slice(0, 8)}`;
    const currentKey = userDefinedTypes[mesh.uuid] || resolveDatabaseKey(mesh, meshName);
    const colorMap = { 'tag-red': '#ef4444', 'tag-orange': '#f97316', 'tag-blue': '#38bdf8', 'tag-green': '#22c55e' };

    grid.innerHTML = TYPE_OPTIONS.map(opt => {
        const active = opt.key === currentKey;
        const c = colorMap[opt.color] || '#38bdf8';
        return `<button onclick="assignMeshType('${opt.key}')" style="
            background:${active ? `rgba(${hexToRgb(c)},0.25)` : 'rgba(255,255,255,0.04)'};
            border:${active ? `2px solid ${c}` : '1px solid rgba(255,255,255,0.1)'};
            border-radius:10px;padding:10px 8px;cursor:pointer;text-align:left;
            color:${active ? c : '#cbd5e1'};font-size:11.5px;font-weight:${active ? 'bold' : 'normal'};line-height:1.4;">
            <span style="font-size:18px;display:block;margin-bottom:4px;">${opt.icon}</span>${opt.label}
            ${active ? '<span style="float:right;font-size:14px;">✓</span>' : ''}
        </button>`;
    }).join('');
    overlay.style.display = 'flex';
}
function closeTypeSelector() {
    const overlay = $('type-selector-overlay');
    if (overlay) overlay.style.display = 'none';
    typeSelectorTargetMesh = null;
}
function assignMeshType(typeKey) {
    if (!typeSelectorTargetMesh) return;
    const uuid = typeSelectorTargetMesh.uuid;
    const nameKey = typeSelectorTargetMesh._original3DName || typeSelectorTargetMesh.name || uuid;

    userDefinedTypes[uuid] = typeKey;
    userDefinedTypes[nameKey] = typeKey;

    const source = workflowDatabase[typeKey] || workflowDatabase.default;
    const record = { ...source };
    workflowDatabase[uuid] = record;
    workflowDatabase[nameKey] = record;

    buildProximityTags();
    buildPPEZones();
    closeTypeSelector();
    selectPart(typeSelectorTargetMesh, '🏷️ กำหนดประเภทด้วยตนเอง');

    const listItem = $(`mesh-item-${uuid}`);
    const opt = TYPE_OPTIONS.find(o => o.key === typeKey);
    if (listItem) listItem.innerText = `${opt?.icon || '🏭'} ${typeSelectorTargetMesh.name || typeKey}`;

    if (mpSocket && mpSocket.connected) {
        mpSocket.emit('workflow_update', {
            key: nameKey, name: record.name, desc: record.desc, steps: record.steps,
            colorClass: record.colorClass || 'tag-blue', requiresPPE: !!record.requiresPPE,
            targetUuid: uuid, assignedTypeKey: typeKey
        });
    }
    mpAppendChat({ name: '🏷️ ระบบ', color: '#00ffff', text: `กำหนด "${typeSelectorTargetMesh.name || uuid.slice(0, 8)}" เป็น "${opt?.label || typeKey}"` });
}
function clearMeshType() {
    if (!typeSelectorTargetMesh) return;
    delete userDefinedTypes[typeSelectorTargetMesh.uuid];
    delete workflowDatabase[typeSelectorTargetMesh.uuid];
    closeTypeSelector();
    buildProximityTags();
    buildPPEZones();
}
$('type-selector-overlay')?.addEventListener('click', function (e) { if (e.target === this) closeTypeSelector(); });
window.openTypeSelector = openTypeSelector;
window.closeTypeSelector = closeTypeSelector;
window.assignMeshType = assignMeshType;
window.clearMeshType = clearMeshType;
window.openTypeSelectorForActive = function () {
    if (!selection.uuid || !factoryModel) { mpAppendChat({ name: 'ระบบ', color: '#ef4444', text: 'กรุณาเลือกชิ้นส่วนก่อนกำหนด Type' }); return; }
    let target = null;
    factoryModel.traverse(c => { if (c.isMesh && c.uuid === selection.uuid) target = c; });
    if (target) openTypeSelector(target, target._original3DName || target.name);
};

// ============================================================
// 8. PROXIMITY TAG SYSTEM — ป้ายลอยเหนือชิ้นส่วน ขยายเมื่อเดินเข้าใกล้
// ============================================================
const proximityTags = [];

function tagColorFromClass(colorClass) {
    switch (colorClass) {
        case 'tag-red': return { bg: 'rgba(239,68,68,0.92)', border: '#ef4444' };
        case 'tag-orange': return { bg: 'rgba(249,115,22,0.92)', border: '#f97316' };
        case 'tag-green': return { bg: 'rgba(34,197,94,0.92)', border: '#22c55e' };
        default: return { bg: 'rgba(56,189,248,0.92)', border: '#38bdf8' };
    }
}
function createTagCanvas(key, expanded) {
    const data = workflowDatabase[key] || workflowDatabase.default;
    const colors = tagColorFromClass(data.colorClass);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!expanded) {
        canvas.width = 96; canvas.height = 96;
        ctx.beginPath(); ctx.arc(48, 48, 38, 0, Math.PI * 2);
        ctx.fillStyle = colors.bg; ctx.fill();
        ctx.lineWidth = 4; ctx.strokeStyle = '#ffffff'; ctx.stroke();
        ctx.font = 'bold 42px Arial'; ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('!', 48, 52);
    } else {
        const text = data.tagText || data.name || '';
        const maxWidth = 520;
        const measureCtx = document.createElement('canvas').getContext('2d');
        measureCtx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
        const words = text.split(' '); const lines = []; let line = '';
        for (const w of words) {
            const test = line ? line + ' ' + w : w;
            if (measureCtx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
        }
        if (line) lines.push(line);
        const lineHeight = 36, padding = 24;
        canvas.width = maxWidth + padding * 2;
        canvas.height = lines.length * lineHeight + padding * 2;

        ctx.fillStyle = colors.bg;
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(0, 0, canvas.width, canvas.height, 14); ctx.fill(); }
        else ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.lineWidth = 3; ctx.strokeStyle = colors.border; ctx.stroke();

        ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        lines.forEach((l, i) => ctx.fillText(l, canvas.width / 2, padding + lineHeight * i + lineHeight / 2));
    }
    return canvas;
}
function buildProximitySprite(key) {
    const tex = new THREE.CanvasTexture(createTagCanvas(key, false));
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true }));
    sprite.scale.set(0.5, 0.5, 1);
    sprite.renderOrder = 999;
    return sprite;
}
function updateSpriteTexture(sprite, key, expanded) {
    const canvas = createTagCanvas(key, expanded);
    sprite.material.map.dispose();
    sprite.material.map = new THREE.CanvasTexture(canvas);
    sprite.material.needsUpdate = true;
    if (expanded) { const aspect = canvas.width / canvas.height; sprite.scale.set(2.2 * aspect, 2.2, 1); }
    else sprite.scale.set(0.5, 0.5, 1);
}
function buildProximityTags() {
    proximityTags.forEach(t => { scene.remove(t.sprite); t.sprite.material.map.dispose(); t.sprite.material.dispose(); });
    proximityTags.length = 0;
    if (!factoryModel) return;
    factoryModel.updateMatrixWorld(true);
    factoryModel.traverse(child => {
        if (!child.isMesh) return;
        const key = resolveDatabaseKey(child, child.name);
        if (key === 'default') return;
        const worldPos = new THREE.Vector3(); child.getWorldPosition(worldPos);
        const box = new THREE.Box3().setFromObject(child);
        const height = box.max.y - box.min.y;
        const sprite = buildProximitySprite(key);
        sprite.position.set(worldPos.x, box.max.y + Math.max(height * 0.15, 0.4), worldPos.z);
        scene.add(sprite);
        proximityTags.push({ sprite, mesh: child, key, expanded: false });
    });
}
function updateProximityTags() {
    if (!avatarModel || proximityTags.length === 0) return;
    const pos = avatarModel.position;
    proximityTags.forEach(t => {
        const expand = pos.distanceTo(t.sprite.position) <= PROXIMITY_RANGE;
        if (expand !== t.expanded) { t.expanded = expand; updateSpriteTexture(t.sprite, t.key, expand); }
    });
}

// ============================================================
// 9. PPE ZONE SYSTEM — REQ 5: วงกลมรัศมี 15 เมตรรอบอุปกรณ์ที่ต้องระวัง
// ขับเคลื่อนด้วย flag `requiresPPE` ในฐานข้อมูล (ไม่ใช่ list ตายตัว)
// เพื่อให้จุดที่ admin กำหนดประเภทเองก็ได้วงเตือนอัตโนมัติด้วย
// ============================================================
const PPE_ZONE_RADIUS = 15;
const ppeZoneObjects = []; // { ring, label, centerX, centerZ }
let ppeAlertActive = false;

function buildPPEZones() {
    ppeZoneObjects.forEach(o => { scene.remove(o.ring); scene.remove(o.label); });
    ppeZoneObjects.length = 0;
    if (!factoryModel) return;

    factoryModel.traverse(child => {
        if (!child.isMesh) return;
        const key = resolveDatabaseKey(child, child.name);
        const data = workflowDatabase[key];
        if (!data || !data.requiresPPE) return;

        const worldPos = new THREE.Vector3(); child.getWorldPosition(worldPos);

        const ringGeo = new THREE.RingGeometry(PPE_ZONE_RADIUS - 0.15, PPE_ZONE_RADIUS + 0.15, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(worldPos.x, 0.05, worldPos.z);
        scene.add(ring);

        const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(255,170,0,0.88)';
        if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(4, 4, 504, 120, 14); ctx.fill(); } else ctx.fillRect(4, 4, 504, 120);
        ctx.font = 'bold 32px Arial'; ctx.fillStyle = '#000'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🛡️ PPE Zone 15m — สวมอุปกรณ์ป้องกันก่อนเข้า', 256, 64);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
        label.scale.set(8, 2, 1);
        label.position.set(worldPos.x, 1.5, worldPos.z - PPE_ZONE_RADIUS + 1);
        scene.add(label);

        ppeZoneObjects.push({ ring, label, centerX: worldPos.x, centerZ: worldPos.z });
    });
}
function checkPPEZones() {
    if (!avatarModel || ppeZoneObjects.length === 0) return;
    const ax = avatarModel.position.x, az = avatarModel.position.z;
    let inside = false;
    for (const z of ppeZoneObjects) {
        if (Math.hypot(ax - z.centerX, az - z.centerZ) <= PPE_ZONE_RADIUS) { inside = true; break; }
    }
    if (inside && !ppeAlertActive) {
        ppeAlertActive = true;
        mpAppendChat({ name: '⚠️ PPE Alert', color: '#ffaa00', text: 'คุณเข้าสู่พื้นที่อันตราย! กรุณาสวม 4-Gas Detector และ PPE ทันที' });
    } else if (!inside && ppeAlertActive) {
        ppeAlertActive = false;
        mpAppendChat({ name: '✅ ปลอดภัย', color: '#22c55e', text: 'ออกจากพื้นที่อันตรายแล้ว' });
    }
}

// ============================================================
// 10. TRANSFORM PANEL — REQ 1 & 2: scale/position/rotation + Lock
// เฉพาะ Admin ที่ล็อกอินถูกต้องและปลดล็อกไว้เท่านั้นที่ปรับได้ ผู้ใช้ทั่วไปเห็นแบบอ่านอย่างเดียว
// ทุกการปรับ sync ผ่าน server ให้ทุกคนในห้องเห็นตรงกันแบบเรียลไทม์
// ============================================================
let isAdmin = false;
let modelLocked = true;
const SLIDER_IDS = ['param-posX', 'param-posY', 'param-posZ', 'param-rotY', 'param-scale'];

function syncSlidersWithModel() {
    if (!factoryModel) return;
    $('param-posX').value = factoryModel.position.x;
    $('param-posY').value = factoryModel.position.y;
    $('param-posZ').value = factoryModel.position.z;
    $('param-rotY').value = Math.round(factoryModel.rotation.y * (180 / Math.PI));
    $('param-scale').value = (factoryModel.scale.x / initialFactoryScale).toFixed(2);
    updateSliderLabels();
}
function updateSliderLabels() {
    $('val-posX').innerText = parseFloat($('param-posX').value).toFixed(1);
    $('val-posY').innerText = parseFloat($('param-posY').value).toFixed(2);
    $('val-posZ').innerText = parseFloat($('param-posZ').value).toFixed(1);
    $('val-rotY').innerText = $('param-rotY').value + '°';
    $('val-scale').innerText = $('param-scale').value + 'x';
}

let _lastTransformEmit = 0;
SLIDER_IDS.forEach(id => {
    $(id)?.addEventListener('input', () => {
        if (!factoryModel || !isAdmin || modelLocked) return;
        const px = parseFloat($('param-posX').value), py = parseFloat($('param-posY').value), pz = parseFloat($('param-posZ').value);
        const ry = parseFloat($('param-rotY').value) * (Math.PI / 180);
        const sc = parseFloat($('param-scale').value);
        factoryModel.position.set(px, py, pz);
        factoryModel.rotation.y = ry;
        factoryModel.scale.set(initialFactoryScale * sc, initialFactoryScale * sc, initialFactoryScale * sc);
        updateSliderLabels();
        buildColliders();
        buildProximityTags();
        buildPPEZones();

        const now = Date.now();
        if (mpSocket && mpSocket.connected && now - _lastTransformEmit > 60) {
            _lastTransformEmit = now;
            mpSocket.emit('model_transform_update', { posX: px, posY: py, posZ: pz, rotY: ry, scale: sc });
        }
    });
});

// เปิด/ปิดการใช้งาน slider ให้ตรงกับสิทธิ์ปัจจุบันเสมอ (เรียกทุกครั้งที่สถานะ admin/lock เปลี่ยน)
function refreshTransformUiPermissions() {
    const canEdit = isAdmin && !modelLocked;
    SLIDER_IDS.forEach(id => { const el = $(id); if (el) el.disabled = !canEdit; });

    const loginRow = $('admin-login-row'), statusRow = $('admin-status-row');
    if (loginRow) loginRow.style.display = isAdmin ? 'none' : 'flex';
    if (statusRow) statusRow.style.display = isAdmin ? 'flex' : 'none';

    const lockBtn = $('btn-toggle-lock');
    if (lockBtn) {
        lockBtn.style.display = isAdmin ? 'block' : 'none';
        lockBtn.innerText = modelLocked ? '🔓 ปลดล็อกเพื่อแก้ไข' : '🔒 ล็อกโมเดล';
        lockBtn.style.background = modelLocked ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.2)';
        lockBtn.style.borderColor = modelLocked ? '#22c55e' : '#ef4444';
        lockBtn.style.color = modelLocked ? '#22c55e' : '#ef4444';
    }
    const badge = $('lock-status-badge');
    if (badge) {
        if (modelLocked) {
            badge.innerText = '🔒 โมเดลถูกล็อกไว้ — เฉพาะ Admin เท่านั้นที่ปลดล็อกได้';
            badge.style.background = 'rgba(239,68,68,0.12)'; badge.style.color = '#ef4444'; badge.style.border = '1px solid rgba(239,68,68,0.3)';
        } else {
            badge.innerText = '🔓 โมเดลปลดล็อกอยู่ — Admin กำลังปรับตำแหน่ง';
            badge.style.background = 'rgba(34,197,94,0.12)'; badge.style.color = '#22c55e'; badge.style.border = '1px solid rgba(34,197,94,0.3)';
        }
    }
}

window.adminLogin = function () {
    const pw = $('admin-password-input').value;
    if (!mpSocket || !mpSocket.connected) { mpAppendChat({ name: 'ระบบ', color: '#ef4444', text: 'ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์ ลองใหม่อีกครั้ง' }); return; }
    mpSocket.emit('admin_login', pw, (res) => {
        $('admin-password-input').value = '';
        if (res && res.success) {
            isAdmin = true;
            modelLocked = !!res.modelLocked;
            if (res.modelTransform) applyTransform(res.modelTransform);
            refreshTransformUiPermissions();
            mpAppendChat({ name: '🔑 ระบบ', color: '#22c55e', text: 'เข้าสู่โหมด Admin สำเร็จ — ตอนนี้คุณปรับตำแหน่งโมเดลได้ (หลังปลดล็อก)' });
        } else {
            mpAppendChat({ name: '🔑 ระบบ', color: '#ef4444', text: 'รหัสผ่าน Admin ไม่ถูกต้อง' });
        }
    });
};
window.adminLogout = function () {
    isAdmin = false;
    if (mpSocket && mpSocket.connected) mpSocket.emit('admin_logout');
    refreshTransformUiPermissions();
};
window.toggleModelLock = function () {
    if (!isAdmin || !mpSocket || !mpSocket.connected) return;
    mpSocket.emit('toggle_lock');
};

// ============================================================
// 11. MULTIPLAYER — Socket.IO
// ============================================================
const remoteAvatars = {}, remoteTargets = {}, mpPlayerNames = {}, mpPlayerColors = {};
let mpMyId = null, mpMyColor = '#00ffff', mpSocket = null, _lastMoveEmit = 0;

function buildRemoteAvatar(color) { return createEngineerAvatar(color || '#4d96ff'); }
function setAvatarLabel(g, name, color) {
    if (g._label) { g.remove(g._label); g._label.material.map.dispose(); }
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(4, 4, 248, 56, 10); ctx.fill(); } else ctx.fillRect(4, 4, 248, 56);
    ctx.font = 'bold 24px Arial'; ctx.fillStyle = color || '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(name.substring(0, 16), 128, 32);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), depthTest: false }));
    sp.scale.set(1.8, 0.45, 1); sp.position.y = 2.2;
    g.add(sp); g._label = sp;
}
function addRemote(data) {
    if (remoteAvatars[data.id]) return;
    const av = buildRemoteAvatar(data.color || '#4d96ff');
    av.position.set(data.position.x, data.position.y, data.position.z);
    scene.add(av); remoteAvatars[data.id] = av;
    setAvatarLabel(av, data.name || data.id, data.color || '#fff');
    mpPlayerNames[data.id] = data.name; mpPlayerColors[data.id] = data.color;
    updateMpUI();
}
function removeRemote(id) {
    if (remoteAvatars[id]) { scene.remove(remoteAvatars[id]); delete remoteAvatars[id]; delete remoteTargets[id]; }
    delete mpPlayerNames[id]; delete mpPlayerColors[id];
    updateMpUI();
}
function updateRemoteAvatars() {
    for (const id in remoteAvatars) {
        const av = remoteAvatars[id], t = remoteTargets[id];
        if (!t) continue;
        av.position.lerp(t.pos, 0.18);
        av.rotation.y += (t.rotY - av.rotation.y) * 0.18;
        animateEngineerWalk(av, t.pos.distanceTo(av.position) > 0.01);
    }
}
function emitOwnPosition() {
    if (!mpSocket || !mpSocket.connected || !avatarModel) return;
    const now = Date.now();
    if (now - _lastMoveEmit < 50) return;
    _lastMoveEmit = now;
    mpSocket.emit('player_move', {
        position: { x: avatarModel.position.x, y: avatarModel.position.y, z: avatarModel.position.z },
        rotation: { y: avatarModel.rotation.y }
    });
}
function updateMpUI() {
    const list = $('mp-player-list');
    if (!list) return;
    const all = [mpMyId, ...Object.keys(remoteAvatars)].filter(Boolean);
    $('mp-player-count').innerText = all.length;
    list.innerHTML = all.map(id => {
        const isMe = id === mpMyId;
        const name = mpPlayerNames[id] || (isMe ? 'คุณ' : id.slice(0, 6));
        const color = mpPlayerColors[id] || '#fff';
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
            <span style="color:${color};font-weight:${isMe ? 'bold' : 'normal'}">${isMe ? '👤 ' : ''}${name}</span>
        </div>`;
    }).join('');
}
function mpAppendChat(msg) {
    const log = $('mp-chat-log');
    if (!log) return;
    const d = document.createElement('div');
    d.style.cssText = `margin-bottom:4px;color:${msg.color || '#fff'};word-break:break-all;font-size:11px;`;
    const strong = document.createElement('strong');
    strong.innerText = msg.name + ': ';
    d.appendChild(strong);
    d.appendChild(document.createTextNode(msg.text));
    log.appendChild(d); log.scrollTop = log.scrollHeight;
}
window.setMyName = function () {
    const v = $('mp-name-input').value.trim();
    if (!v || !mpSocket) return;
    mpSocket.emit('set_name', v);
    mpPlayerNames[mpMyId] = v; updateMpUI();
};
window.sendChat = function () {
    const inp = $('mp-chat-input');
    const text = inp.value.trim();
    if (!text || !mpSocket) return;
    mpSocket.emit('chat_message', text); inp.value = '';
};
$('mp-chat-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') window.sendChat(); });
$('mp-name-input')?.addEventListener('keydown', e => { if (e.key === 'Enter') window.setMyName(); });

function initMultiplayer() {
    const dot = $('mp-dot'), txt = $('mp-status-text');
    if (typeof io === 'undefined') { txt.innerText = 'Single Player mode'; return; }

    const SERVER = window.RAILWAY_SERVER_URL || window.location.origin;
    mpSocket = io(SERVER, { transports: ['websocket', 'polling'] });

    mpSocket.on('connect', () => { dot.style.background = '#22c55e'; txt.innerText = 'เชื่อมต่อแล้ว ✓'; });
    mpSocket.on('disconnect', () => { dot.style.background = '#ef4444'; txt.innerText = 'การเชื่อมต่อขาด...'; });

    mpSocket.on('self_init', data => {
        mpMyId = data.self.id;
        mpMyColor = data.self.color;
        mpPlayerNames[mpMyId] = data.self.name;
        mpPlayerColors[mpMyId] = mpMyColor;
        $('mp-name-input').value = data.self.name;
        if (avatarModel) avatarModel.position.set(data.self.position.x, data.self.position.y, data.self.position.z);
        if (!VIEWER_MODE) data.others.forEach(p => addRemote(p));

        if (data.workflowDb) Object.assign(workflowDatabase, data.workflowDb);
        if (data.typeAssignments) Object.assign(userDefinedTypes, data.typeAssignments);
        modelLocked = data.modelLocked !== undefined ? data.modelLocked : true;
        isAdmin = false;
        refreshTransformUiPermissions();
        updateMpAdminBadge(data.adminCount || 0);

        if (data.modelUrl) loadModelFromUrl(data.modelUrl, data.modelName, data.modelTransform);
        updateMpUI();
    });

    mpSocket.on('player_joined', data => { if (!VIEWER_MODE) addRemote(data); mpAppendChat({ name: 'ระบบ', color: '#64748b', text: `${data.name} เข้าร่วมโลก` }); });
    mpSocket.on('player_left', data => {
        const name = mpPlayerNames[data.id] || data.id;
        removeRemote(data.id);
        mpAppendChat({ name: 'ระบบ', color: '#64748b', text: `${name} ออกจากโลก` });
    });
    mpSocket.on('player_moved', data => {
        if (!remoteAvatars[data.id]) return;
        if (!remoteTargets[data.id]) remoteTargets[data.id] = { pos: new THREE.Vector3(), rotY: 0 };
        remoteTargets[data.id].pos.set(data.position.x, data.position.y, data.position.z);
        remoteTargets[data.id].rotY = data.rotation?.y || 0;
    });
    mpSocket.on('player_renamed', data => {
        mpPlayerNames[data.id] = data.name;
        if (remoteAvatars[data.id]) setAvatarLabel(remoteAvatars[data.id], data.name, mpPlayerColors[data.id] || '#fff');
        updateMpUI();
    });
    mpSocket.on('load_model', data => {
        mpAppendChat({ name: 'ระบบ', color: '#00ffff', text: `📦 โมเดลใหม่: ${data.fileName}` });
        modelLocked = data.modelLocked !== undefined ? data.modelLocked : true;
        refreshTransformUiPermissions();
        loadModelFromUrl(data.url, data.fileName, data.modelTransform);
    });
    mpSocket.on('model_removed', () => {
        clearFactoryModelFromScene();
        mpAppendChat({ name: '🗑️ ระบบ', color: '#ef4444', text: 'โมเดลถูกลบออกจากฉากแล้ว' });
    });
    mpSocket.on('admin_presence', data => { updateMpAdminBadge(data.adminCount); });
    mpSocket.on('lock_state', data => {
        modelLocked = data.locked;
        refreshTransformUiPermissions();
        mpAppendChat({ name: '🔒 ระบบ', color: '#ffaa00', text: `${data.by} ${data.locked ? 'ล็อก' : 'ปลดล็อก'}ตำแหน่งโมเดลแล้ว` });
    });
    mpSocket.on('model_transform_updated', t => { applyTransform(t); buildProximityTags(); buildPPEZones(); });

    mpSocket.on('workflow_updated', data => {
        const record = { name: data.name, desc: data.desc, steps: data.steps, colorClass: data.colorClass || 'tag-blue', requiresPPE: !!data.requiresPPE };
        workflowDatabase[data.key] = record;
        if (data.targetUuid) workflowDatabase[data.targetUuid] = record;
        if (data.assignedTypeKey) userDefinedTypes[data.key] = data.assignedTypeKey;

        if (factoryModel) {
            factoryModel.traverse(child => {
                if (!child.isMesh) return;
                if (!child._original3DName) child._original3DName = child.name;
                if (child._original3DName === data.key || child.name === data.key || child.uuid === data.key || child.uuid === data.targetUuid) {
                    child.name = data.name;
                    if (data.assignedTypeKey) userDefinedTypes[child.uuid] = data.assignedTypeKey;
                    const item = $(`mesh-item-${child.uuid}`);
                    if (item) item.innerText = `${getIconForType(data.assignedTypeKey || data.colorClass)} ${data.name}`;
                }
            });
        }
        buildProximityTags();
        buildPPEZones();

        const panel = $('process-panel');
        if (panel && panel.style.display !== 'none' && (selection.key === data.key || selection.key === data.targetUuid || selection.uuid === data.targetUuid)) {
            renderWorkflowUI(data.name, data.desc, data.steps, '✏️ อัปเดตโดยผู้เล่นอื่น', data.colorClass || 'tag-blue');
        }
        mpAppendChat({ name: 'ระบบ', color: '#ffaa00', text: `✏️ "${data.name}" ถูกแก้ไขแล้ว` });
    });

    mpSocket.on('chat_message', msg => mpAppendChat(msg));
}
function updateMpAdminBadge(count) {
    const el = $('mp-admin-count');
    if (el) el.innerText = count;
}
initMultiplayer();

// ============================================================
// 12. SAVE / LOAD SCENE (.zip) — เก็บไฟล์โมเดลต้นฉบับตรงๆ ไม่ผ่านการ re-export
// ============================================================
function collectPartMetadata() {
    const workflowOverrides = {}, typeAssignmentsOut = {};
    if (factoryModel) {
        factoryModel.traverse(child => {
            if (!child.isMesh) return;
            const nameKey = child._original3DName || child.name;
            if (!nameKey) return;
            if (workflowDatabase[nameKey]) workflowOverrides[nameKey] = workflowDatabase[nameKey];
            const rawType = userDefinedTypes[nameKey] || userDefinedTypes[child.uuid];
            if (rawType) typeAssignmentsOut[nameKey] = rawType;
        });
    }
    return { workflowOverrides, typeAssignments: typeAssignmentsOut };
}

window.saveScene = async function () {
    const statusEl = $('scene-save-status');
    if (!currentModelRawBuffer || !currentModelRawFileName) { statusEl.innerText = '❌ ยังไม่มีไฟล์โมเดลต้นฉบับให้บันทึก'; return; }
    if (!factoryModel) { statusEl.innerText = '❌ ยังไม่มีโมเดลในฉาก'; return; }
    try {
        statusEl.innerText = '⏳ กำลังรวมไฟล์...';
        const { workflowOverrides, typeAssignments } = collectPartMetadata();
        const transform = {
            posX: factoryModel.position.x, posY: factoryModel.position.y, posZ: factoryModel.position.z,
            rotY: factoryModel.rotation.y, scale: factoryModel.scale.x / (initialFactoryScale || 1)
        };
        const metadata = { version: 4, savedAt: new Date().toISOString(), modelFileName: currentModelRawFileName, transform, workflowOverrides, typeAssignments };

        const zip = new JSZip();
        zip.file(currentModelRawFileName, currentModelRawBuffer);
        zip.file('data.json', JSON.stringify(metadata, null, 2));
        const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

        const fname = `biogas_scene_${Date.now()}.zip`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = fname;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
        statusEl.innerText = `✅ บันทึกแล้ว: ${fname} (${Object.keys(workflowOverrides).length} ชิ้นส่วน)`;
    } catch (err) {
        console.error(err);
        statusEl.innerText = `❌ บันทึกล้มเหลว: ${err.message}`;
    }
};

function applyPartMetadata(metadata) {
    Object.assign(workflowDatabase, metadata.workflowOverrides || {});
    Object.assign(userDefinedTypes, metadata.typeAssignments || {});
    if (factoryModel) {
        factoryModel.traverse(child => {
            if (!child.isMesh) return;
            const nameKey = child._original3DName || child.name;
            if (workflowDatabase[nameKey]) child.name = workflowDatabase[nameKey].name;
            const item = $(`mesh-item-${child.uuid}`);
            if (item) item.innerText = `${getIconForType(userDefinedTypes[nameKey] || nameKey)} ${child.name}`;
        });
    }
    buildProximityTags();
    buildPPEZones();
}

async function broadcastLoadedSceneToRoom(rawBuffer, fileName, metadata) {
    if (!mpSocket || !mpSocket.connected || !isAdmin) return;
    try {
        const statusEl = $('scene-save-status');
        statusEl.innerText = '⏳ กำลังอัปโหลดโมเดลขึ้น Cloud เพื่อแชร์ให้ผู้เล่นอื่น...';
        const modelFile = new File([rawBuffer], fileName, { type: 'application/octet-stream' });
        const publicUrl = await uploadToSupabase(modelFile);
        mpSocket.emit('model_shared', { url: publicUrl, fileName });

        const overrides = metadata.workflowOverrides || {};
        Object.keys(overrides).forEach(nameKey => {
            const d = overrides[nameKey];
            mpSocket.emit('workflow_update', { key: nameKey, name: d.name, desc: d.desc, steps: d.steps, colorClass: d.colorClass || 'tag-blue', requiresPPE: !!d.requiresPPE, assignedTypeKey: (metadata.typeAssignments || {})[nameKey] || null });
        });
        statusEl.innerText = `✅ แชร์ฉากให้ผู้เล่นในห้องแล้ว (${Object.keys(overrides).length} ชิ้นส่วน)`;
    } catch (err) {
        console.error(err);
        $('scene-save-status').innerText = `⚠️ โหลดสำเร็จ แต่แชร์ให้ผู้เล่นอื่นไม่สำเร็จ: ${err.message}`;
    }
}

window.loadScene = async function (file) {
    const statusEl = $('scene-save-status');
    try {
        statusEl.innerText = '⏳ กำลังเปิดไฟล์เซฟ...';
        const zip = await JSZip.loadAsync(file);
        const jsonEntry = zip.file('data.json');
        if (!jsonEntry) throw new Error('ไฟล์เซฟไม่ถูกต้อง (ไม่พบ data.json)');
        const metadata = JSON.parse(await jsonEntry.async('string'));

        const modelEntry = zip.file(metadata.modelFileName);
        if (!modelEntry) throw new Error(`ไม่พบไฟล์โมเดล "${metadata.modelFileName}" ในไฟล์เซฟ`);
        const modelArrayBuffer = await modelEntry.async('arraybuffer');
        const blobUrl = URL.createObjectURL(new Blob([modelArrayBuffer]));

        currentModelRawBuffer = modelArrayBuffer;
        currentModelRawFileName = metadata.modelFileName;

        statusEl.innerText = '⏳ กำลังโหลดโมเดล...';
        loadModelFromBlobUrl(blobUrl, metadata.modelFileName, metadata.transform, () => {
            applyPartMetadata(metadata);
            const partCount = Object.keys(metadata.workflowOverrides || {}).length;
            statusEl.innerText = `✅ โหลดฉากสำเร็จ (${partCount} ชิ้นส่วน)`;
            mpAppendChat({ name: '💾 ระบบ', color: '#38bdf8', text: `โหลดฉากที่บันทึกไว้แล้ว — ${partCount} ชิ้นส่วน` });
            broadcastLoadedSceneToRoom(modelArrayBuffer, metadata.modelFileName, metadata);
            URL.revokeObjectURL(blobUrl);
        });
    } catch (err) {
        console.error(err);
        statusEl.innerText = `❌ โหลดไฟล์ไม่สำเร็จ: ${err.message}`;
    }
};
$('scene-load-input')?.addEventListener('change', function (e) { const f = e.target.files[0]; if (f) window.loadScene(f); });

// ============================================================
// 13. DELETE MODEL
// ============================================================
function clearFactoryModelFromScene() {
    disposeFactoryModel();
    originalMaterials.clear();
    factoryColliders = [];
    $('mesh-container').innerHTML = '';
    $('model-meta').innerHTML = '';
    $('details-panel').style.display = 'none';
    $('process-panel').style.display = 'none';
    $('factory-status').innerText = 'สถานะ: รอการอัปโหลดโมเดล...';
    $('btn-delete-model').style.display = 'none';
    selection.uuid = null; selection.key = 'default';
    buildProximityTags();
    buildPPEZones();
}
window.deleteCurrentModel = async function () {
    if (!factoryModel && !currentSceneModelUrl) { mpAppendChat({ name: 'ระบบ', color: '#ef4444', text: 'ยังไม่มีโมเดลในฉากให้ลบ' }); return; }
    if (!isAdmin) { mpAppendChat({ name: 'ระบบ', color: '#ef4444', text: 'เฉพาะ Admin เท่านั้นที่ลบโมเดลได้' }); return; }
    const urlToDelete = currentSceneModelUrl;
    clearFactoryModelFromScene();
    currentSceneModelUrl = null; currentSceneModelName = null;
    currentModelRawBuffer = null; currentModelRawFileName = null;
    if (mpSocket && mpSocket.connected) mpSocket.emit('model_removed');
    mpAppendChat({ name: '🗑️ ระบบ', color: '#ef4444', text: 'ลบโมเดลออกจากฉากแล้ว' });
    if (urlToDelete) deleteFromSupabaseStorage(urlToDelete);
};
setInterval(() => {
    const btn = $('btn-delete-model');
    if (!btn) return;
    const shouldShow = !!factoryModel;
    if ((btn.style.display !== 'none') !== shouldShow) btn.style.display = shouldShow ? 'block' : 'none';
}, 500);

// ============================================================
// 14. MAIN LOOP — เรียกทุกระบบผ่าน safeCall() กัน error หนึ่งจุดลากทั้งเฟรมพัง
// ============================================================
function updateAvatarPhysics() {
    if (isTypingInField()) return;

    if (isFreeLook) {
        const camDir = new THREE.Vector3(); camera.getWorldDirection(camDir);
        const camRight = new THREE.Vector3().crossVectors(camera.up, camDir).normalize();
        if (moveStatus.forward) { camera.position.addScaledVector(camDir, freeLookSpeed); controls.target.addScaledVector(camDir, freeLookSpeed); }
        if (moveStatus.backward) { camera.position.addScaledVector(camDir, -freeLookSpeed); controls.target.addScaledVector(camDir, -freeLookSpeed); }
        if (moveStatus.left) { camera.position.addScaledVector(camRight, freeLookSpeed); controls.target.addScaledVector(camRight, freeLookSpeed); }
        if (moveStatus.right) { camera.position.addScaledVector(camRight, -freeLookSpeed); controls.target.addScaledVector(camRight, -freeLookSpeed); }
        return;
    }
    if (!avatarModel) return;

    if (jumpConfig.isJumping) {
        avatarModel.position.y += jumpConfig.velocity;
        jumpConfig.velocity += jumpConfig.gravity;
        if (avatarModel.position.y <= jumpConfig.groundY) { avatarModel.position.y = jumpConfig.groundY; jumpConfig.isJumping = false; }
    } else if (avatarModel.position.y > jumpConfig.groundY) {
        avatarModel.position.y += jumpConfig.gravity;
        if (avatarModel.position.y < jumpConfig.groundY) avatarModel.position.y = jumpConfig.groundY;
    }

    if (moveStatus.left) avatarModel.rotation.y += avatarConfig.turnSpeed;
    if (moveStatus.right) avatarModel.rotation.y -= avatarConfig.turnSpeed;

    const moveVector = new THREE.Vector3(0, 0, 0);
    if (moveStatus.forward) moveVector.z = -avatarConfig.speed;
    if (moveStatus.backward) moveVector.z = avatarConfig.speed;
    moveVector.applyQuaternion(avatarModel.quaternion);

    const isMoving = moveVector.lengthSq() > 0;
    animateEngineerWalk(avatarModel, isMoving);

    if (isMoving) {
        const nextX = avatarModel.position.x + moveVector.x;
        const nextZ = avatarModel.position.z + moveVector.z;
        const currentY = avatarModel.position.y - jumpConfig.groundY;
        avatarModel.position.x = nextX;
        avatarModel.position.z = nextZ;
        checkWalkCollision(nextX, nextZ, currentY);
    }

    const targetCamOffset = defaultCameraOffset.clone().applyMatrix4(avatarModel.matrixWorld);
    camera.position.lerp(targetCamOffset, 0.08);
    controls.target.set(avatarModel.position.x, avatarModel.position.y + 0.3, avatarModel.position.z);
}

function animate() {
    requestAnimationFrame(animate);
    safeCall(updateAvatarPhysics, 'updateAvatarPhysics');
    safeCall(updateRemoteAvatars, 'updateRemoteAvatars');
    safeCall(updateProximityTags, 'updateProximityTags');
    safeCall(checkPPEZones, 'checkPPEZones');
    safeCall(checkAutoDeselect, 'checkAutoDeselect');
    safeCall(emitOwnPosition, 'emitOwnPosition');
    safeCall(() => controls.update(), 'controls.update');
    safeCall(() => renderer.render(scene, camera), 'renderer.render');
}
animate();

// ============================================================
// 15. IOT TELEMETRY SIMULATION (คงพฤติกรรมเดิม)
// ============================================================
setInterval(() => {
    if (!selection.uuid) return;
    let pressureVal, tempVal;
    if (selection.key === 'pipe') {
        pressureVal = (1.5 + Math.random() * 0.5).toFixed(2) + ' bar';
        tempVal = (31.2 + Math.random() * 1.5).toFixed(1) + ' °C';
    } else if (selection.key === 'tank') {
        pressureVal = (0.04 + Math.random() * 0.03).toFixed(3) + ' bar';
        tempVal = (37.5 + Math.random() * 0.8).toFixed(1) + ' °C';
    } else {
        pressureVal = '0.00 bar'; tempVal = '28.5 °C';
    }
    $('iot-pressure').innerText = pressureVal;
    $('iot-temp').innerText = tempVal;
}, 1500);
