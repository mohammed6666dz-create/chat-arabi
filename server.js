require('dotenv').config();
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

// ────────────────────────────────────────────────
// إضافة mongoose وربط قاعدة البيانات
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGO_URI)
  .then(() => console.log('MongoDB متصل بنجاح'))
  .catch(err => console.error('فشل الاتصال بـ MongoDB:', err));

// نموذج User (بديل users.json)
const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  passwordHash: { type: String, required: true },
  avatar: { type: String, default: '' },
  background: { type: String, default: '' },
  friends: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  pendingSent: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  pendingReceived: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  rank: { type: String, default: 'ضيف' }
});

const User = mongoose.model('User', userSchema);

// نموذج الرسائل الخاصة
const privateMessageSchema = new mongoose.Schema({
  from: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  to: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  msg: { type: String, required: true },
  avatar: String,
  time: { type: Date, default: Date.now }
});

const PrivateMessage = mongoose.model('PrivateMessage', privateMessageSchema);

// ────────────────────────────────────────────────

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

let roomUsers = { general: [], algeria: [], all_countries: [] };
let roomCounts = { general: 0, algeria: 0, all_countries: 0 };

const RANKS = ['ضيف', 'عضو', 'بريميوم', 'أدمن', 'صاحب الموقع'];
const secret = process.env.JWT_SECRET || 'secretkey';
const PORT = 3000;

// ────────────────────────────────────────────────
// دالة لجلب المستخدم من MongoDB بدلاً من users.json
async function getUserByUsername(username) {
  return await User.findOne({ username });
}

// Register
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (await getUserByUsername(username)) {
    return res.status(400).json({ msg: 'المستخدم موجود' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const newUser = new User({
    username,
    passwordHash,
    rank: 'ضيف'
  });
  await newUser.save();
  res.json({ msg: 'تم التسجيل بنجاح' });
});

// Login
app.post('/login', async (req, res) => {
  const { username, password } = req.body;
  const user = await getUserByUsername(username);
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
app.get('/profile', verifyToken, async (req, res) => {
  const user = await getUserByUsername(req.user.username);
  if (!user) return res.status(404).json({ msg: 'المستخدم غير موجود' });
  res.json({
    username: user.username,
    avatar: user.avatar,
    background: user.background,
    friends: user.friends,
    rank: user.rank || 'ضيف'
  });
});

// Upload avatar & background (مع تعديل بسيط)
app.post('/upload-avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  const user = await getUserByUsername(req.user.username);
  if (req.file) user.avatar = '/uploads/' + req.file.filename;
  await user.save();
  res.json({ avatar: user.avatar });
});

app.post('/upload-background', verifyToken, upload.single('background'), async (req, res) => {
  const user = await getUserByUsername(req.user.username);
  if (req.file) user.background = '/uploads/' + req.file.filename;
  await user.save();
  res.json({ background: user.background });
});

// Room counts
app.get('/room-counts', (req, res) => {
  res.json(roomCounts);
});

// تغيير رتبة
app.post('/change-rank', verifyToken, async (req, res) => {
  const changer = await getUserByUsername(req.user.username);
  if (!changer || changer.rank !== 'صاحب الموقع') {
    return res.status(403).json({ msg: 'غير مصرح لك' });
  }
  const { targetUsername, newRank } = req.body;
  if (!RANKS.includes(newRank)) {
    return res.status(400).json({ msg: 'رتبه غير صالحة' });
  }
  const target = await getUserByUsername(targetUsername);
  if (!target) return res.status(404).json({ msg: 'المستخدم غير موجود' });
  target.rank = newRank;
  await target.save();
  io.emit('rank update', { username: targetUsername, rank: newRank });
  res.json({ msg: 'تم تغيير الرتبه بنجاح' });
});

// ────────────────────────────────────────────────
// Socket.io
// ────────────────────────────────────────────────

const userSocketMap = new Map(); // username → socket.id

io.on('connection', socket => {
  let currentRoom = null;
  let username = null;

  socket.on('join', async (room, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      username = decoded.username;
      const user = await getUserByUsername(username);
      if (!user) return;

      userSocketMap.set(username, socket.id);

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
      const avatar = user.avatar || 'https://via.placeholder.com/40';
      roomUsers[room].push({ username, avatar });
      io.to(room).emit('update users', roomUsers[room]);
      io.to(room).emit('system message', `${username} انضم إلى الغرفة`);
    } catch (e) {
      console.log('توكن غير صالح أو خطأ في join:', e);
    }
  });

  socket.on('message', async (msg, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      const user = await getUserByUsername(decoded.username);
      const avatar = user?.avatar || 'https://via.placeholder.com/40';
      io.to(currentRoom).emit('message', { username: decoded.username, msg, avatar });
    } catch (e) {}
  });

  // ────────────────────────────────────────────────
  // رسائل خاصة + حفظ في MongoDB
  // ────────────────────────────────────────────────
  socket.on('private message', async ({ to, msg }) => {
    if (!username) return;

    const senderUser = await getUserByUsername(username);
    const receiverUser = await getUserByUsername(to);

    if (!senderUser || !receiverUser) return;

    const messageDoc = new PrivateMessage({
      from: senderUser._id,
      to: receiverUser._id,
      msg,
      avatar: senderUser.avatar || 'https://via.placeholder.com/40'
    });
    await messageDoc.save();

    const payload = {
      from: username,
      to,
      msg,
      avatar: senderUser.avatar || 'https://via.placeholder.com/40',
      time: messageDoc.time
    };

    // للمرسل
    socket.emit('private message', { ...payload, isSelf: true });

    // للمستلم إذا متصل
    const receiverSocketId = userSocketMap.get(to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('private message', payload);
    }
  });

  // ────────────────────────────────────────────────
  // طلبات الصداقة + حفظ في MongoDB
  // ────────────────────────────────────────────────
  socket.on('send friend request', async ({ to }) => {
    if (!username || to === username) return;

    const sender = await getUserByUsername(username);
    const receiver = await getUserByUsername(to);

    if (!sender || !receiver) return;

    // تحقق وجود طلب سابق
    if (sender.pendingSent.includes(receiver._id) ||
        receiver.pendingReceived.includes(sender._id)) {
      return socket.emit('friend request error', { msg: 'طلب موجود مسبقاً' });
    }

    sender.pendingSent.push(receiver._id);
    receiver.pendingReceived.push(sender._id);

    await sender.save();
    await receiver.save();

    const receiverSocketId = userSocketMap.get(to);
    if (receiverSocketId) {
      io.to(receiverSocketId).emit('friend request received', {
        from: username,
        avatar: sender.avatar || 'https://via.placeholder.com/40'
      });
    }

    socket.emit('friend request sent', { to });
  });

  socket.on('respond friend request', async ({ from, accept }) => {
    if (!username) return;

    const responder = await getUserByUsername(username);
    const requester = await getUserByUsername(from);

    if (!responder || !requester) return;

    const reqIndex = responder.pendingReceived.indexOf(requester._id);
    if (reqIndex === -1) return;

    responder.pendingReceived.splice(reqIndex, 1);

    if (accept) {
      responder.friends.push(requester._id);
      requester.friends.push(responder._id);

      const sentIndex = requester.pendingSent.indexOf(responder._id);
      if (sentIndex !== -1) requester.pendingSent.splice(sentIndex, 1);

      await responder.save();
      await requester.save();

      const requesterSocketId = userSocketMap.get(from);
      if (requesterSocketId) {
        io.to(requesterSocketId).emit('friend added', { username });
      }
      socket.emit('friend added', { username: from });
    } else {
      // رفض → حذف فقط
      const sentIndex = requester.pendingSent.indexOf(responder._id);
      if (sentIndex !== -1) requester.pendingSent.splice(sentIndex, 1);
      await requester.save();
      await responder.save();
    }

    socket.emit('friend request response', { from, accept });
  });

  socket.on('disconnect', () => {
    if (username) {
      userSocketMap.delete(username);
    }
    if (currentRoom && username) {
      roomCounts[currentRoom]--;
      roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.username !== username);
      io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
      io.to(currentRoom).emit('system message', `${username} غادر الغرفة`);
    }
  });
});

http.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================');
  console.log('✅ السيرفر يعمل بنجاح على port ' + PORT);
  console.log(`http://localhost:${PORT}/index.html`);
  console.log('=====================================');
});
