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
  const panel = document.getElementById('profilePanel');
  panel.style.display = (panel.style.display === 'block') ? 'none' : 'block';
  if (panel.style.display === 'block') {
    loadProfile();
  }
});

// إغلاق اللوحة
document.getElementById('closePanel').addEventListener('click', () => {
  document.getElementById('profilePanel').style.display = 'none';
});

// تحميل بيانات اللوحة
async function loadProfile() {
  try {
    const res = await fetch('/profile', { headers: { Authorization: token } });
    const user = await res.json();
    document.getElementById('profileUsername').textContent = user.username || 'مستخدم';
    if (user.avatar) document.getElementById('profileAvatar').src = user.avatar;
  } catch (e) {
    console.error('فشل تحميل البروفايل');
  }
}

// رفع الصورة الشخصية
document.getElementById('avatarUpload').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const formData = new FormData();
  formData.append('avatar', file);
  try {
    const res = await fetch('/upload-avatar', {
      method: 'POST',
      headers: { Authorization: token },
      body: formData
    });
    const data = await res.json();
    document.getElementById('profileAvatar').src = data.avatar + '?t=' + Date.now();
    document.getElementById('avatar').src = data.avatar + '?t=' + Date.now();
  } catch (e) {
    alert('فشل رفع الصورة');
  }
});

// فتح لوحة أفعال المستخدم
function openUserActions(username) {
  document.getElementById('userProfileUsername').textContent = username;
  document.getElementById('userProfilePanel').style.display = 'block';
}

// زر فحص الملف
document.getElementById('viewProfileBtn').onclick = () => {
  alert('ملف المستخدم (سيتم إضافة تفاصيل أكثر قريبًا)');
};

// زر التحدث في الخاص
document.getElementById('privateChatBtn').onclick = () => {
  document.getElementById('userProfilePanel').style.display = 'none';
  document.getElementById('privateChatPanel').style.display = 'block';
  document.getElementById('privateChatTitle').textContent = 'دردشة مع ' + document.getElementById('userProfileUsername').textContent;
};

// زر إرسال طلب صداقة
document.getElementById('sendFriendReqBtn').onclick = () => {
  alert('تم إرسال طلب الصداقة!');
  document.getElementById('userProfilePanel').style.display = 'none';
};

// إغلاق لوحة المستخدم
document.getElementById('closeUserPanel').addEventListener('click', () => {
  document.getElementById('userProfilePanel').style.display = 'none';
});

// إغلاق الشات الخاص
document.getElementById('closePrivateChat').addEventListener('click', () => {
  document.getElementById('privateChatPanel').style.display = 'none';
});

// إرسال رسالة خاصة (مثال بسيط)
document.getElementById('privateMessageForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const input = document.getElementById('privateMessageInput');
  const msg = input.value.trim();
  if (msg) {
    const chat = document.getElementById('privateChatWindow');
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
