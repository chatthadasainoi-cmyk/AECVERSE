// --- 1. SETUP THREE.JS SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f14);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 6, 12); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
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
const defaultCameraOffset = new THREE.Vector3(0, 2.5, 5); // Z+ = ด้านหลัง avatar
let freeLookMode = false; // F = toggle free look
const freeLookMove = { forward: false, backward: false, left: false, right: false };

const workflowDatabase = {
    "default": { 
        "name": "โครงสร้างทั่วไป", 
        "desc": "พื้นที่ส่วนสนับสนุนและโครงสร้างทั่วไปภายในสถานประกอบการแก๊สชีวภาพ", 
        "colorClass": "tag-blue",
        "steps": ["🛡️ สวมใส่เครื่องตรวจวัดก๊าซรั่วพกพา (4-Gas Detector)", "🔒 ปฏิบัติตามระบบ LOTO อย่างเคร่งคร่งก่อนเปิดฝาบำรุงรักษา"] 
    },
    "tank": { 
        "name": "บ่อหมักและโดมเก็บก๊าซ (Digester Tank)", 
        "desc": "ระบบถังหมักแบบ CSTR ปิดคลุมด้วยผ้าใบแรงดันสูง (HDPE Layer) มีความเสี่ยงก๊าซไวไฟและพื้นที่อับอากาศสูง", 
        "colorClass": "tag-red",
        "steps": ["⚠️ พื้นที่อับอากาศอันตรายสูงสุด (Confined Space) ต้องมีใบอนุญาตทำงานเท่านั้น", "🔴 EX-ZONE 0: ห้ามประกายไฟ อุปกรณ์ไฟฟ้าต้องเป็นชนิด Explosion-Proof", "❌ ห้ามปิดวาล์วทางออกระหว่างโดมหมักกับอุปกรณ์นิรภัย PVRV เด็ดขาด"] 
    },
    "pipe": { 
        "name": "ระบบท่อส่งแก๊สชีวภาพ (Biogas Piping)", 
        "desc": "แนวเส้นท่อสำหรับส่งผ่านก๊าซมีเทนดิบผ่านจุดดักน้ำและชุดกรองเพื่อเตรียมใช้งาน", 
        "colorClass": "tag-orange",
        "steps": ["🔥 Flame Arrester: อุปกรณ์ดักเปลวไฟย้อนกลับ ต้องถอดล้างไส้กรองตามรอบ", "➡ แนวท่อต้องลาดเอียงไม่น้อยกว่า 2% มุ่งสู่ถังดักน้ำเพื่อป้องกันน้ำขังขวางทางก๊าซ", "⚡ เสาล่อฟ้าต้องคลุมรัศมีโดมเก็บก๊าซทั้งหมด 100%"] 
    },
    "utilization": { 
        "name": "ระบบใช้ประโยชน์ก๊าซ & เครื่องยนต์ (Genset)", 
        "desc": "อาคารติดตั้งเครื่องยนต์ผลิตกระแสไฟฟ้าจากก๊าซชีวภาพและแผงควบคุมไฟแรงดันสูง", 
        "colorClass": "tag-green",
        "steps": ["🚨 ติดตั้งปุ่มหยุดฉุกเฉิน (ESD) นอกห้องเครื่องยนต์ในตำแหน่งเข้าถึงง่าย", "📏 ระยะห่างอาคารเครื่องกำเนิดไฟฟ้าต้องอยู่ห่างบ่อหมักไม่น้อยกว่า 15 เมตร", "🔒 ตัดสับคัตเอาต์พร้อมลงกลอน Lockout/Tagout ก่อนเอื้อมมือซ่อมห้องเครื่อง"] 
    },
    "flare": { 
        "name": "หอเผาก๊าซทิ้งฉุกเฉิน (Enclosed Flare)", 
        "desc": "ระบบเผาทำลายก๊าซชีวภาพส่วนเกินอัตโนมัติ เพื่อป้องกันแรงดันสะสมในระบบมากเกินไป", 
        "colorClass": "tag-green",
        "steps": ["📏 ตัวหอเผาต้องเว้นระยะห่างอย่างปลอดภัยจากถนนและอาคารอื่นไม่ต่ำกว่า 7.5 เมตร", "🔥 ชุดหัวจุดประกายไฟต้องเชื่อมระบบอัตโนมัติกับเซนเซอร์วัดแรงดันบ่อหมัก"] 
    }
};

// --- 2. ENGINEER AVATAR (Low-poly blocky style) ---
function createEngineerAvatar(helmetColor) {
    const group = new THREE.Group();
    const hex = helmetColor ? parseInt(String(helmetColor).replace('#',''), 16) : 0xff9900;

    const skinMat  = new THREE.MeshStandardMaterial({ color: 0xf4c08a, roughness: 0.8 });
    const suitMat  = new THREE.MeshStandardMaterial({ color: 0xff6600, roughness: 0.6 });
    const helmetMat= new THREE.MeshStandardMaterial({ color: hex, roughness: 0.3, metalness: 0.4 });
    const bootMat  = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.9 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x88ccff, transparent: true, opacity: 0.5 });
    const visibMat = new THREE.MeshStandardMaterial({ color: 0xffff00, roughness: 0.5 });

    // Body
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.65, 0.3), suitMat);
    torso.position.y = 0.95; group.add(torso);
    // Hi-vis stripe
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.07, 0.31), visibMat);
    stripe.position.y = 0.95; group.add(stripe);
    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.36, 0.35), skinMat);
    head.position.y = 1.44; group.add(head);
    // Helmet
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.18, 0.41), helmetMat);
    helmet.position.y = 1.65; group.add(helmet);
    const brim = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.04, 0.48), helmetMat);
    brim.position.y = 1.56; group.add(brim);
    // Visor
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.1, 0.04), glassMat);
    visor.position.set(0, 1.43, 0.178); group.add(visor);
    // Eyes
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
    const eyeL = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.06, 0.03), eyeMat);
    eyeL.position.set(-0.08, 1.45, 0.178); group.add(eyeL);
    const eyeR = eyeL.clone(); eyeR.position.set(0.08, 1.45, 0.178); group.add(eyeR);
    // Arms
    const armGeo = new THREE.BoxGeometry(0.18, 0.52, 0.2);
    const armL = new THREE.Mesh(armGeo, suitMat); armL.position.set(-0.37, 0.88, 0); group.add(armL);
    const armR = new THREE.Mesh(armGeo, suitMat); armR.position.set( 0.37, 0.88, 0); group.add(armR);
    // Arm hi-vis
    const asL = new THREE.Mesh(new THREE.BoxGeometry(0.19, 0.06, 0.21), visibMat); asL.position.set(-0.37, 0.88, 0); group.add(asL);
    const asR = asL.clone(); asR.position.set(0.37, 0.88, 0); group.add(asR);
    // Hands
    const handGeo = new THREE.BoxGeometry(0.14, 0.13, 0.13);
    const handL = new THREE.Mesh(handGeo, skinMat); handL.position.set(-0.37, 0.6, 0); group.add(handL);
    const handR = handL.clone(); handR.position.set(0.37, 0.6, 0); group.add(handR);
    // Legs
    const legGeo = new THREE.BoxGeometry(0.22, 0.52, 0.24);
    const legL = new THREE.Mesh(legGeo, suitMat); legL.position.set(-0.15, 0.34, 0); group.add(legL);
    const legR = new THREE.Mesh(legGeo, suitMat); legR.position.set( 0.15, 0.34, 0); group.add(legR);
    // Boots
    const bootGeo = new THREE.BoxGeometry(0.24, 0.16, 0.3);
    const bootL = new THREE.Mesh(bootGeo, bootMat); bootL.position.set(-0.15, 0.05, 0.03); group.add(bootL);
    const bootR = bootL.clone(); bootR.position.set(0.15, 0.05, 0.03); group.add(bootR);
    // Direction pointer
    const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.3), new THREE.MeshBasicMaterial({color:0x00ffff}));
    ptr.position.set(0, 0.9, -0.3); group.add(ptr);
    // Shadow
    const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.3,16), new THREE.MeshBasicMaterial({color:0x000000,transparent:true,opacity:0.2}));
    shadow.rotation.x = -Math.PI/2; shadow.position.y = 0.01; group.add(shadow);

    // Store refs for walk animation
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
    avatarGroup.rotation.y = Math.PI; // หันหลังให้กล้อง
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
    const el = document.getElementById(elementId);
    if (el) el.style.display = (el.style.display === 'none') ? 'block' : 'none';
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

function buildColliders() {
    factoryColliders = [];
    if (!factoryModel) return;
    factoryModel.updateMatrixWorld(true);
    factoryModel.traverse(function (child) {
        if (child.isMesh) {
            const meshBox = new THREE.Box3().setFromObject(child);
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

// --- 4. KEYBOARD CONTROL CONTROL ---
window.addEventListener('keydown', (e) => {
    if(document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;
    const key = e.key.toLowerCase();
    
    // 💡 กดปุ่ม F หรือ ด เพื่อสลับโหมด Free Look
    if (key === 'f' || key === 'ด') {
        isFreeLook = !isFreeLook;
        if (!isFreeLook) {
            // ถ้าปิดโหมด Free Look ให้รีเซ็ตมุมกล้องกลับมาล็อกที่ตัวละครทันที
            resetCameraToAvatar();
        }
        // แสดงข้อความแจ้งเตือนในระบบแชทซิมูเลเตอร์
        mpAppendChat({
            name: 'ระบบกล้อง', 
            color: '#00ffff', 
            text: isFreeLook ? '🎥 เข้าสู่โหมด Free Look (ใช้ W A S D / ไ ฟ ห ก บินกล้อง)' : '👤 กลับสู่โหมดติดตามตัวละคร'
        });
        return;
    }

    // การควบคุมทิศทาง (รองรับคีย์บอร์ดภาษาอังกฤษ และ ภาษาไทย ไ-ฟ-ห-ก-ด)
    if (e.key === 'ArrowUp' || key === 'w' || key === 'ฟ' || key === 'ไ') moveStatus.forward = true;
    if (e.key === 'ArrowDown' || key === 's' || key === 'ห') moveStatus.backward = true;
    if (e.key === 'ArrowLeft' || key === 'a' || key === 'ฟ' || key === 'ภ' || key === 'ไ') moveStatus.left = true;
    if (e.key === 'ArrowRight' || key === 'd' || key === 'ด' || key === 'ก') moveStatus.right = true;
    
    // ตัวละครกระโดด (ทำงานเฉพาะตอนไม่ได้เปิดโหมด Free Look)
    if (e.key === ' ' && !jumpConfig.isJumping && !isFreeLook) triggerAvatarJump();

    // ปุ่มลัด UI อื่นๆ ยังสามารถกดได้ปกติแม้จะอยู่โหมด Free Look
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
    if (activeSelectedKeyKey === "pipe") {
        document.getElementById('iot-pressure').innerText = (1.5 + Math.random() * 0.5).toFixed(2) + " bar";
        document.getElementById('iot-temp').innerText = (31.2 + Math.random() * 1.5).toFixed(1) + " °C";
    } else if (activeSelectedKeyKey === "tank") {
        document.getElementById('iot-pressure').innerText = (0.04 + Math.random() * 0.03).toFixed(3) + " bar";
        document.getElementById('iot-temp').innerText = (37.5 + Math.random() * 0.8).toFixed(1) + " °C";
    } else {
        document.getElementById('iot-pressure').innerText = "0.00 bar";
        document.getElementById('iot-temp').innerText = "28.5 °C";
    }
}
setInterval(loopIotSimulation, 1500); 

function exportWorkflowDatabase() {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(workflowDatabase, null, 2));
    const a = document.createElement('a');
    a.setAttribute("href", dataStr);
    a.setAttribute("download", "biogas_safety_db.json");
    document.body.appendChild(a); a.click(); a.remove();
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
        factoryModel.position.set(
            parseFloat(document.getElementById('param-posX').value),
            parseFloat(document.getElementById('param-posY').value),
            parseFloat(document.getElementById('param-posZ').value)
        );
        factoryModel.rotation.y = parseFloat(document.getElementById('param-rotY').value) * (Math.PI / 180);
        const sc = parseFloat(document.getElementById('param-scale').value);
        factoryModel.scale.set(initialFactoryScale*sc, initialFactoryScale*sc, initialFactoryScale*sc);
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

    const origName = targetMesh._original3DName || targetMesh.name || meshName;
    let databaseKey = "default";
    if (workflowDatabase[origName]) databaseKey = origName;
    else if (workflowDatabase[targetMesh.name]) databaseKey = targetMesh.name;
    else if (workflowDatabase[targetMesh.uuid]) databaseKey = targetMesh.uuid;
    else {
        const nameLower = origName.toLowerCase();
        if (nameLower.includes("tank") || nameLower.includes("ถัง") || nameLower.includes("หมัก") || nameLower.includes("digester")) databaseKey = "tank";
        else if (nameLower.includes("pipe") || nameLower.includes("ท่อ") || nameLower.includes("line")) databaseKey = "pipe";
        else if (nameLower.includes("engine") || nameLower.includes("อาคาร") || nameLower.includes("generator") || nameLower.includes("utilization") || nameLower.includes("genset")) databaseKey = "utilization";
        else if (nameLower.includes("flare") || nameLower.includes("เผา")) databaseKey = "flare";
    }
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

// --- 8. AVATAR PHYSICS & COLLISION ---
function updateAvatarPhysics() {
    if (!avatarModel) return;
    if (document.activeElement.tagName === 'INPUT' || document.activeElement.tagName === 'TEXTAREA') return;

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

    if (moveStatus.left)  avatarModel.rotation.y += avatarConfig.turnSpeed;
    if (moveStatus.right) avatarModel.rotation.y -= avatarConfig.turnSpeed;

    let moveVector = new THREE.Vector3(0, 0, 0);
    if (moveStatus.forward)  moveVector.z = -avatarConfig.speed;
    if (moveStatus.backward) moveVector.z =  avatarConfig.speed;
    moveVector.applyQuaternion(avatarModel.quaternion);

    const isMoving = moveVector.lengthSq() > 0;
    animateEngineerWalk(avatarModel, isMoving);

    if (isMoving) {
        let nextX = avatarModel.position.x + moveVector.x;
        let nextZ = avatarModel.position.z + moveVector.z;
        let currentY = avatarModel.position.y - jumpConfig.groundY;
        let collisionDetected = false;
        let targetStepY = jumpConfig.groundY;

        for (let i = 0; i < factoryColliders.length; i++) {
            const box = factoryColliders[i].box;
            if (nextX + avatarConfig.radius > box.min.x && nextX - avatarConfig.radius < box.max.x &&
                nextZ + avatarConfig.radius > box.min.z && nextZ - avatarConfig.radius < box.max.z &&
                currentY < box.max.y && currentY + 1.6 > box.min.y) {
                const stepHeight = box.max.y - currentY;
                if (stepHeight > 0 && stepHeight <= 0.4) {
                    if ((box.max.y + jumpConfig.groundY) > targetStepY) targetStepY = box.max.y + jumpConfig.groundY;
                } else { collisionDetected = true; }
            }
        }

        if (!collisionDetected) {
            avatarModel.position.x = nextX;
            avatarModel.position.z = nextZ;
            if (targetStepY > jumpConfig.groundY) avatarModel.position.y = targetStepY;
        }
    }

    // Free look camera pan
    if (freeLookMode) {
        const panSpeed = 0.15;
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward); forward.y = 0; forward.normalize();
        const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0,1,0));
        if (freeLookMove.forward)  { camera.position.addScaledVector(forward,  panSpeed); controls.target.addScaledVector(forward,  panSpeed); }
        if (freeLookMove.backward) { camera.position.addScaledVector(forward, -panSpeed); controls.target.addScaledVector(forward, -panSpeed); }
        if (freeLookMove.left)     { camera.position.addScaledVector(right,   -panSpeed); controls.target.addScaledVector(right,   -panSpeed); }
        if (freeLookMove.right)    { camera.position.addScaledVector(right,    panSpeed); controls.target.addScaledVector(right,    panSpeed); }
    }
    if (!freeLookMode) {
        const targetCamOffset = defaultCameraOffset.clone().applyMatrix4(avatarModel.matrixWorld);
        camera.position.lerp(targetCamOffset, 0.08);
        controls.target.lerp(new THREE.Vector3(avatarModel.position.x, avatarModel.position.y + 0.8, avatarModel.position.z), 0.1);
        controls.enabled = false; // ล็อคกล้องตาม avatar
    } else {
        controls.enabled = true; // free look
    }

    if (factoryModel && isMoving) {
        let closestMesh = null; let minDistance = 2.5;
        factoryModel.traverse(function (child) {
            if (child.isMesh) {
                const meshWorldPos = new THREE.Vector3(); child.getWorldPosition(meshWorldPos);
                const dist = avatarModel.position.distanceTo(meshWorldPos);
                if (dist < minDistance) { minDistance = dist; closestMesh = child; }
            }
        });
        if (closestMesh) highlightAndShowWorkflow(closestMesh, closestMesh.name || "พื้นที่อับอากาศ", "🚶 ตัวละครเดินเข้าใกล้ตำแหน่ง");
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

// Override saveLiveEdit: broadcast workflow changes
const _origSaveLiveEdit = saveLiveEdit;
window.saveLiveEdit = function() {
    if (!activeSelectedMeshUUID) return;
    const titleEl = document.getElementById('input-edit-title');
    const descEl  = document.getElementById('input-edit-desc');
    const stepsEl = document.getElementById('input-edit-steps');
    const newTitle = titleEl ? titleEl.value.trim() : '';
    const newDesc  = descEl  ? descEl.value.trim()  : '';
    const newSteps = stepsEl ? stepsEl.value.split(',').map(s=>s.trim()).filter(Boolean) : [];

    let originalNameKey = activeSelectedMeshUUID;
    if (factoryModel) {
        factoryModel.traverse(function(child) {
            if (child.isMesh && child.uuid === activeSelectedMeshUUID) {
                originalNameKey = child._original3DName || child.name || child.uuid;
                if (!child._original3DName) child._original3DName = originalNameKey;
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
        const name  = mpPlayerNames[id] || (isMe ? 'คุณ' : id.slice(0,6));
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

    mpSocket.on('connect',    () => { dot.style.background='#22c55e'; txt.innerText='เชื่อมต่อแล้ว ✓'; });
    mpSocket.on('disconnect', () => { dot.style.background='#ef4444'; txt.innerText='การเชื่อมต่อขาด...'; });

    mpSocket.on('self_init', data => {
        mpMyId = data.self.id;
        mpMyColor = data.self.color;
        mpPlayerNames[mpMyId] = data.self.name;
        mpPlayerColors[mpMyId] = mpMyColor;
        document.getElementById('mp-name-input').value = data.self.name;
        if (avatarModel) avatarModel.position.set(data.self.position.x, data.self.position.y, data.self.position.z);
        data.others.forEach(p => addRemote(p));
        if (data.modelUrl)    loadModelFromUrl(data.modelUrl, data.modelName);
        if (data.workflowDb)  Object.assign(workflowDatabase, data.workflowDb);
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
                if (child.isMesh && !child._original3DName) child._original3DName = child.name;
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
