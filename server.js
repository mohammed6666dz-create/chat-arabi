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

// حفظ آخر 100 رسالة لكل غرفة
const MAX_MESSAGES_PER_ROOM = 100;
const roomMessages = {
  general: [],
  algeria: [],
  all_countries: []
};

const secret = 'mySuperSecretKey123'; // غيرها لكلمة سر قوية خاصة بيك
const PORT = process.env.PORT || 3000;

function loadUsers() {
  if (fs.existsSync('users.json')) {
    const data = fs.readFileSync('users.json', 'utf8').trim();
    if (!data) {
      users = [];
    } else {
      try {
        users = JSON.parse(data);
      } catch (e) {
        console.error('خطأ في تحليل users.json:', e.message);
        users = [];
      }
    }
  } else {
    users = [];
  }
}
loadUsers();

function saveUsers() {
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

// تسجيل حساب جديد
app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ msg: 'المستخدم موجود' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  users.push({ username, passwordHash, avatar: '', background: '', friends: [] });
  saveUsers();
  console.log(`تم إنشاء حساب جديد: ${username}`);
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

// التحقق من التوكن (Middleware)
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
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

// رفع الصورة الشخصية
app.post('/upload-avatar', verifyToken, upload.single('avatar'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  if (req.file) {
    if (user.avatar && fs.existsSync(path.join(__dirname, 'uploads', path.basename(user.avatar)))) {
      fs.unlinkSync(path.join(__dirname, 'uploads', path.basename(user.avatar)));
    }
    user.avatar = '/uploads/' + req.file.filename;
    saveUsers();
  }
  res.json({ avatar: user.avatar });
});

// رفع الخلفية
app.post('/upload-background', verifyToken, upload.single('background'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  if (req.file) {
    user.background = '/uploads/' + req.file.filename;
    saveUsers();
  }
  res.json({ background: user.background });
});

// Socket.io
io.on('connection', socket => {
  let currentRoom = null;
  let username = null;

  socket.on('join', (room, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      username = decoded.username;

      // مغادرة الغرفة السابقة إن وجدت
      if (currentRoom) {
        socket.leave(currentRoom);
        roomCounts[currentRoom]--;
        roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.username !== username);
        io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
        io.to(currentRoom).emit('system message', `${username} غادر الغرفة`);
      }

      // الانضمام للغرفة الجديدة
      currentRoom = room;
      socket.join(room);
      roomCounts[room]++;

      const user = users.find(u => u.username === username);
      const avatar = user?.avatar || 'https://via.placeholder.com/40';

      if (!roomUsers[room]) roomUsers[room] = [];
      roomUsers[room].push({ username, avatar });

      io.to(room).emit('update users', roomUsers[room]);
      socket.emit('system message', `انضممت إلى غرفة: ${room}`);
      socket.emit('previous messages', roomMessages[room] || []); // إرسال آخر 100 رسالة

      socket.to(room).emit('system message', `${username} انضم إلى الغرفة`);

    } catch (e) {
      console.log('توكن غير صالح في الانضمام');
      socket.disconnect();
    }
  });

  socket.on('message', (msg, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      const senderUsername = decoded.username;
      const user = users.find(u => u.username === senderUsername);
      const avatar = user?.avatar || 'https://via.placeholder.com/40';

      if (!currentRoom) return;

      // حفظ الرسالة (آخر 100 فقط)
      if (!roomMessages[currentRoom]) roomMessages[currentRoom] = [];
      roomMessages[currentRoom].push({
        username: senderUsername,
        msg,
        avatar,
        timestamp: Date.now()
      });

      if (roomMessages[currentRoom].length > MAX_MESSAGES_PER_ROOM) {
        roomMessages[currentRoom].shift(); // حذف أقدم رسالة
      }

      io.to(currentRoom).emit('message', { username: senderUsername, msg, avatar });

    } catch (e) {
      console.log('توكن غير صالح في الرسالة');
    }
  });

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
  console.log('');
  console.log('🚀 افتح الشات من الرابط ده:');
  console.log(`   http://localhost:${PORT}/chat.html?room=general`);
  console.log('=====================================');
});
