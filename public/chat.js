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
let currentPrivateChat = null;

// الانضمام للغرفة
socket.emit('join', room, token);

// استقبال آخر 100 رسالة
socket.on('previous messages', (messages) => {
    const chatWindow = document.getElementById('chatWindow');
    chatWindow.innerHTML = '';
    messages.forEach(({ username, msg, avatar, role }) => {
        appendMessage(username, msg, avatar, username === myUsername, role || 'guest');
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
       
        div.onclick = () => openUserActions(user.username, user.role);
       
        div.addEventListener('dblclick', (e) => {
            e.preventDefault();
            mentionUser(user.username);
        });
       
        list.appendChild(div);
    });
});

// رسالة عامة
socket.on('message', ({ username, msg, avatar, role }) => {
    appendMessage(username, msg, avatar, username === myUsername, role || 'guest');
});

// رسائل النظام
socket.on('system message', (msg) => {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = msg;
    document.getElementById('chatWindow').appendChild(div);
    scrollToBottom();
});

// إرسال رسالة عامة
document.getElementById('messageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('message', msg, token);
        input.value = '';
    }
});

// ─────────────── نظام الرتب ───────────────
function getUserBadge(username, role = 'guest') {
    if (username === 'mohamed-dz') {
        return '<span class="badge owner">مالك 👑</span>';
    }

    switch (role.toLowerCase()) {
        case 'superadmin':
            return '<span class="badge superadmin">سوبر أدمن ⚙️</span>';
        case 'admin':
            return '<span class="badge admin">أدمن 🔰</span>';
        case 'premium':
            return '<span class="badge premium">بريميوم 💎</span>';
        case 'vip':
            return '<span class="badge vip">VIP ★</span>';
        default:
            return '<span class="badge guest">ضيف</span>';
    }
}

function appendMessage(username, msg, avatar, isMe = false, role = 'guest') {
    const chatWindow = document.getElementById('chatWindow');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isMe ? 'my-message' : ''}`;

    const badge = getUserBadge(username, role);

    messageDiv.innerHTML = `
        <img src="${avatar || 'https://via.placeholder.com/40'}" alt="${username}">
        <div class="message-content">
            <div class="username-line">
                ${badge}
                <strong>${username}</strong>
            </div>
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

// تحميل بيانات المستخدم + الصورة
async function loadMyProfile() {
    try {
        const res = await fetch('/profile', {
            headers: { Authorization: token }
        });
        if (!res.ok) throw new Error('فشل جلب البروفايل');
        const user = await res.json();
        myUsername = user.username;
        myAvatar = user.avatar || 'https://via.placeholder.com/40';
        const timestamp = new Date().getTime();
        document.getElementById('avatar').src = myAvatar + '?t=' + timestamp;
        document.getElementById('myProfileAvatar').src = myAvatar + '?t=' + timestamp;
        document.getElementById('myProfileUsername').textContent = myUsername;
    } catch (err) {
        console.error('خطأ في تحميل البروفايل:', err);
    }
}
loadMyProfile();

// فتح لوحة البروفايل
document.getElementById('profileBtn').addEventListener('click', () => {
    document.getElementById('myProfilePanel').style.display = 'block';
    loadMyProfile();
});

// إغلاق لوحة البروفايل
document.getElementById('closeMyProfile').addEventListener('click', () => {
    document.getElementById('myProfilePanel').style.display = 'none';
});

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
        if (data.avatar) {
            const timestamp = new Date().getTime();
            myAvatar = data.avatar;
            document.getElementById('myProfileAvatar').src = data.avatar + '?t=' + timestamp;
            document.getElementById('avatar').src = data.avatar + '?t=' + timestamp;
            alert('تم رفع الصورة بنجاح!');
        } else {
            alert('فشل رفع الصورة: ' + (data.msg || 'خطأ غير معروف'));
        }
    } catch (e) {
        console.error('خطأ في رفع الصورة:', e);
        alert('حصل خطأ أثناء رفع الصورة، يرجى المحاولة مرة أخرى');
    }
});

// فتح لوحة أفعال المستخدم + أزرار تغيير الرتبة (للمالك فقط)
function openUserActions(username, currentRole = 'guest') {
    document.getElementById('userUsername').textContent = username;
    document.getElementById('userAvatar').src = 'https://via.placeholder.com/90';
    document.getElementById('userProfilePanel').style.display = 'block';
    currentPrivateChat = username;

    // إزالة أي أزرار رتب سابقة
    const existing = document.getElementById('rankActions');
    if (existing) existing.remove();

    // عرض أزرار تغيير الرتبة فقط للمالك (وليس لنفسه)
    if (myUsername === 'mohamed-dz' && username !== 'mohamed-dz') {
        const panel = document.getElementById('userProfilePanel');
        const rankDiv = document.createElement('div');
        rankDiv.id = 'rankActions';
        rankDiv.style.margin = '20px 0';
        rankDiv.style.padding = '15px';
        rankDiv.style.background = 'rgba(0,0,0,0.25)';
        rankDiv.style.borderRadius = '12px';
        rankDiv.innerHTML = `
            <h4 style="text-align:center; color:#fbbf24; margin:0 0 12px 0;">
                تغيير رتبة ${username}
            </h4>
            <div style="display:flex; flex-wrap:wrap; gap:8px; justify-content:center;">
                <button onclick="setUserRole('${username}', 'superadmin')" style="background:#6d28d9;color:white;padding:6px 12px;border:none;border-radius:6px;cursor:pointer;">سوبر أدمن</button>
                <button onclick="setUserRole('${username}', 'admin')" style="background:#3b82f6;color:white;padding:6px 12px;border:none;border-radius:6px;cursor:pointer;">أدمن</button>
                <button onclick="setUserRole('${username}', 'premium')" style="background:#10b981;color:white;padding:6px 12px;border:none;border-radius:6px;cursor:pointer;">بريميوم</button>
                <button onclick="setUserRole('${username}', 'vip')" style="background:#f59e0b;color:black;padding:6px 12px;border:none;border-radius:6px;cursor:pointer;">VIP</button>
                <button onclick="setUserRole('${username}', 'guest')" style="background:#4b5563;color:white;padding:6px 12px;border:none;border-radius:6px;cursor:pointer;">ضيف</button>
            </div>
        `;
        panel.appendChild(rankDiv);
    }
}

// تغيير رتبة مستخدم
function setUserRole(targetUsername, newRole) {
    socket.emit('set role', { target: targetUsername, role: newRole });
    alert(`تم تعيين رتبة ${newRole} لـ ${targetUsername}`);
    document.getElementById('userProfilePanel').style.display = 'none';
}

// استقبال تحديث الرتبة (اختياري)
socket.on('role updated', ({ username, role }) => {
    console.log(`تم تحديث رتبة ${username} إلى ${role}`);
    // يمكنك هنا إعادة تحميل قائمة المستخدمين أو الرسائل إذا أردت تحديث فوري أكثر
});

// فتح الشات الخاص
document.getElementById('startPrivateChatBtn').onclick = () => {
    document.getElementById('userProfilePanel').style.display = 'none';
    document.getElementById('privateChatPanel').style.display = 'block';
    document.getElementById('privateChatWith').textContent = 'دردشة مع ' + currentPrivateChat;
};

// إرسال طلب صداقة
document.getElementById('addFriendBtn').onclick = () => {
    const target = document.getElementById('userUsername').textContent;
    if (target === myUsername) {
        alert('لا يمكنك إضافة نفسك!');
        return;
    }
    socket.emit('send friend request', target);
    alert(`تم إرسال طلب صداقة إلى ${target}`);
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
    if (msg && currentPrivateChat) {
        socket.emit('private message', { to: currentPrivateChat, msg });
        appendPrivateMessage(myUsername, msg, myAvatar, true);
        input.value = '';
    }
});

function appendPrivateMessage(username, msg, avatar, isMe) {
    const chat = document.getElementById('privateChatMessages');
    const div = document.createElement('div');
    div.className = isMe ? 'my-private-message' : 'private-message';
    div.innerHTML = `
        <img src="${avatar || 'https://via.placeholder.com/30'}" alt="${username}">
        <div class="private-content">
            <strong>${username}</strong>
            <p>${msg}</p>
        </div>
    `;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

// استقبال رسالة خاصة
socket.on('private message', ({ from, msg, avatar }) => {
    if (currentPrivateChat === from) {
        appendPrivateMessage(from, msg, avatar, false);
    } else {
        alert(`رسالة خاصة جديدة من ${from}`);
    }
});

// زر الخروج
document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        socket.disconnect();
        window.location.href = 'rooms.html';
    }
});

// ────────────────────────────────────────────────
// إضافات تحسين البروفايل (الأصدقاء - الخيارات - المميزات)
// ────────────────────────────────────────────────
document.getElementById('showMyFriendsBtn')?.addEventListener('click', () => {
    document.getElementById('profileDynamicContent').innerHTML = `
        <div style="padding: 30px 0; color: #94a3b8; font-style: italic;">
            لا يوجد أصدقاء حالياً
        </div>
    `;
});
document.getElementById('privacySettingsBtn')?.addEventListener('click', () => {
    document.getElementById('profileDynamicContent').innerHTML = `
        <div style="padding: 20px 0;">
            <p style="margin-bottom: 15px; color: #94a3b8;">من يستطيع رؤية أصدقائك؟</p>
            <div style="display: flex; flex-direction: column; gap: 12px; text-align: right; padding: 0 20px;">
                <label><input type="radio" name="privacy" value="friends" checked> الأصدقاء فقط</label>
                <label><input type="radio" name="privacy" value="everyone"> الجميع</label>
                <label><input type="radio" name="privacy" value="only_me"> أنا فقط</label>
            </div>
        </div>
    `;
});
document.getElementById('showFeaturesBtn')?.addEventListener('click', () => {
    document.getElementById('profileDynamicContent').innerHTML = `
        <div style="padding: 35px 15px; color: #94a3b8; line-height: 1.6;">
            لا يوجد مميزات حالياً<br>
            <span style="font-size: 0.95em;">ستظهر في التحديث القادم إن شاء الله</span>
        </div>
    `;
});

// ────────────────────────────────────────────────
// إضافة ميزة المنشن @username
// ────────────────────────────────────────────────
function mentionUser(username) {
    const input = document.getElementById('messageInput');
    if (!input) return;
    const mention = `@${username} `;
   
    if (input.value.trim() === '') {
        input.value = mention;
    } else {
        if (!input.value.endsWith(mention)) {
            if (input.value[input.value.length - 1] !== ' ') {
                input.value += ' ';
            }
            input.value += mention;
        }
    }
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
}
