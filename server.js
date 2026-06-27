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

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// --- MULTIPLAYER STATE ---
// players: { socketId: { id, name, color, position, rotation, isJumping } }
const players = {};

// Random bright colors for player avatars
const PLAYER_COLORS = [
    '#ff6b6b', '#ffd93d', '#6bcb77', '#4d96ff',
    '#c77dff', '#ff9f43', '#00d2d3', '#ff6b9d'
];

function getRandomColor() {
    return PLAYER_COLORS[Math.floor(Math.random() * PLAYER_COLORS.length)];
}

// --- SOCKET.IO HANDLERS ---
io.on('connection', (socket) => {
    console.log(`[+] Player connected: ${socket.id}`);

    // New player joins — assign identity
    const playerData = {
        id: socket.id,
        name: `Player_${socket.id.substring(0, 4).toUpperCase()}`,
        color: getRandomColor(),
        position: { x: (Math.random() - 0.5) * 6, y: 0.9, z: 8 + (Math.random() - 0.5) * 4 },
        rotation: { y: 0 },
        isJumping: false
    };
    players[socket.id] = playerData;

    // Send this player their own identity + all existing players
    socket.emit('self_init', {
        self: playerData,
        others: Object.values(players).filter(p => p.id !== socket.id)
    });

    // Broadcast new player to everyone else
    socket.broadcast.emit('player_joined', playerData);

    // Receive movement updates from this player
    socket.on('player_move', (data) => {
        if (!players[socket.id]) return;
        players[socket.id].position = data.position;
        players[socket.id].rotation = data.rotation;
        players[socket.id].isJumping = data.isJumping || false;
        // Relay to all other players
        socket.broadcast.emit('player_moved', {
            id: socket.id,
            position: data.position,
            rotation: data.rotation,
            isJumping: data.isJumping || false
        });
    });

    // Name change
    socket.on('set_name', (name) => {
        if (!players[socket.id]) return;
        const safeName = String(name).substring(0, 20).replace(/[<>]/g, '');
        players[socket.id].name = safeName;
        io.emit('player_renamed', { id: socket.id, name: safeName });
    });

    // Chat messages
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

    // Disconnect
    socket.on('disconnect', () => {
        console.log(`[-] Player disconnected: ${socket.id}`);
        delete players[socket.id];
        io.emit('player_left', { id: socket.id });
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Biogas Twin Multiplayer Server running at http://localhost:${PORT}`);
    console.log(`   Socket.IO multiplayer enabled ✓`);
});
