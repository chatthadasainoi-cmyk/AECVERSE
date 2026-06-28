const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });
const PORT = process.env.PORT || 3000;

// เชื่อมต่อ Supabase ผ่านตัวแปรระบบบน Railway
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const players = {};
const COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9f43','#00d2d3','#ff6b9d'];
let currentModelUrl = null;
let currentModelName = null;

// ดึงข้อมูล Workflow ทั้งหมดจาก Supabase ตอนเซิร์ฟเวอร์สตาร์ท/คนแรกเข้าเกม
async function getAllWorkflows() {
    try {
        if (!supabaseUrl || !supabaseKey) return {};
        const { data, error } = await supabase.from('workflows').select('*');
        if (error) throw error;
        
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

io.on('connection', async (socket) => {
    console.log(`[+] ${socket.id}`);
    const player = {
        id: socket.id,
        name: `Player_${socket.id.slice(0,4).toUpperCase()}`,
        color: COLORS[Math.floor(Math.random()*COLORS.length)],
        position: { x:(Math.random()-0.5)*6, y:0.9, z:8+(Math.random()-0.5)*4 },
        rotation: { y:0 }
    };
    players[socket.id] = player;

    // ดึงข้อมูลจริงจาก Supabase ส่งให้คนที่เพิ่งโหลดหน้าเว็บเข้าเกม
    const currentWorkflowDb = await getAllWorkflows();

    socket.emit('self_init', {
        self: player,
        others: Object.values(players).filter(p=>p.id!==socket.id),
        modelUrl: currentModelUrl,
        modelName: currentModelName,
        workflowDb: currentWorkflowDb // ข้อมูลชิ้นส่วนจาก DB
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

    // จุดแก้ไขที่ทำให้ทุกคนเห็นรายละเอียดชิ้นส่วนและบันทึกลง Supabase
    socket.on('workflow_update', async (data) => {
        try {
            if (supabaseUrl && supabaseKey) {
                // อัปเดตหรือเพิ่มข้อมูลใหม่ลงในตาราง workflows บน Supabase
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
            
            // ใช้ io.emit เพื่อกระจายข้อมูลกลับไปหา "ทุกคน" (รวมถึงตัวคนกดด้วย) แบบเรียลไทม์
            io.emit('workflow_updated', data);
            console.log(`[REALTIME DB SYNC] key:${data.key} name:${data.name}`);
        } catch (err) {
            console.error('Supabase save error:', err.message);
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
        console.log(`[-] ${socket.id}`);
    });
});

server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
