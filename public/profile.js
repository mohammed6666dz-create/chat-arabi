const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

let myUsername = '';

async function loadProfile() {
  try {
    const res = await fetch('/profile', { headers: { Authorization: token } });
    const user = await res.json();
    myUsername = user.username || 'Lonely person';

    document.getElementById('usernameDisplay').textContent = myUsername;

    if (user.avatar) {
      document.getElementById('avatarImg').src = user.avatar;
    }

    if (user.background) {
      document.querySelector('.background').style.backgroundImage = `url(${user.background})`;
    }

    // عرض الأصدقاء (لو موجودين في user.friends)
    const friendsList = document.getElementById('friendsList');
    if (user.friends && user.friends.length > 0) {
      friendsList.innerHTML = '';
      user.friends.forEach(friend => {
        const div = document.createElement('div');
        div.textContent = friend;
        div.style.padding = '10px';
        div.style.borderBottom = '1px solid #444';
        friendsList.appendChild(div);
      });
    }

  } catch (e) {
    console.error('فشل تحميل البروفايل');
  }
}

// رفع صورة البروفايل
document.getElementById('avatarInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (file) {
    const formData = new FormData();
    formData.append('avatar', file);

    const res = await fetch('/upload-avatar', {
      method: 'POST',
      headers: { Authorization: token },
      body: formData
    });

    const data = await res.json();
    document.getElementById('avatarImg').src = data.avatar + '?t=' + Date.now();
  }
};

// رفع الخلفية
document.getElementById('backgroundInput').onchange = async (e) => {
  const file = e.target.files[0];
  if (file) {
    const formData = new FormData();
    formData.append('background', file);

    const res = await fetch('/upload-background', {
      method: 'POST',
      headers: { Authorization: token },
      body: formData
    });

    const data = await res.json();
    document.querySelector('.background').style.backgroundImage = `url(${data.background}?t=${Date.now()})`;
  }
};

// تغيير الاسم (اختياري - لو عايز تسمح بتغيير الاسم)
document.getElementById('saveUsername').onclick = () => {
  const newName = document.getElementById('newUsername').value.trim();
  if (newName && newName !== myUsername) {
    alert('تغيير الاسم غير مدعوم حاليًا في السيرفر، لكن يمكن إضافته لاحقًا');
  }
};

// تبويبات
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(btn.dataset.tab).classList.add('active');
  };
});

loadProfile();
