const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

// إعداد مجلد الرفع
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

const secret = 'your_secret_key_change_this_please'; // غيّرها لشيء أقوى
const PORT = 3000;

// هيكلة الغرف الأصلية
let roomUsers = {
    general: [],
    algeria: [],
    all_countries: []
};

let roomCounts = {
    general: 0,
    algeria: 0,
    all_countries: 0
};

let roomMessages = {
    general: [],
    algeria: [],
    all_countries: []
};

let users = [];

function loadUsers() {
    if (fs.existsSync('users.json')) {
        users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
    }
}
loadUsers();

function saveUsers() {
    fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

// Register
app.post('/register', (req, res) => {
    const { username, password } = req.body;
    if (users.find(u => u.username === username)) {
        return res.status(400).json({ msg: 'اسم المستخدم موجود مسبقاً' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const newUser = {
        id: Date.now().toString(),
        username,
        passwordHash,
        avatar: '',
        background: '',
        friends: []
    };

    users.push(newUser);
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

    const token = jwt.sign({ id: user.id, username }, secret, { expiresIn: '7d' });
    res.json({ token });
});

const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) return res.status(401).json({ msg: 'Token مطلوب' });

    const token = authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ msg: 'Token غير صالح' });

    try {
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    } catch (err) {
        res.status(401).json({ msg: 'Token غير صالح' });
    }
};

// Profile
app.get('/profile', verifyToken, (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (!user) return res.status(404).json({ msg: 'المستخدم غير موجود' });

    res.json({
        id: user.id,
        username: user.username,
        avatar: user.avatar,
        background: user.background,
        friends: user.friends
    });
});

// رفع الصور
app.post('/upload-avatar', verifyToken, upload.single('avatar'), (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (!req.file) return res.status(400).json({ msg: 'لم يتم رفع ملف' });
    user.avatar = '/uploads/' + req.file.filename;
    saveUsers();
    res.json({ avatar: user.avatar });
});

app.post('/upload-background', verifyToken, upload.single('background'), (req, res) => {
    const user = users.find(u => u.id === req.user.id);
    if (!req.file) return res.status(400).json({ msg: 'لم يتم رفع ملف' });
    user.background = '/uploads/' + req.file.filename;
    saveUsers();
    res.json({ background: user.background });
});

// Socket.io
io.on('connection', socket => {
    let currentRoom = null;
    let currentUser = null;

    socket.on('join', (room, token) => {
        try {
            const decoded = jwt.verify(token, secret);
            currentUser = { id: decoded.id, username: decoded.username };

            // خروج من الغرفة السابقة إن وجدت
            if (currentRoom && roomUsers[currentRoom]) {
                socket.leave(currentRoom);
                roomCounts[currentRoom]--;
                roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.id !== currentUser.id);
                io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
                io.to(currentRoom).emit('system message', `${currentUser.username} غادر الغرفة`);
            }

            // الانضمام للغرفة الجديدة
            currentRoom = room;
            socket.join(room);

            if (!roomUsers[room]) roomUsers[room] = [];
            if (!roomCounts[room]) roomCounts[room] = 0;

            roomCounts[room]++;
            const userData = {
                id: currentUser.id,
                username: currentUser.username,
                avatar: users.find(u => u.id === currentUser.id)?.avatar || 'https://via.placeholder.com/40'
            };

            roomUsers[room].push(userData);

            io.to(room).emit('update users', roomUsers[room]);
            io.to(room).emit('system message', `${currentUser.username} انضم إلى الغرفة`);
            socket.emit('previous messages', roomMessages[room] || []);

        } catch (err) {
            socket.emit('error', 'توكن غير صالح');
        }
    });

    socket.on('message', (msg) => {
        if (!currentRoom || !currentUser) return;

        const user = users.find(u => u.id === currentUser.id);
        const avatar = user?.avatar || 'https://via.placeholder.com/40';

        const messageObj = {
            username: currentUser.username,
            msg: msg.trim(),
            avatar,
            timestamp: new Date().toISOString()
        };

        if (!roomMessages[currentRoom]) roomMessages[currentRoom] = [];
        roomMessages[currentRoom].push(messageObj);
        if (roomMessages[currentRoom].length > 100) roomMessages[currentRoom].shift();

        io.to(currentRoom).emit('message', messageObj);
    });

    socket.on('disconnect', () => {
        if (currentRoom && currentUser && roomUsers[currentRoom]) {
            roomCounts[currentRoom]--;
            roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.id !== currentUser.id);
            io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
            io.to(currentRoom).emit('system message', `${currentUser.username} غادر الغرفة`);
        }
    });
});

http.listen(PORT, '0.0.0.0', () => {
    console.log('=====================================');
    console.log(`السيرفر يعمل على المنفذ: ${PORT}`);
    console.log('الغرف المتاحة: general, algeria, all_countries');
    console.log('=====================================');
});
