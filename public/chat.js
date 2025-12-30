// التحقق من التوكن + الغرفة (كما كان)
const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

const socket = io();

const params = new URLSearchParams(window.location.search);
const room = params.get('room');
if (!room) window.location.href = 'rooms.html';

let myUsername = '';

// الانضمام للغرفة
socket.emit('join', room, token);

// تحديث عدد وعرض المتصلين
socket.on('update users', users => {
  document.getElementById('userCount').innerText = users.length;
  const list = document.getElementById('usersList');
  list.innerHTML = '';
  users.forEach(user => {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.innerHTML = `
      <img src="${user.avatar}" alt="${user.username}">
      <span>${user.username}</span>
    `;
    list.appendChild(div);
  });
});

// رسالة عادية
socket.on('message', ({ username, msg, avatar }) => {
  appendMessage(username, msg, avatar);
});

// رسالة نظام (انضمام / خروج)
socket.on('system message', msg => {
  const div = document.createElement('div');
  div.className = 'system-message';
  div.textContent = msg;
  document.getElementById('chatWindow').appendChild(div);
  scrollToBottom();
});

// إرسال رسالة
document.getElementById('messageForm').onsubmit = e => {
  e.preventDefault();
  const input = document.getElementById('messageInput');
  const msg = input.value.trim();
  if (msg) {
    socket.emit('message', msg, token);
    input.value = '';
  }
};

function appendMessage(username, msg, avatar) {
  const isMe = username === myUsername;
  const div = document.createElement('div');
  div.className = 'message';
  if (isMe) div.classList.add('my-message');
  div.innerHTML = `
    <img src="${avatar}" alt="${username}">
    <div class="message-content">
      <strong>${username}</strong>
      <p>${msg}</p>
    </div>
  `;
  document.getElementById('chatWindow').appendChild(div);
  scrollToBottom();
}

function scrollToBottom() {
  const chat = document.getElementById('chatWindow');
  chat.scrollTop = chat.scrollHeight;
}

// تحميل الصورة الشخصية في الهيدر
async function loadMyAvatar() {
  try {
    const res = await fetch('/profile', { 
      headers: { Authorization: `Bearer ${token}` } 
    });
    if (!res.ok) throw new Error('فشل جلب البروفايل');
    
    const user = await res.json();
    myUsername = user.username;
    if (user.avatar) {
      document.getElementById('avatar').src = user.avatar;
    }
  } catch (e) {
    console.error('خطأ في تحميل البروفايل:', e);
  }
}
loadMyAvatar();

// ────────────────────────────────────────────────
//          زر الخروج (Logout Button)
// ────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // إنشاء الزر ديناميكيًا (أو يمكنك إضافته في HTML مباشرة)
  const header = document.querySelector('header');
  if (!header) return;

  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'logoutBtn';
  logoutBtn.textContent = 'خروج';
  logoutBtn.style.cssText = `
    background: #dc3545;
    color: white;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 0.95rem;
    cursor: pointer;
    margin-left: 16px;
  `;
  logoutBtn.onmouseover = () => { logoutBtn.style.background = '#c82333'; };
  logoutBtn.onmouseout  = () => { logoutBtn.style.background = '#dc3545'; };

  // إضافته بجانب العنوان
  const title = header.querySelector('h1');
  if (title) {
    title.parentNode.insertBefore(logoutBtn, title.nextSibling);
  } else {
    header.prepend(logoutBtn);
  }

  // حدث الضغط على زر الخروج
  logoutBtn.addEventListener('click', () => {
    if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;

    // 1. مسح بيانات الجلسة
    localStorage.removeItem('token');
    sessionStorage.removeItem('token');

    // 2. إشعار السيرفر بالخروج (مفيد لتحديث قائمة المتصلين)
    socket.emit('leave', room, token);

    // 3. إغلاق الاتصال (اختياري)
    socket.disconnect();

    // 4. الرجوع لصفحة الغرف أو الصفحة الرئيسية
    window.location.href = 'rooms.html';     // ← أهم سطر: غيّره إذا كانت صفحتك مختلفة
    // أمثلة بديلة:
    // window.location.href = 'index.html';
    // window.location.href = '/';
  });
});
