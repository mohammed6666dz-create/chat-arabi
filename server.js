const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

let users = [];
let roomUsers = { general: [], algeria: [], all_countries: [] };
let roomCounts = { general: 0, algeria: 0, all_countries: 0 };

// ────────────────────────────────────────────────
// إضافة الرتب (بدون تغيير أي سطر سابق)
const RANKS = ['ضيف', 'عضو', 'بريميوم', 'أدمن', 'صاحب الموقع'];
// ────────────────────────────────────────────────

const secret = 'secretkey';
const PORT = 3000;

function loadUsers() {
    if (fs.existsSync('users.json')) {
        users = JSON.parse(fs.readFileSync('users.json'));
    }

    // إنشاء حساب صاحب الموقع (mohamed-dz) تلقائيًا لو ما كان موجود
    if (!users.find(u => u.username === 'mohamed-dz')) {
        const ownerPassword = bcrypt.hashSync('mohokok12', 10);
        users.push({
            username: 'mohamed-dz',
            passwordHash: ownerPassword,
            avatar: '',
            background: '',
            friends: [],
            rank: 'صاحب الموقع'
        });
        saveUsers();
        console.log('تم إنشاء حساب صاحب الموقع تلقائيًا: username: mohamed-dz | password: mohokok12');
        console.log('غير كلمة السر فورًا من users.json لو هتستخدم الموقع على الإنترنت!');
          console.log('تم إنشاء حساب صاحب الموقع تلقائيًا: username:nour| password:44042011');
        console.log('غير كلمة السر فورًا من users.json لو هتستخدم الموقع على الإنترنت!');
    }  
}

loadUsers();

function saveUsers() {
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

// Register
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users.find(u => u.username === username)) return res.status(400).json({ msg: 'المستخدم موجود' });

    const passwordHash = bcrypt.hashSync(password, 10);
    users.push({
        username,
        passwordHash,
        avatar: '',
        background: '',
        friends: [],
        rank: 'ضيف',
        friendRequests: [],
        sentRequests: [],
        notifications: []
    });
    saveUsers();
    res.json({ msg: 'تم التسجيل بنجاح' });
});

// Login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(400).json({ msg: 'بيانات خاطئة' });
    }

    const token = jwt.sign({ username }, secret, { expiresIn: '7d' });
    res.json({ token });
});

const verifyToken = (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ msg: 'لا توكن' });

    try {
        req.user = jwt.verify(token, secret);
        next();
    } catch (e) {
        res.status(401).json({ msg: 'توكن غير صالح' });
    }
};

// Profile
app.get('/profile', verifyToken, (req, res) => {
    const user = users.find(u => u.username === req.user.username);
    res.json({
        username: user.username,
        avatar: user.avatar,
        background: user.background,
        friends: user.friends,
        rank: user.rank || 'ضيف'
    });
});

// Upload avatar
app.post('/upload-avatar', verifyToken, upload.single('avatar'), (req, res) => {
    const user = users.find(u => u.username === req.user.username);
    if (req.file) user.avatar = '/uploads/' + req.file.filename;
    saveUsers();
    res.json({ avatar: user.avatar });
});

// Upload background
app.post('/upload-background', verifyToken, upload.single('background'), (req, res) => {
    const user = users.find(u => u.username === req.user.username);
    if (req.file) user.background = '/uploads/' + req.file.filename;
    saveUsers();
    res.json({ background: user.background });
});

// Room counts
app.get('/room-counts', (req, res) => {
    res.json(roomCounts);
});

// تغيير رتبة مستخدم
app.post('/change-rank', verifyToken, (req, res) => {
    const changer = users.find(u => u.username === req.user.username);
    if (!changer || changer.rank !== 'صاحب الموقع') {
        return res.status(403).json({ msg: 'غير مصرح لك' });
    }

    const { targetUsername, newRank } = req.body;
    if (!RANKS.includes(newRank)) {
        return res.status(400).json({ msg: 'رتبه غير صالحة' });
    }

    const target = users.find(u => u.username === targetUsername);
    if (!target) return res.status(404).json({ msg: 'المستخدم غير موجود' });

    target.rank = newRank;
    saveUsers();

    io.emit('rank update', { username: targetUsername, rank: newRank });
    res.json({ msg: 'تم تغيير الرتبه بنجاح' });
});

// ────────────────────────────────────────────────
//        الـ Socket.IO + الصداقات + الرسائل الخاصة
// ────────────────────────────────────────────────

io.on('connection', socket => {
    let currentRoom = null;
    let username = null;

    socket.on('join', (room, token) => {
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

            const user = users.find(u => u.username === username);
            const avatar = user?.avatar || 'https://via.placeholder.com/40';

            roomUsers[room].push({ username, avatar });
            io.to(room).emit('update users', roomUsers[room]);
            io.to(room).emit('system message', `${username} انضم إلى الغرفة`);

        } catch (e) {
            console.log('توكن غير صالح');
        }
    });

    socket.on('message', (msg, token) => {
        try {
            const decoded = jwt.verify(token, secret);
            const user = users.find(u => u.username === decoded.username);
            const avatar = user?.avatar || 'https://via.placeholder.com/40';

            io.to(currentRoom).emit('message', {
                username: decoded.username,
                msg,
                avatar
            });
        } catch (e) { }
    });

    // طلب صداقة
    socket.on('send friend request', (targetUsername) => {
        if (!socket.username || socket.username === targetUsername) return;

        const sender = users.find(u => u.username === socket.username);
        const target = users.find(u => u.username === targetUsername);
        if (!sender || !target) return;

        if (sender.sentRequests.includes(targetUsername) ||
            target.friendRequests.includes(socket.username) ||
            sender.friends.includes(targetUsername)) return;

        target.friendRequests.push(socket.username);
        sender.sentRequests.push(targetUsername);
        saveUsers();

        sendNotification(targetUsername, {
            type: 'friend_request',
            from: socket.username,
            message: `${socket.username} أرسل لك طلب صداقة`,
            time: new Date().toISOString()
        });

        socket.emit('request_sent', targetUsername);
    });

    // قبول طلب
    socket.on('accept friend request', (fromUsername) => {
        const acceptor = socket.username;
        const acceptorUser = users.find(u => u.username === acceptor);
        const senderUser = users.find(u => u.username === fromUsername);

        if (!acceptorUser || !senderUser) return;

        acceptorUser.friendRequests = acceptorUser.friendRequests.filter(u => u !== fromUsername);
        senderUser.sentRequests = senderUser.sentRequests.filter(u => u !== acceptor);

        if (!acceptorUser.friends.includes(fromUsername)) acceptorUser.friends.push(fromUsername);
        if (!senderUser.friends.includes(acceptor)) senderUser.friends.push(acceptor);

        saveUsers();

        sendNotification(fromUsername, {
            type: 'friend_accepted',
            from: acceptor,
            message: `${acceptor} قبل طلب الصداقة`,
            time: new Date().toISOString()
        });

        socket.emit('friend_accepted', fromUsername);
    });

    // رفض طلب
    socket.on('reject friend request', (fromUsername) => {
        const rejector = socket.username;
        const rejectorUser = users.find(u => u.username === rejector);
        if (!rejectorUser) return;

        rejectorUser.friendRequests = rejectorUser.friendRequests.filter(u => u !== fromUsername);

        const sender = users.find(u => u.username === fromUsername);
        if (sender) sender.sentRequests = sender.sentRequests.filter(u => u !== rejector);

        saveUsers();
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

function sendNotification(toUsername, notification) {
    const user = users.find(u => u.username === toUsername);
    if (user) {
        user.notifications.push(notification);
        saveUsers();
    }

    for (const socket of io.sockets.sockets.values()) {
        if (socket.username === toUsername) {
            socket.emit('new notification', notification);
            break;
        }
    }
}

http.listen(PORT, '0.0.0.0', () => {
    console.log('=====================================');
    console.log('✅ السيرفر يعمل بنجاح على port ' + PORT);
    console.log('');
    console.log('🚀 افتح الشات من الرابط ده مباشرة:');
    console.log(`http://localhost:${PORT}/index.html`);
    console.log('');
    console.log('=====================================');
});
