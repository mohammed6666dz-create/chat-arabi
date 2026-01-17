const express = require('express');
<<<<<<< HEAD
const app = express();
=======
const { Pool } = require('pg');
>>>>>>> 125a297cfb0ed788f1afb5268fa28a834a304fcd
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');

<<<<<<< HEAD
=======
const app = express();
>>>>>>> 125a297cfb0ed788f1afb5268fa28a834a304fcd
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

<<<<<<< HEAD
let users = [];
let roomUsers = { general: [], algeria: [], all_countries: [] };
let roomCounts = { general: 0, algeria: 0, all_countries: 0 };
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
=======
// ────────────────────────────────────────────────
// إعداد الاتصال بقاعدة البيانات
// ────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://chatuser:7SWSCDSgIX1QzoAoKnsbERUTj7WwikkN@dpg-d5b5jj4hg0os73da0tq0-a/chatdb_mto1',
  ssl: { rejectUnauthorized: false }
});

// إنشاء الجدول إذا ما كان موجود
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id              SERIAL PRIMARY KEY,
        username        TEXT UNIQUE NOT NULL,
        password_hash   TEXT NOT NULL,
        rank            TEXT DEFAULT 'ضيف',
        avatar          TEXT DEFAULT '',
        background      TEXT DEFAULT '',
        friends         JSONB DEFAULT '[]'::jsonb,
        friend_requests JSONB DEFAULT '[]'::jsonb,
        sent_requests   JSONB DEFAULT '[]'::jsonb,
        notifications   JSONB DEFAULT '[]'::jsonb,
        created_at      TIMESTAMPTZ DEFAULT NOW()
      );
    `);
    console.log('✓ جدول users جاهز');
  } catch (err) {
    console.error('خطأ في إنشاء الجدول:', err);
  }
}

initDatabase();

// ────────────────────────────────────────────────
// المتغيرات المؤقتة (اللي ما تحتاج حفظ دائم)
let roomUsers = { general: [], algeria: [], all_countries: [] };
let roomCounts = { general: 0, algeria: 0, all_countries: 0 };

// الرتب المتاحة
const RANKS = ['ضيف', 'عضو', 'بريميوم', 'أدمن', 'صاحب الموقع'];

const secret = 'secretkey';
const PORT = process.env.PORT || 3000;

// ────────────────────────────────────────────────
// دوال مساعدة للتعامل مع قاعدة البيانات
// ────────────────────────────────────────────────
async function getUser(username) {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    return rows[0] || null;
  } catch (err) {
    console.error('خطأ في جلب المستخدم:', err);
    return null;
  }
}

async function createUser(username, passwordHash) {
  try {
    await pool.query(
      `INSERT INTO users (username, password_hash, rank)
       VALUES ($1, $2, 'ضيف')`,
      [username, passwordHash]
    );
    return true;
  } catch (err) {
    if (err.code === '23505') return false; // duplicate
    console.error('خطأ في إنشاء مستخدم:', err);
    return false;
  }
}

async function updateUserFields(username, updates) {
  if (!Object.keys(updates).length) return false;

  const setParts = [];
  const values = [];
  let i = 1;

  for (const [key, value] of Object.entries(updates)) {
    setParts.push(`${key} = $${i}`);
    values.push(value);
    i++;
  }

  values.push(username);
  const query = `UPDATE users SET ${setParts.join(', ')} WHERE username = $${i}`;

  try {
    await pool.query(query, values);
    return true;
  } catch (err) {
    console.error('خطأ في تحديث المستخدم:', err);
    return false;
  }
}

// ────────────────────────────────────────────────
// Routes
// ────────────────────────────────────────────────

app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ msg: 'يجب إدخال اسم المستخدم وكلمة المرور' });
  }

  const exists = await getUser(username);
  if (exists) return res.status(400).json({ msg: 'المستخدم موجود مسبقاً' });

  const passwordHash = bcrypt.hashSync(password, 10);

  const success = await createUser(username, passwordHash);
  if (!success) {
    return res.status(500).json({ msg: 'خطأ في التسجيل' });
  }

  res.json({ msg: 'تم التسجيل بنجاح' });
});

app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  const user = await getUser(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(400).json({ msg: 'بيانات خاطئة' });
  }

>>>>>>> 125a297cfb0ed788f1afb5268fa28a834a304fcd
  const token = jwt.sign({ username }, secret, { expiresIn: '7d' });
  res.json({ token });
});

const verifyToken = (req, res, next) => {
<<<<<<< HEAD
  const token = req.headers.authorization;
  if (!token) return res.status(401).json({ msg: 'لا توكن' });
=======
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ msg: 'لا يوجد توكن' });

  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;

>>>>>>> 125a297cfb0ed788f1afb5268fa28a834a304fcd
  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch (e) {
    res.status(401).json({ msg: 'توكن غير صالح' });
  }
};

<<<<<<< HEAD
// Profile
app.get('/profile', verifyToken, (req, res) => {
  const user = users.find(u => u.username === req.user.username);
  res.json(user || {});
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
=======
app.get('/profile', verifyToken, async (req, res) => {
  const user = await getUser(req.user.username);
  if (!user) return res.status(404).json({ msg: 'المستخدم غير موجود' });

  res.json({
    username: user.username,
    avatar: user.avatar,
    background: user.background,
    friends: user.friends,
    rank: user.rank || 'ضيف'
  });
});

app.post('/upload-avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ msg: 'لم يتم رفع أي ملف' });

  const avatarPath = '/uploads/' + req.file.filename;
  const success = await updateUserFields(req.user.username, { avatar: avatarPath });

  if (!success) {
    return res.status(500).json({ msg: 'خطأ في حفظ الصورة' });
  }

  res.json({ avatar: avatarPath });
});

app.post('/upload-background', verifyToken, upload.single('background'), async (req, res) => {
  if (!req.file) return res.status(400).json({ msg: 'لم يتم رفع أي ملف' });

  const bgPath = '/uploads/' + req.file.filename;
  const success = await updateUserFields(req.user.username, { background: bgPath });

  if (!success) {
    return res.status(500).json({ msg: 'خطأ في حفظ الخلفية' });
  }

  res.json({ background: bgPath });
});

>>>>>>> 125a297cfb0ed788f1afb5268fa28a834a304fcd
app.get('/room-counts', (req, res) => {
  res.json(roomCounts);
});

<<<<<<< HEAD
// Socket.io
=======
app.post('/change-rank', verifyToken, async (req, res) => {
  const changer = await getUser(req.user.username);
  if (!changer || changer.rank !== 'صاحب الموقع') {
    return res.status(403).json({ msg: 'غير مصرح لك' });
  }

  const { targetUsername, newRank } = req.body;
  if (!RANKS.includes(newRank)) {
    return res.status(400).json({ msg: 'رتبة غير صالحة' });
  }

  const target = await getUser(targetUsername);
  if (!target) return res.status(404).json({ msg: 'المستخدم غير موجود' });

  const success = await updateUserFields(targetUsername, { rank: newRank });
  if (!success) return res.status(500).json({ msg: 'خطأ في تغيير الرتبة' });

  io.emit('rank update', { username: targetUsername, rank: newRank });
  res.json({ msg: 'تم تغيير الرتبة بنجاح' });
});

// ────────────────────────────────────────────────
// Socket.IO
// ────────────────────────────────────────────────

>>>>>>> 125a297cfb0ed788f1afb5268fa28a834a304fcd
io.on('connection', socket => {
  let currentRoom = null;
  let username = null;

<<<<<<< HEAD
  socket.on('join', (room, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      username = decoded.username;
=======
  socket.on('join', async (room, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      username = decoded.username;
      socket.username = username;
>>>>>>> 125a297cfb0ed788f1afb5268fa28a834a304fcd

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
<<<<<<< HEAD
      const user = users.find(u => u.username === username);
=======

      const user = await getUser(username);
>>>>>>> 125a297cfb0ed788f1afb5268fa28a834a304fcd
      const avatar = user?.avatar || 'https://via.placeholder.com/40';

      roomUsers[room].push({ username, avatar });
      io.to(room).emit('update users', roomUsers[room]);
      io.to(room).emit('system message', `${username} انضم إلى الغرفة`);
<<<<<<< HEAD

    } catch (e) {
      console.log('توكن غير صالح');
    }
  });

  socket.on('message', (msg, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      const user = users.find(u => u.username === decoded.username);
      const avatar = user?.avatar || 'https://via.placeholder.com/40';
      io.to(currentRoom).emit('message', { username: decoded.username, msg, avatar });
    } catch (e) {}
  });

=======
    } catch (e) {
      console.log('توكن غير صالح في join');
    }
  });

  socket.on('message', async (msg, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      const user = await getUser(decoded.username);
      if (!user) return;

      const avatar = user.avatar || 'https://via.placeholder.com/40';

      io.to(currentRoom).emit('message', {
        username: decoded.username,
        msg,
        avatar
      });
    } catch (e) {}
  });

  // طلب صداقة
  socket.on('send friend request', async (targetUsername) => {
    if (!socket.username || socket.username === targetUsername) return;

    const [sender, target] = await Promise.all([
      getUser(socket.username),
      getUser(targetUsername)
    ]);

    if (!sender || !target) return;

    if (
      sender.sent_requests.includes(targetUsername) ||
      target.friend_requests.includes(socket.username) ||
      sender.friends.includes(targetUsername)
    ) return;

    // إضافة للطلبات
    await pool.query(
      'UPDATE users SET ' +
      'friend_requests = friend_requests || $1::text, ' +
      'sent_requests = sent_requests || $2::text ' +
      'WHERE username = $3',
      [socket.username, targetUsername, targetUsername]
    );

    await pool.query(
      'UPDATE users SET sent_requests = sent_requests || $1::text WHERE username = $2',
      [targetUsername, socket.username]
    );

    sendNotification(targetUsername, {
      type: 'friend_request',
      from: socket.username,
      message: `${socket.username} أرسل لك طلب صداقة`,
      time: new Date().toISOString()
    });

    socket.emit('request_sent', targetUsername);
  });

  // قبول طلب
  socket.on('accept friend request', async (fromUsername) => {
    const acceptor = socket.username;

    const [acceptorUser, senderUser] = await Promise.all([
      getUser(acceptor),
      getUser(fromUsername)
    ]);

    if (!acceptorUser || !senderUser) return;

    // إزالة الطلبات + إضافة صداقة
    await pool.query(
      `UPDATE users 
       SET friend_requests = friend_requests - $1::text,
           friends = friends || $1::text
       WHERE username = $2`,
      [fromUsername, acceptor]
    );

    await pool.query(
      `UPDATE users 
       SET sent_requests = sent_requests - $1::text,
           friends = friends || $1::text
       WHERE username = $2`,
      [acceptor, fromUsername]
    );

    sendNotification(fromUsername, {
      type: 'friend_accepted',
      from: acceptor,
      message: `${acceptor} قبل طلب الصداقة`,
      time: new Date().toISOString()
    });

    socket.emit('friend_accepted', fromUsername);
  });

  // رفض طلب
  socket.on('reject friend request', async (fromUsername) => {
    const rejector = socket.username;

    await pool.query(
      'UPDATE users SET friend_requests = friend_requests - $1::text WHERE username = $2',
      [fromUsername, rejector]
    );

    await pool.query(
      'UPDATE users SET sent_requests = sent_requests - $1::text WHERE username = $2',
      [rejector, fromUsername]
    );

    socket.emit('request_rejected', fromUsername);
  });

  // رسالة خاصة
  socket.on('private message', async ({ to, text }) => {
    const from = socket.username;
    if (!from || !to || !text?.trim()) return;

    const message = {
      from,
      to,
      text,
      time: new Date().toISOString(),
      seen: false
    };

    // إرسال للطرفين
    for (const s of io.sockets.sockets.values()) {
      if (s.username === from || s.username === to) {
        s.emit('private message', message);
      }
    }

    // إشعار إذا كان الطرف الآخر غير متصل
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

>>>>>>> 125a297cfb0ed788f1afb5268fa28a834a304fcd
  socket.on('disconnect', () => {
    if (currentRoom && username) {
      roomCounts[currentRoom]--;
      roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.username !== username);
      io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
      io.to(currentRoom).emit('system message', `${username} غادر الغرفة`);
    }
<<<<<<< HEAD
  });
});

// تشغيل السيرفر مع عرض الرابط الجاهز
http.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================');
  console.log('✅ السيرفر يعمل بنجاح على port ' + PORT);
  console.log('');
  console.log('🚀 افتح الشات من الرابط ده مباشرة:');
  console.log(`   http://localhost:${PORT}/index.html`);
  console.log('');
  console.log('   أو اضغط Ctrl + Click على الرابط فوق 👆');
  console.log('=====================================');
});
=======
    socket.username = null;
  });
});

async function sendNotification(toUsername, notification) {
  try {
    await pool.query(
      'UPDATE users SET notifications = notifications || $1::jsonb WHERE username = $2',
      [JSON.stringify(notification), toUsername]
    );

    // إرسال فوري إذا كان متصل
    for (const socket of io.sockets.sockets.values()) {
      if (socket.username === toUsername) {
        socket.emit('new notification', notification);
        break;
      }
    }
  } catch (err) {
    console.error('خطأ في إرسال الإشعار:', err);
  }
}

// ────────────────────────────────────────────────
// تشغيل السيرفر
// ────────────────────────────────────────────────

http.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================');
  console.log('✅ السيرفر يعمل بنجاح على port ' + PORT);
  console.log('   (مع قاعدة بيانات PostgreSQL)');
  console.log('');
  console.log('افتح الشات من:');
  console.log(`http://localhost:${PORT}/index.html`);
  console.log('=====================================');
});
>>>>>>> 125a297cfb0ed788f1afb5268fa28a834a304fcd
