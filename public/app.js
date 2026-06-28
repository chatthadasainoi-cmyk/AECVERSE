// ============================================================
// --- 1. SETUP THREE.JS SCENE ---
// ============================================================
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

// ============================================================
// --- 2. GLOBAL VARIABLES & CONFIG ---
// ============================================================
let factoryModel = null;
let avatarModel = null; // จะเก็บ Object3D หลักของตัวละครเรา
let originalMaterials = new Map();
let currentMaterialMode = 'solid'; 
let initialFactoryScale = 1;

let activeSelectedMeshUUID = null; 
let activeSelectedKeyKey = "default";
let factoryColliders = [];

// ระบบควบคุมการกดปุ่ม
const moveStatus = { forward: false, backward: false, left: false, right: false };
let isFreeLook = false; 

const avatarConfig = { radius: 0.4, height: 1.6, speed: 6 };
const jumpConfig = { velocityY: 0, gravity: -22, jumpForce: 8.5, isGrounded: true, groundY: 0.05 };

// 🏃‍♂️ ตัวแปรระบบแอนิเมชัน 3D (FBX Mixer)
const clock = new THREE.Clock();
let avatarMixer = null;         // ตัวควบคุมแอนิเมชันของ "ตัวเรา"
let avatarWalkAction = null;     // ท่าเดินของเรา
const remoteMixers = {};        // ตัวควบคุมแอนิเมชันของ "คนอื่น"
const remoteWalkActions = {};   // ท่าเดินของคนอื่น

// ข้อมูลจำลองฐานข้อมูลชีวมวล (Workflow)
const workflowDatabase = {
    "default": { name: "ภาพรวมโรงงาน", desc: "ยินดีต้อนรับสู่ระบบ Metaverse ตรวจสอบความปลอดภัยโรงงานไบโอแก๊สอัจฉริยะ", steps: ["กด W,A,S,D เพื่อเดินควบคุมตัวละคร", "คลิกที่โมเดลเพื่อตรวจสอบข้อมูลความปลอดภัย", "เปิดแถบขวาเพื่อดูข้อมูล Telemetry สด"], colorClass: "tag-blue" }
};

// ============================================================
// --- 3. ANIMATED AVATAR LOADER (FBX + RIGGING) ---
// ============================================================
function createProceduralAvatar() {
    // โหลดไฟล์ตัวละครพื้นฐานก่อน (character.fbx)
    const fbxLoader = new THREE.FBXLoader();
    
    fbxLoader.load('character.fbx', function (fbx) {
        avatarModel = fbx;
        
        // ปรับขนาดโมเดล FBX จาก Mixamo มักจะใหญ่มาก ให้ย่อลงมาเท่าขนาดมนุษย์จริงในโรงงาน
        avatarModel.scale.set(0.012, 0.012, 0.012); 
        avatarModel.position.set(0, jumpConfig.groundY, 8);
        
        // ย้อมสีโมเดลตามสีผู้เล่นที่ระบบเซิร์ฟเวอร์สุ่มมาให้ (mpMyColor)
        applyAvatarColor(avatarModel, mpMyColor);

        // โหลดไฟล์อนิเมชันเดินตามเข้ามาประกอบร่าง (Catwalk Walk Forward HighKnees.fbx)
        fbxLoader.load('Catwalk Walk Forward HighKnees.fbx', function (animFbx) {
            avatarMixer = new THREE.AnimationMixer(avatarModel);
            
            if (animFbx.animations && animFbx.animations.length > 0) {
                // ดึงคลิปท่าเดินออกมา
                const walkClip = animFbx.animations[0];
                avatarWalkAction = avatarMixer.clipAction(walkClip);
                avatarWalkAction.play();
                avatarWalkAction.setEffectiveWeight(0); // เริ่มต้นให้หยุดยืนนิ่งก่อน
            }
            
            scene.add(avatarModel);
        }, undefined, function(err) {
            console.warn("ไม่พบไฟล์อนิเมชันเดิน, ตัวละครจะสไลด์ตัวแทน:", err);
            scene.add(avatarModel);
        });

    }, undefined, function (error) {
        console.error("โหลดโมเดล FBX ไม่สำเร็จ กำลังใช้แคปซูลจำลองแทนเพื่อให้เกมทำงานได้:", error);
        createBackupCapsuleAvatar();
    });
}

// ฟังก์ชันใช้ย้อมสีตัวละคร (ย้อมสีเสื้อผ้าและชิ้นส่วนเนื้อผิว)
function applyAvatarColor(model, colorHex) {
    model.traverse(function (child) {
        if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = true;
            
            // เปลี่ยนแมททีเรียลให้รองรับแสงเงาตามธีม พร้อมย้อมสีผู้เล่น
            child.material = new THREE.MeshStandardMaterial({
                color: new THREE.Color(colorHex),
                roughness: 0.5,
                metalness: 0.1
            });
        }
    });
}

// ระบบตัวละครสำรอง (กรณีไม่มีไฟล์ .fbx ในโฟลเดอร์)
function createBackupCapsuleAvatar() {
    const group = new THREE.Group();
    const geom = new THREE.CylinderGeometry(avatarConfig.radius, avatarConfig.radius, avatarConfig.height, 16);
    const mat = new THREE.MeshStandardMaterial({ color: parseInt(mpMyColor.replace('#',''), 16) });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.y = avatarConfig.height / 2;
    group.add(mesh);

    const eyeGeom = new THREE.BoxGeometry(0.3, 0.15, 0.3);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eye = new THREE.Mesh(eyeGeom, eyeMat);
    eye.position.set(0, 1.2, -0.3);
    group.add(eye);

    group.position.set(0, jumpConfig.groundY, 8);
    scene.add(group);
    avatarModel = group;
}

// ============================================================
// --- 4. CONTROLS & PHYSICS SYSTEM ---
// ============================================================
window.addEventListener('keydown', (e) => {
    const key = e.key.toLowerCase();
    if (document.activeElement.tagName === 'INPUT') return; 

    if (key === 'w' || key === 'arrowup') moveStatus.forward = true;
    if (key === 's' || key === 'arrowdown') moveStatus.backward = true;
    if (key === 'a' || key === 'arrowleft') moveStatus.left = true;
    if (key === 'd' || key === 'arrowright') moveStatus.right = true;
    
    if (key === 'f') {
        isFreeLook = !isFreeLook;
        const btn = document.getElementById('freelook-btn');
        if (btn) btn.classList.toggle('active', isFreeLook);
        mpAppendChat({ name: 'ระบบ', color: '#ffd93d', text: isFreeLook ? '👁️ เปิดโหมดกล้องอิสระ (ตัวละครจะไม่หันตามกล้อง)' : '👤 ปิดโหมดกล้องอิสระ' });
    }
    
    if (key === ' ' && jumpConfig.isGrounded) {
        jumpConfig.velocityY = jumpConfig.jumpForce;
        jumpConfig.isGrounded = false;
    }
});

window.addEventListener('keyup', (e) => {
    const key = e.key.toLowerCase();
    if (key === 'w' || key === 'arrowup') moveStatus.forward = false;
    if (key === 's' || key === 'arrowdown') moveStatus.backward = false;
    if (key === 'a' || key === 'arrowleft') moveStatus.left = false;
    if (key === 'd' || key === 'arrowright') moveStatus.right = false;
});

function updateAvatarPhysics(dt) {
    if (!avatarModel) return;

    let moveVector = new THREE.Vector3(0, 0, 0);
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    camDir.y = 0;
    camDir.normalize();

    const camSide = new THREE.Vector3(-camDir.z, 0, camDir.x);

    if (moveStatus.forward) moveVector.add(camDir);
    if (moveStatus.backward) moveVector.sub(camDir);
    if (moveStatus.left) moveVector.sub(camSide);
    if (moveStatus.right) moveVector.add(camSide);

    const isMoving = moveVector.lengthSq() > 0;

    if (isMoving) {
        moveVector.normalize();
        const nextPos = avatarModel.position.clone().addScaledVector(moveVector, avatarConfig.speed * dt);
        
        // ระบบตรวจจับการชนสิ่งกีดขวาง (Collision Grid)
        let collisionDetected = false;
        for (let col of factoryColliders) {
            const dist = nextPos.distanceTo(col.position);
            if (dist < (avatarConfig.radius + col.radius)) {
                collisionDetected = true;
                break;
            }
        }
        if (!collisionDetected) {
            avatarModel.position.copy(nextPos);
        }

        // หมุนโมเดลตัวละครหันหน้าไปทิศที่กดเดิน (เว้นแต่จะอยู่ในโหมด FreeLook)
        if (!isFreeLook) {
            const targetAngle = Math.atan2(moveVector.x, moveVector.z);
            avatarModel.rotation.y = targetAngle;
        }
    }

    // 🏃‍♂️ ขยับแอนิเมชันสับขาเดินตามการกดเคลื่อนที่
    if (avatarWalkAction) {
        if (isMoving) {
            // ค่อยๆ ปรับค่าน้ำหนักแอนิเมชันให้สับขาเดินอย่างเป็นธรรมชาติ
            avatarWalkAction.setEffectiveWeight(1);
        } else {
            avatarWalkAction.setEffectiveWeight(0);
        }
    }

    // ระบบแรงโน้มถ่วงและการกระโดด
    jumpConfig.velocityY += jumpConfig.gravity * dt;
    avatarModel.position.y += jumpConfig.velocityY * dt;

    if (avatarModel.position.y <= jumpConfig.groundY) {
        avatarModel.position.y = jumpConfig.groundY;
        jumpConfig.velocityY = 0;
        jumpConfig.isGrounded = true;
    }

    // ล็อคเป้ากล้องให้แพนศูนย์กลางตามตัวละครวิศวกรตลอดเวลา
    controls.target.copy(avatarModel.position).add(new THREE.Vector3(0, avatarConfig.height * 0.75, 0));

    // ส่งพิกัดตำแหน่งให้เซิร์ฟเวอร์ Multiplayer รับรู้ร่วมกัน
    if (window.mpSocket && mpSocket.connected) {
        mpSocket.emit('player_move', {
            position: { x: avatarModel.position.x, y: avatarModel.position.y, z: avatarModel.position.z },
            rotation: { y: avatarModel.rotation.y },
            isMoving: isMoving // ส่งสถานะว่ากำลังขยับหรือไม่ไปให้คนอื่นขยับขาตาม
        });
    }

    // อัปเดตข้อมูลพิกัดแดชบอร์ด UI
    document.getElementById('val-pos-x').innerText = avatarModel.position.x.toFixed(2);
    document.getElementById('val-pos-y').innerText = avatarModel.position.y.toFixed(2);
    document.getElementById('val-pos-z').innerText = avatarModel.position.z.toFixed(2);
}

// ============================================================
// --- 5. INDUSTRIAL FACTORY MODEL LOADER ---
// ============================================================
function loadModelFromUrl(url, fileName) {
    const container = document.getElementById('canvas-container');
    let loadingLog = document.getElementById('loading-log');
    if (!loadingLog) {
        loadingLog = document.createElement('div');
        loadingLog.id = 'loading-log';
        loadingLog.style.position = 'absolute';
        loadingLog.style.bottom = '70px';
        loadingLog.style.left = '20px';
        loadingLog.style.background = 'rgba(10,16,26,0.9)';
        loadingLog.style.padding = '10px 16px';
        loadingLog.style.borderRadius = '8px';
        loadingLog.style.fontSize = '12px';
        loadingLog.style.fontFamily = 'monospace';
        loadingLog.style.color = '#00ffff';
        loadingLog.style.zIndex = '99';
        loadingLog.style.border = '1px solid rgba(0,255,255,0.2)';
        container.appendChild(loadingLog);
    }
    
    loadingLog.innerText = `⏳ กำลังโหลดแบบจำลองโรงงาน: ${fileName}...`;
    
    if (factoryModel) scene.remove(factoryModel);
    factoryColliders = [];
    originalMaterials.clear();
    
    const extension = fileName.split('.').pop().toLowerCase();
    
    if (extension === 'gltf' || extension === 'glb') {
        const loader = new THREE.GLTFLoader();
        loader.load(url, function (gltf) {
            factoryModel = gltf.scene;
            setupFactoryScene(fileName, loadingLog);
        }, undefined, function (error) {
            loadingLog.innerText = `❌ ไม่สามารถโหลด GLTF ได้: ${error.message}`;
        });
    } else if (extension === 'fbx') {
        const loader = new THREE.FBXLoader();
        loader.load(url, function (fbx) {
            factoryModel = fbx;
            setupFactoryScene(fileName, loadingLog);
        }, undefined, function (error) {
            loadingLog.innerText = `❌ ไม่สามารถโหลด FBX ได้: ${error.message}`;
        });
    } else {
        loadingLog.innerText = `❌ ไม่รองรับรูปแบบไฟล์ .${extension} (กรุณาใช้ .gltf, .glb หรือ .fbx)`;
    }
}

function setupFactoryScene(fileName, logElement) {
    scene.add(factoryModel);
    
    // คำนวณขอบเขตขนาดของโรงงานอัจฉริยะอัตโนมัติเพื่อให้ตัวละครไม่จมดิน
    const box = new THREE.Box3().setFromObject(factoryModel);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    
    // ดึงฐานล่างโมเดลให้พอดีระดับพื้นกริดเสมอ
    factoryModel.position.y -= box.min.y;
    
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 200) {
        initialFactoryScale = 40 / maxDim;
        factoryModel.scale.set(initialFactoryScale, initialFactoryScale, initialFactoryScale);
    } else if (maxDim < 2) {
        initialFactoryScale = 15 / maxDim;
        factoryModel.scale.set(initialFactoryScale, initialFactoryScale, initialFactoryScale);
    } else {
        initialFactoryScale = 1;
    }
    
    // สร้าง Collider กล่องตรวจสอบชนสิ่งกีดขวาง และสร้างลิสต์รายชื่อวัตถุในแถบข้าง
    const meshListContainer = document.getElementById('mesh-list-container');
    if (meshListContainer) meshListContainer.innerHTML = '';
    
    factoryModel.traverse(function (child) {
        if (child.isMesh) {
            originalMaterials.set(child.uuid, child.material.clone());
            
            // ตรวจสอบและดึงวัตถุขนาดใหญ่มาเป็นเสาสิ่งกีดขวาง
            const wBox = new THREE.Box3().setFromObject(child);
            const wSize = wBox.getSize(new THREE.Vector3());
            const wCenter = wBox.getCenter(new THREE.Vector3());
            
            if (wSize.x > 0.5 || wSize.z > 0.5) {
                factoryColliders.push({
                    position: new THREE.Vector3(wCenter.x, jumpConfig.groundY, wCenter.z),
                    radius: Math.max(wSize.x, wSize.z) * 0.4
                });
            }
            
            if (meshListContainer) {
                const div = document.createElement('div');
                div.className = 'mesh-item';
                div.id = `mesh-item-${child.uuid}`;
                div.innerText = `🏭 ${child.name || 'ชิ้นส่วนนิรนาม'}`;
                div.onclick = () => selectMeshByUUID(child.uuid);
                meshListContainer.appendChild(div);
            }
        }
    });
    
    logElement.innerText = `✅ เปิดใช้งานโรงงานสำเร็จ: ${fileName}`;
    setTimeout(() => logElement.remove(), 4000);
    
    document.getElementById('val-total-meshes').innerText = originalMaterials.size;
    document.getElementById('val-colliders').innerText = factoryColliders.length;
}

// ============================================================
// --- 6. RAYCASTER (INTERACTION & RAY PICKING) ---
// ============================================================
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

window.addEventListener('click', function(event) {
    if (event.clientY > window.innerHeight - 60 && event.clientX > window.innerWidth - 400) return; 
    if (document.activeElement.tagName === 'INPUT' || event.clientX < 320) return; 

    mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    if (!factoryModel) return;

    const intersects = raycaster.intersectObjects(factoryModel.children, true);

    if (intersects.length > 0) {
        const clickedMesh = intersects[0].object;
        selectMeshByUUID(clickedMesh.uuid);
    }
});

function selectMeshByUUID(uuid) {
    if (!factoryModel) return;
    
    activeSelectedMeshUUID = uuid;
    
    // ค้นหาวัตถุในฉาก
    let targetMesh = null;
    factoryModel.traverse(function(child) {
        if (child.isMesh && child.uuid === uuid) targetMesh = child;
    });
    
    if (!targetMesh) return;
    
    // เคลียร์ไฮไลท์ชิ้นส่วนอื่นทั้งหมดกลับสู่สภาวะปกติก่อน
    factoryModel.traverse(function(child) {
        if (child.isMesh) {
            if (currentMaterialMode === 'xray') {
                child.material = new THREE.MeshBasicMaterial({ color: 0x00aaff, wireframe: true, transparent: true, opacity: 0.15 });
            } else {
                const orig = originalMaterials.get(child.uuid);
                if (orig) child.material = orig.clone();
            }
        }
    });
    
    // ไฮไลท์วัตถุที่ถูกเลือกด้วยแสงสีส้มเรืองแสงเพื่อความปลอดภัย (Safety Alert)
    targetMesh.material = new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        emissive: 0xff3300,
        emissiveIntensity: 0.6,
        roughness: 0.2
    });
    
    // เปิดแสดงแถบประมวลผลข้อมูลขั้นตอนความปลอดภัยด้านขวา
    const meshName = targetMesh.name || "ถังแก๊สชีวภาพ/ท่อส่ง";
    activeSelectedKeyKey = uuid; 
    
    document.getElementById('process-panel').style.display = 'block';
    
    if (workflowDatabase[uuid]) {
        const d = workflowDatabase[uuid];
        renderWorkflowUI(d.name, d.desc, d.steps, '🛡️ โหลดฐานข้อมูลความปลอดภัยแล้ว', d.colorClass);
    } else {
        renderWorkflowUI(meshName, "ยังไม่มีการกำหนดข้อบังคับมาตรฐานความปลอดภัยทางวิศวกรรมสำหรับชิ้นส่วนนี้", ["ตรวจสอบรอยรั่วซึมของวาล์ว", "สวมหมวกนิรภัย PPE ก่อนเข้าปฏิบัติงาน"], "⚠️ ระบบจำลองอัตโนมัติ", "tag-orange");
    }
    
    // อัปเดตการเลือกในเมนูสไลด์บาร์ฝั่งซ้ายให้สอดคล้องกัน
    document.querySelectorAll('.mesh-item').forEach(el => el.classList.remove('active'));
    const sideItem = document.getElementById(`mesh-item-${uuid}`);
    if (sideItem) {
        sideItem.classList.add('active');
        sideItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
}

// ============================================================
// --- 7. UI LOGIC & VISUAL MODES ---
// ============================================================
function togglePanelElement(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = (el.style.display === 'none') ? 'block' : 'none';
}

function resetCameraToAvatar() {
    if (!avatarModel) return;
    camera.position.set(avatarModel.position.x, avatarModel.position.y + 5, avatarModel.position.z + 10);
    controls.target.copy(avatarModel.position);
}

function setVisualMaterialMode(mode) {
    if (!factoryModel) return;
    currentMaterialMode = mode;
    
    document.querySelectorAll('.visual-mode-btn').forEach(b => b.classList.remove('active'));
    event.target.classList.add('active');
    
    factoryModel.traverse(function (child) {
        if (child.isMesh) {
            if (mode === 'xray') {
                child.material = new THREE.MeshBasicMaterial({ color: 0x00aaff, wireframe: true, transparent: true, opacity: 0.12 });
            } else if (mode === 'solid') {
                const orig = originalMaterials.get(child.uuid);
                if (orig) child.material = orig.clone();
            }
            if (child.uuid === activeSelectedMeshUUID) {
                child.material = new THREE.MeshStandardMaterial({ color: 0xffaa00, emissive: 0xff3300, emissiveIntensity: 0.5 });
            }
        }
    });
}

function renderWorkflowUI(name, desc, steps, notice, colorClass) {
    document.getElementById('wf-title').innerText = name;
    document.getElementById('wf-desc').innerText = desc;
    document.getElementById('wf-notice').innerText = notice;
    
    const badge = document.getElementById('wf-badge');
    badge.className = `wf-badge-type ${colorClass || 'tag-blue'}`;
    badge.innerText = colorClass === 'tag-red' ? 'CRITICAL危' : (colorClass === 'tag-orange' ? 'WARNING警' : 'STANDARDฉบับ');
    
    const container = document.getElementById('wf-steps-list');
    container.innerHTML = '';
    steps.forEach((step, idx) => {
        const item = document.createElement('div');
        item.className = 'step-list-item';
        item.innerHTML = `<span class="step-num-badge">${idx + 1}</span> <div style="flex:1;">${step}</div>`;
        container.appendChild(item);
    });
    
    document.getElementById('edit-wf-name').value = name;
    document.getElementById('edit-wf-desc').value = desc;
    document.getElementById('edit-wf-steps').value = steps.join('\n');
}

function saveActiveWorkflowData() {
    if (!activeSelectedMeshUUID) return;
    const name = document.getElementById('edit-wf-name').value;
    const desc = document.getElementById('edit-wf-desc').value;
    const steps = document.getElementById('edit-wf-steps').value.split('\n').filter(s => s.trim() !== '');
    const colorClass = document.getElementById('edit-wf-color').value;

    workflowDatabase[activeSelectedMeshUUID] = { name, desc, steps, colorClass };
    renderWorkflowUI(name, desc, steps, '💾 บันทึกสำเร็จลงเครื่องแล้ว', colorClass);

    if (window.mpSocket && mpSocket.connected) {
        mpSocket.emit('workflow_update', { key: activeSelectedKeyKey, targetUuid: activeSelectedMeshUUID, name, desc, steps, colorClass });
    }
}

// ============================================================
// --- 8. MULTIPLAYER NETWORKING (SOCKET.IO) ---
// ============================================================
let mpSocket = null;
let mpMyColor = "#00ffff"; 
const remoteAvatars = {};
const mpPlayerNames = {};
const mpPlayerColors = {};

function initMultiplayer() {
    const chatContainer = document.getElementById('mp-chat-logs');
    if (!chatContainer) return; 

    const serverUrl = window.RAILWAY_SERVER_URL || "http://localhost:3000";
    mpAppendChat({ name: 'ระบบ', color: '#94a3b8', text: `📡 กำลังเชื่อมโยงโครงข่ายเซิร์ฟเวอร์...` });

    mpSocket = io(serverUrl, { reconnectionAttempts: 3, timeout: 5000 });
    window.mpSocket = mpSocket;

    mpSocket.on('connect', () => {
        mpAppendChat({ name: 'ระบบ', color: '#6bcb77', text: '✅ เชื่อมต่อสู่ Metaverse Server สำเร็จ!' });
        document.getElementById('mp-status-badge').innerText = "ONLINE";
        document.getElementById('mp-status-badge').style.background = "#16a34a";
    });

    mpSocket.on('connect_error', () => {
        document.getElementById('mp-status-badge').innerText = "LOCAL MODE";
        document.getElementById('mp-status-badge').style.background = "#475569";
        if (chatContainer.children.length < 3) {
            mpAppendChat({ name: 'ระบบ', color: '#ef4444', text: '⚠️ ติดต่อเซิร์ฟเวอร์ไม่สำเร็จ ระบบกำลังทำงานแบบออฟไลน์' });
        }
    });

    mpSocket.on('self_init', data => {
        mpMyColor = data.self.color;
        mpPlayerNames[data.id] = data.self.name;
        mpPlayerColors[data.id] = data.self.color;
        
        // เมื่อได้รับยีนส์สีมาจากเซิร์ฟเวอร์ ให้เริ่มสร้างตัวละครวิศวกรทันที
        createProceduralAvatar();
        
        // โหลดข้อมูลผู้เล่นอื่นที่มีอยู่ก่อนแล้วในห้อง
        for (const id in data.currentPlayers) {
            if (id !== data.id) {
                spawnRemotePlayer(id, data.currentPlayers[id]);
            }
        }
        updateMpUI();
    });

    mpSocket.on('player_joined', data => {
        mpAppendChat({ name: 'ระบบ', color: '#4d96ff', text: `👋 ${data.player.name} เข้าร่วมห้องปฏิบัติงาน` });
        spawnRemotePlayer(data.id, data.player);
        updateMpUI();
    });

    mpSocket.on('player_left', id => {
        if (remoteAvatars[id]) {
            scene.remove(remoteAvatars[id]);
            delete remoteAvatars[id];
        }
        if (remoteMixers[id]) delete remoteMixers[id];
        if (remoteWalkActions[id]) delete remoteWalkActions[id];
        
        mpAppendChat({ name: 'ระบบ', color: '#ef4444', text: `🚪 ${mpPlayerNames[id] || 'ผู้เล่นชั่วคราว'} ออกจากการเชื่อมต่อ` });
        delete mpPlayerNames[id];
        delete mpPlayerColors[id];
        updateMpUI();
    });

    mpSocket.on('player_moved', data => {
        if (remoteAvatars[data.id]) {
            remoteAvatars[data.id].position.set(data.position.x, data.position.y, data.position.z);
            remoteAvatars[data.id].rotation.y = data.rotation?.y || 0;
            
            // 🏃‍♂️ ควบคุมแอนิเมชันสับขาของเพื่อนตามสัญญาณเครือข่าย
            if (remoteWalkActions[data.id]) {
                if (data.isMoving) {
                    remoteWalkActions[data.id].setEffectiveWeight(1);
                } else {
                    remoteWalkActions[data.id].setEffectiveWeight(0);
                }
            }
        }
    });

    mpSocket.on('player_renamed', data => {
        mpPlayerNames[data.id] = data.name;
        if (remoteAvatars[data.id]) setAvatarLabel(remoteAvatars[data.id], data.name, mpPlayerColors[data.id] || '#fff');
        updateMpUI();
    });

    mpSocket.on('load_model', data => {
        mpAppendChat({ name: 'ระบบ', color: '#00ffff', text: `📦 สัญญาณดาวน์โหลดโมเดลโรงงานใหม่: ${data.fileName}` });
        loadModelFromUrl(data.url, data.fileName);
    });

    mpSocket.on('workflow_updated', data => {
        workflowDatabase[data.targetUuid] = { name: data.name, desc: data.desc, steps: data.steps, colorClass: data.colorClass || 'tag-blue' };
        if (factoryModel) {
            factoryModel.traverse(function(child) {
                if (child.isMesh && (child.uuid === data.targetUuid || child.name === data.key)) {
                    child.name = data.name;
                    const itemEl = document.getElementById(`mesh-item-${child.uuid}`);
                    if (itemEl) itemEl.innerText = `🏭 ${data.name}`;
                }
            });
        }
        if (activeSelectedMeshUUID === data.targetUuid) {
            renderWorkflowUI(data.name, data.desc, data.steps, '✏️ ถูกเรียบเรียงใหม่โดยวิศวกรท่านอื่น', data.colorClass);
        }
        mpAppendChat({ name: 'ระบบ', color: '#ffaa00', text: `✏️ ข้อมูลมาตรฐานความปลอดภัย "${data.name}" ถูกอัปเดต` });
    });

    mpSocket.on('chat_message', msg => mpAppendChat(msg));
}

function spawnRemotePlayer(id, playerData) {
    if (remoteAvatars[id]) return;
    
    mpPlayerNames[id] = playerData.name;
    mpPlayerColors[id] = playerData.color;

    // โหลดตัวละคร FBX ให้เพื่อนผู้เล่นคนอื่นด้วย
    const fbxLoader = new THREE.FBXLoader();
    fbxLoader.load('character.fbx', function (fbx) {
        const remoteModel = fbx;
        remoteModel.scale.set(0.012, 0.012, 0.012);
        remoteModel.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        
        applyAvatarColor(remoteModel, playerData.color);
        setAvatarLabel(remoteModel, playerData.name, playerData.color);

        // โหลดอนิเมชันเดินให้กับผู้เล่นคนอื่น
        fbxLoader.load('Catwalk Walk Forward HighKnees.fbx', function (animFbx) {
            const mixer = new THREE.AnimationMixer(remoteModel);
            remoteMixers[id] = mixer;
            
            if (animFbx.animations && animFbx.animations.length > 0) {
                const action = mixer.clipAction(animFbx.animations[0]);
                action.play();
                action.setEffectiveWeight(0);
                remoteWalkActions[id] = action;
            }
            
            remoteAvatars[id] = remoteModel;
            scene.add(remoteModel);
        }, undefined, function() {
            remoteAvatars[id] = remoteModel;
            scene.add(remoteModel);
        });

    }, undefined, function() {
        // แผนสำรองหากโหลด FBX ไม่ขึ้น ให้ใช้แคปซูล
        const group = new THREE.Group();
        const geom = new THREE.CylinderGeometry(avatarConfig.radius, avatarConfig.radius, avatarConfig.height, 12);
        const mat = new THREE.MeshStandardMaterial({ color: parseInt(playerData.color.replace('#',''), 16) });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.y = avatarConfig.height / 2;
        group.add(mesh);
        
        group.position.set(playerData.position.x, playerData.position.y, playerData.position.z);
        setAvatarLabel(group, playerData.name, playerData.color);
        
        remoteAvatars[id] = group;
        scene.add(group);
    });
}

function setAvatarLabel(avatarGroup, text, color) {
    // ลบป้ายชื่อเก่าทิ้งถ้ามี
    const oldLabel = avatarGroup.getObjectByName("nameLabel");
    if (oldLabel) avatarGroup.remove(oldLabel);

    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(10,16,26,0.75)';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = color; ctx.lineWidth = 4;
    ctx.strokeRect(0, 0, 256, 64);
    ctx.font = 'bold 24px sans-serif'; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'center';
    ctx.fillText(text, 128, 40);

    const texture = new THREE.CanvasTexture(canvas);
    const mat = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.name = "nameLabel";
    // ดันป้ายชื่อลอยเหนือหัววิศวกร 3D
    sprite.position.set(0, 150, 0); 
    sprite.scale.set(120, 30, 1);
    avatarGroup.add(sprite);
}

function sendChat() {
    const input = document.getElementById('mp-chat-input');
    const txt = input.value.trim();
    if (!txt) return;
    if (mpSocket && mpSocket.connected) {
        mpSocket.emit('chat_message', txt);
    } else {
        mpAppendChat({ name: mpPlayerNames[mpSocket?.id] || 'คุณ (ออฟไลน์)', color: mpMyColor, text: txt });
    }
    input.value = '';
}

function mpAppendChat(msg) {
    const container = document.getElementById('mp-chat-logs');
    if (!container) return;
    const item = document.createElement('div');
    item.style.marginBottom = '4px';
    item.innerHTML = `<span style="color:${msg.color};font-weight:bold;">${msg.name}:</span> <span style="color:#f8fafc;">${msg.text}</span>`;
    container.appendChild(item);
    container.scrollTop = container.scrollHeight;
}

function updateMpUI() {
    const container = document.getElementById('mp-users-list');
    if (!container) return;
    container.innerHTML = '';
    for (const id in mpPlayerNames) {
        const div = document.createElement('div');
        div.style.display = 'flex'; div.style.alignItems = 'center'; div.style.gap = '8px'; div.style.fontSize = '12px'; div.style.marginBottom = '4px';
        div.innerHTML = `<div style="width:10px;height:10px;border-radius:50%;background:${mpPlayerColors[id]};"></div> <span>${mpPlayerNames[id]}</span>`;
        container.appendChild(div);
    }
}

function changeMyPlayerName() {
    const newName = prompt("กรุณาระบุชื่อรหัสพนักงานวิศวกรของคุณ:", mpPlayerNames[mpSocket?.id] || "Engineer_01");
    if (!newName || !newName.trim()) return;
    if (mpSocket && mpSocket.connected) {
        mpSocket.emit('set_name', newName.trim());
    } else {
        mpPlayerNames['local'] = newName.trim();
        if (avatarModel) setAvatarLabel(avatarModel, newName.trim(), mpMyColor);
        updateMpUI();
    }
}

// คอยดักฟังการลากจูงส่งไฟล์ผ่าน UI หน้าจอเพื่อแชร์แบบจำลอง 3D
window.addEventListener('dragover', e => e.preventDefault());
window.addEventListener('drop', e => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (!file) return;
    
    const ext = file.name.split('.').pop().toLowerCase();
    if (ext === 'glb' || ext === 'gltf' || ext === 'fbx') {
        const url = URL.createObjectURL(file);
        loadModelFromUrl(url, file.name);
        if (mpSocket && mpSocket.connected) {
            mpSocket.emit('model_shared', { url: url, fileName: file.name });
        }
    }
});

// ============================================================
// --- 9. GAME LOOP & RENDERING FRAME ---
// ============================================================
function animate() {
    requestAnimationFrame(animate);
    
    const dt = clock.getDelta(); // คำนวณความต่างเวลาของทุกเฟรมเรนเดอร์

    // 🔄 อัปเดตเฟรมท่าทางแอนิเมชันโมเดล 3D ของตนเอง
    if (avatarMixer) avatarMixer.update(dt);
    
    // 🔄 อัปเดตเฟรมท่าทางแอนิเมชันของวิศวกรคนอื่นในห้องเซิร์ฟเวอร์
    for (const id in remoteMixers) {
        if (remoteMixers[id]) remoteMixers[id].update(dt);
    }

    updateAvatarPhysics(dt);
    controls.update();
    renderer.render(scene, camera);
}

// หน้าต่างฟังก์ชันเริ่มรันระบบทันทีที่เปิดแท็บเบราว์เซอร์
initMultiplayer();
animate();
