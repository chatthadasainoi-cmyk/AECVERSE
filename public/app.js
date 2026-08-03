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
    // watcher ดูอย่างเดียว: ไม่มีตัวละคร ไม่มีแชท/ไมค์ (server ก็บล็อกอยู่แล้ว — ซ่อน UI ให้ตรงกัน)
    ['multiplayer-panel', 'mobile-controls-container', 'hud-multiplayer', 'hud-reset-camera', 'freelook-btn', 'hud-jump', 'hud-voice', 'hud-chat', 'chat-overlay']
        .forEach(id => { const el = $(id); if (el) el.style.display = 'none'; });
}

// ============================================================
// 1. SCENE / CAMERA / RENDERER
// ============================================================
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x080b11); // ตรงกับ --bg-0 ของ design system ทั้งเว็บ
scene.fog = new THREE.Fog(0x080b11, 45, 140); // หมอกจางๆ ให้ฉากมีมิติ ไม่ตัดขอบกริดแข็งๆ

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

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x0e131c, 0.55)); // แสงนวลโทนฟ้าจากท้องฟ้า ให้โมเดลดูมีมิติกว่าแสงขาวแบนๆ
const dirLight = new THREE.DirectionalLight(0xffffff, 1.1);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

// พื้น + กริดโทนเดียวกับเว็บ (น้ำเงินหม่น) แทนกริด neon cyan เดิม
const groundDisc = new THREE.Mesh(
    new THREE.CircleGeometry(80, 64),
    new THREE.MeshBasicMaterial({ color: 0x0a0e16 })
);
groundDisc.rotation.x = -Math.PI / 2;
groundDisc.position.y = -0.02;
scene.add(groundDisc);
scene.add(new THREE.GridHelper(60, 60, 0x2e4a75, 0x141c2a));

function fitRendererToContainer() {
    const w = canvasContainer.clientWidth, h = canvasContainer.clientHeight;
    if (!w || !h) return; // ยัง layout ไม่เสร็จ — ResizeObserver จะเรียกซ้ำเองเมื่อได้ขนาดจริง
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}
window.addEventListener('resize', fitRendererToContainer);
// เฝ้าดูขนาด container ตรงๆ — กันเคส canvas เกิดตอน container กว้าง 0
// (เช่นอยู่ใน iframe ที่ยังจัด layout ไม่เสร็จ) แล้วค้างเป็นจอดำถาวร
if (window.ResizeObserver) new ResizeObserver(fitRendererToContainer).observe(canvasContainer);

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
    },
    "water_seal": {
        name: "ชุดดักไฟย้อน Water Seal",
        desc: "อุปกรณ์นิรภัยแบบซีลน้ำ ป้องกันเปลวไฟย้อนกลับเข้าระบบท่อก๊าซ ติดตั้งร่วมกับ Flame Arrester ตามหลักวิศวกรรม",
        tagText: "💧 Water Seal: รักษาระดับน้ำในซีลตามที่กำหนดเสมอ",
        colorClass: "tag-orange", requiresPPE: false,
        steps: ["💧 ตรวจสอบระดับน้ำในซีลให้อยู่ในเกณฑ์ที่กำหนดทุกกะการทำงาน", "❄️ เติมสารป้องกันการระเหย/แข็งตัวของน้ำตามฤดูกาล", "🔍 ตรวจการอุดตันและตะกอนในชุดซีลตามรอบบำรุงรักษา"]
    },
    "gas_detector": {
        name: "เครื่องตรวจจับก๊าซแบบติดตั้งถาวร (Fixed Gas Detector)",
        desc: "เซนเซอร์ตรวจจับก๊าซมีเทน/ไฮโดรเจนซัลไฟด์แบบติดตั้งประจำจุด เชื่อมสัญญาณเตือนเข้าห้องควบคุมอัตโนมัติ",
        tagText: "📡 Fixed Gas Detector: จุดตรวจจับก๊าซรั่วอัตโนมัติ 24 ชม.",
        colorClass: "tag-green", requiresPPE: false,
        steps: ["📡 สอบเทียบ (Calibrate) เซนเซอร์ตามรอบที่ผู้ผลิตกำหนด", "🔔 ทดสอบสัญญาณเตือนเข้าห้องควบคุมเป็นประจำ", "🧯 กำหนดขั้นตอนตอบโต้ทันทีเมื่อค่าก๊าซเกินเกณฑ์เตือน"]
    },
    "fire_equipment": {
        name: "อุปกรณ์ดับเพลิง (Fire Extinguisher / Hydrant)",
        desc: "จุดติดตั้งถังดับเพลิงและอุปกรณ์ผจญเพลิงประจำพื้นที่ ตามผังมาตรฐานความปลอดภัย",
        tagText: "🧯 อุปกรณ์ดับเพลิง: ห้ามมีสิ่งกีดขวางทางเข้าถึงเด็ดขาด",
        colorClass: "tag-green", requiresPPE: false,
        steps: ["🧯 ตรวจสอบแรงดันถังดับเพลิงและสภาพสายฉีดทุกเดือน", "🚧 ห้ามวางสิ่งของกีดขวางจุดติดตั้งอุปกรณ์ดับเพลิง", "🏷️ ติดป้ายบอกตำแหน่งให้มองเห็นได้จากระยะไกล"]
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
    { key: 'water_seal', icon: '🟠', label: 'ชุดดักไฟย้อน Water Seal', color: 'tag-orange' },
    { key: 'gas_detector', icon: '🟢', label: 'เครื่องตรวจจับก๊าซถาวร', color: 'tag-green' },
    { key: 'fire_equipment', icon: '🟢', label: 'อุปกรณ์ดับเพลิง', color: 'tag-green' },
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

// เดาชนิดอุปกรณ์จากชื่อ mesh — คืน null ถ้าเดาไม่ได้
function heuristicTypeFromName(name) {
    const n = (name || '').toLowerCase();
    if (!n) return null;
    if (n.includes('manhole') || n.includes('แมนโฮล')) return 'manhole';
    if (n.includes('pvrv')) return 'pvrv';
    if (n.includes('water') && n.includes('seal') || n.includes('ซีลน้ำ')) return 'water_seal';
    if (n.includes('detector') || n.includes('ตรวจจับ') || n.includes('sensor')) return 'gas_detector';
    if (n.includes('extinguisher') || n.includes('ดับเพลิง') || n.includes('hydrant')) return 'fire_equipment';
    if (n.includes('flame') || n.includes('arrester') || n.includes('ดักไฟ')) return 'flame_arrester';
    if (n.includes('lightning') || n.includes('ล่อฟ้า') || n.includes('rod')) return 'lightning_rod';
    if (n.includes('loto') || n.includes('mcc') || n.includes('ควบคุมไฟฟ้า')) return 'loto';
    if (n.includes('ppe') || n.includes('checkpoint') || n.includes('ตรวจ')) return 'ppe_checkpoint';
    if (n.includes('esd') || (n.includes('ฉุกเฉิน') && n.includes('ปุ่ม'))) return 'esd';
    if (n.includes('tank') || n.includes('ถัง') || n.includes('บ่อหมัก') || n.includes('digester')) return 'tank';
    if (n.includes('pipe') || n.includes('ท่อ') || n.includes('line')) return 'pipe';
    if (n.includes('engine') || n.includes('อาคาร') || n.includes('generator') || n.includes('utilization') || n.includes('genset')) return 'utilization';
    if (n.includes('flare') || n.includes('เผา')) return 'flare';
    return null;
}

// "ชนิดอุปกรณ์" ของชิ้นส่วน — ใช้จำแนกไอคอน/วง Ex-Zone/ระยะร่น/โดมล่อฟ้า
function resolveTypeKey(mesh, fallbackName) {
    if (!mesh) return null;
    if (userDefinedTypes[mesh.uuid]) return userDefinedTypes[mesh.uuid];
    const nameKey = mesh._original3DName || mesh.name;
    if (nameKey && userDefinedTypes[nameKey]) return userDefinedTypes[nameKey];
    return heuristicTypeFromName(nameKey || fallbackName);
}

// "ข้อมูลความปลอดภัย" ของชิ้นส่วน — ข้อมูลเฉพาะชิ้นที่ผู้ใช้เซฟ (แก้ไขเอง หรือสำเนา
// จากการกำหนด type) ชนะข้อมูลกลางของ type เสมอ — เดิมสลับกันทำให้ข้อมูลที่แก้ไว้
// "หาย" หลังรีเฟรชทั้งที่ server เก็บไว้ครบ (โดนข้อมูลกลางของ type ทับตอนแสดงผล)
function resolveDatabaseKey(mesh, fallbackName) {
    if (!mesh) return 'default';
    const nameKey = mesh._original3DName || mesh.name;
    if (nameKey && workflowDatabase[nameKey]) return nameKey;
    if (workflowDatabase[mesh.name]) return mesh.name;
    if (workflowDatabase[mesh.uuid]) return mesh.uuid;
    const typeKey = resolveTypeKey(mesh, fallbackName);
    return (typeKey && workflowDatabase[typeKey]) ? typeKey : (typeKey || 'default');
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

// ============================================================
// พื้นตามจริง (ground follow) — เดิมตัวละครยืนที่ Y คงที่ (jumpConfig.groundY) เสมอ ไม่มีการ
// raycast หาพื้นจริงเลย เดินขึ้นบันได/ทางลาดไม่ได้ ระบบนี้ยิงรังสีลงจากตัวละครทุกไม่กี่เฟรม
// เพื่อ "ไล่ตาม" ความสูงพื้นผิวจริงของโมเดล (ขั้นบันได/พื้นต่างระดับ) แบบนุ่มนวล
// calibrate ตัวเอง (groundFootOffset) ครั้งแรกที่เจอตัวละครยืนนิ่งพอดีที่ groundY มาตรฐาน
// บนพื้นผิวจริง — ถ้าไม่เจอเลยก็ปิดระบบนี้ไปเฉยๆ (fallback พฤติกรรมเดิมทุกประการ ไม่เสี่ยงพัง)
// ============================================================
const groundRayDown = new THREE.Raycaster();
const DOWN_VECTOR = new THREE.Vector3(0, -1, 0);
let dynamicGroundY = null;       // null = ยังไม่พบพื้นจริงที่เชื่อถือได้ ใช้ jumpConfig.groundY แบบเดิม
let groundFootOffset = null;     // null = ยังไม่ calibrate
let groundRayFrame = 0;
const GROUND_RAY_THROTTLE = 4;       // เช็คทุก 4 เฟรม พอสำหรับบันได ไม่หนักเกินไปกับโมเดลใหญ่
const GROUND_CALIBRATE_TOLERANCE = 0.05;
const GROUND_RAY_MAX_RISE = 1.2;     // ก้าวขึ้นได้ทีละไม่เกินนี้ต่อการอัปเดต (~ความสูงขั้นบันได) กันเดินทะลุแล้ว "ลอย"
const GROUND_RAY_MAX_DROP = 3;       // กันตกไปพื้นชั้นล่างที่มองทะลุเห็นแต่ไม่ได้ยืนอยู่จริง

function updateDynamicGroundY() {
    if (!avatarModel || !factoryModel) { dynamicGroundY = null; return; }
    const origin = avatarModel.position.clone();
    origin.y += 1.5; // ยิงจากเหนือหัวเล็กน้อย กันกรณียืนอยู่ "ใน" เนื้อโมเดลพอดีจนยิงจากในทะลุไม่โดน
    groundRayDown.set(origin, DOWN_VECTOR);
    groundRayDown.far = 1.5 + GROUND_RAY_MAX_DROP + 1;
    const hits = groundRayDown.intersectObject(factoryModel, true);
    if (!hits.length) { dynamicGroundY = null; return; }
    const hitY = hits[0].point.y;

    if (groundFootOffset === null) {
        // calibrate เฉพาะตอนตัวละครยืนนิ่งบนพื้นราบมาตรฐานพอดี — หาว่า "พื้นผิวจริงอยู่ต่ำกว่าจุดหมุน
        // ตัวละครเท่าไหร่" โดยไม่ต้องเดารูปแบบของแต่ละโมเดล ถ้ายังไม่เคยเจอจังหวะนี้เลยก็ปิดระบบไปก่อน
        if (Math.abs(avatarModel.position.y - jumpConfig.groundY) < GROUND_CALIBRATE_TOLERANCE) {
            groundFootOffset = jumpConfig.groundY - hitY;
        } else {
            dynamicGroundY = null;
            return;
        }
    }

    const candidateY = hitY + groundFootOffset;
    if (candidateY > avatarModel.position.y + GROUND_RAY_MAX_RISE || candidateY < avatarModel.position.y - GROUND_RAY_MAX_DROP) {
        dynamicGroundY = null; // ต่างระดับเกินสมเหตุสมผลต่อเฟรม (เช่น พื้นชั้นล่างที่มองทะลุเห็น) — เมินไป
        return;
    }
    dynamicGroundY = candidateY;
}

// ============================================================
// เดินไปที่วัตถุอัตโนมัติ (ปุ่ม "🚶 เดินไปที่นี่" ในป้ายข้อมูล) — REQ ใหม่: กดจากระยะไกลได้
// เลย ไม่ต้องเดินเข้าไปชนเองก็ถึง ระบบหันหน้าเข้าเป้าหมายแล้วเดินหน้าอัตโนมัติ ยกเลิกได้ทันทีที่
// มีการบังคับเดินเอง (กันแย่งควบคุมตัวละครจากผู้เล่น)
// ============================================================
const autoWalk = { active: false, targetX: 0, targetZ: 0 };
const AUTO_WALK_STOP_DIST = 1.6;
const AUTO_WALK_TURN_ONLY_ANGLE = 0.6; // มุมห่างเป้าหมายเกินนี้ (rad) ให้หมุนตัวก่อน ยังไม่เดินหน้า กันอ้อม

// ============================================================
// 3.5 ตัวละคร FBX (Mixamo) — โหลดครั้งเดียวแล้ว clone ให้ผู้เล่นทุกคน
// character.glb (3MB) + walk_anim.glb (46KB, ตรึงสะโพกให้เดินอยู่กับที่แล้ว)
// เลือกร่างได้ที่หน้า Avatar — ค่าถูกเก็บใน user_metadata ของบัญชี
// ============================================================
// ทะเบียนร่าง + ท่าเดินที่มีให้เลือก (เลือกที่หน้า Avatar เก็บใน user_metadata ของบัญชี)
const AVATAR_MODEL_FILES = {
    character: 'avatars/character.glb',
    ch22: 'avatars/ch22.glb',
    ch07: 'avatars/ch07.glb',
    remy: 'avatars/remy.glb'
};
const WALK_ANIM_FILES = {
    catwalk: 'avatars/walk_anim.glb',
    walking: 'avatars/walking_anim.glb'
};

const _glbCache = {};
function loadGlb(url) {
    if (!_glbCache[url]) {
        _glbCache[url] = new Promise((resolve, reject) => {
            const loader = new THREE.GLTFLoader();
            if (typeof THREE.DRACOLoader === 'function') {
                const dl = new THREE.DRACOLoader();
                dl.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
                loader.setDRACOLoader(dl);
            }
            loader.load(url, resolve, undefined, reject);
        });
    }
    return _glbCache[url];
}

// จับคู่คลิปกับโครงกระดูกของโมเดล — แต่ละไฟล์จาก Mixamo ใช้ prefix กระดูกไม่เหมือนกัน
// (mixamorig / mixamorig1 / mixamorig2 / mixamorig8 ...) จึงเทียบด้วย "ชื่อกระดูกจริง"
// ที่ตัด prefix ออก เช่น mixamorig1Hips กับ mixamorig8Hips = กระดูก Hips เดียวกัน
function retargetClipToModel(clip, model) {
    const boneByCanon = {};
    model.traverse(o => {
        if (o.isBone) boneByCanon[o.name.replace(/^mixamorig\d*/, '')] = o.name;
    });
    const tracks = [];
    clip.tracks.forEach(t => {
        const dot = t.name.lastIndexOf('.');
        const nodeName = t.name.slice(0, dot), prop = t.name.slice(dot);
        const target = boneByCanon[nodeName.replace(/^mixamorig\d*/, '')];
        if (target) {
            const nt = t.clone();
            nt.name = target + prop;
            tracks.push(nt);
        }
    });
    return new THREE.AnimationClip(clip.name, clip.duration, tracks);
}

async function loadCharacterAssets(modelKey, animKey) {
    const modelUrl = AVATAR_MODEL_FILES[modelKey] || AVATAR_MODEL_FILES.character;
    const animUrl = WALK_ANIM_FILES[animKey] || WALK_ANIM_FILES.catwalk;
    const [charGltf, animGltf] = await Promise.all([loadGlb(modelUrl), loadGlb(animUrl)]);
    return { scene: charGltf.scene, rawWalkClip: animGltf.animations[0] };
}

// สร้าง/เปลี่ยน "ร่าง" ภายใน container ของผู้เล่น (ตำแหน่ง/ฟิสิกส์อยู่ที่ container เสมอ)
async function setAvatarVisual(container, config, color) {
    const ud = container.userData;
    if (ud.visual) container.remove(ud.visual);
    if (ud.ring) container.remove(ud.ring);
    ud.mixer = null; ud.walkAction = null; ud.idleAction = null; ud.currentAction = null; ud.isMovingState = false;

    const model = (config && AVATAR_MODEL_FILES[config.model]) ? config.model : ((config && config.model) === 'engineer' ? 'engineer' : 'character');
    let visual = null;
    if (model !== 'engineer' && THREE.SkeletonUtils) {
        try {
            const assets = await loadCharacterAssets(model, config && config.anim);
            visual = THREE.SkeletonUtils.clone(assets.scene);
            visual.traverse(o => { if (o.isMesh || o.isSkinnedMesh) { o.castShadow = false; o.frustumCulled = false; } });
            visual.rotation.y = Math.PI;     // Mixamo หันหน้า +Z แต่ระบบเราใช้ -Z เป็นด้านหน้า
            visual.position.y = 0.28;        // ยกเท้าให้เท่าระดับเท้าของร่าง engineer เดิม
            // แต่ละโมเดลสูง/หน่วยไม่เท่ากัน — ปรับให้ทุกร่างสูง ~1.75m เท่ากันหมด
            const h = new THREE.Box3().setFromObject(visual).getSize(new THREE.Vector3()).y;
            if (h > 0.1) visual.scale.setScalar(1.75 / h);
            // จับคู่คลิปเดินกับกระดูกของโมเดลนี้ (ไฟล์ Mixamo แต่ละไฟล์ใช้ prefix ต่างกัน)
            const walkClip = retargetClipToModel(assets.rawWalkClip, visual);
            const idleClip = THREE.AnimationUtils.subclip(walkClip, 'avatar_idle_' + model, 0, 1, 30);
            const mixer = new THREE.AnimationMixer(visual);
            ud.mixer = mixer;
            ud.walkAction = mixer.clipAction(walkClip);
            ud.idleAction = mixer.clipAction(idleClip);
            ud.idleAction.play();
            ud.currentAction = ud.idleAction;
        } catch (err) {
            console.warn('โหลดตัวละครไม่สำเร็จ — ใช้ร่าง engineer แทน:', err);
            visual = null;
        }
    }
    if (!visual) visual = createEngineerAvatar(color);
    ud.visual = visual;
    container.add(visual);

    // วงแหวนสีประจำตัวใต้เท้า — เห็นชัดทันทีว่าใครเป็นใคร (สีเดียวกับป้ายชื่อ/แชท)
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.34, 0.44, 32),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(color || '#3b82f6'), transparent: true, opacity: 0.55, side: THREE.DoubleSide })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.285;
    container.add(ring);
    ud.ring = ring;
}

// อัปเดตท่าทางต่อเฟรม: ร่าง FBX ใช้ mixer (เดิน/ยืน crossfade), ร่าง engineer ใช้แขนขาแกว่งแบบเดิม
let frameDt = 0;
const animClock = new THREE.Clock();
function updateAvatarMotion(container, isMoving) {
    const ud = container.userData;
    if (ud.mixer) {
        if (isMoving !== ud.isMovingState) {
            ud.isMovingState = isMoving;
            const next = isMoving ? ud.walkAction : ud.idleAction;
            const prev = ud.currentAction;
            if (next && prev !== next) {
                next.enabled = true;
                next.reset().play();
                if (prev) prev.crossFadeTo(next, 0.22, false);
                ud.currentAction = next;
            }
        }
        ud.mixer.update(frameDt);
    } else if (ud.visual) {
        animateEngineerWalk(ud.visual, isMoving);
    } else {
        animateEngineerWalk(container, isMoving); // เผื่อ container เก่าที่ยังเป็นร่างตรงๆ
    }
}

function createProceduralAvatar() {
    const container = new THREE.Group();
    container.position.set(0, jumpConfig.groundY, 8);
    scene.add(container);
    avatarModel = container;
    setAvatarVisual(container, { model: 'engineer' }, '#ff9900'); // ร่างชั่วคราวก่อน self_init บอก config จริง
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

// ---------- ปุ่มควบคุมที่ผู้ใช้เปลี่ยนเองได้ (ตั้งค่าที่หน้า Settings → world-prefs.js) ----------
const BIND_DEFAULTS = { forward: 'w', backward: 's', left: 'a', right: 'd', jump: ' ', mic: 'v', chat: '/', freelook: 'f', resetcam: 'r' };
// ปุ่มเทียบเท่าเดิม: ลูกศร + แป้นไทยเกษมณี (ไ=w, ห=s, ฟ=a, ก=d, ด=f, พ=r, อ=v, ฝ=/)
// จะใช้ได้เฉพาะตอนที่ผู้ใช้ "ยังไม่ได้เปลี่ยน" ปุ่มนั้นเอง ไม่งั้นปุ่มเก่าจะค้างทำงานทับปุ่มใหม่
const BIND_ALIASES = {
    forward: ['arrowup', 'ไ'], backward: ['arrowdown', 'ห'],
    left: ['arrowleft', 'ฟ'], right: ['arrowright', 'ก'],
    mic: ['อ'], chat: ['ฝ'], freelook: ['ด'], resetcam: ['พ']
};
let userBinds = { ...BIND_DEFAULTS };
function reloadUserBinds() {
    if (window.AecWorldPrefs) userBinds = { ...BIND_DEFAULTS, ...AecWorldPrefs.loadBinds() };
}
reloadUserBinds();
// แก้ปุ่มที่หน้า Settings (คนละแท็บ) แล้วมีผลกับโลก 3D ที่เปิดค้างอยู่ทันที
window.addEventListener('storage', e => { if (e.key === 'aec_keybinds') reloadUserBinds(); });

function isBind(action, e) {
    const k = (e.key || '').toLowerCase();
    if (k === String(userBinds[action] || '').toLowerCase()) return true;
    if (userBinds[action] === BIND_DEFAULTS[action]) return (BIND_ALIASES[action] || []).includes(k);
    return false;
}

window.addEventListener('keydown', (e) => {
    if (isTypingInField()) return;
    const key = e.key.toLowerCase();

    if (isBind('freelook', e)) {
        isFreeLook = !isFreeLook;
        if (!isFreeLook) resetCameraToAvatar();
        mpAppendChat({ name: 'ระบบกล้อง', color: '#00ffff', text: isFreeLook ? '🎥 โหมด Free Look (W A S D บินกล้องอิสระ)' : '👤 กลับสู่โหมดติดตามตัวละคร' });
        return;
    }
    if (isBind('forward', e))  { cancelAutoWalk(); moveStatus.forward = true; }
    if (isBind('backward', e)) { cancelAutoWalk(); moveStatus.backward = true; }
    if (isBind('left', e))     { cancelAutoWalk(); moveStatus.left = true; }
    if (isBind('right', e))    { cancelAutoWalk(); moveStatus.right = true; }
    if (isBind('jump', e) && !jumpConfig.isJumping && !isFreeLook) triggerAvatarJump();

    // แผงต่างๆ ยังใช้ปุ่มตายตัวเหมือนเดิม (ไม่ได้อยู่ในชุดที่ให้เปลี่ยนเอง)
    // หมายเหตุแป้นไทย (เกษมณี): H=้, M=ท, T=ะ
    if (key === 'h' || key === '้') togglePanelElement('dashboard');
    if (key === 'm' || key === 'ท') togglePanelElement('details-panel');
    if (key === 't' || key === 'ะ') togglePanelElement('transform-panel');
    if (key === 'u') togglePanelElement('multiplayer-panel');
    if (isBind('resetcam', e)) resetCameraToAvatar();
    if (isBind('mic', e)) toggleMic();                            // เปิด/ปิดไมค์
    if (isBind('chat', e)) { e.preventDefault(); openChatInput(); } // เปิดช่องพิมพ์แชท
});
window.addEventListener('keyup', (e) => {
    if (isBind('forward', e))  moveStatus.forward = false;
    if (isBind('backward', e)) moveStatus.backward = false;
    if (isBind('left', e))     moveStatus.left = false;
    if (isBind('right', e))    moveStatus.right = false;
});

function togglePanelElement(elementId) {
    const el = $(elementId);
    if (el) el.style.display = (el.style.display === 'none') ? 'block' : 'none';
}

function initMobileJoystick() {
    const zone = $('mobile-joystick-zone');
    if (!zone || typeof nipplejs === 'undefined') return;
    zone.innerHTML = '';
    const manager = nipplejs.create({ zone, mode: 'static', position: { left: '50%', top: '50%' }, color: '#3b82f6', size: 100 });
    manager.on('move', (evt, data) => {
        if (!data.vector) return;
        cancelAutoWalk();
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

// รองรับโมเดลที่บีบอัดแบบ Draco (KHR_draco_mesh_compression) — จำเป็นสำหรับโมเดลโรงงาน
// ที่ export จาก CAD/BIM ซึ่งมักมีจำนวน vertex สูงมากจนไฟล์ใหญ่เกินจะโหลดตรงๆ ได้ไหว
const sharedDracoLoader = (typeof THREE.DRACOLoader === 'function') ? new THREE.DRACOLoader() : null;
if (sharedDracoLoader) sharedDracoLoader.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');

function getLoaderForFile(fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    if (ext === 'fbx') return new THREE.FBXLoader();
    const loader = new THREE.GLTFLoader();
    if (sharedDracoLoader) loader.setDRACOLoader(sharedDracoLoader);
    return loader;
}

// ปรับแต่ง mesh ให้เรนเดอร์เบาลง เหมาะกับโมเดลโรงงานที่มีชิ้นส่วนจำนวนมาก
function optimizeMeshForRender(mesh) {
    mesh.frustumCulled = true;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    if (mesh.material) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach(mat => {
            // material เริ่มต้นจาก loader มักเป็น FrontSide (เห็น/คลิกได้แค่ผิวด้านนอก) —
            // ผู้ใช้เดินเข้าไป "ข้างใน" ชิ้นส่วนได้จริง (เช่น เดินเข้าไปในถังหมัก หรือโมเดลที่
            // ถูกขยายสเกลใหญ่มากจนตัวละครยืนอยู่ในตัวชิ้นส่วน) ถ้าเป็น FrontSide การคลิกเลือก
            // (raycast) จากด้านในจะไม่ชนอะไรเลย เพราะไม่มีผิวด้านหน้าให้ชน จึงต้องเป็น DoubleSide เสมอ
            mat.side = THREE.DoubleSide;
            if (mat.roughness !== undefined) mat.roughness = 0.8;
            if (mat.metalness !== undefined) mat.metalness = 0.2;
        });
    }
}

function populateMeshList(root) {
    let meshCount = 0;
    const container = $('mesh-container');
    container.innerHTML = '';
    root.traverse(child => {
        if (!child.isMesh) return;
        meshCount++;
        // optimizeMeshForRender ต้องมาก่อนเสมอ (ตั้ง material.side = DoubleSide ให้คลิกเลือกได้
        // จากด้านในชิ้นส่วนด้วย) เพราะ originalMaterials เก็บสำเนาไว้ใช้ "คืนค่าตอน deselect/
        // เปลี่ยนโหมดพื้นผิว" — ถ้า clone ไปก่อนแก้ side จะได้สำเนาเก่าที่ยัง FrontSide ค้างอยู่
        // แล้วพอมีการคืนค่าทีหลัง (applyHighlight ตอน deselect, setFactoryMaterialMode) จะดึง
        // ค่า FrontSide เดิมกลับมาทับ ทำให้คลิกจากด้านในไม่ติดอีกหลังจากเคยเลือก/ยกเลิกเลือกไปแล้ว
        optimizeMeshForRender(child);
        originalMaterials.set(child.uuid, child.material.clone());
        if (!child._original3DName) child._original3DName = child.name || `Object_${meshCount}`;

        // คืนชื่อที่ผู้ใช้เคยแก้ไว้ — ข้อมูล sync มาจาก server ก่อนโมเดลโหลดเสร็จเสมอ
        // (เดิมทำเฉพาะตอนโหลดจากไฟล์ .zip ทำให้ชื่อที่แก้หายหลังรีเฟรช)
        const savedRec = workflowDatabase[child._original3DName];
        if (savedRec && savedRec.name) child.name = savedRec.name;

        const key = resolveDatabaseKey(child, child.name);
        const typeKey = resolveTypeKey(child, child.name);
        const item = document.createElement('div');
        item.className = 'mesh-item';
        item.innerText = `${getIconForType(typeKey || key)} ${child.name || child._original3DName}`;
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
    applyFocusFromUrl();
}

// ============================================================
// 6.5 DEEP-LINK FOCUS — เปิดหน้าด้วย ?focus=<typeKey> (เช่น สแกน QR code ที่ติด
// หน้าอุปกรณ์จริงในโรงงาน) ให้ระบบเลือก/โฟกัสกล้องไปที่ชิ้นส่วนประเภทนั้นอัตโนมัติ
// ทันทีที่โมเดลโหลดเสร็จ — ทำครั้งเดียวต่อการเปิดหน้า (กันโฟกัสซ้ำตอนโมเดลรีโหลด)
// ============================================================
const FOCUS_TYPE_KEY = new URLSearchParams(window.location.search).get('focus');
let focusApplied = false;
function applyFocusFromUrl() {
    if (focusApplied || !FOCUS_TYPE_KEY || !factoryModel) return;
    let target = null;
    factoryModel.traverse(child => {
        if (target || !child.isMesh) return;
        if (resolveTypeKey(child, child.name) === FOCUS_TYPE_KEY) target = child;
    });
    if (!target) return; // โมเดลนี้ไม่มีชิ้นส่วนประเภทที่ขอ — เงียบไว้ ไม่ error
    focusApplied = true;
    selectPart(target, '🔗 เปิดจากลิงก์ / QR Code');
    const pos = new THREE.Vector3(); target.getWorldPosition(pos);
    if (avatarModel) {
        // โหมดมี avatar: พาตัวละครไปยืนใกล้ๆ จุดนั้น แทนการ teleport กล้องเฉยๆ
        avatarModel.position.set(pos.x + 2, avatarModel.position.y, pos.z + 2);
        resetCameraToAvatar();
    } else {
        // โหมด viewer (ไม่มี avatar): เลื่อนกล้อง/จุดหมุนไปที่ชิ้นส่วนนั้นตรงๆ
        controls.target.copy(pos);
        camera.position.set(pos.x + 4, pos.y + 3, pos.z + 4);
        controls.update();
    }
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

// ============================================================
// MODEL CACHE (IndexedDB) — เก็บไฟล์โมเดลดิบไว้ในเครื่องผู้ใช้ กันต้องดาวน์โหลดซ้ำ
// ทุกครั้งที่รีเฟรชหน้า (Supabase Storage ส่ง Cache-Control: no-cache มาให้ไฟล์ในบัคเก็ต
// models ทำให้ browser HTTP cache เชื่อถือไม่ได้ว่าจะข้ามการดาวน์โหลดจริงๆ โดยเฉพาะไฟล์
// ใหญ่ๆ หลักร้อย MB) เก็บสูงสุด MODEL_CACHE_MAX_ENTRIES ไฟล์ล่าสุด กันแคชบวมไม่จำกัด
// ============================================================
const MODEL_CACHE_DB = 'aec_model_cache';
const MODEL_CACHE_STORE = 'models';
const MODEL_CACHE_MAX_ENTRIES = 5;
// ไฟล์ที่ใหญ่กว่านี้ไม่แคช — ไฟล์ระดับนี้เสี่ยง browser out-of-memory ตอน parse อยู่แล้ว
// การเขียนสำเนาลง IndexedDB เพิ่ม (ซ้อนกับ buffer ที่กำลังป้อนให้ loader.parse()) มีแต่จะ
// เพิ่มหน่วยความจำสูงสุดตอนโหลด ทำให้พังง่ายกว่าเดิมโดยไม่ได้ประโยชน์ (ถ้าโหลดครั้งแรกพังอยู่แล้ว ก็ไม่มีทางถึงขั้นตอนแคชด้วยซ้ำ)
const MODEL_CACHE_MAX_FILE_BYTES = 120 * 1024 * 1024; // 120 MB

function openModelCacheDb() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) { reject(new Error('IndexedDB ไม่รองรับในเบราว์เซอร์นี้')); return; }
        const req = indexedDB.open(MODEL_CACHE_DB, 1);
        req.onupgradeneeded = () => {
            if (!req.result.objectStoreNames.contains(MODEL_CACHE_STORE)) {
                req.result.createObjectStore(MODEL_CACHE_STORE, { keyPath: 'url' });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
async function getCachedModel(url) {
    try {
        const db = await openModelCacheDb();
        return await new Promise(resolve => {
            const req = db.transaction(MODEL_CACHE_STORE, 'readonly').objectStore(MODEL_CACHE_STORE).get(url);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (err) { return null; }
}
async function putCachedModel(url, fileName, buf) {
    if (buf.byteLength > MODEL_CACHE_MAX_FILE_BYTES) return; // ดูหมายเหตุที่ MODEL_CACHE_MAX_FILE_BYTES ด้านบน
    try {
        const db = await openModelCacheDb();
        const tx = db.transaction(MODEL_CACHE_STORE, 'readwrite');
        const store = tx.objectStore(MODEL_CACHE_STORE);
        store.put({ url, fileName, buf, cachedAt: Date.now() });
        const all = await new Promise(resolve => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
        if (all.length > MODEL_CACHE_MAX_ENTRIES) {
            all.sort((a, b) => a.cachedAt - b.cachedAt);
            all.slice(0, all.length - MODEL_CACHE_MAX_ENTRIES).forEach(e => store.delete(e.url));
        }
    } catch (err) { console.warn('[Model Cache] เซฟแคชไม่สำเร็จ (ไม่กระทบการใช้งานตอนนี้ แค่รอบหน้าจะโหลดจาก cloud อีกครั้ง):', err); }
}

// ตรวจขนาดไฟล์ก่อนโหลดจริงด้วย HEAD request (เบามาก ไม่ดึงเนื้อไฟล์) — ใช้ตัดสินใจว่า
// จะโหลดอัตโนมัติเลย หรือต้องรอผู้ใช้ยืนยันก่อนเพราะเสี่ยง OOM
async function checkUrlSize(url) {
    try {
        const res = await fetch(url, { method: 'HEAD' });
        const len = res.headers.get('content-length');
        return len ? parseInt(len, 10) : null;
    } catch (err) { return null; }
}

let pendingLargeModelLoad = null; // callback ที่รอผู้ใช้กด "โหลดเลย" ในกล่องเตือน
function showLargeModelPrompt(fileName, sizeBytes, onConfirm) {
    pendingLargeModelLoad = onConfirm;
    const sizeMb = (sizeBytes / 1024 / 1024).toFixed(0) + ' MB';
    $('large-model-name').innerText = fileName || 'โมเดล';
    $('large-model-size').innerText = sizeMb;
    $('canvas-large-model-prompt').style.display = 'flex';
    $('factory-status').innerText = `⏸️ รอการยืนยัน — โมเดล "${fileName}" (${sizeMb}) ใหญ่เกินกว่าจะโหลดอัตโนมัติ`;
}
window.confirmLoadLargeModel = function () {
    $('canvas-large-model-prompt').style.display = 'none';
    const fn = pendingLargeModelLoad;
    pendingLargeModelLoad = null;
    if (fn) fn();
};

// จุดเข้าโหลดโมเดลจริง (เรียกจาก self_init ตอนเข้าห้อง, load_model ตอนมีคนแชร์โมเดลใหม่,
// และตอนอัปโหลดเอง) — เช็คขนาดก่อนเสมอ ถ้าใหญ่เกิน AUTO_COMPRESS_MAX_FILE_BYTES จะไม่โหลด
// อัตโนมัติทันที (ทั้งฝั่งคนอัปโหลดเองและทุกคนในห้อง) แต่รอให้กดยืนยันก่อน — นี่คือขั้นตอนที่
// เคยทำให้เบราว์เซอร์ค้าง/แครชตอนแชร์โมเดลใหญ่แล้วระบบพยายามโหลดแสดงให้ทุกคนอัตโนมัติ
async function loadModelFromUrl(url, fileName, transform) {
    // ล้าง prompt/callback ค้างจากคำขอโหลดครั้งก่อนเสมอ กันกรณีโมเดล A ใหญ่เกินโชว์ prompt
    // ค้างไว้ แล้วมีคนแชร์โมเดล B (เล็กกว่า) มาแทนก่อนใครจะกดยืนยัน A — ไม่งั้น prompt ของ A
    // จะค้างอยู่บนจอทั้งที่ B โหลดเสร็จไปแล้วเบื้องหลัง
    $('canvas-large-model-prompt').style.display = 'none';
    pendingLargeModelLoad = null;
    const sizeBytes = await checkUrlSize(url);
    if (sizeBytes && sizeBytes > AUTO_COMPRESS_MAX_FILE_BYTES) {
        showLargeModelPrompt(fileName, sizeBytes, () => loadModelFromUrlConfirmed(url, fileName, transform));
        return;
    }
    loadModelFromUrlConfirmed(url, fileName, transform);
}

function loadModelFromUrlConfirmed(url, fileName, transform) {
    currentSceneModelUrl = url;
    currentSceneModelName = fileName;
    disposeFactoryModel();
    originalMaterials.clear(); factoryColliders = [];

    (async () => {
        let buf = null;
        const cached = await getCachedModel(url);
        if (cached && cached.buf) {
            buf = cached.buf;
            $('factory-status').innerText = `⚡ โหลดจากแคชในเครื่อง (ไม่ต้องดาวน์โหลดซ้ำ)...`;
        } else {
            $('factory-status').innerText = `⬇️ กำลังโหลดโมเดลจาก Cloud...`;
            try {
                buf = await fetch(url).then(r => r.arrayBuffer());
            } catch (err) {
                $('factory-status').innerText = `❌ โหลดล้มเหลว`;
                console.error('ดึงไฟล์โมเดลไม่สำเร็จ:', err);
                return;
            }
            putCachedModel(url, fileName, buf); // ไม่ await — เซฟแคชเบื้องหลัง ไม่บล็อกการแสดงผลโมเดล
        }
        currentModelRawBuffer = buf;
        currentModelRawFileName = fileName;
        const resourcePath = THREE.LoaderUtils.extractUrlBase(url);
        getLoaderForFile(fileName || url).parse(buf, resourcePath, obj => {
            finalizeModelLoad(obj, { label: fileName, transform });
        }, err => {
            $('factory-status').innerText = `❌ โหลดล้มเหลว`;
            console.error(err);
        });
    })();
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

// ---------- Model Library — เลือกโมเดลที่เคยอัปโหลดไว้ในบัคเก็ต Supabase มาใช้ซ้ำ
// ได้เลยโดยไม่ต้องอัปโหลดไฟล์จากเครื่องใหม่ (แก้ปัญหาโมเดลใหญ่ๆ เสียเวลาอัปโหลด
// ซ้ำซ้อนทุกครั้งที่อยากสลับกลับไปใช้โมเดลเดิม) ----------
window.refreshModelLibrary = async function () {
    const listEl = $('model-library-list');
    if (!listEl) return;
    listEl.innerHTML = '<div class="hint-text">กำลังโหลดรายการ...</div>';
    try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/list/${SUPABASE_BUCKET}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ prefix: '', limit: 100, sortBy: { column: 'created_at', order: 'desc' } })
        });
        const files = await res.json();
        const modelFiles = (Array.isArray(files) ? files : []).filter(f => /\.(gltf|glb|fbx)$/i.test(f.name));
        if (!modelFiles.length) { listEl.innerHTML = '<div class="hint-text">ยังไม่มีโมเดลที่เคยอัปโหลดไว้</div>'; return; }
        listEl.innerHTML = '';
        modelFiles.forEach(f => {
            const sizeMb = f.metadata && f.metadata.size ? (f.metadata.size / 1024 / 1024).toFixed(1) + ' MB' : '';
            const displayName = f.name.replace(/^model_\d+_/, ''); // ตัด timestamp prefix ออกให้อ่านง่าย
            const row = document.createElement('div');
            row.className = 'model-lib-row';
            row.innerHTML = `<div style="overflow:hidden;"><div class="mlr-name">${displayName}</div><div class="mlr-meta">${sizeMb}</div></div>`;
            const btn = document.createElement('button');
            btn.className = 'mlr-use-btn';
            btn.textContent = 'ใช้โมเดลนี้';
            btn.addEventListener('click', () => useModelFromLibrary(f.name));
            row.appendChild(btn);
            listEl.appendChild(row);
        });
    } catch (err) {
        listEl.innerHTML = '<div class="hint-text" style="color:#ef4444;">โหลดรายการไม่สำเร็จ</div>';
        console.error('[Model Library] โหลดรายการไม่สำเร็จ:', err);
    }
};
function useModelFromLibrary(fileName) {
    const url = `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${fileName}`;
    if (mpSocket && mpSocket.connected) mpSocket.emit('model_shared', { url, fileName });
    else loadModelFromUrl(url, fileName);
}
window.refreshModelLibrary();

// ============================================================
// AUTO-COMPRESS ON UPLOAD — ไฟล์ .fbx/.gltf ที่อัปโหลดใหม่จะถูกแปลงเป็น .glb (binary,
// กะทัดรัดกว่า FBX/GLTF มาก) โดยอัตโนมัติก่อนอัปโหลดขึ้น Supabase — mesh/ชื่อ object
// ทุกชิ้นยังอยู่ครบเหมือนเดิม (แค่เปลี่ยน "หีบห่อ" ไฟล์ใหม่ ไม่ตัดชิ้นส่วนออก) พร้อมย่อ
// texture ที่ใหญ่เกินจำเป็นลงด้วย กันโมเดลใหม่ๆ โหลดช้า/ค้างซ้ำแบบที่เจอไปก่อนหน้า
// ============================================================
const AUTO_COMPRESS_EXTENSIONS = ['fbx', 'gltf']; // .glb บีบอัดอยู่แล้วในตัว ไม่ต้องแปลงซ้ำ
const MAX_TEXTURE_DIM = 2048; // texture ใหญ่กว่านี้ (ต่อด้าน) จะถูกย่อลงมาก่อน export
// ไฟล์ที่ใหญ่กว่านี้ "ข้าม" ขั้นตอนบีบอัด แล้วอัปโหลดไฟล์ต้นฉบับไปตรงๆ เหมือนก่อนมีฟีเจอร์นี้
// เหตุผล: เดิมการอัปโหลดเป็นแค่ส่งไบต์ดิบขึ้น Supabase ไม่ต้อง parse ในเบราว์เซอร์เลย ความเสี่ยง
// OOM มีแค่ตอน "เปิดดู" ทีหลัง แต่การบีบอัดอัตโนมัตินี้ต้อง parse ไฟล์ตั้งแต่ตอนอัปโหลดเลย —
// ถ้าไม่จำกัดขนาดไว้ จะกลายเป็นว่าไฟล์ใหญ่ๆ ที่เคยอัปโหลดสำเร็จ (แค่ค้างตอนเปิดดูทีหลัง) จะ
// พังตั้งแต่ตอนอัปโหลดแทน (ยืนยันจริงจากไฟล์ 100-200MB ที่ทำให้เบราว์เซอร์ out-of-memory
// ระหว่างขั้นตอน parse เพื่อบีบอัดนี้)
const AUTO_COMPRESS_MAX_FILE_BYTES = 80 * 1024 * 1024; // 80 MB

function parseModelBufferAsync(loader, buf, resourcePath) {
    return new Promise((resolve, reject) => { loader.parse(buf, resourcePath, resolve, reject); });
}

// ย่อ texture ที่ใหญ่เกิน maxDim ผ่าน canvas — ลดหน่วยความจำ/ขนาดไฟล์ลงมากโดยรูปทรง/
// ชิ้นส่วนของโมเดลไม่เปลี่ยน (แค่ความละเอียดพื้นผิวลดลง)
function downscaleOversizedTextures(root, maxDim) {
    const seen = new Set();
    root.traverse(child => {
        if (!child.isMesh || !child.material) return;
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
            ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'aoMap', 'emissiveMap', 'bumpMap'].forEach(key => {
                const tex = mat[key];
                if (!tex || !tex.image || seen.has(tex.uuid)) return;
                seen.add(tex.uuid);
                const img = tex.image;
                const w = img.width, h = img.height;
                if (!w || !h || Math.max(w, h) <= maxDim) return;
                const scale = maxDim / Math.max(w, h);
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(w * scale);
                canvas.height = Math.round(h * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                tex.image = canvas;
                tex.needsUpdate = true;
            });
        });
    });
}

function exportObjectToGlb(obj) {
    // GLTFExporter (three@0.128) เป็น parse(input, onDone, options) แค่ 3 พารามิเตอร์
    // ไม่มี onError callback แยก — ห่อด้วย try/catch เอาเองแทน
    return new Promise((resolve, reject) => {
        try {
            new THREE.GLTFExporter().parse(obj, result => {
                if (result instanceof ArrayBuffer) resolve(result);
                else reject(new Error('GLTFExporter ไม่ได้คืนค่าเป็น binary (.glb) ตามที่ตั้งค่าไว้'));
            }, { binary: true, embedImages: true });
        } catch (err) {
            reject(err instanceof Error ? err : new Error(String(err)));
        }
    });
}

// yield ให้ browser paint ข้อความสถานะก่อนเริ่มงานหนัก — parse/export ยัง block main thread
// เหมือนเดิม (Three.js loader ไม่รองรับ Web Worker) แต่อย่างน้อยผู้ใช้เห็นข้อความ "กำลัง
// บีบอัด..." ก่อนหน้าจอจะหยุดตอบสนองชั่วคราว แทนที่จะค้างเงียบๆ ไม่รู้สถานะ
// ใช้ setTimeout แทน requestAnimationFrame เพราะ rAF จะถูก browser พักการทำงานถ้าแท็บ
// ไม่ได้ active/มองเห็นอยู่ ทำให้ค้างได้ถ้าผู้ใช้สลับแท็บระหว่างอัปโหลด
function nextPaint() { return new Promise(r => setTimeout(r, 0)); }

async function autoCompressModelFile(file) {
    const ext = file.name.split('.').pop().toLowerCase();
    if (!AUTO_COMPRESS_EXTENSIONS.includes(ext)) return file; // .glb อยู่แล้ว ไม่ต้องแปลง
    if (file.size > AUTO_COMPRESS_MAX_FILE_BYTES) {
        // ดูหมายเหตุที่ AUTO_COMPRESS_MAX_FILE_BYTES — ไฟล์ใหญ่ระดับนี้ parse เองก็เสี่ยง OOM
        // พอกับตอนเปิดดู ไม่คุ้มที่จะเสี่ยงพังตั้งแต่ตอนอัปโหลด อัปโหลดไฟล์ต้นฉบับตรงๆ แทน
        $('factory-status').innerText = `⚠️ ไฟล์ใหญ่กว่า ${(AUTO_COMPRESS_MAX_FILE_BYTES / 1024 / 1024).toFixed(0)} MB — ข้ามขั้นตอนบีบอัดอัตโนมัติ (เสี่ยงเบราว์เซอร์ค้างตอนแปลงไฟล์) จะอัปโหลดไฟล์ต้นฉบับแทน`;
        await nextPaint();
        return file;
    }

    $('factory-status').innerText = `🗜️ กำลังบีบอัด ${file.name} เป็น .glb (ไฟล์ใหญ่อาจใช้เวลาสักครู่ อย่าปิดแท็บ)...`;
    await nextPaint();
    try {
        const buf = await file.arrayBuffer();
        const obj = await parseModelBufferAsync(getLoaderForFile(file.name), buf, '');
        const root = obj.scene ? obj.scene : obj;

        $('factory-status').innerText = `🗜️ กำลังลดขนาด texture ที่ใหญ่เกินไป...`;
        await nextPaint();
        downscaleOversizedTextures(root, MAX_TEXTURE_DIM);

        $('factory-status').innerText = `🗜️ กำลังเข้ารหัสเป็น .glb...`;
        await nextPaint();
        const glbBuffer = await exportObjectToGlb(root);

        const newName = file.name.replace(/\.(fbx|gltf)$/i, '') + '.glb';
        const glbFile = new File([glbBuffer], newName, { type: 'model/gltf-binary' });
        const savedPct = Math.round((1 - glbFile.size / file.size) * 100);
        $('factory-status').innerText = `✓ บีบอัดสำเร็จ: ${(file.size / 1024 / 1024).toFixed(1)} MB → ${(glbFile.size / 1024 / 1024).toFixed(1)} MB` +
            (savedPct > 0 ? ` (เล็กลง ${savedPct}%)` : ' (ขนาดใกล้เคียงเดิม)');
        return glbFile;
    } catch (err) {
        console.warn('[Auto-Compress] แปลงเป็น .glb ไม่สำเร็จ — จะอัปโหลดไฟล์ต้นฉบับแทน:', err);
        $('factory-status').innerText = `⚠️ บีบอัดไม่สำเร็จ (${err.message || 'ไฟล์อาจใหญ่เกินไปสำหรับเบราว์เซอร์'}) — จะอัปโหลดไฟล์ต้นฉบับแทน`;
        await nextPaint();
        return file; // fallback: อัปโหลดไฟล์เดิมไปแทน ดีกว่าอัปโหลดไม่ได้เลย
    }
}

$('factory-input')?.addEventListener('change', async function (event) {
    const files = event.target.files;
    if (!files.length) return;
    let modelFile = null;
    for (const f of files) { if (['gltf', 'glb', 'fbx'].includes(f.name.split('.').pop().toLowerCase())) { modelFile = f; break; } }
    if (!modelFile) { $('factory-status').innerText = '❌ ไม่พบไฟล์ 3D หลัก (.gltf/.glb/.fbx)'; return; }
    if (modelFile.size > MODEL_CACHE_MAX_FILE_BYTES) {
        const sizeMb = (modelFile.size / 1024 / 1024).toFixed(0);
        const proceed = confirm(
            `ไฟล์นี้ขนาด ${sizeMb} MB — ใหญ่มากสำหรับดูในเบราว์เซอร์ มีความเสี่ยงสูงที่หน้าจะค้าง/แครช (Out of Memory) ตอนบีบอัด/โหลด\n\n` +
            `ระบบจะพยายามบีบอัดเป็น .glb ให้อัตโนมัติก่อนอัปโหลด แต่ถ้าไฟล์ใหญ่เกินไปเบราว์เซอร์ก็ยังอาจแครชได้ระหว่างขั้นตอนนี้อยู่ดี\n\n` +
            `ยืนยันจะอัปโหลดไฟล์นี้ต่อเลยหรือไม่?`
        );
        if (!proceed) { $('factory-status').innerText = 'ยกเลิกอัปโหลด — ไฟล์ใหญ่เกินไป'; event.target.value = ''; return; }
    }
    try {
        modelFile = await autoCompressModelFile(modelFile); // แปลง .fbx/.gltf เป็น .glb บีบอัดก่อนอัปโหลด (ถ้าทำได้)
        currentModelRawBuffer = await modelFile.arrayBuffer();
        currentModelRawFileName = modelFile.name;
        const url = await uploadToSupabase(modelFile);
        if (mpSocket && mpSocket.connected) mpSocket.emit('model_shared', { url, fileName: modelFile.name });
        else loadModelFromUrl(url, modelFile.name);
        window.refreshModelLibrary(); // ให้ไฟล์ที่เพิ่งอัปโหลดขึ้นในคลังทันที ไม่ต้องกดรีเฟรชเอง
    } catch (err) {
        $('factory-status').innerText = `❌ อัปโหลดล้มเหลว: ${err.message}`;
    }
});

// อัตราส่วนที่แอดมินปรับ "ขนาดโมเดล (Scale)" ไว้ตอนนี้ เทียบกับขนาดตั้งต้น — วงความปลอดภัย
// ทุกชนิด (PPE zone, Ex-Zone, ระยะร่น, รัศมีฟ้าผ่า) และระยะ padding ของ hitbox ต้องคูณด้วย
// ค่านี้เสมอ ไม่งั้นตอนขยายโมเดลใหญ่ขึ้น วงพวกนี้จะยังเป็นขนาดเดิม ดูเล็กเกินไปเทียบกับโมเดล
function currentModelScaleFactor() {
    return factoryModel ? factoryModel.scale.x / initialFactoryScale : 1;
}

function buildColliders() {
    factoryColliders = [];
    // โมเดล/ตำแหน่ง/สเกลเปลี่ยน — ค่า calibrate พื้นเดิมใช้ไม่ได้แล้ว ต้องหาใหม่
    dynamicGroundY = null;
    groundFootOffset = null;
    if (!factoryModel) return;
    factoryModel.updateMatrixWorld(true);
    const padding = HITBOX_PADDING * currentModelScaleFactor();
    factoryModel.traverse(child => {
        if (!child.isMesh) return;
        const box = new THREE.Box3().setFromObject(child);
        box.expandByScalar(padding);
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
        else if (mode === 'wireframe') child.material = new THREE.MeshStandardMaterial({ color: 0x22d3ee, wireframe: true });
        else child.material = new THREE.MeshStandardMaterial({ color: 0x3b82f6, transparent: true, opacity: 0.18, depthWrite: false });
    });
}
window.setFactoryMaterialMode = setFactoryMaterialMode;

// ============================================================
// 6. SELECTION / INTERACTION — REQ 4 & 6
// "ชี้" (raycast click/tap) หรือ "เดินชน" (collision) เพื่อขึ้นข้อมูล
// ชี้ซ้ำที่จุดเดิม หรือเดินออกไปไกล -> ข้อมูลหายอัตโนมัติ
// ไม่มีการ "จับ/ลาก" ชิ้นส่วนใดๆ (ตามที่ระบุว่าจะทำให้ระบบซับซ้อนเกินไป)
// ============================================================
const selection = { uuid: null, key: 'default', viaWalkCollision: false };
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
        if (child.uuid === uuid) child.material = new THREE.MeshStandardMaterial({ color: 0x3b82f6, emissive: 0x0a1f4d });
        else if (originalMaterials.has(child.uuid)) child.material = originalMaterials.get(child.uuid).clone();
    });
}

function selectPart(mesh, method) {
    if (!mesh || !factoryModel) return;
    if (isEditingActive()) return; // ห้ามสลับชิ้นส่วนระหว่างแก้ไขข้อมูลค้างอยู่

    // REQ 6: "ชี้ซ้ำ" ที่จุดเดิม -> ปิดป้าย (toggle)
    if (selection.uuid === mesh.uuid) { deselectPart(); return; }

    selection.uuid = mesh.uuid;
    // ป้ายที่เปิดจากการ "เดินชน" เท่านั้นที่ควรปิดอัตโนมัติเมื่อเดินออกห่าง (checkAutoDeselect) —
    // ป้ายที่เปิดจากการคลิก/เลือกจากลิสต์/QR ต้องค้างอยู่แม้ตัวละครอยู่ไกล ไม่งั้นคลิกวัตถุที่อยู่
    // ไกลๆ จะเห็นป้ายเปิดแวบเดียวแล้วปิดตัวเองทันทีในเฟรมถัดไป (ดูเหมือนคลิกไม่ติดอะไรเลย)
    selection.viaWalkCollision = (method === '🚶 ตัวละครเดินชนวัตถุ');
    const key = resolveDatabaseKey(mesh, mesh.name);
    selection.key = key;
    applyHighlight(mesh.uuid);

    const data = workflowDatabase[key] || workflowDatabase.default;
    renderWorkflowUI(data.name || mesh.name, data.desc, data.steps, method, data.colorClass || 'tag-blue');
    cancelLiveEdit();
    $('process-panel').style.display = 'block';
    const walkBtn = $('btn-walk-to');
    if (walkBtn) walkBtn.style.display = avatarModel ? 'inline-flex' : 'none'; // มีเฉพาะโหมด Metaverse ที่มี avatar
}

function deselectPart() {
    selection.uuid = null;
    selection.key = 'default';
    selection.viaWalkCollision = false;
    $('process-panel').style.display = 'none';
    const walkBtn = $('btn-walk-to');
    if (walkBtn) walkBtn.style.display = 'none';
    if (factoryModel && currentMaterialMode === 'solid') {
        factoryModel.traverse(child => {
            if (child.isMesh && originalMaterials.has(child.uuid)) child.material = originalMaterials.get(child.uuid).clone();
        });
    }
}

// ปุ่ม "🚶 เดินไปที่นี่" ในป้ายข้อมูล — เดินอัตโนมัติเข้าหาชิ้นส่วนที่เลือกอยู่ ไม่ต้องเดินเองก็ถึง
// (มีเฉพาะโหมด Metaverse ที่มี avatar — โหมด Digital Twin viewer ไม่มีตัวละครให้เดิน)
function walkToSelected() {
    if (!avatarModel || !factoryModel || !selection.uuid) return;
    // ใช้จุดกึ่งกลาง "กล่องขอบเขต" ของชิ้นส่วน (เหมือนที่ระบบชนใช้) แทนจุดหมุน (pivot) ของโมเดล —
    // โมเดลที่ export จาก CAD มักตั้ง pivot ไว้มุมใดมุมหนึ่งไม่ตรงกลางชิ้นงานจริง ถ้าใช้ pivot ตรงๆ
    // ตัวละครจะเดินไปหยุดที่จุดที่ดูไม่ตรงกับรูปทรงที่ไฮไลท์ไว้บนจอ
    let targetPos = null;
    const col = factoryColliders.find(c => c.uuid === selection.uuid);
    if (col) { targetPos = col.box.getCenter(new THREE.Vector3()); }
    else {
        factoryModel.traverse(child => { if (!targetPos && child.isMesh && child.uuid === selection.uuid) { targetPos = new THREE.Vector3(); child.getWorldPosition(targetPos); } });
    }
    if (!targetPos) return;
    if (isFreeLook) { isFreeLook = false; resetCameraToAvatar(); } // เดินอัตโนมัติต้องอยู่โหมดกล้องติดตามตัวละคร
    autoWalk.active = true;
    autoWalk.targetX = targetPos.x;
    autoWalk.targetZ = targetPos.z;
    const hud = $('walk-arrow-hud'); if (hud) hud.style.display = 'flex';
    const btn = $('btn-walk-to'); if (btn) btn.classList.add('walk-active');
}
window.walkToSelected = walkToSelected;

function cancelAutoWalk() {
    if (!autoWalk.active) return;
    autoWalk.active = false;
    moveStatus.forward = false;
    const hud = $('walk-arrow-hud'); if (hud) hud.style.display = 'none';
    const btn = $('btn-walk-to'); if (btn) btn.classList.remove('walk-active');
}
window.cancelAutoWalk = cancelAutoWalk;

function updateWalkArrowHud(dist, angleDiff) {
    const icon = $('walk-arrow-icon');
    if (icon) icon.style.transform = `rotate(${angleDiff}rad)`;
    const distEl = $('walk-arrow-dist');
    if (distEl) distEl.textContent = dist.toFixed(1) + ' ม.';
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

    if (measureMode) { handleMeasureClick(e); return; } // โหมดวัดระยะ: คลิก = ปักหมุด ไม่ใช่เลือกชิ้นส่วน

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
// ระหว่างเดินอัตโนมัติไปหาชิ้นส่วนที่เลือกไว้ (walkToSelected) ห้ามให้ชิ้นส่วนอื่นที่บังเอิญ
// เดินผ่านแนวมาแย่งเปลี่ยนป้ายข้อมูล/ไฮไลท์ไปกลางทาง — ผู้ใช้กด "เดินไปที่นี่" เพราะอยากดูข้อมูล
// ของชิ้นที่เลือกไว้ตอนไปถึง ไม่ใช่ของอย่างอื่นที่บังเอิญอยู่ระหว่างทาง
function checkWalkCollision(nextX, nextZ, currentY) {
    for (const col of factoryColliders) {
        if (autoWalk.active && col.uuid !== selection.uuid) continue;
        const box = col.box;
        if (nextX + avatarConfig.radius > box.min.x && nextX - avatarConfig.radius < box.max.x &&
            nextZ + avatarConfig.radius > box.min.z && nextZ - avatarConfig.radius < box.max.z &&
            currentY < box.max.y && currentY + 1.6 > box.min.y) {
            if (selection.uuid !== col.uuid) selectPart(col.mesh, '🚶 ตัวละครเดินชนวัตถุ');
            return;
        }
    }
}

// REQ 6: เดินออกไปไกลจากจุดที่เลือกไว้ -> ปิดป้ายอัตโนมัติ (เฉพาะป้ายที่เปิดจากการเดินชน
// เท่านั้น — ป้ายที่เปิดจากคลิก/เลือกจากลิสต์/QR ไม่ควรปิดเองแค่เพราะตัวละครยืนอยู่ไกล)
function checkAutoDeselect() {
    if (!avatarModel || !factoryModel || !selection.uuid || !selection.viaWalkCollision) return;
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
    let colorClass = 'tag-blue';
    factoryModel.traverse(child => {
        if (child.isMesh && child.uuid === selection.uuid) {
            nameKey = child._original3DName || child.name || child.uuid;
            if (!child._original3DName) child._original3DName = nameKey;
            child.name = newTitle;
            // คงสี/สถานะ PPE จากข้อมูลเดิม (เช่น type ที่กำหนดไว้) — แก้ข้อความไม่ควรรีเซ็ตความเสี่ยง
            const existing = workflowDatabase[resolveDatabaseKey(child, newTitle)];
            if (existing) { requiresPPE = !!existing.requiresPPE; colorClass = existing.colorClass || 'tag-blue'; }
        }
    });

    const record = { name: newTitle, desc: newDesc, steps: newSteps, colorClass, requiresPPE };
    workflowDatabase[nameKey] = record;
    selection.key = nameKey;

    const listItem = $(`mesh-item-${selection.uuid}`);
    if (listItem) listItem.innerText = `${getIconForType(userDefinedTypes[selection.uuid] || userDefinedTypes[nameKey] || nameKey)} ${newTitle}`;

    renderWorkflowUI(newTitle, newDesc, newSteps, '✏️ บันทึกโดยผู้ใช้', colorClass);
    closeLiveEditFields();
    buildProximityTags();
    buildPPEZones();

    if (mpSocket && mpSocket.connected) {
        mpSocket.emit('workflow_update', { key: nameKey, name: newTitle, desc: newDesc, steps: newSteps, colorClass, requiresPPE, targetUuid: selection.uuid });
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
    const currentKey = resolveTypeKey(mesh, meshName) || 'default';
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
    const uuid = typeSelectorTargetMesh.uuid;
    const nameKey = typeSelectorTargetMesh._original3DName || typeSelectorTargetMesh.name || uuid;
    // เดิมลบแค่ entry ของ uuid — entry ของ nameKey ค้างอยู่ทำให้ล้างไม่ออกจริง
    // และไม่เคยแจ้ง server เลย (คนอื่น + การรีเฟรชยังเห็น type เดิม)
    delete userDefinedTypes[uuid];
    delete userDefinedTypes[nameKey];
    delete workflowDatabase[uuid];
    delete workflowDatabase[nameKey];
    const listItem = $(`mesh-item-${uuid}`);
    if (listItem) listItem.innerText = `${getIconForType(resolveTypeKey(typeSelectorTargetMesh))} ${typeSelectorTargetMesh.name || nameKey}`;
    if (mpSocket && mpSocket.connected) mpSocket.emit('type_clear', { key: nameKey });
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
    if (!safetyLayers.tags) return; // ผู้ใช้ปิดชั้นป้ายเตือนไว้ในแท็บ "เลเยอร์"
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
    buildExtraSafetyLayers(); // ชั้น IOC (Ex-Zone / setback / ล่อฟ้า) สร้าง-เคลียร์พร้อมกันเสมอ
    if (!factoryModel) return;
    if (!safetyLayers.ppe) return; // ผู้ใช้ปิดชั้น PPE ไว้ในแท็บ "เลเยอร์"

    const sf = currentModelScaleFactor();
    const radius = PPE_ZONE_RADIUS * sf; // วงต้องโตตามโมเดลที่แอดมินปรับขนาดไว้ ไม่งั้นดูเล็กเกินไป

    factoryModel.traverse(child => {
        if (!child.isMesh) return;
        const key = resolveDatabaseKey(child, child.name);
        const data = workflowDatabase[key];
        if (!data || !data.requiresPPE) return;

        const worldPos = new THREE.Vector3(); child.getWorldPosition(worldPos);

        const ringGeo = new THREE.RingGeometry(radius - 0.15 * sf, radius + 0.15 * sf, 64);
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
        ctx.fillText('🛡️ PPE Zone 15m — สวมอุปกรณ์ป้องกันก่อนเข้า', 256, 64); // ข้อความคงระยะจริงตามมาตรฐานไว้ ไม่เปลี่ยนตามภาพ
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
        label.scale.set(8, 2, 1);
        label.position.set(worldPos.x, 1.5, worldPos.z - radius + 1);
        scene.add(label);

        ppeZoneObjects.push({ ring, label, centerX: worldPos.x, centerZ: worldPos.z, radius });
    });
}
function checkPPEZones() {
    if (!avatarModel || ppeZoneObjects.length === 0) return;
    const ax = avatarModel.position.x, az = avatarModel.position.z;
    let inside = false;
    for (const z of ppeZoneObjects) {
        if (Math.hypot(ax - z.centerX, az - z.centerZ) <= z.radius) { inside = true; break; }
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
// 9.2 MARKER SYSTEM — "กำหนดจุด" ที่ผู้ใช้ปักเอง ตั้งชื่อ+เลือกสีได้อิสระ
// ต่างจากการ "กำหนด Type" ตรงที่ไม่ต้องผูกกับประเภทอุปกรณ์ที่มีอยู่ — ใช้ทำจุดรวมพล
// ทางหนีไฟ จุดที่ต้องระวัง ฯลฯ วงกลมเรืองแสงบนพื้น + ชื่อจะโผล่เมื่อเดินเข้าใกล้
// ตำแหน่งเก็บเป็นพิกัดโลกจริง (ไม่ผูกกับ mesh) จึงยังอยู่ที่เดิมแม้เปลี่ยนโมเดล
// ============================================================
// ชุดสีเดิม (marker ที่บันทึกไว้ก่อนมีจานสี) — ของใหม่เก็บเป็น '#rrggbb' ตรงๆ
const MARKER_COLOR_HEX = {
    red: 0xef4444, orange: 0xf97316, yellow: 0xfacc15,
    green: 0x22c55e, blue: 0x38bdf8, purple: 0xa78bfa
};
function markerColorToHex(color) {
    if (typeof color === 'string' && /^#[0-9a-f]{6}$/i.test(color)) return parseInt(color.slice(1), 16);
    return MARKER_COLOR_HEX[color] !== undefined ? MARKER_COLOR_HEX[color] : MARKER_COLOR_HEX.blue;
}
const MARKER_LABEL_RANGE = 8;   // ระยะที่เริ่มเห็นชื่อจุด
const markerStore = {};         // id -> { id, name, color, x, y, z } (ตรงกับฝั่ง server)
const markerObjects = new Map();// id -> { badge, ring, label, x, y, z }

// ป้ายวงกลมลอย — หน้าตาเดียวกับป้ายเตือนของระบบเดิม เห็นได้จากไกลและรู้ทันทีว่าเป็นจุดที่ปักไว้
function markerBadgeSprite(colorHex) {
    const css = '#' + colorHex.toString(16).padStart(6, '0');
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.beginPath(); ctx.arc(64, 64, 46, 0, Math.PI * 2);
    ctx.fillStyle = css; ctx.fill();
    ctx.lineWidth = 7; ctx.strokeStyle = '#ffffff'; ctx.stroke();
    ctx.font = 'bold 62px Arial'; ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('!', 64, 68);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
    sprite.renderOrder = 1001;
    return sprite;
}

function markerLabelSprite(name, colorHex) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 30px "Segoe UI", Arial, sans-serif';
    const textW = Math.min(ctx.measureText(name).width, 560);
    canvas.width = Math.max(textW + 56, 160); canvas.height = 84;
    const c2 = canvas.getContext('2d');
    const css = '#' + colorHex.toString(16).padStart(6, '0');
    c2.fillStyle = 'rgba(8,12,20,0.86)';
    if (c2.roundRect) { c2.beginPath(); c2.roundRect(2, 2, canvas.width - 4, canvas.height - 4, 16); c2.fill(); }
    else c2.fillRect(0, 0, canvas.width, canvas.height);
    c2.lineWidth = 4; c2.strokeStyle = css; c2.stroke();
    c2.font = 'bold 30px "Segoe UI", Arial, sans-serif';
    c2.fillStyle = '#ffffff'; c2.textAlign = 'center'; c2.textBaseline = 'middle';
    c2.fillText(name, canvas.width / 2, canvas.height / 2 + 1);

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false, transparent: true }));
    sprite.scale.set((canvas.width / canvas.height) * 1.5, 1.5, 1);
    sprite.renderOrder = 1000;
    return sprite;
}

function addMarkerVisual(m) {
    const colorHex = markerColorToHex(m.color);
    const sf = currentModelScaleFactor();

    // วงแหวนบางๆ บนพื้น บอกตำแหน่งจริงว่าจุดอยู่ตรงไหน
    const r = 1.4 * sf;
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(r * 0.82, r, 48),
        new THREE.MeshBasicMaterial({ color: colorHex, side: THREE.DoubleSide, transparent: true, opacity: 0.75, depthTest: false })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(m.x, m.y + 0.06, m.z);
    ring.renderOrder = 998;
    scene.add(ring);

    // ป้ายวงกลมลอยเหนือจุด — ตัวหลักที่ผู้ใช้มองหา
    const badge = markerBadgeSprite(colorHex);
    badge.scale.set(0.85 * sf, 0.85 * sf, 1);
    badge.position.set(m.x, m.y + 1.7 * sf, m.z);
    scene.add(badge);

    const label = markerLabelSprite(m.name, colorHex);
    label.position.set(m.x, m.y + 2.9 * sf, m.z);
    label.visible = false; // โผล่เมื่อเดินเข้าใกล้เท่านั้น
    scene.add(label);

    markerObjects.set(m.id, { badge, ring, label, x: m.x, y: m.y, z: m.z, sf });
}

function removeMarkerVisual(id) {
    const o = markerObjects.get(id);
    if (!o) return;
    scene.remove(o.ring); o.ring.geometry.dispose(); o.ring.material.dispose();
    [o.badge, o.label].forEach(sprite => {
        scene.remove(sprite);
        sprite.material.map?.dispose();
        sprite.material.dispose();
    });
    markerObjects.delete(id);
}

function rebuildMarkers() {
    [...markerObjects.keys()].forEach(removeMarkerVisual);
    Object.values(markerStore).forEach(addMarkerVisual);
}

// เรียกทุกเฟรม — โชว์ชื่อเมื่อเดินเข้าใกล้ + วงกลมเต้นเบาๆ ให้สังเกตเห็นง่าย
function updateMarkers() {
    if (markerObjects.size === 0) return;
    const pulse = 1 + Math.sin(Date.now() * 0.003) * 0.08;
    const bob = Math.sin(Date.now() * 0.0022) * 0.12;
    const pos = avatarModel ? avatarModel.position : camera.position;
    const range = MARKER_LABEL_RANGE * currentModelScaleFactor();
    markerObjects.forEach(o => {
        o.ring.scale.set(pulse, pulse, 1);
        o.badge.scale.set(0.85 * o.sf * pulse, 0.85 * o.sf * pulse, 1);
        o.badge.position.y = o.y + (1.7 + bob) * o.sf; // ลอยขึ้นลงเบาๆ ให้สังเกตเห็นง่าย
        const d = Math.hypot(pos.x - o.x, pos.z - o.z);
        o.label.visible = d <= range;
    });
}

// ---------- ตัวแก้ไขจุด (modal) ----------
let markerEditorTarget = null; // { id, x, y, z, label }
let markerEditorColor = 'blue';

window.openMarkerEditorForActive = function () {
    if (!selection.uuid || !factoryModel) {
        mpAppendChat({ name: 'ระบบ', color: '#ef4444', text: 'กรุณาเลือกชิ้นส่วนก่อนกำหนดจุด' });
        return;
    }
    let mesh = null;
    factoryModel.traverse(c => { if (c.isMesh && c.uuid === selection.uuid) mesh = c; });
    if (!mesh) return;

    // ปักที่ "ฐานของชิ้นส่วน" (กึ่งกลางแกน X/Z, ต่ำสุดแกน Y) เพื่อให้วงกลมวางบนพื้นพอดี
    const box = new THREE.Box3().setFromObject(mesh);
    const center = box.getCenter(new THREE.Vector3());
    const id = 'm_' + (mesh._original3DName || mesh.name || mesh.uuid);
    const existing = markerStore[id];

    markerEditorTarget = { id, x: center.x, y: box.min.y, z: center.z, label: mesh.name || id };
    // เก็บเป็น hex เสมอ — marker เก่าที่บันทึกเป็นชื่อสีจะถูกแปลงให้อัตโนมัติ
    const startHex = '#' + markerColorToHex(existing ? existing.color : 'blue').toString(16).padStart(6, '0');
    markerEditorColor = startHex;

    $('marker-editor-target').innerText = `📦 ${mesh.name || mesh.uuid.slice(0, 8)}`;
    $('marker-name-input').value = existing ? existing.name : (mesh.name || '');
    renderMarkerColorRow();
    mountMarkerColorWheel(startHex);
    $('marker-editor-overlay').style.display = 'flex';
};

let markerWheel = null;
function mountMarkerColorWheel(hex) {
    const box = $('marker-color-wheel');
    if (!box || !window.AecColorWheel) return;
    // สร้างครั้งเดียวแล้วใช้ setHex ตอนเปิดซ้ำ — สร้างใหม่ทุกครั้งจะทิ้ง canvas/listener เก่าไว้เรื่อยๆ
    if (!markerWheel) {
        markerWheel = AecColorWheel.mount(box, hex, h => {
            markerEditorColor = h;
            renderMarkerColorRow(); // ยกเลิกไฮไลท์สีด่วนถ้าลากไปสีอื่นแล้ว
        });
    } else {
        markerWheel.setHex(hex);
    }
}

function renderMarkerColorRow() {
    const row = $('marker-color-row');
    if (!row) return;
    row.innerHTML = Object.keys(MARKER_COLOR_HEX).map(key => {
        const css = '#' + MARKER_COLOR_HEX[key].toString(16).padStart(6, '0');
        const sel = css.toLowerCase() === String(markerEditorColor).toLowerCase();
        return `<button class="marker-color-dot${sel ? ' sel' : ''}" style="background:${css};color:${css};" onclick="pickMarkerColor('${css}')" title="${key}"></button>`;
    }).join('');
}
window.pickMarkerColor = function (hex) {
    markerEditorColor = hex;
    renderMarkerColorRow();
    if (markerWheel) markerWheel.setHex(hex);
};

window.closeMarkerEditor = function () {
    const o = $('marker-editor-overlay');
    if (o) o.style.display = 'none';
    markerEditorTarget = null;
};

window.saveActiveMarker = function () {
    if (!markerEditorTarget) return;
    const name = ($('marker-name-input').value || '').trim() || 'จุดที่ทำเครื่องหมาย';
    const m = { id: markerEditorTarget.id, name, color: markerEditorColor, x: markerEditorTarget.x, y: markerEditorTarget.y, z: markerEditorTarget.z };
    // วาดให้เห็นทันทีโดยไม่รอ server ตอบ (ถ้าเน็ตช้าจะได้ไม่รู้สึกว่ากดแล้วไม่มีอะไรเกิดขึ้น)
    markerStore[m.id] = m;
    removeMarkerVisual(m.id);
    addMarkerVisual(m);
    if (mpSocket && mpSocket.connected) mpSocket.emit('marker_set', m);
    mpAppendChat({ name: '📍 ระบบ', color: '#22d3ee', text: `ปักจุด "${name}" แล้ว` });
    closeMarkerEditor();
};

window.removeActiveMarker = function () {
    if (!markerEditorTarget) return;
    const id = markerEditorTarget.id;
    if (!markerStore[id]) { closeMarkerEditor(); return; }
    delete markerStore[id];
    removeMarkerVisual(id);
    if (mpSocket && mpSocket.connected) mpSocket.emit('marker_remove', { id });
    mpAppendChat({ name: '📍 ระบบ', color: '#94a3b8', text: 'ลบจุดแล้ว' });
    closeMarkerEditor();
};

$('marker-editor-overlay')?.addEventListener('click', function (e) { if (e.target === this) closeMarkerEditor(); });

// ============================================================
// 9.5 SAFETY VISUALIZATION LAYERS — ชั้นแสดงผลตามแบบประเมิน IOC
// Ex-Zone 0/1/2 (ข้อ 4), ระยะปลอดภัย/ระยะร่น (ข้อ 1), รัศมีป้องกันฟ้าผ่า
// แบบ Rolling Sphere (ข้อ 5) — เปิด/ปิดแยกชั้นได้จากแท็บ "เลเยอร์"
// ============================================================
const safetyLayers = {
    exzone: localStorage.getItem('aec_layer_exzone') !== 'off',
    ppe: localStorage.getItem('aec_layer_ppe') !== 'off',
    setback: localStorage.getItem('aec_layer_setback') !== 'off',
    lightning: localStorage.getItem('aec_layer_lightning') !== 'off',
    tags: localStorage.getItem('aec_layer_tags') !== 'off'
};
window.setSafetyLayer = function (key, on) {
    safetyLayers[key] = !!on;
    localStorage.setItem('aec_layer_' + key, on ? 'on' : 'off');
    if (key === 'tags') buildProximityTags();
    else buildPPEZones(); // สร้างชั้น IOC อื่นทั้งหมดต่อท้ายในตัวเสมอ
};

// รัศมีอ้างอิงข้อกำหนด (หน่วยเมตรในโลกจำลอง)
const EXZONE_RINGS = [
    { r: 1.5, color: 0xef4444, opacity: 0.6 },  // Zone 0 — ภายใน/ติดอุปกรณ์
    { r: 4.5, color: 0xf97316, opacity: 0.5 },  // Zone 1
    { r: 9.0, color: 0xfacc15, opacity: 0.4 }   // Zone 2
];
const EXZONE_TYPES = ['tank', 'manhole', 'pvrv'];
const SETBACK_RULES = {
    flare: { r: 7.5, label: '📏 หอเผาก๊าซ: ระยะปลอดภัย ≥ 7.5 ม.' },
    utilization: { r: 15, label: '📏 เครื่องยนต์: ห่างบ่อหมัก ≥ 15 ม.' },
    tank: { r: 30, label: '📏 บ่อหมัก: ระยะร่นแนวเขตที่ดิน ≥ 30 ม.' }
};
const LIGHTNING_SPHERE_R = 20; // Rolling Sphere Class I (เข้มงวดสุด) ≈ 20 ม.

const safetyOverlayObjects = [];
function makeGroundRing(x, z, r, color, opacity) {
    const ring = new THREE.Mesh(
        new THREE.RingGeometry(Math.max(r - 0.14, 0.05), r + 0.14, 64),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: opacity || 0.5 })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(x, 0.045, z);
    return ring;
}
function makeTextSprite(text, bgColor, widthUnits) {
    const canvas = document.createElement('canvas');
    canvas.width = 640; canvas.height = 96;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = bgColor || 'rgba(15,23,42,0.88)';
    if (ctx.roundRect) { ctx.beginPath(); ctx.roundRect(2, 2, 636, 92, 16); ctx.fill(); } else ctx.fillRect(2, 2, 636, 92);
    ctx.font = 'bold 32px "Segoe UI", Arial, sans-serif';
    ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, 320, 50);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(canvas), depthTest: false }));
    const w = widthUnits || 6;
    sp.scale.set(w, w * 96 / 640, 1);
    sp.renderOrder = 998;
    return sp;
}

function buildExtraSafetyLayers() {
    safetyOverlayObjects.forEach(o => scene.remove(o));
    safetyOverlayObjects.length = 0;
    if (!factoryModel) return;
    factoryModel.updateMatrixWorld(true);
    const addObj = o => { scene.add(o); safetyOverlayObjects.push(o); };
    // วงเหล่านี้อ้างอิงระยะจริงเป็นเมตร แต่ต้องคูณด้วยอัตราส่วนสเกลของโมเดลตอนนี้เสมอ ไม่งั้น
    // พอแอดมินขยายโมเดลใหญ่ขึ้น วงจะยังเป็นขนาดเดิม ดูเล็กจิ๋วเทียบกับโมเดล (ป้ายข้อความยังโชว์
    // ระยะจริงตามมาตรฐานเดิมไว้ ไม่เปลี่ยนเลข แค่ตัววงและตำแหน่งป้ายที่ขยายตามภาพ)
    const sf = currentModelScaleFactor();

    factoryModel.traverse(child => {
        if (!child.isMesh) return;
        // จำแนกด้วย "ชนิดอุปกรณ์" โดยตรง — แม้ชิ้นส่วนจะถูกแก้ชื่อ/ข้อมูลเองไปแล้ว
        // วงยังต้องอยู่ตาม type ที่กำหนดไว้
        const key = resolveTypeKey(child, child.name);
        if (!key) return;
        const pos = new THREE.Vector3(); child.getWorldPosition(pos);

        // ---- IOC ข้อ 4: Ex-Zone 0/1/2 วงสีซ้อนกันรอบจุดเสี่ยงก๊าซไวไฟ ----
        if (safetyLayers.exzone && EXZONE_TYPES.includes(key)) {
            const outerR = EXZONE_RINGS[2].r * sf;
            EXZONE_RINGS.forEach(zone => addObj(makeGroundRing(pos.x, pos.z, zone.r * sf, zone.color, zone.opacity)));
            const label = makeTextSprite('☣️ Ex-Zone 0 / 1 / 2 — พื้นที่ก๊าซไวไฟ ห้ามประกายไฟ', 'rgba(239,68,68,0.9)', 7);
            label.position.set(pos.x, 0.7, pos.z + outerR - 0.4);
            addObj(label);
        }

        // ---- IOC ข้อ 1: วงระยะปลอดภัย/ระยะร่นตามมาตรฐาน ----
        if (safetyLayers.setback && SETBACK_RULES[key]) {
            const rule = SETBACK_RULES[key];
            const r = rule.r * sf;
            addObj(makeGroundRing(pos.x, pos.z, r, 0x38bdf8, 0.45));
            const label = makeTextSprite(rule.label, 'rgba(14,116,178,0.9)', 8);
            label.position.set(pos.x, 1.1, pos.z + r - 0.5);
            addObj(label);
        }

        // ---- IOC ข้อ 5: โดมรัศมีป้องกันฟ้าผ่า (Rolling Sphere) ครอบพื้นที่ ----
        if (safetyLayers.lightning && key === 'lightning_rod') {
            const radius = LIGHTNING_SPHERE_R * sf;
            const rodTop = new THREE.Box3().setFromObject(child).max.y;
            const dome = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2),
                new THREE.MeshBasicMaterial({ color: 0xa855f7, transparent: true, opacity: 0.07, side: THREE.DoubleSide, depthWrite: false })
            );
            dome.position.set(pos.x, 0, pos.z);
            addObj(dome);
            const wire = new THREE.Mesh(
                new THREE.SphereGeometry(radius, 24, 10, 0, Math.PI * 2, 0, Math.PI / 2),
                new THREE.MeshBasicMaterial({ color: 0xa855f7, wireframe: true, transparent: true, opacity: 0.14 })
            );
            wire.position.set(pos.x, 0, pos.z);
            addObj(wire);
            addObj(makeGroundRing(pos.x, pos.z, radius, 0xa855f7, 0.4));
            const label = makeTextSprite(`⚡ รัศมีป้องกันฟ้าผ่า Rolling Sphere ≈ ${LIGHTNING_SPHERE_R} ม. (คลุมโดมก๊าซ 100%)`, 'rgba(126,58,242,0.9)', 9);
            label.position.set(pos.x, rodTop + 1.2, pos.z);
            addObj(label);
        }
    });
}

// ============================================================
// 9.6 เครื่องมือวัดระยะ (IOC ข้อ 1) — คลิก 2 จุดบนโมเดล/พื้น ได้ระยะเป็นเมตร
// ให้ผู้เชี่ยวชาญ/ผู้ใช้ตรวจสอบระยะห่างจริงในแบบจำลองเทียบกับมาตรฐานได้ทันที
// ============================================================
let measureMode = false;
let measureStart = null;
const measureObjects = [];         // เส้นวัดของเราเอง
const remoteMeasureObjects = {};   // เส้นวัดของผู้อื่น: socketId -> [objects] (ทุกคนเห็นเหมือนกัน)

// วาดชุดวัดระยะ (หมุด 2 + เส้น + ป้ายเมตร) ลง array ที่กำหนด — ใช้ทั้งของเราและของเพื่อน
function drawMeasureVisual(a, b, store, color) {
    const c = color || 0x38bdf8;
    [a, b].forEach(p => {
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), new THREE.MeshBasicMaterial({ color: c }));
        marker.position.copy(p);
        scene.add(marker); store.push(marker);
    });
    const line = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([a, b]),
        new THREE.LineBasicMaterial({ color: c })
    );
    scene.add(line); store.push(line);
    const dist = a.distanceTo(b);
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const label = makeTextSprite(dist.toFixed(2) + ' เมตร', 'rgba(14,116,178,0.92)', 4);
    label.position.set(mid.x, mid.y + 0.7, mid.z);
    scene.add(label); store.push(label);
    return dist;
}
function clearMeasurement() {
    measureObjects.forEach(o => scene.remove(o));
    measureObjects.length = 0;
    measureStart = null;
    // แจ้งทุกคนให้ลบเส้นวัดของเราด้วย
    if (mpSocket && mpSocket.connected) mpSocket.emit('measure_clear');
}
function clearRemoteMeasurement(id) {
    (remoteMeasureObjects[id] || []).forEach(o => scene.remove(o));
    delete remoteMeasureObjects[id];
}
window.toggleMeasureMode = function () {
    measureMode = !measureMode;
    if (!measureMode) clearMeasurement();
    ['hud-measure', 'btn-measure-panel'].forEach(id => { const b = $(id); if (b) b.classList.toggle('measure-on', measureMode); });
    mpAppendChat({
        name: '📏 ระบบ', color: '#38bdf8',
        text: measureMode ? 'โหมดวัดระยะ: คลิกจุดที่ 1 แล้วคลิกจุดที่ 2 บนโมเดลหรือพื้น (ทุกคนในห้องเห็นเส้นวัดด้วย — กดปุ่มซ้ำเพื่อออก)' : 'ปิดโหมดวัดระยะแล้ว'
    });
};
function handleMeasureClick(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointerNDC, camera);
    const targets = [groundDisc];
    if (factoryModel) targets.push(factoryModel);
    const hits = raycaster.intersectObjects(targets, true);
    if (!hits.length) return;
    const pt = hits[0].point.clone();

    if (!measureStart) {
        // จุดแรก: ปักหมุดชั่วคราวรอจุดที่สอง
        const marker = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 12), new THREE.MeshBasicMaterial({ color: 0x38bdf8 }));
        marker.position.copy(pt);
        scene.add(marker); measureObjects.push(marker);
        measureStart = pt;
        return;
    }
    const dist = drawMeasureVisual(measureStart, pt, measureObjects);
    mpAppendChat({ name: '📏 วัดระยะ', color: '#38bdf8', text: `ระยะที่วัดได้: ${dist.toFixed(2)} เมตร` });
    // แชร์เส้นวัดให้ทุกคนในห้องเห็นเหมือนกัน
    if (mpSocket && mpSocket.connected) {
        mpSocket.emit('measure_add', {
            a: { x: measureStart.x, y: measureStart.y, z: measureStart.z },
            b: { x: pt.x, y: pt.y, z: pt.z }
        });
    }
    measureStart = null; // พร้อมวัดคู่ถัดไป
}

// ตั้งค่า checkbox ในแท็บ "เลเยอร์" ให้ตรงกับสถานะที่จำไว้
['exzone', 'ppe', 'setback', 'lightning', 'tags'].forEach(k => {
    const cb = $('layer-' + k);
    if (cb) cb.checked = safetyLayers[k];
});

// ============================================================
// 10. TRANSFORM PANEL — REQ 1 & 2: scale/position/rotation + Lock
// เฉพาะ Admin ที่ล็อกอินถูกต้องและปลดล็อกไว้เท่านั้นที่ปรับได้ ผู้ใช้ทั่วไปเห็นแบบอ่านอย่างเดียว
// ทุกการปรับ sync ผ่าน server ให้ทุกคนในห้องเห็นตรงกันแบบเรียลไทม์
//
// ช่องตัวเลข (num-*) คือค่าจริงที่ใช้กับโมเดล ไม่มีลิมิต — พิมพ์ค่าเกินช่วงของ slider
// ได้ตามปกติ, slider (param-*) เป็นแค่ตัวช่วยลากคร่าวๆ ในช่วงที่ตั้งไว้เฉยๆ ถ้าค่าจริง
// เกินช่วงนั้น thumb ของ slider จะไปสุดปลายช่วงแต่ค่าที่ใช้จริงยังถูกต้องเสมอ
// ============================================================
let isAdmin = false;
let modelLocked = true;
const SLIDER_IDS = ['param-posX', 'param-posY', 'param-posZ', 'param-rotY', 'param-scale'];
const NUMBER_IDS = ['num-posX', 'num-posY', 'num-posZ', 'num-rotY', 'num-scale'];

function syncSlidersWithModel() {
    if (!factoryModel) return;
    $('num-posX').value = factoryModel.position.x.toFixed(2);
    $('num-posY').value = factoryModel.position.y.toFixed(2);
    $('num-posZ').value = factoryModel.position.z.toFixed(2);
    $('num-rotY').value = Math.round(factoryModel.rotation.y * (180 / Math.PI));
    $('num-scale').value = (factoryModel.scale.x / initialFactoryScale).toFixed(2);
    syncSliderThumbsFromNumbers();
}
function syncSliderThumbsFromNumbers() {
    NUMBER_IDS.forEach((numId, i) => { $(SLIDER_IDS[i]).value = $(numId).value; });
}

let _lastTransformEmit = 0;
function applyTransformFromNumbers() {
    if (!factoryModel || !isAdmin || modelLocked) return;
    const px = parseFloat($('num-posX').value) || 0, py = parseFloat($('num-posY').value) || 0, pz = parseFloat($('num-posZ').value) || 0;
    const ry = (parseFloat($('num-rotY').value) || 0) * (Math.PI / 180);
    const sc = parseFloat($('num-scale').value) || 1;
    factoryModel.position.set(px, py, pz);
    factoryModel.rotation.y = ry;
    factoryModel.scale.set(initialFactoryScale * sc, initialFactoryScale * sc, initialFactoryScale * sc);
    syncSliderThumbsFromNumbers();
    buildColliders();
    buildProximityTags();
    buildPPEZones();

    const now = Date.now();
    if (mpSocket && mpSocket.connected && now - _lastTransformEmit > 60) {
        _lastTransformEmit = now;
        mpSocket.emit('model_transform_update', { posX: px, posY: py, posZ: pz, rotY: ry, scale: sc });
    }
}
// พิมพ์ในช่องตัวเลข -> ใช้ค่านั้นตรงๆ (ไม่ clamp ไม่มีลิมิต)
NUMBER_IDS.forEach(id => { $(id)?.addEventListener('input', applyTransformFromNumbers); });
// ลาก slider -> ก็อปค่าไปช่องตัวเลขก่อน แล้วค่อย apply ให้ทั้งสองฝั่งซิงก์กันเสมอ
SLIDER_IDS.forEach((id, i) => {
    $(id)?.addEventListener('input', () => {
        $(NUMBER_IDS[i]).value = $(id).value;
        applyTransformFromNumbers();
    });
});

// ---------- Gizmo 3D (THREE.TransformControls) — ลากแกนสีในฉากโดยตรงแทนการลาก slider ----------
let transformGizmo = null;
function initTransformGizmo() {
    if (transformGizmo || typeof THREE.TransformControls === 'undefined') return;
    transformGizmo = new THREE.TransformControls(camera, renderer.domElement);
    transformGizmo.setSize(0.9);
    transformGizmo.enabled = false;
    transformGizmo.visible = false;
    // ปิด OrbitControls ชั่วคราวตอนลากแกน กันกล้องหมุนพร้อมกับลากโมเดล
    transformGizmo.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
    transformGizmo.addEventListener('objectChange', () => {
        if (!factoryModel) return;
        syncSlidersWithModel(); // อ่านค่าจากโมเดลกลับเข้าช่องตัวเลข + broadcast แบบเดียวกับตอนลาก slider
        buildColliders();
        buildProximityTags();
        buildPPEZones();

        const now = Date.now();
        if (mpSocket && mpSocket.connected && now - _lastTransformEmit > 60) {
            _lastTransformEmit = now;
            const sc = factoryModel.scale.x / initialFactoryScale;
            mpSocket.emit('model_transform_update', {
                posX: factoryModel.position.x, posY: factoryModel.position.y, posZ: factoryModel.position.z,
                rotY: factoryModel.rotation.y, scale: sc
            });
        }
    });
    scene.add(transformGizmo);
}
initTransformGizmo();
window.setGizmoMode = function (mode) {
    if (!transformGizmo) return;
    transformGizmo.setMode(mode);
    ['translate', 'rotate', 'scale'].forEach(m => { $('gizmo-mode-' + m)?.classList.toggle('active', m === mode); });
};
function refreshGizmoAttachment() {
    if (!transformGizmo) return;
    const canEdit = isAdmin && !modelLocked && !!factoryModel;
    if (canEdit) {
        transformGizmo.attach(factoryModel);
        transformGizmo.enabled = true;
        transformGizmo.visible = true;
    } else {
        transformGizmo.enabled = false;
        transformGizmo.visible = false;
        transformGizmo.detach();
    }
}

// เปิด/ปิดการใช้งาน slider+number+gizmo ให้ตรงกับสิทธิ์ปัจจุบันเสมอ (เรียกทุกครั้งที่สถานะ admin/lock เปลี่ยน)
// สิทธิ์ admin มาจากบัญชีที่ล็อกอิน (server ตรวจให้ตอนเชื่อมต่อ) — ไม่มีช่องกรอกรหัสผ่านอีกแล้ว
function refreshTransformUiPermissions() {
    const canEdit = isAdmin && !modelLocked;
    SLIDER_IDS.forEach(id => { const el = $(id); if (el) el.disabled = !canEdit; });
    NUMBER_IDS.forEach(id => { const el = $(id); if (el) el.disabled = !canEdit; });
    refreshGizmoAttachment();

    const statusRow = $('admin-status-row');
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
            badge.innerText = isAdmin
                ? '🔒 โมเดลถูกล็อกไว้ — กดปลดล็อกด้านล่างเพื่อปรับตำแหน่ง'
                : '🔒 โมเดลถูกล็อกไว้ — ปรับได้เฉพาะบัญชีที่เป็น Admin';
            badge.style.background = 'rgba(239,68,68,0.12)'; badge.style.color = '#ef4444'; badge.style.border = '1px solid rgba(239,68,68,0.3)';
        } else {
            badge.innerText = isAdmin
                ? '🔓 โมเดลปลดล็อกอยู่ — คุณปรับตำแหน่งได้ ทุกคนเห็นแบบเรียลไทม์'
                : '🔓 Admin กำลังปรับตำแหน่งโมเดล — การเปลี่ยนแปลงแสดงแบบเรียลไทม์';
            badge.style.background = 'rgba(34,197,94,0.12)'; badge.style.color = '#22c55e'; badge.style.border = '1px solid rgba(34,197,94,0.3)';
        }
    }
}

window.toggleModelLock = function () {
    if (!isAdmin || !mpSocket || !mpSocket.connected) return;
    mpSocket.emit('toggle_lock');
};

// ============================================================
// 11. MULTIPLAYER — Socket.IO
// ============================================================
const remoteAvatars = {}, remoteTargets = {}, mpPlayerNames = {}, mpPlayerColors = {};
let mpMyId = null, mpMyColor = '#00ffff', mpSocket = null, _lastMoveEmit = 0;

// ร่างของผู้เล่นคนอื่นสร้างจาก config avatar ของบัญชีเขา (ส่งมากับ player data)
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
    const container = new THREE.Group();
    container.position.set(data.position.x, data.position.y, data.position.z);
    scene.add(container); remoteAvatars[data.id] = container;
    setAvatarVisual(container, data.avatar, data.color || '#4d96ff');
    setAvatarLabel(container, data.name || data.id, data.color || '#fff');
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
        updateAvatarMotion(av, t.pos.distanceTo(av.position) > 0.01);
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
    const log = $('chat-log');
    if (!log) return;
    const d = document.createElement('div');
    d.className = 'chat-msg';
    const strong = document.createElement('strong');
    strong.style.color = msg.color || 'var(--text-0, #fff)';
    strong.innerText = msg.name;
    d.appendChild(strong);
    d.appendChild(document.createTextNode(' ' + msg.text));
    log.appendChild(d);
    while (log.children.length > 120) log.removeChild(log.firstChild); // กัน DOM บวมในเซสชันยาว
    log.scrollTop = log.scrollHeight;

    // ป้ายจำนวนข้อความใหม่บนปุ่มแชท เมื่อหน้าต่างแชทถูกปิดอยู่
    const overlay = $('chat-overlay');
    if (overlay && overlay.style.display === 'none') {
        chatUnread++;
        updateChatUnreadBadge();
    }
}
// ชื่อผู้เล่นล็อกตามบัญชีที่ล็อกอิน — ไม่มี setMyName/set_name อีกต่อไป
window.sendChat = function () {
    const inp = $('chat-input');
    if (!inp) return;
    const text = inp.value.trim();
    if (!text || !mpSocket) return;
    mpSocket.emit('chat_message', text); inp.value = '';
};

async function initMultiplayer() {
    const dot = $('mp-dot'), txt = $('mp-status-text');
    if (typeof io === 'undefined') { txt.innerText = 'Single Player mode'; return; }

    // ตัวตนผูกกับบัญชี Supabase: ดึง access token จาก session ที่ล็อกอินไว้
    // (session เก็บใน localStorage ของ origin เดียวกัน — หน้า Login เป็นคนสร้างให้)
    let token = null;
    if (window.supabase && typeof window.supabase.createClient === 'function') {
        try {
            const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
            const { data: { session } } = await sb.auth.getSession();
            if (session) token = session.access_token;
        } catch (err) { console.warn('อ่าน session ไม่สำเร็จ:', err); }
    }
    // โหมดผู้เล่น (ไม่ใช่ viewer ใน iframe) ต้องล็อกอินก่อนเสมอ — ชื่อ/ตัวละครมาจากบัญชี
    if (!token && !VIEWER_MODE) { window.location.href = 'Login.html'; return; }

    const SERVER = window.RAILWAY_SERVER_URL || window.location.origin;
    mpSocket = io(SERVER, {
        transports: ['websocket', 'polling'],
        auth: { token, role: VIEWER_MODE ? 'watcher' : 'player' }
    });

    mpSocket.on('connect', () => { dot.style.background = '#22c55e'; txt.innerText = 'เชื่อมต่อแล้ว ✓'; });
    mpSocket.on('disconnect', () => { dot.style.background = '#ef4444'; txt.innerText = 'การเชื่อมต่อขาด...'; });
    mpSocket.on('connect_error', err => {
        if (err && err.message === 'AUTH_REQUIRED' && !VIEWER_MODE) { window.location.href = 'Login.html'; return; }
        dot.style.background = '#ef4444'; txt.innerText = 'เชื่อมต่อไม่สำเร็จ...';
    });
    // บัญชีเดียวกันเปิดแท็บใหม่ -> server เตะ connection เก่า (ตัวนี้) ออก
    mpSocket.on('kicked_duplicate', () => {
        txt.innerText = 'บัญชีนี้เข้าใช้งานจากแท็บ/อุปกรณ์อื่นแล้ว';
        mpAppendChat({ name: 'ระบบ', color: '#f59e0b', text: '⚠️ บัญชีนี้เชื่อมต่อจากที่อื่น — การเชื่อมต่อนี้ถูกปิด' });
    });

    mpSocket.on('self_init', data => {
        // ส่วนที่ทุก connection ได้รับ (ทั้ง player และ watcher): state กลางของห้อง
        if (data.workflowDb) Object.assign(workflowDatabase, data.workflowDb);
        if (data.typeAssignments) Object.assign(userDefinedTypes, data.typeAssignments);
        if (data.markers) { Object.assign(markerStore, data.markers); rebuildMarkers(); }
        modelLocked = data.modelLocked !== undefined ? data.modelLocked : true;
        isAdmin = !!data.isAdmin; // สิทธิ์ admin ตรวจจากบัญชีโดย server — ไม่มีรหัสผ่านแยกแล้ว
        // คู่มือใช้ค่านี้ตัดสินว่าจะโชว์หัวข้อ/ปุ่มที่เป็นสิทธิ์แอดมินไหม
        window.AEC_IS_ADMIN = isAdmin;
        if (window.AecGuide) AecGuide.refresh();
        refreshTransformUiPermissions();
        updateMpAdminBadge(data.adminCount || 0);

        // ส่วนเฉพาะ player: ข้อมูลตัวละครของตัวเอง (watcher ได้ self เป็น null)
        if (data.self) {
            mpMyId = data.self.id;
            mpMyColor = data.self.color;
            mpPlayerNames[mpMyId] = data.self.name;
            mpPlayerColors[mpMyId] = mpMyColor;
            if (avatarModel) {
                avatarModel.position.set(data.self.position.x, data.self.position.y, data.self.position.z);
                setAvatarLabel(avatarModel, data.self.name, data.self.color); // ป้ายชื่อตามบัญชีเหนือหัวตัวเอง
                setAvatarVisual(avatarModel, data.self.avatar, data.self.color); // ร่างจริงตามที่ตั้งไว้ในหน้า Avatar
            }
            if (!VIEWER_MODE) data.others.forEach(p => addRemote(p));
            mpAppendChat({ name: 'ระบบ', color: '#22c55e', text: `เข้าสู่โลกในชื่อ "${data.self.name}" (ตามบัญชีของคุณ)` });
            // เติมชื่อปัจจุบันให้ในช่องล็อบบี้ ผู้ใช้จะได้เห็นว่าตอนนี้ชื่ออะไรและแก้ได้เลย
            const nickInput = $('lobby-nickname');
            if (nickInput && !nickInput.value) nickInput.value = data.self.name || '';
        }

        if (data.modelUrl) loadModelFromUrl(data.modelUrl, data.modelName, data.modelTransform);
        updateMpUI();
        if (lobbyActive) {
            setLobbyStatus(data.modelUrl ? 'พร้อมแล้ว — กดเริ่มสำรวจได้เลย' : 'ยังไม่มีโมเดลในโลกนี้ — เข้าไปได้แต่จะเห็นพื้นที่ว่าง');
            const startBtn = $('lobby-start');
            if (startBtn) startBtn.disabled = false;
        }
    });

    // จุดที่คนอื่นปัก/ลบ — เห็นตรงกันทุกคนแบบเรียลไทม์
    mpSocket.on('marker_updated', m => {
        if (!m || !m.id) return;
        markerStore[m.id] = m;
        removeMarkerVisual(m.id);
        addMarkerVisual(m);
    });
    mpSocket.on('marker_removed', ({ id }) => {
        if (!id) return;
        delete markerStore[id];
        removeMarkerVisual(id);
    });

    // มีคนเปลี่ยนชื่อเล่น (รวมถึงตัวเราเอง) — เปลี่ยนป้ายชื่อเหนือหัวให้ตรงกันทันที
    mpSocket.on('player_renamed', ({ id, name }) => {
        if (!id || !name) return;
        mpPlayerNames[id] = name;
        const isMe = id === mpMyId;
        const target = isMe ? avatarModel : remoteAvatars[id];
        if (target) setAvatarLabel(target, name, isMe ? mpMyColor : (mpPlayerColors[id] || '#fff'));
        if (isMe) mpAppendChat({ name: 'ระบบ', color: '#22c55e', text: `เปลี่ยนชื่อเล่นเป็น "${name}" แล้ว` });
        updateMpUI();
    });

    mpSocket.on('player_joined', data => {
        if (!VIEWER_MODE) addRemote(data);
        if (micOn) connectVoiceTo(data.id); // ไมค์เราเปิดค้างอยู่ -> ต่อสายหาคนที่เพิ่งเข้ามาด้วย
        mpAppendChat({ name: 'ระบบ', color: '#64748b', text: `${data.name} เข้าร่วมโลก` });
    });
    mpSocket.on('player_left', data => {
        const name = mpPlayerNames[data.id] || data.id;
        removeRemote(data.id);
        closeVoicePeer(data.id);
        mpAppendChat({ name: 'ระบบ', color: '#64748b', text: `${name} ออกจากโลก` });
    });
    mpSocket.on('player_moved', data => {
        if (!remoteAvatars[data.id]) return;
        if (!remoteTargets[data.id]) remoteTargets[data.id] = { pos: new THREE.Vector3(), rotY: 0 };
        remoteTargets[data.id].pos.set(data.position.x, data.position.y, data.position.z);
        remoteTargets[data.id].rotY = data.rotation?.y || 0;
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
    // server ปฏิเสธการอัปโหลดทับโมเดลที่ล็อกอยู่ (กันผู้ใช้ทั่วไปแทนที่/ลบฉากของห้อง)
    mpSocket.on('model_share_rejected', data => {
        $('factory-status').innerText = '🔒 ' + (data?.reason || 'โมเดลปัจจุบันถูกล็อกอยู่ — ให้ Admin ปลดล็อกก่อน');
        mpAppendChat({ name: '🔒 ระบบ', color: '#f59e0b', text: data?.reason || 'โมเดลถูกล็อกอยู่ — อัปโหลดทับไม่ได้' });
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

    // ---------- sync การล้าง type ----------
    mpSocket.on('type_cleared', data => {
        if (!data || !data.key) return;
        delete userDefinedTypes[data.key];
        delete workflowDatabase[data.key];
        if (factoryModel) {
            factoryModel.traverse(child => {
                if (!child.isMesh) return;
                if ((child._original3DName || child.name) === data.key) {
                    delete userDefinedTypes[child.uuid];
                    delete workflowDatabase[child.uuid];
                    const item = $(`mesh-item-${child.uuid}`);
                    if (item) item.innerText = `${getIconForType(resolveTypeKey(child))} ${child.name}`;
                }
            });
        }
        buildProximityTags();
        buildPPEZones();
    });

    // ---------- sync เส้นวัดระยะ — ทุกคนในห้องเห็นเส้นเดียวกัน ----------
    mpSocket.on('measure_added', data => {
        if (!data || !data.a || !data.b || !data.id) return;
        if (!remoteMeasureObjects[data.id]) remoteMeasureObjects[data.id] = [];
        drawMeasureVisual(
            new THREE.Vector3(data.a.x, data.a.y, data.a.z),
            new THREE.Vector3(data.b.x, data.b.y, data.b.z),
            remoteMeasureObjects[data.id],
            0x22d3ee // สีต่างเล็กน้อย ให้รู้ว่าเป็นเส้นวัดของเพื่อน
        );
    });
    mpSocket.on('measure_cleared', data => { if (data && data.id) clearRemoteMeasurement(data.id); });

    // ---------- voice chat signaling + live plant data ----------
    mpSocket.on('voice_signal', handleVoiceSignal);
    mpSocket.on('voice_state', data => {
        remoteMicOn[data.id] = !!data.micOn;
        updateVoiceIndicator();
        const name = mpPlayerNames[data.id] || 'ผู้เล่น';
        if (data.micOn) mpAppendChat({ name: '🎙️', color: '#22d3ee', text: `${name} เปิดไมค์` });
    });
    mpSocket.on('plant_update', updatePlantStrip);

    // ตัดการเชื่อมต่อ (รวมโดนเตะเพราะบัญชีซ้ำ) -> เก็บกวาดสายเสียงทั้งหมด
    mpSocket.on('disconnect', () => {
        Object.keys(voicePeers).forEach(closeVoicePeer);
        if (micOn) {
            if (micStream) micStream.getAudioTracks().forEach(t => { t.enabled = false; });
            micOn = false;
            updateMicHudButton();
            updateVoiceIndicator();
        }
    });
}
function updateMpAdminBadge(count) {
    const el = $('mp-admin-count');
    if (el) el.innerText = count;
}
initMultiplayer();

// ============================================================
// 11.5 CHAT OVERLAY — หน้าต่างแชทลอยบน canvas
// เปิดช่องพิมพ์ด้วยปุ่ม / (ฝ) — เปิด/ปิดหน้าต่างด้วยปุ่มไอคอนแชทใน HUD
// ============================================================
let chatUnread = 0;
function updateChatUnreadBadge() {
    const b = $('chat-unread-badge');
    if (!b) return;
    b.style.display = chatUnread > 0 ? 'flex' : 'none';
    b.innerText = chatUnread > 9 ? '9+' : chatUnread;
}
function toggleChatPanel(force) {
    const overlay = $('chat-overlay');
    if (!overlay) return;
    const show = force !== undefined ? force : overlay.style.display === 'none';
    overlay.style.display = show ? 'flex' : 'none';
    if (show) {
        chatUnread = 0; updateChatUnreadBadge();
        const log = $('chat-log'); if (log) log.scrollTop = log.scrollHeight;
    }
}
function openChatInput() {
    if (VIEWER_MODE) return;
    if (localStorage.getItem('aec_chat_enabled') === 'off') return;
    toggleChatPanel(true);
    $('chat-input')?.focus();
}
window.toggleChatPanel = toggleChatPanel;
window.openChatInput = openChatInput;
$('chat-input')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') window.sendChat();
    if (e.key === 'Escape') e.target.blur();
});

// ============================================================
// 11.6 VOICE CHAT — WebRTC mesh: เสียงวิ่งตรงระหว่างผู้เล่น (P2P)
// server ทำหน้าที่ส่งสัญญาณ offer/answer/ICE เท่านั้น ไม่ได้ยินเสียงใคร
// กด V (อ) เพื่อเปิด/ปิดไมค์ — ตั้งค่าระบบและระดับเสียงได้ที่ Settings → Chat & Voice
// ============================================================
const VOICE_RTC_CONFIG = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };
const voicePrefs = { voiceEnabled: true, chatEnabled: true, volume: 0.8 };
let micOn = false;
let micStream = null;
const voicePeers = {};   // peerId -> { pc, audioEl, polite, makingOffer }
const remoteMicOn = {};  // peerId -> ไมค์อีกฝ่ายเปิดอยู่มั้ย (โชว์ตัวเลขใน header แชท)

function applyChatVoicePrefs() {
    voicePrefs.voiceEnabled = localStorage.getItem('aec_voice_enabled') !== 'off';
    voicePrefs.chatEnabled = localStorage.getItem('aec_chat_enabled') !== 'off';
    const rawVol = parseInt(localStorage.getItem('aec_voice_volume') ?? '80', 10);
    voicePrefs.volume = Math.min(1, Math.max(0, (isNaN(rawVol) ? 80 : rawVol) / 100));
    Object.values(voicePeers).forEach(p => { if (p.audioEl) p.audioEl.volume = voicePrefs.volume; });
    if (!voicePrefs.voiceEnabled && micOn) toggleMic(); // ถูกปิดจากหน้า Settings -> ดับไมค์ทันที
    if (!VIEWER_MODE) {
        const chatBtn = $('hud-chat');
        if (chatBtn) chatBtn.style.display = voicePrefs.chatEnabled ? '' : 'none';
        if (!voicePrefs.chatEnabled) toggleChatPanel(false);
        const voiceBtn = $('hud-voice');
        if (voiceBtn) voiceBtn.style.display = voicePrefs.voiceEnabled ? '' : 'none';
    }
}
// หน้า Settings แก้ค่าใน localStorage -> แท็บนี้รับ event แล้วปรับตามทันที ไม่ต้องรีเฟรช
window.addEventListener('storage', e => { if (e.key && e.key.startsWith('aec_')) applyChatVoicePrefs(); });

// ---------- autoplay unlock: เบราว์เซอร์บล็อกการเล่นเสียงจนกว่าผู้ใช้จะแตะหน้าจอ ----------
// ฝั่ง "ผู้ฟัง" ที่ยังไม่เคยคลิก/กดคีย์ในหน้านี้จะเล่นเสียงเพื่อนไม่ได้ — เก็บ audio ที่
// ถูกบล็อกไว้ แล้วปลดล็อกทั้งหมดทันทีที่มี gesture แรก
const blockedAudioEls = new Set();
let audioUnlockArmed = false;
function tryPlayRemoteAudio(el) {
    el.play().then(() => blockedAudioEls.delete(el)).catch(() => {
        blockedAudioEls.add(el);
        if (!audioUnlockArmed) {
            audioUnlockArmed = true;
            mpAppendChat({ name: '🔊 ระบบ', color: '#f59e0b', text: 'มีเสียงพูดเข้ามา — คลิกที่หน้าจอหนึ่งครั้งเพื่อเปิดเสียง' });
            const unlock = () => {
                blockedAudioEls.forEach(a => a.play().catch(() => {}));
                blockedAudioEls.clear();
            };
            window.addEventListener('pointerdown', unlock, { once: true });
            window.addEventListener('keydown', unlock, { once: true });
        }
    });
}

function getVoicePeer(peerId) {
    if (voicePeers[peerId]) return voicePeers[peerId];
    const pc = new RTCPeerConnection(VOICE_RTC_CONFIG);
    // กติกา "perfect negotiation": ฝ่าย polite ยอมถอยเมื่อ offer ชนกันกลางอากาศ
    const entry = { pc, polite: String(mpMyId) > String(peerId), makingOffer: false, audioEl: null, pendingCandidates: [] };
    voicePeers[peerId] = entry;

    pc.onnegotiationneeded = async () => {
        try {
            entry.makingOffer = true;
            await pc.setLocalDescription();
            mpSocket.emit('voice_signal', { to: peerId, data: { description: pc.localDescription } });
        } catch (err) { console.error('[VOICE] negotiate:', err); }
        finally { entry.makingOffer = false; }
    };
    pc.onicecandidate = e => { if (e.candidate) mpSocket.emit('voice_signal', { to: peerId, data: { candidate: e.candidate } }); };
    pc.oniceconnectionstatechange = () => {
        console.log(`[VOICE] ${peerId} ice:`, pc.iceConnectionState);
        if (pc.iceConnectionState === 'failed') {
            // เครือข่ายบางคู่ (NAT เข้มทั้งสองฝั่ง) ต่อ P2P ไม่ได้เพราะมีแค่ STUN — แจ้งให้รู้ตรงๆ
            mpAppendChat({ name: '🎙️ ระบบ', color: '#ef4444', text: `เชื่อมต่อเสียงกับ ${mpPlayerNames[peerId] || 'ผู้เล่น'} ไม่สำเร็จ (เครือข่ายปิดกั้นการเชื่อมต่อตรง)` });
            try { pc.restartIce(); } catch (err) { /* เบราว์เซอร์เก่าไม่มี restartIce */ }
        }
    };
    pc.ontrack = e => {
        if (!entry.audioEl) {
            entry.audioEl = document.createElement('audio');
            entry.audioEl.autoplay = true;
            entry.audioEl.style.display = 'none';
            document.body.appendChild(entry.audioEl);
        }
        entry.audioEl.srcObject = e.streams[0];
        entry.audioEl.volume = voicePrefs.volume;
        tryPlayRemoteAudio(entry.audioEl); // autoplay อาจถูกบล็อก — จัดการ unlock ให้
    };
    if (micStream) micStream.getTracks().forEach(t => pc.addTrack(t, micStream));
    return entry;
}

function connectVoiceTo(peerId) {
    const entry = getVoicePeer(peerId);
    if (micStream && entry.pc.getSenders().every(s => !s.track)) {
        micStream.getTracks().forEach(t => entry.pc.addTrack(t, micStream));
    }
}

function closeVoicePeer(peerId) {
    const p = voicePeers[peerId];
    if (!p) return;
    try { p.pc.close(); } catch (err) { /* ปิดซ้ำได้ ไม่เป็นไร */ }
    if (p.audioEl) { blockedAudioEls.delete(p.audioEl); p.audioEl.remove(); }
    delete voicePeers[peerId];
    delete remoteMicOn[peerId];
    updateVoiceIndicator();
}

async function handleVoiceSignal(payload) {
    if (!payload || !payload.from) return;
    const entry = getVoicePeer(payload.from);
    const pc = entry.pc;
    const data = payload.data || {};
    try {
        if (data.description) {
            const collision = data.description.type === 'offer' && (entry.makingOffer || pc.signalingState !== 'stable');
            if (collision && !entry.polite) return; // ฝ่ายไม่ polite ทิ้ง offer ที่ชนกัน แล้วรอรอบใหม่
            await pc.setRemoteDescription(data.description);
            // ICE candidates ที่มาถึง "ก่อน" remote description ถูกพักไว้ — เติมเข้าตอนนี้
            // (เดิมโยนทิ้งเงียบๆ ทำให้บางคู่เชื่อมเสียงไม่ติดเลย)
            while (entry.pendingCandidates.length) {
                await pc.addIceCandidate(entry.pendingCandidates.shift()).catch(() => {});
            }
            if (data.description.type === 'offer') {
                await pc.setLocalDescription();
                mpSocket.emit('voice_signal', { to: payload.from, data: { description: pc.localDescription } });
            }
        } else if (data.candidate) {
            if (pc.remoteDescription) await pc.addIceCandidate(data.candidate).catch(() => {});
            else entry.pendingCandidates.push(data.candidate);
        }
    } catch (err) { console.error('[VOICE] signal:', err); }
}

async function toggleMic() {
    if (VIEWER_MODE) return;
    if (!voicePrefs.voiceEnabled) {
        mpAppendChat({ name: '🎙️ ระบบ', color: '#f59e0b', text: 'ระบบเสียงถูกปิดไว้ — เปิดได้ที่ Settings → Chat & Voice' });
        return;
    }
    if (!mpSocket || !mpSocket.connected) {
        mpAppendChat({ name: '🎙️ ระบบ', color: '#ef4444', text: 'ยังไม่ได้เชื่อมต่อเซิร์ฟเวอร์' });
        return;
    }
    if (!micOn) {
        try {
            if (!micStream) {
                // ใช้ไมค์ตัวที่ผู้ใช้เลือกไว้เองที่หน้า Settings (บางเครื่องมีหลายตัว
                // แล้วเบราว์เซอร์เลือกตัวที่ไม่มีเสียงให้) — ไม่ได้เลือกไว้ก็ใช้ค่าเริ่มต้นตามเดิม
                const wantedMic = window.AecWorldPrefs ? AecWorldPrefs.getMicDeviceId() : '';
                const audioConstraints = { echoCancellation: true, noiseSuppression: true };
                if (wantedMic) audioConstraints.deviceId = { exact: wantedMic };
                try {
                    micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
                } catch (errDevice) {
                    // ไมค์ตัวที่เลือกไว้ถูกถอดออก/ใช้ไม่ได้ -> ถอยไปใช้ตัวเริ่มต้น ดีกว่าเปิดไมค์ไม่ได้เลย
                    if (!wantedMic) throw errDevice;
                    console.warn('[VOICE] ไมค์ที่เลือกไว้ใช้ไม่ได้ ใช้ตัวเริ่มต้นแทน:', errDevice);
                    micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
                    mpAppendChat({ name: '🎙️ ระบบ', color: '#f59e0b', text: 'ไมโครโฟนที่เลือกไว้ใช้ไม่ได้ — เปลี่ยนไปใช้ตัวเริ่มต้นให้แล้ว' });
                }
                // มี peer อยู่แล้ว (เคยรับเสียงคนอื่น) -> ยัด track ของเราเข้าไป ระบบจะ negotiate ใหม่เอง
                Object.values(voicePeers).forEach(p => {
                    if (p.pc.getSenders().every(s => !s.track)) micStream.getTracks().forEach(t => p.pc.addTrack(t, micStream));
                });
            }
            micStream.getAudioTracks().forEach(t => { t.enabled = true; });
            micOn = true;
            Object.keys(remoteAvatars).forEach(id => connectVoiceTo(id)); // ต่อ P2P หาทุกคนที่ออนไลน์
        } catch (err) {
            console.error('[VOICE] getUserMedia:', err);
            mpAppendChat({ name: '🎙️ ระบบ', color: '#ef4444', text: 'เปิดไมค์ไม่สำเร็จ — เบราว์เซอร์ไม่ได้รับอนุญาตให้ใช้ไมโครโฟน' });
            return;
        }
    } else {
        if (micStream) micStream.getAudioTracks().forEach(t => { t.enabled = false; });
        micOn = false;
    }
    mpSocket.emit('voice_state', { micOn });
    updateMicHudButton();
    updateVoiceIndicator();
    mpAppendChat({
        name: '🎙️ ระบบ', color: micOn ? '#22c55e' : '#9aa7b8',
        text: micOn ? 'ไมค์เปิดแล้ว — ผู้เล่นทุกคนได้ยินคุณ (กด V เพื่อปิด)' : 'ปิดไมค์แล้ว'
    });
}
window.toggleMic = toggleMic;

function updateMicHudButton() {
    const btn = $('hud-voice');
    if (btn) btn.classList.toggle('mic-on', micOn);
    const label = $('hud-voice-label');
    if (label) label.innerText = micOn ? 'ไมค์: เปิด' : 'ไมค์';
}

function updateVoiceIndicator() {
    const el = $('chat-voice-indicator');
    if (!el) return;
    const count = Object.values(remoteMicOn).filter(Boolean).length + (micOn ? 1 : 0);
    el.innerText = count > 0 ? `🎙️ ${count}` : '';
}

// ============================================================
// 11.7 LIVE PLANT DATA STRIP — ตัวเลขโรงงานเรียลไทม์ใต้จอ 3D
// ใช้ feed 'plant_update' เดียวกับหน้า Metaverse/Analytics — ทุกจอเห็นเลขเดียวกัน
// ============================================================
// ---------- เก็บ/ดึงแผงข้าง — เคลียร์จอ 3D ให้โล่งเมื่อไม่ต้องใช้เครื่องมือ ----------
function toggleSideCol(side) {
    const col = $(side === 'left' ? 'left-col' : 'right-col');
    const btn = $(side === 'left' ? 'toggle-left-col' : 'toggle-right-col');
    if (!col) return;
    const wasHidden = col.style.display === 'none';
    col.style.display = wasHidden ? '' : 'none';
    if (btn) {
        // ลูกศรชี้ทิศที่แผงจะ "เคลื่อนไป" เมื่อกด: ซ้ายเปิดอยู่ = ◂ (เก็บออกซ้าย)
        btn.innerText = side === 'left' ? (wasHidden ? '◂' : '▸') : (wasHidden ? '▸' : '◂');
    }
    localStorage.setItem('aec_col_' + side, wasHidden ? 'show' : 'hide');
    // คอลัมน์เปลี่ยนขนาด -> ต้องคำนวณ canvas/กล้องใหม่ (handler เดิมฟัง resize อยู่แล้ว)
    window.dispatchEvent(new Event('resize'));
}
window.toggleSideCol = toggleSideCol;
['left', 'right'].forEach(s => { if (localStorage.getItem('aec_col_' + s) === 'hide') toggleSideCol(s); });

// ---------- โหมดเต็มจอ ----------
function toggleFullscreen() {
    if (document.fullscreenElement) {
        document.exitFullscreen();
    } else {
        document.documentElement.requestFullscreen().catch(() => {
            mpAppendChat({ name: 'ระบบ', color: '#ef4444', text: 'เบราว์เซอร์ไม่อนุญาตโหมดเต็มจอในหน้านี้' });
        });
    }
}
window.toggleFullscreen = toggleFullscreen;

// ย่อ/ขยายแถบข้อมูล — จำสถานะไว้ข้ามเซสชัน (ค่าเริ่มต้น: ย่อ ไม่บังฉาก)
function toggleDock() {
    const dock = $('plant-dock');
    if (!dock) return;
    dock.classList.toggle('collapsed');
    const arrow = $('dock-toggle-arrow');
    if (arrow) arrow.innerText = dock.classList.contains('collapsed') ? '▴' : '▾';
    localStorage.setItem('aec_dock_expanded', dock.classList.contains('collapsed') ? 'no' : 'yes');
}
window.toggleDock = toggleDock;
if (localStorage.getItem('aec_dock_expanded') === 'yes') toggleDock();

const prevPlantVals = {};
function updatePlantStrip(data) {
    if (!data || !data.plant) return;
    const setVal = (id, val, unit, prevKey) => {
        const el = $(id); if (!el) return;
        el.innerText = val + unit;
        const deltaEl = $(id + '-delta');
        if (deltaEl) {
            const prev = prevPlantVals[prevKey];
            if (prev !== undefined && prev !== val) {
                const diff = val - prev;
                deltaEl.innerText = (diff >= 0 ? '▲' : '▼') + Math.abs(diff).toFixed(1);
                deltaEl.className = 'strip-delta ' + (diff >= 0 ? 'up' : 'down');
            }
            prevPlantVals[prevKey] = val;
        }
    };
    setVal('strip-ch4', data.plant.ch4Percent, ' %', 'ch4');
    setVal('strip-flow', data.plant.flowRate, ' m³/h', 'flow');
    setVal('strip-eff', data.plant.efficiency, ' %', 'eff');

    // Selected Equipment: TANK-01 (ค่าจริงจาก feed เดียวกับหน้า Metaverse เดิม)
    if (data.tank1) {
        const t = data.tank1;
        const set = (id, txt) => { const el = $(id); if (el) el.innerText = txt; };
        set('dock-tank-pressure', t.pressure + ' bar');
        set('dock-tank-temp', t.temperature + ' °C');
        set('dock-tank-ph', String(t.ph));
        set('dock-tank-level', t.level.toLocaleString() + ' m³');
    }

    if (Array.isArray(data.alerts)) {
        const critical = data.alerts.some(a => a.level === 'critical');
        const warning = data.alerts.some(a => a.level === 'warning');
        const level = critical ? 'crit' : warning ? 'warn' : 'ok';

        // สถานะ TANK-01 (ใช้เกณฑ์เดียวกับหน้า Metaverse เดิม)
        const tankBadge = $('dock-tank-badge');
        if (tankBadge) {
            tankBadge.innerText = critical ? 'Critical' : warning ? 'Warning' : 'Normal';
            tankBadge.className = 'dock-badge ' + level;
        }

        const activeCount = data.alerts.filter(a => a.level !== 'normal').length;
        const cnt = $('dock-alert-count');
        if (cnt) {
            cnt.innerText = activeCount > 0 ? activeCount : '✓';
            cnt.className = 'dock-badge ' + level;
        }
        const topEl = $('dock-alert-top');
        if (topEl) topEl.innerText = activeCount > 0 ? data.alerts[0].tag : 'All Systems Normal';
        const list = $('dock-alerts-list');
        if (list) {
            list.innerHTML = '';
            data.alerts.forEach(a => {
                const cls = a.level === 'critical' ? 'crit' : a.level === 'warning' ? 'warn' : 'ok';
                const label = a.level === 'critical' ? 'Critical' : a.level === 'warning' ? 'Warning' : 'Normal';
                const row = document.createElement('div');
                row.className = 'dock-alert-row ' + cls;
                const tag = document.createElement('span');
                tag.innerText = '⚠ ' + a.tag;
                const lv = document.createElement('span');
                lv.className = 'dock-badge ' + cls;
                lv.innerText = label;
                row.appendChild(tag); row.appendChild(lv);
                list.appendChild(row);
            });
        }
    }
}

applyChatVoicePrefs();

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
    // แชร์ให้ทุกคนในห้องเสมอ (เดิมจำกัดเฉพาะ admin — ขัดกับการอัปโหลดโมเดลตรง
    // ที่เปิดให้ทุกคนอยู่แล้ว ทำให้คนอื่นมองไม่เห็นฉากที่โหลดจากไฟล์เซฟ)
    if (!mpSocket || !mpSocket.connected) return;
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
    if (modelLocked) { mpAppendChat({ name: '🔒 ระบบ', color: '#f59e0b', text: 'โมเดลถูกล็อกอยู่ — ปลดล็อกก่อนจึงจะลบได้ (กันลบพลาด)' }); return; }
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
    // ปุ่มลบโผล่เฉพาะ Admin ที่ปลดล็อกโมเดลแล้วเท่านั้น — ตอนล็อกอยู่ห้ามลบ
    const shouldShow = !!factoryModel && isAdmin && !modelLocked;
    if ((btn.style.display !== 'none') !== shouldShow) btn.style.display = shouldShow ? 'block' : 'none';
}, 500);

// ============================================================
// 13.9 WORLD LOBBY — หน้าจอก่อนเข้าโลก (โลโก้ + ตั้งชื่อเล่น + ปุ่ม Start)
// ระหว่างอยู่หน้านี้กล้องจะวนรอบแผนที่ให้ดูก่อน แล้วค่อยส่งการควบคุมให้ผู้เล่น
// โหมด viewer (Digital Twin) ไม่มีตัวละคร จึงไม่ต้องมีล็อบบี้
// ============================================================
let lobbyActive = !VIEWER_MODE;
let lobbyAngle = 0;

if (lobbyActive) controls.enabled = false; // กัน OrbitControls แย่งคุมกล้องระหว่างวนชมแผนที่
else { const el = $('world-lobby'); if (el) el.style.display = 'none'; }

function lobbyOrbitTick() {
    lobbyAngle += 0.0018;
    const target = new THREE.Vector3(0, 2, 0);
    let radius = 26;
    if (factoryModel) {
        const box = new THREE.Box3().setFromObject(factoryModel);
        const size = box.getSize(new THREE.Vector3());
        box.getCenter(target);
        radius = Math.max(size.x, size.z) * 0.85 + 10;
    }
    camera.position.set(
        target.x + Math.cos(lobbyAngle) * radius,
        target.y + radius * 0.45,
        target.z + Math.sin(lobbyAngle) * radius
    );
    camera.lookAt(target);
    controls.target.copy(target);
}

function setLobbyStatus(text) { const el = $('lobby-status'); if (el) el.textContent = text; }

async function startWorld() {
    const btn = $('lobby-start');
    if (btn) btn.disabled = true;
    const nick = ($('lobby-nickname')?.value || '').trim().slice(0, 20);

    if (nick) {
        // 1) เปลี่ยนชื่อในโลกทันทีผ่าน socket — ไม่ต้องรอ Supabase และไม่ต้องต่อใหม่
        if (mpSocket && mpSocket.connected) mpSocket.emit('set_nickname', nick);
        // 2) เก็บลงบัญชีไว้ให้ครั้งหน้าเข้ามาก็ยังเป็นชื่อนี้ (ล้มเหลวก็ไม่เป็นไร ชื่อในโลกเปลี่ยนไปแล้ว)
        try {
            if (typeof supabaseClient !== 'undefined') {
                await supabaseClient.auth.updateUser({ data: { display_name: nick } });
            }
        } catch (err) {
            console.warn('[LOBBY] จำชื่อเล่นไว้ในบัญชีไม่สำเร็จ:', err);
        }
    }

    lobbyActive = false;
    controls.enabled = (viewMode === 'third'); // เคารพมุมกล้องที่เลือกไว้ ไม่ใช่เปิดลากกล้องเสมอ
    resetCameraToAvatar();

    const lobby = $('world-lobby');
    if (lobby) {
        lobby.classList.add('lobby-hidden');
        setTimeout(() => { lobby.style.display = 'none'; }, 600);
    }
}
$('lobby-start')?.addEventListener('click', startWorld);
$('lobby-nickname')?.addEventListener('keydown', e => { if (e.key === 'Enter') startWorld(); });

// ============================================================
// 14. MAIN LOOP — เรียกทุกระบบผ่าน safeCall() กัน error หนึ่งจุดลากทั้งเฟรมพัง
// ============================================================
function updateAvatarPhysics() {
    // อยู่หน้าล็อบบี้ -> กล้องหมุนชมแผนที่ไปเรื่อยๆ ยังไม่ส่งคุมให้ผู้เล่น
    if (lobbyActive) { lobbyOrbitTick(); return; }
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

    groundRayFrame++;
    if (groundRayFrame % GROUND_RAY_THROTTLE === 0) updateDynamicGroundY();
    const effectiveGroundY = dynamicGroundY !== null ? dynamicGroundY : jumpConfig.groundY;

    if (jumpConfig.isJumping) {
        avatarModel.position.y += jumpConfig.velocity;
        jumpConfig.velocity += jumpConfig.gravity;
        if (avatarModel.position.y <= effectiveGroundY) { avatarModel.position.y = effectiveGroundY; jumpConfig.isJumping = false; }
    } else if (Math.abs(avatarModel.position.y - effectiveGroundY) > 0.02) {
        // ไล่ตามพื้นแบบนุ่มนวล (ขึ้นบันได/ทางลาด หรือร่วงตกจากขอบพื้นต่างระดับ) แทนสแนปทันที
        avatarModel.position.y += (effectiveGroundY - avatarModel.position.y) * 0.25;
    } else {
        avatarModel.position.y = effectiveGroundY;
    }

    if (autoWalk.active) {
        const dx = autoWalk.targetX - avatarModel.position.x;
        const dz = autoWalk.targetZ - avatarModel.position.z;
        const dist = Math.hypot(dx, dz);
        if (dist < AUTO_WALK_STOP_DIST) {
            cancelAutoWalk();
        } else {
            const targetAngle = Math.atan2(-dx, -dz);
            let angleDiff = targetAngle - avatarModel.rotation.y;
            angleDiff = Math.atan2(Math.sin(angleDiff), Math.cos(angleDiff)); // normalize -pi..pi
            avatarModel.rotation.y += Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), avatarConfig.turnSpeed);
            moveStatus.left = moveStatus.right = moveStatus.backward = false;
            moveStatus.forward = Math.abs(angleDiff) < AUTO_WALK_TURN_ONLY_ANGLE;
            updateWalkArrowHud(dist, angleDiff);
        }
    }

    if (moveStatus.left) avatarModel.rotation.y += avatarConfig.turnSpeed;
    if (moveStatus.right) avatarModel.rotation.y -= avatarConfig.turnSpeed;

    const moveVector = new THREE.Vector3(0, 0, 0);
    if (moveStatus.forward) moveVector.z = -avatarConfig.speed;
    if (moveStatus.backward) moveVector.z = avatarConfig.speed;
    moveVector.applyQuaternion(avatarModel.quaternion);

    const isMoving = moveVector.lengthSq() > 0;
    updateAvatarMotion(avatarModel, isMoving);

    if (isMoving) {
        const nextX = avatarModel.position.x + moveVector.x;
        const nextZ = avatarModel.position.z + moveVector.z;
        const currentY = avatarModel.position.y - (groundFootOffset !== null ? groundFootOffset : jumpConfig.groundY);
        avatarModel.position.x = nextX;
        avatarModel.position.z = nextZ;
        checkWalkCollision(nextX, nextZ, currentY);
    }

    applyCameraForViewMode();
}

// ============================================================
// 13.95 VIEW MODES — 3D View / Top View / First Person
// สลับจากแท็บบนหน้า Dashboard (ส่งเข้ามาทาง postMessage เพราะโลก 3D อยู่ใน iframe)
// ============================================================
let viewMode = 'third'; // third = กล้องตามหลังตัวละคร (ค่าเริ่มต้นเดิม)
const FIRST_PERSON_EYE = 1.55; // ความสูงระดับสายตาของตัวละคร

function applyCameraForViewMode() {
    if (!avatarModel) return;
    const sf = currentModelScaleFactor();

    if (viewMode === 'first') {
        // มุมมองบุคคลที่หนึ่ง — กล้องอยู่ที่หัวตัวละคร มองไปทางที่ตัวละครหันหน้า
        const eye = new THREE.Vector3(0, FIRST_PERSON_EYE, 0).applyMatrix4(avatarModel.matrixWorld);
        const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(avatarModel.quaternion);
        camera.position.copy(eye);
        controls.target.copy(eye.clone().addScaledVector(forward, 6));
        return;
    }

    if (viewMode === 'top') {
        // มุมมองจากด้านบน — มองลงตรงๆ ที่ตัวละคร (เยื้อง z นิดเดียวกันกล้องพลิกตอนมองดิ่ง 90°)
        const h = 26 * sf;
        camera.position.set(avatarModel.position.x, avatarModel.position.y + h, avatarModel.position.z + 0.01);
        controls.target.set(avatarModel.position.x, avatarModel.position.y, avatarModel.position.z);
        return;
    }

    const targetCamOffset = defaultCameraOffset.clone().applyMatrix4(avatarModel.matrixWorld);
    camera.position.lerp(targetCamOffset, 0.08);
    controls.target.set(avatarModel.position.x, avatarModel.position.y + 0.3, avatarModel.position.z);
}

function setViewMode(mode) {
    if (!['third', 'top', 'first'].includes(mode)) return;
    viewMode = mode;
    // มุมมองบุคคลที่หนึ่งต้องซ่อนร่างตัวเอง ไม่งั้นกล้องจะจมอยู่ในตัวโมเดลจนมองไม่เห็นอะไร
    if (avatarModel) avatarModel.visible = (mode !== 'first');
    // ปล่อยให้ลากหมุนกล้องเองได้เฉพาะโหมด 3D — อีกสองโหมดกล้องถูกล็อกตามตัวละคร
    // ถ้าเปิดไว้ผู้ใช้จะลากแล้วภาพกระตุกเพราะโค้ดเราตั้งตำแหน่งทับทุกเฟรม
    controls.enabled = (mode === 'third') && !lobbyActive;
    if (isFreeLook && mode !== 'third') isFreeLook = false; // Free Look ใช้ร่วมกับสองโหมดนี้ไม่ได้
    applyCameraForViewMode();
    mpAppendChat({
        name: '🎥 มุมกล้อง', color: '#22d3ee',
        text: mode === 'first' ? 'มุมมองบุคคลที่หนึ่ง' : (mode === 'top' ? 'มุมมองจากด้านบน' : 'มุมมอง 3D ตามหลังตัวละคร')
    });
}
window.setViewMode = setViewMode;

// รับคำสั่งสลับมุมกล้องจากหน้าที่ฝัง iframe นี้ไว้ (Dashboard)
window.addEventListener('message', e => {
    if (!e.data || e.data.type !== 'aec_view_mode') return;
    setViewMode(e.data.mode);
});

function animate() {
    requestAnimationFrame(animate);
    frameDt = animClock.getDelta(); // เวลาต่อเฟรมสำหรับ AnimationMixer ของตัวละคร
    safeCall(updateAvatarPhysics, 'updateAvatarPhysics');
    safeCall(updateRemoteAvatars, 'updateRemoteAvatars');
    safeCall(updateProximityTags, 'updateProximityTags');
    safeCall(updateMarkers, 'updateMarkers');
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
