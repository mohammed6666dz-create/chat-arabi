const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) {
  window.location.href = 'index.html';
}

const socket = io();
const params = new URLSearchParams(window.location.search);
const room = params.get('room');
if (!room) {
  window.location.href = 'rooms.html';
}

let myUsername = '';
let myAvatar = 'https://via.placeholder.com/40'; // صورة افتراضية
let myRank = 'ضيف'; // الرتبه الافتراضية

// الانضمام للغرفة
socket.emit('join', room, token);

// استقبال آخر 100 رسالة
socket.on('previous messages', (messages) => {
  const chatWindow = document.getElementById('chatWindow');
  chatWindow.innerHTML = ''; // مسح المحتوى القديم
  messages.forEach(({ username, msg, avatar, rank }) => {
    appendMessage(username, msg, avatar, username === myUsername, rank || 'ضيف');
  });
  scrollToBottom();
});

// تحديث قائمة المتصلين
socket.on('update users', (users) => {
  document.getElementById('userCount').innerText = users.length;
  const list = document.getElementById('usersList');
  list.innerHTML = '';
  users.forEach(user => {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.innerHTML = `
      <img src="${user.avatar || 'https://via.placeholder.com/40'}" alt="${user.username}">
      <span>[${user.rank || 'ضيف'}] ${user.username}</span>
    `;
    list.appendChild(div);
  });
});

// رسالة جديدة
socket.on('message', ({ username, msg, avatar, rank }) => {
  appendMessage(username, msg, avatar, username === myUsername, rank || 'ضيف');
});

// رسائل النظام
socket.on('system message', (msg) => {
  const div = document.createElement('div');
  div.className = 'system-message';
  div.textContent = msg;
  document.getElementById('chatWindow').appendChild(div);
  scrollToBottom();
});

// إرسال رسالة
document.getElementById('messageForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('messageInput');
  const msg = input.value.trim();
  if (msg) {
    socket.emit('message', msg, token);
    input.value = '';
  }
});

// دالة عرض الرسالة (مع الرتبه)
function appendMessage(username, msg, avatar, isMe = false, rank = 'ضيف') {
  const chatWindow = document.getElementById('chatWindow');
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${isMe ? 'my-message' : ''}`;

  messageDiv.innerHTML = `
    <img src="${avatar || 'https://via.placeholder.com/40'}" alt="${username}">
    <div class="message-content">
      <strong>[${rank}] ${username}</strong>
      <p>${msg}</p>
    </div>
  `;

  chatWindow.appendChild(messageDiv);
  scrollToBottom();
}

function scrollToBottom() {
  const chatWindow = document.getElementById('chatWindow');
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// تحميل بيانات المستخدم (الاسم + الصورة + الرتبه)
async function loadMyProfile() {
  try {
    const res = await fetch('/profile', {
      headers: { Authorization: token }
    });

    if (!res.ok) throw new Error('فشل جلب البروفايل');

    const user = await res.json();
    myUsername = user.username;
    myAvatar = user.avatar || 'https://via.placeholder.com/40';
    myRank = user.rank || 'ضيف';
    document.getElementById('avatar').src = myAvatar;
  } catch (err) {
    console.error('خطأ في تحميل البروفايل:', err);
  }
}
loadMyProfile();

// زر تغيير الخلفية (كاميرا) - موجود لكن ما يشتغل إلا لو صاحب الموقع
document.getElementById('bgChangeBtn').addEventListener('click', () => {
  // يمكنك إضافة شرط هنا لو تبي يشتغل بس لصاحب الموقع
  document.getElementById('backgroundUpload').click();
});

document.getElementById('backgroundUpload').addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (event) => {
    document.querySelector('.chat-main').style.backgroundImage = `url(${event.target.result})`;
    document.querySelector('.chat-main').style.backgroundSize = 'cover';
    document.querySelector('.chat-main').style.backgroundPosition = 'center';
  };
  reader.readAsDataURL(file);
});

// فتح/إغلاق مودال البروفايل (ما يعمل شي داخل المودال)
document.getElementById('profileBtn').addEventListener('click', () => {
  document.getElementById('profileModal').style.display = 'flex';
});

document.getElementById('closeProfile').addEventListener('click', () => {
  document.getElementById('profileModal').style.display = 'none';
});

// زر الخروج (Logout) - ينقل لصفحة rooms.html
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.createElement('button');
  logoutBtn.id = 'logoutBtn';
  logoutBtn.innerHTML = '<i class="fas fa-sign-out-alt"></i> خروج';
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

  const header = document.querySelector('header');
  if (header) {
    header.appendChild(logoutBtn);
  }

  logoutBtn.addEventListener('click', () => {
    if (!confirm('هل أنت متأكد من تسجيل الخروج؟')) return;

    localStorage.removeItem('token');
    sessionStorage.removeItem('token');
    socket.emit('leave', room, token);
    socket.disconnect();
    window.location.href = 'rooms.html'; // ← ينقل لصفحة الرومات
  });
});
