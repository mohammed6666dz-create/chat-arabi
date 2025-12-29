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

// تأكد من وجود مجلد uploads
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);

const upload = multer({ dest: uploadDir });

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

let users = [];
let roomUsers = { general: [], algeria: [], all_countries: [] };
let roomCounts = { general: 0, algeria: 0, all_countries: 0 };

// حفظ آخر 100 رسالة لكل غرفة
let roomMessages = { general: [], algeria: [], all_countries: [] };

const secret = 'secretkey';
const PORT = 3000;

function loadUsers() {
  if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json'));
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
  users.push({ username, passwordHash, avatar: '', background: '', friends: [] });
  saveUsers();
  res.json({ msg: 'تم التسجيل بنجاح' });
});

// Login
app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) return res.status(400).json({ msg: 'بيانات خاطئة' });
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
  res.json(user || {});
});

// Upload avatar
app.post('/upload-avatar', verifyToken, upload.single('avatar'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  if (!req.file) return res.status(400).json({ msg: 'فشل في رفع الصورة: لم يتم استلام الملف' });

  user.avatar = '/uploads/' + req.file.filename;
  saveUsers();
  res.json({ avatar: user.avatar });
});

// Upload background
app.post('/upload-background', verifyToken, upload.single('background'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  if (!req.file) return res.status(400).json({ msg: 'فشل في رفع الصورة: لم يتم استلام الملف' });

  user.background = '/uploads/' + req.file.filename;
  saveUsers();
  res.json({ background: user.background });
});

// Room counts
app.get('/room-counts', (req, res) => {
  res.json(roomCounts);
});

// Socket.io
io.on('connection', socket => {
  let currentRoom = null;
  let username = null;

  socket.on('join', (room, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      username = decoded.username;

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
      socket.emit('previous messages', roomMessages[room] || []);

    } catch (e) {
      console.log('توكن غير صالح في الـ join');
    }
  });

  socket.on('message', (msg, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      const senderUsername = decoded.username;
      const user = users.find(u => u.username === senderUsername);
      const avatar = user?.avatar || 'https://via.placeholder.com/40';

      if (!currentRoom) return;

      const messageObj = {
        username: senderUsername,
        msg: msg.trim(),
        avatar: avatar,
        timestamp: new Date().toISOString()
      };

      roomMessages[currentRoom].push(messageObj);
      if (roomMessages[currentRoom].length > 100) roomMessages[currentRoom].shift();

      io.to(currentRoom).emit('message', messageObj);

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
  console.log('🚀 افتح الشات من الرابط:');
  console.log(` http://localhost:${PORT}/index.html`);
  console.log('=====================================');
});
