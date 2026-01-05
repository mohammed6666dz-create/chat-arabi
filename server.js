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

  // ────────────────────────────────────────────────
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
  }
  // ────────────────────────────────────────────────
}

loadUsers();

function saveUsers() {
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

// Register
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
    friends: [],
    rank: 'ضيف'
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

  if (!token) {
    return res.status(401).json({ msg: 'لا توكن' });
  }

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
    passwordHash: user.passwordHash,
    avatar: user.avatar,
    background: user.background,
    friends: user.friends,
    rank: user.rank || 'ضيف'
  });
});

// Upload avatar
app.post('/upload-avatar', verifyToken, upload.single('avatar'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);

  if (req.file) {
    user.avatar = '/uploads/' + req.file.filename;
  }

  saveUsers();
  res.json({ avatar: user.avatar });
});

// Upload background
app.post('/upload-background', verifyToken, upload.single('background'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);

  if (req.file) {
    user.background = '/uploads/' + req.file.filename;
  }

  saveUsers();
  res.json({ background: user.background });
});

// Room counts
app.get('/room-counts', (req, res) => {
  res.json(roomCounts);
});

// ────────────────────────────────────────────────
// إضافة: تغيير رتبة مستخدم (لصاحب الموقع فقط)
app.post('/change-rank', verifyToken, (req, res) => {
  const changer = users.find(u => u.username === req.user.username);

  if (!changer || changer.rank !== 'صاحب الموقع') {
    return res.status(403).json({ msg: 'غير مصرح لك' });
  }

  const { targetUsername, newRank } = req.body;

  if (!['ضيف', 'عضو', 'بريميوم', 'أدمن', 'صاحب الموقع'].includes(newRank)) {
    return res.status(400).json({ msg: 'رتبه غير صالحة' });
  }

  const target = users.find(u => u.username === targetUsername);
  if (!target) {
    return res.status(404).json({ msg: 'المستخدم غير موجود' });
  }

  target.rank = newRank;
  saveUsers();

  io.emit('rank update', { username: targetUsername, rank: newRank });
  res.json({ msg: 'تم تغيير الرتبه بنجاح' });
});

// ────────────────────────────────────────────────
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
        io.to(currentRoom).emit('system message', ${username} غادر الغرفة);
      }

      currentRoom = room;
      socket.join(room);
      roomCounts[room]++;

      const user = users.find(u => u.username === username);
      const avatar = user?.avatar || 'https://via.placeholder.com/40';

      roomUsers[room].push({ username, avatar });
      io.to(room).emit('update users', roomUsers[room]);
      io.to(room).emit('system message', ${username} انضم إلى الغرفة);
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
    } catch (e) {}
  });

  // ────────────────────────────────────────────────
  // الرسائل الخاصة (الإضافة الجديدة فقط)
  socket.on('private message', ({ to, msg }) => {
    try {
      const decoded = jwt.verify(token, secret);
      const sender = decoded.username;
      const senderUser = users.find(u => u.username === sender);
      const avatar = senderUser?.avatar || 'https://via.placeholder.com/40';

      socket.emit('private message', { from: sender, msg, avatar });

      io.sockets.sockets.forEach(s => {
        if (s.decoded && s.decoded.username === to) {
          s.emit('private message', { from: sender, msg, avatar });
        }
      });
    } catch (e) {
      console.log('خطأ في الرسالة الخاصة:', e);
    }
  });
  // ────────────────────────────────────────────────

  socket.on('disconnect', () => {
    if (currentRoom && username) {
      roomCounts[currentRoom]--;
      roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.username !== username);
      io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
      io.to(currentRoom).emit('system message', ${username} غادر الغرفة);
    }
  });
});

// تشغيل السيرفر مع عرض الرابط الجاهز
http.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================');
  console.log('✅ السيرفر يعمل بنجاح على port ' + PORT);
  console.log('');
  console.log('🚀 افتح الشات من الرابط ده مباشرة:');
  console.log(http://localhost:${PORT}/index.html);
  console.log('');
  console.log(' أو اضغط Ctrl + Click على الرابط فوق 👆');
  console.log('=====================================');
});
