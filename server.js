const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const players = {};
const PLAYER_COLORS = [
    '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
    '#c77dff', '#ff9f43', '#00d2d3', '#ff6b9d'
];

// Room state — persistent ตลอด session
let currentModelUrl = null;
let currentModelName = null;
const workflowDatabase = {}; // meshUUID -> { name, desc, steps, colorClass }

function getRandomColor() {
    return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id} - server.js:37`);

    const playerData = {
        id: socket.id,
        name: `Player_${socket.id.substring(0, 4).toUpperCase()}`,
        color: getRandomColor(),
        position: { x: (Math.random() - 0.5) * 6, y: 0.9, z: 8 + (Math.random() - 0.5) * 4 },
        rotation: { y: 0 },
        isJumping: false
    };
    players[socket.id] = playerData;

    // ส่งข้อมูลทั้งหมดให้ผู้เล่นใหม่ — รวม workflow ที่แก้ไขไปแล้ว
    socket.emit('self_init', {
        self: playerData,
        others: Object.values(players).filter(p => p.id !== socket.id),
        modelUrl: currentModelUrl,
        modelName: currentModelName,
        workflowDatabase: workflowDatabase  // ← ส่ง workflow ทั้งหมดให้ด้วย
    });

    socket.broadcast.emit('player_joined', playerData);

    socket.on('player_move', (data) => {
        if (!players[socket.id]) return;
        players[socket.id].position = data.position;
        players[socket.id].rotation = data.rotation;
        players[socket.id].isJumping = data.isJumping || false;
        socket.broadcast.emit('player_moved', {
            id: socket.id,
            position: data.position,
            rotation: data.rotation,
            isJumping: data.isJumping || false
        });
    });

    // Workflow update — เก็บไว้ใน server แล้ว broadcast
    socket.on('workflow_update', (data) => {
        // เก็บด้วยชื่อ mesh เป็น key เพราะ UUID ต่างกันในแต่ละ browser
        workflowDatabase[data.meshName] = {
            name: data.name,
            desc: data.desc,
            steps: data.steps,
            colorClass: data.colorClass || 'tag-blue'
        };
        socket.broadcast.emit('workflow_updated', data);
        console.log(`[WORKFLOW] Updated: ${data.name} - server.js:83`);
    });

    socket.on('model_shared', (data) => {
        currentModelUrl = data.url;
        currentModelName = data.fileName;
        console.log(`[MODEL] Shared: ${data.fileName} - server.js:89`);
        io.emit('load_model', { url: data.url, fileName: data.fileName });
    });

    socket.on('set_name', (name) => {
        if (!players[socket.id]) return;
        const safeName = String(name).substring(0, 20).replace(/[<>]/g, '');
        players[socket.id].name = safeName;
        io.emit('player_renamed', { id: socket.id, name: safeName });
    });

    socket.on('chat_message', (text) => {
        if (!players[socket.id]) return;
        const msg = {
            id: socket.id,
            name: players[socket.id].name,
            color: players[socket.id].color,
            text: String(text).substring(0, 200).replace(/</g, '&lt;'),
            ts: Date.now()
        };
        io.emit('chat_message', msg);
    });

    socket.on('disconnect', () => {
        console.log(`[] Player disconnected: ${socket.id} - server.js:113`);
        delete players[socket.id];
        io.emit('player_left', { id: socket.id });
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Biogas Twin Multiplayer Server running at http://localhost:${PORT} - server.js:120`);
});
