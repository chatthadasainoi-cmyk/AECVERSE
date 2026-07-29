/* ============================================================
   AEC VERSE — AR Viewer (ar.html)
   สแกน QR แล้วเปิดหน้านี้ -> โหลดโมเดลจากคลัง แล้วดูได้ 2 แบบ
     1) AR จริง (WebXR immersive-ar): เล็งพื้นแล้วแตะวางโมเดลลอยในที่จริง
     2) โหมดพรีวิว 3 มิติ (เครื่องที่ไม่รองรับ AR เช่น iOS Safari): หมุน/ซูมดูได้
   ทั้งสองโหมด "แตะที่ชิ้นส่วน" เพื่อดูข้อมูลความปลอดภัยของชิ้นนั้นได้เหมือนกัน

   ข้อมูลชิ้นส่วนดึงจาก server ตัวเดียวกับโลก 3D (ต่อ socket แบบ watcher ไม่ต้องล็อกอิน)
   จึงเป็นข้อมูลชุดเดียวกับที่แอดมินแก้ไว้ในหน้า Metaverse
   ============================================================ */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ARButton } from 'three/addons/webxr/ARButton.js';

const SUPABASE_URL = 'https://hzlokmixfkfrmkuucfhg.supabase.co';
const SUPABASE_BUCKET = 'models';

const $ = id => document.getElementById(id);
const params = new URLSearchParams(location.search);
const modelFile = params.get('model');

// ---------- ข้อมูลชิ้นส่วน (ชุดเดียวกับโลก 3D) ----------
let workflowDb = {};
let typeAssignments = {};

const DEFAULT_INFO = {
    name: 'โครงสร้างทั่วไป',
    desc: 'พื้นที่ส่วนสนับสนุนและโครงสร้างทั่วไปภายในสถานประกอบการแก๊สชีวภาพ',
    colorClass: 'tag-blue',
    steps: ['🛡️ สวมใส่เครื่องตรวจวัดก๊าซรั่วพกพา (4-Gas Detector)']
};

// เดาชนิดอุปกรณ์จากชื่อชิ้นส่วน — ตรรกะเดียวกับ heuristicTypeFromName() ใน app.js
// เพื่อให้ชิ้นที่แอดมินยังไม่ได้กำหนด type เอง ก็ยังขึ้นข้อมูลตรงกับในโลก 3D
function heuristicTypeFromName(name) {
    const n = (name || '').toLowerCase();
    if (!n) return null;
    if (n.includes('manhole') || n.includes('แมนโฮล')) return 'manhole';
    if (n.includes('pvrv')) return 'pvrv';
    if ((n.includes('water') && n.includes('seal')) || n.includes('ซีลน้ำ')) return 'water_seal';
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

function infoForMesh(mesh) {
    const nameKey = mesh.userData.originalName || mesh.name;
    if (nameKey && workflowDb[nameKey]) return workflowDb[nameKey];
    const typeKey = typeAssignments[nameKey] || heuristicTypeFromName(nameKey);
    if (typeKey && workflowDb[typeKey]) return workflowDb[typeKey];
    return DEFAULT_INFO;
}

// ---------- ฉาก ----------
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.01, 400);
camera.position.set(0, 1.4, 3.2);

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.xr.enabled = true;
document.body.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 2.2));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.6);
dirLight.position.set(3, 8, 4);
scene.add(dirLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.7, 0);

// มุมกล้องตั้งต้น — คำนวณใหม่ให้พอดีกับโมเดลหลังโหลดเสร็จ (ดูใน loadModel)
const homeCamera = new THREE.Vector3(0, 1.4, 3.2);
const homeTarget = new THREE.Vector3(0, 0.7, 0);
function resetView() {
    camera.position.copy(homeCamera);
    controls.target.copy(homeTarget);
    controls.update();
}

// วางกล้องให้ "เห็นทั้งโมเดลเต็มจอ" โดยคำนวณจากกล่องขอบเขตจริง + มุมมองของกล้อง
// เดิมใช้ระยะคงที่ (z=2.1) ซึ่งใช้ไม่ได้กับโมเดลที่สัดส่วนต่างกันมาก:
// ผังโรงงานที่แบนมาก (สูงแค่ 2% ของความกว้าง) จะถูกมองแบบ "เกือบขนานกับแผ่น"
// จนแทบไม่เห็นอะไรและแตะไม่โดนอะไรเลย จึงต้องมองจากมุมเฉียงด้านบนแทน
function frameCameraToModel() {
    const box = new THREE.Box3().setFromObject(modelRoot);
    if (box.isEmpty()) return;
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const vFov = THREE.MathUtils.degToRad(camera.fov);

    // ระยะที่ทำให้โมเดลพอดีจอทั้งแนวตั้งและแนวนอน (จอมือถือเป็นแนวตั้ง aspect < 1 ต้องเผื่อด้วย)
    const fitV = (size.y / 2) / Math.tan(vFov / 2);
    const fitH = (Math.max(size.x, size.z) / 2) / (Math.tan(vFov / 2) * Math.max(camera.aspect, 0.0001));
    const dist = Math.max(fitV, fitH, 0.05) * 1.5;   // เผื่อขอบรอบๆ ไม่ให้ชิดจอ

    // มองจากมุมเฉียงบน ~35 องศา เห็นทั้งด้านบนและด้านข้าง ใช้ได้ทั้งโมเดลสูงและโมเดลแบน
    const dir = new THREE.Vector3(0.35, 0.62, 1).normalize();
    homeTarget.copy(center);
    homeCamera.copy(center).addScaledVector(dir, dist);
}

// modelRoot = ตัวที่ย้าย/ย่อขยายตอนวางใน AR, modelInner = โมเดลจริง (ปรับให้กึ่งกลางอยู่ที่ 0,0,0)
const modelRoot = new THREE.Group();
scene.add(modelRoot);
let modelInner = null;
let placed = false;   // ใน AR: วางโมเดลลงพื้นแล้วหรือยัง
let inAR = false;

addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
});

// ---------- โหลดโมเดล ----------
function setStatus(msg, showRing = true, pct = '') {
    const box = $('ar-status');
    if (!msg) { box.style.display = 'none'; return; }
    box.style.display = 'block';
    $('ar-msg').innerHTML = msg;
    $('ar-ring').style.display = showRing ? 'block' : 'none';
    $('ar-pct').textContent = pct;
}

if (!modelFile) {
    setStatus('ไม่พบชื่อโมเดลใน QR Code นี้<br><span style="font-size:11.5px;color:#657182;">ลองสแกนใหม่ หรือขอ QR ใหม่จากผู้ดูแลระบบ</span>', false);
} else {
    $('ar-model-name').textContent = modelFile.replace(/^model_\d+_/, '');
    loadModel(`${SUPABASE_URL}/storage/v1/object/public/${SUPABASE_BUCKET}/${encodeURIComponent(modelFile)}`);
}

function loadModel(url) {
    const draco = new DRACOLoader();
    draco.setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);

    loader.load(url, gltf => {
        modelInner = gltf.scene;

        // จำชื่อดั้งเดิมไว้ก่อน แล้วย่อ/จัดกึ่งกลางให้พอดีมือถือ (ราว 1 เมตรในโลกจริง)
        modelInner.traverse(o => {
            if (o.isMesh) {
                o.userData.originalName = o.name;
                // โมเดล CAD มักตั้งวัสดุเป็น FrontSide ทำให้ raycast จากบางมุมไม่โดน
                const mats = Array.isArray(o.material) ? o.material : [o.material];
                mats.forEach(m => { if (m) m.side = THREE.DoubleSide; });
            }
        });

        const box = new THREE.Box3().setFromObject(modelInner);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const scale = 1 / Math.max(size.x, size.y, size.z, 0.001); // ด้านยาวสุด = 1 เมตร
        modelInner.scale.setScalar(scale);
        modelInner.position.set(-center.x * scale, -box.min.y * scale, -center.z * scale);

        modelRoot.add(modelInner);

        frameCameraToModel();
        resetView();

        setStatus('');
        $('ar-actions').style.display = 'flex';
        updateHint();
    },
    xhr => {
        if (xhr.total) setStatus('กำลังโหลดโมเดล 3 มิติ...', true, Math.round(xhr.loaded / xhr.total * 100) + '%');
        else setStatus('กำลังโหลดโมเดล 3 มิติ...', true, (xhr.loaded / 1048576).toFixed(1) + ' MB');
    },
    err => {
        console.error('[AR] โหลดโมเดลไม่สำเร็จ:', err);
        setStatus('โหลดโมเดลไม่สำเร็จ<br><span style="font-size:11.5px;color:#657182;">ไฟล์อาจถูกลบไปแล้ว หรืออินเทอร์เน็ตช้าเกินไป</span>', false);
    });
}

// ---------- AR: hit-test หาพื้นแล้ววางโมเดล ----------
const reticle = new THREE.Mesh(
    new THREE.RingGeometry(0.09, 0.11, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0x22d3ee })
);
reticle.matrixAutoUpdate = false;
reticle.visible = false;
scene.add(reticle);

// iPhone/iPad ไม่รองรับ WebXR แต่มี "AR Quick Look" ของ Apple ซึ่งใช้ไฟล์ USDZ
// (iPadOS รายงานตัวเองเป็น Mac จึงต้องเช็ค maxTouchPoints ประกอบ)
const IS_IOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

let hitTestSource = null, hitTestRequested = false;
let surfaceEverFound = false;   // เคยตรวจเจอพื้นในรอบนี้ไหม
let arStartedAt = 0;
// หาพื้นไม่เจอภายในเวลานี้ -> ยอมให้แตะวางโมเดล "ตรงหน้ากล้อง" ไปเลย
// บางเครื่อง/บางห้อง (แสงน้อย พื้นเรียบไม่มีลวดลาย) ตรวจจับพื้นไม่ติดสักที
// ถ้าไม่มีทางออกให้ ผู้ใช้จะเจอแค่จอกล้องเปล่าๆ แล้วไม่รู้ว่าต้องทำอะไร
const PLACE_ANYWAY_MS = 6000;
const canPlaceAnyway = () => !surfaceEverFound && (Date.now() - arStartedAt > PLACE_ANYWAY_MS);

function updateHint() {
    const h = $('ar-hint');
    if (!modelInner) { h.textContent = ''; return; }
    if (!inAR) {
        h.textContent = 'ลากเพื่อหมุน · หนีบนิ้วเพื่อซูม · แตะชิ้นส่วนเพื่อดูข้อมูล'
            // ตัวดู AR ของ Apple เป็นแอปของระบบ เราแทรกการแตะดูข้อมูลเข้าไปไม่ได้
            // จึงต้องบอกไว้ว่าถ้าจะดูรายละเอียดรายชิ้น ให้ดูในหน้านี้
            + (IS_IOS ? ' · (ใน AR ของ iPhone ดูได้แต่ไม่สามารถแตะดูข้อมูล)' : '');
        return;
    }
    if (placed) { h.textContent = 'แตะชิ้นส่วนเพื่อดูข้อมูล · ลากซ้าย-ขวาเพื่อหมุนโมเดล'; return; }
    if (reticle.visible) h.textContent = '✅ เจอพื้นแล้ว — แตะเพื่อวางโมเดล';
    else if (canPlaceAnyway()) h.textContent = 'ยังหาพื้นไม่เจอ — แตะหน้าจอเพื่อวางโมเดลตรงหน้าคุณเลย';
    else h.textContent = 'ส่ายมือถือช้าๆ ให้เห็นพื้น (ที่มีแสงพอและมีลวดลาย) เพื่อให้ระบบจับพื้นได้';
}

if (navigator.xr && navigator.xr.isSessionSupported) {
    navigator.xr.isSessionSupported('immersive-ar').then(ok => {
        if (ok) {
            // dom-overlay สำคัญมาก: ถ้าไม่ขอ feature นี้ HTML ทั้งหน้าจะ "หายไป" ระหว่างอยู่ใน AR
            // (เห็นแต่ภาพกล้อง + ของที่วาดด้วย three.js) แปลว่าทั้งคำแนะนำและการ์ดข้อมูลตอนแตะ
            // ชิ้นส่วนจะไม่มีวันโผล่เลย — ซึ่งคือหัวใจของฟีเจอร์นี้
            const btn = ARButton.createButton(renderer, {
                requiredFeatures: ['hit-test'],
                optionalFeatures: ['dom-overlay'],
                domOverlay: { root: document.body }
            });
            btn.style.display = 'none'; // ใช้ปุ่มดีไซน์ของเราเองแทนปุ่มมาตรฐาน
            document.body.appendChild(btn);
            $('ar-enter').addEventListener('click', () => btn.click());
        } else {
            noWebXr();
        }
    }).catch(noWebXr);
} else {
    noWebXr();
}

// ไม่มี WebXR: ถ้าเป็น iPhone/iPad ยังไปต่อได้ด้วย AR Quick Look ของ Apple
function noWebXr() { if (IS_IOS) setupIosQuickLook(); else showArUnsupported(); }

function showArUnsupported() {
    const b = $('ar-enter');
    b.disabled = true;
    b.textContent = '📱 อุปกรณ์นี้ไม่รองรับ AR';
    b.title = 'AR ต้องใช้ Chrome บน Android (WebXR) หรือ Safari บน iPhone/iPad — เครื่องอื่นดูแบบ 3 มิติได้ตามปกติ';
}

// ---------- iOS: AR Quick Look ----------
// Safari บน iOS ไม่รองรับ WebXR แต่เปิดไฟล์ USDZ ในตัวดู AR ของ Apple ได้
// เราไม่มีไฟล์ USDZ เก็บไว้ จึงแปลงจากโมเดล GLB ที่โหลดมาแล้วในเครื่องผู้ใช้เลย
// (วิธีเดียวกับที่ <model-viewer> ของ Google ใช้รองรับ iOS)
let usdzUrl = null;

function setupIosQuickLook() {
    const b = $('ar-enter');
    b.disabled = false;
    b.textContent = '📱 ดูแบบ AR (iPhone / iPad)';
    b.title = 'เปิดด้วยตัวดู AR ของ Apple';
    b.addEventListener('click', launchIosQuickLook);
}

async function launchIosQuickLook() {
    if (!modelInner) return;
    const b = $('ar-enter');
    const label = b.textContent;

    if (!usdzUrl) {   // แปลงครั้งเดียวแล้วเก็บไว้ กดซ้ำไม่ต้องแปลงใหม่
        b.disabled = true;
        b.textContent = 'กำลังเตรียมไฟล์ AR...';
        setStatus('กำลังแปลงโมเดลให้ตัวดู AR ของ iPhone<br><span style="font-size:11.5px;color:#657182;">โมเดลใหญ่อาจใช้เวลาสักครู่ อย่าปิดหน้านี้</span>');
        try {
            // โหลด exporter แบบ lazy — เครื่อง Android ไม่ต้องดาวน์โหลดไฟล์นี้เลย
            const { USDZExporter } = await import('three/addons/exporters/USDZExporter.js');
            // ให้เบราว์เซอร์ได้วาดข้อความ "กำลังแปลง" ก่อน เพราะการแปลงกินเธรดหลักยาว
            await new Promise(r => setTimeout(r, 50));
            const data = await new USDZExporter().parse(modelInner);
            const blob = new Blob([data], { type: 'model/vnd.usdz+zip' });
            usdzUrl = URL.createObjectURL(blob);
            const mb = blob.size / 1048576;
            // USDZ ไม่บีบอัดเรขาคณิต ไฟล์จึงมักโตกว่า .glb ราว 2 เท่า
            // โมเดลใหญ่มากตัวดูของ Apple อาจเปิดช้าหรือไม่เปิดเลย บอกไว้ก่อนดีกว่าให้เดา
            if (mb > 60) {
                setStatus(`ไฟล์ AR ที่ได้มีขนาด ${mb.toFixed(0)} MB — ตัวดู AR ของ iPhone อาจใช้เวลาเปิดนาน<br><span style="font-size:11.5px;color:#657182;">ถ้าเปิดไม่ขึ้น แนะนำให้ผู้ดูแลระบบทำ QR จากโมเดลที่เล็กกว่า</span>`, false);
                setTimeout(() => setStatus(''), 4000);
            } else {
                setStatus('');
            }
        } catch (err) {
            console.error('[AR] แปลง USDZ ไม่สำเร็จ:', err);
            setStatus('แปลงไฟล์ AR ไม่สำเร็จ<br><span style="font-size:11.5px;color:#657182;">โมเดลอาจใหญ่เกินกำลังเครื่อง — ดูแบบ 3 มิติในหน้านี้ได้ตามปกติ</span>', false);
            b.disabled = false;
            b.textContent = label;
            return;
        }
        b.disabled = false;
        b.textContent = label;
    }

    // Safari จะเปิด AR Quick Look ให้เฉพาะลิงก์ rel="ar" ที่ "มี element ลูกอยู่ข้างใน"
    // ถ้าใส่ <a> เปล่าๆ จะกลายเป็นการดาวน์โหลดไฟล์ธรรมดาแทน
    const a = document.createElement('a');
    a.rel = 'ar';
    a.href = usdzUrl;
    a.appendChild(document.createElement('img'));
    document.body.appendChild(a);
    a.click();
    a.remove();
}

renderer.xr.addEventListener('sessionstart', () => {
    inAR = true;
    placed = false;
    surfaceEverFound = false;
    arStartedAt = Date.now();
    modelRoot.visible = false;   // ยังไม่วาง — ซ่อนไว้ก่อนจนกว่าจะแตะพื้น
    controls.enabled = false;
    $('ar-actions').style.display = 'none';
    updateHint();
});
renderer.xr.addEventListener('sessionend', () => {
    inAR = false;
    placed = false;
    hitTestSource = null; hitTestRequested = false;
    reticle.visible = false;
    modelRoot.visible = true;
    modelRoot.position.set(0, 0, 0);
    modelRoot.rotation.set(0, 0, 0);
    modelRoot.scale.setScalar(1);
    controls.enabled = true;
    $('ar-actions').style.display = 'flex';
    clearHighlight();
    hitMarker.visible = false;
    closeInfo();
    resetView();
    updateHint();
});

// ---------- แตะ: วางโมเดล (AR) หรือเลือกชิ้นส่วน ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

// วางโมเดลลอยตรงหน้ากล้อง ~1.2 เมตร (ใช้ตอนตรวจจับพื้นไม่ติด) แล้วดึงลงระดับต่ำกว่าสายตานิดหน่อย
// ให้รู้สึกเหมือนวางอยู่บนโต๊ะ/พื้นตรงหน้า แทนที่จะลอยอยู่กลางอากาศระดับตา
function placeInFrontOfCamera() {
    const cam = renderer.xr.getCamera();
    const pos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    cam.getWorldPosition(pos);
    cam.getWorldDirection(dir);
    dir.y = 0;                       // เอาเฉพาะทิศแนวราบ ไม่งั้นเงยกล้องแล้วโมเดลลอยขึ้นฟ้า
    if (dir.lengthSq() < 1e-6) dir.set(0, 0, -1);
    dir.normalize();
    modelRoot.position.copy(pos).addScaledVector(dir, 1.2);
    modelRoot.position.y = pos.y - 0.6;
}

function placeModelNow() {
    if (reticle.visible) modelRoot.position.setFromMatrixPosition(reticle.matrix);
    else if (canPlaceAnyway()) placeInFrontOfCamera();
    else return false;                 // ยังหาพื้นอยู่ ยังไม่ถึงเวลาให้วางมั่ว
    modelRoot.visible = true;
    placed = true;
    reticle.visible = false;
    updateHint();
    return true;
}

// เมื่อขอ dom-overlay ผ่าน เบราว์เซอร์จะส่ง pointer event ของ DOM มาให้ระหว่างอยู่ใน AR ด้วย
// ทำให้รู้ "พิกัดนิ้วจริง" ได้ ถ้าไม่ผ่าน (บางเครื่อง) จะไม่มี event เลย จึงต้องมีทางสำรอง
// เป็นการยิงเรย์จากกลางจอผ่าน controller select แทน
let domPointerWorks = false;

const arController = renderer.xr.getController(0);
arController.addEventListener('select', () => {
    if (!inAR) return;
    if (!placed) { placeModelNow(); return; }
    // มี DOM event ใช้ได้แล้ว -> ปล่อยให้ handler ฝั่ง DOM จัดการ (มันรู้พิกัดนิ้วจริง)
    // ไม่งั้นจะเลือกซ้ำสองครั้งต่อการแตะหนึ่งครั้ง
    if (domPointerWorks) return;
    pointer.set(0, 0);               // ทางสำรอง: เล็งกลางจอ
    pickAt(pointer);
});
scene.add(arController);

// ---------- แตะ / ลากหมุน ----------
// ฟังที่ window เพราะตอนอยู่ใน AR event จะมาที่ DOM overlay ไม่ใช่ canvas
let downPos = null, downTime = 0, rotatingAR = false, lastRotX = 0;
const TAP_MOVE_PX = 10;

addEventListener('pointerdown', e => {
    if (e.target.closest && e.target.closest('#ar-info, #ar-actions, button')) return; // แตะ UI ไม่ใช่แตะโมเดล
    if (inAR) domPointerWorks = true;
    downPos = { x: e.clientX, y: e.clientY };
    downTime = Date.now();
    lastRotX = e.clientX;
    rotatingAR = false;
});

addEventListener('pointermove', e => {
    if (!downPos || !inAR || !placed) return;
    if (!rotatingAR && Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > TAP_MOVE_PX) rotatingAR = true;
    if (!rotatingAR) return;
    // ลากซ้าย-ขวา = หมุนโมเดลรอบแกนตั้ง (ผู้ใช้ขอ "AR หมุนได้มั้ย")
    modelRoot.rotation.y += (e.clientX - lastRotX) * 0.008;
    lastRotX = e.clientX;
});

addEventListener('pointerup', e => {
    if (!downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    const held = Date.now() - downTime;
    const wasRotating = rotatingAR;
    downPos = null;
    rotatingAR = false;
    if (wasRotating) return;                       // เพิ่งหมุนอยู่ ไม่ใช่การแตะเลือก
    if (moved > TAP_MOVE_PX || held > 600) return; // ลากหมุนกล้อง/กดค้าง ไม่ใช่การเลือก

    if (inAR && !placed) { placeModelNow(); return; }
    // แตะที่ "พิกัดนิ้วจริง" ทั้งในโหมด AR และโหมดพรีวิว 3 มิติ
    // เดิมตอน AR ยิงเรย์จากกลางจอเสมอ จึงได้ชิ้นเดิมซ้ำๆ ไม่ว่าจะแตะตรงไหน
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    pickAt(pointer);
});

function pickAt(ndc) {
    if (!modelInner) return;
    raycaster.setFromCamera(ndc, inAR ? renderer.xr.getCamera() : camera);
    const hits = raycaster.intersectObject(modelRoot, true);
    if (hits.length) {
        highlightMesh(hits[0].object);
        showHitMarker(hits[0].point);
        showInfo(hits[0].object);
    } else {
        closeInfo(); // เคลียร์ไฮไลท์+จุดให้ด้วยอยู่แล้ว
    }
}

// ---------- ไฮไลท์ชิ้นที่แตะ ----------
// เปลี่ยนวัสดุของชิ้นที่เลือกให้เรืองแสง + ปักจุดตรงตำแหน่งที่นิ้วแตะโดน
// เพื่อให้เห็นชัดว่า "ข้อมูลที่ขึ้นอยู่นี้เป็นของชิ้นไหน" โดยเฉพาะโมเดลที่มีหลายพันชิ้น
const HIGHLIGHT_COLOR = 0x22d3ee;
let highlighted = null, highlightPrevMat = null, highlightTmpMat = null;

function clearHighlight() {
    if (highlighted && highlightPrevMat) highlighted.material = highlightPrevMat;
    if (highlightTmpMat) { highlightTmpMat.dispose(); highlightTmpMat = null; }
    highlighted = null;
    highlightPrevMat = null;
}

function highlightMesh(mesh) {
    if (highlighted === mesh) return;
    clearHighlight();
    highlightPrevMat = mesh.material;
    // clone วัสดุเดิมเพื่อไม่ให้ไปกระทบชิ้นอื่นที่ใช้วัสดุร่วมกันอยู่
    const base = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const mat = base && base.clone ? base.clone() : new THREE.MeshStandardMaterial();
    if ('emissive' in mat) {
        mat.emissive = new THREE.Color(HIGHLIGHT_COLOR);
        mat.emissiveIntensity = 1.1;
    } else if (mat.color) {
        mat.color = new THREE.Color(HIGHLIGHT_COLOR); // วัสดุแบบ Basic ไม่มี emissive
    }
    mesh.material = mat;
    highlightTmpMat = mat;
    highlighted = mesh;
}

// จุดวงกลมเล็กๆ ตรงตำแหน่งที่แตะโดน — depthTest ปิดไว้ให้เห็นแม้จุดจะอยู่หลังผิวชิ้นอื่น
const hitMarker = new THREE.Mesh(
    new THREE.SphereGeometry(1, 16, 12),
    new THREE.MeshBasicMaterial({ color: HIGHLIGHT_COLOR, depthTest: false, transparent: true, opacity: 0.95 })
);
hitMarker.renderOrder = 999;
hitMarker.visible = false;
scene.add(hitMarker);

function showHitMarker(point) {
    hitMarker.position.copy(point);
    // ขนาดจุดต้องคงที่เมื่อมองจากผู้ใช้ ไม่ว่าจะยืนใกล้หรือไกลโมเดล
    const camPos = new THREE.Vector3();
    (inAR ? renderer.xr.getCamera() : camera).getWorldPosition(camPos);
    hitMarker.scale.setScalar(Math.max(camPos.distanceTo(point) * 0.012, 0.004));
    hitMarker.visible = true;
}

// ---------- การ์ดข้อมูล ----------
function showInfo(mesh) {
    const info = infoForMesh(mesh);
    // โมเดลที่ export จาก CAD มักตั้งชื่อชิ้นส่วนซ้ำกันหมด (เช่น "Cube" หรือ "เมช6003")
    // และส่วนใหญ่ยังไม่ได้กำหนดข้อมูลเฉพาะไว้ ถ้าโชว์แค่ชื่อ ผู้ใช้จะรู้สึกว่า
    // "แตะกี่ครั้งก็ขึ้นอันเดิม" ทั้งที่คนละชิ้นกัน จึงต่อรหัสสั้นๆ ต่อท้ายให้แยกออก
    // และบอกตรงๆ ว่าชิ้นนี้ยังไม่มีข้อมูลเฉพาะ กำลังแสดงข้อมูลมาตรฐานทั่วไปอยู่
    const isGeneric = (info === DEFAULT_INFO);
    const shortId = mesh.uuid.slice(0, 4).toUpperCase();
    $('ar-info-name').textContent = (info.name || mesh.name || 'ชิ้นส่วน') + (isGeneric ? ` · #${shortId}` : '');
    $('ar-info-desc').textContent = info.desc || '';
    const tag = $('ar-info-tag');
    tag.className = 'tag ' + (info.colorClass || 'tag-blue');
    tag.textContent = mesh.userData.originalName || mesh.name || 'ชิ้นส่วน';
    const steps = $('ar-info-steps');
    steps.innerHTML = '';
    (info.steps || []).forEach(s => {
        const d = document.createElement('div');
        d.className = 'step';
        d.textContent = s;
        steps.appendChild(d);
    });
    if (isGeneric) {
        const note = document.createElement('div');
        note.style.cssText = 'margin-top:10px;font-size:11px;color:#657182;line-height:1.6;';
        note.textContent = 'ℹ️ ชิ้นส่วนนี้ยังไม่ได้กำหนดข้อมูลเฉพาะไว้ — กำลังแสดงข้อมูลมาตรฐานทั่วไป กำหนดข้อมูลรายชิ้นได้ที่หน้า Metaverse';
        steps.appendChild(note);
    }
    $('ar-info').classList.add('open');
}
// ปิดการ์ด = เลิกเลือกชิ้นนั้น จึงต้องเอาไฮไลท์กับจุดที่ปักไว้ออกด้วย ไม่งั้นจะค้างเรืองแสงทั้งที่ไม่มีข้อมูลแสดงแล้ว
function closeInfo() {
    $('ar-info').classList.remove('open');
    clearHighlight();
    hitMarker.visible = false;
}
$('ar-info-close').addEventListener('click', closeInfo);

$('ar-reset').addEventListener('click', () => {
    resetView();
    clearHighlight();
    hitMarker.visible = false;
    closeInfo();
});

// ---------- ลูปเรนเดอร์ ----------
let lastHintAt = 0;
renderer.setAnimationLoop((timestamp, frame) => {
    if (inAR && frame && !placed) {
        const session = renderer.xr.getSession();
        if (!hitTestRequested) {
            hitTestRequested = true;
            session.requestReferenceSpace('viewer')
                .then(space => session.requestHitTestSource({ space }))
                .then(src => { hitTestSource = src; })
                .catch(err => console.warn('[AR] hit-test ใช้ไม่ได้:', err));
        }
        if (hitTestSource) {
            const results = frame.getHitTestResults(hitTestSource);
            if (results.length) {
                const pose = results[0].getPose(renderer.xr.getReferenceSpace());
                reticle.visible = true;
                reticle.matrix.fromArray(pose.transform.matrix);
                surfaceEverFound = true;
            } else {
                reticle.visible = false;
            }
        }
        // อัปเดตคำแนะนำเป็นระยะ (ไม่ทุกเฟรม) ให้ผู้ใช้รู้ว่าตอนนี้ระบบอยู่ขั้นไหน
        if (timestamp - lastHintAt > 500) { lastHintAt = timestamp; updateHint(); }
    }
    if (!inAR) controls.update();
    renderer.render(scene, camera);
});

// ---------- ดึงข้อมูลชิ้นส่วนจาก server (watcher ไม่ต้องล็อกอิน) ----------
(function connectForPartData() {
    if (typeof io === 'undefined') return;
    try {
        const sock = io(window.AEC_SERVER_URL || location.origin, {
            transports: ['websocket', 'polling'],
            auth: { role: 'watcher' }
        });
        sock.on('self_init', data => {
            if (data.workflowDb) workflowDb = data.workflowDb;
            if (data.typeAssignments) typeAssignments = data.typeAssignments;
        });
        sock.on('connect_error', () => { /* ไม่มีข้อมูลชิ้นส่วนก็ยังดูโมเดลได้ ไม่ต้องรบกวนผู้ใช้ */ });
    } catch (err) {
        console.warn('[AR] เชื่อมต่อข้อมูลชิ้นส่วนไม่สำเร็จ:', err);
    }
})();
