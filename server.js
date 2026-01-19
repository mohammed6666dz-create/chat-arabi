const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage() });
const fs = require('fs');
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
// إعداد الاتصال بقاعدة البيانات
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
      CREATE INDEX IF NOT EXISTS idx_pm_users
      ON private_messages (from_user, to_user);
      CREATE INDEX IF NOT EXISTS idx_room_messages_room_created
      ON room_messages (room, created_at DESC);
    `);
    console.log('✓ الجداول جاهزة (users + private_messages + room_messages)');
  } catch (err) {
    console.error('خطأ في تهيئة الجداول:', err);
  }
}
initDatabase();

// ────────────────────────────────────────────────
// المتغيرات المؤقتة
// ────────────────────────────────────────────────
let roomUsers = { general: [], algeria: [], all_countries: [] };
let roomCounts = { general: 0, algeria: 0, all_countries: 0 };

// الرتب المتاحة
const RANKS = ['ضيف', 'عضو', 'بريميوم', 'أدمن', 'صاحب الموقع'];
const secret = 'secretkey';
const PORT = process.env.PORT || 3000;

// ────────────────────────────────────────────────
// دوال مساعدة
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
  try {
    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "avatars",
      unsigned: true,
      upload_preset: "ywfrua3f"
    });
    const success = await updateUserFields(req.user.username, { avatar: result.secure_url });
    if (!success) return res.status(500).json({ msg: 'خطأ في حفظ الرابط بقاعدة البيانات' });
    res.json({ avatar: result.secure_url });
  } catch (err) {
    console.error("خطأ الرفع:", err);
    res.status(500).json({ msg: 'فشل الرفع السحابي' });
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
    const success = await updateUserFields(req.user.username, { background: result.secure_url });
    if (!success) return res.status(500).json({ msg: 'خطأ في حفظ رابط الخلفية' });
    res.json({ background: result.secure_url });
  } catch (err) {
    console.error("خطأ الرفع:", err);
    res.status(500).json({ msg: 'فشل الرفع السحابي' });
  }
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

      // ────────────── تحميل الرسائل القديمة ──────────────
      const NEW_USER_LIMIT = 100;
      const OLD_USER_LIMIT = 5000;

      // شرط بسيط نسبياً: إذا كان الحساب أقل من 14 يوم → جديد
      const isNewUser = user.created_at > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

      const limit = isNewUser ? NEW_USER_LIMIT : OLD_USER_LIMIT;

      const { rows: messages } = await pool.query(`
        SELECT username, message AS msg, avatar, role
        FROM room_messages
        WHERE room = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [room, limit]);

      // عكس الترتيب ليظهر الأقدم أولاً
      const messagesToSend = messages.reverse();

      socket.emit('load messages', messagesToSend);

    } catch (e) {
      console.log('خطأ في join:', e.message);
    }
  });socket.on('buy role', async ({ role }) => {
      if (socket.username && role === 'premium') {
        try {
          // تحديث الرتبة في قاعدة البيانات (PostgreSQL)
          await pool.query('UPDATE users SET rank = $1 WHERE username = $2', ['premium', socket.username]);
          
          // إشعار المستخدم بنجاح العملية
          socket.emit('role purchased', { success: true, role: 'premium' });
  
          // تحديث رتبة المستخدم أمام الجميع في الشات فوراً
          io.emit('rank update', { 
            username: socket.username, 
            rank: 'premium' 
          });
  
          console.log(`✅ تم ترقية ${socket.username} إلى بريميوم`);
        } catch (err) {
          console.error('خطأ في تحديث الرتبة:', err);
        }
      }
    });
  

  socket.on('message', async (msg, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      const user = await getUser(decoded.username);
      if (!user) return;

      const avatar = user.avatar || 'https://via.placeholder.com/40';
      const role = user.rank || 'ضيف';

      // حفظ الرسالة في قاعدة البيانات
      await pool.query(
        `INSERT INTO room_messages (room, username, message, avatar, role, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())`,
        [currentRoom, decoded.username, msg, avatar, role]
      );

      // إرسال الرسالة للجميع في الغرفة
      io.to(currentRoom).emit('message', {
        username: decoded.username,
        msg,
        avatar,
        role: user.rank || 'ضيف' // <--- هذا السطر الناقص أضفته لك الآن
        msg: msg,
        avatar: avatar,
        role: role
      });

      // ────────────── معالجة المنشن (الطاق) ──────────────
      const mentionRegex = /@(\w+)/g;
      let match;
      const mentionedUsers = new Set();

      // جمع كل الأسماء المذكورة
      while ((match = mentionRegex.exec(msg)) !== null) {
        const mentionedUsername = match[1];
        // ما نرسل إشعار للشخص نفسه إذا ذكر اسمه
        if (mentionedUsername !== decoded.username) {
          mentionedUsers.add(mentionedUsername);
        }
      }

      // إذا وجد أشخاص تم ذكرهم
      if (mentionedUsers.size > 0) {
        for (const mentioned of mentionedUsers) {
          // نبحث عن كل السوكتس الخاصة بهذا المستخدم (يدعم الاتصال من أكثر من جهاز)
          for (const clientSocket of io.sockets.sockets.values()) {
            if (clientSocket.username === mentioned) {
              clientSocket.emit('mention notification', {
                from: decoded.username,
                room: currentRoom
              });
            }
          }
        }
      }

    } catch (e) {
      console.log("خطأ في التحقق من التوكن أثناء إرسال الرسالة:", e.message);
    }
  });

  // باقي الأحداث بدون تغيير
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

  socket.on('buy role', async ({ role }) => {
    if (!socket.username) return;
    try {
      if (role === 'premium' || role === 'بريميوم') {
        const newRank = 'بريميوم';
        const success = await updateUserFields(socket.username, { rank: newRank });
        if (success) {
          socket.emit('role purchased', {
            role: newRank,
            success: true,
            message: 'تهانينا! أصبحت الآن عضو بريميوم 💎'
          });
          if (currentRoom) {
            io.to(currentRoom).emit('message', {
              username: 'النظام',
              msg: `🎉 مبروك! البطل ${socket.username} حصل على رتبة بريميوم!`,
              avatar: 'https://via.placeholder.com/40',
              role: 'system'
            });
          }
        }
      }
    } catch (err) {
      console.error('Error updating rank:', err);
      socket.emit('role purchased', { success: false, message: 'فشل تحديث الرتبة بالسيرفر' });
    }
  });

  socket.on('change-rank-gift', async ({ targetUsername, newRank }) => {
    try {
      const success = await updateUserFields(targetUsername, { rank: newRank });
      if (success) {
        io.emit('message', {
          username: 'النظام',
          msg: `🎊 مبارك! لقد منح المالك رتبة [ ${newRank} ] للبطل [ ${targetUsername} ]`,
          avatar: 'https://via.placeholder.com/40',
          role: 'system'
        });
        io.emit('rank updated', { username: targetUsername, rank: newRank });
      }
    } catch (err) {
      console.error('Error during rank gift:', err);
    }
  });

  function getPrivateRoomName(u1, u2) {
    return ['private', ...[u1, u2].sort()].join('_');
  }

  socket.on('join private', (targetUsername) => {
    if (!socket.username || !targetUsername || socket.username === targetUsername) return;
    const roomName = getPrivateRoomName(socket.username, targetUsername);
    socket.join(roomName);
  });

  socket.on('private message', async ({ to, msg }) => {
    const from = socket.username;
    if (!from || !to || !msg?.trim() || from === to) return;
    const trimmedMsg = msg.trim();
    try {
      const { rows } = await pool.query(`
        INSERT INTO private_messages
        (from_user, to_user, message, created_at)
        VALUES ($1, $2, $3, NOW())
        RETURNING id, created_at
      `, [from, to, trimmedMsg]);
      const messageData = {
        from,
        to,
        msg: trimmedMsg,
        avatar: (await getUser(from))?.avatar || 'https://via.placeholder.com/30',
        createdAt: rows[0].created_at.toISOString()
      };
      const roomName = getPrivateRoomName(from, to);
      io.to(roomName).emit('private message', messageData);
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
