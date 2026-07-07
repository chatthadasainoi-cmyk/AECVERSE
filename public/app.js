// --- 1. SETUP THREE.JS SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f14); // เปลี่ยนสีพื้นหลังให้เข้าธีมดาร์กโหมด

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 6, 12); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
// หาโค้ดตั้งค่า renderer เดิมของคุณ แล้วเพิ่มบรรทัดล่างนี้ต่อท้าย
renderer.setSize(window.innerWidth, window.innerHeight);

// บรรทัดที่ต้องเพิ่ม: จำกัดความละเอียดหน้าจอบนมือถือไม่ให้เกิน 1.5 หรือ 2 เท่า 
// มือถือรุ่นใหม่ๆ จอละเอียดเท่าทีวี 4K ถ้าให้ Three.js วาด 3D เต็มความละเอียดจอที่มี 6005 ชิ้นจะกระตุกมาก
// การใส่คำสั่งนี้จะช่วยคุมให้ภาพคมพอดีและลื่นขึ้นแบบก้าวกระโดด
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
document.getElementById('canvas-container').appendChild(renderer.domElement);

const controls = new THREE.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.5; 
controls.maxDistance = 60;  

scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(10, 20, 10);
scene.add(dirLight);

const gridHelper = new THREE.GridHelper(60, 60, 0x00ffff, 0x1e293b);
scene.add(gridHelper);

let factoryModel = null;
let avatarModel = null;
let originalMaterials = new Map();
let currentMaterialMode = 'solid'; 
let initialFactoryScale = 1;

let activeSelectedMeshUUID = null; 
let activeSelectedKeyKey = "default";
let factoryColliders = [];

const moveStatus = { forward: false, backward: false, left: false, right: false };
const avatarConfig = { speed: 0.12, turnSpeed: 0.045, radius: 0.35 };
const jumpConfig = { velocity: 0, gravity: -0.012, jumpForce: 0.24, isJumping: false, groundY: 0.9 };
const defaultCameraOffset = new THREE.Vector3(0, 2.5, 5);

let isFreeLook = false; 
const freeLookSpeed = 0.2; 

// ============================================================
// ระบบ Tag สี 6 กลุ่ม ตามคู่มือ "Interactive Biogas Safety Standard Metaverse"
// แต่ละจุดมี: name (ชื่อโซน), desc (รายละเอียดเต็ม), tagText (ข้อความบนป้าย),
// colorClass (กลุ่มสี), steps (รายการข้อกำหนด PPE/วิศวกรรม)
// ============================================================
const workflowDatabase = {
    "default": {
        "name": "โครงสร้างทั่วไป",
        "desc": "พื้นที่ส่วนสนับสนุนและโครงสร้างทั่วไปภายในสถานประกอบการแก๊สชีวภาพ",
        "tagText": "🛡️ พื้นที่ทั่วไป — โปรดปฏิบัติตามป้ายเตือนใกล้เคียง",
        "colorClass": "tag-blue",
        "steps": ["🛡️ สวมใส่เครื่องตรวจวัดก๊าซรั่วพกพา (4-Gas Detector)", "🔒 ปฏิบัติตามระบบ LOTO อย่างเคร่งครัดก่อนเปิดฝาบำรุงรักษา"]
    },

    // 🔴 แดง — อันตรายร้ายแรง/ข้อห้าม: ปากบ่อแมนโฮล
    "manhole": {
        "name": "ปากบ่อแมนโฮล (Manhole) — หลังคาถังหมัก",
        "desc": "จุดเข้าออกของพื้นที่อับอากาศบนหลังคาถังหมัก ห้ามเปิดหรือเข้าโดยไม่ได้รับอนุญาตจากผู้ควบคุมงานเด็ดขาด",
        "tagText": "⚠️ อันตราย! ที่อับอากาศ ห้ามเข้าโดยไม่ได้รับอนุญาต",
        "colorClass": "tag-red",
        "steps": ["⚠️ พื้นที่อับอากาศอันตรายสูงสุด (Confined Space) ต้องมีใบอนุญาตทำงานเท่านั้น", "🪪 ต้องผ่านการอบรม Confined Space Entry และมีผู้เฝ้าระวัง (Standby Man)", "🚫 ห้ามเปิดฝาแมนโฮลโดยไม่มีการตรวจวัดก๊าซก่อนเข้า"]
    },

    // 🔴 แดง — พื้นที่อันตราย Ex-Zone: โดมผ้าใบ
    "tank": {
        "name": "บ่อหมักและโดมเก็บก๊าซ (Digester Tank)",
        "desc": "ระบบถังหมักแบบ CSTR ปิดคลุมด้วยผ้าใบแรงดันสูง (HDPE Layer) ภายในเป็นพื้นที่ Ex-Zone 0 ที่มีก๊าซไวไฟสะสมตลอดเวลา",
        "tagText": "🔴 EX-ZONE 0: พื้นที่มีก๊าซไวไฟตลอดเวลา ห้ามเกิดประกายไฟเด็ดขาด",
        "colorClass": "tag-red",
        "steps": ["🔴 EX-ZONE 0: ห้ามประกายไฟ อุปกรณ์ไฟฟ้าต้องเป็นชนิด Explosion-Proof", "📏 ระยะร่น 30 เมตรจากแนวเขตที่ดินตามข้อกำหนด", "🧯 ห้ามนำแหล่งกำเนิดประกายไฟทุกชนิดเข้าใกล้พื้นที่"]
    },

    // 🔴 แดง — ข้อห้ามเชิงวิศวกรรม: รอยต่อท่อ PVRV
    "pvrv": {
        "name": "จุดเชื่อมต่อ PVRV (Pressure/Vacuum Relief Valve)",
        "desc": "รอยต่อท่อระหว่างฐานหลังคาบ่อหมักกับอุปกรณ์นิรภัย PVRV ซึ่งเป็นอุปกรณ์ป้องกันแรงดันเกินของระบบ ห้ามมีสิ่งกีดขวางทางออกของก๊าซเด็ดขาด",
        "tagText": "❌ ห้ามติดตั้งวาล์วปิดกั้น (Isolation Valve) คั่นกลางบ่อหมักกับ PVRV โดยเด็ดขาด!",
        "colorClass": "tag-red",
        "steps": ["❌ ห้ามปิดวาล์วทางออกระหว่างโดมหมักกับอุปกรณ์นิรภัย PVRV เด็ดขาด", "🔍 ตรวจสอบ PVRV ตามรอบบำรุงรักษาเพื่อป้องกันการอุดตัน", "📋 บันทึกผลตรวจสอบทุกครั้งลงในใบ Checklist"]
    },

    // 🟠 ส้ม/เหลือง — Process Safety: Flame Arrester
    "flame_arrester": {
        "name": "Flame Arrester — จุดดักเปลวไฟย้อนกลับ",
        "desc": "อุปกรณ์ป้องกันเปลวไฟย้อนกลับเข้าสู่ระบบ ติดตั้งก่อนเข้าหอเผาก๊าซและเครื่องยนต์ ต้องบำรุงรักษาสม่ำเสมอเพื่อป้องกันการอุดตัน",
        "tagText": "🔥 Flame Arrester: ป้องกันเปลวไฟย้อนกลับ ต้องล้างไส้กรองสม่ำเสมอ",
        "colorClass": "tag-orange",
        "steps": ["🔥 Flame Arrester: อุปกรณ์ดักเปลวไฟย้อนกลับ ต้องถอดล้างไส้กรองตามรอบ", "📅 กำหนดรอบการตรวจสอบและล้างไส้กรองอย่างน้อยทุก 3 เดือน", "🧤 สวมถุงมือกันสารเคมีขณะถอดล้างไส้กรอง"]
    },

    // 🟠 ส้ม/เหลือง — ระบบท่อ
    "pipe": {
        "name": "ระบบท่อส่งแก๊สชีวภาพ (Biogas Piping)",
        "desc": "แนวเส้นท่อสำหรับส่งผ่านก๊าซมีเทนดิบผ่านจุดดักน้ำและชุดกรองเพื่อเตรียมใช้งาน ต้องลาดเอียงตามมาตรฐานเพื่อป้องกันน้ำขัง",
        "tagText": "ท่อก๊าซชีวภาพ (Biogas) ➡ [ความลาดเอียง 2% เพื่อดักน้ำ]",
        "colorClass": "tag-orange",
        "steps": ["➡ แนวท่อต้องลาดเอียงไม่น้อยกว่า 2% มุ่งสู่ถังดักน้ำเพื่อป้องกันน้ำขังขวางทางก๊าซ", "🔧 ตรวจสอบจุดเชื่อมต่อท่อไม่ให้มีการรั่วซึมเป็นประจำ", "🟡 ทาสีท่อก๊าซชีวภาพเป็นสีเหลืองตามมาตรฐานเพื่อความชัดเจน"]
    },

    // 🟠 ส้ม/เหลือง — ระบบกันฟ้าผ่า
    "lightning_rod": {
        "name": "เสาล่อฟ้าแบบแยกอิสระ",
        "desc": "ระบบป้องกันฟ้าผ่าที่ติดตั้งแยกอิสระจากโครงสร้างถังหมัก ต้องครอบคลุมรัศมีป้องกันโดมก๊าซได้ทั้งหมด 100%",
        "tagText": "⚡ เสาล่อฟ้าแบบแยกอิสระ (ครอบคลุมโดมก๊าซ 100%)",
        "colorClass": "tag-orange",
        "steps": ["⚡ เสาล่อฟ้าต้องคลุมรัศมีโดมเก็บก๊าซทั้งหมด 100%", "🔌 ตรวจสอบค่าความต้านทานดิน (Grounding) ตามรอบประจำปี", "📏 ระยะห่างจากโดมก๊าซต้องเป็นไปตามมาตรฐานป้องกันฟ้าผ่า"]
    },

    // 🔵 ฟ้า — ข้อบังคับ LOTO
    "loto": {
        "name": "จุดทำ LOTO — ตู้ควบคุมไฟฟ้าหลัก (MCC)",
        "desc": "จุดติดตั้งระบบ Lockout/Tagout บริเวณหน้าตู้ควบคุมไฟฟ้าหลัก (MCC) และพวงมาลัยวาล์วก๊าซหลัก ต้องคล้องกุญแจทุกครั้งก่อนซ่อมบำรุง",
        "tagText": "🔒 จุดทำ LOTO: คล้องกุญแจและแขวนป้ายก่อนซ่อมบำรุง",
        "colorClass": "tag-blue",
        "steps": ["🔒 คล้องกุญแจ Lockout และแขวนป้าย Tagout ก่อนเริ่มงานซ่อมบำรุงทุกครั้ง", "🪪 ผู้ปฏิบัติงานต้องถือกุญแจส่วนตัวเท่านั้น ห้ามใช้กุญแจร่วมกัน", "✅ ตรวจสอบศูนย์พลังงานเป็นศูนย์ (Zero Energy) ก่อนเริ่มงาน"]
    },

    // 🔵 ฟ้า — ข้อบังคับ PPE
    "ppe_checkpoint": {
        "name": "จุดตรวจ PPE — ทางเข้าลานบ่อหมัก",
        "desc": "จุดตรวจสอบอุปกรณ์ป้องกันส่วนบุคคลก่อนเข้าพื้นที่ปฏิบัติงาน บริเวณหน้าประตูทางเข้าลานบ่อหมักและอาคารเครื่องยนต์",
        "tagText": "🛡️ สวมใส่เครื่องวัดก๊าซพกพา (4-Gas Detector) ก่อนเข้าพื้นที่",
        "colorClass": "tag-blue",
        "steps": ["🛡️ สวมใส่เครื่องตรวจวัดก๊าซรั่วพกพา (4-Gas Detector) ก่อนเข้าพื้นที่ทุกครั้ง", "🥾 สวมรองเท้านิรภัยและหมวกนิรภัยตลอดเวลาที่อยู่ในพื้นที่", "👓 สวมแว่นตานิรภัยเมื่อปฏิบัติงานใกล้อุปกรณ์แรงดัน"]
    },

    // 🟢 เขียว — ฉุกเฉิน ESD
    "esd": {
        "name": "ปุ่มหยุดฉุกเฉิน (ESD) — หน้าอาคารเครื่องยนต์",
        "desc": "ปุ่มฉุกเฉินสีแดงติดตั้งหน้าอาคารเครื่องยนต์ ใช้สำหรับตัดการทำงานของเครื่องยนต์และวาล์วทันทีในกรณีฉุกเฉิน",
        "tagText": "🚨 ESD Button: กดเพื่อตัดการทำงานเครื่องยนต์และวาล์วทันที",
        "colorClass": "tag-green",
        "steps": ["🚨 ติดตั้งปุ่มหยุดฉุกเฉิน (ESD) นอกห้องเครื่องยนต์ในตำแหน่งเข้าถึงง่าย", "🔴 ทดสอบการทำงานของปุ่ม ESD ตามรอบที่กำหนด", "📢 ผู้ปฏิบัติงานทุกคนต้องทราบตำแหน่งปุ่ม ESD ใกล้ที่สุด"]
    },

    // 🟢 เขียว — ระยะปลอดภัย เครื่องยนต์
    "utilization": {
        "name": "ระบบใช้ประโยชน์ก๊าซ & เครื่องยนต์ (Genset)",
        "desc": "อาคารติดตั้งเครื่องยนต์ผลิตกระแสไฟฟ้าจากก๊าซชีวภาพและแผงควบคุมไฟแรงดันสูง ต้องอยู่ห่างจากบ่อหมักตามระยะที่กำหนด",
        "tagText": "📏 ระยะห่างเครื่องยนต์: ต้องห่างจากบ่อหมักอย่างน้อย 15 เมตร",
        "colorClass": "tag-green",
        "steps": ["📏 ระยะห่างอาคารเครื่องกำเนิดไฟฟ้าต้องอยู่ห่างบ่อหมักไม่น้อยกว่า 15 เมตร", "🔒 ตัดสับคัตเอาต์พร้อมลงกลอน Lockout/Tagout ก่อนเอื้อมมือซ่อมห้องเครื่อง", "🔇 ติดตั้งระบบลดเสียงดังตามมาตรฐานความปลอดภัยในการทำงาน"]
    },

    // 🟢 เขียว — ระยะปลอดภัย Flare
    "flare": {
        "name": "หอเผาก๊าซทิ้งฉุกเฉิน (Enclosed Flare)",
        "desc": "ระบบเผาทำลายก๊าซชีวภาพส่วนเกินอัตโนมัติ เพื่อป้องกันแรงดันสะสมในระบบมากเกินไป ต้องตั้งห่างจากอาคารหรือถนนสาธารณะตามระยะที่กำหนด",
        "tagText": "📏 ระยะปลอดภัย: หอเผาก๊าซต้องห่างอาคาร/ถนนอย่างน้อย 7.5 เมตร",
        "colorClass": "tag-green",
        "steps": ["📏 ตัวหอเผาต้องเว้นระยะห่างอย่างปลอดภัยจากถนนและอาคารอื่นไม่ต่ำกว่า 7.5 เมตร", "🔥 ชุดหัวจุดประกายไฟต้องเชื่อมระบบอัตโนมัติกับเซนเซอร์วัดแรงดันบ่อหมัก", "🌡️ ตรวจสอบอุณหภูมิการเผาไหม้ให้สมบูรณ์ตามมาตรฐานสิ่งแวดล้อม"]
    }
};

// --- 2. AVATAR วิศวกร Low-poly หันหลังให้กล้องเสมอ ---
function createEngineerAvatar(helmetColor) {
    const group = new THREE.Group();
    const hex = helmetColor ? parseInt(String(helmetColor).replace('#',''), 16) : 0xff9900;

    const skinMat   = new THREE.MeshStandardMaterial({ color: 0xf4c08a, roughness: 0.8 });
    const suitMat   = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.6 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3, metalness: 0.4 });
    const bootMat   = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const glassMat  = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 });
    const visibMat  = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.5 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), suitMat);
    torso.position.y = 0.95; group.add(torso);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.31), visibMat);
    stripe.position.y = 0.95; group.add(stripe);

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.35), skinMat);
    head.position.y = 1.44; group.add(head);

    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.41), helmetMat);
    helmet.position.y = 1.65; group.add(helmet);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.48), helmetMat);
    brim.position.y = 1.56; group.add(brim);

    // วีซอร์อยู่ด้าน -Z (ด้านหน้าตัวละคร) — กล้องอยู่ +Z จะเห็นด้านหลังหมวกพอดี
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), glassMat);
    visor.position.set(0, 1.43, -0.178); group.add(visor);

    const armGeo = new THREE.BoxGeometry(0.18, 0.52, 0.2);
    const armL = new THREE.Mesh(armGeo, suitMat); armL.position.set(-0.37, 0.88, 0); group.add(armL);
    const armR = new THREE.Mesh(armGeo, suitMat); armR.position.set( 0.37, 0.88, 0); group.add(armR);
    const asL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.06, 0.21), visibMat); asL.position.set(-0.37, 0.88, 0); group.add(asL);
    const asR = asL.clone(); asR.position.set(0.37, 0.88, 0); group.add(asR);

    const handGeo = new THREE.BoxGeometry(0.14, 0.13, 0.13);
    const handL = new THREE.Mesh(handGeo, skinMat); handL.position.set(-0.37, 0.6, 0); group.add(handL);
    const handR = handL.clone(); handR.position.set(0.37, 0.6, 0); group.add(handR);

    const legGeo = new THREE.BoxGeometry(0.22, 0.52, 0.24);
    const legL = new THREE.Mesh(legGeo, suitMat); legL.position.set(-0.15, 0.34, 0); group.add(legL);
    const legR = new THREE.Mesh(legGeo, suitMat); legR.position.set( 0.15, 0.34, 0); group.add(legR);

    const bootGeo = new THREE.BoxGeometry(0.24, 0.16, 0.3);
    const bootL = new THREE.Mesh(bootGeo, bootMat); bootL.position.set(-0.15, 0.05, -0.03); group.add(bootL);
    const bootR = bootL.clone(); bootR.position.set(0.15, 0.05, -0.03); group.add(bootR);

    // ลูกศรบอกทิศ ชี้ไปด้าน -Z (ด้านหน้าตัวละคร)
    const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.3), new THREE.MeshBasicMaterial({color:0x00ffff}));
    ptr.position.set(0, 0.9, -0.5); group.add(ptr);

    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3,16), new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.2}));
    shadow.rotation.x = -Math.PI/2; shadow.position.y = 0.01; group.add(shadow);

    group.userData.armL = armL;
    group.userData.armR = armR;
    group.userData.legL = legL;
    group.userData.legR = legR;
    group.userData.walkPhase = 0;

    return group;
}

function animateEngineerWalk(g, isMoving) {
    if (!g || !g.userData.armL) return;
    if (isMoving) g.userData.walkPhase += 0.12;
    else g.userData.walkPhase *= 0.8;
    const s = Math.sin(g.userData.walkPhase) * 0.4;
    g.userData.armL.rotation.x =  s;
    g.userData.armR.rotation.x = -s;
    g.userData.legL.rotation.x = -s;
    g.userData.legR.rotation.x =  s;
}

function createProceduralAvatar() {
    const avatarGroup = createEngineerAvatar('#ff9900');
    avatarGroup.position.set(0, jumpConfig.groundY, 8);
    scene.add(avatarGroup);
    avatarModel = avatarGroup;
    document.getElementById('transform-panel').style.display = 'block'; 
}

createProceduralAvatar();

function getLoaderForFile(fileName) {
    const ext = fileName.split('.').pop().toLowerCase();
    return (ext === 'fbx') ? new THREE.FBXLoader() : new THREE.GLTFLoader();
}

function togglePanelElement(elementId) {
    const targetEl = document.getElementById(elementId);
    if (targetEl) targetEl.style.display = (targetEl.style.display === 'none') ? 'block' : 'none';
}

function triggerAvatarJump() {
    if (avatarModel && !jumpConfig.isJumping) {
        jumpConfig.velocity = jumpConfig.jumpForce;
        jumpConfig.isJumping = true;
    }
}

// --- 3. FACTORY FILE LOADER ---
document.getElementById('factory-input').addEventListener('change', function (event) {
    const files = event.target.files;
    if (files.length === 0) return;
    document.getElementById('factory-status').innerText = 'กำลังประมวลผลโครงสร้างโรงงาน...';

    let modelFile = null; const textureFiles = {};
    for (let i = 0; i < files.length; i++) {
        const file = files[i]; const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'gltf' || ext === 'glb' || ext === 'fbx') modelFile = file;
        else if (ext === 'jpg' || ext === 'png') textureFiles[file.name] = file;
    }
    if (!modelFile) { document.getElementById('factory-status').innerText = '❌ ผิดพลาด: ไม่พบไฟล์ 3D หลัก'; return; }

    if (factoryModel) { scene.remove(factoryModel); originalMaterials.clear(); factoryColliders = []; }

    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
        const baseName = url.split('/').pop();
        if (textureFiles[baseName]) return URL.createObjectURL(textureFiles[baseName]);
        return url;
    });

    const loader = getLoaderForFile(modelFile.name);
    loader.load(URL.createObjectURL(modelFile), function (loadedObject) {
        factoryModel = loadedObject.scene ? loadedObject.scene : loadedObject;
        
        let meshCount = 0;
        const container = document.getElementById('mesh-container');
        container.innerHTML = '';

        let uploadedTexture = null;
        const texKeys = Object.keys(textureFiles);
        if (texKeys.length > 0) uploadedTexture = new THREE.TextureLoader().load(URL.createObjectURL(textureFiles[texKeys[0]]));

        factoryModel.traverse(function (child) {
            if (child.isMesh) {
                meshCount++;
                originalMaterials.set(child.uuid, child.material.clone());
                if (uploadedTexture) { child.material.map = uploadedTexture; child.material.needsUpdate = true; }
                if (!child._original3DName) { child._original3DName = child.name || `Object_${meshCount}`; }

                const item = document.createElement('div');
                item.className = 'mesh-item';
                const mName = child.name || child._original3DName;
                item.innerText = `🏭 ${mName}`;
                item.id = `mesh-item-${child.uuid}`; 
                item.addEventListener('click', () => { highlightAndShowWorkflow(child, mName, "คลิกเลือกโมเดล"); });
                container.appendChild(item);
            }
        });

        document.getElementById('model-meta').innerHTML = `<span class="info-tag">ตรวจพบชิ้นส่วน: ${meshCount} รายการ</span>`;
        document.getElementById('details-panel').style.display = 'block';

        const box = new THREE.Box3().setFromObject(factoryModel);
        const size = box.getSize(new THREE.Vector3());
        initialFactoryScale = 12 / Math.max(size.x, size.y, size.z);
        factoryModel.scale.set(initialFactoryScale, initialFactoryScale, initialFactoryScale);
        
        const center = box.getCenter(new THREE.Vector3());
        factoryModel.position.set(-center.x * initialFactoryScale, 0, -center.z * initialFactoryScale);

        scene.add(factoryModel);
        document.getElementById('factory-status').innerText = `✓ โหลดสำเร็จ: ${modelFile.name}`;
        
        buildColliders();
        setFactoryMaterialMode(currentMaterialMode);
        syncSlidersWithModel();
    });
});

// 💡 HITBOX ปรับใหม่: ขยาย collider ให้ใหญ่กว่าตัว mesh จริง (padding) เพื่อให้ชนง่ายขึ้น ไม่ต้องตามขนาดโมเดลเป๊ะๆ
const HITBOX_PADDING = 0.6; // ขยายกล่องชนออกทุกด้านเพิ่ม 0.6 หน่วย
function buildColliders() {
    factoryColliders = [];
    if (!factoryModel) return;
    factoryModel.updateMatrixWorld(true);
    factoryModel.traverse(function (child) {
        if (child.isMesh) {
            const meshBox = new THREE.Box3().setFromObject(child);
            // ขยาย hitbox ออกทุกทิศทาง ทำให้ตัวละครชนได้ง่ายขึ้นแม้โมเดลจะเล็กหรือบาง
            meshBox.expandByScalar(HITBOX_PADDING);
            factoryColliders.push({ uuid: child.uuid, mesh: child, box: meshBox });
        }
    });
}

function resetCameraToAvatar() {
    if (!avatarModel) return;
    const targetOffset = defaultCameraOffset.clone().applyMatrix4(avatarModel.matrixWorld);
    camera.position.copy(targetOffset);
    controls.target.set(avatarModel.position.x, avatarModel.position.y + 0.6, avatarModel.position.z);
    controls.update();
}

// --- 4. KEYBOARD CONTROL ---
window.addEventListener('keydown', (e) => {
    if(document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    const key = e.key.toLowerCase();
    
    if (key === 'f' || key === 'ด') {
        isFreeLook = !isFreeLook;
        if (!isFreeLook) {
            resetCameraToAvatar();
        }
        mpAppendChat({
            name: 'ระบบกล้อง', 
            color: '#00ffff', 
            text: isFreeLook ? '🎥 โหมด Free Look (ใช้ W A S D / ไ ฟ ห ก บินกล้องอิสระ)' : '👤 กลับสู่โหมดติดตามตัวละคร'
        });
        return;
    }

    if (e.key === 'ArrowUp' || key === 'w' || key === 'ฟ' || key === 'ไ') moveStatus.forward = true;
    if (e.key === 'ArrowDown' || key === 's' || key === 'ห') moveStatus.backward = true;
    if (e.key === 'ArrowLeft' || key === 'a' || key === 'ฟ' || key === 'ภ' || key === 'ไ') moveStatus.left = true;
    if (e.key === 'ArrowRight' || key === 'd' || key === 'ด' || key === 'ก') moveStatus.right = true;
    
    if (e.key === ' ' && !jumpConfig.isJumping && !isFreeLook) triggerAvatarJump();

    if (key === 'h' || key === 'อ') togglePanelElement('dashboard');
    if (key === 'm' || key === 'ท') togglePanelElement('details-panel');
    if (key === 'p' || key === 'ย') togglePanelElement('process-panel');
    if (key === 't' || key === 'ะ') togglePanelElement('transform-panel');
    if (key === 'r' || key === 'พ') resetCameraToAvatar();
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (e.key === 'ArrowUp' || key === 'w' || key === 'ฟ' || key === 'ไ') moveStatus.forward = false;
    if (e.key === 'ArrowDown' || key === 's' || key === 'ห') moveStatus.backward = false;
    if (e.key === 'ArrowLeft' || key === 'a' || key === 'ฟ' || key === 'ภ' || key === 'ไ') moveStatus.left = false;
    if (e.key === 'ArrowRight' || key === 'd' || key === 'ด' || key === 'ก') moveStatus.right = false;
});

// --- 5. IOT & DATA SIMULATION ---
function loopIotSimulation() {
    if(!activeSelectedMeshUUID) return;
    let pressureVal = 0, tempVal = 25.0;

    if (activeSelectedKeyKey === "pipe") {
        pressureVal = 1.5 + Math.random() * 0.5; tempVal = 31.2 + Math.random() * 1.5;
        document.getElementById('iot-pressure').innerText = pressureVal.toFixed(2) + " bar";
        document.getElementById('iot-temp').innerText = tempVal.toFixed(1) + " °C";
    } else if (activeSelectedKeyKey === "tank") {
        pressureVal = 0.04 + Math.random() * 0.03; tempVal = 37.5 + Math.random() * 0.8;
        document.getElementById('iot-pressure').innerText = pressureVal.toFixed(3) + " bar";
        document.getElementById('iot-temp').innerText = tempVal.toFixed(1) + " °C";
    } else {
        document.getElementById('iot-pressure').innerText = "0.00 bar";
        document.getElementById('iot-temp').innerText = "28.5 °C";
    }
}
setInterval(loopIotSimulation, 1500); 

function exportWorkflowDatabase() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(workflowDatabase, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "biogas_safety_db.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click(); downloadAnchor.remove();
}

function syncSlidersWithModel() {
    if (!factoryModel) return;
    document.getElementById('param-posX').value = factoryModel.position.x;
    document.getElementById('param-posY').value = factoryModel.position.y;
    document.getElementById('param-posZ').value = factoryModel.position.z;
    document.getElementById('param-rotY').value = Math.round(factoryModel.rotation.y * (180 / Math.PI));
    document.getElementById('param-scale').value = (factoryModel.scale.x / initialFactoryScale).toFixed(2);
    updateSliderLabels();
}

function updateSliderLabels() {
    document.getElementById('val-posX').innerText = parseFloat(document.getElementById('param-posX').value).toFixed(1);
    document.getElementById('val-posY').innerText = parseFloat(document.getElementById('param-posY').value).toFixed(2);
    document.getElementById('val-posZ').innerText = parseFloat(document.getElementById('param-posZ').value).toFixed(1);
    document.getElementById('val-rotY').innerText = document.getElementById('param-rotY').value + "°";
    document.getElementById('val-scale').innerText = document.getElementById('param-scale').value + "x";
}

['param-posX', 'param-posY', 'param-posZ', 'param-rotY', 'param-scale'].forEach(id => {
    document.getElementById(id).addEventListener('input', () => {
        if (!factoryModel) return;
        const px = parseFloat(document.getElementById('param-posX').value);
        const py = parseFloat(document.getElementById('param-posY').value);
        const pz = parseFloat(document.getElementById('param-posZ').value);
        const ry = parseFloat(document.getElementById('param-rotY').value) * (Math.PI / 180);
        const sc = parseFloat(document.getElementById('param-scale').value);

        factoryModel.position.set(px, py, pz);
        factoryModel.rotation.y = ry;
        factoryModel.scale.set(initialFactoryScale * sc, initialFactoryScale * sc, initialFactoryScale * sc);
        
        updateSliderLabels();
        buildColliders();
    });
});

function setFactoryMaterialMode(mode) {
    currentMaterialMode = mode;
    ['mode-solid', 'mode-wireframe', 'mode-xray'].forEach(m => document.getElementById(m).className = `mode-btn ${m==='mode-'+mode?'active':''}`);
    if (!factoryModel) return;
    factoryModel.traverse(function (child) {
        if (child.isMesh) {
            const origMat = originalMaterials.get(child.uuid);
            if (!origMat) return;
            child.material.dispose();
            if (mode === 'solid') child.material = origMat.clone();
            else if (mode === 'wireframe') child.material = new THREE.MeshStandardMaterial({ color: 0x00ffff, wireframe: true });
            else if (mode === 'xray') child.material = new THREE.MeshStandardMaterial({ color: 0x00aaff, transparent: true, opacity: 0.2, depthWrite: false });
        }
    });
}

// --- 6. WORKFLOW RENDERING ---
function resolveDatabaseKey(targetMesh, fallbackName) {
    const origName = targetMesh._original3DName || targetMesh.name || fallbackName;
    let databaseKey = "default";

    if (workflowDatabase[origName]) databaseKey = origName;
    else if (workflowDatabase[targetMesh.name]) databaseKey = targetMesh.name;
    else if (workflowDatabase[targetMesh.uuid]) databaseKey = targetMesh.uuid;
    else {
        const nameLower = origName.toLowerCase();
        if (nameLower.includes("manhole") || nameLower.includes("แมนโฮล")) databaseKey = "manhole";
        else if (nameLower.includes("pvrv")) databaseKey = "pvrv";
        else if (nameLower.includes("flame") || nameLower.includes("arrester") || nameLower.includes("ดักไฟ")) databaseKey = "flame_arrester";
        else if (nameLower.includes("lightning") || nameLower.includes("ล่อฟ้า") || nameLower.includes("rod")) databaseKey = "lightning_rod";
        else if (nameLower.includes("loto") || nameLower.includes("mcc") || nameLower.includes("ควบคุมไฟฟ้า")) databaseKey = "loto";
        else if (nameLower.includes("ppe") || nameLower.includes("checkpoint") || nameLower.includes("ตรวจ")) databaseKey = "ppe_checkpoint";
        else if (nameLower.includes("esd") || nameLower.includes("ฉุกเฉิน") && nameLower.includes("ปุ่ม")) databaseKey = "esd";
        else if (nameLower.includes("tank") || nameLower.includes("ถัง") || nameLower.includes("บ่อหมัก") || nameLower.includes("digester")) databaseKey = "tank";
        else if (nameLower.includes("pipe") || nameLower.includes("ท่อ") || nameLower.includes("line")) databaseKey = "pipe";
        else if (nameLower.includes("engine") || nameLower.includes("อาคาร") || nameLower.includes("generator") || nameLower.includes("utilization") || nameLower.includes("genset")) databaseKey = "utilization";
        else if (nameLower.includes("flare") || nameLower.includes("เผา")) databaseKey = "flare";
    }
    return databaseKey;
}

function highlightAndShowWorkflow(targetMesh, meshName, method) {
    if(!factoryModel) return;
    activeSelectedMeshUUID = targetMesh.uuid; 

    if (currentMaterialMode === 'solid') {
        factoryModel.traverse(function (child) {
            if (child.isMesh) {
                if (child.uuid === targetMesh.uuid) child.material = new THREE.MeshStandardMaterial({ color: 0x00ffff, emissive: 0x001a1a });
                else if (originalMaterials.has(child.uuid)) child.material = originalMaterials.get(child.uuid).clone();
            }
        });
    }

    const databaseKey = resolveDatabaseKey(targetMesh, meshName);
    activeSelectedKeyKey = databaseKey;

    const matchedData = workflowDatabase[databaseKey] || workflowDatabase["default"];
    renderWorkflowUI(matchedData.name || meshName, matchedData.desc, matchedData.steps, method, matchedData.colorClass || 'tag-blue');
    
    cancelLiveEdit();
    document.getElementById('process-panel').style.display = 'block';
}

function renderWorkflowUI(name, desc, stepsArray, method, colorClass) {
    document.getElementById('process-panel').className = `panel ${colorClass}`;
    document.getElementById('title-container').innerHTML = `<span id="process-title">⚙️ โซน: ${name}</span>`;
    document.getElementById('desc-view-area').innerText = desc;
    document.getElementById('detection-method').innerText = method;

    const stepsContainer = document.getElementById('steps-view-area');
    stepsContainer.innerHTML = '';
    stepsArray.forEach(step => {
        const stepBox = document.createElement('div');
        stepBox.className = 'step-box';
        stepBox.innerHTML = `<span class="badge">REGULATION</span><span>${step}</span>`;
        stepsContainer.appendChild(stepBox);
    });
}

// --- 7. LIVE EDITOR ---
function enableLiveEdit() {
    if (!activeSelectedMeshUUID) return;
    const currentData = workflowDatabase[activeSelectedKeyKey] || workflowDatabase["default"];
    const currentTitleText = document.getElementById('process-title').innerText.replace("⚙️ โซน: ", "");

    document.getElementById('title-container').innerHTML = `
        <input type="text" id="input-edit-title" class="ui-edit-input" style="font-weight:bold;" value="${currentData.name !== "โครงสร้างทั่วไป" ? currentData.name : currentTitleText}">
    `;
    document.getElementById('input-edit-desc').value = currentData.desc;
    document.getElementById('input-edit-steps').value = currentData.steps.join(', ');

    document.getElementById('desc-view-area').style.display = 'none';
    document.getElementById('steps-view-area').style.display = 'none';
    document.getElementById('desc-edit-area').style.display = 'block';
    document.getElementById('steps-edit-area').style.display = 'block';
    document.getElementById('btn-edit-mode').style.display = 'none';
    document.getElementById('edit-actions-group').style.display = 'flex';
}

function saveLiveEdit() {
    if (!activeSelectedMeshUUID) return;
    const newTitle = document.getElementById('input-edit-title').value.trim();
    const newDesc = document.getElementById('input-edit-desc').value.trim();
    const newStepsArray = document.getElementById('input-edit-steps').value.split(',').map(s => s.trim()).filter(s => s.length > 0);

    workflowDatabase[activeSelectedMeshUUID] = { "name": newTitle, "desc": newDesc, "steps": newStepsArray, "colorClass": "tag-blue" };
    activeSelectedKeyKey = activeSelectedMeshUUID;

    if (factoryModel) {
        factoryModel.traverse(function(child) {
            if (child.isMesh && child.uuid === activeSelectedMeshUUID) {
                child.name = newTitle;
                const sideListItem = document.getElementById(`mesh-item-${child.uuid}`);
                if (sideListItem) sideListItem.innerText = `🏭 ${newTitle}`;
            }
        });
    }
    renderWorkflowUI(newTitle, newDesc, newStepsArray, "✏️ บันทึกโดยผู้ใช้", "tag-blue");
    closeLiveEditFields();
}

function cancelLiveEdit() {
    closeLiveEditFields();
    if (activeSelectedMeshUUID) {
        const currentData = workflowDatabase[activeSelectedKeyKey] || workflowDatabase["default"];
        renderWorkflowUI(currentData.name, currentData.desc, currentData.steps, document.getElementById('detection-method').innerText, currentData.colorClass || 'tag-blue');
    }
}

function closeLiveEditFields() {
    document.getElementById('desc-view-area').style.display = 'block';
    document.getElementById('steps-view-area').style.display = 'block';
    document.getElementById('desc-edit-area').style.display = 'none';
    document.getElementById('steps-edit-area').style.display = 'none';
    document.getElementById('btn-edit-mode').style.display = 'block';
    document.getElementById('edit-actions-group').style.display = 'none';
}

// --- 8. AVATAR PHYSICS & COLLISION + FREE LOOK CAMERA ---
function updateAvatarPhysics() {
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

    if (isFreeLook) {
        const camDirection = new THREE.Vector3();
        camera.getWorldDirection(camDirection);
        
        const camRight = new THREE.Vector3();
        camRight.crossVectors(camera.up, camDirection).normalize();

        if (moveStatus.forward) {
            camera.position.addScaledVector(camDirection, freeLookSpeed);
            controls.target.addScaledVector(camDirection, freeLookSpeed);
        }
        if (moveStatus.backward) {
            camera.position.addScaledVector(camDirection, -freeLookSpeed);
            controls.target.addScaledVector(camDirection, -freeLookSpeed);
        }
        if (moveStatus.left) {
            camera.position.addScaledVector(camRight, freeLookSpeed);
            controls.target.addScaledVector(camRight, freeLookSpeed);
        }
        if (moveStatus.right) {
            camera.position.addScaledVector(camRight, -freeLookSpeed);
            controls.target.addScaledVector(camRight, -freeLookSpeed);
        }
        return;
    }

    if (!avatarModel) return;

    if (jumpConfig.isJumping) {
        avatarModel.position.y += jumpConfig.velocity;
        jumpConfig.velocity += jumpConfig.gravity;
        if (avatarModel.position.y <= jumpConfig.groundY) {
            avatarModel.position.y = jumpConfig.groundY;
            jumpConfig.isJumping = false;
        }
    } else {
        if(avatarModel.position.y > jumpConfig.groundY) {
            avatarModel.position.y += jumpConfig.gravity;
            if(avatarModel.position.y < jumpConfig.groundY) avatarModel.position.y = jumpConfig.groundY;
        }
    }

    if (moveStatus.left) avatarModel.rotation.y += avatarConfig.turnSpeed;
    if (moveStatus.right) avatarModel.rotation.y -= avatarConfig.turnSpeed;

    let moveVector = new THREE.Vector3(0, 0, 0);
    if (moveStatus.forward) moveVector.z = -avatarConfig.speed;
    if (moveStatus.backward) moveVector.z = avatarConfig.speed;
    moveVector.applyQuaternion(avatarModel.quaternion);

    const isMoving = moveVector.lengthSq() > 0;
    animateEngineerWalk(avatarModel, isMoving);

    if (isMoving) {
        // 💡 ไม่มีกำแพงกั้นอีกต่อไป — เดินทะลุได้อิสระ
        // แต่ถ้าเดินเข้าไปใน hitbox ของชิ้นส่วนใด จะ trigger แสดง workflow ทันที (ไม่บล็อกการเดิน)
        const nextX = avatarModel.position.x + moveVector.x;
        const nextZ = avatarModel.position.z + moveVector.z;
        const currentY = avatarModel.position.y - jumpConfig.groundY;

        avatarModel.position.x = nextX;
        avatarModel.position.z = nextZ;

        // เช็คว่าชนเข้ากับ hitbox ไหนไหม (เพื่อโชว์ popup ทันทีที่แตะ ไม่ต้องรอ minDistance loop ด้านล่าง)
        for (let i = 0; i < factoryColliders.length; i++) {
            const col = factoryColliders[i];
            const box = col.box;
            if (nextX + avatarConfig.radius > box.min.x && nextX - avatarConfig.radius < box.max.x &&
                nextZ + avatarConfig.radius > box.min.z && nextZ - avatarConfig.radius < box.max.z &&
                currentY < box.max.y && currentY + 1.6 > box.min.y) {
                highlightAndShowWorkflow(col.mesh, col.mesh.name || "พื้นที่อับอากาศ", "🚶 ตัวละครเดินชนวัตถุ");
                break; // โชว์อันแรกที่เจอพอ
            }
        }
    }

    const targetCamOffset = defaultCameraOffset.clone().applyMatrix4(avatarModel.matrixWorld);
    camera.position.lerp(targetCamOffset, 0.08);
    controls.target.set(avatarModel.position.x, avatarModel.position.y + 0.3, avatarModel.position.z);

    if (factoryModel && isMoving) {
        let closestMesh = null; let minDistance = 2.5; 
        factoryModel.traverse(function (child) {
            if (child.isMesh) {
                const meshWorldPos = new THREE.Vector3(); child.getWorldPosition(meshWorldPos);
                const dist = avatarModel.position.distanceTo(meshWorldPos);
                if (dist < minDistance) { minDistance = dist; closestMesh = child; }
            }
        });
        if (closestMesh) {
            highlightAndShowWorkflow(closestMesh, closestMesh.name || "พื้นที่อับอากาศ", "🚶 ตัวละครเดินเข้าใกล้ตำแหน่ง");
        }
    }
}

// --- 9. ANIMATION LOOP ---
function animate() {
    requestAnimationFrame(animate);
    updateAvatarPhysics();
    controls.update();
    renderer.render(scene, camera);
}
animate();

window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
});



// ============================================================
// MULTIPLAYER MODULE (Clean Version)
// ============================================================

const SUPABASE_URL = 'https://hzlokmixfkfrmkuucfhg.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6bG9rbWl4Zmtmcm1rdXVjZmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NzA5NTUsImV4cCI6MjA5ODE0Njk1NX0.DSj0c7XN979948Iq5rGmWqI9ddcbg56OmfKFin--Luo';
const SUPABASE_BUCKET = 'models';

async function uploadToSupabase(file) {
    const fileName = `model_${Date.now()}_${file.name.replace(/\s+/g, '_')}`;
    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/${SUPABASE_BUCKET}/${fileName}`;
    document.getElementById('factory-status').innerText = `⬆️ กำลังอัปโหลด ${file.name}... (${(file.size/1024/1024).toFixed(1)} MB)`;
    const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/octet-stream', 'x-upsert': 'true' },
        body: file
    });
    if (!res.ok) throw new Error(await res.text());
    return `${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${fileName}`;
}

function loadModelFromUrl(url, fileName) {
    if (factoryModel) { scene.remove(factoryModel); originalMaterials.clear(); factoryColliders = []; }
    document.getElementById('factory-status').innerText = `⬇️ กำลังโหลดโมเดลจาก Cloud...`;
    const loader = getLoaderForFile(fileName || url);
    loader.load(url, function(obj) {
        factoryModel = obj.scene ? obj.scene : obj;
        let meshCount = 0;
        const container = document.getElementById('mesh-container');
        container.innerHTML = '';
        factoryModel.traverse(function(child) {
            if (child.isMesh) {
                meshCount++;
                originalMaterials.set(child.uuid, child.material.clone());
                
                if (!child._original3DName) { child._original3DName = child.name || `Object_${meshCount}`; }

                const item = document.createElement('div');
                item.className = 'mesh-item';
                const mName = child.name || child._original3DName;
                item.innerText = `🏭 ${mName}`;
                item.id = `mesh-item-${child.uuid}`;
                item.addEventListener('click', () => highlightAndShowWorkflow(child, mName, 'คลิกเลือกโมเดล'));
                container.appendChild(item);
            }
        });
        document.getElementById('model-meta').innerHTML = `<span class="info-tag">ตรวจพบชิ้นส่วน: ${meshCount} รายการ</span>`;
        document.getElementById('details-panel').style.display = 'block';
        const box = new THREE.Box3().setFromObject(factoryModel);
        const size = box.getSize(new THREE.Vector3());
        initialFactoryScale = 12 / Math.max(size.x, size.y, size.z);
        factoryModel.scale.set(initialFactoryScale, initialFactoryScale, initialFactoryScale);
        const center = box.getCenter(new THREE.Vector3());
        factoryModel.position.set(-center.x * initialFactoryScale, 0, -center.z * initialFactoryScale);
        scene.add(factoryModel);
        document.getElementById('factory-status').innerText = `✓ โหลดสำเร็จ: ${fileName}`;
        buildColliders();
        setFactoryMaterialMode(currentMaterialMode);
        syncSlidersWithModel();
    }, undefined, err => {
        document.getElementById('factory-status').innerText = `❌ โหลดล้มเหลว`;
        console.error(err);
    });
}

const _origInput = document.getElementById('factory-input');
const _newInput = _origInput.cloneNode(true);
_origInput.parentNode.replaceChild(_newInput, _origInput);

_newInput.addEventListener('change', async function(event) {
    const files = event.target.files;
    if (!files.length) return;
    let modelFile = null;
    for (let f of files) {
        const ext = f.name.split('.').pop().toLowerCase();
        if (['gltf','glb','fbx'].includes(ext)) { modelFile = f; break; }
    }
    if (!modelFile) { document.getElementById('factory-status').innerText = '❌ ไม่พบไฟล์ 3D'; return; }
    try {
        const url = await uploadToSupabase(modelFile);
        if (mpSocket && mpSocket.connected) {
            mpSocket.emit('model_shared', { url, fileName: modelFile.name });
        } else {
            loadModelFromUrl(url, modelFile.name);
        }
    } catch(err) {
        document.getElementById('factory-status').innerText = `❌ อัปโหลดล้มเหลว: ${err.message}`;
    }
});

const _origSaveLiveEdit = saveLiveEdit;
window.saveLiveEdit = function() {
    if (!activeSelectedMeshUUID) return;
    const titleEl = document.getElementById('input-edit-title');
    const descEl = document.getElementById('input-edit-desc');
    const stepsEl = document.getElementById('input-edit-steps');
    const newTitle = titleEl ? titleEl.value.trim() : '';
    const newDesc = descEl ? descEl.value.trim() : '';
    const newSteps = stepsEl ? stepsEl.value.split(',').map(s=>s.trim()).filter(Boolean) : [];
    
    let originalNameKey = activeSelectedMeshUUID;
    if (factoryModel) {
        factoryModel.traverse(function(child) {
            if (child.isMesh && child.uuid === activeSelectedMeshUUID) {
                originalNameKey = child._original3DName || child.name || child.uuid;
                if (!child._original3DName) { child._original3DName = originalNameKey; }
            }
        });
    }

    _origSaveLiveEdit();

    if (originalNameKey) {
        workflowDatabase[originalNameKey] = { "name": newTitle, "desc": newDesc, "steps": newSteps, "colorClass": "tag-blue" };
    }

    if (mpSocket && mpSocket.connected && originalNameKey) {
        mpSocket.emit('workflow_update', { 
            key: originalNameKey, 
            name: newTitle, 
            desc: newDesc, 
            steps: newSteps, 
            colorClass: 'tag-blue',
            targetUuid: activeSelectedMeshUUID 
        });
    }
};

const remoteAvatars = {};
const remoteTargets = {};
const mpPlayerNames = {};
const mpPlayerColors = {};
let mpMyId = null;
let mpMyColor = '#00ffff';

function buildRemoteAvatar(color) {
    return createEngineerAvatar(color || '#4d96ff');
}

function setAvatarLabel(g, name, color) {
    if (g._label) { g.remove(g._label); g._label.material.map.dispose(); }
    const c = document.createElement('canvas'); c.width=256; c.height=64;
    const ctx = c.getContext('2d');
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.roundRect(4,4,248,56,10); ctx.fill();
    ctx.font='bold 24px Arial'; ctx.fillStyle=color||'#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(name.substring(0,16), 128, 32);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));
    sp.scale.set(1.8,0.45,1); sp.position.y=2.2;
    g.add(sp); g._label = sp;
}

function addRemote(data) {
    if (remoteAvatars[data.id]) return;
    const av = buildRemoteAvatar(data.color||'#4d96ff');
    av.position.set(data.position.x, data.position.y, data.position.z);
    scene.add(av); remoteAvatars[data.id] = av;
    setAvatarLabel(av, data.name||data.id, data.color||'#fff');
    mpPlayerNames[data.id] = data.name; mpPlayerColors[data.id] = data.color;
    updateMpUI();
}

function removeRemote(id) {
    if (remoteAvatars[id]) { scene.remove(remoteAvatars[id]); delete remoteAvatars[id]; delete remoteTargets[id]; }
    delete mpPlayerNames[id]; delete mpPlayerColors[id];
    updateMpUI();
}

const _origRender = renderer.render.bind(renderer);
renderer.render = function(sc, cam) {
    for (const id in remoteAvatars) {
        const av = remoteAvatars[id]; const t = remoteTargets[id];
        if (!t) continue;
        av.position.lerp(t.pos, 0.18);
        av.rotation.y += (t.rotY - av.rotation.y) * 0.18;
        animateEngineerWalk(av, t.pos.distanceTo(av.position) > 0.01);
    }
    if (mpSocket && mpSocket.connected && avatarModel) {
        const now = Date.now();
        if (now - _lastSend > 50) {
            _lastSend = now;
            mpSocket.emit('player_move', {
                position: {x:avatarModel.position.x, y:avatarModel.position.y, z:avatarModel.position.z},
                rotation: {y:avatarModel.rotation.y}
            });
        }
    }
    _origRender(sc, cam);
};
let _lastSend = 0;

function updateMpUI() {
    const list = document.getElementById('mp-player-list');
    if (!list) return;
    const all = [mpMyId, ...Object.keys(remoteAvatars)].filter(Boolean);
    document.getElementById('mp-player-count').innerText = all.length;
    list.innerHTML = all.map(id => {
        const isMe = id === mpMyId;
        const name = mpPlayerNames[id] || (isMe ? 'คุณ' : id.slice(0,6));
        const color = mpPlayerColors[id] || '#fff';
        return `<div style="display:flex;align-items:center;gap:6px;padding:3px 0;font-size:12px;">
            <span style="width:8px;height:8px;border-radius:50%;background:${color};flex-shrink:0"></span>
            <span style="color:${color};font-weight:${isMe?'bold':'normal'}">${isMe?'👤 ':''}${name}</span>
        </div>`;
    }).join('');
}

function mpAppendChat(msg) {
    const log = document.getElementById('mp-chat-log');
    if (!log) return;
    const d = document.createElement('div');
    d.style.cssText = `margin-bottom:4px;color:${msg.color||'#fff'};word-break:break-all;font-size:11px;`;
    d.innerHTML = `<strong>${msg.name}:</strong> ${msg.text}`;
    log.appendChild(d); log.scrollTop = log.scrollHeight;
}

window.setMyName = function() {
    const v = document.getElementById('mp-name-input').value.trim();
    if (!v || !mpSocket) return;
    mpSocket.emit('set_name', v);
    mpPlayerNames[mpMyId] = v; updateMpUI();
};

window.sendChat = function() {
    const inp = document.getElementById('mp-chat-input');
    const text = inp.value.trim();
    if (!text || !mpSocket) return;
    mpSocket.emit('chat_message', text); inp.value = '';
};

document.getElementById('mp-chat-input')?.addEventListener('keydown', e => { if(e.key==='Enter') window.sendChat(); });
document.getElementById('mp-name-input')?.addEventListener('keydown', e => { if(e.key==='Enter') window.setMyName(); });

window.addEventListener('keydown', e => {
    if (document.activeElement.tagName==='INPUT'||document.activeElement.tagName==='TEXTAREA') return;
    if (e.key.toLowerCase()==='u') togglePanelElement('multiplayer-panel');
}, true);

let mpSocket;
function initMultiplayer() {
    const dot = document.getElementById('mp-dot');
    const txt = document.getElementById('mp-status-text');
    if (typeof io === 'undefined') { txt.innerText = 'Single Player mode'; return; }

    const SERVER = window.RAILWAY_SERVER_URL || window.location.origin;
    mpSocket = io(SERVER, { transports: ['websocket','polling'] });

    mpSocket.on('connect', () => { dot.style.background='#22c55e'; txt.innerText='เชื่อมต่อแล้ว ✓'; });
    mpSocket.on('disconnect', () => { dot.style.background='#ef4444'; txt.innerText='การเชื่อมต่อขาด...'; });

    mpSocket.on('self_init', data => {
        mpMyId = data.self.id;
        mpMyColor = data.self.color;
        mpPlayerNames[mpMyId] = data.self.name;
        mpPlayerColors[mpMyId] = mpMyColor;
        document.getElementById('mp-name-input').value = data.self.name;
        if (avatarModel) avatarModel.position.set(data.self.position.x, data.self.position.y, data.self.position.z);
        data.others.forEach(p => addRemote(p));
        if (data.modelUrl) loadModelFromUrl(data.modelUrl, data.modelName);
        if (data.workflowDb) Object.assign(workflowDatabase, data.workflowDb);
        updateMpUI();
    });

    mpSocket.on('player_joined', data => {
        addRemote(data);
        mpAppendChat({name:'ระบบ', color:'#64748b', text:`${data.name} เข้าร่วมโลก`});
    });

    mpSocket.on('player_left', data => {
        const name = mpPlayerNames[data.id] || data.id;
        removeRemote(data.id);
        mpAppendChat({name:'ระบบ', color:'#64748b', text:`${name} ออกจากโลก`});
    });

    mpSocket.on('player_moved', data => {
        if (!remoteAvatars[data.id]) return;
        if (!remoteTargets[data.id]) remoteTargets[data.id] = { pos: new THREE.Vector3(), rotY: 0 };
        remoteTargets[data.id].pos.set(data.position.x, data.position.y, data.position.z);
        remoteTargets[data.id].rotY = data.rotation?.y || 0;
    });

    mpSocket.on('player_renamed', data => {
        mpPlayerNames[data.id] = data.name;
        if (remoteAvatars[data.id]) setAvatarLabel(remoteAvatars[data.id], data.name, mpPlayerColors[data.id]||'#fff');
        updateMpUI();
    });

    mpSocket.on('load_model', data => {
        mpAppendChat({name:'ระบบ', color:'#00ffff', text:`📦 โมเดลใหม่: ${data.fileName}`});
        loadModelFromUrl(data.url, data.fileName);
    });

    mpSocket.on('workflow_updated', data => {
        workflowDatabase[data.key] = { name: data.name, desc: data.desc, steps: data.steps, colorClass: data.colorClass||'tag-blue' };
        
        if (data.targetUuid) {
            workflowDatabase[data.targetUuid] = { name: data.name, desc: data.desc, steps: data.steps, colorClass: data.colorClass||'tag-blue' };
        }

        if (factoryModel) {
            factoryModel.traverse(function(child) {
                if (child.isMesh && !child._original3DName) {
                    child._original3DName = child.name;
                }
                
                if (child.isMesh && (child._original3DName === data.key || child.name === data.key || child.uuid === data.key || child.uuid === data.targetUuid)) {
                    child.name = data.name; 
                    
                    const sideListItem = document.getElementById(`mesh-item-${child.uuid}`);
                    if (sideListItem) sideListItem.innerText = `🏭 ${data.name}`;
                }
            });
        }

        const panel = document.getElementById('process-panel');
        if (panel && panel.style.display !== 'none' && (activeSelectedKeyKey === data.key || activeSelectedKeyKey === data.targetUuid || activeSelectedMeshUUID === data.targetUuid)) {
            renderWorkflowUI(data.name, data.desc, data.steps, '✏️ อัปเดตโดยผู้เล่นอื่น', data.colorClass||'tag-blue');
        }
        mpAppendChat({name:'ระบบ', color:'#ffaa00', text:`✏️ "${data.name}" ถูกแก้ไขแล้ว`});
    });

    mpSocket.on('chat_message', msg => mpAppendChat(msg));
}

initMultiplayer();
// ============================================================
// END MULTIPLAYER MODULE
// ============================================================


// ============================================================
// PROXIMITY TAG SYSTEM — ป้ายข้อมูลเสมือนจริงเชิงปฏิสัมพันธ์
// ตามคู่มือ "Interactive Biogas Safety Standard Metaverse"
// - ไอคอนเล็กแสดงตลอดเวลาเหนือชิ้นส่วน
// - ขยายเป็นข้อความเต็มเมื่อ avatar เดินเข้าใกล้ในระยะ PROXIMITY_RANGE เมตร
// ============================================================

const PROXIMITY_RANGE = 3.0; // ระยะที่ป้ายจะขยาย (เมตร) ตามคู่มือ 2-3 เมตร
const proximityTags = []; // { sprite, mesh, databaseKey, expanded }

// แปลง colorClass -> สี hex สำหรับพื้นหลังป้าย
function tagColorFromClass(colorClass) {
    switch (colorClass) {
        case 'tag-red':    return { bg: 'rgba(239,68,68,0.92)',  border: '#ef4444' };
        case 'tag-orange': return { bg: 'rgba(249,115,22,0.92)', border: '#f97316' };
        case 'tag-blue':   return { bg: 'rgba(56,189,248,0.92)', border: '#38bdf8' };
        case 'tag-green':  return { bg: 'rgba(34,197,94,0.92)',  border: '#22c55e' };
        default:           return { bg: 'rgba(56,189,248,0.92)', border: '#38bdf8' };
    }
}

// สร้าง canvas texture สำหรับป้าย (โหมดย่อ = ไอคอนวงกลม, โหมดขยาย = กล่องข้อความ)
function createTagCanvas(databaseKey, expanded) {
    const data = workflowDatabase[databaseKey] || workflowDatabase['default'];
    const colors = tagColorFromClass(data.colorClass);
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!expanded) {
        // โหมดย่อ: วงกลมไอคอนเตือนเล็กๆ
        canvas.width = 96; canvas.height = 96;
        ctx.clearRect(0, 0, 96, 96);
        ctx.beginPath();
        ctx.arc(48, 48, 38, 0, Math.PI * 2);
        ctx.fillStyle = colors.bg;
        ctx.fill();
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
        ctx.font = 'bold 42px Arial';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('!', 48, 52);
    } else {
        // โหมดขยาย: กล่องข้อความเต็มตามคู่มือ (tagText)
        const text = data.tagText || data.name || '';
        ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
        // วัดความกว้างข้อความเพื่อ wrap
        const maxWidth = 520;
        const words = text.split(' ');
        const lines = [];
        let line = '';
        const measureCtx = document.createElement('canvas').getContext('2d');
        measureCtx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
        for (const w of words) {
            const test = line ? line + ' ' + w : w;
            if (measureCtx.measureText(test).width > maxWidth && line) {
                lines.push(line); line = w;
            } else { line = test; }
        }
        if (line) lines.push(line);

        const lineHeight = 36;
        const padding = 24;
        const boxWidth = maxWidth + padding * 2;
        const boxHeight = lines.length * lineHeight + padding * 2;
        canvas.width = boxWidth;
        canvas.height = boxHeight;

        ctx.fillStyle = colors.bg;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(0, 0, boxWidth, boxHeight, 14) : ctx.rect(0, 0, boxWidth, boxHeight);
        ctx.fill();
        ctx.lineWidth = 3;
        ctx.strokeStyle = colors.border;
        ctx.stroke();

        ctx.font = 'bold 26px "Segoe UI", Arial, sans-serif';
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        lines.forEach((l, i) => {
            ctx.fillText(l, boxWidth / 2, padding + lineHeight * i + lineHeight / 2);
        });
    }
    return canvas;
}

function buildProximitySprite(databaseKey) {
    const canvas = createTagCanvas(databaseKey, false);
    const tex = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, sizeAttenuation: true });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.5, 0.5, 1);
    sprite.renderOrder = 999;
    return sprite;
}

function updateSpriteTexture(sprite, databaseKey, expanded) {
    const canvas = createTagCanvas(databaseKey, expanded);
    sprite.material.map.dispose();
    const tex = new THREE.CanvasTexture(canvas);
    sprite.material.map = tex;
    sprite.material.needsUpdate = true;
    if (expanded) {
        // ปรับ scale ตามสัดส่วน canvas เพื่อไม่ให้ข้อความบิดเบี้ยว
        const aspect = canvas.width / canvas.height;
        sprite.scale.set(2.2 * aspect, 2.2, 1);
    } else {
        sprite.scale.set(0.5, 0.5, 1);
    }
}

// สร้าง proximity tag ให้ทุก mesh ในโมเดลโรงงาน (เรียกหลังโหลดโมเดลเสร็จ)
function buildProximityTags() {
    // ล้างป้ายเก่าก่อน
    proximityTags.forEach(t => { scene.remove(t.sprite); t.sprite.material.map.dispose(); t.sprite.material.dispose(); });
    proximityTags.length = 0;

    if (!factoryModel) return;
    factoryModel.updateMatrixWorld(true);
    factoryModel.traverse(function (child) {
        if (!child.isMesh) return;
        const databaseKey = resolveDatabaseKey(child, child.name);
        // ข้ามจุด "default" เพื่อไม่ให้รกฉาก (โซนทั่วไปไม่ต้องมีป้ายลอย)
        if (databaseKey === 'default') return;

        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);
        const box = new THREE.Box3().setFromObject(child);
        const height = box.max.y - box.min.y;

        const sprite = buildProximitySprite(databaseKey);
        sprite.position.set(worldPos.x, box.max.y + Math.max(height * 0.15, 0.4), worldPos.z);
        scene.add(sprite);

        proximityTags.push({ sprite, mesh: child, databaseKey, expanded: false });
    });
}

// เรียกทุกเฟรมเพื่ออัปเดตว่าป้ายไหนควรขยาย/ย่อ ตามระยะห่างจาก avatar
function updateProximityTags() {
    if (!avatarModel || proximityTags.length === 0) return;
    const avatarPos = avatarModel.position;

    proximityTags.forEach(t => {
        const dist = avatarPos.distanceTo(t.sprite.position);
        const shouldExpand = dist <= PROXIMITY_RANGE;
        if (shouldExpand !== t.expanded) {
            t.expanded = shouldExpand;
            updateSpriteTexture(t.sprite, t.databaseKey, shouldExpand);
        }
    });
}

// Hook เข้า render loop เดิม (ใช้ renderer.render ที่ multiplayer module patch ไว้แล้ว)
const _origRenderForTags = renderer.render.bind(renderer);
renderer.render = function(sc, cam) {
    updateProximityTags();
    _origRenderForTags(sc, cam);
};

// เรียกสร้างป้ายหลังโหลดโมเดลทุกครั้ง — wrap buildColliders เดิมแบบปลอดภัย (ใช้ var เพื่อ override การเรียกผ่าน global scope)
buildColliders = (function(originalFn) {
    return function() {
        originalFn();
        buildProximityTags();
    };
})(buildColliders);
// ============================================================
// END PROXIMITY TAG SYSTEM
// ============================================================
// ==========================================
// SYSTEMS: MOBILE VIRTUAL JOYSTICK CONTROLLER
// ==========================================
function initMobileJoystick() {
    const joystickZone = document.getElementById('mobile-joystick-zone');
    if (!joystickZone || typeof nipplejs === 'undefined') return;

    // เคลียร์ค่าเดิมป้องกันจอยซ้ำซ้อน
    joystickZone.innerHTML = '';

    const manager = nipplejs.create({
        zone: joystickZone,
        mode: 'static',
        position: { left: '50%', top: '50%' },
        color: '#00ffff',
        size: 100
    });

    manager.on('move', function (evt, data) {
        if (!data.vector) return;

        const forward = data.vector.y;
        const turn = data.vector.x;
        const threshold = 0.2; // ค่าความไวขั้นต่ำ

        // รีเซ็ตสเตตัสการเดินก่อนคำนวณใหม่
        if (typeof moveStatus !== 'undefined') {
            moveStatus.forward = forward > threshold;
            moveStatus.backward = forward < -threshold;
            moveStatus.left = turn < -threshold;
            moveStatus.right = turn > threshold;
        }
    });

    manager.on('end', function () {
        // เมื่อปล่อยนิ้วหลุดจากจอย ให้หยุดเดินทันที
        if (typeof moveStatus !== 'undefined') {
            moveStatus.forward = false;
            moveStatus.backward = false;
            moveStatus.left = false;
            moveStatus.right = false;
        }
    });

    // ผูกปุ่ม Action บนหน้าจอมือถือ (Jump และ Interact)
    const btnJump = document.getElementById('btn-mobile-jump');
    if (btnJump) {
        btnJump.addEventListener('touchstart', function(e) {
            e.preventDefault();
            // จำลองการกดปุ่ม Spacebar หรือฟังก์ชันกระโดดของคุณ
            document.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); 
        });
    }

    const btnInteract = document.getElementById('btn-mobile-interact');
    if (btnInteract) {
        btnInteract.addEventListener('touchstart', function(e) {
            e.preventDefault();
            // จำลองการกดปุ่ม E หรือฟังก์ชัน Interact ของคุณ
            document.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
        });
    }
}

// เรียกใช้งานระบบ Mobile Controls เมื่อหน้าจอโหลดเสร็จสิ้น
window.addEventListener('DOMContentLoaded', () => {
    initMobileJoystick();
});

// อัปเดตขนาดและจุดศูนย์กลางของจอยใหม่เมื่อมีการหมุนพับหน้าจอ
window.addEventListener('resize', () => {
    setTimeout(initMobileJoystick, 200);
});
// ==========================================
// SYSTEM: MOBILE AUTO CLOSE BUTTON IN PANELS
// ==========================================
function injectMobileCloseButtons() {
    // หาหน้าต่าง Panel ทั้งหมดในระบบ
    const panels = document.querySelectorAll('.panel');
    
    panels.forEach(panel => {
        // ตรวจสอบว่ามีปุ่มปิดอยู่แล้วหรือยัง ป้องกันการสร้างซ้ำ
        if (panel.querySelector('.mobile-close-panel-btn')) return;

        // สร้างปุ่มกากบาทสีแดง
        const closeBtn = document.createElement('button');
        closeBtn.className = 'mobile-close-panel-btn';
        closeBtn.innerHTML = '✕';
        closeBtn.title = 'ปิดหน้าต่าง';

        // เมื่อกดปุ่ม ให้ซ่อนแผงหน้าต่างนั้นทันที
        closeBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // ป้องกัน event บัคไปโดนฉากหลัง
            panel.style.display = 'none';
        });

        // แทรกลงไปใน panel
        panel.appendChild(closeBtn);
    });
}

// เรียกทำงานทันทีที่โหลดหน้าจอหลักเสร็จสิ้น
window.addEventListener('DOMContentLoaded', () => {
    injectMobileCloseButtons();
});
// นำไปวางในส่วนหลังจากที่โหลดไฟล์ Biogasbase.glb สำเร็จแล้ว
if (factoryModel) {
    // ปรับแต่งการตั้งค่าการเรนเดอร์ของชิ้นส่วนย่อยทั้ง 6005 ชิ้น
    factoryModel.traverse(function (child) {
        if (child.isMesh) {
            // 1. เปิดใช้ Frustum Culling (สำคัญมากสำหรับวัตถุหลายชิ้น!)
            // เพื่อบังคับให้คอมพิวเตอร์/มือถือ "คำนวณและวาดเฉพาะชิ้นส่วนที่กล้องกำลังมองเห็นอยู่เท่านั้น" 
            // ชิ้นไหนที่หันหลังให้ หรืออยู่ข้างนอกจอ จะไม่โดนวาดเลย ช่วยลดภาระไปได้เยอะมาก
            child.frustumCulled = true;

            // 2. ปิดระบบเงา Real-time สำหรับชิ้นส่วนโรงงาน (ตัวการใหญ่ที่ทำให้มือถือแล็ก)
            // โมเดลที่มีชิ้นงานเยอะขนาดนี้ ถ้าเปิดแชร์เงากันแบบสดๆ การ์ดจอมือถือจะค้างทันที
            child.castShadow = false;
            child.receiveShadow = false;

            // 3. ปรับแต่ง Material (วัสดุ) ของโมเดลให้คำนวณแสงแบบเรียบง่ายขึ้น (ถ้าต้องการให้ลื่นสุดๆ)
            if (child.material) {
                // หากระบบใช้ MeshStandardMaterial ซึ่งกินสเปกมาก 
                // สามารถปรับค่าเบื้องต้นให้ลดการสะท้อนที่ละเอียดเกินไปลงได้
                if (child.material.roughness !== undefined) child.material.roughness = 0.8;
                if (child.material.metalness !== undefined) child.material.metalness = 0.2;
            }
        }
    });
}
function disposeOldFactory(model) {
    if (!model) return;
    model.traverse((child) => {
        if (child.isMesh) {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) {
                    child.material.forEach(m => m.dispose());
                } else {
                    child.material.dispose();
                }
            }
        }
    });
    scene.remove(model);
}


// ============================================================
// REQUIREMENTS MODULE — 6 ข้อตาม Spec
// ============================================================

// ─────────────────────────────────────────────
// REQ 1 & 2: Lock / Unlock Transform (Scale + Position + Rotation)
// ─────────────────────────────────────────────
let transformLocked = false;

function toggleTransformLock() {
    transformLocked = !transformLocked;
    const btn = document.getElementById('btn-lock-transform');
    const sliders = ['param-posX','param-posY','param-posZ','param-rotY','param-scale'];
    sliders.forEach(id => { const el = document.getElementById(id); if (el) el.disabled = transformLocked; });
    if (btn) {
        btn.innerText = transformLocked ? '🔒 ล็อกแล้ว' : '🔓 ปลดล็อก';
        btn.style.background = transformLocked ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.1)';
        btn.style.borderColor = transformLocked ? '#ef4444' : '#22c55e';
        btn.style.color = transformLocked ? '#ef4444' : '#22c55e';
    }
}
window.toggleTransformLock = toggleTransformLock;

// Intercept slider changes when locked
['param-posX','param-posY','param-posZ','param-rotY','param-scale'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('mousedown', (e) => { if (transformLocked) e.preventDefault(); });
    el.addEventListener('touchstart', (e) => { if (transformLocked) e.preventDefault(); }, { passive: false });
});

// Add lock button to transform panel
(function addLockButton() {
    const panel = document.getElementById('transform-panel');
    if (!panel) return;
    const btn = document.createElement('button');
    btn.id = 'btn-lock-transform';
    btn.className = 'panel-action-btn';
    btn.innerText = '🔓 ปลดล็อก';
    btn.style.cssText = 'width:100%;margin-top:10px;background:rgba(34,197,94,0.1);border-color:#22c55e;color:#22c55e;';
    btn.onclick = toggleTransformLock;
    panel.appendChild(btn);
})();

// ─────────────────────────────────────────────
// REQ 3: Avatar สัดส่วนสมจริงยิ่งขึ้น
// แทนที่ createEngineerAvatar เดิมด้วยเวอร์ชันสัดส่วนสมจริง
// ─────────────────────────────────────────────
function createRealisticEngineerAvatar(helmetColor) {
    const group = new THREE.Group();
    const hex = helmetColor ? parseInt(String(helmetColor).replace('#',''), 16) : 0xff9900;

    const skinMat   = new THREE.MeshStandardMaterial({ color: 0xf4c08a, roughness: 0.7 });
    const suitMat   = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.6 });
    const darkMat   = new THREE.MeshStandardMaterial({ color: 0x1a1a2e, roughness: 0.8 });
    const helmetMat = new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3, metalness: 0.3 });
    const glassMat  = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.45 });
    const visibMat  = new THREE.MeshStandardMaterial({ color: 0xffff00 });
    const bootMat   = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });

    // สัดส่วนมนุษย์จริง: ความสูงรวม ~1.75m
    // ─ หัว: 0.22m cube (ที่ y=1.53–1.75)
    // ─ ลำตัว: 0.5m tall (y=0.9–1.4) + คอ 0.1m (y=1.4–1.5)
    // ─ แขน: 0.55m each side
    // ─ ขา: 0.5m each (y=0.38–0.88) + รองเท้า 0.1m

    // ── หัว ──
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.24, 0.22), skinMat);
    head.position.y = 1.62; group.add(head);

    // คอ
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), skinMat);
    neck.position.y = 1.49; group.add(neck);

    // หมวก Hard Hat
    const helmetTop = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.12, 0.26), helmetMat);
    helmetTop.position.y = 1.78; group.add(helmetTop);
    const helmetBrim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.03, 0.3), helmetMat);
    helmetBrim.position.y = 1.72; group.add(helmetBrim);

    // วีซอร์ (ด้าน -Z = หน้า)
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.08, 0.03), glassMat);
    visor.position.set(0, 1.62, -0.12); group.add(visor);

    // ตา
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.03, 0.02), eyeMat);
    eyeL.position.set(-0.05, 1.63, -0.112); group.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.set(0.05, 1.63, -0.112); group.add(eyeR);

    // ── ลำตัว ──
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.5, 0.2), suitMat);
    torso.position.y = 1.14; group.add(torso);

    // แถบ Hi-Vis 2 เส้น
    const stripe1 = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.05, 0.21), visibMat);
    stripe1.position.y = 1.22; group.add(stripe1);
    const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(0.39, 0.05, 0.21), visibMat);
    stripe2.position.y = 1.08; group.add(stripe2);

    // ซิปกลาง
    const zip = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.45, 0.21), darkMat);
    zip.position.y = 1.14; group.add(zip);

    // ── แขน ── (แยกเป็น upper/lower เพื่อ animation งอข้อศอก)
    const upperArmGeo = new THREE.BoxGeometry(0.11, 0.28, 0.13);
    const lowerArmGeo = new THREE.BoxGeometry(0.1, 0.25, 0.12);
    const handGeo = new THREE.BoxGeometry(0.09, 0.1, 0.05);

    // แขนซ้าย
    const uArmL = new THREE.Mesh(upperArmGeo, suitMat); uArmL.position.set(-0.265, 1.24, 0); group.add(uArmL);
    const lArmL = new THREE.Mesh(lowerArmGeo, suitMat); lArmL.position.set(-0.265, 0.94, 0); group.add(lArmL);
    const handL = new THREE.Mesh(handGeo, skinMat); handL.position.set(-0.265, 0.77, 0); group.add(handL);
    // Hi-vis แขนซ้าย
    const asL = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.04, 0.135), visibMat); asL.position.set(-0.265, 1.14, 0); group.add(asL);

    // แขนขวา
    const uArmR = new THREE.Mesh(upperArmGeo, suitMat); uArmR.position.set(0.265, 1.24, 0); group.add(uArmR);
    const lArmR = new THREE.Mesh(lowerArmGeo, suitMat); lArmR.position.set(0.265, 0.94, 0); group.add(lArmR);
    const handR = new THREE.Mesh(handGeo, skinMat); handR.position.set(0.265, 0.77, 0); group.add(handR);
    const asR = asL.clone(); asR.position.set(0.265, 1.14, 0); group.add(asR);

    // ── เอว/กางเกง ──
    const waist = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.12, 0.18), darkMat);
    waist.position.y = 0.88; group.add(waist);

    // Belt
    const belt = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.05, 0.19), new THREE.MeshStandardMaterial({color:0x8B4513, roughness:0.5}));
    belt.position.y = 0.92; group.add(belt);

    // ── ขา ──
    const legGeo = new THREE.BoxGeometry(0.14, 0.42, 0.15);
    const legL = new THREE.Mesh(legGeo, suitMat); legL.position.set(-0.1, 0.6, 0); group.add(legL);
    const legR = new THREE.Mesh(legGeo, suitMat); legR.position.set(0.1, 0.6, 0); group.add(legR);

    // Hi-vis ขา
    const lsL = new THREE.Mesh(new THREE.BoxGeometry(0.145, 0.04, 0.155), visibMat); lsL.position.set(-0.1, 0.52, 0); group.add(lsL);
    const lsR = lsL.clone(); lsR.position.set(0.1, 0.52, 0); group.add(lsR);

    // ── รองเท้า ──
    const bootGeo = new THREE.BoxGeometry(0.16, 0.1, 0.22);
    const bootL = new THREE.Mesh(bootGeo, bootMat); bootL.position.set(-0.1, 0.33, -0.03); group.add(bootL);
    const bootR = bootL.clone(); bootR.position.set(0.1, 0.33, -0.03); group.add(bootR);

    // Shadow blob
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.25, 16), new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.18}));
    shadow.rotation.x = -Math.PI/2; shadow.position.y = 0.01; group.add(shadow);

    // Store refs for walk animation
    group.userData.armL = uArmL;
    group.userData.armR = uArmR;
    group.userData.lArmL = lArmL;
    group.userData.lArmR = lArmR;
    group.userData.legL = legL;
    group.userData.legR = legR;
    group.userData.walkPhase = 0;

    return group;
}

// Override animateEngineerWalk ให้แกว่งทั้งแขนบน-ล่าง-ขา
(function overrideWalkAnim() {
    const _orig = animateEngineerWalk;
    window.animateEngineerWalk = function(g, isMoving) {
        if (!g || !g.userData.legL) return;
        if (isMoving) g.userData.walkPhase += 0.1;
        else g.userData.walkPhase *= 0.8;
        const s = Math.sin(g.userData.walkPhase) * 0.45;
        if (g.userData.armL) g.userData.armL.rotation.x =  s;
        if (g.userData.armR) g.userData.armR.rotation.x = -s;
        if (g.userData.lArmL) g.userData.lArmL.rotation.x = s * 0.5;
        if (g.userData.lArmR) g.userData.lArmR.rotation.x = -s * 0.5;
        if (g.userData.legL) g.userData.legL.rotation.x = -s;
        if (g.userData.legR) g.userData.legR.rotation.x =  s;
    };
})();

// Override createEngineerAvatar → ใช้ realistic version
window.createEngineerAvatar = createRealisticEngineerAvatar;

// Rebuild avatar ทันที
if (avatarModel) {
    scene.remove(avatarModel);
    const newAvatar = createRealisticEngineerAvatar('#ff9900');
    newAvatar.position.copy(avatarModel.position || new THREE.Vector3(0, 0.9, 8));
    newAvatar.rotation.copy(avatarModel.rotation);
    scene.add(newAvatar);
    avatarModel = newAvatar;
}

// ─────────────────────────────────────────────
// REQ 4: Safety Zone Hotspot — กำหนดจุดอุปกรณ์ด้วย Pin
// คลิก Mesh → popup ความปลอดภัย (ยังทำงานอยู่เดิม)
// เพิ่ม: ป้าย "!" ขนาดเล็กลอยเหนือทุก mesh ที่มี safety data
// ─────────────────────────────────────────────
// (ระบบนี้ทำงานผ่าน proximity tag system และ highlightAndShowWorkflow เดิม)

// ─────────────────────────────────────────────
// REQ 5: PPE Safety Zone — วงกลมรัศมี 15m รอบอุปกรณ์อันตราย
// ─────────────────────────────────────────────
const PPE_ZONE_RADIUS = 15;
const PPE_ZONE_KEYS = ['tank', 'manhole', 'pvrv', 'flare']; // โซนที่ต้องสวม PPE
const ppeZoneCircles = [];
let ppeAlertActive = false;

function buildPPEZones() {
    // ล้างวงเก่า
    ppeZoneCircles.forEach(c => scene.remove(c));
    ppeZoneCircles.length = 0;
    if (!factoryModel) return;

    factoryModel.traverse(function(child) {
        if (!child.isMesh) return;
        const key = resolveDatabaseKey(child, child.name);
        if (!PPE_ZONE_KEYS.includes(key)) return;

        const worldPos = new THREE.Vector3();
        child.getWorldPosition(worldPos);

        // วงกลมพื้น (RingGeometry แบบ dashed ดูง่าย)
        const ringGeo = new THREE.RingGeometry(PPE_ZONE_RADIUS - 0.15, PPE_ZONE_RADIUS + 0.15, 64);
        const ringMat = new THREE.MeshBasicMaterial({ color: 0xffaa00, side: THREE.DoubleSide, transparent: true, opacity: 0.5 });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.set(worldPos.x, 0.05, worldPos.z);
        ring.userData.centerX = worldPos.x;
        ring.userData.centerZ = worldPos.z;
        ring.userData.ppeKey = key;
        scene.add(ring);
        ppeZoneCircles.push(ring);

        // ป้าย PPE label ลอยเหนือวง
        const canvas = document.createElement('canvas');
        canvas.width = 512; canvas.height = 128;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = 'rgba(255,170,0,0.88)';
        ctx.roundRect(4, 4, 504, 120, 14); ctx.fill();
        ctx.font = 'bold 34px Arial'; ctx.fillStyle = '#000';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('🛡️ PPE Zone — สวม 4-Gas Detector ก่อนเข้า', 256, 64);
        const sp = new THREE.Sprite(new THREE.SpriteMaterial({map: new THREE.CanvasTexture(canvas), depthTest: false}));
        sp.scale.set(8, 2, 1);
        sp.position.set(worldPos.x, 1.5, worldPos.z - PPE_ZONE_RADIUS + 1);
        scene.add(sp);
        ppeZoneCircles.push(sp);
    });
}

// เช็คทุกเฟรมว่า avatar อยู่ใน PPE zone ไหนไหม
let _lastPPEAlertTime = 0;
function checkPPEZones() {
    if (!avatarModel || ppeZoneCircles.length === 0) return;
    const ax = avatarModel.position.x, az = avatarModel.position.z;
    let inside = false;
    for (const obj of ppeZoneCircles) {
        if (!obj.userData.centerX) continue;
        const dx = ax - obj.userData.centerX, dz = az - obj.userData.centerZ;
        if (Math.sqrt(dx*dx + dz*dz) <= PPE_ZONE_RADIUS) { inside = true; break; }
    }
    if (inside && !ppeAlertActive) {
        ppeAlertActive = true;
        mpAppendChat({ name:'⚠️ PPE Alert', color:'#ffaa00', text:'คุณเข้าสู่พื้นที่อันตราย! กรุณาสวม 4-Gas Detector และ PPE ทันที' });
    } else if (!inside && ppeAlertActive) {
        ppeAlertActive = false;
        mpAppendChat({ name:'✅ ปลอดภัย', color:'#22c55e', text:'ออกจากพื้นที่อันตรายแล้ว' });
    }
}

// ─────────────────────────────────────────────
// REQ 6: ข้อมูลหายเมื่อเดินออกหรือชี้ซ้ำ (Deselect)
// ─────────────────────────────────────────────
let _lastSelectedUUID = null;
let _lastInteractTime = 0;
const DESELECT_DISTANCE = 4; // เมตร — ออกไปไกลกว่านี้ = ปิดป้าย
const DESELECT_COOLDOWN = 300; // ms

function checkAutoDeselect() {
    if (!avatarModel || !factoryModel || !activeSelectedMeshUUID) return;
    // หาตำแหน่ง mesh ที่ select ไว้
    let selectedMeshPos = null;
    factoryModel.traverse(child => {
        if (child.isMesh && child.uuid === activeSelectedMeshUUID) {
            selectedMeshPos = new THREE.Vector3();
            child.getWorldPosition(selectedMeshPos);
        }
    });
    if (!selectedMeshPos) return;
    const dist = avatarModel.position.distanceTo(selectedMeshPos);
    if (dist > DESELECT_DISTANCE) {
        // ออกไปไกลแล้ว — ปิดป้าย
        const panel = document.getElementById('process-panel');
        if (panel) panel.style.display = 'none';
        activeSelectedMeshUUID = null;
        activeSelectedKeyKey = 'default';
        // Reset highlight
        if (factoryModel && currentMaterialMode === 'solid') {
            factoryModel.traverse(child => {
                if (child.isMesh && originalMaterials.has(child.uuid)) {
                    child.material = originalMaterials.get(child.uuid).clone();
                }
            });
        }
    }
}

// "ชี้ซ้ำ" = คลิก mesh เดิม 2 ครั้ง → ปิดป้าย
(function overrideHighlight() {
    const _origHL = highlightAndShowWorkflow;
    window.highlightAndShowWorkflow = function(targetMesh, meshName, method) {
        const now = Date.now();
        if (targetMesh.uuid === _lastSelectedUUID && now - _lastInteractTime < 1500 && method === 'คลิกเลือกโมเดล') {
            // ชี้ซ้ำ → deselect
            const panel = document.getElementById('process-panel');
            if (panel) panel.style.display = 'none';
            activeSelectedMeshUUID = null; activeSelectedKeyKey = 'default'; _lastSelectedUUID = null;
            if (factoryModel && currentMaterialMode === 'solid') {
                factoryModel.traverse(child => {
                    if (child.isMesh && originalMaterials.has(child.uuid)) child.material = originalMaterials.get(child.uuid).clone();
                });
            }
            return;
        }
        _lastSelectedUUID = targetMesh.uuid;
        _lastInteractTime = now;
        _origHL(targetMesh, meshName, method);
    };
})();

// ─────────────────────────────────────────────
// Hook เข้า render loop สำหรับ REQ 5 & 6
// ─────────────────────────────────────────────
const _origRenderReq = renderer.render.bind(renderer);
renderer.render = function(sc, cam) {
    checkPPEZones();
    checkAutoDeselect();
    _origRenderReq(sc, cam);
};

// Hook buildColliders เพื่อ rebuild PPE zones หลังโหลดโมเดล
buildColliders = (function(origFn) {
    return function() {
        origFn();
        buildPPEZones();
    };
})(buildColliders);

// ─────────────────────────────────────────────
// Mobile Controls — joystick + interact + jump
// ─────────────────────────────────────────────
(function initMobileControls() {
    if (typeof nipplejs === 'undefined') return;
    const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || window.innerWidth <= 920;
    if (!isMobile) return;

    const joystickZone = document.getElementById('mobile-joystick-zone');
    if (!joystickZone) return;

    const manager = nipplejs.create({
        zone: joystickZone, mode: 'static',
        position: { left: '60px', bottom: '20px' },
        color: '#00ffff', size: 100
    });

    manager.on('move', (evt, data) => {
        const angle = data.angle.radian;
        const force = Math.min(data.force, 1);
        moveStatus.forward  = false; moveStatus.backward = false;
        moveStatus.left = false; moveStatus.right = false;
        if (force > 0.2) {
            if (angle > 0.4 && angle < 2.7) moveStatus.forward = true;
            if (angle > 3.6 || angle < -0.4 || (angle < 0 && angle > -2.7)) moveStatus.backward = true;
            if (angle > 1.2 && angle < 4.3) moveStatus.left = true;
            if (angle < -1.2 || angle > 4.3 || (angle > -0.4 && angle < 1.2)) moveStatus.right = true;
        }
    });
    manager.on('end', () => {
        moveStatus.forward = moveStatus.backward = moveStatus.left = moveStatus.right = false;
    });

    // Interact button — raycast หา mesh ใกล้ avatar ที่สุด
    document.getElementById('btn-mobile-interact')?.addEventListener('click', () => {
        if (!factoryModel || !avatarModel) return;
        let closest = null; let minDist = 5;
        factoryModel.traverse(child => {
            if (!child.isMesh) return;
            const p = new THREE.Vector3(); child.getWorldPosition(p);
            const d = avatarModel.position.distanceTo(p);
            if (d < minDist) { minDist = d; closest = child; }
        });
        if (closest) highlightAndShowWorkflow(closest, closest.name || 'อุปกรณ์', '📱 แตะปุ่ม Interact');
    });

    document.getElementById('btn-mobile-jump')?.addEventListener('click', triggerAvatarJump);
})();

// ============================================================
// END REQUIREMENTS MODULE
// ============================================================
