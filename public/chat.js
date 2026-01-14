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
       
        // تصحيح الربط هنا لفتح اللوحة الجديدة عند الضغط على قائمة المستخدمين
        div.onclick = () => openUserActions(user.username, user.role || 'guest', user.avatar);
       
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
    if (username.toLowerCase() === 'mohamed-dz') {
        return '<span class="badge owner">مالك 👑</span>';
    }
    switch (role.toLowerCase()) {
        case 'superadmin': return '<span class="badge superadmin">سوبر أدمن ⚙️</span>';
        case 'admin': return '<span class="badge admin">أدمن 🔰</span>';
        case 'premium': return '<span class="badge premium">بريميوم 💎</span>';
        case 'vip': return '<span class="badge vip">VIP ★</span>';
        default: return '<span class="badge guest">ضيف</span>';
    }
}

function appendMessage(username, msg, avatar, isMe = false, role = 'guest') {
    const chatWindow = document.getElementById('chatWindow');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isMe ? 'my-message' : ''}`;
    const badge = getUserBadge(username, role);
    // تصحيح الربط: عند الضغط على الصورة داخل الرسالة تفتح اللوحة الجديدة
    messageDiv.innerHTML = `
        <img src="${avatar || 'https://via.placeholder.com/40'}" alt="${username}"
             onclick="openUserActions('${username}', '${role}', '${avatar}')" style="cursor:pointer;">
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
       
        console.log("تم تحميل اسم المستخدم:", myUsername);
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

// ─────────────── وظائف الرتب الجديدة ───────────────
// وظيفة إظهار/إخفاء قائمة الرتب (التي تظهر عند الضغط على "إهداء رتبة")
function toggleRankList() {
    const list = document.getElementById('ranksListMenu');
    if (list.style.display === 'none' || list.style.display === '') {
        list.style.display = 'grid';
    } else {
        list.style.display = 'none';
    }
}

// فتح لوحة أفعال المستخدم + أزرار الرتب
function openUserActions(username, currentRole = 'guest', avatar = '') {
    // 1. تعبئة البيانات في اللوحة الكبيرة الجديدة
    document.getElementById('otherUserDisplayName').textContent = username;
    document.getElementById('otherUserAvatarLarge').src = avatar || 'https://via.placeholder.com/140';
   
    // 2. إظهار اللوحة الجديدة
    const modal = document.getElementById('otherUserProfileModal');
    modal.classList.remove('hidden');
    modal.style.display = 'block';
   
    currentPrivateChat = username;
    // 3. تصفير حالة قائمة الرتب (إخفاؤها في كل مرة نفتح بروفايل جديد)
    const listMenu = document.getElementById('ranksListMenu');
    if (listMenu) listMenu.style.display = 'none';
    // 4. التحكم في ظهور زر "إهداء رتبة" للمالك فقط
    const rankPanel = document.getElementById('adminRankControls');
    if (rankPanel) {
        if (myUsername && myUsername.toLowerCase() === 'mohamed-dz' && username !== 'mohamed-dz') {
            rankPanel.style.display = 'block';
        } else {
            rankPanel.style.display = 'none';
        }
    }
}

// وظيفة لإغلاق اللوحة الجديدة
function closeOtherUserProfile() {
    const modal = document.getElementById('otherUserProfileModal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
}

// تغيير رتبة مستخدم
function setUserRole(targetUsername, newRole) {
    socket.emit('set role', { target: targetUsername, role: newRole });
    alert(`تم تعيين رتبة ${newRole} لـ ${targetUsername}`);
    closeOtherUserProfile(); // إغلاق اللوحة بعد التعديل
}

// استقبال تحديث الرتبة
socket.on('role updated', ({ username, role }) => {
    console.log(`تم تحديث رتبة ${username} إلى ${role}`);
});

// ─────────────── التحكم بإظهار / إخفاء لوحة المتصلين ───────────────
document.addEventListener('DOMContentLoaded', () => {
    const usersPanel = document.getElementById('usersPanel');
    const hideBtn   = document.getElementById('hideUsersPanelBtn');
    const showBtn   = document.getElementById('showUsersPanelBtn');

    if (!usersPanel || !hideBtn || !showBtn) return;

    // الحالة الافتراضية
    usersPanel.style.display = 'block';
    hideBtn.style.display = 'inline-block';
    showBtn.style.display = 'none';

    hideBtn.addEventListener('click', () => {
        usersPanel.style.display = 'none';
        hideBtn.style.display = 'none';
        showBtn.style.display = 'inline-block';
    });

    showBtn.addEventListener('click', () => {
        usersPanel.style.display = 'block';  // أو '' حسب ما يناسب الـ css الخاص بك
        showBtn.style.display = 'none';
        hideBtn.style.display = 'inline-block';
    });
});

// باقي الكود كما هو تماماً
document.getElementById('startPrivateChatBtn').onclick = () => {
    closeOtherUserProfile();
    document.getElementById('privateChatPanel').style.display = 'block';
    document.getElementById('privateChatWith').textContent = 'دردشة مع ' + currentPrivateChat;
};

document.getElementById('addFriendBtn').onclick = () => {
    const target = document.getElementById('otherUserDisplayName').textContent;
    if (target === myUsername) {
        alert('لا يمكنك إضافة نفسك!');
        return;
    }
    socket.emit('send friend request', target);
    alert(`تم إرسال طلب صداقة إلى ${target}`);
    closeOtherUserProfile();
};

document.getElementById('closePrivateChat').addEventListener('click', () => {
    document.getElementById('privateChatPanel').style.display = 'none';
});

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

socket.on('private message', ({ from, msg, avatar }) => {
    if (currentPrivateChat === from) {
        appendPrivateMessage(from, msg, avatar, false);
    } else {
        alert(`رسالة خاصة جديدة من ${from}`);
    }
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    if (confirm('هل أنت متأكد من تسجيل الخروج؟')) {
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        socket.disconnect();
        window.location.href = 'rooms.html';
    }
});

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

document.getElementById('showMyFriendsBtn')?.addEventListener('click', () => {
    document.getElementById('profileDynamicContent').innerHTML = `
        <div style="padding: 30px 0; color: #94a3b8; font-style: italic;">
            لا يوجد أصدقاء حالياً
        </div>
    `;
});
