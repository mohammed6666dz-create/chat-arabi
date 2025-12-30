const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

const socket = io();

const params = new URLSearchParams(window.location.search);
const room = params.get('room');
if (!room) window.location.href = 'rooms.html';

let myUsername = '';

// طلب الانضمام للغرفة
socket.emit('join', room, token);

// استقبال آخر 100 رسالة عند الدخول
socket.on('previous messages', (messages) => {
    const chatWindow = document.getElementById('chatWindow');
    chatWindow.innerHTML = ''; // مسح أي محتوى قديم
    messages.forEach(({ username, msg, avatar }) => {
        appendMessage(username, msg, avatar, username === myUsername);
    });
    scrollToBottom();
});

// استقبال رسالة جديدة
socket.on('message', ({ username, msg, avatar }) => {
    appendMessage(username, msg, avatar, username === myUsername);
});

// رسائل النظام (انضمام، خروج، إلخ)
socket.on('system message', msg => {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = msg;
    document.getElementById('chatWindow').appendChild(div);
    scrollToBottom();
});

// تحديث قائمة المتصلين
socket.on('update users', users => {
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
        list.appendChild(div);
    });
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

// دالة عرض الرسالة
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

// التمرير التلقائي لأسفل
function scrollToBottom() {
    const chatWindow = document.getElementById('chatWindow');
    chatWindow.scrollTop = chatWindow.scrollHeight;
}

// تحميل اسم المستخدم وصورته
async function loadMyProfile() {
    try {
        const res = await fetch('/profile', {
            headers: { Authorization: `Bearer ${token}` }
        });
        const user = await res.json();
        myUsername = user.username;
        if (user.avatar) {
            document.getElementById('avatar').src = user.avatar;
        }
    } catch (err) {
        console.error('فشل تحميل البروفايل:', err);
    }
}
loadMyProfile();

// ──────────────────────────────────────────────────────────────
//          الوظائف الجديدة للأزرار (خروج + الرئيسية)
// ──────────────────────────────────────────────────────────────

// 1. زر الخروج من الغرفة
document.getElementById('leaveRoomBtn')?.addEventListener('click', () => {
    if (confirm('هل أنت متأكد من الخروج من الغرفة؟')) {
        socket.emit('leaveRoom', room);     // إعلام السيرفر بالخروج
        socket.disconnect();                // قطع الاتصال
        window.location.href = 'rooms.html'; // أو أي صفحة تحتوي على قائمة الغرف
    }
});

// 2. زر الرئيسية - عرض الغرف بدون الخروج من الغرفة الحالية
document.querySelector('[data-action="home"]')?.addEventListener('click', () => {
    // إخفاء واجهة الدردشة الحالية
    document.querySelector('.chat-main').style.display = 'none';
    document.getElementById('messageForm').style.display = 'none';

    showRoomsOverlay();
});

// دالة عرض قائمة الغرف كـ overlay
function showRoomsOverlay() {
    let overlay = document.getElementById('rooms-overlay');
    
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'rooms-overlay';
        overlay.className = 'rooms-overlay';
        
        overlay.innerHTML = `
            <div class="rooms-content">
                <div class="rooms-header">
                    <h2>الغرف المتاحة</h2>
                    <button id="close-rooms-overlay">العودة</button>
                </div>
                <div id="rooms-list-container" class="rooms-list"></div>
            </div>
        `;
        
        document.body.appendChild(overlay);
        
        // إغلاق الـ overlay بالضغط على زر العودة أو خارج النافذة
        overlay.addEventListener('click', function handler(e) {
            if (e.target.id === 'close-rooms-overlay' || e.target === overlay) {
                overlay.style.display = 'none';
                document.querySelector('.chat-main').style.display = 'flex';
                document.getElementById('messageForm').style.display = 'flex';
                // يمكنك إزالة الحدث بعد الإغلاق الأول إذا أردت
                // overlay.removeEventListener('click', handler);
            }
        });
    }

    overlay.style.display = 'flex';

    // طلب قائمة الغرف من السيرفر
    socket.emit('getAvailableRooms');
}

// استقبال وعرض قائمة الغرف
socket.on('availableRooms', (rooms) => {
    const container = document.getElementById('rooms-list-container');
    if (!container) return;

    if (!rooms || rooms.length === 0) {
        container.innerHTML = '<p class="no-rooms">لا توجد غرف متاحة حالياً</p>';
        return;
    }

    container.innerHTML = rooms.map(r => `
        <div class="room-item ${r.name === room ? 'current-room' : ''}" data-room="${r.name}">
            <div class="room-info">
                <span class="room-name">${r.name}</span>
                <span class="room-users">(${r.userCount || 0} متصل)</span>
            </div>
            ${r.name === room ? '<span class="current-badge">الحالية</span>' : ''}
        </div>
    `).join('');

    // الانتقال إلى غرفة أخرى
    container.querySelectorAll('.room-item').forEach(item => {
        item.addEventListener('click', () => {
            const targetRoom = item.dataset.room;
            
            if (targetRoom === room) {
                // نفس الغرفة → مجرد إغلاق القائمة
                document.getElementById('rooms-overlay').style.display = 'none';
                document.querySelector('.chat-main').style.display = 'flex';
                document.getElementById('messageForm').style.display = 'flex';
                return;
            }

            if (confirm(`هل تريد الانتقال إلى ${targetRoom}؟`)) {
                socket.emit('leaveRoom', room);
                socket.emit('join', targetRoom, token);
                // إعادة توجيه مع اسم الغرفة الجديدة
                window.location.href = `/chat.html?room=${encodeURIComponent(targetRoom)}`;
            }
        });
    });
});
