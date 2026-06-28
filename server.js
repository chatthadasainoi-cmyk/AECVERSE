const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*", methods: ["GET","POST"] } });
const PORT = process.env.PORT || 3000;

// เชื่อมต่อ Supabase ผ่าน Environment Variables บน Railway
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

const players = {};
const COLORS = ['#ff6b6b','#ffd93d','#6bcb77','#4d96ff','#c77dff','#ff9f43','#00d2d3','#ff6b9d'];
let currentModelUrl = null;
let currentModelName = null;

// ประกาศตัวแปรคลังข้อมูลเดิมกลับมา เพื่อให้หน้าบ้านดึงไปใช้งานได้และไม่ระเบิด
const workflowDb = {}; 

// ซิงค์ข้อมูลจาก Supabase เข้าสู่ตัวแปรหลักตอนเปิดเซิร์ฟเวอร์
async function syncFromSupabase() {
    try {
        if (!supabaseUrl || !supabaseKey) return;
        const { data, error } = await supabase.from('workflows').select('*');
        if (error) throw error;
        data.forEach(row => {
            workflowDb[row.key] = { 
                name: row.name, 
                desc: row.description, 
                steps: row.steps, 
                colorClass: row.color_class || 'tag-blue' 
            };
        });
        console.log('[SUPABASE] Synced initial data into workflowDb');
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
        workflowDb: workflowDb // ส่งคลังข้อมูลเดิมให้คนที่เข้าใหม่เห็นชิ้นส่วนครบถ้วน
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

    // จุดรับคำสั่งแก้ไขจากผู้เล่น ยิงเข้าคลังชิ้นส่วน และบันทึกถาวรลง Supabase
    socket.on('workflow_update', async (data) => {
        // 1. เก็บในระบบชั่วคราวเผื่อสแตนด์บายซิงค์ทันที
        workflowDb[data.key] = { name: data.name, desc: data.desc, steps: data.steps, colorClass: data.colorClass || 'tag-blue' };
        
        // 2. ส่งกระจายสัญญาณบอกทุกคนให้เกิดการอัปเดตแบบเรียลไทม์ (เปลี่ยนจาก broadcast เป็น io.emit เพื่ออัปเดตให้ครบทุกคนรวมถึงคนแก้)
        io.emit('workflow_updated', data);
        console.log(`[WORKFLOW UPDATED] key:${data.key} name:${data.name}`);

        // 3. ยิงเก็บเข้าฐานข้อมูล Supabase แบบถาวร
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
        console.log(`[-] ${socket.id}`);
    });
});

server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
