const express = require('express');
const { Pool } = require('pg');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const multer = require('multer');
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

// إعداد multer للصور (Cloudinary)
const upload = multer({ storage: multer.memoryStorage() });

// إعداد multer للتخزين المحلي (للأغاني)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'uploads');
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'song-' + uniqueSuffix + path.extname(file.originalname));
  }
});
const uploadSong = multer({ 
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['audio/mpeg', 'audio/mp3', 'audio/mpeg3', 'audio/ogg', 'audio/wav'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('نوع الملف غير مدعوم. يرجى رفع ملف MP3, OGG أو WAV'), false);
    }
  }
});

// إعداد الاتصال بقاعدة البيانات
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
        profile_song TEXT DEFAULT '',
        private_bg TEXT DEFAULT '',
        friends JSONB DEFAULT '[]'::jsonb,
        friend_requests JSONB DEFAULT '[]'::jsonb,
        sent_requests JSONB DEFAULT '[]'::jsonb,
        notifications JSONB DEFAULT '[]'::jsonb,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        last_room TEXT DEFAULT 'general',
        last_room_name TEXT DEFAULT 'الغرفة العامة',
        last_seen TIMESTAMPTZ DEFAULT NOW()
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
      CREATE TABLE IF NOT EXISTS friends_posts (
        id SERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        content TEXT NOT NULL,
        likes INTEGER DEFAULT 0,
        liked_by TEXT[] DEFAULT '{}',
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS post_comments (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL,
        username TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_pm_users ON private_messages (from_user, to_user);
      CREATE INDEX IF NOT EXISTS idx_room_messages_room_created ON room_messages (room, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_friends_posts_created ON friends_posts (created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_post_comments_post ON post_comments (post_id);
    `);
    console.log('✓ الجداول جاهزة (مع private_bg)');
  } catch (err) {
    console.error('خطأ في تهيئة الجداول:', err);
  }
}
initDatabase();

// المتغيرات المؤقتة
let roomUsers = { general: [], algeria: [], all_countries: [] };
let roomCounts = { general: 0, algeria: 0, all_countries: 0 };
const RANKS = ['ضيف', 'عضو', 'بريميوم', 'أدمن', 'صاحب الموقع'];
const secret = 'secretkey';
const PORT = process.env.PORT || 3000;

// دالة للحصول على اسم الغرفة
function getRoomName(roomId) {
  const rooms = {
    'general': 'الغرفة العامة',
    'algeria': 'الجزائر',
    'all_countries': 'جميع الدول'
  };
  return rooms[roomId] || roomId;
}

// تذكير تلقائي بالأذكار
const adhkar = [
    "سبحان الله وبحمده",
    "سبحان الله العظيم",
    "الحمد لله",
    "الله أكبر",
    "لا إله إلا الله",
    "أستغفر الله العظيم",
    "صلّى الله على محمد ﷺ",
    "اللهم صل وسلم على نبينا محمد",
    "لا حول ولا قوة إلا بالله",
    "سبحان الله عدد ما خلق",
    "اللهم أنت السلام ومنك السلام",
    "اللهم اغفر لي وارحمني"
];
const reminderImage = "https://i.pinimg.com/736x/ef/e5/f3/efe5f30586ff8fe7861cdea4bc2f88cf.jpg";

setInterval(() => {
    const randomDhikr = adhkar[Math.floor(Math.random() * adhkar.length)];
    const reminderMessage = `✨ ${randomDhikr} ✨`;
    io.emit('message', {
        username: 'تذكير',
        msg: reminderMessage,
        avatar: reminderImage,
        role: 'system'
    });
}, 60000);

// مفتاح OpenRouter
const OPENROUTER_API_KEY = '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';
const AI_MODEL = 'google/gemini-2.0-flash-lite:free';
const GPT_AVATAR = 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/04/ChatGPT_logo.svg/2048px-ChatGPT_logo.svg.png';

// دوال مساعدة
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

async function createUser(username, passwordHash) {
  try {
    await pool.query(`INSERT INTO users (username, password_hash, rank) VALUES ($1, $2, 'ضيف')`, [username, passwordHash]);
    return true;
  } catch (err) {
    if (err.code === '23505') return false;
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

// جلب المتصلين حالياً
function getOnlineUsernames() {
  const online = [];
  for (const room in roomUsers) {
    roomUsers[room].forEach(user => {
      if (!online.includes(user.username)) {
        online.push(user.username);
      }
    });
  }
  return online;
}

// بث قائمة غير المتصلين للجميع
async function broadcastOfflineUsers() {
  try {
    const onlineUsernames = getOnlineUsernames();
    
    const { rows: allUsers } = await pool.query(`
      SELECT username, avatar, last_room_name, last_seen, rank
      FROM users
      ORDER BY last_seen DESC
    `);
    
    const offlineUsersList = allUsers.filter(user => 
      !onlineUsernames.includes(user.username)
    );
    
    io.emit('offline users update', offlineUsersList);
  } catch (err) {
    console.error('خطأ في بث غير المتصلين:', err);
  }
}

// إرسال إشعار لمستخدم معين
async function sendNotification(toUsername, notification) {
  try {
    await pool.query(
      'UPDATE users SET notifications = notifications || $1::jsonb WHERE username = $2',
      [JSON.stringify(notification), toUsername]
    );
    for (const socket of io.sockets.sockets.values()) {
      if (socket.username === toUsername) {
        socket.emit('new_notification', notification);
        break;
      }
    }
  } catch (err) {
    console.error('خطأ في إرسال الإشعار:', err);
  }
}

// Routes
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
  res.json({ 
    token,
    last_room: user.last_room || 'general',
    last_room_name: user.last_room_name || 'الغرفة العامة'
  });
});

app.get('/sitemap.xml', (req, res) => {
  res.sendFile(path.join(__dirname, 'sitemap.xml'));
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
  const unreadRes = await pool.query(`SELECT COUNT(*) FROM private_messages WHERE to_user = $1 AND NOT ($1 = ANY(seen_by))`, [req.user.username]);
  const unreadCount = parseInt(unreadRes.rows[0].count, 10) || 0;
  res.json({
    username: user.username,
    avatar: user.avatar,
    background: user.background,
    profile_song: user.profile_song || '',
    private_bg: user.private_bg || '',
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

// رفع أغنية البروفايل
app.post('/upload-profile-song', verifyToken, uploadSong.single('song'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ msg: 'لم يتم رفع أي ملف' });
  }
  
  try {
    const songUrl = `/uploads/${req.file.filename}`;
    const success = await updateUserFields(req.user.username, { profile_song: songUrl });
    
    if (!success) {
      return res.status(500).json({ msg: 'خطأ في حفظ رابط الأغنية في قاعدة البيانات' });
    }
    
    res.json({ 
      success: true,
      songUrl: songUrl,
      msg: 'تم رفع الأغنية بنجاح'
    });
  } catch (err) {
    console.error("خطأ رفع الأغنية:", err);
    res.status(500).json({ 
      msg: 'فشل رفع الأغنية: ' + err.message 
    });
  }
});

// رفع خلفية الدردشة الخاصة عبر Cloudinary (نفس الكود القديم لكن نتأكد من صلاحية المفاتيح)
app.post('/upload-private-bg', verifyToken, upload.single('bg'), async (req, res) => {
  if (!req.file) return res.status(400).json({ msg: 'لم يتم رفع أي ملف' });
  try {
    const b64 = Buffer.from(req.file.buffer).toString("base64");
    const dataURI = "data:" + req.file.mimetype + ";base64," + b64;
    const result = await cloudinary.uploader.upload(dataURI, {
      folder: "private_bg"
    });
    const success = await updateUserFields(req.user.username, { private_bg: result.secure_url });
    if (!success) return res.status(500).json({ msg: 'خطأ في حفظ الرابط' });
    res.json({ bgUrl: result.secure_url });
  } catch (err) {
    console.error("خطأ رفع الخلفية:", err);
    res.status(500).json({ msg: 'فشل الرفع: ' + err.message });
  }
});
// جلب بيانات أي مستخدم (للبروفايل)
app.get('/profile-data', verifyToken, async (req, res) => {
  const { username } = req.query;
  if (!username) return res.status(400).json({ msg: 'اسم المستخدم مطلوب' });
  const user = await getUser(username);
  if (!user) return res.status(404).json({ msg: 'المستخدم غير موجود' });
  res.json({
    username: user.username,
    avatar: user.avatar,
    profile_song: user.profile_song || ''
  });
});

// جلب قائمة غير المتصلين
app.get('/offline-users', verifyToken, async (req, res) => {
  try {
    const onlineUsernames = getOnlineUsernames();
    
    const { rows: allUsers } = await pool.query(`
      SELECT username, avatar, last_room_name, last_seen, rank
      FROM users
      ORDER BY last_seen DESC
    `);
    
    const offlineUsersList = allUsers.filter(user => 
      !onlineUsernames.includes(user.username)
    );
    
    res.json(offlineUsersList);
  } catch (err) {
    console.error('خطأ في جلب غير المتصلين:', err);
    res.status(500).json([]);
  }
});

app.get('/room-counts', (req, res) => {
  res.json(roomCounts);
});

app.post('/change-rank', verifyToken, async (req, res) => {
  const changer = await getUser(req.user.username);
  if (!changer || changer.rank !== 'مالك') {
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

// حفظ آخر روم
app.post('/api/save-last-room', verifyToken, async (req, res) => {
  const { roomId, roomName } = req.body;
  try {
    await pool.query('UPDATE users SET last_room = $1, last_room_name = $2, last_seen = NOW() WHERE username = $3', [roomId, roomName, req.user.username]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
});

// ========== مسارات حائط الأصدقاء ==========

// إنشاء منشور جديد
app.post('/api/create-post', verifyToken, async (req, res) => {
  const { content } = req.body;
  const username = req.user.username;
  
  if (!content || content.trim() === '') {
    return res.status(400).json({ msg: 'المنشور لا يمكن أن يكون فارغاً' });
  }
  
  try {
    const result = await pool.query(
      'INSERT INTO friends_posts (username, content, created_at) VALUES ($1, $2, NOW()) RETURNING id',
      [username, content.trim()]
    );
    const postId = result.rows[0].id;
    
    const user = await getUser(username);
    const friendsList = user.friends || [];
    
    for (const friend of friendsList) {
      const notification = {
        id: Date.now(),
        type: 'new_post',
        from: username,
        post_id: postId,
        message: `${username} نشر منشور جديد: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
        created_at: new Date().toISOString()
      };
      await sendNotification(friend, notification);
    }
    
    res.json({ success: true, msg: 'تم نشر المنشور بنجاح' });
  } catch (err) {
    console.error('خطأ في إنشاء منشور:', err);
    res.status(500).json({ msg: 'خطأ في نشر المنشور' });
  }
});

// جلب منشورات الأصدقاء فقط
app.get('/api/get-friends-posts', verifyToken, async (req, res) => {
  const username = req.user.username;
  
  try {
    const user = await getUser(username);
    const friendsList = user.friends || [];
    
    if (friendsList.length === 0) {
      return res.json([]);
    }
    
    const allUsernames = [username, ...friendsList];
    
    const { rows: posts } = await pool.query(`
      SELECT p.*, u.avatar
      FROM friends_posts p
      LEFT JOIN users u ON p.username = u.username
      WHERE p.username = ANY($1::text[])
      ORDER BY p.created_at DESC
      LIMIT 50
    `, [allUsernames]);
    
    const postsWithLiked = posts.map(post => ({
      ...post,
      user_liked: post.liked_by ? post.liked_by.includes(username) : false
    }));
    
    res.json(postsWithLiked);
  } catch (err) {
    console.error('خطأ في جلب منشورات الأصدقاء:', err);
    res.status(500).json([]);
  }
});

// إعجاب بمنشور
app.post('/api/like-post', verifyToken, async (req, res) => {
  const { postId } = req.body;
  const username = req.user.username;
  
  if (!postId) {
    return res.status(400).json({ msg: 'معرف المنشور مطلوب' });
  }
  
  try {
    const { rows } = await pool.query('SELECT liked_by, likes, username as post_owner FROM friends_posts WHERE id = $1', [postId]);
    if (rows.length === 0) {
      return res.status(404).json({ msg: 'المنشور غير موجود' });
    }
    
    let likedBy = rows[0].liked_by || [];
    let newLikes = rows[0].likes || 0;
    const postOwner = rows[0].post_owner;
    
    if (likedBy.includes(username)) {
      likedBy = likedBy.filter(u => u !== username);
      newLikes--;
    } else {
      likedBy.push(username);
      newLikes++;
      
      if (postOwner !== username) {
        const notification = {
          id: Date.now(),
          type: 'like',
          from: username,
          post_id: postId,
          message: `${username} أعجب بمنشورك: ${rows[0].content?.substring(0, 50) || ''}`,
          created_at: new Date().toISOString()
        };
        await sendNotification(postOwner, notification);
      }
    }
    
    await pool.query(
      'UPDATE friends_posts SET likes = $1, liked_by = $2 WHERE id = $3',
      [newLikes, likedBy, postId]
    );
    
    res.json({ success: true });
  } catch (err) {
    console.error('خطأ في الإعجاب:', err);
    res.status(500).json({ msg: 'خطأ في الإعجاب' });
  }
});

// جلب التعليقات لمنشور
app.get('/api/get-comments', verifyToken, async (req, res) => {
  const { postId } = req.query;
  
  if (!postId) {
    return res.status(400).json([]);
  }
  
  try {
    const { rows } = await pool.query(`
      SELECT c.*, u.avatar
      FROM post_comments c
      LEFT JOIN users u ON c.username = u.username
      WHERE c.post_id = $1
      ORDER BY c.created_at ASC
      LIMIT 50
    `, [postId]);
    
    res.json(rows);
  } catch (err) {
    console.error('خطأ في جلب التعليقات:', err);
    res.status(500).json([]);
  }
});

// إضافة تعليق
app.post('/api/add-comment', verifyToken, async (req, res) => {
  const { postId, content } = req.body;
  const username = req.user.username;
  
  if (!postId || !content || content.trim() === '') {
    return res.status(400).json({ msg: 'البيانات غير مكتملة' });
  }
  
  try {
    const { rows: postRows } = await pool.query('SELECT username as post_owner FROM friends_posts WHERE id = $1', [postId]);
    if (postRows.length === 0) {
      return res.status(404).json({ msg: 'المنشور غير موجود' });
    }
    const postOwner = postRows[0].post_owner;
    
    await pool.query(
      'INSERT INTO post_comments (post_id, username, content, created_at) VALUES ($1, $2, $3, NOW())',
      [postId, username, content.trim()]
    );
    
    if (postOwner !== username) {
      const notification = {
        id: Date.now(),
        type: 'comment',
        from: username,
        post_id: postId,
        message: `${username} علق على منشورك: ${content.substring(0, 50)}${content.length > 50 ? '...' : ''}`,
        created_at: new Date().toISOString()
      };
      await sendNotification(postOwner, notification);
    }
    
    res.json({ success: true });
  } catch (err) {
    console.error('خطأ في إضافة التعليق:', err);
    res.status(500).json({ msg: 'خطأ في إضافة التعليق' });
  }
});

// جلب الإشعارات
app.get('/api/get-notifications', verifyToken, async (req, res) => {
  const username = req.user.username;
  
  try {
    const user = await getUser(username);
    const notifications = user.notifications || [];
    notifications.reverse();
    res.json(notifications.slice(0, 50));
  } catch (err) {
    console.error('خطأ في جلب الإشعارات:', err);
    res.status(500).json([]);
  }
});

// تعليم الإشعار كمقروء
app.post('/api/mark-notification-read', verifyToken, async (req, res) => {
  const { notifId } = req.body;
  const username = req.user.username;
  
  try {
    const user = await getUser(username);
    let notifications = user.notifications || [];
    notifications = notifications.filter(n => n.id !== notifId);
    await pool.query('UPDATE users SET notifications = $1 WHERE username = $2', [JSON.stringify(notifications), username]);
    res.json({ success: true });
  } catch (err) {
    console.error('خطأ في تعليم الإشعار كمقروء:', err);
    res.status(500).json({ msg: 'خطأ في تحديث الإشعارات' });
  }
});

// تحديث غير المتصلين كل 30 ثانية
setInterval(() => {
  broadcastOfflineUsers();
}, 30000);

// Socket.IO
io.on('connection', socket => {
  let currentRoom = null;
  let username = null;

  socket.on('admin command', async (data) => {
    const { action, target, token } = data;
    try {
      const decoded = jwt.verify(token, secret);
      const user = await getUser(decoded.username);
      if (user && ['أدمن', 'صاحب الموقع', 'مالك'].includes(user.rank)) {
        if (action === 'ban') {
          await pool.query('UPDATE users SET is_banned = true WHERE username = $1', [target]);
          for (const [id, s] of io.sockets.sockets) {
            if (s.username === target) {
              s.emit('execute-ban', { target: target });
              s.disconnect();
            }
          }
        }
        if (action === 'kick') {
          for (const [id, s] of io.sockets.sockets) {
            if (s.username === target) {
              s.emit('execute-kick', { target: target });
              s.disconnect();
            }
          }
        }
        if (action === 'unban') {
          await pool.query('UPDATE users SET is_banned = false WHERE username = $1', [target]);
          io.emit('system message', `✅ تم فك الحظر عن ${target}`);
        }
        if (action === 'mute') {
          await pool.query('UPDATE users SET is_muted = true WHERE username = $1', [target]);
        }
        if (action === 'unmute') {
          await pool.query('UPDATE users SET is_muted = false WHERE username = $1', [target]);
        }
      }
    } catch (err) {
      console.error('Admin Error:', err);
    }
  });
  
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
      if (user && user.is_banned) {
        socket.emit('execute-ban', { target: user.username });
        return socket.disconnect();
      }
      const avatar = user?.avatar || 'https://via.placeholder.com/40';
      const userRank = user?.rank || 'ضيف';
      roomUsers[room].push({ username, avatar, rank: userRank });
      io.to(room).emit('update users', roomUsers[room]);
      io.to(room).emit('system message', `${username} انضم إلى الغرفة`);
      
      let roomName = room;
      if (room === 'general') roomName = 'الغرفة العامة';
      else if (room === 'algeria') roomName = 'الجزائر';
      else if (room === 'all_countries') roomName = 'جميع الدول';
      await pool.query('UPDATE users SET last_room = $1, last_room_name = $2, last_seen = NOW() WHERE username = $3', [room, roomName, username]);
      
      broadcastOfflineUsers();
      
      const NEW_USER_LIMIT = 5000;
      const OLD_USER_LIMIT = 5000;
      const isNewUser = user.created_at > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
      const limit = isNewUser ? NEW_USER_LIMIT : OLD_USER_LIMIT;
      const { rows: messages } = await pool.query(`
        SELECT username, message AS msg, avatar, role
        FROM room_messages
        WHERE room = $1
        ORDER BY created_at DESC
        LIMIT $2
      `, [room, limit]);
      const messagesToSend = messages.reverse();
      socket.emit('load messages', messagesToSend);
    } catch (e) {
      console.log('خطأ في join:', e.message);
    }
  });

  socket.on('buy role', async ({ role }) => {
    if (socket.username && role === 'premium') {
      try {
        await pool.query('UPDATE users SET rank = $1 WHERE username = $2', ['بريميوم', socket.username]);
        socket.emit('role purchased', { success: true, role: 'بريميوم' });
        io.emit('rank update', { username: socket.username, rank: 'بريميوم' });
        if (currentRoom) {
          const userIndex = roomUsers[currentRoom].findIndex(u => u.username === socket.username);
          if (userIndex !== -1) {
            roomUsers[currentRoom][userIndex].rank = 'بريميوم';
            io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
          }
        }
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
      if (user && user.is_muted) {
        return socket.emit('system message', '🚫 عذراً، أنت مكتوم ولا يمكنك إرسال رسائل حالياً.');
      }
      const avatar = user.avatar || 'https://via.placeholder.com/40';
      const role = user.rank || 'ضيف';
      
      await pool.query(`INSERT INTO room_messages (room, username, message, avatar, role, created_at) VALUES ($1, $2, $3, $4, $5, NOW())`, [currentRoom, decoded.username, msg, avatar, role]);
      
      const lowerMsg = msg.toLowerCase().trim();
      if (lowerMsg.includes('gpt')) {
        let question = msg.trim();
        if (question.length < 5) {
          io.to(currentRoom).emit('message', {
            username: 'جي بي تي',
            msg: '✨ اسألني سؤالك بوضوح أكثر يا بطل!',
            avatar: GPT_AVATAR,
            role: 'system'
          });
          return;
        }
        try {
          const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
              'Content-Type': 'application/json',
              'HTTP-Referer': 'https://your-site.com',
              'X-Title': 'Chat Bot'
            },
            body: JSON.stringify({
              model: AI_MODEL,
              messages: [
                { role: 'system', content: 'أنت مساعد ذكي ودود، رد بالعربية، كن مفيداً ومختصراً.' },
                { role: 'user', content: question }
              ],
              temperature: 0.7,
              max_tokens: 500
            })
          });
          if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
          const data = await response.json();
          const aiReply = data.choices[0].message.content.trim();
          io.to(currentRoom).emit('message', {
            username: 'جي بي تي',
            msg: `✨ ${aiReply}`,
            avatar: GPT_AVATAR,
            role: 'system'
          });
        } catch (err) {
          console.error('خطأ في رد جي بي تي:', err.message);
          io.to(currentRoom).emit('message', {
            username: 'جي بي تي',
            msg: 'عذراً، حدث خطأ في الرد... جرب مرة أخرى بعد شوية!',
            avatar: GPT_AVATAR,
            role: 'system'
          });
        }
        return;
      }
      
      io.to(currentRoom).emit('message', {
        username: decoded.username,
        msg: msg,
        avatar: avatar,
        role: user.rank || 'ضيف'
      });
      
      const mentionRegex = /@(\w+)/g;
      let match;
      const mentionedUsers = new Set();
      while ((match = mentionRegex.exec(msg)) !== null) {
        mentionedUsers.add(match[1]);
      }
      if (mentionedUsers.size > 0) {
        for (const mentioned of mentionedUsers) {
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
  
  socket.on('send friend request', async (targetUsername) => {
    if (!socket.username || socket.username === targetUsername) return;
    const [sender, target] = await Promise.all([getUser(socket.username), getUser(targetUsername)]);
    if (!sender || !target) return;
    if (sender.sent_requests.includes(targetUsername) || target.friend_requests.includes(socket.username) || sender.friends.includes(targetUsername)) return;
    await pool.query('UPDATE users SET friend_requests = COALESCE(friend_requests, \'[]\'::jsonb) || jsonb_build_array($1::text) WHERE username = $2', [socket.username, targetUsername]);
    await pool.query('UPDATE users SET sent_requests = COALESCE(sent_requests, \'[]\'::jsonb) || jsonb_build_array($1::text) WHERE username = $2', [targetUsername, socket.username]);
    
    const notification = {
      id: Date.now(),
      type: 'friend_request',
      from: socket.username,
      message: `${socket.username} أرسل لك طلب صداقة`,
      created_at: new Date().toISOString()
    };
    await sendNotification(targetUsername, notification);
    
    socket.emit('request_sent', targetUsername);
  });
  
  socket.on('accept friend request', async (fromUsername) => {
    const acceptor = socket.username;
    const [acceptorUser, senderUser] = await Promise.all([getUser(acceptor), getUser(fromUsername)]);
    if (!acceptorUser || !senderUser) return;
    await pool.query(`UPDATE users SET friend_requests = friend_requests - $1::text, friends = COALESCE(friends, '[]'::jsonb) || jsonb_build_array($1::text) WHERE username = $2`, [fromUsername, acceptor]);
    await pool.query(`UPDATE users SET sent_requests = sent_requests - $1::text, friends = COALESCE(friends, '[]'::jsonb) || jsonb_build_array($1::text) WHERE username = $2`, [acceptor, fromUsername]);
    
    const notification = {
      id: Date.now(),
      type: 'friend_accepted',
      from: acceptor,
      message: `${acceptor} قبل طلب الصداقة`,
      created_at: new Date().toISOString()
    };
    await sendNotification(fromUsername, notification);
    
    socket.emit('friend_accepted', fromUsername);
  });
  
  socket.on('reject friend request', async (fromUsername) => {
    const rejector = socket.username;
    await pool.query('UPDATE users SET friend_requests = friend_requests - $1::text WHERE username = $2', [fromUsername, rejector]);
    await pool.query('UPDATE users SET sent_requests = sent_requests - $1::text WHERE username = $2', [rejector, fromUsername]);
    socket.emit('request_rejected', fromUsername);
  });
  
  socket.on('remove friend', async (targetUsername) => {
    if (!socket.username) return;
    const user = socket.username;
    await pool.query('UPDATE users SET friends = friends - $1::text WHERE username = $2', [targetUsername, user]);
    await pool.query('UPDATE users SET friends = friends - $1::text WHERE username = $2', [user, targetUsername]);
    socket.emit('friend removed', targetUsername);
    for (const s of io.sockets.sockets.values()) {
      if (s.username === targetUsername) {
        s.emit('friend removed', user);
      }
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
        for (const room in roomUsers) {
          const userIndex = roomUsers[room].findIndex(u => u.username === targetUsername);
          if (userIndex !== -1) {
            roomUsers[room][userIndex].rank = newRank;
            io.to(room).emit('update users', roomUsers[room]);
          }
        }
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
  
  socket.on('get private conversations', async () => {
    if (!socket.username) return;
    try {
      const { rows } = await pool.query(`
        SELECT DISTINCT
          CASE
            WHEN from_user = $1 THEN to_user
            ELSE from_user
          END AS other_user
        FROM private_messages
        WHERE from_user = $1 OR to_user = $1
      `, [socket.username]);
      const conversations = await Promise.all(rows.map(async (r) => {
        const u = await getUser(r.other_user);
        return {
          username: r.other_user,
          avatar: u ? u.avatar : 'https://via.placeholder.com/40'
        };
      }));
      socket.emit('private conversations list', conversations);
    } catch (err) {
      console.error('خطأ في جلب المحادثات:', err);
    }
  });
  
  socket.on('get private messages', async (targetUsername) => {
    if (!socket.username || !targetUsername) return;
    try {
      const { rows } = await pool.query(`
        SELECT from_user, to_user, message, created_at
        FROM private_messages
        WHERE (from_user = $1 AND to_user = $2)
           OR (from_user = $2 AND to_user = $1)
        ORDER BY created_at ASC
        LIMIT 50
      `, [socket.username, targetUsername]);
      const messages = await Promise.all(rows.map(async (msg) => {
        const user = await getUser(msg.from_user);
        return {
          from: msg.from_user,
          msg: msg.message,
          avatar: user ? user.avatar : 'https://via.placeholder.com/30',
          createdAt: msg.created_at
        };
      }));
      socket.emit('previous private messages', { withUser: targetUsername, messages });
    } catch (err) {
      console.error('خطأ في جلب الرسائل الخاصة:', err);
    }
  });
  
  socket.on('private message', async ({ to, msg }) => {
    const from = socket.username;
    if (!from || !to || !msg?.trim() || from === to) return;
    const trimmedMsg = msg.trim();
    try {
      const { rows } = await pool.query(`INSERT INTO private_messages (from_user, to_user, message, created_at) VALUES ($1, $2, $3, NOW()) RETURNING id, created_at`, [from, to, trimmedMsg]);
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
      for (const s of io.sockets.sockets.values()) {
        if (s.username === to) s.emit('msg_notification', { from });
      }
      if (!isOnline) {
        const notification = {
          id: Date.now(),
          type: 'private_message',
          from: from,
          message: `رسالة خاصة جديدة من ${from}`,
          created_at: new Date().toISOString()
        };
        await sendNotification(to, notification);
      }
    } catch (err) {
      console.error('خطأ في حفظ الرسالة الخاصة:', err);
    }
  });
  
  socket.on('mark messages read', async (sender) => {
    if (!socket.username) return;
    const res = await pool.query(`UPDATE private_messages SET seen_by = array_append(seen_by, $1) WHERE from_user = $2 AND to_user = $1 AND NOT ($1 = ANY(seen_by))`, [socket.username, sender]);
    socket.emit('messages read confirmed', { count: res.rowCount });
  });
  
  socket.on('disconnect', async () => {
    if (currentRoom && username) {
      roomCounts[currentRoom]--;
      roomUsers[currentRoom] = roomUsers[currentRoom].filter(u => u.username !== username);
      io.to(currentRoom).emit('update users', roomUsers[currentRoom]);
      io.to(currentRoom).emit('system message', `${username} غادر الغرفة`);
      
      await pool.query('UPDATE users SET last_seen = NOW() WHERE username = $1', [username]);
      broadcastOfflineUsers();
    }
    socket.username = null;
  });
});

// تشغيل السيرفر
http.listen(PORT, '0.0.0.0', () => {
  console.log('=====================================');
  console.log('✅ السيرفر يعمل بنجاح على port ' + PORT);
  console.log(' (مع قاعدة بيانات PostgreSQL + GPT بوت + حفظ الجلسة + حائط الأصدقاء + خلفية خاصة)');
  console.log('');
  console.log('افتح الشات من:');
  console.log(`http://localhost:${PORT}/index.html`);
  console.log('=====================================');
});
