const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const path = require('path');
const bodyParser = require('body-parser');
const app = express();
const http = require('http').createServer(app);
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: 'dgfqrprus',
  api_key: '156257997776869',
  api_secret: 'R_38erQJWoAgw6XQr9BjzvQdAAU'
});

const io = require('socket.io')(http);

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ────────────────────────────────────────────────
// إعداد قاعدة البيانات PostgreSQL
// ────────────────────────────────────────────────
const connectionString = process.env.DATABASE_URL || 'postgresql://postgres.wgzikxgbhrcgfewnosiq:mohamedennaiha55@aws-1-eu-west-1.pooler.supabase.com:5432/postgres';
const pool = new Pool({
  connectionString: connectionString,
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
        is_banned BOOLEAN DEFAULT false,
        is_muted BOOLEAN DEFAULT false,
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

      CREATE TABLE IF NOT EXISTS room_messages (
        id SERIAL PRIMARY KEY,
        room TEXT NOT NULL,
        username TEXT NOT NULL,
        message TEXT NOT NULL,
        avatar TEXT,
        role TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS idx_pm_users ON private_messages (from_user, to_user);
      CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON room_messages (room, created_at DESC);
    `);
    console.log('✓ الجداول جاهزة (users + private_messages + room_messages)');
  } catch (err) {
    console.error('خطأ في تهيئة الجداول:', err);
  }
}
initDatabase();

// ────────────────────────────────────────────────
// متغيرات مؤقتة
// ────────────────────────────────────────────────
let roomUsers = { general: [], algeria: [], all_countries: [] };
let roomCounts = { general: 0, algeria: 0, all_countries: 0 };

const RANKS = ['ضيف', 'عضو', 'بريميوم', 'أدمن', 'superadmin', 'صاحب الموقع', 'مالك'];
const secret = 'secretkey'; // غيّرها لشيء أقوى في الإنتاج
const PORT = process.env.PORT || 3000;

// ────────────────────────────────────────────────
// دوال مساعدة
// ────────────────────────────────────────────────
async function getUser(username) {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (user) {
      user.friends = user.friends || [];
      user.friend_requests = user.friend_requests || [];
      user.sent_requests = user.sent_requests || [];
    }
    return user || null;
  } catch (err) {
    console.error('خطأ في جلب المستخدم:', err);
    return null;
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
// Routes (HTTP)
// ────────────────────────────────────────────────
app.post('/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ msg: 'يجب إدخال اسم المستخدم وكلمة المرور' });
  const exists = await getUser(username);
  if (exists) return res.status(400).json({ msg: 'المستخدم موجود مسبقاً' });
  const passwordHash = bcrypt.hashSync(password, 10);
  try {
    await pool.query(`INSERT INTO users (username, password_hash, rank) VALUES ($1, $2, 'ضيف')`, [username, passwordHash]);
    res.json({ msg: 'تم التسجيل بنجاح' });
  } catch (err) {
    res.status(500).json({ msg: 'خطأ في التسجيل' });
  }
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

  const unreadRes = await pool.query(
    `SELECT COUNT(*) FROM private_messages WHERE to_user = $1 AND NOT ($1 = ANY(seen_by))`,
    [req.user.username]
  );
  const unreadCount = parseInt(unreadRes.rows[0].count, 10) || 0;

  res.json({
    username: user.username,
    avatar: user.avatar,
    background: user.background,
    friends: user.friends,
    friend_requests: user.friend_requests || [],
    rank: user.rank || 'ضيف',
    unread_messages: unreadCount
  });
});

app.post('/upload-avatar', verifyToken, upload.single('avatar'), async (req, res) => {
  if (!req.file) return res.status(400).json({ msg: 'لم يتم رفع أي ملف' });
  try {
    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "avatars",
      unsigned: true,
      upload_preset: "ywfrua3f"
    });
    await updateUserFields(req.user.username, { avatar: result.secure_url });
    res.json({ avatar: result.secure_url });
  } catch (err) {
    console.error("خطأ رفع الأفاتار:", err);
    res.status(500).json({ msg: 'فشل رفع الصورة' });
  }
});

app.post('/upload-background', verifyToken, upload.single('background'), async (req, res) => {
  if (!req.file) return res.status(400).json({ msg: 'لم يتم رفع أي ملف' });
  try {
    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "backgrounds",
      unsigned: true,
      upload_preset: "ywfrua3f"
    });
    await updateUserFields(req.user.username, { background: result.secure_url });
    res.json({ background: result.secure_url });
  } catch (err) {
    console.error("خطأ رفع الخلفية:", err);
    res.status(500).json({ msg: 'فشل رفع الخلفية' });
  }
});

// ────────────────────────────────────────────────
// Socket.IO
// ────────────────────────────────────────────────
io.on('connection', socket => {
  let currentRoom = null;
  let username = null;

  // الانضمام إلى غرفة
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
      if (user?.is_banned) {
        socket.emit('execute-ban', { target: username });
        return socket.disconnect();
      }

      const avatar = user?.avatar || 'https://via.placeholder.com/40';
      roomUsers[room].push({ username, avatar });
      io.to(room).emit('update users', roomUsers[room]);
      io.to(room).emit('system message', `${username} انضم إلى الغرفة`);

      // تحميل الرسائل السابقة
      const { rows: messages } = await pool.query(`
        SELECT username, message AS msg, avatar, role
        FROM room_messages
        WHERE room = $1
        ORDER BY created_at DESC
        LIMIT 500
      `, [room]);
      socket.emit('previous messages', messages.reverse());
    } catch (e) {
      console.log('خطأ في الانضمام:', e.message);
    }
  });

  // أوامر الإدارة: كتم - فك كتم - حظر - طرد
  socket.on('admin command', async (data) => {
    const { action, target, token } = data;
    try {
      const decoded = jwt.verify(token, secret);
      const admin = await getUser(decoded.username);

      if (!admin || !['أدمن', 'superadmin', 'صاحب الموقع', 'مالك'].includes(admin.rank)) {
        return socket.emit('system message', '🚫 ليس لديك صلاحية لهذا الأمر');
      }

      const targetUser = await getUser(target);
      if (!targetUser) return socket.emit('system message', `المستخدم ${target} غير موجود`);

      if (action === 'mute') {
        await pool.query('UPDATE users SET is_muted = true WHERE username = $1', [target]);
        io.to(currentRoom).emit('system message', `🔇 تم كتم ${target} من الشات العام`);
        for (const s of io.sockets.sockets.values()) {
          if (s.username === target) {
            s.emit('mute-update', { target, status: true });
            s.emit('system message', '🔇 لقد تم كتمك من الشات العام من قبل الإدارة');
          }
        }
      }

      else if (action === 'unmute') {
        await pool.query('UPDATE users SET is_muted = false WHERE username = $1', [target]);
        io.to(currentRoom).emit('system message', `✅ تم فك الكتم عن ${target}`);
        for (const s of io.sockets.sockets.values()) {
          if (s.username === target) {
            s.emit('mute-update', { target, status: false });
            s.emit('system message', '🔊 تم فك الكتم عنك، يمكنك الكتابة الآن');
          }
        }
      }

      else if (action === 'ban') {
        await pool.query('UPDATE users SET is_banned = true WHERE username = $1', [target]);
        io.to(currentRoom).emit('system message', `🚫 تم حظر ${target} من الموقع`);
        for (const s of io.sockets.sockets.values()) {
          if (s.username === target) {
            s.emit('execute-ban', { target });
            s.disconnect();
          }
        }
      }

      else if (action === 'unban') {
        await pool.query('UPDATE users SET is_banned = false WHERE username = $1', [target]);
        io.to(currentRoom).emit('system message', `🔓 تم فك الحظر عن ${target}`);
      }

      else if (action === 'kick') {
        io.to(currentRoom).emit('system message', `🚪 تم طرد ${target} من الغرفة`);
        for (const s of io.sockets.sockets.values()) {
          if (s.username === target) {
            s.emit('execute-kick', { target });
            s.disconnect();
          }
        }
      }

    } catch (err) {
      console.error('Admin command error:', err);
      socket.emit('system message', 'حدث خطأ أثناء تنفيذ الأمر');
    }
  });

  // إرسال رسالة في الغرفة
  socket.on('message', async (msg, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      const user = await getUser(decoded.username);
      if (!user) return;

      // منع المكتوم من إرسال الرسائل في الشات العام
      if (user.is_muted) {
        socket.emit('system message', '🚫 أنت مكتوم حالياً ولا يمكنك إرسال رسائل في الشات العام');
        return;
      }

      const avatar = user.avatar || 'https://via.placeholder.com/40';
      const role = user.rank || 'ضيف';

      await pool.query(
        `INSERT INTO room_messages (room, username, message, avatar, role, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [currentRoom, decoded.username, msg, avatar, role]
      );

      io.to(currentRoom).emit('message', {
        username: decoded.username,
        msg,
        avatar,
        role
      });

      // معالجة المنشن (@username)
      const mentionRegex = /@(\w+)/g;
      let match;
      while ((match = mentionRegex.exec(msg)) !== null) {
        const mentioned = match[1];
        for (const s of io.sockets.sockets.values()) {
          if (s.username === mentioned) {
            s.emit('mention notification', { from: decoded.username, room: currentRoom });
          }
        }
      }
    } catch (e) {
      console.log('خطأ في إرسال الرسالة:', e.message);
    }
  });

  // شراء رتبة (بريميوم مجاني حالياً)
  socket.on('buy role', async ({ role }) => {
    if (socket.username && role === 'premium') {
      try {
        await pool.query('UPDATE users SET rank = $1 WHERE username = $2', ['بريميوم', socket.username]);
        socket.emit('role purchased', { success: true, role: 'بريميوم' });
        io.emit('rank update', { username: socket.username, rank: 'بريميوم' });
      } catch (err) {
        console.error('خطأ في شراء الرتبة:', err);
      }
    }
  });

  // منح رتبة من المالك
  socket.on('change-rank-gift', async ({ targetUsername, newRank }) => {
    try {
      await updateUserFields(targetUsername, { rank: newRank });
      io.emit('message', {
        username: 'النظام',
        msg: `🎊 مبارك! تم منح ${targetUsername} رتبة ${newRank}`,
        avatar: 'https://via.placeholder.com/40',
        role: 'system'
      });
      io.emit('rank updated', { username: targetUsername, rank: newRank });
    } catch (err) {
      console.error('خطأ في منح الرتبة:', err);
    }
  });

  // ────────────── الدردشة الخاصة ──────────────
  function getPrivateRoomName(u1, u2) {
    return ['private', ...[u1, u2].sort()].join('_');
  }

  socket.on('join private', (target) => {
    if (!socket.username || !target || socket.username === target) return;
    const roomName = getPrivateRoomName(socket.username, target);
    socket.join(roomName);
  });

  socket.on('private message', async ({ to, msg }) => {
    const from = socket.username;
    if (!from || !to || !msg?.trim() || from === to) return;

    try {
      const { rows } = await pool.query(
        `INSERT INTO private_messages (from_user, to_user, message, created_at)
         VALUES ($1, $2, $3, NOW()) RETURNING created_at`,
        [from, to, msg.trim()]
      );

      const messageData = {
        from,
        to,
        msg: msg.trim(),
        avatar: (await getUser(from))?.avatar || 'https://via.placeholder.com/30',
        createdAt: rows[0].created_at.toISOString()
      };

      const roomName = getPrivateRoomName(from, to);
      io.to(roomName).emit('private message', messageData);

      for (const s of io.sockets.sockets.values()) {
        if (s.username === to) s.emit('msg_notification');
      }
    } catch (err) {
      console.error('خطأ في الرسالة الخاصة:', err);
    }
  });

  socket.on('get private messages', async (target) => {
    if (!socket.username || !target) return;
    try {
      const { rows } = await pool.query(`
        SELECT from_user, message, created_at
        FROM private_messages
        WHERE (from_user = $1 AND to_user = $2) OR (from_user = $2 AND to_user = $1)
        ORDER BY created_at ASC LIMIT 50
      `, [socket.username, target]);

      const messages = await Promise.all(rows.map(async m => ({
        from: m.from_user,
        msg: m.message,
        avatar: (await getUser(m.from_user))?.avatar || 'https://via.placeholder.com/30',
        createdAt: m.created_at
      })));

      socket.emit('previous private messages', { withUser: target, messages });
    } catch (err) {
      console.error('خطأ في جلب الرسائل الخاصة:', err);
    }
  });

  socket.on('mark messages read', async (sender) => {
    if (!socket.username) return;
    const res = await pool.query(
      `UPDATE private_messages
       SET seen_by = array_append(seen_by, $1)
       WHERE from_user = $2 AND to_user = $1 AND NOT ($1 = ANY(seen_by))`,
      [socket.username, sender]
    );
    socket.emit('messages read confirmed', { count: res.rowCount });
  });

  // الخروج
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

// تشغيل السيرفر
http.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================');
  console.log(`✅ السيرفر يعمل على بورت ${PORT}`);
  console.log('افتح الشات من: http://localhost:' + PORT);
  console.log('=====================================');
});
