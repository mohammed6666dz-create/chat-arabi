const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

const socket = io();
const params = new URLSearchParams(window.location.search);
const room = params.get('room');
if (!room) window.location.href = 'rooms.html';

let myUsername = '';

// الانضمام للغرفة
socket.emit('join', room, token);

// استقبال آخر 100 رسالة
socket.on('previous messages', (messages) => {
  document.getElementById('chatWindow').innerHTML = '';
  messages.forEach(({ username, msg, avatar }) => {
    appendMessage(username, msg, avatar, username === myUsername);
  });
  scrollToBottom();
});

// تحديث المتصلين
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

// رسالة جديدة
socket.on('message', ({ username, msg, avatar }) => {
  appendMessage(username, msg, avatar, username === myUsername);
});

// رسالة نظام
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

function appendMessage(username, msg, avatar, isMe = false) {
  const div = document.createElement('div');
  div.className = `message ${isMe ? 'my-message' : ''}`;
  div.innerHTML = `
    <img src="${avatar || 'https://via.placeholder.com/40'}" alt="${username}">
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

// تحميل اسم المستخدم وصورته
async function loadMyAvatar() {
  try {
    const res = await fetch('/profile', { headers: { Authorization: token } });
    const user = await res.json();
    myUsername = user.username;
    if (user.avatar) document.getElementById('avatar').src = user.avatar;
  } catch (e) {
    console.error('فشل تحميل البروفايل');
  }
}
loadMyAvatar();

// زر تغيير الخلفية (كاميرا)
document.getElementById('bgChangeBtn').addEventListener('click', () => {
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

// مودال البروفايل (اختياري - لو عايز تحافظ عليه)
document.getElementById('profileBtn').addEventListener('click', () => {
  document.getElementById('profileModal').style.display = 'flex';
});

document.getElementById('closeProfile').addEventListener('click', () => {
  document.getElementById('profileModal').style.display = 'none';
});
