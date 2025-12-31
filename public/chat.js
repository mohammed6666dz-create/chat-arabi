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
let myAvatar = 'https://via.placeholder.com/40';

// الانضمام للغرفة
socket.emit('join', room, token);

// استقبال آخر 100 رسالة
socket.on('previous messages', (messages) => {
  const chatWindow = document.getElementById('chatWindow');
  chatWindow.innerHTML = '';
  messages.forEach(({ username, msg, avatar }) => {
    appendMessage(username, msg, avatar, username === myUsername);
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
      <span>${user.username}</span>
    `;
    div.onclick = () => openUserActions(user.username);
    list.appendChild(div);
  });
});

// رسالة جديدة
socket.on('message', ({ username, msg, avatar }) => {
  appendMessage(username, msg, avatar, username === myUsername);
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

function scrollToBottom() {
  const chatWindow = document.getElementById('chatWindow');
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

// تحميل بيانات المستخدم
async function loadMyProfile() {
  try {
    const res = await fetch('/profile', {
      headers: { Authorization: token }
    });
    if (!res.ok) throw new Error('فشل جلب البروفايل');
    const user = await res.json();
    myUsername = user.username;
    myAvatar = user.avatar || 'https://via.placeholder.com/40';
    document.getElementById('avatar').src = myAvatar;
  } catch (err) {
    console.error('خطأ في تحميل البروفايل:', err);
  }
}
loadMyProfile();

// فتح لوحة البروفايل الشخصية
document.getElementById('profileBtn').addEventListener('click', () => {
  document.getElementById('myProfilePanel').style.display = 'block';
});

// إغلاق لوحة البروفايل
document.getElementById('closeMyProfile').addEventListener('click', () => {
  document.getElementById('myProfilePanel').style.display = 'none';
});

// فتح لوحة أفعال المستخدم عند الضغط على صورته
function openUserActions(username) {
  document.getElementById('userUsername').textContent = username;
  document.getElementById('userAvatar').src = 'https://via.placeholder.com/90';
  document.getElementById('userProfilePanel').style.display = 'block';
}

// زر فحص الملف
document.getElementById('viewUserProfileBtn').onclick = () => {
  alert('ملف المستخدم (سيتم إضافة تفاصيل أكثر قريبًا)');
};

// زر التحدث في الخاص
document.getElementById('startPrivateChatBtn').onclick = () => {
  document.getElementById('userProfilePanel').style.display = 'none';
  document.getElementById('privateChatPanel').style.display = 'block';
  document.getElementById('privateChatWith').textContent = 'دردشة مع ' + document.getElementById('userUsername').textContent;
};

// زر إضافة صديق
document.getElementById('addFriendBtn').onclick = () => {
  alert('تم إرسال طلب الصداقة!');
  document.getElementById('userProfilePanel').style.display = 'none';
};

// إغلاق لوحة ملف المستخدم
document.getElementById('closeUserPanel').addEventListener('click', () => {
  document.getElementById('userProfilePanel').style.display = 'none';
});

// إغلاق الشات الخاص
document.getElementById('closePrivateChat').addEventListener('click', () => {
  document.getElementById('privateChatPanel').style.display = 'none';
});

// إرسال رسالة خاصة
document.getElementById('privateChatForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('privateChatInput');
  const msg = input.value.trim();
  if (msg) {
    const chat = document.getElementById('privateChatMessages');
    const div = document.createElement('div');
    div.innerHTML = `<p><strong>أنت:</strong> ${msg}</p>`;
    chat.appendChild(div);
    input.value = '';
    chat.scrollTop = chat.scrollHeight;
  }
});

// الأزرار في الهيدر
document.getElementById('privateMsgBtn').addEventListener('click', () => {
  alert('الرسائل الخاصة (قريبًا ستظهر قائمة الرسائل)');
});
document.getElementById('friendReqBtn').addEventListener('click', () => {
  document.getElementById('friendRequestsPanel').style.display = 'block';
});
document.getElementById('notificationsBtn').addEventListener('click', () => {
  alert('لا توجد إشعارات جديدة');
});
document.getElementById('reportsBtn').addEventListener('click', () => {
  alert('صفحة الإبلاغات (قريبًا)');
});
document.getElementById('closeFriendReq').addEventListener('click', () => {
  document.getElementById('friendRequestsPanel').style.display = 'none';
});
