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

app.get('/api/admin/users', requireAdmin, async (req, res) => {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers();
    if (error) return res.status(500).json({ error: error.message });
    const users = data.users.map(u => {
        const p = presence.get(u.id);
        return {
            id: u.id,
            email: u.email,
            role: isAdminUser(u) ? 'admin' : 'user',
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
    res.json({ isAdmin: isAdminUser(data.user) });
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
// จุดที่ผู้ใช้ปักเอง (marker) — id -> { id, name, color, x, y, z }
// ต่างจาก typeAssignments ตรงที่ตั้งชื่อ/สีได้อิสระ ไม่ต้องผูกกับประเภทอุปกรณ์ที่มีอยู่
const markers = {};

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
let knowledgeSettings = { enabled: false, topic: 'ความปลอดภัยเบื้องต้นในโรงงานก๊าซชีวภาพ (Biogas Plant Basic Safety)' };

async function loadKnowledgeSettings() {
    try {
        const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/models/${KNOWLEDGE_SETTINGS_FILE}?t=${Date.now()}`);
        if (!res.ok) return;
        const s = await res.json();
        if (s && typeof s === 'object') knowledgeSettings = { enabled: !!s.enabled, topic: s.topic || knowledgeSettings.topic };
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

app.get('/api/knowledge-settings', (req, res) => res.json(knowledgeSettings));
app.post('/api/knowledge-settings', requireAdmin, async (req, res) => {
    const { enabled, topic } = req.body || {};
    knowledgeSettings = {
        enabled: !!enabled,
        topic: (typeof topic === 'string' && topic.trim()) ? topic.trim().slice(0, 200) : knowledgeSettings.topic
    };
    await persistKnowledgeSettings();
    res.json({ success: true, settings: knowledgeSettings });
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
        clean.push({
            q: item.q.trim().slice(0, 500),
            options: options.slice(0, 6).map(o => o.slice(0, 200)),
            correct,
            topic: String(item.topic || '').trim().slice(0, 100) || 'ทั่วไป'
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

app.get('/api/knowledge-questions', (req, res) => res.json(knowledgeQuestions));
app.post('/api/knowledge-questions', requireAdmin, async (req, res) => {
    const clean = sanitizeQuestions(req.body);
    if (!clean) return res.status(400).json({ error: 'ต้องมีคำถามอย่างน้อย 1 ข้อ และแต่ละข้อต้องมีตัวเลือกอย่างน้อย 2 ตัวเลือกที่ไม่ว่าง' });
    knowledgeQuestions = clean;
    await persistKnowledgeQuestions();
    res.json({ success: true, questions: knowledgeQuestions });
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

    // แอดมินที่เปิดหน้า Settings ไว้ ขอรับอัปเดตสถานะออนไลน์แบบ real-time
    socket.on('subscribe_admin_presence', () => {
        if (!user || !isAdminUser(user)) return;
        adminPresenceSockets.add(socket.id);
        socket.emit('presence_snapshot', presenceSnapshot());
    });

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
        if (!admins.has(socket.id)) return; // เฉพาะ admin เท่านั้นที่ล็อก/ปลดล็อกได้
        modelLocked = !modelLocked;
        io.emit('lock_state', { locked: modelLocked, by: players[socket.id]?.name || 'Admin' });
        schedulePersistSceneState();
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
        schedulePersistSceneState();
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
        schedulePersistSceneState();
        console.log(`[WORKFLOW] key:${data.key} name:${data.name}`);
    });

    // ล้างการกำหนด type — ต้อง sync + persist เหมือนการกำหนด (เดิมเป็น local อย่างเดียว)
    socket.on('type_clear', data => {
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
    socket.on('marker_set', data => {
        if (!data || !data.id) return;
        const num = v => (Number.isFinite(Number(v)) ? Number(v) : 0);
        const marker = {
            id: String(data.id).slice(0, 64),
            name: String(data.name || 'จุดที่ทำเครื่องหมาย').slice(0, 80),
            color: sanitizeMarkerColor(data.color),
            x: num(data.x), y: num(data.y), z: num(data.z)
        };
        markers[marker.id] = marker;
        io.emit('marker_updated', marker); // io ไม่ใช่ broadcast — คนปักเองต้องได้ id ที่ผ่านการ sanitize กลับไปด้วย
        schedulePersistSceneState();
        console.log(`[MARKER] set ${marker.id} "${marker.name}" (${marker.color})`);
    });
    socket.on('marker_remove', data => {
        if (!data || !data.id || !markers[data.id]) return;
        delete markers[data.id];
        io.emit('marker_removed', { id: data.id });
        schedulePersistSceneState();
        console.log(`[MARKER] removed ${data.id}`);
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
