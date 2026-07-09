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
