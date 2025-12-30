const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

const socket = io();
const params = new URLSearchParams(window.location.search);
const room = params.get('room');
if (!room) window.location.href = 'rooms.html';

let myUsername = '';

// طلب الانضمام للغرفة
socket.emit('join', room, token);

// استقبال آخر 100 رسالة عند الدخول
socket.on('previous messages', (messages) => {
  const chatWindow = document.getElementById('chatWindow');
  chatWindow.innerHTML = ''; // مسح أي محتوى قديم

  messages.forEach(({ username, msg, avatar }) => {
    appendMessage(username, msg, avatar, username === myUsername);
  });

  scrollToBottom();
});

// استقبال رسالة جديدة
socket.on('message', ({ username, msg, avatar }) => {
  appendMessage(username, msg, avatar, username === myUsername);
});

// رسائل النظام (انضمام، خروج، إلخ)
socket.on('system message', msg => {
  const div = document.createElement('div');
  div.className = 'system-message';
  div.textContent = msg;
  document.getElementById('chatWindow').appendChild(div);
  scrollToBottom();
});

// تحديث قائمة المتصلين
socket.on('update users', users => {
  document.getElementById('userCount').innerText = users.length;
  const list = document.getElementById('usersList');
  list.innerHTML = '';
  users.forEach(user => {
    const div = document.createElement('div');
    div.className = 'user-item';
    div.innerHTML = `
      <img src="${user.avatar || 'https://via.placeholder.com/40'}" alt="${user.username}">
      <span>${user.username}</span>
    `;
    list.appendChild(div);
  });
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

// دالة عرض الرسالة (الرئيسية)
function appendMessage(username, msg, avatar, isMe = false) {
  const chatWindow = document.getElementById('chatWindow');
  const messageDiv = document.createElement('div');
  
  messageDiv.className = `message ${isMe ? 'my-message' : ''}`;
  messageDiv.innerHTML = `
    <img src="${avatar || 'https://via.placeholder.com/40'}" alt="${username}">
    <div class="message-content">
      <strong>${username}</strong>
      <p>${msg}</p>
    </div>
  `;

  chatWindow.appendChild(messageDiv);
  scrollToBottom();
}

// التمرير التلقائي لأسفل
function scrollToBottom() {
  const chatWindow = document.getElementById('chatWindow');
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// تحميل اسم المستخدم وصورته
async function loadMyProfile() {
  try {
    const res = await fetch('/profile', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const user = await res.json();
    myUsername = user.username;
    if (user.avatar) {
      document.getElementById('avatar').src = user.avatar;
    }
  } catch (err) {
    console.error('فشل تحميل البروفايل:', err);
  }
}
loadMyProfile();
