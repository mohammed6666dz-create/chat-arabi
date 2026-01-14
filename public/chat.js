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

// ←←← الإضافة الجديدة: نظام النقاط والمستويات 🔥
let myPoints = 1;  // افتراضي لأول مرة
let myLevel = 1;   // افتراضي لأول مرة

// الانضمام للغرفة
socket.emit('join', room, token);

// ←←← تغيير: استقبال آخر 300 رسالة بدل 100 🚀
socket.on('previous messages', (messages) ←←← استقبال آخر 300 رسالة بدل 100 🚀
socket.on('previous messages', (messages) => {
    const chatWindow = document.getElementById('chatWindow');
    chatWindow.innerHTML = '';
    messages.forEach(({ username, msg, avatar, role, points, level }) => {  // إضافة points و level
        appendMessage(username, msg, avatar, username === myUsername, role || 'guest', points, level);
    });
    scrollToBottom();
});

// تحديث قائمة المتصلين مع عرض النقاط والمستوى
socket.on('update users', (users) => {
    document.getElementById('userCount').innerText = users.length;
    const list = document.getElementById('usersList');
    list.innerHTML = '';
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-item';
        const badge = getUserBadge(user.username, user.role || 'guest');
        div.innerHTML = `
            <img src="${user.avatar || 'https://via.placeholder.com/40'}" alt="${user.username}">
            <div>
                <div class="username-line">${badge}<strong>${user.username}</strong></div>
                <small style="color:#fbbf24;">⭐ ${user.level || 1} | ${user.points || 1} نقطة</small>
            </div>
        `;
        div.onclick = () => openUserActions(user.username, user.role || 'guest', user.avatar, user.points, user.level);
        div.addEventListener('dblclick', (e) => {
            e.preventDefault();
            mentionUser(user.username);
        });
        list.appendChild(div);
    });
});

// رسالة عامة مع النقاط
socket.on('message', ({ username, msg, avatar, role, points, level }) => {
    appendMessage(username, msg, avatar, username === myUsername, role || 'guest', points, level);
});

// رسائل النظام (كما هي)
socket.on('system message', (msg) => {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = msg;
    document.getElementById('chatWindow').appendChild(div);
    scrollToBottom();
});

// ←←← الإضافة الجديدة: إشعار صعود المستوى 🎉
socket.on('level up announcement', ({ username, level }) => {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.style.background = 'linear-gradient(90deg, #fbbf24, #f59e0b)';
    div.style.color = '#000';
    div.style.fontWeight = 'bold';
    div.innerHTML = `🎉 مبروك! ${username} وصل للمستوى <strong>${level}</strong> 🎉<br>تفاعل أنت أيضاً وارتفع في المستويات! 🔥`;
    document.getElementById('chatWindow').appendChild(div);
    scrollToBottom();
});

// ←←← الإضافة الجديدة: تحديث نقاطي من السيرفر
socket.on('points updated', (data) => {
    if (data.username === myUsername) {
        myPoints = data.points;
        myLevel = data.level;
        updateLevelPointsDisplay();
        // تحديث المتجر أيضاً
        const shopPoints = document.getElementById('myPoints');
        if (shopPoints) shopPoints.textContent = myPoints;
    }
});

// إرسال رسالة عامة مع +1 نقطة
document.getElementById('messageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('message', msg, token);
        input.value = '';
    }
});

// ─────────────── نظام الرتب (مع إضافة النقاط والمستوى) ───────────────
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

function appendMessage(username, msg, avatar, isMe = false, role = 'guest', points = 1, level = 1) {
    const chatWindow = document.getElementById('chatWindow');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isMe ? 'my-message' : ''}`;
    const badge = getUserBadge(username, role);
    messageDiv.innerHTML = `
        <img src="${avatar || 'https://via.placeholder.com/40'}" alt="${username}"
             onclick="openUserActions('${username}', '${role}', '${avatar}', ${points}, ${level})" style="cursor:pointer;">
        <div class="message-content">
            <div class="username-line">
                ${badge}
                <strong>${username}</strong>
                <small style="color:#fbbf24; margin-right:10px;">⭐ ${level} | ${points} نقطة</small>
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

// تحميل بيانات المستخدم مع النقاط والمستوى
async function loadMyProfile() {
    try {
        const res = await fetch('/profile', {
            headers: { Authorization: token }
        });
        if (!res.ok) throw new Error('فشل جلب البروفايل');
        const user = await res.json();
        myUsername = user.username;
        myAvatar = user.avatar || 'https://via.placeholder.com/40';
        
        // ←←← الإضافة الجديدة
        myPoints = user.points || 1;
        myLevel = user.level || 1;
        updateLevelPointsDisplay();  // تحديث اللوحة
        
        const timestamp = new Date().getTime();
        document.getElementById('avatar').src = myAvatar + '?t=' + timestamp;
        document.getElementById('myProfileAvatar').src = myAvatar + '?t=' + timestamp;
        document.getElementById('myProfileUsername').textContent = myUsername;
        
        // تحديث المتجر
        const shopPoints = document.getElementById('myPoints');
        if (shopPoints) shopPoints.textContent = myPoints;
        
        console.log("🔥 تم تحميل:", myUsername, "| نقاط:", myPoints, "| مستوى:", myLevel);
    } catch (err) {
        console.error('خطأ في تحميل البروفايل:', err);
    }
}
loadMyProfile();

// ←←← دالة تحديث لوحة النقاط والمستوى
function updateLevelPointsDisplay() {
    const pointsEl = document.getElementById('myRealPoints');
    const levelEl = document.querySelector('.current-level');
    const nextEl = document.getElementById('nextLevelPoints');
    const progressEl = document.querySelector('.progress-fill');
    const currentProgressEl = document.querySelector('.progress-text span:first-child');

    if (pointsEl) pointsEl.textContent = myPoints.toLocaleString();
    if (levelEl) levelEl.textContent = myLevel;
    if (nextEl) nextEl.textContent = (myLevel * 100).toLocaleString();
    if (currentProgressEl) currentProgressEl.textContent = (myPoints % 100);

    const progress = (myPoints % 100);
    if (progressEl) progressEl.style.width = `${progress}%`;
}

// فتح لوحة البروفايل
document.getElementById('profileBtn').addEventListener('click', () => {
    document.getElementById('myProfilePanel').style.display = 'block';
    loadMyProfile();
});

// ←←← الإضافة الجديدة: فتح لوحة نقاطي ومستواي
document.getElementById('myLevelBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('levelPointsPanel');
    if (panel) {
        panel.classList.remove('hidden');
        panel.style.display = 'flex';
        updateLevelPointsDisplay();
    }
});

// إغلاق لوحة النقاط
document.addEventListener('click', (e) => {
    if (e.target.classList.contains('close-level-panel') || e.target.classList.contains('level-panel')) {
        const panel = document.getElementById('levelPointsPanel');
        if (panel) {
            panel.classList.add('hidden');
            panel.style.display = 'none';
        }
    }
});

// باقي الكود كما هو تماماً بدون أي تغيير...
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
            alert('تم رفع الصورة بنجاح! 🎉');
        } else {
            alert('فشل رفع الصورة: ' + (data.msg || 'خطأ غير معروف'));
        }
    } catch (e) {
        console.error('خطأ في رفع الصورة:', e);
        alert('حصل خطأ أثناء رفع الصورة، يرجى المحاولة مرة أخرى');
    }
});
// ─────────────── وظائف الرتب الجديدة ───────────────
function toggleRankList() {
    const list = document.getElementById('ranksListMenu');
    if (list.style.display === 'none' || list.style.display === '') {
        list.style.display = 'grid';
    } else {
        list.style.display = 'none';
    }
}
// فتح لوحة أفعال المستخدم مع النقاط والمستوى
function openUserActions(username, currentRole = 'guest', avatar = '', points = 1, level = 1) {
    document.getElementById('otherUserDisplayName').textContent = username;
    document.getElementById('otherUserAvatarLarge').src = avatar || 'https://via.placeholder.com/140';
    document.getElementById('otherPoints').textContent = points.toLocaleString();
    
    // إضافة عرض المستوى في البروفايل
    const levelDisplay = document.createElement('div');
    levelDisplay.innerHTML = `<div class="detail-item"><span>المستوى</span><span>⭐ ${level}</span></div>`;
    const details = document.querySelector('.profile-details');
    if (details) {
        // إزالة أي مستوى سابق وإضافة الجديد
        const oldLevel = details.querySelector('.detail-item:nth-of-type(6)');
        if (oldLevel) oldLevel.remove();
        details.insertBefore(levelDisplay.firstElementChild, details.children[4]);
    }

    const modal = document.getElementById('otherUserProfileModal');
    modal.classList.remove('hidden');
    modal.style.display = 'block';

    currentPrivateChat = username;
    const listMenu = document.getElementById('ranksListMenu');
    if (listMenu) listMenu.style.display = 'none';
    const rankPanel = document.getElementById('adminRankControls');
    if (rankPanel) {
        if (myUsername && myUsername.toLowerCase() === 'mohamed-dz' && username !== 'mohamed-dz') {
            rankPanel.style.display = 'block';
        } else {
            rankPanel.style.display = 'none';
        }
    }
    // جلب خلفية المستخدم الآخر
    fetch(`/get-cover?username=${encodeURIComponent(username)}`, {
        headers: { 'Authorization': token }
    })
    .then(res => res.json())
    .then(data => {
        const cover = document.getElementById('otherUserCover');
        if (cover) {
            cover.style.backgroundImage = `url(${data.cover || 'https://via.placeholder.com/800x200/0f172a/ffffff?text=لا+خلفية'})`;
        }
    })
    .catch(err => console.error('فشل جلب الخلفية:', err));
}
function closeOtherUserProfile() {
    const modal = document.getElementById('otherUserProfileModal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
}
function setUserRole(targetUsername, newRole) {
    socket.emit('set role', { target: targetUsername, role: newRole });
    alert(`تم تعيين رتبة ${newRole} لـ ${targetUsername} ✅`);
    closeOtherUserProfile();
}
socket.on('role updated', ({ username, role }) => {
    console.log(`تم تحديث رتبة ${username} إلى ${role}`);
});
// ─────────────── التحكم بإظهار / إخفاء لوحة المتصلين ───────────────
document.addEventListener('DOMContentLoaded', () => {
    const usersPanel = document.getElementById('usersPanel');
    const hideBtn = document.getElementById('hideUsersPanelBtn');
    const showBtn = document.getElementById('showUsersPanelBtn');
    hideBtn.addEventListener('click', () => {
        usersPanel.style.display = 'none';
        hideBtn.style.display = 'none';
        showBtn.style.display = 'inline-block';
    });
    showBtn.addEventListener('click', () => {
        usersPanel.style.display = 'block';
        showBtn.style.display = 'none';
        hideBtn.style.display = 'inline-block';
    });
    // فتح المتجر
    document.getElementById('shopBtn')?.addEventListener('click', () => {
        document.getElementById('shopPanel').style.display = 'block';
    });
    document.getElementById('closeShop')?.addEventListener('click', () => {
        document.getElementById('shopPanel').style.display = 'none';
    });
});
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
// ─────────────── إضافة جديدة فقط: التحكم بخلفية البروفايل ───────────────
let myCover = 'https://via.placeholder.com/800x200/0f172a/ffffff?text=خلفيتك+هنا';
document.getElementById('profileBtn').addEventListener('click', () => {
    document.getElementById('myProfilePanel').style.display = 'block';
    loadMyProfile();
   
    const coverElement = document.getElementById('myCoverPhoto');
    if (coverElement) {
        coverElement.style.backgroundImage = `url(${myCover})`;
    }
});
document.getElementById('coverUpload')?.addEventListener('change', async function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('cover', file);
    try {
        const res = await fetch('/upload-cover', {
            method: 'POST',
            headers: { 'Authorization': token },
            body: formData
        });
        const data = await res.json();
        if (data.cover) {
            myCover = data.cover + '?t=' + new Date().getTime();
            document.getElementById('myCoverPhoto').style.backgroundImage = `url(${myCover})`;
            alert('تم حفظ الخلفية بنجاح! 🎉');
        } else {
            alert('فشل حفظ الخلفية: ' + (data.msg || 'خطأ غير معروف'));
        }
    } catch (err) {
        console.error('خطأ رفع الخلفية:', err);
        alert('حصل خطأ أثناء رفع الخلفية');
    }
});
