const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

const socket = io();
const params = new URLSearchParams(window.location.search);
const room = params.get('room');
if (!room) window.location.href = 'rooms.html';

let myUsername = '';

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
  const div = document.createElement('div');
  div.className = 'message';
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
    const res = await fetch('/profile', { headers: { Authorization: token } });
    const user = await res.json();
    myUsername = user.username;
    if (user.avatar) {
      document.getElementById('avatar').src = user.avatar;
    }
  } catch (e) {}
}
loadMyAvatar();