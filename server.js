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

// ============================================================
// ROLE — 3 ระดับ
//   admin    : ทำได้ทุกอย่าง (อัปโหลด/ลบโมเดล, ขยับโมเดล, แก้ข้อมูล, ปักจุด)
//   engineer : แก้ข้อมูลความปลอดภัย + ปักจุดได้ แต่ยุ่งกับตัวโมเดลไม่ได้
//   user     : ดูอย่างเดียว
// ============================================================
const ROLES = ['admin', 'engineer', 'user'];
function userRole(user) {
    if (isAdminUser(user)) return 'admin';
    return user?.app_metadata?.role === 'engineer' ? 'engineer' : 'user';
}
// แก้ข้อมูลชิ้นส่วน/ปักจุดได้ไหม
const canEditData = user => userRole(user) !== 'user';
// ยุ่งกับตัวโมเดล (อัปโหลด/ลบ/ขยับ/ล็อก) ได้ไหม
const canManageModel = user => userRole(user) === 'admin';

// ปฏิเสธคำสั่งที่ไม่มีสิทธิ์ แล้วบอกกลับไปให้ client ขึ้นข้อความได้
// สำคัญ: ต้องกันที่ฝั่ง server ด้วย ซ่อนปุ่มฝั่งหน้าเว็บอย่างเดียวไม่พอ
// เพราะใครก็ยิง socket event ตรงมาเองได้จาก console
function denyAction(socket, what) {
    socket.emit('action_denied', { action: what });
    console.warn(`[PERM] ปฏิเสธ "${what}" — ${socket.data.user?.email || 'unknown'} (${userRole(socket.data.user)})`);
}

// รายการ id งาน onboarding ที่นับ progress ได้ — ต้องตรงกับ ONBOARDING_TASKS ใน
// public/public-portal.js เป๊ะๆ (ชื่อ id เท่านั้นพอ ไม่ต้องมี label/href/icon ฝั่งนี้)
const ONBOARDING_TASK_IDS = ['avatarSaved', 'virtualTourVisited', 'digitalTwinVisited', 'knowledgeCheckPassed', 'settingsVisited'];

function computeOnboardingProgress(user) {
    const tasks = user.user_metadata?.onboardingTasks || {};
    const done = ONBOARDING_TASK_IDS.filter(id => tasks[id]).length;
    return {
        done,
        total: ONBOARDING_TASK_IDS.length,
        percent: Math.round((done / ONBOARDING_TASK_IDS.length) * 100),
        tasks: Object.fromEntries(ONBOARDING_TASK_IDS.map(id => [id, !!tasks[id]]))
    };
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

// ตรวจสิทธิ์แอดมินแบบไม่ต้องใช้ service role key — ยืนยัน token ด้วย anon key แล้วอ่าน
// app_metadata.role ที่ server เป็นคนกำหนด (ปลอดภัยเท่ากับ requireAdmin)
// ใช้กับ endpoint ที่ไม่ต้องยุ่งกับบัญชีคนอื่น เช่นการตั้งค่าแบบทดสอบ — จะได้ใช้งานได้
// แม้เครื่องนั้นยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY
async function requireAdminLite(req, res, next) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ error: 'ไม่พบ token การเข้าสู่ระบบ' });
    try {
        const { data, error } = await supabaseVerify.auth.getUser(token);
        if (error || !data.user) return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
        if (!isAdminUser(data.user)) return res.status(403).json({ error: 'บัญชีนี้ไม่มีสิทธิ์ Admin' });
        req.adminUser = data.user;
        next();
    } catch (err) {
        res.status(401).json({ error: 'ตรวจสอบสิทธิ์ไม่สำเร็จ' });
    }
}

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });
    const users = data.users.map(u => {
        const p = presence.get(u.id);
        return {
            id: u.id,
            email: u.email,
            role: userRole(u),
            isBootstrapAdmin: ADMIN_BOOTSTRAP_EMAILS.includes((u.email || '').toLowerCase()),
            createdAt: u.created_at,
            lastSignInAt: u.last_sign_in_at,
            // สถานะออนไลน์จริง — มาจาก socket ที่ต่ออยู่ตอนนี้ (ดูหมายเหตุที่ presence Map ด้านล่าง)
            online: !!(p && p.socketCount > 0),
            lastSeenAt: p ? p.lastSeenAt : null,
            onboardingProgress: computeOnboardingProgress(u)
        };
    });
    res.json({ users, me: req.adminUser.id });
});

// เช็คสิทธิ์ของ "ตัวเอง" เท่านั้น (ไม่ต้องมี service role key) — ใช้ตอน login
// เพื่อตัดสินใจว่าจะพาไปหน้า Dashboard (admin) หรือ PublicHome (user ทั่วไป)
app.get('/api/me/role', async (req, res) => {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return res.status(401).json({ error: 'ไม่พบ token การเข้าสู่ระบบ' });
    const { data, error } = await supabaseVerify.auth.getUser(token);
    if (error || !data.user) return res.status(401).json({ error: 'Token ไม่ถูกต้องหรือหมดอายุ' });
    res.json({ isAdmin: isAdminUser(data.user), role: userRole(data.user) });
});

app.post('/api/admin/users/:id/role', requireAdmin, async (req, res) => {
    const { role } = req.body;
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'role ต้องเป็น admin, engineer หรือ user เท่านั้น' });

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

// ============================================================
// PRESENCE — "ออนไลน์ตอนนี้" ของบัญชีทั้งระบบ (กว้างกว่าผู้เล่นในโลก 3D)
// นับทุก socket ที่ยืนยันตัวตนได้ (role player เสมอมี token, role watcher
// นับด้วยถ้าหน้านั้นส่ง token มา เช่น Analytics/Reports/Emergency/Public*)
// เก็บแค่ใน memory — รีสตาร์ท server แล้วค่อยนับใหม่ ไม่ต้อง persist
// ============================================================
const presence = new Map(); // userId -> { socketCount, lastSeenAt }
const adminPresenceSockets = new Set(); // socket ของแอดมินที่เปิดหน้า Settings ไว้ (รับอัปเดตสด)

function presenceSnapshot() {
    const out = {};
    presence.forEach((p, uid) => { out[uid] = { online: p.socketCount > 0, lastSeenAt: p.lastSeenAt }; });
    return out;
}
function broadcastPresence() {
    const snap = presenceSnapshot();
    adminPresenceSockets.forEach(id => {
        const s = io.sockets.sockets.get(id);
        if (s) s.emit('presence_snapshot', snap); else adminPresenceSockets.delete(id);
    });
}
function touchPresence(userId, delta) {
    if (!userId) return;
    const p = presence.get(userId) || { socketCount: 0, lastSeenAt: Date.now() };
    p.socketCount = Math.max(0, p.socketCount + delta);
    p.lastSeenAt = Date.now();
    presence.set(userId, p);
    broadcastPresence();
}

let currentModelUrl = null;
let currentModelName = null;
const workflowDb = {};        // key -> { name, desc, steps, colorClass, requiresPPE }
const typeAssignments = {};   // key -> typeKey ที่ admin กำหนดเอง
// จุดที่ผู้ใช้ปักเอง (marker) — id -> { id, name, color, x, y, z, shape, size, radius, emergency }
// ต่างจาก typeAssignments ตรงที่ตั้งชื่อ/สีได้อิสระ ไม่ต้องผูกกับประเภทอุปกรณ์ที่มีอยู่
const markers = {};
// REQ 3: การเรียกรวมพลฉุกเฉินที่ยัง "ค้างอยู่" — null = ไม่มีการเรียก
// เก็บไว้เพื่อให้คนที่เพิ่งเข้ามาทีหลังรู้ด้วยว่าตอนนี้กำลังเรียกอยู่ (ส่งไปกับ self_init)
// ไม่ต้อง persist ลงไฟล์ — เป็นเหตุการณ์เฉพาะหน้า รีสตาร์ท server แล้วถือว่าจบไป
let emergencyCall = null;

// REQ 1 & 2: ตำแหน่ง/ขนาด/หมุนของโมเดลโรงงาน — sync ให้ทุกคนเห็นตรงกัน
let modelTransform = { posX: 0, posY: 0, posZ: 0, rotY: 0, scale: 1 };
// เริ่มต้น "ล็อก" ไว้เสมอ กันแก้ไขพลาดตั้งแต่ผู้เล่นคนแรกเข้าห้อง — ต้องให้ admin ปลดล็อกเองเท่านั้น
let modelLocked = true;

// ============================================================
// SCENE STATE PERSISTENCE — เก็บ state ของห้องลง Supabase Storage
// เดิม state ทั้งหมดอยู่ใน memory -> Railway redeploy ทุกครั้ง (= ทุกการ merge PR)
// โมเดล + ข้อมูลความปลอดภัยที่แก้ + type ที่กำหนด หายเกลี้ยง ผู้เล่นเลยเห็นไม่ตรงกัน
// ตอนนี้: server โหลด state กลับมาตอนบูต และเซฟทุกครั้งที่มีการแก้ไข (debounce 1.5s)
// ============================================================
// production (Railway) กับเครื่อง dev ใช้ไฟล์ state คนละไฟล์ — กัน server ทดสอบ
// ในเครื่องเขียนทับ "โลกจริง" ของผู้ใช้บน production (Railway ตั้ง env RAILWAY_* ให้อัตโนมัติ)
const IS_PRODUCTION = !!(process.env.RAILWAY_ENVIRONMENT_NAME || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_STATIC_URL);
const SCENE_STATE_FILE = IS_PRODUCTION ? 'scene_state_v1.json' : 'scene_state_dev.json';
let persistTimer = null;

function schedulePersistSceneState() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(persistSceneState, 1500); // กันยิงถี่ตอน admin ลาก slider
}

async function persistSceneState() {
    try {
        const body = JSON.stringify({
            savedAt: new Date().toISOString(),
            currentModelUrl, currentModelName,
            workflowDb, typeAssignments, markers, modelTransform, modelLocked
        });
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/models/${SCENE_STATE_FILE}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
            body
        });
        if (!res.ok) console.warn('[PERSIST] บันทึก state ไม่สำเร็จ:', (await res.text()).slice(0, 200));
    } catch (err) { console.warn('[PERSIST] บันทึก state ไม่สำเร็จ:', err.message); }
}

// ============================================================
// KNOWLEDGE CHECK SETTINGS — เปิด/ปิดแบบทดสอบ + หัวข้อการอบรม (ตั้งค่าโดยแอดมิน)
// เดิมเก็บใน localStorage ของเบราว์เซอร์ผู้เยี่ยมชมแต่ละคน ทำให้แอดมินเปิดสวิตช์
// ในเครื่องตัวเองแล้วผู้ใช้คนอื่นไม่เห็นการเปลี่ยนแปลง — ย้ายมาเก็บฝั่ง server จริง
// ============================================================
const KNOWLEDGE_SETTINGS_FILE = IS_PRODUCTION ? 'knowledge_settings_v1.json' : 'knowledge_settings_dev.json';
const DEFAULT_KNOWLEDGE_SETTINGS = {
    enabled: false,
    topic: 'ความปลอดภัยเบื้องต้นในโรงงานก๊าซชีวภาพ (Biogas Plant Basic Safety)',

    // 1. การกำหนดเวลา — 'always' = เปิดตลอด, 'range' = เปิดเฉพาะช่วงที่กำหนด
    scheduleMode: 'always',
    startAt: '',   // ISO string
    endAt: '',

    // 2. การทำแบบทดสอบ
    passingScore: 70,     // %
    timeLimitMin: 0,      // 0 = ไม่จำกัดเวลา
    questionCount: 0,     // 0 = ใช้ทุกข้อในคลัง
    maxAttempts: 0,       // 0 = ทำได้ไม่จำกัดครั้ง
    randomQuestions: true,
    shuffleChoices: true,
    showScore: true,
    showAnswers: false,

    // 3. ผลการทำแบบทดสอบ — passRule 'total' = ตัดสินจากคะแนนรวม, 'perQuestion' = ต้องถูกทุกข้อ
    showResult: true,
    saveResult: true,
    passRule: 'total',

    // 4. ใบเซอร์ติฟิเคต — certRule 'pass' = แค่สอบผ่าน, 'passAndTour' = ต้องชม Virtual Tour ด้วย
    certEnabled: true,
    certRule: 'pass',
    certTemplate: 'Basic Safety Certificate',
    certSigner: 'Super Administrator',

    // 5. การแจ้งเตือน — อีเมลยังไม่รองรับ (ไม่มีบริการส่งอีเมลต่อไว้) จึงไม่มีคีย์อีเมลที่นี่
    notifyWeb: true,
    autoDownloadCert: false
};
let knowledgeSettings = { ...DEFAULT_KNOWLEDGE_SETTINGS };

// กรองค่าที่รับมาให้อยู่ในขอบเขตที่ใช้งานได้จริงเสมอ — ค่าพิลึกจาก client ทำให้
// ฝั่งผู้ใช้คำนวณคะแนน/จับเวลาเพี้ยนทั้งระบบ
function sanitizeKnowledgeSettings(raw, base) {
    const s = raw && typeof raw === 'object' ? raw : {};
    const prev = base || DEFAULT_KNOWLEDGE_SETTINGS;
    const bool = (v, d) => (typeof v === 'boolean' ? v : d);
    const int = (v, lo, hi, d) => {
        const n = Math.round(Number(v));
        return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d;
    };
    const iso = v => {
        if (typeof v !== 'string' || !v.trim()) return '';
        const d = new Date(v);
        return isNaN(d.getTime()) ? '' : d.toISOString();
    };
    const pick = (v, allowed, d) => (allowed.includes(v) ? v : d);
    const text = (v, max, d) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : d);

    return {
        enabled: bool(s.enabled, prev.enabled),
        topic: text(s.topic, 200, prev.topic),
        scheduleMode: pick(s.scheduleMode, ['always', 'range'], prev.scheduleMode),
        startAt: s.startAt === undefined ? prev.startAt : iso(s.startAt),
        endAt: s.endAt === undefined ? prev.endAt : iso(s.endAt),
        passingScore: int(s.passingScore, 0, 100, prev.passingScore),
        timeLimitMin: int(s.timeLimitMin, 0, 240, prev.timeLimitMin),
        questionCount: int(s.questionCount, 0, 100, prev.questionCount),
        maxAttempts: int(s.maxAttempts, 0, 99, prev.maxAttempts),
        randomQuestions: bool(s.randomQuestions, prev.randomQuestions),
        shuffleChoices: bool(s.shuffleChoices, prev.shuffleChoices),
        showScore: bool(s.showScore, prev.showScore),
        showAnswers: bool(s.showAnswers, prev.showAnswers),
        showResult: bool(s.showResult, prev.showResult),
        saveResult: bool(s.saveResult, prev.saveResult),
        passRule: pick(s.passRule, ['total', 'perQuestion'], prev.passRule),
        certEnabled: bool(s.certEnabled, prev.certEnabled),
        certRule: pick(s.certRule, ['pass', 'passAndTour'], prev.certRule),
        certTemplate: text(s.certTemplate, 100, prev.certTemplate),
        certSigner: text(s.certSigner, 100, prev.certSigner),
        notifyWeb: bool(s.notifyWeb, prev.notifyWeb),
        autoDownloadCert: bool(s.autoDownloadCert, prev.autoDownloadCert)
    };
}

// "ตอนนี้ทำแบบทดสอบได้ไหม" — รวมทั้งสวิตช์เปิด/ปิด และช่วงเวลาที่ตั้งไว้
// คำนวณที่ server เพื่อให้ทุกเครื่องตัดสินตรงกัน ไม่ขึ้นกับนาฬิกาเครื่องผู้ใช้
function knowledgeAvailability(now = Date.now()) {
    if (!knowledgeSettings.enabled) return { open: false, reason: 'disabled' };
    if (knowledgeSettings.scheduleMode !== 'range') return { open: true, reason: 'open' };
    const start = knowledgeSettings.startAt ? Date.parse(knowledgeSettings.startAt) : NaN;
    const end = knowledgeSettings.endAt ? Date.parse(knowledgeSettings.endAt) : NaN;
    if (!isNaN(start) && now < start) return { open: false, reason: 'before', startAt: knowledgeSettings.startAt };
    if (!isNaN(end) && now > end) return { open: false, reason: 'after', endAt: knowledgeSettings.endAt };
    return { open: true, reason: 'open' };
}

async function loadKnowledgeSettings() {
    try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/models/${KNOWLEDGE_SETTINGS_FILE}?t=${Date.now()}`);
        if (!res.ok) return;
        const s = await res.json();
        // ไฟล์เก่ามีแค่ enabled/topic — sanitize จะเติมค่าที่เหลือจาก default ให้เอง
        if (s && typeof s === 'object') knowledgeSettings = sanitizeKnowledgeSettings(s, DEFAULT_KNOWLEDGE_SETTINGS);
    } catch (err) { console.warn('[KNOWLEDGE] โหลดการตั้งค่าไม่สำเร็จ:', err.message); }
}
async function persistKnowledgeSettings() {
    try {
        await fetch(`${SUPABASE_URL}/storage/v1/object/models/${KNOWLEDGE_SETTINGS_FILE}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
            body: JSON.stringify(knowledgeSettings)
        });
    } catch (err) { console.warn('[KNOWLEDGE] บันทึกการตั้งค่าไม่สำเร็จ:', err.message); }
}
loadKnowledgeSettings();

// ส่ง availability ไปด้วยเสมอ ฝั่งหน้าเว็บจะได้ไม่ต้องคำนวณช่วงเวลาเองให้เพี้ยนกันคนละนาฬิกา
app.get('/api/knowledge-settings', (req, res) =>
    res.json({ ...knowledgeSettings, availability: knowledgeAvailability() }));

app.post('/api/knowledge-settings', requireAdminLite, async (req, res) => {
    knowledgeSettings = sanitizeKnowledgeSettings(req.body, knowledgeSettings);
    await persistKnowledgeSettings();
    res.json({ success: true, settings: { ...knowledgeSettings, availability: knowledgeAvailability() } });
});

// ============================================================
// KNOWLEDGE CHECK QUESTIONS — คลังคำถามแบบทดสอบ แก้ไขได้โดยแอดมินเอง
// (แทนที่ QUESTIONS ที่เคย hardcode ไว้ในโค้ด client) เก็บ persist แบบเดียวกับ
// knowledgeSettings ด้านบน
// ============================================================
const KNOWLEDGE_QUESTIONS_FILE = IS_PRODUCTION ? 'knowledge_questions_v1.json' : 'knowledge_questions_dev.json';
const DEFAULT_KNOWLEDGE_QUESTIONS = [
    { q: "ก๊าซชีวภาพ (Biogas) ที่ผลิตได้จากบ่อหมัก ส่วนใหญ่ประกอบด้วยก๊าซชนิดใด?", options: ["ก๊าซมีเทน (CH4)", "ก๊าซออกซิเจน (O2)", "ก๊าซไฮโดรเจน (H2)", "ไอน้ำ"], correct: 0, topic: "ความรู้พื้นฐานก๊าซชีวภาพ" },
    { q: "ก่อนเข้าใกล้บริเวณที่มีความเสี่ยงก๊าซรั่ว ควรสวมใส่อุปกรณ์ใดเป็นอันดับแรก?", options: ["แว่นกันแดด", "เครื่องตรวจวัดก๊าซชนิดพกพา (4-Gas Detector)", "หมวกไหมพรม", "ไม่ต้องสวมใส่อะไร"], correct: 1, topic: "อุปกรณ์ป้องกันส่วนบุคคล (PPE)" },
    { q: "หากพบว่าความดันในถังหมักก๊าซสูงเกินขีดจำกัดที่กำหนด ควรทำอย่างไรเป็นลำดับแรก?", options: ["เปิดฝาถังเองเพื่อระบายแรงดัน", "เพิกเฉยเพราะไม่ใช่หน้าที่ของตน", "แจ้งเจ้าหน้าที่ทันทีและปฏิบัติตามขั้นตอนฉุกเฉิน", "ถ่ายรูปโพสต์ลงโซเชียลมีเดีย"], correct: 2, topic: "ขั้นตอนฉุกเฉิน (Emergency Response)" },
    { q: "ระบบ LOTO ที่ใช้ก่อนซ่อมบำรุงเครื่องจักร มีไว้เพื่อจุดประสงค์ใด?", options: ["ล็อกประตูอาคารสำนักงาน", "ป้องกันเครื่องจักรทำงานโดยไม่ตั้งใจขณะซ่อมบำรุง", "ชื่อโปรแกรมบันทึกข้อมูลการผลิต", "ชื่อทีมงานฝ่ายรักษาความปลอดภัย"], correct: 1, topic: "ความปลอดภัยงานบำรุงรักษา (LOTO)" },
    { q: "ข้อใดคือพฤติกรรมที่ปลอดภัยที่สุดขณะเข้าเยี่ยมชมพื้นที่โรงงานจริง?", options: ["แยกออกจากกลุ่มเพื่อถ่ายรูปมุมสวย", "สัมผัสอุปกรณ์ทุกชิ้นที่พบเจอ", "เดินตามเส้นทางที่กำหนดและฟังคำแนะนำของเจ้าหน้าที่ตลอดเวลา", "สูบบุหรี่ในจุดที่ไม่มีป้ายห้ามชัดเจน"], correct: 2, topic: "พฤติกรรมความปลอดภัยทั่วไป" }
];
let knowledgeQuestions = DEFAULT_KNOWLEDGE_QUESTIONS;

function sanitizeQuestions(list) {
    if (!Array.isArray(list)) return null;
    const clean = [];
    for (const item of list) {
        if (!item || typeof item.q !== 'string' || !item.q.trim()) continue;
        const options = Array.isArray(item.options) ? item.options.map(o => String(o || '').trim()).filter(Boolean) : [];
        if (options.length < 2) continue;
        const correct = Number.isInteger(item.correct) && item.correct >= 0 && item.correct < options.length ? item.correct : 0;
        // phase = ข้อนี้ใช้กับรอบไหน: ก่อนเข้าชม / หลังเข้าชม / ทั้งสองรอบ
        // ค่าเดิมในคลังที่ยังไม่มีฟิลด์นี้ถือเป็น 'both' เพื่อไม่ให้ข้อสอบเดิมหายไปจากทุกรอบ
        const phase = ['pre', 'post', 'both'].includes(item.phase) ? item.phase : 'both';
        clean.push({
            q: item.q.trim().slice(0, 500),
            options: options.slice(0, 6).map(o => o.slice(0, 200)),
            correct,
            topic: String(item.topic || '').trim().slice(0, 100) || 'ทั่วไป',
            phase
        });
    }
    return clean.length ? clean : null;
}

async function loadKnowledgeQuestions() {
    try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/models/${KNOWLEDGE_QUESTIONS_FILE}?t=${Date.now()}`);
        if (!res.ok) return;
        const s = await res.json();
        const clean = sanitizeQuestions(s);
        if (clean) knowledgeQuestions = clean;
    } catch (err) { console.warn('[KNOWLEDGE] โหลดคำถามไม่สำเร็จ:', err.message); }
}
async function persistKnowledgeQuestions() {
    try {
        await fetch(`${SUPABASE_URL}/storage/v1/object/models/${KNOWLEDGE_QUESTIONS_FILE}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
            body: JSON.stringify(knowledgeQuestions)
        });
    } catch (err) { console.warn('[KNOWLEDGE] บันทึกคำถามไม่สำเร็จ:', err.message); }
}
loadKnowledgeQuestions();

// คลังคำถามฉบับเต็ม (มีเฉลย) — เฉพาะแอดมินเท่านั้น
// เดิม endpoint นี้เปิดสาธารณะ ใครเปิด DevTools ก็เห็นเฉลยครบทุกข้อ ตัวเลือก
// "ซ่อนเฉลยหลังสอบ" จึงไม่มีความหมายเลย ตอนนี้ผู้ทำข้อสอบได้รับชุดที่ไม่มีเฉลยแทน
app.get('/api/knowledge-questions', requireAdminLite, (req, res) => res.json(knowledgeQuestions));
app.post('/api/knowledge-questions', requireAdminLite, async (req, res) => {
    const clean = sanitizeQuestions(req.body);
    if (!clean) return res.status(400).json({ error: 'ต้องมีคำถามอย่างน้อย 1 ข้อ และแต่ละข้อต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือกที่ไม่ว่าง' });
    knowledgeQuestions = clean;
    await persistKnowledgeQuestions();
    res.json({ success: true, questions: knowledgeQuestions });
});

// ============================================================
// KNOWLEDGE CHECK — การทำข้อสอบจริง (ออกชุดข้อสอบ + ตรวจให้คะแนนที่ server)
// ตรวจที่ server เท่านั้น เพราะการตรวจฝั่ง client แปลว่าผู้ทำแก้คะแนนตัวเองได้
// และเฉลยต้องหลุดไปอยู่ในเครื่องผู้ทำตั้งแต่ก่อนเริ่มสอบ
// ============================================================
const quizPapers = new Map();   // paperId -> { userId, items, startedAt, expiresAt }
const quizAttempts = new Map(); // userId -> จำนวนครั้งที่ทำไปแล้ว (in-memory)
const PAPER_GRACE_MS = 5 * 60 * 1000;

async function userFromRequest(req) {
    const token = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!token) return null;
    try {
        const { data, error } = await supabaseVerify.auth.getUser(token);
        return error ? null : data.user;
    } catch (err) { return null; }
}

function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// เก็บกวาดชุดข้อสอบที่หมดอายุ ไม่ให้ Map บวมไปเรื่อยๆ
setInterval(() => {
    const now = Date.now();
    for (const [id, p] of quizPapers) if (p.expiresAt < now) quizPapers.delete(id);
}, 10 * 60 * 1000).unref?.();

app.post('/api/knowledge-quiz/start', async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อนทำแบบทดสอบ' });

    const isAdmin = isAdminUser(user);
    const avail = knowledgeAvailability();
    // แอดมินทดลองทำได้เสมอ เพื่อตรวจข้อสอบก่อนเปิดให้คนอื่น
    if (!avail.open && !isAdmin) return res.status(403).json({ error: 'ยังไม่เปิดให้ทำแบบทดสอบในขณะนี้', availability: avail });

    // จำนวนครั้ง: ใช้ค่าที่นับไว้ใน memory เป็นหลัก ถ้ายังไม่มีให้ตั้งต้นจาก metadata ของบัญชี
    // (server รีสตาร์ทแล้วยังนับต่อได้ เพราะฝั่ง client บันทึกค่ากลับเข้าบัญชีทุกครั้ง)
    if (!quizAttempts.has(user.id)) {
        const fromMeta = Number(user.user_metadata?.quizAttempts);
        quizAttempts.set(user.id, Number.isFinite(fromMeta) && fromMeta > 0 ? Math.floor(fromMeta) : 0);
    }
    const used = quizAttempts.get(user.id);
    const max = knowledgeSettings.maxAttempts;
    if (max > 0 && used >= max && !isAdmin) {
        return res.status(403).json({ error: `ทำแบบทดสอบครบจำนวนครั้งที่กำหนดแล้ว (${max} ครั้ง)`, attemptsUsed: used, maxAttempts: max });
    }

    // รอบของแบบทดสอบ — 'pre' ก่อนเข้าชม, 'post' หลังเข้าชม, ไม่ระบุ = ใช้ทุกข้อ
    const phase = ['pre', 'post'].includes(req.body && req.body.phase) ? req.body.phase : '';
    let bank = knowledgeQuestions;
    let phaseNote = '';
    if (phase) {
        const picked = knowledgeQuestions.filter(q => q.phase === phase || q.phase === 'both');
        // คลังยังไม่ได้ติ๊กข้อไหนไว้สำหรับรอบนี้เลย -> ใช้ทั้งคลังแทนการปล่อยให้ข้อสอบว่าง
        if (picked.length) bank = picked;
        else phaseNote = 'ยังไม่มีข้อสอบที่กำหนดไว้สำหรับรอบนี้ ระบบจึงใช้ข้อสอบทั้งคลังแทน';
    }

    // เลือกข้อ + สลับตัวเลือกตามการตั้งค่า
    let pool = knowledgeSettings.randomQuestions ? shuffled(bank) : bank.slice();
    const want = knowledgeSettings.questionCount;
    if (want > 0 && want < pool.length) pool = pool.slice(0, want);

    const items = pool.map(q => {
        // จับคู่ตัวเลือกกับ index เดิมไว้ก่อนสลับ จะได้ตรวจกลับได้ว่าที่เลือกมาคือข้อไหน
        const idx = q.options.map((_, i) => i);
        const order = knowledgeSettings.shuffleChoices ? shuffled(idx) : idx;
        return { q: q.q, topic: q.topic, options: order.map(i => q.options[i]), order, correct: q.correct };
    });

    const timeLimitMs = knowledgeSettings.timeLimitMin > 0 ? knowledgeSettings.timeLimitMin * 60000 : 0;
    const paperId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    quizPapers.set(paperId, {
        userId: user.id, items, startedAt: Date.now(),
        expiresAt: Date.now() + (timeLimitMs || 2 * 60 * 60 * 1000) + PAPER_GRACE_MS
    });

    res.json({
        paperId,
        // ไม่มี correct / order ติดไปกับ client เด็ดขาด
        questions: items.map(it => ({ q: it.q, topic: it.topic, options: it.options })),
        timeLimitMin: knowledgeSettings.timeLimitMin,
        passingScore: knowledgeSettings.passingScore,
        passRule: knowledgeSettings.passRule,
        attemptsUsed: used,
        maxAttempts: max,
        phase,          // ให้หน้าแบบทดสอบรู้ว่ากำลังทำรอบไหน จะได้ขึ้นป้ายบอกผู้ทำ
        phaseNote
    });
});

app.post('/api/knowledge-quiz/submit', async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อนส่งคำตอบ' });

    const { paperId, answers } = req.body || {};
    const paper = quizPapers.get(paperId);
    if (!paper) return res.status(400).json({ error: 'ชุดข้อสอบหมดอายุหรือไม่ถูกต้อง — กรุณาเริ่มทำใหม่' });
    if (paper.userId !== user.id) return res.status(403).json({ error: 'ชุดข้อสอบนี้ไม่ใช่ของบัญชีคุณ' });
    quizPapers.delete(paperId); // ใช้ได้ครั้งเดียว ส่งซ้ำเพื่อไล่เดาคำตอบไม่ได้

    // หมดเวลาแล้วยังส่งมา = ตรวจเท่าที่ตอบทัน แต่ทำเครื่องหมายไว้ว่าหมดเวลา
    const limitMs = knowledgeSettings.timeLimitMin > 0 ? knowledgeSettings.timeLimitMin * 60000 : 0;
    const elapsedMs = Date.now() - paper.startedAt;
    const timedOut = limitMs > 0 && elapsedMs > limitMs + 10000; // เผื่อ latency 10 วิ

    const given = Array.isArray(answers) ? answers : [];
    const detail = paper.items.map((it, i) => {
        const picked = Number.isInteger(given[i]) ? given[i] : -1;
        // ผู้ทำเห็นตัวเลือกที่สลับแล้ว ต้องแปลงกลับเป็น index จริงก่อนเทียบเฉลย
        const pickedOriginal = picked >= 0 && picked < it.order.length ? it.order[picked] : -1;
        return {
            q: it.q, topic: it.topic,
            correct: pickedOriginal === it.correct,
            // ตำแหน่งเฉลยในชุดที่ผู้ทำเห็น (ส่งกลับเฉพาะตอนแอดมินเปิด "แสดงเฉลย")
            correctIndex: it.order.indexOf(it.correct)
        };
    });

    const score = detail.filter(d => d.correct).length;
    const total = detail.length;
    const percent = total ? Math.round((score / total) * 100) : 0;
    const passed = knowledgeSettings.passRule === 'perQuestion'
        ? score === total
        : percent >= knowledgeSettings.passingScore;

    const used = (quizAttempts.get(user.id) || 0) + 1;
    quizAttempts.set(user.id, used);

    // ใบเซอร์: ต้องผ่าน และถ้าตั้งเป็น passAndTour ต้องเคยเข้า Virtual Tour ด้วย
    const tourDone = !!user.user_metadata?.onboardingTasks?.virtualTourVisited;
    const certEligible = knowledgeSettings.certEnabled && passed &&
        (knowledgeSettings.certRule !== 'passAndTour' || tourDone);

    res.json({
        score, total, percent, passed, timedOut,
        elapsedSec: Math.round(elapsedMs / 1000),
        attemptsUsed: used,
        maxAttempts: knowledgeSettings.maxAttempts,
        // เคารพการตั้งค่าของแอดมิน — ปิด "แสดงคะแนน/ผล" ก็ไม่ส่งรายละเอียดกลับไป
        showScore: knowledgeSettings.showScore,
        showResult: knowledgeSettings.showResult,
        detail: knowledgeSettings.showResult
            ? detail.map(d => (knowledgeSettings.showAnswers ? d : { q: d.q, topic: d.topic, correct: d.correct }))
            : [],
        saveResult: knowledgeSettings.saveResult,
        certEligible,
        certBlockedByTour: knowledgeSettings.certEnabled && passed && knowledgeSettings.certRule === 'passAndTour' && !tourDone,
        topic: knowledgeSettings.topic,
        certTemplate: knowledgeSettings.certTemplate,
        certSigner: knowledgeSettings.certSigner,
        autoDownloadCert: knowledgeSettings.autoDownloadCert
    });
});

// ============================================================
// GENERAL SETTINGS — ข้อมูลองค์กร/ภูมิภาค/สถานะระบบ (ตั้งค่าโดยแอดมิน)
// จากมอคอัพ "AEC VERSE — Settings · General" ที่เพื่อนผู้ใช้ทำมา
// ============================================================
const GENERAL_SETTINGS_FILE = IS_PRODUCTION ? 'general_settings_v1.json' : 'general_settings_dev.json';
const DEFAULT_GENERAL_SETTINGS = {
    orgName: 'AEC VERS Co., Ltd.',
    timezone: '(UTC+7) Bangkok, Jakarta',
    dateFormat: 'DD/MM/YYYY',
    language: 'th',
    tempUnit: 'C',
    pressureUnit: 'bar',
    flowUnit: 'm3h',
    maintenanceMode: false,
    publicRegistration: true
};
let generalSettings = { ...DEFAULT_GENERAL_SETTINGS };

async function loadGeneralSettings() {
    try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/models/${GENERAL_SETTINGS_FILE}?t=${Date.now()}`);
        if (!res.ok) return;
        const s = await res.json();
        if (s && typeof s === 'object') generalSettings = { ...DEFAULT_GENERAL_SETTINGS, ...s };
    } catch (err) { console.warn('[SETTINGS] โหลด general settings ไม่สำเร็จ:', err.message); }
}
async function persistGeneralSettings() {
    try {
        await fetch(`${SUPABASE_URL}/storage/v1/object/models/${GENERAL_SETTINGS_FILE}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
            body: JSON.stringify(generalSettings)
        });
    } catch (err) { console.warn('[SETTINGS] บันทึก general settings ไม่สำเร็จ:', err.message); }
}
loadGeneralSettings();

app.get('/api/settings/general', (req, res) => res.json(generalSettings));
app.post('/api/settings/general', requireAdmin, async (req, res) => {
    const b = req.body || {};
    generalSettings = {
        orgName: String(b.orgName || generalSettings.orgName).slice(0, 200),
        timezone: String(b.timezone || generalSettings.timezone).slice(0, 100),
        dateFormat: String(b.dateFormat || generalSettings.dateFormat).slice(0, 40),
        language: String(b.language || generalSettings.language).slice(0, 20),
        tempUnit: String(b.tempUnit || generalSettings.tempUnit).slice(0, 10),
        pressureUnit: String(b.pressureUnit || generalSettings.pressureUnit).slice(0, 10),
        flowUnit: String(b.flowUnit || generalSettings.flowUnit).slice(0, 10),
        maintenanceMode: !!b.maintenanceMode,
        publicRegistration: b.publicRegistration !== undefined ? !!b.publicRegistration : generalSettings.publicRegistration
    };
    await persistGeneralSettings();
    res.json({ success: true, settings: generalSettings });
});

// ============================================================
// FEATURE TOGGLES — เปิด/ปิดฟีเจอร์ต่างๆ ของ Visitor Portal / Employee Portal
// ============================================================
const FEATURE_TOGGLES_FILE = IS_PRODUCTION ? 'feature_toggles_v1.json' : 'feature_toggles_dev.json';
const DEFAULT_FEATURE_TOGGLES = {
    virtualTour: true,
    digitalTwin: true,
    knowledgeCheck: true,
    chatVoice: true,
    qrScanner: true,
    workOrder: true,
    emergency: true,
    // ซ้อมเหตุฉุกเฉินจากบทเรียน "ลองใช้งาน" ของ type อันตราย — ปิดได้ถ้ารบกวนเกินไป
    emergencyDrill: true,
    analytics: true
};
let featureToggles = { ...DEFAULT_FEATURE_TOGGLES };

async function loadFeatureToggles() {
    try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/models/${FEATURE_TOGGLES_FILE}?t=${Date.now()}`);
        if (!res.ok) return;
        const s = await res.json();
        if (s && typeof s === 'object') featureToggles = { ...DEFAULT_FEATURE_TOGGLES, ...s };
    } catch (err) { console.warn('[SETTINGS] โหลด feature toggles ไม่สำเร็จ:', err.message); }
}
async function persistFeatureToggles() {
    try {
        await fetch(`${SUPABASE_URL}/storage/v1/object/models/${FEATURE_TOGGLES_FILE}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
            body: JSON.stringify(featureToggles)
        });
    } catch (err) { console.warn('[SETTINGS] บันทึก feature toggles ไม่สำเร็จ:', err.message); }
}
loadFeatureToggles();


// ============================================================
// WORK ORDER + NOTIFICATION
// ใบสั่งงานมอบหมายให้ "พนักงาน" เท่านั้น — admin กับ engineer
// role 'user' เป็นผู้เยี่ยมชม ไม่มีหน้าที่รับงาน จึงมอบหมายให้ไม่ได้เด็ดขาด
// พอสั่งงานแล้วผู้รับจะได้การแจ้งเตือน (กระดิ่งบนแถบบน) ทันทีผ่าน socket
// ============================================================
const WORK_ORDERS_FILE = IS_PRODUCTION ? 'work_orders_v1.json' : 'work_orders_dev.json';
const NOTIFICATIONS_FILE = IS_PRODUCTION ? 'notifications_v1.json' : 'notifications_dev.json';

let workOrders = [];      // ใหม่สุดอยู่หน้าสุด
let notifications = [];   // ใหม่สุดอยู่หน้าสุด
const MAX_NOTIFICATIONS = 500;   // กันไฟล์โตไม่จำกัดในระบบที่เดินยาวๆ

const WO_STATUS = ['pending', 'in_progress', 'completed', 'cancelled'];
const WO_PRIORITY = ['low', 'medium', 'high', 'critical'];
const WO_TYPE = ['inspection', 'repair', 'maintenance', 'emergency'];

async function loadJsonFile(file, fallback) {
    try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/models/${file}?t=${Date.now()}`);
        if (!res.ok) return fallback;
        const s = await res.json();
        return Array.isArray(s) ? s : fallback;
    } catch (err) {
        console.warn(`[WO] โหลด ${file} ไม่สำเร็จ:`, err.message);
        return fallback;
    }
}
async function persistJsonFile(file, data) {
    try {
        await fetch(`${SUPABASE_URL}/storage/v1/object/models/${file}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
            body: JSON.stringify(data)
        });
    } catch (err) { console.warn(`[WO] บันทึก ${file} ไม่สำเร็จ:`, err.message); }
}

// เข้าถึงได้เฉพาะพนักงาน (admin/engineer) — ผู้เยี่ยมชมไม่เกี่ยวกับใบสั่งงานเลย
async function requireStaff(req, res, next) {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
    const role = userRole(user);
    if (role === 'user') return res.status(403).json({ error: 'บัญชีนี้ไม่มีสิทธิ์ใช้งานใบสั่งงาน' });
    req.staffUser = user;
    req.staffRole = role;
    next();
}

// ส่งการแจ้งเตือนให้ผู้ใช้คนหนึ่ง + ดันผ่าน socket ให้กระดิ่งเด้งทันทีถ้าเปิดหน้าอยู่
function pushNotification({ userId, kind, title, body, link }) {
    if (!userId) return null;
    const n = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        userId,
        kind: kind || 'info',              // info | work_order | emergency
        title: String(title || '').slice(0, 160),
        body: String(body || '').slice(0, 400),
        link: String(link || '').slice(0, 200),
        createdAt: new Date().toISOString(),
        readAt: null
    };
    notifications.unshift(n);
    if (notifications.length > MAX_NOTIFICATIONS) notifications.length = MAX_NOTIFICATIONS;
    persistJsonFile(NOTIFICATIONS_FILE, notifications);
    io.to(`user:${userId}`).emit('notification', n);
    return n;
}

// เหตุฉุกเฉินต้องถึงทุกคน รวมคนที่ยังไม่ได้เปิดหน้าเว็บตอนนั้นด้วย
// เก็บเป็นรายการเดียว userId = "*" แล้วให้ทุกคนเห็น — ดีกว่าปั๊มสำเนาต่อคน
// ซึ่งต้องรู้รายชื่อผู้ใช้ทั้งหมดก่อน (ต้องมี service key) และไฟล์จะบวมตามจำนวนคน
// ใครอ่านแล้วบ้างเก็บใน readBy เพราะ readAt เดียวใช้แทนทุกคนไม่ได้
function pushBroadcast({ kind, title, body, link }) {
    const n = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        userId: '*',
        kind: kind || 'info',
        title: String(title || '').slice(0, 160),
        body: String(body || '').slice(0, 400),
        link: String(link || '').slice(0, 200),
        createdAt: new Date().toISOString(),
        readAt: null,
        readBy: []
    };
    notifications.unshift(n);
    if (notifications.length > MAX_NOTIFICATIONS) notifications.length = MAX_NOTIFICATIONS;
    persistJsonFile(NOTIFICATIONS_FILE, notifications);
    io.emit('notification', n);
    return n;
}

// ---------- ประกาศเหตุฉุกเฉิน ----------
// แยกจาก "เรียกรวมพล" ในโลก 3D (อันนั้นผูกกับจุดที่ปักไว้) — อันนี้คือประกาศเหตุ
// ให้ทุกคนรู้ ไม่ต้องมีจุดในฉาก ใช้ได้จากหน้า Emergency และจากบทเรียน type อันตราย

// ============================================================
// ทะเบียนร่างตัวละคร (Avatar)
// เดิมมีแค่ 4 ร่างที่ฝังไว้ในโค้ด เพิ่มร่างใหม่ต้องแก้ไฟล์แล้ว deploy ใหม่
// ตอนนี้พนักงานอัปโหลด .glb เข้ามาเพิ่มเองได้ ทุกคนเลือกใช้ได้ทันที
//
// ตัวไฟล์เก็บที่ Supabase Storage เหมือนโมเดลโรงงาน (client อัปตรง ไม่ผ่าน server
// เพื่อไม่ให้ไฟล์หลายเมกะไบต์วิ่งผ่าน Node) — ที่นี่เก็บแค่ "ทะเบียน" ว่ามีร่างอะไรบ้าง
// ============================================================
const AVATAR_CATALOG_FILE = IS_PRODUCTION ? 'avatar_catalog_v1.json' : 'avatar_catalog_dev.json';

// ร่างที่มากับระบบ — ลบไม่ได้ ไม่ได้อยู่ใน Supabase
const BUILTIN_AVATARS = [
    { id: 'engineer', name: 'วิศวกร (ร่างพื้นฐาน)', url: '', builtin: true },
    { id: 'character', name: 'Character', url: 'avatars/character.glb', builtin: true },
    { id: 'ch22', name: 'CH22', url: 'avatars/ch22.glb', builtin: true },
    { id: 'ch07', name: 'CH07', url: 'avatars/ch07.glb', builtin: true },
    { id: 'remy', name: 'Remy', url: 'avatars/remy.glb', builtin: true }
];
let avatarCatalog = [];   // เฉพาะร่างที่นำเข้าเพิ่ม

function sanitizeAvatar(a) {
    if (!a || typeof a !== 'object') return null;
    const id = String(a.id || '').trim().slice(0, 60);
    const url = String(a.url || '').trim().slice(0, 400);
    if (!id || !url) return null;
    // ต้องเป็นไฟล์ในที่เก็บของเราเท่านั้น — กัน URL ภายนอกถูกยัดเข้าทะเบียน
    // แล้วกลายเป็นให้ทุกคนโหลดไฟล์จากที่ที่เราควบคุมไม่ได้
    if (!url.startsWith(`${SUPABASE_URL}/storage/v1/object/public/`)) return null;
    return {
        id,
        name: String(a.name || id).trim().slice(0, 80),
        url,
        uploadedBy: String(a.uploadedBy || '').slice(0, 120),
        uploadedAt: a.uploadedAt || new Date().toISOString(),
        sizeMb: Number.isFinite(Number(a.sizeMb)) ? Math.round(Number(a.sizeMb) * 10) / 10 : 0,
        rigged: !!a.rigged,         // มีโครงกระดูกแบบ Mixamo ไหม -> ท่าเดินใช้ได้หรือเปล่า
        // ร่างส่วนตัว: คนที่สร้างเห็นคนเดียว (เช่นร่างที่ปั้นเองจาก Ready Player Me)
        // ร่างกลาง (ownerId ว่าง): พนักงานนำเข้าให้ทุกคนเลือกใช้
        ownerId: String(a.ownerId || '').slice(0, 64),
        source: ['rpm', 'upload'].includes(a.source) ? a.source : 'upload'
    };
}

// รายการร่าง = ร่างที่มากับระบบ + ร่างกลาง + ร่างส่วนตัวของคนที่ถามเท่านั้น
// ร่างส่วนตัวของคนอื่นต้องไม่หลุดออกไป แม้แต่ชื่อ
app.get('/api/avatars', async (req, res) => {
    const user = await userFromRequest(req);
    const mine = user ? user.id : '';
    const visible = avatarCatalog.filter(a => !a.ownerId || a.ownerId === mine);
    res.json({
        builtin: BUILTIN_AVATARS,
        imported: visible.filter(a => !a.ownerId),
        personal: visible.filter(a => a.ownerId)
    });
});

// แปลง id -> url สำหรับร่างที่ "กำลังถูกใช้อยู่จริง" เท่านั้น
// จำเป็นเพราะในโลก 3D ทุกคนต้องวาดร่างของผู้เล่นคนอื่นด้วย ถ้าเปิดได้แค่ร่างของตัวเอง
// คนอื่นจะเห็นเราเป็นร่างเริ่มต้นแทน — ซึ่งเป็นอาการที่เจอจริง
//
// รับเฉพาะ id ที่ถามมา ไม่ใช่ไล่รายการทั้งหมด จึงไม่เผยว่าใครมีร่างอะไรบ้าง
// (ตัวไฟล์โมเดลไม่ใช่ข้อมูลลับอยู่แล้ว — มันคือสิ่งที่ทุกคนต้องโหลดมาวาด)
app.get('/api/avatars/resolve', (req, res) => {
    const ids = String(req.query.ids || '').split(',').map(x => x.trim()).filter(Boolean).slice(0, 40);
    const out = {};
    ids.forEach(id => {
        const a = avatarCatalog.find(x => x.id === id);
        if (a) out[id] = a.url;
    });
    res.json({ urls: out });
});

// นำเข้าร่าง — ร่างส่วนตัวใครก็สร้างได้ (เป็นตัวละครของตัวเอง)
// ร่างกลางที่ทุกคนเลือกใช้ได้ ต้องเป็นพนักงานเท่านั้น
app.post('/api/avatars', async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
    const personal = !!(req.body && req.body.personal);
    const role = userRole(user);
    if (!personal && role === 'user') {
        return res.status(403).json({ error: 'เพิ่มร่างกลางให้ทุกคนใช้ได้เฉพาะพนักงาน — ร่างของตัวเองสร้างได้ตามปกติ' });
    }

    const clean = sanitizeAvatar({
        ...req.body,
        uploadedBy: user.email,
        ownerId: personal ? user.id : ''      // เชื่อ session ไม่ใช่ค่าที่ client ส่งมา
    });
    if (!clean) {
        return res.status(400).json({ error: 'ข้อมูลร่างไม่ถูกต้อง — ไฟล์ต้องอัปโหลดขึ้นที่เก็บของระบบก่อน' });
    }
    if (BUILTIN_AVATARS.some(b => b.id === clean.id) || avatarCatalog.some(a => a.id === clean.id)) {
        return res.status(409).json({ error: 'มีร่างชื่อนี้อยู่แล้ว' });
    }
    avatarCatalog.unshift(clean);
    await persistJsonFile(AVATAR_CATALOG_FILE, avatarCatalog);
    console.log(`[AVATAR] ${user.email} ${personal ? 'สร้างร่างของตัวเอง' : 'นำเข้าร่างกลาง'} "${clean.name}"${clean.rigged ? '' : ' (ไม่มีโครงกระดูก Mixamo)'}`);
    res.json({ avatar: clean });
});

// ลบร่าง — ร่างของตัวเองลบเองได้, ร่างกลางต้อง admin เพราะกระทบทุกคนที่ใส่อยู่
app.delete('/api/avatars/:id', async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
    const i = avatarCatalog.findIndex(a => a.id === req.params.id);
    if (i < 0) return res.status(404).json({ error: 'ไม่พบร่างนี้ในทะเบียน' });
    const target = avatarCatalog[i];
    const isOwner = target.ownerId && target.ownerId === user.id;
    if (!isOwner && !isAdminUser(user)) {
        return res.status(403).json({ error: 'ลบได้เฉพาะร่างของตัวเอง — ร่างกลางต้องให้ผู้ดูแลระบบลบ' });
    }
    avatarCatalog.splice(i, 1);
    await persistJsonFile(AVATAR_CATALOG_FILE, avatarCatalog);
    console.log(`[AVATAR] ลบร่าง "${target.name}" โดย ${user.email}`);
    res.json({ ok: true, removed: target });
});

(async () => {
    const loaded = await loadJsonFile(AVATAR_CATALOG_FILE, []);
    avatarCatalog = loaded.map(sanitizeAvatar).filter(Boolean);
    console.log(`[AVATAR] โหลดร่างที่นำเข้า ${avatarCatalog.length} ร่าง`);
})();

app.post('/api/emergency/announce', requireStaff, (req, res) => {
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 160);
    if (!title) return res.status(400).json({ error: 'ต้องระบุหัวข้อเหตุฉุกเฉิน' });
    const level = ['warning', 'critical'].includes(b.level) ? b.level : 'critical';
    const n = pushBroadcast({
        kind: 'emergency',
        title: (level === 'critical' ? '🚨 เหตุฉุกเฉิน: ' : '⚠️ เตือน: ') + title,
        body: String(b.body || '').trim().slice(0, 400),
        link: 'Emergency.html'
    });
    io.emit('emergency_announced', { title, body: b.body || '', level, by: req.staffUser.email, at: Date.now() });
    console.log(`[EMERGENCY] ประกาศ "${title}" (${level}) โดย ${req.staffUser.email}`);
    res.json({ ok: true, notification: n });
});

// ---------- ซ้อมเหตุฉุกเฉินจากบทเรียน ----------
// บทเรียน "ลองใช้งาน" ของ type อันตรายที่จบด้วยหายนะ (บ่อหมักระเบิด, โดมฉีก,
// ไฟย้อนถึงบ่อหมัก ฯลฯ) จะยิงเข้ามาที่นี่ ให้ทุกคนในระบบเห็นว่ามีการซ้อมเกิดขึ้น
//
// ต่างจากการประกาศจริงตรงที่:
//  - ผู้เยี่ยมชม (role user) ยิงได้ด้วย เพราะบทเรียนมีไว้ให้ทุกคนเล่น
//  - ติดป้าย "ซ้อม" ชัดเจนทุกที่ ไม่ให้ปนกับเหตุจริงเด็ดขาด
//  - จำกัดความถี่ ไม่งั้นคนเดียวลากสไลเดอร์เล่นก็ยิงเตือนทั้งโรงงานได้ไม่จำกัด
const DRILL_PER_USER_MS = 120000;   // คนเดิมซ้อมซ้ำได้ทุก 2 นาที
const DRILL_GLOBAL_MS = 30000;      // ทั้งระบบรวมกันไม่ถี่กว่า 30 วิ
const drillLastByUser = new Map();
let drillLastGlobal = 0;

app.post('/api/emergency/drill', async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
    if (!featureToggles.emergencyDrill) {
        return res.status(403).json({ error: 'ระบบซ้อมเหตุฉุกเฉินถูกปิดไว้', disabled: true });
    }

    const now = Date.now();
    const mine = drillLastByUser.get(user.id) || 0;
    if (now - mine < DRILL_PER_USER_MS) {
        return res.status(429).json({ error: 'เพิ่งซ้อมไปเมื่อสักครู่ — เว้นระยะสักครู่แล้วลองใหม่', throttled: true });
    }
    if (now - drillLastGlobal < DRILL_GLOBAL_MS) {
        return res.status(429).json({ error: 'มีการซ้อมอื่นเพิ่งเกิดขึ้น — รอสักครู่', throttled: true });
    }

    const b = req.body || {};
    const scenario = String(b.scenario || 'เหตุการณ์จากบทเรียน').trim().slice(0, 120);
    const icon = String(b.icon || '🔥').slice(0, 4);
    const who = user.user_metadata?.display_name || user.email || 'ผู้เข้าร่วม';
    drillLastByUser.set(user.id, now);
    drillLastGlobal = now;

    const n = pushBroadcast({
        kind: 'emergency',
        title: `🧪 ซ้อมเหตุฉุกเฉิน: ${icon} ${scenario}`,
        body: `เกิดจากบทเรียน "ลองใช้งาน" ที่ ${who} กำลังทำอยู่ — ไม่ใช่เหตุการณ์จริง`,
        link: 'Emergency.html'
    });
    io.emit('emergency_drill', { scenario, icon, by: who, at: now });
    console.log(`[DRILL] ${who} ทำให้เกิด "${scenario}" ในบทเรียน`);
    res.json({ ok: true, notification: n });
});

// ---------- รายชื่อคนที่มอบหมายงานได้ ----------
// ต้องใช้ service key ถึงจะอ่านรายชื่อผู้ใช้ทั้งหมดได้ ถ้าไม่ได้ตั้งไว้จะคืนลิสต์ว่าง
// พร้อมบอกสาเหตุ ดีกว่าปล่อยให้หน้าเว็บขึ้น dropdown เปล่าโดยไม่รู้ว่าทำไม
app.get('/api/work-orders/assignees', requireStaff, async (req, res) => {
    if (!supabaseAdmin) {
        return res.json({ assignees: [], warning: 'เซิร์ฟเวอร์ยังไม่ได้ตั้ง SUPABASE_SERVICE_ROLE_KEY จึงดึงรายชื่อผู้ใช้ไม่ได้' });
    }
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });
    const assignees = data.users
        .map(u => ({ id: u.id, email: u.email, name: u.user_metadata?.display_name || u.email, role: userRole(u) }))
        .filter(u => u.role !== 'user')      // ผู้เยี่ยมชมรับงานไม่ได้
        .sort((a, b) => a.name.localeCompare(b.name, 'th'));
    res.json({ assignees });
});

// ---------- รายการใบสั่งงาน ----------
app.get('/api/work-orders', requireStaff, (req, res) => {
    const mine = req.query.mine === '1';
    const list = mine ? workOrders.filter(w => w.assigneeId === req.staffUser.id) : workOrders;
    const counts = WO_STATUS.reduce((acc, s) => { acc[s] = workOrders.filter(w => w.status === s).length; return acc; }, {});
    res.json({ workOrders: list, counts, total: workOrders.length, me: req.staffUser.id, myRole: req.staffRole });
});

// ---------- สร้างใบสั่งงาน ----------
app.post('/api/work-orders', requireStaff, async (req, res) => {
    const b = req.body || {};
    const title = String(b.title || '').trim().slice(0, 200);
    if (!title) return res.status(400).json({ error: 'ต้องระบุชื่องาน' });

    // ผู้รับงานต้องเป็นพนักงานจริงเท่านั้น — เช็คกับ Supabase ไม่ใช่เชื่อค่าที่ client ส่งมา
    let assigneeId = '', assigneeName = '', assigneeRole = '';
    if (b.assigneeId) {
        if (!supabaseAdmin) return res.status(503).json({ error: 'เซิร์ฟเวอร์ยังตรวจสอบผู้รับงานไม่ได้ (ไม่ได้ตั้ง service key)' });
        const { data, error } = await supabaseAdmin.auth.admin.getUserById(String(b.assigneeId));
        if (error || !data?.user) return res.status(400).json({ error: 'ไม่พบบัญชีผู้รับงาน' });
        const role = userRole(data.user);
        if (role === 'user') return res.status(400).json({ error: 'มอบหมายงานให้บัญชีระดับผู้เยี่ยมชม (user) ไม่ได้ — ได้เฉพาะ Admin และ Engineer' });
        assigneeId = data.user.id;
        assigneeName = data.user.user_metadata?.display_name || data.user.email;
        assigneeRole = role;
    }

    const seq = String(workOrders.length + 1).padStart(5, '0');
    const wo = {
        id: `WO-${new Date().getFullYear()}-${seq}`,
        title,
        equipment: String(b.equipment || '').trim().slice(0, 100),
        type: WO_TYPE.includes(b.type) ? b.type : 'inspection',
        priority: WO_PRIORITY.includes(b.priority) ? b.priority : 'medium',
        status: 'pending',
        assigneeId, assigneeName, assigneeRole,
        dueDate: String(b.dueDate || '').slice(0, 10),
        note: String(b.note || '').trim().slice(0, 1000),
        createdBy: req.staffUser.id,
        createdByName: req.staffUser.user_metadata?.display_name || req.staffUser.email,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    };
    workOrders.unshift(wo);
    await persistJsonFile(WORK_ORDERS_FILE, workOrders);

    // แจ้งผู้รับงาน — ไม่ต้องแจ้งถ้าสั่งงานให้ตัวเอง
    if (assigneeId && assigneeId !== req.staffUser.id) {
        pushNotification({
            userId: assigneeId, kind: 'work_order',
            title: `ได้รับมอบหมายงานใหม่ — ${wo.id}`,
            body: `${wo.title}${wo.equipment ? ` · ${wo.equipment}` : ''} · ความเร่งด่วน ${wo.priority}`,
            link: 'WorkOrder.html'
        });
    }
    res.json({ workOrder: wo });
});

// ---------- แก้ไขใบสั่งงาน ----------
app.patch('/api/work-orders/:id', requireStaff, async (req, res) => {
    const wo = workOrders.find(w => w.id === req.params.id);
    if (!wo) return res.status(404).json({ error: 'ไม่พบใบสั่งงานนี้' });
    const b = req.body || {};
    const prevAssignee = wo.assigneeId;

    if (b.status !== undefined) {
        if (!WO_STATUS.includes(b.status)) return res.status(400).json({ error: 'สถานะไม่ถูกต้อง' });
        wo.status = b.status;
    }
    if (b.assigneeId !== undefined) {
        if (!b.assigneeId) { wo.assigneeId = ''; wo.assigneeName = ''; wo.assigneeRole = ''; }
        else {
            if (!supabaseAdmin) return res.status(503).json({ error: 'เซิร์ฟเวอร์ยังตรวจสอบผู้รับงานไม่ได้ (ไม่ได้ตั้ง service key)' });
            const { data, error } = await supabaseAdmin.auth.admin.getUserById(String(b.assigneeId));
            if (error || !data?.user) return res.status(400).json({ error: 'ไม่พบบัญชีผู้รับงาน' });
            const role = userRole(data.user);
            if (role === 'user') return res.status(400).json({ error: 'มอบหมายงานให้บัญชีระดับผู้เยี่ยมชม (user) ไม่ได้ — ได้เฉพาะ Admin และ Engineer' });
            wo.assigneeId = data.user.id;
            wo.assigneeName = data.user.user_metadata?.display_name || data.user.email;
            wo.assigneeRole = role;
        }
    }
    wo.updatedAt = new Date().toISOString();
    await persistJsonFile(WORK_ORDERS_FILE, workOrders);

    if (wo.assigneeId && wo.assigneeId !== prevAssignee && wo.assigneeId !== req.staffUser.id) {
        pushNotification({
            userId: wo.assigneeId, kind: 'work_order',
            title: `ได้รับมอบหมายงาน — ${wo.id}`,
            body: `${wo.title}${wo.equipment ? ` · ${wo.equipment}` : ''}`,
            link: 'WorkOrder.html'
        });
    }
    res.json({ workOrder: wo });
});

// ---------- การแจ้งเตือนของตัวเอง ----------
app.get('/api/notifications', async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
    // ของตัวเอง + ที่ประกาศถึงทุกคน — แปลง readBy ของ broadcast ให้เป็น readAt ของคนที่ถาม
    // ฝั่งหน้าเว็บจะได้ไม่ต้องรู้ว่ามีสองแบบ
    const seen = uid => n => n.userId === '*'
        ? { ...n, readAt: (n.readBy || []).includes(uid) ? n.createdAt : null, readBy: undefined }
        : n;
    const mine = notifications
        .filter(n => n.userId === user.id || n.userId === '*')
        .slice(0, 50)
        .map(seen(user.id));
    res.json({ notifications: mine, unread: mine.filter(n => !n.readAt).length });
});

app.post('/api/notifications/read', async (req, res) => {
    const user = await userFromRequest(req);
    if (!user) return res.status(401).json({ error: 'ต้องเข้าสู่ระบบก่อน' });
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : null;
    const now = new Date().toISOString();
    let changed = 0;
    notifications.forEach(n => {
        if (ids && !ids.includes(n.id)) return;
        if (n.userId === '*') {                               // ประกาศถึงทุกคน: จำเป็นรายคน
            n.readBy = n.readBy || [];
            if (n.readBy.includes(user.id)) return;
            n.readBy.push(user.id); changed++;
            return;
        }
        if (n.userId !== user.id || n.readAt) return;         // ของคนอื่นแตะไม่ได้เด็ดขาด
        n.readAt = now; changed++;
    });
    if (changed) persistJsonFile(NOTIFICATIONS_FILE, notifications);
    res.json({ ok: true, marked: changed });
});

// โหลดของเก่ากลับเข้าหน่วยความจำ — ต้องอยู่ท้ายบล็อกนี้ หลังประกาศ const ครบแล้ว
// (เคยวางไว้ข้างบนแล้วชน temporal dead zone จน server ล้มตั้งแต่บูต)
(async () => {
    workOrders = await loadJsonFile(WORK_ORDERS_FILE, []);
    notifications = await loadJsonFile(NOTIFICATIONS_FILE, []);
    console.log("[WO] โหลดใบสั่งงาน " + workOrders.length + " รายการ / การแจ้งเตือน " + notifications.length + " รายการ");
})();

app.get('/api/settings/features', (req, res) => res.json(featureToggles));
app.post('/api/settings/features', requireAdmin, async (req, res) => {
    const b = req.body || {};
    const clean = {};
    Object.keys(DEFAULT_FEATURE_TOGGLES).forEach(k => { clean[k] = !!b[k]; });
    featureToggles = clean;
    await persistFeatureToggles();
    res.json({ success: true, features: featureToggles });
});

// ============================================================
// SITE CONTENT — เนื้อหาหน้า Home / Process / About Us ที่แอดมินแก้ไขได้
// (ยังไม่เชื่อมเข้าหน้า Public*.html จริง — เก็บ persist ไว้ก่อนสำหรับเฟสถัดไป)
// ============================================================
const SITE_CONTENT_FILE = IS_PRODUCTION ? 'site_content_v1.json' : 'site_content_dev.json';
const DEFAULT_SITE_CONTENT = { home: {}, process: {}, aboutUs: {} };
let siteContent = { ...DEFAULT_SITE_CONTENT };

async function loadSiteContent() {
    try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/models/${SITE_CONTENT_FILE}?t=${Date.now()}`);
        if (!res.ok) return;
        const s = await res.json();
        if (s && typeof s === 'object') siteContent = { ...DEFAULT_SITE_CONTENT, ...s };
    } catch (err) { console.warn('[SETTINGS] โหลด site content ไม่สำเร็จ:', err.message); }
}
async function persistSiteContent() {
    try {
        await fetch(`${SUPABASE_URL}/storage/v1/object/models/${SITE_CONTENT_FILE}`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SUPABASE_ANON_KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' },
            body: JSON.stringify(siteContent)
        });
    } catch (err) { console.warn('[SETTINGS] บันทึก site content ไม่สำเร็จ:', err.message); }
}
loadSiteContent();

app.get('/api/settings/site-content', (req, res) => res.json(siteContent));
app.post('/api/settings/site-content', requireAdmin, async (req, res) => {
    const b = req.body || {};
    siteContent = {
        home: (b.home && typeof b.home === 'object') ? b.home : siteContent.home,
        process: (b.process && typeof b.process === 'object') ? b.process : siteContent.process,
        aboutUs: (b.aboutUs && typeof b.aboutUs === 'object') ? b.aboutUs : siteContent.aboutUs
    };
    await persistSiteContent();
    res.json({ success: true, content: siteContent });
});

async function loadSceneState() {
    try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/models/${SCENE_STATE_FILE}?t=${Date.now()}`);
        if (!res.ok) { console.log('[PERSIST] ยังไม่มี state เก่า — เริ่มห้องว่าง'); return; }
        const s = await res.json();
        currentModelUrl = s.currentModelUrl || null;
        currentModelName = s.currentModelName || null;
        Object.assign(workflowDb, s.workflowDb || {});
        Object.assign(typeAssignments, s.typeAssignments || {});
        Object.assign(markers, s.markers || {});
        if (s.modelTransform) modelTransform = s.modelTransform;
        modelLocked = s.modelLocked !== undefined ? !!s.modelLocked : true;
        console.log(`[PERSIST] กู้คืน state สำเร็จ (model: ${currentModelName || '—'}, ข้อมูลชิ้นส่วน ${Object.keys(workflowDb).length} รายการ)`);
    } catch (err) { console.warn('[PERSIST] โหลด state ไม่สำเร็จ:', err.message); }
}
loadSceneState();

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
        markers,
        modelTransform,
        modelLocked,
        emergencyCall, // คนที่เพิ่งเข้ามาต้องรู้ด้วยว่ากำลังมีการเรียกรวมพลค้างอยู่
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

// ============================================================
// ทะเบียนเครื่องมือตรวจวัดจริงของโรงงาน
// อ้างอิงเอกสาร "ทะเบียนรายชื่อเครื่องมือตรวจวัด ที่จะนำขึ้น IDA"
//   min/max   = ช่วงการใช้งานประจำตามเอกสาร (ไม่ใช่ full scale ของเครื่องมือ)
//   error     = ค่า ERROR ที่ยอมรับได้ตามเอกสาร
//   io        = ช่องทางสื่อสารตามเอกสาร
//   rangeless = เอกสารไม่ได้ระบุช่วงตัวเลขไว้ (power meter ระบุแค่ "ค่าทางไฟฟ้าทั้งหมด"
//               กับชั้นความแม่นยำ, gas detector ระบุแค่หน้าที่ "ตรวจจับแก๊สรั่ว")
//               -> ไม่แต่งตัวเลขให้ รายงานเป็นสถานะแทน
// ============================================================
const INSTRUMENTS = [
    { tag: 'TT01', station: 'Biogas', name: 'Cooling Sum 1 Temperature', kind: 'temperature', type: 'Temperature Transmitter', model: 'TSP-08', min: 50, max: 90, unit: '°C', error: '±3%', io: '4-20mA' },
    { tag: 'TT02', station: 'Biogas', name: 'Cooling Sum 2 Temperature', kind: 'temperature', type: 'Temperature Transmitter', model: 'TSP-08', min: 50, max: 90, unit: '°C', error: '±3%', io: '4-20mA' },
    { tag: 'TT03', station: 'Biogas', name: 'CSTR1 Temperature', kind: 'temperature', type: 'Temperature Transmitter', model: 'TM-012', min: 30, max: 45, unit: '°C', error: '±3%', io: '4-20mA' },
    { tag: 'TT04', station: 'Biogas', name: 'CSTR2 Temperature', kind: 'temperature', type: 'Temperature Transmitter', model: 'TM-012', min: 30, max: 45, unit: '°C', error: '±3%', io: '4-20mA' },
    { tag: 'TT05', station: 'Biogas', name: 'CSTR3 Temperature', kind: 'temperature', type: 'Temperature Transmitter', model: 'TM-012', min: 30, max: 45, unit: '°C', error: '±3%', io: '4-20mA' },
    { tag: 'TT06', station: 'Biogas', name: 'Mixing Tank Temperature', kind: 'temperature', type: 'Temperature Transmitter', model: 'CA150', min: 30, max: 45, unit: '°C', error: '±3%', io: '4-20mA' },
    { tag: 'TT07', station: 'Biogas', name: 'Decanter Cake Mixing Tank Temperature', kind: 'temperature', type: 'Temperature Transmitter', model: 'CA150', min: 30, max: 45, unit: '°C', error: '±3%', io: '4-20mA' },
    { tag: 'TT08', station: 'Biogas', name: 'Mixing MCL Temperature', kind: 'temperature', type: 'Temperature Transmitter', model: 'CA150', min: 30, max: 45, unit: '°C', error: '±3%', io: '4-20mA' },
    { tag: 'TT09', station: 'Biogas', name: 'Temperature / Gas Chiller → Engine', kind: 'temperature', type: 'Temperature Transmitter', model: 'EURASIA', min: 0, max: 20, unit: '°C', error: '±3.0°C', io: '4-20mA' },

    { tag: 'LT01', station: 'Biogas', name: 'Level Transmitter Cooling Sum1', kind: 'level', type: 'Ultrasonic Level Transmitter', model: '-', min: 0, max: 10.5, unit: 'm³', error: '±5%', io: '4-20mA' },
    { tag: 'LT02', station: 'Biogas', name: 'Level Transmitter Cooling Sum2', kind: 'level', type: 'Ultrasonic Level Transmitter', model: '-', min: 0, max: 10.5, unit: 'm³', error: '±0.05%', io: '4-20mA' },
    { tag: 'LT03', station: 'Biogas', name: 'Level Transmitter Mixing Tank', kind: 'level', type: 'Radar Level Sensor', model: 'Micropilot FMR20', min: 0, max: 26.88, unit: 'm³', error: '±0.05%', io: '4-20mA' },
    { tag: 'LT04', station: 'Biogas', name: 'Level Transmitter Mixing CakeTank', kind: 'level', type: 'Radar Level Sensor', model: 'Micropilot FMR20', min: 0, max: 30, unit: 'm³', error: '±0.05%', io: '4-20mA' },
    { tag: 'LT05', station: 'Biogas', name: 'Level Transmitter Mixing MCL', kind: 'level', type: 'Radar Level Sensor', model: 'Micropilot FMR20', min: 0, max: 62, unit: 'm³', error: '±5%', io: '4-20mA' },

    { tag: 'FM01', station: 'Biogas', name: 'Cooling → Mixing', kind: 'flow', type: 'Megnatic Flow 4"', model: 'PROMAG E', min: 10, max: 20, unit: 'm³/hr', error: '±5%', io: '4-20mA' },
    { tag: 'FM02', station: 'Biogas', name: 'Mixing Tank → CSTR 1', kind: 'flow', type: 'Megnatic Flow 4"', model: 'PROMAG E', min: 10, max: 20, unit: 'm³/hr', error: '±5%', io: '4-20mA' },
    { tag: 'FM03', station: 'Biogas', name: 'Mixing Tank → CSTR 2', kind: 'flow', type: 'Megnatic Flow 4"', model: 'PROMAG E', min: 10, max: 20, unit: 'm³/hr', error: '±5%', io: '4-20mA' },
    { tag: 'FM08', station: 'Biogas', name: 'Mixing Tank → CSTR 3', kind: 'flow', type: 'Megnatic Flow 4"', model: 'PROMAG E', min: 10, max: 20, unit: 'm³/hr', error: '±5%', io: '4-20mA' },
    { tag: 'FM04', station: 'Biogas', name: 'Effluent', kind: 'flow', type: 'Megnatic Flow 4"', model: 'PROMAG E', min: 10, max: 20, unit: 'm³/hr', error: '±5%', io: '4-20mA' },
    { tag: 'FM05', station: 'Biogas', name: 'Decanter Mixing Tank → CSTR 3', kind: 'flow', type: 'Megnatic Flow 4"', model: 'PROMAG E', min: 10, max: 20, unit: 'm³/hr', error: '±5%', io: '4-20mA' },
    { tag: 'FM06', station: 'Biogas', name: 'Effluent → Decanter Mixing Tank', kind: 'flow', type: 'Megnatic Flow 6"', model: '-', min: 10, max: 20, unit: 'm³/hr', error: '±5%', io: '4-20mA' },
    { tag: 'FM09', station: 'Biogas', name: 'MCL → Post 1', kind: 'flow', type: 'Megnatic Flow 4"', model: 'PROMAG E', min: 10, max: 20, unit: 'm³/hr', error: '±5%', io: '4-20mA' },
    { tag: 'FM07', station: 'Biogas', name: 'Gas Flow / Gas Blower → Engine', kind: 'gasflow', type: 'Thermal Mass 12"', model: 'PROLINE T-mass 65', min: 0, max: 1500, unit: 'Nm³/hr', error: '±1%', io: '4-20mA' },

    { tag: 'PT01', station: 'Biogas', name: 'Pressure / Gas Blower → Engine', kind: 'pressure', type: 'Pressure Transmitter', model: 'ADZ-SML-10.0', min: 90, max: 110, unit: 'mbar G', error: '±10%', io: '4-20mA' },
    { tag: 'PT02', station: 'Biogas', name: 'Pressure / Gas Chiller → Engine', kind: 'pressure', type: 'Pressure Transmitter', model: 'ADZ-SML-10.0', min: 90, max: 110, unit: 'mbar G', error: '±10%', io: '4-20mA' },
    { tag: 'PG01', station: 'Biogas', name: 'Pressure Gauge / Gas Chiller → Engine', kind: 'pressure', type: 'Pressure Gauge', model: 'Winter', min: 90, max: 110, unit: 'mbar G', error: '±10%', io: '4-20mA' },

    { tag: 'GA02-CH4', station: 'Biogas', name: 'Gas Analyzer (Online) — CH₄', kind: 'ch4', type: 'Gas Analyzer (Online)', model: 'Biogas3000', min: 40, max: 70, unit: '%', error: '±0.5%', io: '4-20mA' },
    { tag: 'GA02-H2S', station: 'Biogas', name: 'Gas Analyzer (Online) — H₂S', kind: 'h2s', type: 'Gas Analyzer (Online)', model: 'Biogas3000', min: 1, max: 3000, unit: 'ppm', error: '±100 ppm', io: '4-20mA' },

    { tag: 'CSTR-1-ROOF', station: 'CSTR-1', name: 'Rooflevel CSTR', kind: 'rooflevel', type: 'Level', model: '-', min: 0, max: 5500, unit: 'mm', error: '-', io: '4-20mA' },
    { tag: 'CSTR-2-ROOF', station: 'CSTR-2', name: 'Rooflevel CSTR', kind: 'rooflevel', type: 'Level', model: '-', min: 0, max: 5500, unit: 'mm', error: '-', io: '4-20mA' },
    { tag: 'CSTR-3-ROOF', station: 'CSTR-3', name: 'Rooflevel CSTR', kind: 'rooflevel', type: 'Level', model: '-', min: 0, max: 5500, unit: 'mm', error: '-', io: '4-20mA' },

    { tag: 'GD-CSTR-1', station: 'CSTR-1', name: 'GAS Detecter', kind: 'gasdetect', type: 'GAS Detecter', model: 'Crowcon Gasmaster', rangeless: true, purpose: 'ตรวจจับแก๊สรั่ว', error: '-', io: 'Modbus RTU RS485' },
    { tag: 'GD-CSTR-2', station: 'CSTR-2', name: 'GAS Detecter', kind: 'gasdetect', type: 'GAS Detecter', model: 'Crowcon Gasmaster', rangeless: true, purpose: 'ตรวจจับแก๊สรั่ว', error: '-', io: 'Modbus RTU RS485' },
    { tag: 'GD-CSTR-3', station: 'CSTR-3', name: 'GAS Detecter', kind: 'gasdetect', type: 'GAS Detecter', model: 'Crowcon Gasmaster', rangeless: true, purpose: 'ตรวจจับแก๊สรั่ว', error: '-', io: 'Modbus RTU RS485' },

    { tag: '52A', station: 'Biogas', name: '52A Meter', kind: 'power', type: 'Power meter', model: 'GE PQM2', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.05%', io: 'Modbus RTU RS485' },
    { tag: '52B-1', station: 'Biogas', name: '52B Meter', kind: 'power', type: 'Power meter', model: 'Socomce Diris40', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.5%', io: 'Modbus RTU RS485' },
    { tag: '52B-2', station: 'Biogas', name: '52B Meter', kind: 'power', type: 'Power meter', model: 'Socomce Diris41', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.5%', io: 'Modbus RTU RS485' },
    { tag: 'ENGINE-1', station: 'Biogas', name: 'Engine No1', kind: 'power', type: 'Power meter', model: '-', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.5%', io: 'Modbus RTU RS485' },
    { tag: 'ENGINE-2', station: 'Biogas', name: 'Engine No2', kind: 'power', type: 'Power meter', model: '-', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.5%', io: 'Modbus RTU RS485' },
    { tag: 'ENGINE-ROOM', station: 'Biogas', name: 'Engine room', kind: 'power', type: 'Power meter', model: 'Lovato DMG6', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.5%', io: 'Modbus RTU RS485' },
    { tag: 'BIOGAS-ROOM', station: 'Biogas', name: 'Biogas room', kind: 'power', type: 'Power meter', model: 'Shneider PM5350', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.5%', io: 'Modbus RTU RS485' },
    { tag: 'PEA-IN', station: 'Biogas', name: 'Incomming (PEA)', kind: 'power', type: 'TOU', model: 'EDMI MK6N GENIUS', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.05%', io: 'Modbus TCP/IP' },
    { tag: 'VSPP-OUT', station: 'Biogas', name: 'Outgoeing (VSPP)', kind: 'power', type: 'TOU', model: 'EDMI MK6N GENIUS', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.05%', io: 'Modbus TCP/IP' },

    { tag: 'PALM-GEN', station: 'โรงปาล์ม', name: 'Gen Turbine', kind: 'power', type: 'Power meter', model: 'Shneider PM5350', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.5%', io: 'Modbus RTU RS485', note: 'ไม่มี Diagram SCADA' },
    { tag: 'PALM-EFB3', station: 'โรงปาล์ม', name: 'EFB Press No. 3', kind: 'power', type: 'Power meter', model: 'Lovato DMG6', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.5%', io: 'Modbus RTU RS485', note: 'ไม่มี Diagram SCADA' },
    { tag: 'PALM-SCREW3', station: 'โรงปาล์ม', name: 'Screw Press No.3', kind: 'power', type: 'Power meter', model: 'Lovato DMG6', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.5%', io: 'Modbus RTU RS485', note: 'ไม่มี Diagram SCADA' },
    { tag: 'PALM-DIG3', station: 'โรงปาล์ม', name: 'Digister No.3', kind: 'power', type: 'Power meter', model: 'Lovato DMG6', rangeless: true, purpose: 'ค่าทางไฟฟ้าทั้งหมด', error: '0.5%', io: 'Modbus RTU RS485', note: 'ไม่มี Diagram SCADA' }
];

// ค่าที่อ่านได้ล่าสุดของแต่ละ tag — เดินแบบ random walk อยู่ในช่วงใช้งานประจำตามเอกสาร
// เริ่มต้นตรงกลางช่วง แล้วค่อยแกว่ง ไม่ใช่สุ่มใหม่ทุก tick (จะได้ดูเป็นสัญญาณจริง)
const readings = {};
INSTRUMENTS.forEach(ins => {
    if (ins.rangeless) {
        readings[ins.tag] = { status: 'normal' };
    } else {
        const mid = (ins.min + ins.max) / 2;
        const span = ins.max - ins.min;
        readings[ins.tag] = { value: mid + rand(-span * 0.15, span * 0.15), step: span * 0.02, excursion: 0, excursionHigh: false };
    }
});
const instrumentByTag = Object.fromEntries(INSTRUMENTS.map(i => [i.tag, i]));
const readValue = tag => (readings[tag] ? readings[tag].value : null);

// เดินค่าทุกตัวไป 1 tick — ปกติแกว่งอยู่ในช่วงใช้งานประจำและถูกดึงกลับเข้ากลางเบาๆ
//
// มี "excursion" เป็นครั้งคราวด้วย (ค่าไต่ออกนอกช่วงชั่วคราวแล้วกลับเข้าที่เดิม)
// ถ้าไม่มีส่วนนี้ ค่าจะอยู่ในช่วงตลอดเวลา แปลว่าการแจ้งเตือน "นอกช่วงใช้งาน"
// จะไม่มีวันทำงานเลย — กลายเป็นโค้ดที่ไม่เคยถูกใช้จริงและไม่มีใครรู้ว่าเสียหรือเปล่า
const EXCURSION_CHANCE = 0.004;   // ต่อเครื่องมือ ต่อ tick (4 วิ) ~ เฉลี่ยหลักสิบนาทีต่อครั้งทั้งระบบ
const EXCURSION_TICKS = [8, 20];  // อยู่นอกช่วงนานกี่ tick ก่อนกลับเข้าที่

function stepInstruments() {
    for (const ins of INSTRUMENTS) {
        if (ins.rangeless) continue;
        const r = readings[ins.tag];
        const mid = (ins.min + ins.max) / 2;
        const span = ins.max - ins.min;

        if (r.excursion > 0) {
            r.excursion--;
            // ไต่ออกไปทางขอบที่เลือกไว้ ให้เลยขอบไปได้สูงสุด ~12% ของช่วง
            const target = r.excursionHigh ? ins.max + span * 0.12 : ins.min - span * 0.12;
            r.value = clamp(r.value + (target - r.value) * 0.25 + rand(-r.step, r.step),
                ins.min - span * 0.2, ins.max + span * 0.2);
            continue;
        }
        if (Math.random() < EXCURSION_CHANCE) {
            r.excursion = Math.round(rand(EXCURSION_TICKS[0], EXCURSION_TICKS[1]));
            r.excursionHigh = Math.random() < 0.5;
        }
        r.value = clamp(r.value + rand(-r.step, r.step) + (mid - r.value) * 0.04, ins.min, ins.max);
    }
}

// ค่าหลักที่หน้าเว็บใช้ ไม่ได้ตั้งเองแล้ว แต่ "อ่านจากเครื่องมือจริง" ตามทะเบียน
//   CH4      <- GA02 (Gas Analyzer)
//   flowRate <- FM07 (Thermal Mass วัดก๊าซเข้าเครื่องยนต์)
//   efficiency = ค่าคำนวณ ไม่มีเครื่องมือวัดในทะเบียน -> ทำเครื่องหมาย derived ไว้
const plant = { ch4Percent: 55, flowRate: 750, efficiency: 82.4 };

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

const TICK_INTERVAL_MS = 4000;
const TICKS_PER_DAY = 86400000 / TICK_INTERVAL_MS;
const MIN_TREND_SAMPLES = 10; // ต้องมีข้อมูลอย่างน้อยเท่านี้ก่อนไว้ใจ regression แทนค่าตั้งต้น (น้อยกว่านี้ noise ของ simulation ยังกลบสัญญาณจริง)

// หา slope ของ wear ต่อ tick ด้วย least-squares แล้วแปลงเป็น "ต่อวัน"
// เพื่อทำนายวันที่เหลือก่อนถึงจุดวิกฤต จากแนวโน้มข้อมูลจริงแทนตัวเลข dailyRate ที่ตั้งไว้ตายตัว
function predictWearTrend(wearHistory, fallbackDailyRate) {
    const n = wearHistory.length;
    if (n < MIN_TREND_SAMPLES) {
        return { dailyRate: fallbackDailyRate, predicted: false, samples: n };
    }
    const xMean = (n - 1) / 2;
    const yMean = wearHistory.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
        const dx = i - xMean;
        num += dx * (wearHistory[i] - yMean);
        den += dx * dx;
    }
    const slopePerTick = den === 0 ? 0 : num / den;
    const rawDailyRate = slopePerTick * TICKS_PER_DAY;
    // การจำลอง sensor มี noise แบบสุ่มปนอยู่ในทุก tick ซึ่งบางครั้งมีขนาดใกล้เคียงหรือมากกว่าสัญญาณจริง
    // (เช่น TANK-01 สึกหรอ 0.01/tick แต่ noise ผันได้ถึง ±0.03/tick) ทำให้ slope ที่ประเมินได้เพี้ยนสุดขั้วได้
    // จำกัดค่าที่ทำนายได้ไว้ในช่วง 0.2x–5x ของค่าฐาน กันไม่ให้ตัวเลขที่โชว์ผู้ใช้ดูไร้เหตุผล (เช่น 1 วันทั้งที่สึกหรอแค่ 20%)
    const dailyRate = clamp(rawDailyRate, fallbackDailyRate * 0.2, fallbackDailyRate * 5);
    return { dailyRate, predicted: true, samples: n };
}

function computePlantSnapshot() {
    const equipmentList = Object.entries(equipment).map(([id, e]) => {
        const trend = predictWearTrend(e.wearHistory, e.dailyRate);
        return {
            id,
            name: e.name,
            wear: Math.round(e.wear * 10) / 10,
            risk: riskLevel(e.wear),
            failureProb: Math.round(e.wear),
            daysToMaintenance: Math.max(1, Math.round((100 - e.wear) / trend.dailyRate)),
            aiPrediction: {
                predicted: trend.predicted,
                dailyRate: Math.round(trend.dailyRate * 1000) / 1000,
                samples: trend.samples
            },
            wearHistory: e.wearHistory
        };
    }).sort((a, b) => b.wear - a.wear);

    const t1 = equipment['TANK-01'];
    const alerts = [];

    // ---- รายการค่าที่อ่านได้ของทุกเครื่องมือในทะเบียน ----
    // เกณฑ์เตือน: ใช้ "ช่วงการใช้งานประจำ" ตามเอกสารเป็นตัวตัดสิน
    //   ออกนอกช่วง          -> warning
    //   ออกนอกช่วงเกิน 10%  -> critical
    const instruments = INSTRUMENTS.map(ins => {
        const base = {
            tag: ins.tag, station: ins.station, name: ins.name, kind: ins.kind,
            type: ins.type, model: ins.model, error: ins.error, io: ins.io
        };
        if (ins.note) base.note = ins.note;
        if (ins.rangeless) {
            return { ...base, rangeless: true, purpose: ins.purpose, status: readings[ins.tag].status };
        }
        const v = readValue(ins.tag);
        const span = ins.max - ins.min;
        const margin = span * 0.1;
        let status = 'normal';
        if (v < ins.min - margin || v > ins.max + margin) status = 'critical';
        else if (v < ins.min || v > ins.max) status = 'warning';
        const decimals = span >= 500 ? 0 : span >= 50 ? 1 : 2;
        const out = {
            ...base, value: Number(v.toFixed(decimals)), unit: ins.unit,
            min: ins.min, max: ins.max, status
        };
        if (status !== 'normal') {
            alerts.push({ tag: `${ins.tag} ${ins.name} นอกช่วงใช้งาน (${out.value} ${ins.unit})`, level: status === 'critical' ? 'critical' : 'warning' });
        }
        return out;
    });

    equipmentList.filter(e => e.risk === 'critical').forEach(e => alerts.push({ tag: `${e.id} Imminent Failure Risk`, level: 'critical' }));
    equipmentList.filter(e => e.risk === 'high').forEach(e => alerts.push({ tag: `${e.id} High Wear`, level: 'warning' }));
    if (!alerts.length) alerts.push({ tag: 'All Systems Normal', level: 'normal' });

    const pt01 = instrumentByTag['PT01'];
    const tt03 = instrumentByTag['TT03'];
    return {
        plant: {
            ch4Percent: Math.round(plant.ch4Percent * 10) / 10,
            flowRate: Math.round(plant.flowRate * 10) / 10,
            efficiency: Math.round(plant.efficiency * 10) / 10,
            // บอกหน้าเว็บว่าค่าไหนมาจากเครื่องมือจริง ค่าไหนคำนวณเอา
            sources: { ch4Percent: 'GA02-CH4', flowRate: 'FM07', efficiency: 'derived' },
            units: { ch4Percent: '%', flowRate: instrumentByTag['FM07'].unit }
        },
        tank1: {
            pressure: Math.round(t1.pressure * 10) / 10,
            pressureUnit: pt01.unit,          // 'mbar G' ตามเอกสาร (เดิม hardcode เป็น bar)
            temperature: Math.round(t1.temperature * 10) / 10,
            temperatureUnit: tt03.unit,
            ph: Math.round(t1.ph * 100) / 100,
            level: Math.round(t1.level),
            levelUnit: instrumentByTag['CSTR-1-ROOF'].unit,
            sources: { pressure: 'PT01', temperature: 'TT03', level: 'CSTR-1-ROOF', ph: 'ไม่มีในทะเบียน' }
        },
        instruments,
        instrumentSummary: {
            total: instruments.length,
            measured: instruments.filter(i => !i.rangeless).length,
            statusOnly: instruments.filter(i => i.rangeless).length,
            outOfRange: instruments.filter(i => i.status === 'warning' || i.status === 'critical').length
        },
        equipment: equipmentList,
        alerts,
        history: plantHistory,
        updatedAt: Date.now()
    };
}

function stepPlantSimulation() {
    stepInstruments();

    // ค่าหลักอ่านจากเครื่องมือจริงตามทะเบียน แทนการสุ่มช่วงที่ตั้งเอง
    plant.ch4Percent = readValue('GA02-CH4');
    plant.flowRate = readValue('FM07');
    // ไม่มีเครื่องมือวัด "ประสิทธิภาพ" ในทะเบียน — คำนวณจาก CH4 เทียบกับช่วงใช้งานประจำ
    // (40% -> ~70 คะแนน, 70% -> ~92 คะแนน) แล้วทำเครื่องหมาย derived ไว้ให้หน้าเว็บรู้
    const ch4Ins = instrumentByTag['GA02-CH4'];
    const ch4Norm = (plant.ch4Percent - ch4Ins.min) / (ch4Ins.max - ch4Ins.min);
    plant.efficiency = clamp(70 + ch4Norm * 22, 60, 95);

    // TANK-01 ยังคงไว้เพื่อความเข้ากันได้กับหน้าเดิม แต่ผูกกับ CSTR-1 ของจริงแล้ว
    //   อุณหภูมิ  <- TT03 (CSTR1 Temperature)
    //   ความดัน   <- PT01 หน่วย mbar G ตามเอกสาร (ไม่ใช่ bar ที่เคยแต่งไว้)
    //   ระดับ     <- CSTR-1 Rooflevel (mm)
    const t1 = equipment['TANK-01'];
    t1.temperature = readValue('TT03');
    t1.pressure = readValue('PT01');
    t1.level = readValue('CSTR-1-ROOF');
    // pH ไม่มีเครื่องมือวัดในทะเบียน — คงการจำลองเดิมไว้และทำเครื่องหมายว่าไม่ได้มาจากทะเบียน
    t1.ph = clamp(t1.ph + rand(-0.03, 0.03), 6.5, 7.8);

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

// config ตัวละครจากหน้า Avatar (เก็บใน user_metadata ของบัญชี) — กรองค่าก่อนใช้เสมอ
const AVATAR_MODEL_KEYS = ['engineer', 'character', 'ch22', 'ch07', 'remy'];
const AVATAR_ANIM_KEYS = ['catwalk', 'walking'];
function sanitizeAvatarConfig(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
        model: AVATAR_MODEL_KEYS.includes(raw.model) ? raw.model : 'engineer',
        anim: AVATAR_ANIM_KEYS.includes(raw.anim) ? raw.anim : 'catwalk',
        color: (typeof raw.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.color)) ? raw.color : null
    };
}

io.on('connection', socket => {
    const user = socket.data.user;
    const isPlayer = socket.data.role === 'player';

    // ทุก socket ที่ยืนยันตัวตนได้นับเป็น "ออนไลน์" ไม่ว่าจะเป็น player หรือ watcher
    if (user) touchPresence(user.id, +1);

    // ห้องส่วนตัวรายบัญชี — ใช้ยิงการแจ้งเตือนถึงเจ้าตัวโดยตรง (io.to("user:<id>"))
    // ผู้ใช้คนเดียวเปิดหลายแท็บได้ ทุกแท็บอยู่ห้องเดียวกัน กระดิ่งจึงเด้งพร้อมกันหมด
    if (user) socket.join("user:" + user.id);

    // แอดมินที่เปิดหน้า Settings ไว้ ขอรับอัปเดตสถานะออนไลน์แบบ real-time
    socket.on('subscribe_admin_presence', () => {
        if (!user || !isAdminUser(user)) return;
        adminPresenceSockets.add(socket.id);
        socket.emit('presence_snapshot', presenceSnapshot());
    });

    // ---------- WATCHER: รับ state อย่างเดียว ไม่มีตัวละคร ----------
    // "ไม่มีตัวละคร" ไม่เท่ากับ "ไม่มีสิทธิ์" — หน้า Digital Twin ฝัง index.html?mode=viewer
    // ซึ่งต่อเข้ามาแบบ watcher แอดมินที่เปิดหน้านั้นจึงเคยถูกส่ง isAdmin:false และไม่มี role
    // เลยทำให้ปุ่มแก้ไขข้อมูล/กำหนด Type/ปักจุด ถูกซ่อนหมด ทั้งที่ฝั่ง server อนุญาตอยู่แล้ว
    // (canEditData/canManageModel อ่านจาก socket.data.user ไม่ได้สนว่าเป็น player หรือ watcher)
    if (!isPlayer) {
        console.log(`[+watcher] ${socket.id}${user ? ` <${user.email}> (${userRole(user)})` : ' (ไม่ได้ล็อกอิน)'}`);
        socket.emit('self_init', {
            self: null,
            others: [],
            isAdmin: isAdminUser(user),
            role: userRole(user),   // watcher ที่ไม่ได้ล็อกอินจะได้ 'user' อยู่แล้ว
            ...publicState()
        });
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
        const avatarCfg = sanitizeAvatarConfig(user.user_metadata?.avatar);

        const player = {
            id: socket.id,
            userId: user.id,
            name: displayName,
            avatar: avatarCfg,
            // สีที่เลือกเองในหน้า Avatar ชนะสีสุ่มประจำบัญชี
            color: (avatarCfg && avatarCfg.color) || colorForUserId(user.id),
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
            role: userRole(user),   // 'admin' | 'engineer' | 'user' — client ใช้ตัดสินว่าจะโชว์ปุ่มไหน
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
        if (!canManageModel(user)) return denyAction(socket, 'อัปโหลด/เปลี่ยนโมเดล');
        // มีโมเดลอยู่แล้วและถูกล็อก -> เฉพาะ admin เท่านั้นที่อัปโหลดทับได้
        // (ไม่งั้นผู้ใช้ทั่วไป "ลบ" ฉากของห้องได้ทางอ้อมด้วยการอัปโหลดโมเดลใหม่ทับ)
        if (currentModelUrl && modelLocked && !admins.has(socket.id)) {
            socket.emit('model_share_rejected', { reason: 'โมเดลปัจจุบันถูกล็อกอยู่ — ให้ Admin ปลดล็อกก่อนจึงจะเปลี่ยนโมเดลได้' });
            return;
        }
        currentModelUrl = data.url;
        currentModelName = data.fileName;
        // โมเดลใหม่ -> รีเซ็ต transform กลับค่าเริ่มต้น รอ admin จัดตำแหน่งใหม่ และล็อกไว้ก่อนเพื่อความปลอดภัย
        modelTransform = { posX: 0, posY: 0, posZ: 0, rotY: 0, scale: 1 };
        modelLocked = true;
        io.emit('load_model', { url: data.url, fileName: data.fileName, modelTransform, modelLocked });
        schedulePersistSceneState();
        console.log(`[MODEL] ${data.fileName}`);
    });

    socket.on('model_removed', () => {
        if (!canManageModel(user)) return denyAction(socket, 'ลบโมเดล');
        // ลบได้เฉพาะ admin ที่ "ปลดล็อกโมเดลแล้ว" เท่านั้น — ล็อกอยู่ = ห้ามลบ (กันลบพลาด/ผู้ใช้ลบ)
        if (!admins.has(socket.id) || modelLocked) return;
        currentModelUrl = null;
        currentModelName = null;
        modelTransform = { posX: 0, posY: 0, posZ: 0, rotY: 0, scale: 1 };
        modelLocked = true;
        io.emit('model_removed');
        schedulePersistSceneState();
        console.log(`[MODEL] Removed by ${socket.id}`);
    });

    // ---------- REQ 1&2: lock + transform sync (สิทธิ์ admin มาจากบัญชีอัตโนมัติ) ----------
    socket.on('toggle_lock', () => {
        if (!canManageModel(user)) return denyAction(socket, 'ล็อก/ปลดล็อกโมเดล');
        if (!admins.has(socket.id)) return; // เฉพาะ admin เท่านั้นที่ล็อก/ปลดล็อกได้
        modelLocked = !modelLocked;
        io.emit('lock_state', { locked: modelLocked, by: players[socket.id]?.name || 'Admin' });
        schedulePersistSceneState();
        console.log(`[LOCK] ${modelLocked ? 'locked' : 'unlocked'} by ${socket.id}`);
    });

    socket.on('model_transform_update', data => {
        if (!canManageModel(user)) return denyAction(socket, 'ปรับตำแหน่งโมเดล');
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
        schedulePersistSceneState();
    });

    // ---------- workflow / safety data edit ----------
    socket.on('workflow_update', data => {
        if (!canEditData(user)) return denyAction(socket, 'แก้ไขข้อมูลชิ้นส่วน');
        workflowDb[data.key] = {
            name: data.name,
            desc: data.desc,
            steps: data.steps,
            colorClass: data.colorClass || 'tag-blue',
            requiresPPE: !!data.requiresPPE
        };
        if (data.assignedTypeKey) typeAssignments[data.key] = data.assignedTypeKey;
        socket.broadcast.emit('workflow_updated', data);
        schedulePersistSceneState();
        console.log(`[WORKFLOW] key:${data.key} name:${data.name}`);
    });

    // ล้างการกำหนด type — ต้อง sync + persist เหมือนการกำหนด (เดิมเป็น local อย่างเดียว)
    socket.on('type_clear', data => {
        if (!canEditData(user)) return denyAction(socket, 'ล้างการกำหนดประเภท');
        if (!data || !data.key) return;
        delete workflowDb[data.key];
        delete typeAssignments[data.key];
        socket.broadcast.emit('type_cleared', { key: data.key });
        schedulePersistSceneState();
        console.log(`[WORKFLOW] cleared key:${data.key}`);
    });

    // ---------- ตั้งชื่อเล่น — เปลี่ยนชื่อตัวละครทันทีโดยไม่ต้องต่อใหม่ ----------
    // เดิมชื่อมาจาก user_metadata.display_name ซึ่งอ่านตอนเชื่อมต่อครั้งแรกเท่านั้น
    // ผู้ใช้ตั้งชื่อที่หน้าล็อบบี้แล้วต้องรอ token/metadata ตามมาให้ทัน ทำให้บางครั้งชื่อไม่เปลี่ยน
    // ตอนนี้ส่งตรงผ่าน socket แล้ว broadcast ให้ทุกคนเปลี่ยนป้ายชื่อทันที
    // (ตัวตนจริงยังผูกกับบัญชีผ่าน userId เหมือนเดิม ชื่อเล่นเป็นแค่ชื่อที่แสดง)
    socket.on('set_nickname', raw => {
        const p = players[socket.id];
        if (!p) return;
        const clean = String(raw || '').replace(/[<>]/g, '').trim().slice(0, 20);
        if (!clean || clean === p.name) return;
        p.name = clean;
        io.emit('player_renamed', { id: socket.id, name: clean });
        console.log(`[NICKNAME] ${socket.id} -> ${clean}`);
    });

    // ---------- MARKER (จุดที่ผู้ใช้ปักเอง) — sync ให้ทุกคนเห็น + เก็บถาวรเหมือน workflow ----------
    // สีรับได้ทั้งชื่อชุดเดิม (marker เก่าที่บันทึกไว้แล้ว) และ #rrggbb จากจานสีแบบเลือกเองอิสระ
    const MARKER_COLORS = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
    const sanitizeMarkerColor = c => {
        const s = String(c || '').trim();
        if (MARKER_COLORS.includes(s)) return s;
        if (/^#[0-9a-f]{6}$/i.test(s)) return s.toLowerCase();
        return '#38bdf8';
    };
    const MARKER_SHAPES = ['circle', 'square', 'triangle'];
    socket.on('marker_set', data => {
        if (!canEditData(user)) return denyAction(socket, 'ปักจุด');
        if (!data || !data.id) return;
        const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
        // จำกัดช่วงไว้ด้วย — ค่าติดลบหรือค่ามหาศาลทำให้ geometry ฝั่ง client พัง
        const clamp = (v, lo, hi, dflt) => {
            const n = Number(v);
            return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt;
        };
        const marker = {
            id: String(data.id).slice(0, 64),
            name: String(data.name || 'จุดที่ทำเครื่องหมาย').slice(0, 80),
            color: sanitizeMarkerColor(data.color),
            x: num(data.x), y: num(data.y), z: num(data.z),
            shape: MARKER_SHAPES.includes(data.shape) ? data.shape : 'circle',
            size: clamp(data.size, 0.1, 40, 1),      // ขนาดป้าย — ผู้ใช้ตั้งเอง ไม่โตตามโมเดล
            radius: clamp(data.radius, 0, 2000, 0),  // รัศมีเขตปลอดภัย (0 = ไม่มีเขต)
            emergency: !!data.emergency              // เป็นจุดรวมพลฉุกเฉินไหม
        };
        markers[marker.id] = marker;
        io.emit('marker_updated', marker); // io ไม่ใช่ broadcast — คนปักเองต้องได้ id ที่ผ่านการ sanitize กลับไปด้วย
        schedulePersistSceneState();
        console.log(`[MARKER] set ${marker.id} "${marker.name}" (${marker.color}, ${marker.shape}, r=${marker.radius})`);
    });

    // ---------- ใครเข้า/ออกเขตของจุดไหน ----------
    // client เป็นคนตรวจระยะเอง (มันรู้ตำแหน่งตัวเองแม่นที่สุด) แล้วส่งมาให้ server กระจายต่อ
    // server แค่ผูกชื่อผู้เล่นจริงเข้าไปกันการปลอมชื่อคนอื่น
    socket.on('marker_presence', data => {
        if (!data || !data.id || !markers[data.id]) return;
        const p = players[socket.id];
        if (!p) return; // watcher ไม่มีตัวละคร ไม่ต้องประกาศ
        io.emit('marker_presence_changed', {
            socketId: socket.id,
            name: p.name,
            color: p.color,
            markerId: data.id,
            markerName: markers[data.id].name,
            entered: !!data.entered
        });
    });
    socket.on('marker_remove', data => {
        if (!canEditData(user)) return denyAction(socket, 'ลบจุด');
        if (!data || !data.id || !markers[data.id]) return;
        delete markers[data.id];
        io.emit('marker_removed', { id: data.id });
        // ลบจุดที่กำลังเรียกรวมพลอยู่ = การเรียกนั้นไม่มีที่หมายแล้ว ต้องยกเลิกตามไปด้วย
        if (emergencyCall && emergencyCall.markerId === data.id) {
            emergencyCall = null;
            io.emit('emergency_cancelled');
        }
        schedulePersistSceneState();
        console.log(`[MARKER] removed ${data.id}`);
    });

    // ล้างจุดทั้งหมดทีเดียว — จุดผูกกับพิกัดในโลก ไม่ได้ผูกกับตัวโมเดล
    // พอเปลี่ยนโมเดลใหม่ จุดของโมเดลเก่าจึงค้างลอยอยู่ ต้องมีทางล้างให้หมดในคลิกเดียว
    socket.on('markers_clear', () => {
        if (!canEditData(user)) return denyAction(socket, 'ลบจุดทั้งหมด');
        const n = Object.keys(markers).length;
        if (!n) return;
        Object.keys(markers).forEach(id => delete markers[id]);
        io.emit('markers_cleared');
        if (emergencyCall) { emergencyCall = null; io.emit('emergency_cancelled'); }
        schedulePersistSceneState();
        console.log(`[MARKER] cleared all (${n})`);
    });

    // ---------- REQ 3: เรียกรวมพลฉุกเฉิน ----------
    // กดครั้งเดียวแล้วตัวละครของ "ทุกคน" ในโลกจะเดินไปที่จุดนั้นเองอัตโนมัติ
    // สิทธิ์เท่ากับการปักจุด (admin/engineer) — เป็นคำสั่งที่กระทบทุกคน ต้องกันไว้ที่ server
    socket.on('emergency_call', data => {
        if (!canEditData(user)) return denyAction(socket, 'เรียกรวมพลฉุกเฉิน');
        const m = data && data.id ? markers[data.id] : null;
        if (!m) return;
        emergencyCall = { markerId: m.id, name: m.name, x: m.x, y: m.y, z: m.z, by: user?.email || 'ระบบ', at: Date.now() };
        io.emit('emergency_called', emergencyCall);
        // เข้ากระดิ่งด้วย — คนที่ไม่ได้เปิดโลก 3D ค้างไว้ตอนนั้นจะได้รู้เหมือนกัน
        pushBroadcast({
            kind: 'emergency',
            title: '🚨 เรียกรวมพลฉุกเฉิน',
            body: `ให้ไปที่จุด "${m.name}" ทันที · สั่งโดย ${emergencyCall.by}`,
            link: 'Emergency.html'
        });
        console.log(`[EMERGENCY] เรียกรวมพลไปที่ "${m.name}" โดย ${emergencyCall.by}`);
    });
    socket.on('emergency_cancel', () => {
        if (!canEditData(user)) return denyAction(socket, 'ยกเลิกการเรียกฉุกเฉิน');
        if (!emergencyCall) return;
        emergencyCall = null;
        io.emit('emergency_cancelled');
        console.log(`[EMERGENCY] ยกเลิกโดย ${user?.email || 'unknown'}`);
    });

    // ---------- เส้นวัดระยะ — แชร์ให้ทุกคนเห็นเหมือนกัน (ชั่วคราว ไม่ persist) ----------
    socket.on('measure_add', data => {
        if (!data || !data.a || !data.b) return;
        const num = v => Number(v) || 0;
        socket.broadcast.emit('measure_added', {
            id: socket.id,
            a: { x: num(data.a.x), y: num(data.a.y), z: num(data.a.z) },
            b: { x: num(data.b.x), y: num(data.b.y), z: num(data.b.z) }
        });
    });
    socket.on('measure_clear', () => {
        socket.broadcast.emit('measure_cleared', { id: socket.id });
    });

    // ---------- chat (ชื่อผู้เล่นล็อกตามบัญชี — ไม่มี set_name อีกต่อไป) ----------
    socket.on('chat_message', text => {
        if (!players[socket.id]) return;
        io.emit('chat_message', { id: socket.id, name: players[socket.id].name, color: players[socket.id].color, text: String(text).slice(0, 200).replace(/</g, '&lt;') });
    });

    // ---------- VOICE CHAT (WebRTC mesh) ----------
    // server ทำหน้าที่แค่ "ส่งต่อสัญญาณ" (offer/answer/ICE) ระหว่างผู้เล่นสองคน
    // เสียงจริงวิ่งตรงถึงกันแบบ P2P ไม่ผ่าน server — เฉพาะ player (บัญชีจริง) เท่านั้น
    socket.on('voice_signal', payload => {
        if (!players[socket.id] || !payload || !payload.to || !players[payload.to]) return;
        const target = io.sockets.sockets.get(payload.to);
        if (target) target.emit('voice_signal', { from: socket.id, data: payload.data });
    });

    socket.on('voice_state', state => {
        if (!players[socket.id]) return;
        players[socket.id].micOn = !!(state && state.micOn);
        socket.broadcast.emit('voice_state', { id: socket.id, micOn: players[socket.id].micOn });
    });

    socket.on('disconnect', () => {
        const wasPlayer = !!players[socket.id];
        const wasAdmin = admins.has(socket.id);
        delete players[socket.id];
        admins.delete(socket.id);
        adminPresenceSockets.delete(socket.id);
        if (user) touchPresence(user.id, -1);
        if (wasPlayer) io.emit('player_left', { id: socket.id });
        if (wasAdmin) io.emit('admin_presence', { adminCount: admins.size });
        io.emit('measure_cleared', { id: socket.id }); // เก็บกวาดเส้นวัดของคนที่ออกไป
        console.log(`[-${wasPlayer ? 'player' : 'watcher'}] ${socket.id}`);
    });
});

server.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
