const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

const socket = io();
const params = new URLSearchParams(window.location.search);
const room = params.get('room');
if (!room) window.location.href = 'rooms.html';

let myUsername = '';

socket.emit('join', room, token);

// استقبال آخر 100 رسالة
socket.on('previous messages', (messages) => {
  document.getElementById('chatWindow').innerHTML = '';
  messages.forEach(({ username, msg, avatar }) => {
    appendMessage(username, msg, avatar);
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
  appendMessage(username, msg, avatar);
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

function appendMessage(username, msg, avatar) {
  const isMe = username === myUsername;
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

// تحميل البروفايل
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

// زر الخروج
document.getElementById('leaveRoomBtn').addEventListener('click', () => {
  if (confirm('هل أنت متأكد من الخروج من الغرفة؟')) {
    document.getElementById('chatWindow').innerHTML = `
      <div style="text-align:center; color:#aaa; padding:50px; font-size:18px;">
        تم الخروج من الغرفة<br>
        يمكنك اختيار غرفة أخرى من القائمة
      </div>
    `;
    document.getElementById('messageForm').style.display = 'none';
    document.getElementById('usersList').innerHTML = '';
    document.getElementById('userCount').innerText = '0';
    // إعادة توجيه اختياري
    // setTimeout(() => { window.location.href = 'rooms.html'; }, 2000);
  }
});

// الأيقونات (مثال أولي - يمكن توسيعها)
document.querySelectorAll('.icon-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const action = btn.dataset.action;
    if (action === 'home') {
      window.location.href = 'rooms.html';
    } else if (action === 'private-messages') {
      alert('سيتم فتح الدردشة الخاصة قريبًا');
    } else {
      alert(`تم الضغط على ${action}`);
    }
  });
});

// باقي الكود (البروفايل، رفع الصور، إلخ) كما هو عندك...
// ... (انسخ باقي الجزء الخاص بالـ modal ورفع الصور من الكود اللي بعته)
