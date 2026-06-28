const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });
const PORT = process.env.PORT || 3000;

// เชื่อมต่อ Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const players = {};
const COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9f43','#00d2d3','#ff6b9d'];
let currentModelUrl = null;
let currentModelName = null;
const workflowDb = {}; // คลังข้อมูลเดิมสำหรับเก็บ Object

// ดึงข้อมูลจาก Supabase มาจัดเก็บลงหน่วยความจำเซิร์ฟเวอร์ตอนเริ่มต้น
async function syncFromSupabase() {
    try {
        if (!supabaseUrl || !supabaseKey) return;
        const { data, error } = await supabase.from('workflows').select('*');
        if (error) throw error;
        data.forEach(row => {
            workflowDb[row.key] = { 
                name: row.name, 
                desc: row.description, 
                steps: row.steps || [], 
                colorClass: row.color_class || 'tag-blue' 
            };
        });
        console.log('[SUPABASE] Synced data successfully.');
    } catch (err) {
        console.error('[SUPABASE FETCH ERROR]:', err.message);
    }
}
syncFromSupabase();

io.on('connection', socket => {
    console.log(`[+] ${socket.id}`);
    const player = {
        id: socket.id,
        name: `Player_${socket.id.slice(0,4).toUpperCase()}`,
        color: COLORS[Math.floor(Math.random()*COLORS.length)],
        position: { x:(Math.random()-0.5)*6, y:0.9, z:8+(Math.random()-0.5)*4 },
        rotation: { y:0 }
    };
    players[socket.id] = player;

    socket.emit('self_init', {
        self: player,
        others: Object.values(players).filter(p=>p.id!==socket.id),
        modelUrl: currentModelUrl,
        modelName: currentModelName,
        workflowDb: workflowDb
    });
    socket.broadcast.emit('player_joined', player);

    socket.on('player_move', data => {
        if (!players[socket.id]) return;
        Object.assign(players[socket.id], { position: data.position, rotation: data.rotation });
        socket.broadcast.emit('player_moved', { id: socket.id, position: data.position, rotation: data.rotation });
    });

    socket.on('model_shared', data => {
        currentModelUrl = data.url; currentModelName = data.fileName;
        io.emit('load_model', { url: data.url, fileName: data.fileName });
    });

    // จุดแก้ไข: เปลี่ยนเป็น io.emit ส่งกระจายหาทุกคนให้เปลี่ยนหน้าจอตามถาวร
    socket.on('workflow_update', async (data) => {
        workflowDb[data.key] = { name:data.name, desc:data.desc, steps:data.steps, colorClass:data.colorClass||'tag-blue' };
        io.emit('workflow_updated', data);

        try {
            if (supabaseUrl && supabaseKey) {
                await supabase
                    .from('workflows')
                    .upsert({
                        key: data.key,
                        name: data.name,
                        description: data.desc,
                        steps: data.steps || [],
                        color_class: data.colorClass || 'tag-blue',
                        updated_at: new Date()
                    });
            }
        } catch (err) {
            console.error('[SUPABASE SAVE ERROR]:', err.message);
        }
    });

    socket.on('set_name', name => {
        if (!players[socket.id]) return;
        players[socket.id].name = String(name).slice(0,20).replace(/[<>]/g,'');
        io.emit('player_renamed', { id:socket.id, name:players[socket.id].name });
    });

    socket.on('chat_message', text => {
        if (!players[socket.id]) return;
        io.emit('chat_message', { id:socket.id, name:players[socket.id].name, color:players[socket.id].color, text:String(text).slice(0,200).replace(/</g,'&lt;') });
    });

    socket.on('disconnect', () => {
        delete players[socket.id];
        io.emit('player_left', { id:socket.id });
    });
});

server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
