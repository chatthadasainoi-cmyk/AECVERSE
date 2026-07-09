const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET", "POST"] } });
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

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

// ADMIN AUTH (แบบง่ายสำหรับต้นแบบงานวิจัย — ไม่ใช่ระบบยืนยันตัวตนระดับ production)
// ตั้งรหัสผ่านผ่าน environment variable ADMIN_PASSWORD ได้ตอน deploy จริง
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'biogas-admin';
const admins = new Set(); // socket.id ที่ล็อกอินเป็น admin แล้วในรอบนี้

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

io.on('connection', socket => {
    console.log(`[+] ${socket.id}`);
    const player = {
        id: socket.id,
        name: `Player_${socket.id.slice(0, 4).toUpperCase()}`,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        position: { x: (Math.random() - 0.5) * 6, y: 0.9, z: 8 + (Math.random() - 0.5) * 4 },
        rotation: { y: 0 }
    };
    players[socket.id] = player;

    socket.emit('self_init', {
        self: player,
        others: Object.values(players).filter(p => p.id !== socket.id),
        isAdmin: false,
        ...publicState()
    });
    socket.emit('plant_update', computePlantSnapshot());
    socket.broadcast.emit('player_joined', player);

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
        currentModelUrl = null;
        currentModelName = null;
        modelTransform = { posX: 0, posY: 0, posZ: 0, rotY: 0, scale: 1 };
        modelLocked = true;
        io.emit('model_removed');
        console.log(`[MODEL] Removed by ${socket.id}`);
    });

    // ---------- REQ 1&2: admin auth + lock + transform sync ----------
    socket.on('admin_login', (password, ack) => {
        const ok = typeof password === 'string' && password === ADMIN_PASSWORD;
        if (ok) admins.add(socket.id);
        if (typeof ack === 'function') ack({ success: ok, modelLocked, modelTransform });
        if (ok) io.emit('admin_presence', { adminCount: admins.size });
    });

    socket.on('admin_logout', () => {
        admins.delete(socket.id);
        io.emit('admin_presence', { adminCount: admins.size });
    });

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

    // ---------- identity / chat ----------
    socket.on('set_name', name => {
        if (!players[socket.id]) return;
        players[socket.id].name = String(name).slice(0, 20).replace(/[<>]/g, '');
        io.emit('player_renamed', { id: socket.id, name: players[socket.id].name });
    });

    socket.on('chat_message', text => {
        if (!players[socket.id]) return;
        io.emit('chat_message', { id: socket.id, name: players[socket.id].name, color: players[socket.id].color, text: String(text).slice(0, 200).replace(/</g, '&lt;') });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        admins.delete(socket.id);
        io.emit('player_left', { id: socket.id });
        io.emit('admin_presence', { adminCount: admins.size });
        console.log(`[-] ${socket.id}`);
    });
});

server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
