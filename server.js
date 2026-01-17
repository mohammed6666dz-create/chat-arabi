const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
const fs = require('fs');
const path = require('path');
const bodyParser = require('body-parser');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ────────────────────────────────────────────────
// إعداد الاتصال بقاعدة البيانات
// ────────────────────────────────────────────────
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://chatuser:7SWSCDSgIX1QzoAoKnsbERUTj7WwikkN@dpg-d5b5jj4hg0os73da0tq0-a/chatdb_mto1',
  ssl: { rejectUnauthorized: false }
});

// إنشاء الجداول إذا ما كانت موجودة
async function initDatabase() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        rank TEXT DEFAULT 'ضيف',
        avatar TEXT DEFAULT '',
        background TEXT DEFAULT '',
        friends JSONB DEFAULT '[]'::jsonb,
        friend_requests JSONB DEFAULT '[]'::jsonb,
        sent_requests JSONB DEFAULT '[]'::jsonb,
        notifications JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE TABLE IF NOT EXISTS private_messages (
        id SERIAL PRIMARY KEY,
        from_user TEXT NOT NULL,
        to_user TEXT NOT NULL,
        message TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        seen_by TEXT[] DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_pm_users 
      ON private_messages (from_user, to_user);
    `);
    console.log('✓ الجداول جاهزة (users + private_messages)');
  } catch (err) {
    console.error('خطأ في تهيئة الجداول:', err);
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
  const token = jwt.sign({ username }, secret, { expiresIn: '7d' });
  res.json({ token });
});

const verifyToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ msg: 'لا يوجد توكن' });
  const token = authHeader.startsWith('Bearer ') ? authHeader.split(' ')[1] : authHeader;
  try {
    req.user = jwt.verify(token, secret);
    next();
  } catch (e) {
    res.status(401).json({ msg: 'توكن غير صالح' });
  }
};

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

app.get('/room-counts', (req, res) => {
  res.json(roomCounts);
});

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
io.on('connection', socket => {
  let currentRoom = null;
  let username = null;

  socket.on('join', async (room, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      username = decoded.username;
      socket.username = username;

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
      const user = await getUser(username);
      const avatar = user?.avatar || 'https://via.placeholder.com/40';
      roomUsers[room].push({ username, avatar });
      io.to(room).emit('update users', roomUsers[room]);
      io.to(room).emit('system message', `${username} انضم إلى الغرفة`);
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

  // ────────────────────── الرسائل الخاصة ──────────────────────

  // جلب آخر الرسائل بين شخصين (عند فتح الدردشة)
  socket.on('get private messages', async ({ withUser }) => {
    if (!socket.username || !withUser) return;

    try {
      const { rows } = await pool.query(`
        SELECT id, from_user, to_user, message, created_at,
               $1 = ANY(seen_by) AS seen
        FROM private_messages
        WHERE (from_user = $1 AND to_user = $2)
           OR (from_user = $2 AND to_user = $1)
        ORDER BY created_at ASC
        LIMIT 100
      `, [socket.username, withUser]);

      socket.emit('private messages history', {
        with: withUser,
        messages: rows.map(row => ({
          id: row.id,
          from: row.from_user,
          to: row.to_user,
          text: row.message,
          time: row.created_at.toISOString(),
          seen: row.seen
        }))
      });
    } catch (err) {
      console.error('خطأ جلب الرسائل الخاصة:', err);
    }
  });

  // إرسال رسالة خاصة + حفظها
  socket.on('private message', async ({ to, text }) => {
    const from = socket.username;
    if (!from || !to || !text?.trim() || from === to) return;

    try {
      const { rows } = await pool.query(`
        INSERT INTO private_messages 
        (from_user, to_user, message, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id, created_at
      `, [from, to, text.trim()]);

      const message = {
        id: rows[0].id,
        from,
        to,
        text: text.trim(),
        time: rows[0].created_at.toISOString(),
        seen: false
      };

      // إرسال للمرسل والمستقبل إذا متصلين
      for (const s of io.sockets.sockets.values()) {
        if (s.username === from || s.username === to) {
          s.emit('private message', message);
        }
      }

      // إشعار إذا الطرف الثاني غير متصل
      const isOnline = Array.from(io.sockets.sockets.values()).some(s => s.username === to);
      if (!isOnline) {
        sendNotification(to, {
          type: 'private_message',
          from,
          message: `رسالة خاصة جديدة من ${from}`,
          time: new Date().toISOString()
        });
      }
    } catch (err) {
      console.error('خطأ في حفظ الرسالة الخاصة:', err);
    }
  });

  // تحديث حالة "شوهدت" للرسائل
  socket.on('mark as seen', async ({ messageIds }) => {
    if (!socket.username || !Array.isArray(messageIds) || messageIds.length === 0) return;

    try {
      await pool.query(`
        UPDATE private_messages
        SET seen_by = array_append(seen_by, $1)
        WHERE id = ANY($2)
          AND to_user = $1
          AND NOT ($1 = ANY(seen_by))
      `, [socket.username, messageIds]);
    } catch (err) {
      console.error('خطأ في تحديث حالة المشاهدة:', err);
    }
  });

  socket.on('disconnect', () => {
    if (currentRoom && username) {
      roomCounts[currentRoom]--;
      roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.username !== username);
      io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
      io.to(currentRoom).emit('system message', `${username} غادر الغرفة`);
    }
    socket.username = null;
  });
});

async function sendNotification(toUsername, notification) {
  try {
    await pool.query(
      'UPDATE users SET notifications = notifications || $1::jsonb WHERE username = $2',
      [JSON.stringify(notification), toUsername]
    );

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
  console.log(' (مع قاعدة بيانات PostgreSQL)');
  console.log('');
  console.log('افتح الشات من:');
  console.log(`http://localhost:${PORT}/index.html`);
  console.log('=====================================');
});
