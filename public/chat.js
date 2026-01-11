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

// رسالة عامة
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

// رفع الصورة الشخصية  ← الجزء المصحح
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

            // الصورة الكبيرة في لوحة البروفايل الشخصي
            document.getElementById('myProfileAvatar').src = data.avatar + '?t=' + timestamp;

            // الصورة الصغيرة في الهيدر
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

// فتح لوحة أفعال المستخدم
function openUserActions(username) {
    document.getElementById('userUsername').textContent = username;
    document.getElementById('userAvatar').src = 'https://via.placeholder.com/90';
    document.getElementById('userProfilePanel').style.display = 'block';
    currentPrivateChat = username;
}

// فتح الشات الخاص
document.getElementById('startPrivateChatBtn').onclick = () => {
    document.getElementById('userProfilePanel').style.display = 'none';
    document.getElementById('privateChatPanel').style.display = 'block';
    document.getElementById('privateChatWith').textContent = 'دردشة مع ' + currentPrivateChat;
};

// إرسال طلب صداقة (مثال بسيط)
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
    if (msg && currentPrivateChat) {
        socket.emit('private message', { to: currentPrivateChat, msg });
        appendPrivateMessage(myUsername, msg, myAvatar, true);
        input.value = '';
    }
});

// عرض الرسالة الخاصة
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
// الإضافات الجديدة فقط (صداقة + إشعارات + تحسين)
// ────────────────────────────────────────────────
let friendRequests = [];
let notifications = [];

// استقبال إشعار جديد
socket.on('new notification', (notif) => {
    notifications.push(notif);
    updateNotificationsBadge();
    if (notif.type === 'friend_request') {
        friendRequests.push(notif.from);
        updateFriendRequestsBadge();
    }
});

// تحديث عداد الإشعارات
function updateNotificationsBadge() {
    const badge = document.getElementById('notificationsBadge');
    if (badge) {
        const count = notifications.length;
        badge.textContent = count;
        badge.style.display = count > 0 ? 'inline' : 'none';
    }
}

// تحديث عداد طلبات الصداقة
function updateFriendRequestsBadge() {
    const badge = document.getElementById('friendReqBadge');
    const count = friendRequests.length;
    badge.textContent = count;
    badge.style.display = count > 0 ? 'inline' : 'none';
}

// فتح لوحة طلبات الصداقة
document.getElementById('friendReqBtn')?.addEventListener('click', () => {
    document.getElementById('friendRequestsPanel').style.display = 'block';
    updateFriendRequestsList();
});

// إغلاق لوحة طلبات الصداقة
document.getElementById('closeFriendReq')?.addEventListener('click', () => {
    document.getElementById('friendRequestsPanel').style.display = 'none';
});

function updateFriendRequestsList() {
    const container = document.getElementById('friendRequestsList');
    if (!container) return;
    container.innerHTML = friendRequests.length === 0
        ? '<p>لا توجد طلبات صداقة حالياً</p>'
        : '';
    friendRequests.forEach(from => {
        const item = document.createElement('div');
        item.className = 'friend-request-item';
        item.innerHTML = `
            <div>${from} أرسل لك طلب صداقة</div>
            <div>
                <button onclick="acceptFriendRequest('${from}')">قبول</button>
                <button onclick="rejectFriendRequest('${from}')">رفض</button>
            </div>
        `;
        container.appendChild(item);
    });
}

// قبول / رفض طلب
window.acceptFriendRequest = function(from) {
    socket.emit('accept friend request', from);
    friendRequests = friendRequests.filter(u => u !== from);
    updateFriendRequestsList();
    updateFriendRequestsBadge();
};

window.rejectFriendRequest = function(from) {
    socket.emit('reject friend request', from);
    friendRequests = friendRequests.filter(u => u !== from);
    updateFriendRequestsList();
    updateFriendRequestsBadge();
};

// تحسين زر إضافة صديق
document.getElementById('addFriendBtn').onclick = function() {
    const target = document.getElementById('userUsername').textContent;
    if (target === myUsername) {
        alert('لا يمكنك إضافة نفسك!');
        return;
    }
    socket.emit('send friend request', target);
    alert(`تم إرسال طلب صداقة إلى ${target}`);
    document.getElementById('userProfilePanel').style.display = 'none';
};
