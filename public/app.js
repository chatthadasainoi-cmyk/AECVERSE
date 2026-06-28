// --- 1. SETUP THREE.JS SCENE ---
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f14); // เปลี่ยนสีพื้นหลังให้เข้าธีมดาร์กโหมด

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 6, 12); 

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);

// สั่งผูกเข้ากับกล่อง Container เสมอ เพื่อป้องกันโครงสร้าง UI เพี้ยนแบบในรูปภาพ
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

// พื้นตารางกริดเรืองแสงสีเทอร์ควอยซ์
const gridHelper = new THREE.GridHelper(60, 60, 0x00ffff, 0x1e293b);
scene.add(gridHelper);

let factoryModel = null;
let avatarModel = null; // จะเก็บตัวละครทรงแท่งแคปซูลแทน
let originalMaterials = new Map();
let currentMaterialMode = 'solid'; 
let initialFactoryScale = 1;

let activeSelectedMeshUUID = null; 
let activeSelectedKeyKey = "default";
let factoryColliders = [];

const moveStatus = { forward: false, backward: false, left: false, right: false };
const avatarConfig = { speed: 0.12, turnSpeed: 0.045, radius: 0.35 };
const jumpConfig = { velocity: 0, gravity: -0.012, jumpForce: 0.24, isJumping: false, groundY: 0.9 }; // groundY ปรับตามกึ่งกลางความสูงแคปซูล
const defaultCameraOffset = new THREE.Vector3(0, 2.5, 5);

// ฐานข้อมูลตรวจสอบความปลอดภัยของระบบไบโอแก๊ส
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

// --- 2. 🛡️ สร้าง AVATAR แบบแท่งกระบอกแคปซูลอัตโนมัติ (ไม่ต้องโหลดไฟล์แล้ว) ---
function createProceduralAvatar() {
    const avatarGroup = new THREE.Group();

    // ตัวตน (Body Cylinder)
    const bodyGeom = new THREE.CylinderGeometry(avatarConfig.radius, avatarConfig.radius, 1.2, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ 
        color: 0xff9900, 
        emissive: 0x331100,
        roughness: 0.2, 
        metalness: 0.8 
    });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.y = 0.6;
    avatarGroup.add(bodyMesh);

    // ส่วนหัว (Head Sphere)
    const headGeom = new THREE.SphereGeometry(avatarConfig.radius, 16, 16);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0x442200 });
    const headMesh = new THREE.Mesh(headGeom, headMat);
    headMesh.position.y = 1.2;
    avatarGroup.add(headMesh);

    // บีคอนบอกทิศทางหน้าของตัวละคร (Direction Indicator Pointer)
    const pointerGeom = new THREE.BoxGeometry(0.1, 0.1, 0.4);
    const pointerMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
    const pointerMesh = new THREE.Mesh(pointerGeom, pointerMat);
    pointerMesh.position.set(0, 0.9, -avatarConfig.radius - 0.1);
    avatarGroup.add(pointerMesh);

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

                // เก็บชื่อออริจินัลจากไฟล์ป้องกันการสูญหายเมื่อมีการแก้ไขชื่อเรียลไทม์
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
    if (e.key === 'ArrowUp' || key === 'w','ไ') moveStatus.forward = true;
    if (e.key === 'ArrowDown' || key === 's','ห') moveStatus.backward = true;
    if (e.key === 'ArrowLeft' || key === 'a','ฟ') moveStatus.left = true;
    if (e.key === 'ArrowRight' || key === 'd','ก') moveStatus.right = true;
    if (e.key === ' ' && !jumpConfig.isJumping) triggerAvatarJump();

    if (key === 'h') togglePanelElement('dashboard');
    if (key === 'm') togglePanelElement('details-panel');
    if (key === 'p') togglePanelElement('process-panel');
    if (key === 't') togglePanelElement('transform-panel');
    if (key === 'r') resetCameraToAvatar();
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (e.key === 'ArrowUp' || key === 'w') moveStatus.forward = false;
    if (e.key === 'ArrowDown' || key === 's') moveStatus.backward = false;
    if (e.key === 'ArrowLeft' || key === 'a') moveStatus.left = false;
    if (e.key === 'ArrowRight' || key === 'd') moveStatus.right = false;
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

    // 💡 [จุดแก้ไขข้อที่ 1] ค้นหาคีย์ที่ถูกต้องที่สุดแบบย้อนกลับ: ตรวจสอบจากชื่อดั้งเดิมหรือรหัส UUID เครือข่ายก่อนหล่นไปหาค่า Default
    const origName = targetMesh._original3DName || targetMesh.name || meshName;
    let databaseKey = "default";

    if (workflowDatabase[origName]) databaseKey = origName;
    else if (workflowDatabase[targetMesh.name]) databaseKey = targetMesh.name;
    else if (workflowDatabase[targetMesh.uuid]) databaseKey = targetMesh.uuid;
    else {
        // หากไม่มีในฐานข้อมูลแก้ไขสด ให้วิ่งเข้าลูปเช็กประเภทคำดั้งเดิมของตัวโรงงาน
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

    if (moveStatus.left) avatarModel.rotation.y += avatarConfig.turnSpeed;
    if (moveStatus.right) avatarModel.rotation.y -= avatarConfig.turnSpeed;

    let moveVector = new THREE.Vector3(0, 0, 0);
    if (moveStatus.forward) moveVector.z = -avatarConfig.speed;
    if (moveStatus.backward) moveVector.z = avatarConfig.speed;
    moveVector.applyQuaternion(avatarModel.quaternion);

    const isMoving = moveVector.lengthSq() > 0;

    if (isMoving) {
        let nextX = avatarModel.position.x + moveVector.x;
        let nextZ = avatarModel.position.z + moveVector.z;
        let currentY = avatarModel.position.y - jumpConfig.groundY; 

        let collisionDetected = false;
        let targetStepY = jumpConfig.groundY; 

        for (let i = 0; i < factoryColliders.length; i++) {
            const col = factoryColliders[i];
            const box = col.box; 

            if (nextX + avatarConfig.radius > box.min.x && nextX - avatarConfig.radius < box.max.x &&
                nextZ + avatarConfig.radius > box.min.z && nextZ - avatarConfig.radius < box.max.z &&
                currentY < box.max.y && currentY + 1.6 > box.min.y) {
                
                const stepHeight = box.max.y - currentY;
                if (stepHeight > 0 && stepHeight <= 0.4) { 
                    if ((box.max.y + jumpConfig.groundY) > targetStepY) {
                        targetStepY = box.max.y + jumpConfig.groundY;
                    }
                } else {
                    collisionDetected = true;
                }
            }
        }

        if (!collisionDetected) {
            avatarModel.position.x = nextX;
            avatarModel.position.z = nextZ;
            if (targetStepY > jumpConfig.groundY) avatarModel.position.y = targetStepY;
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
                
                // ฝังคีย์ชื่อดั้งเดิมเอาไว้แมตช์กรณีแชร์ไฟล์ผ่าน Supabase
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

// --- Override saveLiveEdit: broadcast workflow changes ---
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

    // 💡 [จุดแก้ไขข้อที่ 2] บันทึกลง Local Database ด้วยคีย์ชื่อดั้งเดิมเพื่อซิงค์ลอจิกภายในเครื่องตัวเองด้วย
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
    const hex = parseInt(color.replace('#',''), 16);
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: hex, emissive: hex>>1, roughness: 0.3, metalness: 0.7 });
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.35,0.35,1.2,16), mat);
    body.position.y = 0.6; g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.35,16,16), new THREE.MeshStandardMaterial({color:hex}));
    head.position.y = 1.2; g.add(head);
    const ptr = new THREE.Mesh(new THREE.BoxGeometry(0.1,0.1,0.4), new THREE.MeshBasicMaterial({color:0xffffff}));
    ptr.position.set(0,0.9,-0.45); g.add(ptr);
    return g;
}

function setAvatarLabel(g, name, color) {
    if (g._label) { g.remove(g._label); g._label.material.map.dispose(); }
    const c = document.createElement('canvas'); c.width=256; c.height=64;
    const ctx = c.getContext('2d');
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.roundRect(4,4,248,56,10); ctx.fill();
    ctx.font='bold 24px Arial'; ctx.fillStyle=color||'#fff'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText(name.substring(0,16), 128, 32);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),depthTest:false}));
    sp.scale.set(1.8,0.45,1); sp.position.y=2.1;
    g.add(sp); g._label = sp;
}

function addRemote(data) {
    if (remoteAvatars[data.id]) return;
    const av = buildRemoteAvatar(data.color||'#fff');
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
    mpSocket.on('disconnect', () => { dot.style.background='#ef4444'; txt.innerText='การ接続ขาด...'; });

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

    // 💡 [จุดแก้ไขข้อที่ 3] ซิงค์คีย์ข้อความลงในฐานข้อมูลความปลอดภัยด้วยคีย์ชื่อดั้งเดิม (data.key) ให้ครอบคลุมทุกอุปกรณ์ในระบบเครือข่าย
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
