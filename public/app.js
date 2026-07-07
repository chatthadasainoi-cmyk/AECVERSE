// --- 1. SETUP THREE.JS SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f14);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 6, 12);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
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

// Type Database for mesh types
window.meshTypeDatabase = window.meshTypeDatabase || {};

// Workflow Database
const workflowDatabase = {
    "default": {
        "name": "โครงสร้างทั่วไป",
        "desc": "พื้นที่ส่วนสนับสนุนและโครงสร้างทั่วไปภายในสถานประกอบการแก๊ส",
        "tagText": "🛡️ พื้นที่ทั่วไป — โปรดปฏิบัติตามป้ายเตือนใกล้เคียง",
        "colorClass": "tag-blue",
        "steps": ["🛡️ สวมใส่เครื่องตรวจวัดก๊าซรั่วพกพา (4-Gas Detector)", "🔒 ปฏิบัติตามระบบ LOTO"]
    },
    "manhole": {
        "name": "ปากบ่อแมนโฮล (Manhole) — หลังคาถังหมัก",
        "desc": "จุดเข้าออกของพื้นที่อับอากาศบนหลังคาถังหมัก ห้ามเปิดหรือเข้า",
        "tagText": "⚠️ อันตราย! ที่อับอากาศ ห้ามเข้าโดยไม่ได้รับอนุญาต",
        "colorClass": "tag-red",
        "steps": ["⚠️ พื้นที่อับอากาศอันตรายสูงสุด (Confined Space)"]
    },
    "tank": {
        "name": "บ่อหมักและโดมเก็บก๊าซ (Digester Tank)",
        "desc": "ระบบถังหมักแบบ CSTR ปิดคลุมด้วยผ้าใบแรงดันสูง (HDPE Layer)",
        "tagText": "🔴 EX-ZONE 0: พื้นที่มีก๊าซไวไฟตลอดเวลา ห้ามเกิดประกายไฟ",
        "colorClass": "tag-red",
        "steps": ["🔴 EX-ZONE 0: ห้ามประกายไฟ อุปกรณ์ไฟฟ้าต้องเป็นชนิด Explosion-Proof"]
    },
    "pvrv": {
        "name": "จุดเชื่อมต่อ PVRV (Pressure/Vacuum Relief Valve)",
        "desc": "รอยต่อท่อระหว่างฐานหลังคาบ่อหมักกับอุปกรณ์นิรภัย PVRV",
        "tagText": "❌ ห้ามติดตั้งวาล์วปิดกั้น (Isolation Valve) คั่นกลาง",
        "colorClass": "tag-red",
        "steps": ["❌ ห้ามปิดวาล์วทางออกระหว่างโดมหมักกับอุปกรณ์นิรภัย PVRV"]
    },
    "flare": {
        "name": "หอเผาก๊าซทิ้งฉุกเฉิน (Enclosed Flare)",
        "desc": "ระบบเผาทำลายก๊าซชีวภาพส่วนเกินอัตโนมัติ เพื่อป้องกันแรงดันสะสม",
        "tagText": "📏 ระยะปลอดภัย: หอเผาก๊าซต้องห่างอาคาร/ถนนอย่างน้อย 7.5 เมตร",
        "colorClass": "tag-green",
        "steps": ["📏 ตัวหอเผาต้องเว้นระยะห่างอย่างปลอดภัยจากถนนและอาคารอื่น"]
    },
    "flame_arrester": {
        "name": "Flame Arrester — จุดดักเปลวไฟย้อนกลับ",
        "desc": "อุปกรณ์ป้องกันเปลวไฟย้อนกลับเข้าสู่ระบบ",
        "tagText": "🔥 Flame Arrester: ป้องกันเปลวไฟย้อนกลับ ต้องล้างไส้กรองสม่ำเสมอ",
        "colorClass": "tag-orange",
        "steps": ["🔥 Flame Arrester: อุปกรณ์ดักเปลวไฟย้อนกลับ"]
    },
    "pipe": {
        "name": "ระบบท่อส่งแก๊สชีวภาพ (Biogas Piping)",
        "desc": "แนวเส้นท่อสำหรับส่งผ่านก๊าซมีเทนดิบ",
        "tagText": "ท่อก๊าซชีวภาพ (Biogas) ➡ [ความลาดเอียง 2% เพื่อดักน้ำ]",
        "colorClass": "tag-orange",
        "steps": ["➡ แนวท่อต้องลาดเอียงไม่น้อยกว่า 2%"]
    },
    "lightning_rod": {
        "name": "เสาล่อฟ้าแบบแยกอิสระ",
        "desc": "ระบบป้องกันฟ้าผ่าที่ติดตั้งแยกอิสระจากโครงสร้างถังหมัก",
        "tagText": "⚡ เสาล่อฟ้าแบบแยกอิสระ (ครอบคลุมโดมก๊าซ 100%)",
        "colorClass": "tag-orange",
        "steps": ["⚡ เสาล่อฟ้าต้องคลุมรัศมีโดมเก็บก๊าซทั้งหมด 100%"]
    },
    "loto": {
        "name": "จุดทำ LOTO — ตู้ควบคุมไฟฟ้าหลัก (MCC)",
        "desc": "จุดติดตั้งระบบ Lockout/Tagout บริเวณหน้าตู้ควบคุมไฟฟ้าหลัก",
        "tagText": "🔒 จุดทำ LOTO: คล้องกุญแจและแขวนป้ายก่อนซ่อมบำรุง",
        "colorClass": "tag-blue",
        "steps": ["🔒 คล้องกุญแจ Lockout และแขวนป้าย Tagout ก่อนเริ่มงาน"]
    },
    "ppe_checkpoint": {
        "name": "จุดตรวจ PPE — ทางเข้าลานบ่อหมัก",
        "desc": "จุดตรวจสอบอุปกรณ์ป้องกันส่วนบุคคลก่อนเข้าพื้นที่ปฏิบัติงาน",
        "tagText": "🛡️ สวมใส่เครื่องวัดก๊าซพกพา (4-Gas Detector) ก่อนเข้า",
        "colorClass": "tag-blue",
        "steps": ["🛡️ สวมใส่เครื่องตรวจวัดก๊าซรั่วพกพา (4-Gas Detector)"]
    },
    "esd": {
        "name": "ปุ่มหยุดฉุกเฉิน (ESD) — หน้า���าคารเครื่องยนต์",
        "desc": "ปุ่มฉุกเฉินสีแดงติดตั้งหน้าอาคารเครื่องยนต์",
        "tagText": "🚨 ESD Button: กดเพื่อตัดการทำงานเครื่องยนต์และวาล์วทันที",
        "colorClass": "tag-green",
        "steps": ["🚨 ติดตั้งปุ่มหยุดฉุกเฉิน (ESD) นอกห้องเครื่องยนต์"]
    },
    "utilization": {
        "name": "ระบบใช้ประโยชน์ก๊าซ & เครื่องยนต์ (Genset)",
        "desc": "อาคารติดตั้งเครื่องยนต์ผลิตกระแสไฟฟ้าจากก๊าซชีวภาพ",
        "tagText": "📏 ระยะห่างเครื่องยนต์: ต้องห่างจากบ่อหมักอย่างน้อย 15 เมตร",
        "colorClass": "tag-green",
        "steps": ["📏 ระยะห่างอาคารเครื่องกำเนิดไฟฟ้าต้องอยู่ห่างบ่อหมัก"]
    }
};

// --- 2. AVATAR วิศวกร Low-poly ---
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
                const typeLabel = document.createElement('span');
                typeLabel.className = 'mesh-type-tag';
                typeLabel.textContent = window.meshTypeDatabase[mName] || 'ไม่ได้กำหนด';
                
                const nameSpan = document.createElement('span');
                nameSpan.textContent = `🏭 ${mName}`;
                
                item.appendChild(nameSpan);
                item.appendChild(typeLabel);
                item.id = `mesh-item-${child.uuid}`;
                
                // Click to show type selector
                item.addEventListener('click', (e) => {
                    e.stopPropagation();
                    window.showTypeSelector(mName);
                });
                
                // Also highlight mesh on click
                item.addEventListener('dblclick', () => {
                    highlightAndShowWorkflow(child, mName, "คลิกเลือกโมเดล");
                });
                
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

const HITBOX_PADDING = 0.6;
function buildColliders() {
    factoryColliders = [];
    if (!factoryModel) return;
    factoryModel.updateMatrixWorld(true);
    factoryModel.traverse(function (child) {
        if (child.isMesh) {
            const meshBox = new THREE.Box3().setFromObject(child);
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
            text: isFreeLook ? '🎥 โหมด Free Look' : '👤 กลับสู่โหมดติดตา'
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
        if (nameLower.includes("manhole")) databaseKey = "manhole";
        else if (nameLower.includes("pvrv")) databaseKey = "pvrv";
        else if (nameLower.includes("flame")) databaseKey = "flame_arrester";
        else if (nameLower.includes("lightning")) databaseKey = "lightning_rod";
        else if (nameLower.includes("loto")) databaseKey = "loto";
        else if (nameLower.includes("ppe")) databaseKey = "ppe_checkpoint";
        else if (nameLower.includes("esd")) databaseKey = "esd";
        else if (nameLower.includes("tank")) databaseKey = "tank";
        else if (nameLower.includes("pipe")) databaseKey = "pipe";
        else if (nameLower.includes("flare")) databaseKey = "flare";
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

    document.getElementById('title-container').innerHTML = `
        <input type="text" id="input-edit-title" class="ui-edit-input" style="font-weight:bold;" value="${currentData.name}">
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
                if (sideListItem) sideListItem.querySelector('span').innerText = `🏭 ${newTitle}`;
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
        const nextX = avatarModel.position.x + moveVector.x;
        const nextZ = avatarModel.position.z + moveVector.z;
        const currentY = avatarModel.position.y - jumpConfig.groundY;

        avatarModel.position.x = nextX;
        avatarModel.position.z = nextZ;

        for (let i = 0; i < factoryColliders.length; i++) {
            const col = factoryColliders[i];
            const box = col.box;
            if (nextX + avatarConfig.radius > box.min.x && nextX - avatarConfig.radius < box.max.x &&
                nextZ + avatarConfig.radius > box.min.z && nextZ - avatarConfig.radius < box.max.z &&
                currentY < box.max.y && currentY + 1.6 > box.min.y) {
                highlightAndShowWorkflow(col.mesh, col.mesh.name || "พื้นที่อับอากาศ", "🚶 ตัวละครเดินชนวัตถุ");
                break;
            }
        }
    }

    const targetCamOffset = defaultCameraOffset.clone().applyMatrix4(avatarModel.matrixWorld);
    camera.position.lerp(targetCamOffset, 0.08);
    controls.target.set(avatarModel.position.x, avatarModel.position.y + 0.3, avatarModel.position.z);
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
// TYPE SELECTOR FUNCTIONS
// ============================================================
let currentSelectedMeshName = null;

window.showTypeSelector = function(meshName) {
    currentSelectedMeshName = meshName;
    const modal = document.getElementById('type-selector-modal');
    const meshNameDisplay = document.getElementById('modal-mesh-name');
    const dropdown = document.getElementById('type-selector-dropdown');
    
    meshNameDisplay.textContent = 'ชิ้นส่วน: ' + meshName;
    
    if (window.meshTypeDatabase[meshName]) {
        dropdown.value = window.meshTypeDatabase[meshName];
    } else {
        dropdown.value = '';
    }
    
    modal.style.display = 'flex';
};

window.confirmTypeSelection = function() {
    if (!currentSelectedMeshName) return;
    
    const dropdown = document.getElementById('type-selector-dropdown');
    const selectedType = dropdown.value;
    
    if (selectedType === '') {
        alert('กรุณาเลือกประเภท');
        return;
    }
    
    window.meshTypeDatabase[currentSelectedMeshName] = selectedType;
    
    const meshItems = document.querySelectorAll('.mesh-item');
    meshItems.forEach(item => {
        if (item.textContent.includes(currentSelectedMeshName)) {
            const typeTag = item.querySelector('.mesh-type-tag');
            if (typeTag) {
                typeTag.textContent = selectedType;
            }
        }
    });
    
    closeTypeSelector();
    console.log('บันทึก Type:', currentSelectedMeshName, '=', selectedType);
};

window.closeTypeSelector = function() {
    const modal = document.getElementById('type-selector-modal');
    modal.style.display = 'none';
    currentSelectedMeshName = null;
};

document.addEventListener('click', function(e) {
    const modal = document.getElementById('type-selector-modal');
    if (modal && e.target === modal) {
        closeTypeSelector();
    }
});

// ============================================================
// MULTIPLAYER MODULE (Minimal setup)
// ============================================================
const remoteAvatars = {};
const remoteTargets = {};
const mpPlayerNames = {};
const mpPlayerColors = {};
let mpMyId = null;
let mpMyColor = '#00ffff';
let mpSocket = null;

function buildRemoteAvatar(color) {
    return createEngineerAvatar(color || '#4d96ff');
}

function setAvatarLabel(g, name, color) {
    if (g._label) { g.remove(g._label); g._label.material.map.dispose(); }
    const c = document.createElement('canvas'); c.width=256; c.height=64;
    const ctx = c.getContext('2d');
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(4,4,248,56);
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

let _lastSend = 0;
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

    mpSocket.on('chat_message', msg => mpAppendChat(msg));
}

initMultiplayer();
