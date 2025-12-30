const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

const socket = io();

const params = new URLSearchParams(window.location.search);
const currentRoom = params.get('room');
if (!currentRoom) window.location.href = 'rooms.html';

let myUsername = '';
let myUserId = null;
let activePrivateChats = new Map(); // userId → {element, messagesDiv, input}
let unreadPrivateMessages = 0;

// ─── الاتصال بالغرفة ───────────────────────────────────────────────────
socket.emit('join', currentRoom, token);

socket.on('previous messages', messages => {
    const chatWindow = document.getElementById('chatWindow');
    chatWindow.innerHTML = '';
    messages.forEach(m => appendMessage(m.username, m.msg, m.avatar, m.username === myUsername));
    scrollToBottom();
});

socket.on('message', ({ username, msg, avatar }) => {
    appendMessage(username, msg, avatar, username === myUsername);
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
        item.dataset.userId = user.id;
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
        socket.emit('message', msg);
        input.value = '';
    }
};

function appendMessage(username, msg, avatar, isMe = false) {
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

// ─── تحميل بيانات المستخدم الحالي ─────────────────────────────────────
async function loadMyProfile() {
    try {
        const res = await fetch('/profile', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const user = await res.json();
        myUsername = user.username;
        myUserId = user.id;
        if (user.avatar) document.getElementById('avatar').src = user.avatar;
    } catch (err) {
        console.error('خطأ في تحميل البروفايل:', err);
    }
}
loadMyProfile();

// ─── عرض بروفايل المستخدمين + أزرار الخاص والصداقة ────────────────────
document.getElementById('usersList').addEventListener('click', e => {
    const item = e.target.closest('.user-item');
    if (!item) return;

    const username = item.querySelector('span').textContent;
    const avatar = item.querySelector('img').src;
    const userId = item.dataset.userId;

    if (userId === myUserId) return; // لا نعرض بروفايل نفسي

    showUserProfile(username, avatar, userId);
});

function showUserProfile(username, avatar, userId) {
    const modal = document.getElementById('userProfileModal');
    if (!modal) return;

    document.getElementById('modalAvatar').src = avatar;
    document.getElementById('modalUsername').textContent = username;
    modal.style.display = 'block';

    // زر الرسائل الخاصة
    document.getElementById('btnPrivateChat').onclick = () => {
        openPrivateChatWindow(userId, username, avatar);
        modal.style.display = 'none';
    };

    // زر طلب الصداقة
    document.getElementById('btnAddFriend').onclick = () => {
        socket.emit('sendFriendRequest', { toUserId: userId });
        alert('تم إرسال طلب الصداقة');
        modal.style.display = 'none';
    };
}

// إغلاق مودال البروفايل
document.querySelector('#userProfileModal .close')?.onclick = () => {
    document.getElementById('userProfileModal').style.display = 'none';
};

// ─── نوافذ الدردشة الخاصة ──────────────────────────────────────────────
function openPrivateChatWindow(userId, username, avatar) {
    if (activePrivateChats.has(userId)) {
        activePrivateChats.get(userId).element.style.display = 'block';
        return;
    }

    const container = document.getElementById('privateChatsContainer');
    if (!container) return;

    const chatWin = document.createElement('div');
    chatWin.className = 'private-chat-window';
    chatWin.innerHTML = `
        <div class="private-header">
            <img src="${avatar}" width="36" height="36">
            <span>${username}</span>
            <button class="close-private">×</button>
        </div>
        <div class="private-messages"></div>
        <form class="private-form">
            <input type="text" placeholder="رسالتك..." autocomplete="off">
            <button type="submit">إرسال</button>
        </form>
    `;

    container.appendChild(chatWin);

    const input = chatWin.querySelector('input');
    const form = chatWin.querySelector('form');
    const messagesArea = chatWin.querySelector('.private-messages');

    form.onsubmit = e => {
        e.preventDefault();
        const text = input.value.trim();
        if (text) {
            socket.emit('privateMessage', { toUserId: userId, message: text });
            addPrivateMessage(messagesArea, myUsername, text, true);
            input.value = '';
        }
    };

    chatWin.querySelector('.close-private').onclick = () => {
        chatWin.style.display = 'none';
    };

    activePrivateChats.set(userId, {element: chatWin, messagesArea, input});
}

function addPrivateMessage(container, sender, text, isMe) {
    const msgDiv = document.createElement('div');
    msgDiv.className = `private-message ${isMe ? 'my-message' : ''}`;
    msgDiv.innerHTML = `<strong>${sender}</strong><p>${text}</p>`;
    container.appendChild(msgDiv);
    container.scrollTop = container.scrollHeight;
}

socket.on('privateMessage', ({from, message}) => {
    const {id: fromId, username, avatar} = from;

    if (!activePrivateChats.has(fromId)) {
        openPrivateChatWindow(fromId, username, avatar);
    }

    const {messagesArea} = activePrivateChats.get(fromId);
    addPrivateMessage(messagesArea, username, message, false);

    // إشعار + صوت + عداد
    playNotificationSound();
    unreadPrivateMessages++;
    document.getElementById('privateMsgBadge').textContent = 
        unreadPrivateMessages > 99 ? '99+' : unreadPrivateMessages;
});

function playNotificationSound() {
    try {
        new Audio('/sounds/notification.mp3').play().catch(() => {});
    } catch {}
}

// ─── طلبات الصداقة (إشعار بسيط) ───────────────────────────────────────
socket.on('friendRequest', ({fromUsername}) => {
    playNotificationSound();
    alert(`لديك طلب صداقة من ${fromUsername}`);
    // يمكن تطويره لاحقاً لعرض قائمة طلبات
});

// ─── أزرار الخروج + عرض الغرف بدون خروج ───────────────────────────────
document.getElementById('leaveRoomBtn')?.addEventListener('click', () => {
    if (confirm('هل أنت متأكد من الخروج من الغرفة؟')) {
        socket.emit('leaveRoom', currentRoom);
        window.location.href = 'rooms.html';
    }
});

document.querySelector('[data-action="home"]')?.addEventListener('click', showRoomsOverlay);

function showRoomsOverlay() {
    let overlay = document.getElementById('rooms-overlay');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'rooms-overlay';
        overlay.className = 'rooms-overlay';
        
        overlay.innerHTML = `
            <div class="rooms-content">
                <h2>اختر غرفة</h2>
                <button id="close-rooms-overlay">العودة</button>
                <div class="rooms-list">
                    <div class="room-item" data-room="general">الغرفة العامة</div>
                    <div class="room-item" data-room="algeria">غرفة الجزائر</div>
                    <div class="room-item" data-room="all_countries">كل البلدان</div>
                </div>
            </div>
        `;
        
        document.body.appendChild(overlay);

        // إغلاق الـ overlay
        overlay.addEventListener('click', e => {
            if (e.target.id === 'close-rooms-overlay' || e.target === overlay) {
                overlay.style.display = 'none';
                document.querySelector('.chat-main').style.display = 'flex';
                document.getElementById('messageForm').style.display = 'flex';
            }
        });

        // الانتقال للغرفة
        overlay.querySelectorAll('.room-item').forEach(item => {
            item.addEventListener('click', () => {
                const targetRoom = item.dataset.room;
                if (targetRoom === currentRoom) {
                    overlay.style.display = 'none';
                    document.querySelector('.chat-main').style.display = 'flex';
                    document.getElementById('messageForm').style.display = 'flex';
                    return;
                }
                if (confirm(`الانتقال إلى ${targetRoom}؟`)) {
                    socket.emit('leaveRoom', currentRoom);
                    window.location.href = `/chat.html?room=${encodeURIComponent(targetRoom)}`;
                }
            });
        });
    }

    overlay.style.display = 'flex';
    document.querySelector('.chat-main').style.display = 'none';
    document.getElementById('messageForm').style.display = 'none';
}
