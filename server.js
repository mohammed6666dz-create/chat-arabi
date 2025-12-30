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

// إعدادات الملفات
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir);
const upload = multer({ dest: uploadDir });

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(uploadDir));

const secret = 'secretkey_very_important_change_later';
const PORT = 3000;

// البيانات (ملفات json - للتطوير فقط، في الإنتاج استخدم MongoDB أو PostgreSQL)
let users = [];
let roomUsers = { general: [], algeria: [], all_countries: [] };
let roomCounts = { general: 0, algeria: 0, all_countries: 0 };
let roomMessages = { general: [], algeria: [], all_countries: [] };

function loadUsers() {
  if (fs.existsSync('users.json')) {
    users = JSON.parse(fs.readFileSync('users.json', 'utf8'));
  }
}
loadUsers();

function saveUsers() {
  fs.writeFileSync('users.json', JSON.stringify(users, null, 2));
}

// ─── Routes ─────────────────────────────────────────────────────────────

app.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ msg: 'اسم المستخدم موجود مسبقاً' });
  }
  const passwordHash = bcrypt.hashSync(password, 10);
  const newUser = {
    id: Date.now().toString(), // معرف مؤقت - في الواقع استخدم uuid
    username,
    passwordHash,
    avatar: '',
    background: '',
    friends: [],             // قائمة الأصدقاء
    friendRequests: [],      // طلبات الصداقة الواردة {fromId, fromUsername, timestamp}
    sentRequests: [],        // طلبات مرسلة (اختياري)
    privateMessages: {}      // {otherUserId: [{from, to, msg, time}, ...]}
  };
  users.push(newUser);
  saveUsers();
  res.json({ msg: 'تم التسجيل بنجاح' });
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
    return res.status(400).json({ msg: 'بيانات الدخول غير صحيحة' });
  }
  const token = jwt.sign({ username, id: user.id }, secret, { expiresIn: '7d' });
  res.json({ token });
});

const verifyToken = (req, res, next) => {
  const auth = req.headers.authorization;
  if (!auth) return res.status(401).json({ msg: 'Token مطلوب' });
  try {
    const token = auth.split(' ')[1] || auth;
    req.user = jwt.verify(token, secret);
    next();
  } catch (e) {
    res.status(401).json({ msg: 'Token غير صالح' });
  }
};

app.get('/profile', verifyToken, (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  if (!user) return res.status(404).json({ msg: 'المستخدم غير موجود' });
  res.json({
    id: user.id,
    username: user.username,
    avatar: user.avatar,
    background: user.background,
    friends: user.friends
  });
});

// رفع الصور (avatar & background) - موجودة سابقاً
app.post('/upload-avatar', verifyToken, upload.single('avatar'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  if (!req.file) return res.status(400).json({ msg: 'لم يتم رفع ملف' });
  user.avatar = '/uploads/' + req.file.filename;
  saveUsers();
  res.json({ avatar: user.avatar });
});

app.post('/upload-background', verifyToken, upload.single('background'), (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  if (!req.file) return res.status(400).json({ msg: 'لم يتم رفع ملف' });
  user.background = '/uploads/' + req.file.filename;
  saveUsers();
  res.json({ background: user.background });
});

// ─── Socket.io ──────────────────────────────────────────────────────────

io.on('connection', socket => {
  let currentRoom = null;
  let currentUser = null; // {id, username}

  // الانضمام للغرفة
  socket.on('join', (room, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      currentUser = { id: decoded.id, username: decoded.username };
      if (currentRoom) {
        socket.leave(currentRoom);
        roomCounts[currentRoom]--;
        roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.id !== currentUser.id);
        io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
        io.to(currentRoom).emit('system message', `${currentUser.username} غادر الغرفة`);
      }

      currentRoom = room;
      socket.join(room);
      roomCounts[room] = (roomCounts[room] || 0) + 1;

      const avatar = users.find(u => u.id === currentUser.id)?.avatar || 'https://via.placeholder.com/40';
      const userObj = { id: currentUser.id, username: currentUser.username, avatar };
      roomUsers[room] = roomUsers[room] || [];
      roomUsers[room].push(userObj);

      io.to(room).emit('update users', roomUsers[room]);
      io.to(room).emit('system message', `${currentUser.username} انضم إلى الغرفة`);
      socket.emit('previous messages', roomMessages[room] || []);
    } catch (e) {
      socket.emit('error', 'توكن غير صالح');
    }
  });

  // رسالة عامة في الغرفة
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

    roomMessages[currentRoom] = roomMessages[currentRoom] || [];
    roomMessages[currentRoom].push(messageObj);
    if (roomMessages[currentRoom].length > 100) roomMessages[currentRoom].shift();

    io.to(currentRoom).emit('message', messageObj);
  });

  // ─── رسائل خاصة ─────────────────────────────────────────────────────
  socket.on('privateMessage', ({ toUserId, message }) => {
    if (!currentUser || !toUserId || !message?.trim()) return;

    const receiver = users.find(u => u.id === toUserId);
    if (!receiver) return;

    const msgObj = {
      from: { id: currentUser.id, username: currentUser.username },
      message: message.trim(),
      timestamp: new Date().toISOString()
    };

    // حفظ الرسائل (لكل طرف)
    receiver.privateMessages = receiver.privateMessages || {};
    receiver.privateMessages[currentUser.id] = receiver.privateMessages[currentUser.id] || [];
    receiver.privateMessages[currentUser.id].push(msgObj);

    const sender = users.find(u => u.id === currentUser.id);
    sender.privateMessages = sender.privateMessages || {};
    sender.privateMessages[toUserId] = sender.privateMessages[toUserId] || [];
    sender.privateMessages[toUserId].push({ ...msgObj, isSent: true });

    // إرسال للمستلم فقط
    const receiverSocket = findSocketByUserId(toUserId);
    if (receiverSocket) {
      receiverSocket.emit('privateMessage', {
        from: { id: currentUser.id, username: currentUser.username, avatar: sender?.avatar },
        message: msgObj.message,
        timestamp: msgObj.timestamp
      });
    }

    saveUsers();
  });

  // ─── طلبات الصداقة ──────────────────────────────────────────────────
  socket.on('sendFriendRequest', ({ toUserId }) => {
    if (!currentUser || !toUserId) return;
    if (toUserId === currentUser.id) return;

    const receiver = users.find(u => u.id === toUserId);
    if (!receiver) return;

    // منع التكرار
    if (receiver.friendRequests?.some(r => r.fromId === currentUser.id)) return;

    const request = {
      fromId: currentUser.id,
      fromUsername: currentUser.username,
      timestamp: new Date().toISOString()
    };

    receiver.friendRequests = receiver.friendRequests || [];
    receiver.friendRequests.push(request);

    // إشعار المستلم
    const receiverSocket = findSocketByUserId(toUserId);
    if (receiverSocket) {
      receiverSocket.emit('friendRequest', request);
    }

    saveUsers();
  });

  socket.on('acceptFriendRequest', ({ fromUserId }) => {
    if (!currentUser || !fromUserId) return;

    const user = users.find(u => u.id === currentUser.id);
    const sender = users.find(u => u.id === fromUserId);

    if (!user || !sender) return;

    // إزالة الطلب
    user.friendRequests = user.friendRequests.filter(r => r.fromId !== fromUserId);

    // إضافة صداقة متبادلة
    if (!user.friends.includes(fromUserId)) user.friends.push(fromUserId);
    if (!sender.friends.includes(currentUser.id)) sender.friends.push(currentUser.id);

    // إشعار المرسل
    const senderSocket = findSocketByUserId(fromUserId);
    if (senderSocket) {
      senderSocket.emit('friendRequestAccepted', {
        by: { id: currentUser.id, username: currentUser.username }
      });
    }

    saveUsers();
  });

  // ─── مساعدة لإيجاد socket حسب user id ──────────────────────────────
  function findSocketByUserId(userId) {
    for (let [id, sock] of io.sockets.sockets) {
      if (sock.currentUser?.id === userId) {
        return sock;
      }
    }
    return null;
  }

  // عند قطع الاتصال
  socket.on('disconnect', () => {
    if (currentRoom && currentUser) {
      roomCounts[currentRoom]--;
      roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.id !== currentUser.id);
      io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
      io.to(currentRoom).emit('system message', `${currentUser.username} غادر الغرفة`);
    }
  });
});

// تشغيل السيرفر
http.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================');
  console.log('✅ السيرفر يعمل على port', PORT);
  console.log('   http://localhost:' + PORT);
  console.log('=====================================');
});
