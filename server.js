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

// إعدادات الملفات والمجلدات
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
const upload = multer({ dest: uploadDir });

// Middleware
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

// تخزين البيانات (في الذاكرة + ملف json)
let users = [];
const secret = 'secretkey'; // يُفضل تغييره إلى قيمة أكثر أماناً في الإنتاج
const PORT = 3000;

// الغرف المتاحة
const roomUsers = {
    general: [],
    algeria: [],
    all_countries: []
};

const roomCounts = {
    general: 0,
    algeria: 0,
    all_countries: 0
};

const roomMessages = {
    general: [],
    algeria: [],
    all_countries: []
};

// قراءة المستخدمين من الملف عند بدء التشغيل
function loadUsers() {
    if (fs.existsSync('users.json')) {
        try {
            users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
        } catch (error) {
            console.error('خطأ في قراءة users.json:', error);
            users = [];
        }
    }
}

function saveUsers() {
    try {
        fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
    } catch (error) {
        console.error('خطأ في حفظ users.json:', error);
    }
}

loadUsers();

// ======================
//        Routes
// ======================

// تسجيل مستخدم جديد
app.post('/register', (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({ msg: 'يجب إدخال اسم المستخدم وكلمة المرور' });
    }

    if (users.find(u => u.username === username)) {
        return res.status(400).json({ msg: 'المستخدم موجود مسبقاً' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    
    const newUser = {
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

// تسجيل الدخول
app.post('/login', (req, res) => {
    const { username, password } = req.body;

    const user = users.find(u => u.username === username);
    
    if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
        return res.status(400).json({ msg: 'بيانات خاطئة' });
    }

    const token = jwt.sign({ username }, secret, { expiresIn: '7d' });
    res.json({ token });
});

// التحقق من التوكن (middleware)
const verifyToken = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).json({ msg: 'لا يوجد توكن' });
    }

    // دعم صيغتين: Bearer token أو token فقط
    const token = authHeader.startsWith('Bearer ') 
        ? authHeader.split(' ')[1] 
        : authHeader;

    try {
        const decoded = jwt.verify(token, secret);
        req.user = decoded;
        next();
    } catch (e) {
        res.status(401).json({ msg: 'توكن غير صالح' });
    }
};

// عرض بيانات الملف الشخصي
app.get('/profile', verifyToken, (req, res) => {
    const user = users.find(u => u.username === req.user.username);
    if (!user) {
        return res.status(404).json({ msg: 'المستخدم غير موجود' });
    }
    res.json(user);
});

// رفع صورة الملف الشخصي
app.post('/upload-avatar', verifyToken, upload.single('avatar'), (req, res) => {
    const user = users.find(u => u.username === req.user.username);
    
    if (!req.file) {
        return res.status(400).json({ msg: 'فشل في رفع الصورة: لم يتم استلام الملف' });
    }

    user.avatar = '/uploads/' + req.file.filename;
    saveUsers();
    res.json({ avatar: user.avatar });
});

// رفع صورة الخلفية
app.post('/upload-background', verifyToken, upload.single('background'), (req, res) => {
    const user = users.find(u => u.username === req.user.username);
    
    if (!req.file) {
        return res.status(400).json({ msg: 'فشل في رفع الصورة: لم يتم استلام الملف' });
    }

    user.background = '/uploads/' + req.file.filename;
    saveUsers();
    res.json({ background: user.background });
});

// عدد المستخدمين في كل غرفة (اختياري)
app.get('/room-counts', (req, res) => {
    res.json(roomCounts);
});

// ======================
//       Socket.io
// ======================

io.on('connection', socket => {
    let currentRoom = null;
    let username = null;

    // الانضمام إلى غرفة
    socket.on('join', (room, token) => {
        try {
            const decoded = jwt.verify(token, secret);
            username = decoded.username;

            // الخروج من الغرفة السابقة إن وجدت
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

            // إرسال آخر الرسائل
            socket.emit('previous messages', roomMessages[room] || []);

        } catch (e) {
            console.log('توكن غير صالح في الـ join:', e.message);
            socket.emit('error', 'توكن غير صالح');
        }
    });

    // إرسال رسالة
    socket.on('message', (msg, token) => {
        try {
            const decoded = jwt.verify(token, secret);
            const senderUsername = decoded.username;

            if (!currentRoom) return;

            const user = users.find(u => u.username === senderUsername);
            const avatar = user?.avatar || 'https://via.placeholder.com/40';

            const messageObj = {
                username: senderUsername,
                msg: msg.trim(),
                avatar,
                timestamp: new Date().toISOString()
            };

            roomMessages[currentRoom].push(messageObj);

            // الحفاظ على آخر 100 رسالة فقط
            if (roomMessages[currentRoom].length > 100) {
                roomMessages[currentRoom].shift();
            }

            io.to(currentRoom).emit('message', messageObj);

        } catch (e) {
            console.log('توكن غير صالح في الرسالة:', e.message);
        }
    });

    // عند قطع الاتصال
    socket.on('disconnect', () => {
        if (currentRoom && username) {
            roomCounts[currentRoom]--;
            roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.username !== username);
            
            io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
            io.to(currentRoom).emit('system message', `${username} غادر الغرفة`);
        }
    });
});

// تشغيل السيرفر
http.listen(PORT, '0.0.0.0', () => {
    console.log('=====================================');
    console.log('✅ السيرفر يعمل بنجاح على المنفذ:', PORT);
    console.log('   الرابط: http://localhost:' + PORT);
    console.log('   الغرف المتاحة: general, algeria, all_countries');
    console.log('=====================================');
});
