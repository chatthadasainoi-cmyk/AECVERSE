const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public'), { index: false }));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'Login.html')));

// ============================================================
// ADMIN USER MANAGEMENT (ต้องมี SUPABASE_SERVICE_ROLE_KEY เป็น env var
// บน Railway เท่านั้น — ห้ามใส่ค่านี้ในโค้ดฝั่ง client เด็ดขาด เพราะ key นี้
// เข้าถึง/แก้ไขบัญชีผู้ใช้ทุกคนได้ ไม่ใช่แค่ของตัวเอง)
// ============================================================
const SUPABASE_URL = 'https://hzlokmixfkfrmkuucfhg.supabase.co';
// anon key เป็น public key อยู่แล้ว (ฝังในโค้ดฝั่ง client ทุกหน้า) — ใช้ตรวจสอบ
// access token ของผู้ใช้ (auth.getUser) ได้โดยไม่ต้องพึ่ง service role key
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh6bG9rbWl4Zmtmcm1rdXVjZmhnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODI1NzA5NTUsImV4cCI6MjA5ODE0Njk1NX0.DSj0c7XN979948Iq5rGmWqI9ddcbg56OmfKFin--Luo';
const supabaseVerify = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const supabaseAdmin = process.env.SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
    : null;

// รายชื่ออีเมล admin ตั้งต้น (แก้ผ่าน env var บน Railway) — ใช้แก้ปัญหา
// "ไข่กับไก่": ต้องมี admin คนแรกก่อนถึงจะมีใครมาโปรโมทคนอื่นผ่านหน้า User Management ได้
const ADMIN_BOOTSTRAP_EMAILS = (process.env.ADMIN_BOOTSTRAP_EMAILS || '')
    .split(',').map(e => e.trim().toLowerCase()).filter(Boolean);

function isAdminUser(user) {
    if (!user || !user.email) return false;
    if (ADMIN_BOOTSTRAP_EMAILS.includes(user.email.toLowerCase())) return true;
    return user.app_metadata?.role === 'admin';
}

async function requireAdmin(req, res, next) {
    if (!supabaseAdmin) return res.status(503).json({ error: 'Admin API ยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY บนเซิร์ฟเวอร์' });
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ error: 'ไม่พบ token การเข้าสู่ระบบ' });

    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    if (!isAdminUser(data.user)) return res.status(403).json({ error: 'บัญชีนี้ไม่มีสิทธิ์ Admin' });

    req.adminUser = data.user;
    next();
}

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });
    const users = data.users.map(u => ({
        id: u.id,
        email: u.email,
        role: isAdminUser(u) ? 'admin' : 'user',
        isBootstrapAdmin: ADMIN_BOOTSTRAP_EMAILS.includes((u.email || '').toLowerCase()),
        createdAt: u.created_at,
        lastSignInAt: u.last_sign_in_at
    }));
    res.json({ users, me: req.adminUser.id });
});

app.post('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
    const { role } = req.body;
    if (role !== 'admin' && role !== 'user') return res.status(400).json({ error: 'role ต้องเป็น admin หรือ user เท่านั้น' });

    const { data: targetData, error: getErr } = await supabaseAdmin.auth.admin.getUserById(req.params.id);
    if (getErr || !targetData.user) return res.status(404).json({ error: 'ไม่พบผู้ใช้นี้' });

    if (ADMIN_BOOTSTRAP_EMAILS.includes((targetData.user.email || '').toLowerCase())) {
        return res.status(400).json({ error: 'บัญชีนี้เป็น Admin ตั้งต้นจาก environment variable แก้ไขผ่านหน้านี้ไม่ได้' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, {
        app_metadata: { ...targetData.user.app_metadata, role }
    });
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
});

// ============================================================
// ROOM STATE (single shared room — เหมือนเดิมทั้งระบบ)
// ============================================================
const players = {};
const COLORS = ['#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff', '#c77dff', '#ff9f43', '#00d2d3', '#ff6b9d'];

let currentModelUrl = null;
let currentModelName = null;
const workflowDb = {};        // key -> { name, desc, steps, colorClass, requiresPPE }
const typeAssignments = {};   // key -> typeKey ที่ admin กำหนดเอง

// REQ 1 & 2: ตำแหน่ง/ขนาด/หมุนของโมเดลโรงงาน — sync ให้ทุกคนเห็นตรงกัน
let modelTransform = { posX: 0, posY: 0, posZ: 0, rotY: 0, scale: 1 };
// เริ่มต้น "ล็อก" ไว้เสมอ กันแก้ไขพลาดตั้งแต่ผู้เล่นคนแรกเข้าห้อง — ต้องให้ admin ปลดล็อกเองเท่านั้น
let modelLocked = true;

// ADMIN AUTH — ผูกกับบัญชี Supabase โดยตรง (ไม่มีรหัสผ่าน admin แยกอีกต่อไป)
// ใครเป็น admin ดูจาก isAdminUser(): app_metadata.role === 'admin' (ตั้งผ่านหน้า
// Settings → User Management) หรืออยู่ใน ADMIN_BOOTSTRAP_EMAILS
const admins = new Set(); // socket.id ของผู้เล่นที่บัญชีเป็น admin (ใส่ให้อัตโนมัติตอนเชื่อมต่อ)

function publicState() {
    return {
        modelUrl: currentModelUrl,
        modelName: currentModelName,
        workflowDb,
        typeAssignments,
        modelTransform,
        modelLocked,
        adminCount: admins.size
    };
}

// ============================================================
// SIMULATED PLANT SENSOR FEED (ต้นแบบงานวิจัย — ยังไม่มีเซนเซอร์ IoT จริง)
// ค่าทั้งหมด random-walk ต่อเนื่องบนเซิร์ฟเวอร์แล้ว broadcast ให้ทุกคนเห็น
// ตรงกัน real-time ผ่าน Socket.io เพื่อให้หน้า Dashboard/Analytics/Emergency/
// AI Prediction มีข้อมูลเดียวกันแทนตัวเลข hardcode
// ============================================================
function rand(min, max) { return min + Math.random() * (max - min); }
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

const plant = { ch4Percent: 65.2, flowRate: 125.6, efficiency: 82.4 };

// rate = ต่อ tick (4s) ใช้แค่ทำให้ตัวเลขขยับให้เห็น real-time บนหน้าจอ
// dailyRate = ต่อวัน ใช้คำนวณ "วันที่เหลือก่อนถึงกำหนดบำรุงรักษา" ให้สมจริง
const equipment = {
    'TANK-01':   { name: 'ถังหมักที่ 1', wear: 20, rate: 0.010, dailyRate: 0.9, pressure: 2.15, temperature: 38.6, ph: 7.21, level: 1250 },
    'PUMP-02':   { name: 'ปั๊มที่ 2', wear: 78, rate: 0.050, dailyRate: 1.8 },
    'BOILER-01': { name: 'หม้อไอน้ำที่ 1', wear: 65, rate: 0.040, dailyRate: 1.9 },
    'PUMP-01':   { name: 'ปั๊มที่ 1', wear: 54, rate: 0.030, dailyRate: 2.0 },
    'TANK-02':   { name: 'ถังหมักที่ 2', wear: 42, rate: 0.020, dailyRate: 1.9 },
    'FILTER-01': { name: 'ตัวกรองที่ 1', wear: 35, rate: 0.015, dailyRate: 1.4 }
};
Object.values(equipment).forEach(e => { e.wearHistory = [e.wear]; });

const plantHistory = []; // sparkline ย้อนหลัง — เก็บสูงสุด 60 จุด (4s * 60 = 4 นาที)
const MAX_HISTORY = 60;

function riskLevel(wear) {
    if (wear >= 80) return 'critical';
    if (wear >= 60) return 'high';
    if (wear >= 35) return 'medium';
    return 'low';
}

function computePlantSnapshot() {
    const equipmentList = Object.entries(equipment).map(([id, e]) => ({
        id,
        name: e.name,
        wear: Math.round(e.wear * 10) / 10,
        risk: riskLevel(e.wear),
        failureProb: Math.round(e.wear),
        daysToMaintenance: Math.max(1, Math.round((100 - e.wear) / e.dailyRate)),
        wearHistory: e.wearHistory
    })).sort((a, b) => b.wear - a.wear);

    const t1 = equipment['TANK-01'];
    const alerts = [];
    if (t1.pressure > 2.8) alerts.push({ tag: 'TANK-01 Overpressure', level: 'critical' });
    if (t1.temperature > 43) alerts.push({ tag: 'TANK-01 Temp Drift', level: 'warning' });
    if (t1.ph < 6.8 || t1.ph > 7.6) alerts.push({ tag: 'TANK-01 pH Drift', level: 'warning' });
    equipmentList.filter(e => e.risk === 'critical').forEach(e => alerts.push({ tag: `${e.id} Imminent Failure Risk`, level: 'critical' }));
    equipmentList.filter(e => e.risk === 'high').forEach(e => alerts.push({ tag: `${e.id} High Wear`, level: 'warning' }));
    if (!alerts.length) alerts.push({ tag: 'All Systems Normal', level: 'normal' });

    return {
        plant: {
            ch4Percent: Math.round(plant.ch4Percent * 10) / 10,
            flowRate: Math.round(plant.flowRate * 10) / 10,
            efficiency: Math.round(plant.efficiency * 10) / 10
        },
        tank1: {
            pressure: Math.round(t1.pressure * 100) / 100,
            temperature: Math.round(t1.temperature * 10) / 10,
            ph: Math.round(t1.ph * 100) / 100,
            level: Math.round(t1.level)
        },
        equipment: equipmentList,
        alerts,
        history: plantHistory,
        updatedAt: Date.now()
    };
}

function stepPlantSimulation() {
    plant.ch4Percent = clamp(plant.ch4Percent + rand(-0.4, 0.4), 55, 72);
    plant.flowRate = clamp(plant.flowRate + rand(-2, 2), 90, 160);
    plant.efficiency = clamp(plant.efficiency + rand(-0.5, 0.5), 70, 92);

    const t1 = equipment['TANK-01'];
    t1.pressure = clamp(t1.pressure + rand(-0.05, 0.05), 1.5, 3.2);
    t1.temperature = clamp(t1.temperature + rand(-0.3, 0.3), 32, 45);
    t1.ph = clamp(t1.ph + rand(-0.03, 0.03), 6.5, 7.8);
    t1.level = clamp(t1.level + rand(-15, 15), 900, 1600);

    Object.values(equipment).forEach(e => {
        e.wear = clamp(e.wear + e.rate + rand(-0.03, 0.03), 0, 100);
        if (e.wear >= 99.5) e.wear = rand(8, 15); // จำลองการซ่อมบำรุงเสร็จแล้วรีเซ็ต
        e.wearHistory.push(e.wear);
        if (e.wearHistory.length > 30) e.wearHistory.shift();
    });

    plantHistory.push({
        t: Date.now(),
        ch4Percent: plant.ch4Percent, flowRate: plant.flowRate, efficiency: plant.efficiency,
        pressure: t1.pressure, temperature: t1.temperature, ph: t1.ph, level: t1.level
    });
    if (plantHistory.length > MAX_HISTORY) plantHistory.shift();

    io.emit('plant_update', computePlantSnapshot());
}

setInterval(stepPlantSimulation, 4000);

// ============================================================
// SOCKET AUTH MIDDLEWARE — ตัวตนผูกกับบัญชี Supabase
// - role 'player'  = ตัวละครในโลก 3D (หน้า index.html) ต้องล็อกอินเท่านั้น
// - role 'watcher' = ผู้ชมข้อมูล (Dashboard/Analytics/Reports/Emergency และ
//   iframe viewer ในหน้า Digital Twin) — รับข้อมูลได้ แต่"ไม่เป็นตัวละคร"
//   ← นี่คือตัวแก้บั๊กตัวละครผี Player_XXXX ที่ duplicate ออกมาก่อนหน้านี้
//   (เดิมทุก connection ถูกนับเป็นผู้เล่นหมด แม้แต่หน้า Dashboard)
// ============================================================
io.use(async (socket, next) => {
    const { token, role } = socket.handshake.auth || {};
    socket.data.role = role === 'player' ? 'player' : 'watcher';
    socket.data.user = null;
    if (token) {
        try {
            const { data, error } = await supabaseVerify.auth.getUser(token);
            if (!error && data.user) socket.data.user = data.user;
        } catch (err) {
            console.warn('[AUTH] ตรวจสอบ token ล้มเหลว:', err.message);
        }
    }
    // ผู้เล่นในโลก 3D ต้องมีบัญชีจริงเสมอ — watcher ไม่บังคับ (แค่ดูข้อมูล)
    if (socket.data.role === 'player' && !socket.data.user) return next(new Error('AUTH_REQUIRED'));
    next();
});

// สีประจำตัวคงที่ต่อบัญชี — บัญชีเดิมเข้ามากี่ครั้งก็ได้สีเดิม
function colorForUserId(userId) {
    let h = 0;
    for (const ch of String(userId)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return COLORS[h % COLORS.length];
}

io.on('connection', socket => {
    const user = socket.data.user;
    const isPlayer = socket.data.role === 'player';

    // ---------- WATCHER: รับ state อย่างเดียว ไม่มีตัวละคร ----------
    if (!isPlayer) {
        console.log(`[+watcher] ${socket.id}`);
        socket.emit('self_init', { self: null, others: [], isAdmin: false, ...publicState() });
        socket.emit('plant_update', computePlantSnapshot());
    } else {
        // ---------- PLAYER: หนึ่งบัญชี = หนึ่งตัวละคร ----------
        // ถ้าบัญชีเดียวกันเชื่อมต่อซ้ำ (เปิดหลายแท็บ/รีเฟรช) เตะ connection เก่าออกก่อน
        const existing = Object.values(players).find(p => p.userId === user.id);
        if (existing) {
            const oldSocket = io.sockets.sockets.get(existing.id);
            if (oldSocket) {
                oldSocket.emit('kicked_duplicate');
                oldSocket.disconnect(true); // trigger disconnect handler -> ลบ players entry + broadcast player_left
            } else {
                delete players[existing.id]; // socket หายไปแล้วแต่ entry ค้าง — เก็บกวาด
            }
        }

        const displayName = String(
            user.user_metadata?.display_name || (user.email || '').split('@')[0] || 'User'
        ).slice(0, 20).replace(/[<>]/g, '');
        const userIsAdmin = isAdminUser(user);

        const player = {
            id: socket.id,
            userId: user.id,
            name: displayName,
            color: colorForUserId(user.id),
            position: { x: (Math.random() - 0.5) * 6, y: 0.9, z: 8 + (Math.random() - 0.5) * 4 },
            rotation: { y: 0 }
        };
        players[socket.id] = player;
        if (userIsAdmin) admins.add(socket.id);
        console.log(`[+player] ${displayName} <${user.email}>${userIsAdmin ? ' (admin)' : ''}`);

        socket.emit('self_init', {
            self: player,
            others: Object.values(players).filter(p => p.id !== socket.id),
            isAdmin: userIsAdmin,
            ...publicState()
        });
        socket.emit('plant_update', computePlantSnapshot());
        socket.broadcast.emit('player_joined', player);
        if (userIsAdmin) io.emit('admin_presence', { adminCount: admins.size });
    }

    // ---------- movement ----------
    socket.on('player_move', data => {
        if (!players[socket.id]) return;
        Object.assign(players[socket.id], { position: data.position, rotation: data.rotation });
        socket.broadcast.emit('player_moved', { id: socket.id, position: data.position, rotation: data.rotation });
    });

    // ---------- model share / remove ----------
    socket.on('model_shared', data => {
        currentModelUrl = data.url;
        currentModelName = data.fileName;
        // โมเดลใหม่ -> รีเซ็ต transform กลับค่าเริ่มต้น รอ admin จัดตำแหน่งใหม่ และล็อกไว้ก่อนเพื่อความปลอดภัย
        modelTransform = { posX: 0, posY: 0, posZ: 0, rotY: 0, scale: 1 };
        modelLocked = true;
        io.emit('load_model', { url: data.url, fileName: data.fileName, modelTransform, modelLocked });
        console.log(`[MODEL] ${data.fileName}`);
    });

    socket.on('model_removed', () => {
        if (!admins.has(socket.id)) return; // UI ฝั่ง client จำกัดปุ่มลบไว้ที่ admin อยู่แล้ว — บังคับซ้ำฝั่ง server
        currentModelUrl = null;
        currentModelName = null;
        modelTransform = { posX: 0, posY: 0, posZ: 0, rotY: 0, scale: 1 };
        modelLocked = true;
        io.emit('model_removed');
        console.log(`[MODEL] Removed by ${socket.id}`);
    });

    // ---------- REQ 1&2: lock + transform sync (สิทธิ์ admin มาจากบัญชีอัตโนมัติ) ----------
    socket.on('toggle_lock', () => {
        if (!admins.has(socket.id)) return; // เฉพาะ admin เท่านั้นที่ล็อก/ปลดล็อกได้
        modelLocked = !modelLocked;
        io.emit('lock_state', { locked: modelLocked, by: players[socket.id]?.name || 'Admin' });
        console.log(`[LOCK] ${modelLocked ? 'locked' : 'unlocked'} by ${socket.id}`);
    });

    socket.on('model_transform_update', data => {
        // ป้องกันฝั่ง user ทั่วไปแก้ไขข้อมูล — ปรับได้เฉพาะ admin ที่ปลดล็อกแล้วเท่านั้น
        if (!admins.has(socket.id) || modelLocked) return;
        modelTransform = {
            posX: Number(data.posX) || 0,
            posY: Number(data.posY) || 0,
            posZ: Number(data.posZ) || 0,
            rotY: Number(data.rotY) || 0,
            scale: Number(data.scale) || 1
        };
        socket.broadcast.emit('model_transform_updated', modelTransform);
    });

    // ---------- workflow / safety data edit ----------
    socket.on('workflow_update', data => {
        workflowDb[data.key] = {
            name: data.name,
            desc: data.desc,
            steps: data.steps,
            colorClass: data.colorClass || 'tag-blue',
            requiresPPE: !!data.requiresPPE
        };
        if (data.assignedTypeKey) typeAssignments[data.key] = data.assignedTypeKey;
        socket.broadcast.emit('workflow_updated', data);
        console.log(`[WORKFLOW] key:${data.key} name:${data.name}`);
    });

    // ---------- chat (ชื่อผู้เล่นล็อกตามบัญชี — ไม่มี set_name อีกต่อไป) ----------
    socket.on('chat_message', text => {
        if (!players[socket.id]) return;
        io.emit('chat_message', { id: socket.id, name: players[socket.id].name, color: players[socket.id].color, text: String(text).slice(0, 200).replace(/</g, '&lt;') });
    });

    socket.on('disconnect', () => {
        const wasPlayer = !!players[socket.id];
        const wasAdmin = admins.has(socket.id);
        delete players[socket.id];
        admins.delete(socket.id);
        if (wasPlayer) io.emit('player_left', { id: socket.id });
        if (wasAdmin) io.emit('admin_presence', { adminCount: admins.size });
        console.log(`[-${wasPlayer ? 'player' : 'watcher'}] ${socket.id}`);
    });
});

server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
