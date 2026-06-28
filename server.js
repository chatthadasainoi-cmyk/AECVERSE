const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js'); // 1. นำเข้า Supabase

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });
const PORT = process.env.PORT || 3000;

// 2. เชื่อมต่อ Supabase (ตั้งค่า Environment Variables บน Railway/Vercel)
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const players = {};
const COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9f43','#00d2d3','#ff6b9d'];
let currentModelUrl = null;
let currentModelName = null;

// ฟังก์ชันดึงข้อมูลทั้งหมดจาก Supabase ตอนเซิร์ฟเวอร์เปิด (เผื่อใช้ซิงค์เริ่มต้น)
async function getAllWorkflows() {
    try {
        const { data, error } = await supabase.from('workflows').select('*');
        if (error) throw error;
        // แปลงกลับเป็น Format Object key -> value แบบที่คุณใช้
        const dbObj = {};
        data.forEach(row => {
            dbObj[row.key] = { name: row.name, desc: row.description, steps: row.steps, colorClass: row.color_class };
        });
        return dbObj;
    } catch (err) {
        console.error('Error fetching from Supabase:', err.message);
        return {};
    }
}

io.on('connection', async (socket) => { // ใส่ async ตรงนี้
    console.log(`[+] ${socket.id}`);
    const player = {
        id: socket.id,
        name: `Player_${socket.id.slice(0,4).toUpperCase()}`,
        color: COLORS[Math.floor(Math.random()*COLORS.length)],
        position: { x:(Math.random()-0.5)*6, y:0.9, z:8+(Math.random()-0.5)*4 },
        rotation: { y:0 }
    };
    players[socket.id] = player;

    // ดึงข้อมูลล่าสุดจาก Supabase ส่งให้ผู้เล่นที่เพิ่งเข้าห้อง
    const currentWorkflowDb = await getAllWorkflows();

    socket.emit('self_init', {
        self: player,
        others: Object.values(players).filter(p=>p.id!==socket.id),
        modelUrl: currentModelUrl,
        modelName: currentModelName,
        workflowDb: currentWorkflowDb // ส่งข้อมูลจริงจากฐานข้อมูลไป
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
        console.log(`[MODEL] ${data.fileName}`);
    });

    // 3. จุดสำคัญ: เมื่อมีคนแก้ไขรายละเอียดชิ้นส่วน (Workflow)
    socket.on('workflow_update', async (data) => {
        // อัปเดตลง Supabase (ถ้ามี key เดิมจะทับ ถ้าไม่มีจะสร้างใหม่ ด้วย upsert)
        try {
            const { error } = await supabase
                .from('workflows')
                .upsert({
                    key: data.key,
                    name: data.name,
                    description: data.desc,
                    steps: data.steps || [],
                    color_class: data.colorClass || 'tag-blue',
                    updated_at: new Date()
                });

            if (error) throw error;

            // ส่งข้อมูลที่อัปเดตหา "ทุกคน" ในโปรเจกต์ (ใช้ io.emit แทน socket.broadcast.emit)
            // เพื่อให้หน้าจอของทุกคนเปลี่ยนตามทันทีแบบ Real-time
            io.emit('workflow_updated', data);
            console.log(`[SUPABASE DB & REALTIME] Updated key:${data.key}`);
        } catch (err) {
            console.error('Supabase update failed:', err.message);
        }
    });

    // 4. เพิ่มระบบเลือกชิ้นส่วน (Component Selection) 
    // เมื่อมีคนคลิกดูชิ้นส่วนไหน ให้คนอื่นเห็นด้วยว่ากำลังพรีเซนต์ชิ้นนี้อยู่
    socket.on('component_select', data => {
        // data ประกอบด้วย { key: 'ชิ้นส่วนที่เลือก', playerId: socket.id }
        socket.broadcast.emit('component_selected', data);
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
        console.log(`[-] ${socket.id}`);
    });
});

server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
