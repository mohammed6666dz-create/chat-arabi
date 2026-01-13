const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const path = require('path');
const bodyParser = require('body-parser');
require('dotenv').config();  // ← إضافة dotenv للـ env vars يا وحش!

// ← إضافة Supabase client (مش محتاج fs بعد اليوم!)
const { createClient } = require('@supabase/supabase-js');
const supabaseUrl = process.env.SUPABASE_URL || 'https://wgzikxgbhrcgfewnosiq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);
console.log('🔥 Supabase متصل يا محمد - مشروعك: mohammed6666dz-create! 🚀');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

let roomUsers = { general: [], algeria: [], all_countries: [] };
let roomCounts = { general: 0, algeria: 0, all_countries: 0 };
// ────────────────────────────────────────────────
// إضافة الرتب (بدون تغيير أي سطر سابق)
const RANKS = ['ضيف', 'عضو', 'بريميوم', 'أدمن', 'صاحب الموقع'];
// ────────────────────────────────────────────────
const secret = 'secretkey';
const PORT = process.env.PORT || 3000;

// ← دالة مساعدة جديدة لجلب مستخدم (بدل users.find)
async function getUser(username) {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .single();
    if (error) console.error('خطأ في جلب المستخدم:', error);
    return data;
}

// ← إنشاء حساب صاحب الموقع تلقائياً (مرة واحدة فقط، مش هيكرر)
async function createOwnerIfNotExists() {
    const owner = await getUser('mohamed-dz');
    if (!owner) {
        const ownerPassword = bcrypt.hashSync('mohokok12', 10);
        const { error } = await supabase
            .from('users')
            .insert({
                username: 'mohamed-dz',
                password_hash: ownerPassword,
                avatar: '',
                background: '',
                friends: [],
                rank: 'صاحب الموقع',
                friend_requests: [],
                sent_requests: [],
                notifications: []
            });
        if (!error) {
            console.log('✅ تم إنشاء حساب صاحب الموقع: mohamed-dz | mohokok12');
            console.log('غير كلمة السر فورًا من Supabase Dashboard يا وحش!');
        }
    }
}
createOwnerIfNotExists();  // ← نشغلها مرة واحدة

// Register
app.post('/register', async (req, res) => {
    const { username, password } = req.body;
    const user = await getUser(username);
    if (user) return res.status(400).json({ msg: 'المستخدم موجود' });
    const passwordHash = bcrypt.hashSync(password, 10);
    const { error } = await supabase
        .from('users')
        .insert({
            username,
            password_hash: passwordHash,
            avatar: '',
            background: '',
            friends: [],
            rank: 'ضيف',
            friend_requests: [],
            sent_requests: [],
            notifications: []
        });
    if (error) return res.status(500).json({ msg: 'خطأ في التسجيل' });
    res.json({ msg: 'تم التسجيل بنجاح' });
});
// Login
app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await getUser(username);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) return res.status(400).json({ msg: 'بيانات خاطئة' });
    const token = jwt.sign({ username }, secret, { expiresIn: '7d' });
    res.json({ token });
});
const verifyToken = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ msg: 'لا توكن' });
    try {
        req.user = jwt.verify(token.replace('Bearer ', ''), secret);
        next();
    } catch (e) {
        res.status(401).json({ msg: 'توكن غير صالح' });
    }
};
// Profile
app.get('/profile', verifyToken, async (req, res) => {
    const user = await getUser(req.user.username);
    if (!user) return res.status(404).json({ msg: 'غير موجود' });
    res.json({
        username: user.username,
        passwordHash: user.password_hash,  // ← للتوافق مع frontend
        avatar: user.avatar,
        background: user.background,
        friends: user.friends,
        rank: user.rank || 'ضيف',
        friend_requests: user.friend_requests || [],
        sent_requests: user.sent_requests || [],
        notifications: user.notifications || []
    });
});
// Upload avatar
app.post('/upload-avatar', verifyToken, upload.single('avatar'), async (req, res) => {
    let user = await getUser(req.user.username);
    if (req.file) user.avatar = '/uploads/' + req.file.filename;
    await supabase
        .from('users')
        .update({ avatar: user.avatar })
        .eq('username', req.user.username);
    res.json({ avatar: user.avatar });
});
// Upload background
app.post('/upload-background', verifyToken, upload.single('background'), async (req, res) => {
    let user = await getUser(req.user.username);
    if (req.file) user.background = '/uploads/' + req.file.filename;
    await supabase
        .from('users')
        .update({ background: user.background })
        .eq('username', req.user.username);
    res.json({ background: user.background });
});
// Room counts
app.get('/room-counts', (req, res) => {
    res.json(roomCounts);
});
// تغيير رتبة مستخدم
app.post('/change-rank', verifyToken, async (req, res) => {
    const changer = await getUser(req.user.username);
    if (!changer || changer.rank !== 'صاحب الموقع') {
        return res.status(403).json({ msg: 'غير مصرح لك' });
    }
    const { targetUsername, newRank } = req.body;
    if (!RANKS.includes(newRank)) {
        return res.status(400).json({ msg: 'رتبه غير صالحة' });
    }
    const target = await getUser(targetUsername);
    if (!target) return res.status(404).json({ msg: 'المستخدم غير موجود' });
    await supabase
        .from('users')
        .update({ rank: newRank })
        .eq('username', targetUsername);
    io.emit('rank update', { username: targetUsername, rank: newRank });
    res.json({ msg: 'تم تغيير الرتبه بنجاح' });
});
// ────────────────────────────────────────────────
// إضافات الصداقة + الرسائل الخاصة + الإشعارات
// ────────────────────────────────────────────────
function sendNotification(toUsername, notification) {
    // ← تحديث async للإشعارات
    supabase
        .from('users')
        .update({ notifications: supabase.rpc('array_append', { column: 'notifications', value: notification }) })  // أو استخدم update مع fetch أول
        .eq('username', toUsername);
    for (const socket of io.sockets.sockets.values()) {
        if (socket.username === toUsername) {
            socket.emit('new notification', notification);
            break;
        }
    }
}
io.on('connection', socket => {
    let currentRoom = null;
    let username = null;
    socket.on('join', async (room, token) => {  // ← async هنا
        try {
            const decoded = jwt.verify(token, secret);
            username = decoded.username;
            socket.username = username;
            if (currentRoom) {
                socket.leave(currentRoom);
                roomCounts[currentRoom]--;
                roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.username !== username);
                io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
                io.to(currentRoom).emit('system message', `${username} غادر الغرفة`);
            }
            currentRoom = room;
            socket.join(room);
            roomCounts[room]++;
            const user = await getUser(username);  // ← await
            const avatar = user?.avatar || 'https://via.placeholder.com/40';
            roomUsers[room].push({ username, avatar });
            io.to(room).emit('update users', roomUsers[room]);
            io.to(room).emit('system message', `${username} انضم إلى الغرفة`);
        } catch (e) {
            console.log('توكن غير صالح');
        }
    });
    socket.on('message', async (msg, token) => {  // ← async
        try {
            const decoded = jwt.verify(token, secret);
            const user = await getUser(decoded.username);
            const avatar = user?.avatar || 'https://via.placeholder.com/40';
            io.to(currentRoom).emit('message', { username: decoded.username, msg, avatar });
        } catch (e) {}
    });
    // طلب صداقة
    socket.on('send friend request', async (targetUsername) => {
        if (!socket.username || socket.username === targetUsername) return;
        const sender = await getUser(socket.username);
        const target = await getUser(targetUsername);
        if (!sender || !target) return;
        if ((sender.sent_requests || []).includes(targetUsername) ||
            (target.friend_requests || []).includes(socket.username) ||
            (sender.friends || []).includes(targetUsername)) return;
        // ← update arrays في Supabase
        await supabase.from('users').update({ friend_requests: [...(target.friend_requests || []), socket.username] }).eq('username', targetUsername);
        await supabase.from('users').update({ sent_requests: [...(sender.sent_requests || []), targetUsername] }).eq('username', socket.username);
        sendNotification(targetUsername, {
            type: 'friend_request',
            from: socket.username,
            message: `${socket.username} أرسل لك طلب صداقة`,
            time: new Date().toISOString()
        });
        socket.emit('request_sent', targetUsername);
    });
    // قبول طلب
    socket.on('accept friend request', async (fromUsername) => {
        const acceptor = socket.username;
        const acceptorUser = await getUser(acceptor);
        const senderUser = await getUser(fromUsername);
        if (!acceptorUser || !senderUser) return;
        const newAcceptorRequests = (acceptorUser.friend_requests || []).filter(u => u !== fromUsername);
        const newSenderRequests = (senderUser.sent_requests || []).filter(u => u !== acceptor);
        const newAcceptorFriends = [...(acceptorUser.friends || []), fromUsername];
        const newSenderFriends = [...(senderUser.friends || []), acceptor];
        await supabase.from('users').update({ friend_requests: newAcceptorRequests, friends: newAcceptorFriends }).eq('username', acceptor);
        await supabase.from('users').update({ sent_requests: newSenderRequests, friends: newSenderFriends }).eq('username', fromUsername);
        sendNotification(fromUsername, {
            type: 'friend_accepted',
            from: acceptor,
            message: `${acceptor} قبل طلب الصداقة`,
            time: new Date().toISOString()
        });
        socket.emit('friend_accepted', fromUsername);
    });
    // رفض طلب
    socket.on('reject friend request', async (fromUsername) => {
        const rejector = socket.username;
        const rejectorUser = await getUser(rejector);
        if (!rejectorUser) return;
        const newRequests = (rejectorUser.friend_requests || []).filter(u => u !== fromUsername);
        await supabase.from('users').update({ friend_requests: newRequests }).eq('username', rejector);
        const sender = await getUser(fromUsername);
        if (sender) {
            const newSent = (sender.sent_requests || []).filter(u => u !== rejector);
            await supabase.from('users').update({ sent_requests: newSent }).eq('username', fromUsername);
        }
        socket.emit('request_rejected', fromUsername);
    });
    // رسالة خاصة
    socket.on('private message', ({ to, text }) => {
        const from = socket.username;
        if (!from || !to || !text?.trim()) return;
        const message = {
            from,
            to,
            text,
            time: new Date().toISOString(),
            seen: false
        };
        for (const s of io.sockets.sockets.values()) {
            if (s.username === from || s.username === to) {
                s.emit('private message', message);
            }
        }
        const isOnline = Array.from(io.sockets.sockets.values()).some(s => s.username === to);
        if (!isOnline) {
            sendNotification(to, {
                type: 'private_message',
                from,
                message: `رسالة خاصة جديدة من ${from}`,
                time: new Date().toISOString()
            });
        }
    });
    socket.on('disconnect', () => {
        if (currentRoom && username) {
            roomCounts[currentRoom]--;
            roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.username !== username);
            io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
            io.to(currentRoom).emit('system message', `${username} غادر الغرفة`);
        }
        socket.username = null;
    });
});
http.listen(PORT, '0.0.0.0', () => {
    console.log('=====================================');
    console.log('✅ السيرفر يعمل بنجاح على port ' + PORT + ' مع Supabase!');
    console.log('');
    console.log('🚀 افتح الشات: http://localhost:' + PORT + '/index.html');
    console.log('💾 الحسابات محفوظة دائم في Supabase يا وحش!');
    console.log('');
    console.log('=====================================');
});
