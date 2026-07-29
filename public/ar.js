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

        // จัดกล้องให้พอดีกับโมเดล "ตามสัดส่วนจริงของมัน" — ตั้งค่าคงที่ไว้ไม่ได้ เพราะโมเดลที่
        // เตี้ยแต่ยาว (เช่น ผังโรงงาน) พอย่อด้วยด้านที่ยาวสุดแล้วจะเตี้ยมาก กล้องจะเล็งเลยหัวไป
        // จนกลางจอไม่โดนตัวโมเดล (แตะกลางจอแล้วไม่โดนอะไรเลย)
        homeTarget.set(0, (size.y * scale) / 2, 0);
        homeCamera.set(0, Math.max(size.y * scale, 0.35) * 0.9, 2.1);
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
    if (!inAR) { h.textContent = 'ลากเพื่อหมุน · หนีบนิ้วเพื่อซูม · แตะชิ้นส่วนเพื่อดูข้อมูล'; return; }
    if (placed) { h.textContent = 'แตะที่ชิ้นส่วนเพื่อดูข้อมูล'; return; }
    if (reticle.visible) h.textContent = '✅ เจอพื้นแล้ว — แตะเพื่อวางโมเดล';
    else if (canPlaceAnyway()) h.textContent = 'ยังหาพื้นไม่เจอ — แตะหน้าจอเพื่อวางโมเดลตรงหน้าคุณเลย';
    else h.textContent = 'ส่ายมือถือช้าๆ ให้เห็นพื้น (ที่มีแสงพอและมีลวดลาย) เพื่อให้ระบบจับพื้นได้';
}

// เครื่องที่ไม่รองรับ WebXR AR (เช่น iPhone) ให้ซ่อนปุ่ม AR แล้วบอกตรงๆ ว่าดูได้แบบ 3 มิติ
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
            showArUnsupported();
        }
    }).catch(showArUnsupported);
} else {
    showArUnsupported();
}

function showArUnsupported() {
    const b = $('ar-enter');
    b.disabled = true;
    b.textContent = '📱 อุปกรณ์นี้ไม่รองรับ AR';
    b.title = 'AR ต้องใช้ Chrome บน Android ที่รองรับ WebXR — เครื่องอื่นดูแบบ 3 มิติได้ตามปกติ';
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
    modelRoot.quaternion.identity();
    modelRoot.scale.setScalar(1);
    controls.enabled = true;
    $('ar-actions').style.display = 'flex';
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

const arController = renderer.xr.getController(0);
arController.addEventListener('select', () => {
    if (!inAR) return;
    if (!placed) {
        if (reticle.visible) {
            modelRoot.position.setFromMatrixPosition(reticle.matrix);
        } else if (canPlaceAnyway()) {
            placeInFrontOfCamera();
        } else {
            return; // ยังหาพื้นอยู่ ยังไม่ถึงเวลาให้วางมั่ว
        }
        modelRoot.visible = true;
        placed = true;
        reticle.visible = false;
        updateHint();
        return;
    }
    // วางแล้ว -> ยิงเรย์จากกลางจอ (ทิศที่ผู้ใช้เล็งอยู่) เพื่อเลือกชิ้นส่วน
    pointer.set(0, 0);
    pickAt(pointer);
});
scene.add(arController);

// โหมดพรีวิว 3 มิติ: แตะ/คลิกที่ชิ้นส่วน (แยกจากการลากหมุนกล้อง)
let downPos = null, downTime = 0;
renderer.domElement.addEventListener('pointerdown', e => { downPos = { x: e.clientX, y: e.clientY }; downTime = Date.now(); });
renderer.domElement.addEventListener('pointerup', e => {
    if (inAR || !downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    const held = Date.now() - downTime;
    downPos = null;
    if (moved > 8 || held > 600) return; // ถือว่าลากหมุนกล้อง ไม่ใช่การเลือก
    pointer.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
    pickAt(pointer);
});

function pickAt(ndc) {
    if (!modelInner) return;
    raycaster.setFromCamera(ndc, inAR ? renderer.xr.getCamera() : camera);
    const hits = raycaster.intersectObject(modelRoot, true);
    if (hits.length) showInfo(hits[0].object);
    else closeInfo();
}

// ---------- การ์ดข้อมูล ----------
function showInfo(mesh) {
    const info = infoForMesh(mesh);
    $('ar-info-name').textContent = info.name || mesh.name || 'ชิ้นส่วน';
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
    $('ar-info').classList.add('open');
}
function closeInfo() { $('ar-info').classList.remove('open'); }
$('ar-info-close').addEventListener('click', closeInfo);

$('ar-reset').addEventListener('click', () => { resetView(); closeInfo(); });

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
