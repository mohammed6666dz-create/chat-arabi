const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

// اتصال صريح بالسيرفر + تصحيح
const socket = io('http://localhost:3000', {
  transports: ['websocket'], // نجبره على websocket عشان يتجنب مشاكل الـ polling
  reconnection: true,
  reconnectionAttempts: 5
});

// تصحيح الاتصال
socket.on('connect', () => {
  console.log('اتصلت بالسيرفر بنجاح! Socket ID:', socket.id);
});

socket.on('connect_error', (err) => {
  console.error('مشكلة اتصال بالسيرفر:', err.message);
});

const params = new URLSearchParams(window.location.search);
const room = params.get('room');
if (!room) window.location.href = 'rooms.html';

let myUsername = '';

socket.emit('join', room, token);

// آخر 100 رسالة
socket.on('previous messages', (messages) => {
  console.log('وصلت آخر الرسائل:', messages.length);
  document.getElementById('chatWindow').innerHTML = '';
  messages.forEach(m => appendMessage(m.username, m.msg, m.avatar));
  scrollToBottom();
});

// المتصلين
socket.on('update users', (users) => {
  console.log('تحديث المتصلين:', users.length);
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

// رسالة جديدة
socket.on('message', (data) => {
  console.log('رسالة جديدة وصلت:', data);
  appendMessage(data.username, data.msg, data.avatar);
});

// رسالة نظام
socket.on('system message', (msg) => {
  console.log('رسالة نظام:', msg);
  const div = document.createElement('div');
  div.className = 'system-message';
  div.textContent = msg;
  document.getElementById('chatWindow').appendChild(div);
  scrollToBottom();
});

// إرسال رسالة (مع منع reload)
document.getElementById('messageForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('messageInput');
  const msg = input.value.trim();
  if (msg) {
    console.log('بأرسل رسالة:', msg);
    socket.emit('message', msg, token);
    input.value = '';
  }
});

function appendMessage(username, msg, avatar) {
  const isMe = username === myUsername;
  const div = document.createElement('div');
  div.className = 'message' + (isMe ? ' my-message' : '');
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

// تحميل البروفايل في الهيدر
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
