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

// إعداد مجلد رفع الصور
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

let users = [];
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

const secret = 'secretkey'; // غيّرها لاحقًا لشيء أقوى
const PORT = 3000;

// قراءة وحفظ المستخدمين
function loadUsers() {
  if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json'));
  }
}
loadUsers();

function saveUsers() {
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

// تسجيل مستخدم جديد
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ msg: 'المستخدم موجود' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  users.push({ 
    username, 
    passwordHash, 
    avatar: '', 
    background: '', 
    friends: [] 
  });
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

// Middleware التحقق من التوكن
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

// عرض البروفايل
app.get('/profile', verifyToken, (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  res.json(user || {});
});

// رفع صورة الملف الشخصي
app.post('/upload-avatar', verifyToken, upload.single('avatar'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  if (!req.file) return res.status(400).json({ msg: 'فشل في رفع الصورة' });
  user.avatar = '/uploads/' + req.file.filename;
  saveUsers();
  res.json({ avatar: user.avatar });
});

// رفع خلفية البروفايل
app.post('/upload-background', verifyToken, upload.single('background'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  if (!req.file) return res.status(400).json({ msg: 'فشل في رفع الصورة' });
  user.background = '/uploads/' + req.file.filename;
  saveUsers();
  res.json({ background: user.background });
});

// عدد المتصلين في الغرف (اختياري)
app.get('/room-counts', (req, res) => {
  res.json(roomCounts);
});

// =======================
//       Socket.io
// =======================

io.on('connection', socket => {
  let currentRoom = null;
  let username = null;

  // الانضمام للغرفة
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

      // إرسال قائمة المتصلين + رسالة النظام
      io.to(room).emit('update users', roomUsers[room]);
      io.to(room).emit('system message', `${username} انضم إلى الغرفة`);

      // إرسال آخر 100 رسالة للشخص الجديد
      socket.emit('previous messages', roomMessages[room] || []);

    } catch (e) {
      console.log('توكن غير صالح في الـ join');
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
        avatar: avatar,
        timestamp: new Date().toISOString()
      };

      roomMessages[currentRoom].push(messageObj);
      if (roomMessages[currentRoom].length > 100) {
        roomMessages[currentRoom].shift(); // حذف أقدم رسالة
      }

      io.to(currentRoom).emit('message', messageObj);

    } catch (e) {
      console.log('توكن غير صالح في الرسالة');
    }
  });

  // عند قطع الاتصال (خروج)
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
  console.log('✅ السيرفر يعمل بنجاح على port ' + PORT);
  console.log('   الرابط: http://localhost:' + PORT);
  console.log('=====================================');
});
