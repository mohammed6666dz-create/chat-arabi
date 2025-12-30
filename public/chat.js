// chat.js - النسخة المحدثة 2025

const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

const socket = io();

const params = new URLSearchParams(window.location.search);
const currentRoom = params.get('room');
if (!currentRoom) window.location.href = 'rooms.html';

let myUsername = '';
let myUserId = null;           // مهم جداً - يجب أن يأتي من /profile
let activePrivateChats = new Map(); // userId → {element, messagesDiv, input}
let unreadPrivateCount = 0;

// ─── الاتصال بالغرفة + الرسائل العامة ───────────────────────────────
socket.emit('join', currentRoom, token);

socket.on('previous messages', (messages) => {
    const chatWindow = document.getElementById('chatWindow');
    chatWindow.innerHTML = '';
    messages.forEach(m => appendPublicMessage(m.username, m.msg, m.avatar, m.username === myUsername));
    scrollToBottom();
});

socket.on('message', ({ username, msg, avatar }) => {
    appendPublicMessage(username, msg, avatar, username === myUsername);
});

socket.on('system message', msg => {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = msg;
    document.getElementById('chatWindow').appendChild(div);
    scrollToBottom();
});

socket.on('update users', users => {
    document.getElementById('userCount').textContent = users.length;
    const list = document.getElementById('usersList');
    list.innerHTML = '';
    
    users.forEach(user => {
        const item = document.createElement('div');
        item.className = 'user-item';
        item.dataset.userId = user.id;  // ← مهم جداً
        item.innerHTML = `
            <img src="${user.avatar || 'https://via.placeholder.com/40'}" alt="${user.username}">
            <span>${user.username}</span>
        `;
        list.appendChild(item);
    });
});

document.getElementById('messageForm').onsubmit = e => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('message', msg, token);
        input.value = '';
    }
};

function appendPublicMessage(username, msg, avatar, isMe = false) {
    const chatWindow = document.getElementById('chatWindow');
    const div = document.createElement('div');
    div.className = `message ${isMe ? 'my-message' : ''}`;
    div.innerHTML = `
        <img src="${avatar || 'https://via.placeholder.com/40'}" alt="${username}">
        <div class="message-content">
            <strong>${username}</strong>
            <p>${msg}</p>
        </div>
    `;
    chatWindow.appendChild(div);
    scrollToBottom();
}

function scrollToBottom() {
    const cw = document.getElementById('chatWindow');
    cw.scrollTop = cw.scrollHeight;
}

// ─── تحميل بياناتي الشخصية ───────────────────────────────────────────
async function loadMyProfile() {
    try {
        const res = await fetch('/profile', {
            headers: { Authorization: `Bearer ${token}` }
        });
        if (!res.ok) throw new Error('فشل جلب البروفايل');
        const user = await res.json();
        
        myUsername = user.username;
        myUserId = user.id;                // ← لازم يكون موجود
        
        if (user.avatar) document.getElementById('avatar').src = user.avatar;
    } catch (err) {
        console.error('خطأ تحميل البروفايل:', err);
    }
}
loadMyProfile();

// ─── عرض بروفايل المستخدم عند النقر على صورته/اسمه ──────────────────
document.getElementById('usersList').addEventListener('click', e => {
    const item = e.target.closest('.user-item');
    if (!item) return;
    
    const username = item.querySelector('span').textContent;
    const avatar = item.querySelector('img').src;
    const userId = item.dataset.userId;
    
    if (userId === myUserId) return; // ما بنفتح بروفايل نفسي
    
    showUserProfileModal(username, avatar, userId);
});

function showUserProfileModal(username, avatar, userId) {
    const modal = document.getElementById('userProfileModal');
    if (!modal) return console.error('مودال البروفايل غير موجود في الـ HTML');
    
    document.getElementById('modalUserAvatar').src = avatar;
    document.getElementById('modalUsername').textContent = username;
    
    modal.style.display = 'block';
    
    // زر الرسائل الخاصة
    document.getElementById('btnPrivateMessage').onclick = () => {
        openPrivateChatWindow(userId, username, avatar);
        modal.style.display = 'none';
    };
    
    // زر طلب الصداقة
    document.getElementById('btnSendFriendRequest').onclick = () => {
        socket.emit('sendFriendRequest', { toUserId: userId });
        alert('تم إرسال طلب الصداقة بنجاح!');
        modal.style.display = 'none';
    };
}

// إغلاق مودال البروفايل
document.querySelectorAll('.close-modal, #userProfileModal').forEach(el => {
    el.onclick = e => {
        if (e.target === el || e.target.classList.contains('close-modal')) {
            document.getElementById('userProfileModal').style.display = 'none';
        }
    };
});

// ─── نظام الرسائل الخاصة (نوافذ صغيرة يمين الشاشة) ──────────────────
function openPrivateChatWindow(userId, username, avatar) {
    if (activePrivateChats.has(userId)) {
        const win = activePrivateChats.get(userId);
        win.element.style.display = 'block';
        win.input.focus();
        return;
    }

    const container = document.getElementById('privateChatsContainer');
    if (!container) return;

    const chatWindow = document.createElement('div');
    chatWindow.className = 'private-chat-window';
    chatWindow.innerHTML = `
        <div class="private-header">
            <img src="${avatar}" width="36" height="36" alt="">
            <span>${username}</span>
            <button class="close-private-chat">×</button>
        </div>
        <div class="private-messages" id="pm-${userId}"></div>
        <form class="private-form">
            <input type="text" placeholder="رسالتك..." autocomplete="off">
            <button type="submit">إرسال</button>
        </form>
    `;

    container.appendChild(chatWindow);

    const input = chatWindow.querySelector('input');
    const form = chatWindow.querySelector('form');
    const messagesArea = chatWindow.querySelector('.private-messages');

    form.onsubmit = e => {
        e.preventDefault();
        const text = input.value.trim();
        if (!text) return;

        socket.emit('privateMessage', { toUserId: userId, message: text });
        addPrivateMessage(messagesArea, myUsername, text, true);
        input.value = '';
    };

    chatWindow.querySelector('.close-private-chat').onclick = () => {
        chatWindow.style.display = 'none';
    };

    activePrivateChats.set(userId, {
        element: chatWindow,
        messagesArea,
        input
    });

    input.focus();
}

function addPrivateMessage(container, sender, text, isMe) {
    const msg = document.createElement('div');
    msg.className = `private-msg ${isMe ? 'my-private' : ''}`;
    msg.innerHTML = `<strong>${sender}</strong><p>${text}</p>`;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

// استقبال رسالة خاصة
socket.on('privateMessage', ({ from, message }) => {
    const { id: fromId, username, avatar } = from;

    if (activePrivateChats.has(fromId)) {
        const { messagesArea } = activePrivateChats.get(fromId);
        addPrivateMessage(messagesArea, username, message, false);
    } else {
        openPrivateChatWindow(fromId, username, avatar);
        addPrivateMessage(activePrivateChats.get(fromId).messagesArea, username, message, false);
    }

    playNotification();
    unreadPrivateCount++;
    document.getElementById('privateMsgBadge').textContent = unreadPrivateCount > 99 ? '99+' : unreadPrivateCount;
});

function playNotification() {
    try {
        const audio = new Audio('/sounds/notification.mp3'); // حط ملف صوت مناسب
        audio.volume = 0.6;
        audio.play().catch(() => {});
    } catch {}
}

// ─── طلبات الصداقة (إشعارات مبسطة حالياً) ────────────────────────────
socket.on('friendRequest', ({ from }) => {
    playNotification();
    // يمكنك هنا عرض إشعار popup أو إضافته لقائمة الطلبات
    console.log(`طلب صداقة من: ${from.username}`);
    // زيادة عداد الطلبات
    let reqCount = parseInt(document.getElementById('friendRequestsBadge').textContent) || 0;
    reqCount++;
    document.getElementById('friendRequestsBadge').textContent = reqCount > 99 ? '99+' : reqCount;
});

// يمكنك توسيع هذا الجزء لاحقاً (قبول/رفض، قائمة الأصدقاء، إلخ)

// ─── خروج + عرض الغرف ─────────────────────────────────────────────────
document.getElementById('leaveRoomBtn')?.addEventListener('click', () => {
    if (confirm('هل أنت متأكد من الخروج؟')) {
        socket.emit('leaveRoom', currentRoom);
        socket.disconnect();
        window.location.href = 'rooms.html';
    }
});

document.querySelector('[data-action="home"]')?.addEventListener('click', showRoomsOverlay);

// ... (يمكنك إعادة إضافة دالة showRoomsOverlay من النسخ السابقة إذا أردت)
