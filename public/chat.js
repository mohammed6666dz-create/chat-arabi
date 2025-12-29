const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

const socket = io();
const params = new URLSearchParams(window.location.search);
const room = params.get('room');
if (!room) window.location.href = 'rooms.html';

let myUsername = '';

socket.emit('join', room, token);

// ★★★ استقبال آخر 100 رسالة عند الدخول ★★★
socket.on('previous messages', (messages) => {
  document.getElementById('chatWindow').innerHTML = '';
  messages.forEach(({ username, msg, avatar }) => {
    appendMessage(username, msg, avatar);
  });
});

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

// تحميل الأفاتار في الهيدر
async function loadMyAvatar() {
  try {
    const res = await fetch('/profile', { headers: { Authorization: token } });
    const user = await res.json();
    myUsername = user.username;
    if (user.avatar) {
      document.getElementById('avatar').src = user.avatar;
    }
  } catch (e) {
    console.error('فشل تحميل البروفايل');
  }
}
loadMyAvatar();

// ★★★ فتح نافذة البروفايل - نسخة مضمونة 100% ★★★
document.addEventListener('DOMContentLoaded', () => {
  const profileBtn = document.getElementById('profileBtn');
  const profileModal = document.getElementById('profileModal');
  const closeProfile = document.querySelector('.close-profile');

  if (profileBtn && profileModal) {
    profileBtn.style.cursor = 'pointer';
    profileBtn.addEventListener('click', () => {
      loadProfileModal();
      profileModal.style.display = 'flex';
    });
  }

  if (closeProfile) {
    closeProfile.addEventListener('click', () => {
      profileModal.style.display = 'none';
    });
  }

  // إغلاق لو ضغط خارج المودال
  window.addEventListener('click', (event) => {
    if (event.target === profileModal) {
      profileModal.style.display = 'none';
    }
  });
});

// تحميل بيانات البروفايل في المودال
async function loadProfileModal() {
  try {
    const res = await fetch('/profile', { headers: { Authorization: token } });
    const user = await res.json();

    document.getElementById('profileUsername').textContent = user.username || 'مستخدم';
    document.getElementById('profileAvatar').src = user.avatar || 'https://via.placeholder.com/150';

    if (user.background) {
      document.getElementById('profileBg').style.backgroundImage = `url(${user.background})`;
    } else {
      document.getElementById('profileBg').style.backgroundImage = 'none';
      document.getElementById('profileBg').style.backgroundColor = '#222';
    }

    const friendsList = document.getElementById('friendsList');
    if (user.friends && user.friends.length > 0) {
      friendsList.innerHTML = '';
      user.friends.forEach(friend => {
        const p = document.createElement('p');
        p.textContent = friend;
        p.style.color = '#A5D6A7';
        p.style.margin = '8px 0';
        friendsList.appendChild(p);
      });
    } else {
      friendsList.innerHTML = '<p class="no-friends">لا يوجد أصدقاء حتى الآن</p>';
    }

  } catch (e) {
    console.error('خطأ في تحميل البروفايل');
  }
}

// رفع الصورة الشخصية
document.getElementById('avatarInput').addEventListener('change', async (e) => {
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

// رفع الخلفية
document.getElementById('bgInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('background', file);

  try {
    const res = await fetch('/upload-background', {
      method: 'POST',
      headers: { Authorization: token },
      body: formData
    });

    const data = await res.json();
    document.getElementById('profileBg').style.backgroundImage = `url(${data.background}?t=${Date.now()})`;
  } catch (e) {
    alert('فشل رفع الخلفية');
  }
});
