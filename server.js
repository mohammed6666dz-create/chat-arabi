const express = require('express');
const app = express(); 

const { Pool } = require('pg');
const http = require('http').createServer(app); // الآن يمكنك استخدامه هنا
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
        id              SERIAL PRIMARY KEY,
        username        TEXT UNIQUE NOT NULL,
        password_hash   TEXT NOT NULL,
        rank            TEXT DEFAULT 'ضيف',
        avatar          TEXT DEFAULT '',
        background      TEXT DEFAULT '',
        friends         JSONB DEFAULT '[]'::jsonb,
        friend_requests JSONB DEFAULT '[]'::jsonb,
        sent_requests   JSONB DEFAULT '[]'::jsonb,
        notifications   JSONB DEFAULT '[]'::jsonb,
        created_at      TIMESTAMPTZ DEFAULT NOW()
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

io.on('connection', socket => { // <--- هذا السطر كان مفقوداً عندك
  let currentRoom = null;
  let username = null;
// --- كود أوامر الإدارة: ضعه تحت سطر let username = null ---

socket.on('admin command', (data) => {
    const { action, target, token } = data;

    // 1. فحص هل الشخص المرسل هو المالك محمد؟
    // ملاحظة: تأكد أنك تقوم بتخزين الاسم في socket.username عند تسجيل الدخول
    if (username !== 'mohamed-dz') { 
        return socket.emit('chat message', { system: true, msg: "تنبيـه: لا تملك صلاحية الإدارة." });
    }

// --- تكملة الكود من بعد السطر 250 في صورتك ---
    
    let targetSocketId = null;
    for (let [id, s] of io.sockets.sockets) {
        // فحصنا هنا يعتمد على أنك تخزن الاسم داخل s.username
        if (s.username === target) { 
            targetSocketId = id;
            break;
        }
    }

    const targetSocket = io.sockets.sockets.get(targetSocketId);

    // 3. تنفيذ الأوامر بناءً على النوع المرسل
    switch (action) {
        case 'kick':
        // --- تكملة الكود من بعد السطر 265 ---
            if (targetSocket) {
                targetSocket.emit('chat message', { system: true, msg: "لقد تم طردك من قبل الإدارة." });
                targetSocket.disconnect(); // فصل المستخدم فوراً
                io.emit('chat message', { system: true, msg: `🛑 تم طرد [${target}] بواسطة المالك.` });
            }
            break;

        case 'mute': // تنفيذ أمر الكتم
            if (targetSocket) {
                targetSocket.isMuted = true; // وضع علامة الكتم في السيرفر
                targetSocket.emit('chat message', { system: true, msg: "🔇 تم كتمك من قبل الإدارة، لا يمكنك الكلام حالياً." });
                socket.emit('chat message', { system: true, msg: `✅ تم كتم المستخدم [${target}] بنجاح.` });
            }
            break;

    } // إغلاق الـ switch
}); // إغلاق socket.on('admin command')

// --- كود استقبال الرسائل ومنع المكتوم ---
socket.on('message', async (msg, token) => {
    try {
        if (socket.isMuted) {
            return socket.emit('message', { system: true, msg: "⚠️ أنت مكتوم حالياً." });
        }
        // ... باقي كودك الخاص بالـ jwt والإرسال يكمل هنا ...
   } catch (e) {
        console.log(e);
    } // هنا حذفنا القوس الدائري الزائد
}); // هذا يغلق دالة socket.on('message')

    switch (action) {
        case 'kick': // طرد
            if (targetSocket) {
                targetSocket.emit('chat message', { system: true, msg: "لقد تم طردك من قبل الإدارة." });
                targetSocket.disconnect(); // قطع الاتصال فوراً
                io.emit('chat message', { system: true, msg: `🛑 تم طرد [${target}] من الدردشة.` });
            }
            break;

        case 'mute': // كتم
            if (targetSocket) {
                targetSocket.isMuted = true; // تفعيل خاصية الكتم في السوكت الخاص به
                targetSocket.emit('chat message', { system: true, msg: "🔇 تم كتمك من قبل الإدارة." });
                socket.emit('chat message', { system: true, msg: `تم كتم [${target}] بنجاح.` });
            }
            break;

        case 'ban': // حظر (مثال بسيط)
            io.emit('chat message', { system: true, msg: `🚫 تم حظر [${target}] نهائياً.` });
            if (targetSocket) targetSocket.disconnect();
            break;
    }
});
  socket.on('join', async (room, token) => {
    try {
      const decoded = jwt.verify(token, secret);
      username = decoded.username;
      socket.username = username;

      if (currentRoom) {
        socket.leave(currentRoom);
        roomCounts[currentRoom] = Math.max(0, roomCounts[currentRoom] - 1);
        roomUsers[currentRoom] = (roomUsers[currentRoom] || []).filter(u => u.username !== username);
        io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
      }

      currentRoom = room;
      socket.join(room);
      roomCounts[room]++;

      const user = await getUser(username);
      const avatar = user?.avatar || 'https://via.placeholder.com/40';

      if (!roomUsers[room]) roomUsers[room] = [];
      roomUsers[room].push({ username, avatar, rank: user?.rank || 'ضيف' });
      
      io.to(room).emit('update users', roomUsers[room]);
      io.to(room).emit('system message', `${username} انضم إلى الغرفة`);
    } catch (e) {
      console.log('Error in join');
    }
  });

  // الآن بقية الكود (buy role, message, إلخ) ستعمل لأنها داخل القوس
  // كود شراء رتبة بريميوم (الذي وضعته أنت - ممتاز)
  socket.on('buy role', async ({ role }) => {
    if (socket.username && role === 'premium') {
      try {
        await pool.query('UPDATE users SET rank = $1 WHERE username = $2', ['premium', socket.username]);
        
        socket.emit('role purchased', { success: true, role: 'premium' });

        io.emit('rank update', { 
          username: socket.username, 
          rank: 'premium' 
        });

        console.log(`✅ تم ترقية ${socket.username} إلى بريميوم مجاناً`);
      } catch (err) {
        console.error('خطأ في قاعدة البيانات:', err);
      }
    }
  });

  // كود إرسال الرسالة (تم تعديله ليرسل الرتبة مع الرسالة)
 socket.on('message', async (msg, token) => {
    try {
        // 1. أضف شرط الكتم هنا (أول شيء داخل الـ try)
        if (socket.isMuted) {
            return socket.emit('message', { 
                system: true, 
                msg: "⚠️ أنت مكتوم حالياً ولا يمكنك إرسال رسائل." 
            });
        }

        // 2. كود التحقق من التوكن (موجود عندك أصلاً)
        const decoded = jwt.verify(token, secret);
        const user = await getUser(decoded.username);
        if (!user) return;

        // 3. كود إرسال الرسالة للغرفة (موجود عندك أصلاً)
        const avatar = user.avatar || 'https://via.placeholder.com/40';
        io.to(currentRoom).emit('message', {
            username: decoded.username,
            msg,
            avatar,
            role: user.rank || 'ضيف'
        });

    } catch (e) {
        console.log("Error in message:", e);
    }
});

  // ... (بقية كود طلبات الصداقة والرسائل الخاصة كما هي)
  

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

  socket.on('disconnect', () => {
    if (currentRoom && username) {
      roomCounts[currentRoom]--;
      roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.username !== username);
      io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
      io.to(currentRoom).emit('system message', `${username} غادر الغرفة`);
    }
    socket.username = null;
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
  console.log('   (مع قاعدة بيانات PostgreSQL)');
  console.log('');
  console.log('افتح الشات من:');
  console.log(`http://localhost:${PORT}/index.html`);
  console.log('=====================================');
});
