// =======================
// Imports & Setup
// =======================
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

const upload = multer({ dest: 'uploads/' });

const PORT = 3000;
const secret = 'secretkey';

// =======================
// Middlewares
// =======================
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// =======================
// Data
// =======================
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

// =======================
// Ranks
// =======================
const RANKS = ['ضيف', 'عضو', 'بريميوم', 'أدمن', 'صاحب الموقع'];

// =======================
// Users Load / Save
// =======================
function saveUsers() {
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

function loadUsers() {
  if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json'));
  }

  // إنشاء حساب صاحب الموقع تلقائيًا
  if (!users.find(u => u.username === 'mohamed-dz')) {
    users.push({
      username: 'mohamed-dz',
      passwordHash: bcrypt.hashSync('mohokok12', 10),
      avatar: '',
      background: '',
      friends: [],
      rank: 'صاحب الموقع'
    });
    saveUsers();
    console.log('✅ تم إنشاء حساب صاحب الموقع (mohamed-dz)');
  }
}

loadUsers();

// =======================
// Auth Middleware
// =======================
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ msg: 'لا يوجد توكن' });

  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch {
    res.status(401).json({ msg: 'توكن غير صالح' });
  }
};

// =======================
// Auth Routes
// =======================
app.post('/register', (req, res) => {
  const { username, password } = req.body;

  if (users.find(u => u.username === username))
    return res.status(400).json({ msg: 'المستخدم موجود' });

  users.push({
    username,
    passwordHash: bcrypt.hashSync(password, 10),
    avatar: '',
    background: '',
    friends: [],
    rank: 'ضيف'
  });

  saveUsers();
  res.json({ msg: 'تم التسجيل بنجاح' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);

  if (!user || !bcrypt.compareSync(password, user.passwordHash))
    return res.status(400).json({ msg: 'بيانات خاطئة' });

  const token = jwt.sign({ username }, secret, { expiresIn: '7d' });
  res.json({ token });
});

// =======================
// Profile
// =======================
app.get('/profile', verifyToken, (req, res) => {
  const user = users.find(u => u.username === req.user.username);

  res.json({
    username: user.username,
    avatar: user.avatar,
    background: user.background,
    friends: user.friends,
    rank: user.rank
  });
});

// =======================
// Uploads
// =======================
app.post('/upload-avatar', verifyToken, upload.single('avatar'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  if (req.file) user.avatar = '/uploads/' + req.file.filename;
  saveUsers();
  res.json({ avatar: user.avatar });
});

app.post('/upload-background', verifyToken, upload.single('background'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  if (req.file) user.background = '/uploads/' + req.file.filename;
  saveUsers();
  res.json({ background: user.background });
});

// =======================
// Change Rank (Owner only)
// =======================
app.post('/change-rank', verifyToken, (req, res) => {
  const changer = users.find(u => u.username === req.user.username);

  if (!changer || changer.rank !== 'صاحب الموقع')
    return res.status(403).json({ msg: 'غير مصرح' });

  const { targetUsername, newRank } = req.body;

  if (!RANKS.includes(newRank))
    return res.status(400).json({ msg: 'رتبة غير صالحة' });

  const target = users.find(u => u.username === targetUsername);
  if (!target) return res.status(404).json({ msg: 'المستخدم غير موجود' });

  target.rank = newRank;
  saveUsers();

  io.emit('rank update', { username: targetUsername, rank: newRank });
  res.json({ msg: 'تم تغيير الرتبة بنجاح' });
});

// =======================
// Socket.io
// =======================
io.on('connection', socket => {
  socket.user = null;
  socket.currentRoom = null;

  socket.on('join', (room, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      socket.user = decoded.username;

      if (socket.currentRoom) {
        socket.leave(socket.currentRoom);
        roomCounts[socket.currentRoom]--;
        roomUsers[socket.currentRoom] =
          roomUsers[socket.currentRoom].filter(u => u.username !== socket.user);
      }

      socket.currentRoom = room;
      socket.join(room);
      roomCounts[room]++;

      const user = users.find(u => u.username === socket.user);
      roomUsers[room].push({
        username: socket.user,
        avatar: user?.avatar || 'https://via.placeholder.com/40'
      });

      io.to(room).emit('update users', roomUsers[room]);
      io.to(room).emit('system message', `${socket.user} انضم إلى الغرفة`);
    } catch {
      console.log('❌ توكن غير صالح');
    }
  });

  socket.on('message', (msg, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      const user = users.find(u => u.username === decoded.username);

      io.to(socket.currentRoom).emit('message', {
        username: decoded.username,
        msg,
        avatar: user?.avatar || 'https://via.placeholder.com/40'
      });
    } catch {}
  });

  socket.on('private message', ({ to, msg }) => {
    if (!socket.user) return;

    const senderUser = users.find(u => u.username === socket.user);
    const avatar = senderUser?.avatar || 'https://via.placeholder.com/40';

    socket.emit('private message', { from: socket.user, msg, avatar });

    for (let [, s] of io.sockets.sockets) {
      if (s.user === to) {
        s.emit('private message', { from: socket.user, msg, avatar });
      }
    }
  });

  socket.on('disconnect', () => {
    if (socket.currentRoom && socket.user) {
      roomCounts[socket.currentRoom]--;
      roomUsers[socket.currentRoom] =
        roomUsers[socket.currentRoom].filter(u => u.username !== socket.user);

      io.to(socket.currentRoom).emit('update users', roomUsers[socket.currentRoom]);
      io.to(socket.currentRoom).emit('system message', `${socket.user} غادر الغرفة`);
    }
  });
});

// =======================
// Start Server
// =======================
http.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================');
  console.log(`✅ السيرفر يعمل على http://localhost:${PORT}`);
  console.log('=====================================');
});
