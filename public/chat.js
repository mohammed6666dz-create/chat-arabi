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
// ─────────────── إضافة نظام النقاط والمستويات ───────────────
let myPoints = 1; // القيمة الافتراضية لأول مرة
let myLevel = 1;
// صوت الطاق (عصفور)
// استخدام الرابط المحلي للملف الذي رفعته
const mentionSound = new Audio('./bird-chirp-short.mp3');
mentionSound.volume = 0.7;
socket.emit('join', room, token);
socket.on('previous messages', (messages) => {
    const chatWindow = document.getElementById('chatWindow');
    chatWindow.innerHTML = '';
    messages.forEach(({ username, msg, avatar, role }) => {
        appendMessage(username, msg, avatar, username === myUsername, role || 'guest');
    });
    scrollToBottom();
});
socket.on('update users', (users) => {
    document.getElementById('userCount').innerText = users.length;
   
    // 1. تفريغ جميع الأجنحة قبل إعادة التوزيع
    const groups = ['list-owner', 'list-superadmin', 'list-premium', 'list-guest', 'list-offline'];
    groups.forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = '';
    });

    let ownerCount = 0;
    let kingsCount = 0;
    let premiumCount = 0;
    let guestCount = 0;

    // 2. توزيع المستخدمين بناءً على الرتبة والاسم
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <img src="${user.avatar || 'https://via.placeholder.com/40'}" alt="${user.username}">
            <span>${user.username}</span>
        `;
       
        div.onclick = () => openUserProfile(user.username, user.role || 'guest', user.avatar);
        div.addEventListener('dblclick', (e) => {
            e.preventDefault();
            mentionUser(user.username);
        });

        // تحديد الجناح المستهدف
        let targetListId = 'list-guest';
        const usernameUpper = (user.username || '').toUpperCase();
        const roleLower = (user.role || 'guest').toLowerCase();

        // 1. صاحب الموقع (أولوية أولى)
        if (
            usernameUpper.includes('MOHAMED') ||
            usernameUpper.includes('محمد') ||
            roleLower.includes('صاحب') ||
            roleLower.includes('مالك') ||
            roleLower.includes('owner')
        ) {
            targetListId = 'list-owner';
            ownerCount++;
        }
        // 2. جناح الملوك (سوبر أدمن، أدمن، ملك...)
        else if (
            roleLower.includes('سوبر') ||
            roleLower.includes('superadmin') ||
            roleLower.includes('admin') ||
            roleLower.includes('أدمن') ||
            roleLower.includes('ملك')
        ) {
            targetListId = 'list-superadmin';
            kingsCount++;
        }
        // 3. جناح المميزين (بريميوم، VIP، مميز...)
        else if (
            roleLower.includes('بريميوم') ||
            roleLower.includes('premium') ||
            roleLower.includes('vip') ||
            roleLower.includes('مميز')
        ) {
            targetListId = 'list-premium';
            premiumCount++;
        }
        // 4. باقي الأعضاء
        else {
            targetListId = 'list-guest';
            guestCount++;
        }

        const targetContainer = document.getElementById(targetListId);
        if (targetContainer) {
            targetContainer.appendChild(div);
        }
    });

    // إخفاء الأجنحة الفارغة (اختياري - يجعل الشكل أنظف)
    document.getElementById('group-owner').style.display = ownerCount > 0 ? 'block' : 'none';
    document.getElementById('group-superadmin').style.display = kingsCount > 0 ? 'block' : 'none';
    document.getElementById('group-premium').style.display = premiumCount > 0 ? 'block' : 'none';
    document.getElementById('group-guest').style.display = guestCount > 0 ? 'block' : 'none';
});
socket.on('message', ({ username, msg, avatar, role, border }) => {
    // أضفنا متغير border لضمان ظهور الإطار الدائم للجميع
    appendMessage(username, msg, avatar, username === myUsername, role || 'guest', border || 'none');
});
socket.on('system message', (msg) => {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = msg;
    document.getElementById('chatWindow').appendChild(div);
    scrollToBottom();
});
// استقبال إشعار الطاق الخاص (يصل فقط للشخص المذكور) - صوت فقط
socket.on('mention notification', ({ from, room }) => {
    // تشغيل الصوت فقط
    mentionSound.currentTime = 0;
    mentionSound.play().catch(err => {
        console.log("مشكلة تشغيل صوت الطاق:", err);
    });
    // تم حذف كود إنشاء الإشعار المكتوب (div) ليبقى الصوت فقط
});
// ─────────────── إرسال رسالة + زيادة نقطة ───────────────
document.getElementById('messageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('message', msg, token);
        input.value = '';
        // إضافة محلية مؤقتة
        myPoints++;
        updatePointsLevelDisplay();
    }
});
// ─────────────── استقبال تحديث النقاط والمستوى من السيرفر ───────────────
socket.on('your points updated', ({ points, level }) => {
    myPoints = points;
    myLevel = level;
    updatePointsLevelDisplay();
});
// ─────────────── إعلان صعود مستوى في الشات العام ───────────────
socket.on('level up broadcast', ({ username, newLevel }) => {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.style.background = 'linear-gradient(135deg, #fbbf24, #d97706)';
    div.style.color = '#111';
    div.style.fontWeight = 'bold';
    div.innerHTML = `🎉 مبروك! <strong>${username}</strong> وصل للمستوى <strong>${newLevel}</strong> 🎉<br>تفاعل أنت أيضاً وارتفع في المستويات! 🔥`;
    document.getElementById('chatWindow').appendChild(div);
    scrollToBottom();
});
// ─────────────── دالة تحديث عرض النقاط والمستوى في اللوحة ───────────────
function updatePointsLevelDisplay() {
    const pointsEl = document.getElementById('myRealPoints');
    const levelEl = document.querySelector('.current-level');
    const nextEl = document.getElementById('nextLevelPoints');
    const progress = document.querySelector('.progress-fill');
    if (pointsEl) pointsEl.textContent = myPoints;
    if (levelEl) levelEl.textContent = myLevel;
    if (nextEl) nextEl.textContent = myLevel * 100;
    const progressPercent = (myPoints % 100);
    if (progress) progress.style.width = `${progressPercent}%`;
}
// ─────────────── فتح لوحة نقاطي ومستواي ───────────────
document.getElementById('myLevelBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('levelPointsPanel');
    if (panel) {
        panel.classList.remove('hidden');
        if (panel.style.display === 'none' || !panel.style.display) {
            panel.style.display = 'block';
        }
        updatePointsLevelDisplay();
    }
});
// ─────────────── إغلاق لوحة نقاطي ومستواي ───────────────
document.querySelector('.close-level-panel')?.addEventListener('click', () => {
    const panel = document.getElementById('levelPointsPanel');
    if (panel) {
        panel.classList.add('hidden');
        panel.style.display = 'none';
    }
});
// ─────────────── جعل البريميوم مجاني في المتجر ───────────────
document.querySelectorAll('.buy-btn[data-role="premium"]').forEach(btn => {
    btn.addEventListener('click', function() {
        const role = this.getAttribute('data-role');
 
        socket.emit('buy role', { role: role });
 
        const originalText = this.textContent;
        this.textContent = 'جاري الشراء...';
        this.disabled = true;
 
        setTimeout(() => {
            this.textContent = originalText;
            this.disabled = false;
        }, 1500);
    });
});
socket.on('role purchased', ({ role, success, message }) => {
    if (success) {
        loadMyProfile();
        const chatWindow = document.getElementById('chatWindow');
        const div = document.createElement('div');
        div.className = 'system-message';
     
        div.style.background = 'linear-gradient(135deg, #8b5cf6, #6d28d9)';
        div.style.color = '#fff';
        div.style.fontWeight = 'bold';
        div.style.padding = '12px';
        div.style.borderRadius = '10px';
        div.style.margin = '10px 0';
        div.style.textAlign = 'center';
        div.style.boxShadow = '0 4px 15px rgba(139, 92, 246, 0.3)';
     
        div.innerHTML = `💎 مبروك! البطل <strong>${myUsername}</strong> حصل على رتبة <strong>${role.toUpperCase()}</strong> 🎉`;
     
        chatWindow.appendChild(div);
        scrollToBottom();
    } else {
        alert(message || 'فشل الحصول على الرتبة');
    }
});
function getUserBadge(username, role = 'guest') {
    const lowerUsername = username.toLowerCase();
    if (lowerUsername === 'nour') {
        return '<span class="badge owner">مديرة الموقع 👑</span>';
    }
    if (lowerUsername === 'mohamed') {
        return '<span class="badge owner">صاحب الموقع 👑</span>';
    }
    if (lowerUsername === 'malak16') {
        return '<span class="badge owner">ملكة الموقع🌹</span>';
    }
    switch (role.toLowerCase()) {
        case 'superadmin':
            return '<span class="badge superadmin">superadmin 🌟</span>';
        case 'admin':
            return '<span class="badge admin">admin 🛡️</span>';
        case 'بريميوم':
            return '<span class="badge premium">premium 💎</span>';
        case 'vip':
            return '<span class="badge vip">VIP ★</span>';
        default:
            return '<span class="badge guest">ضيف</span>';
    }
}
// --- كود معالجة إرسال الصور ---
document.getElementById('imageInput')?.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const imageData = event.target.result;
        const imgTag = `<img src="${imageData}" style="max-width:100%; border-radius:10px; display:block; margin-top:5px; cursor:pointer;" onclick="window.open(this.src)">`;
        socket.emit('message', imgTag, token);
        myPoints++;
        updatePointsLevelDisplay();
    };
    reader.readAsDataURL(file);
    this.value = '';
});
document.addEventListener('paste', function(e) {
    const items = (e.clipboardData || e.originalEvent.clipboardData).items;
    for (let index in items) {
        const item = items[index];
        if (item.kind === 'file' && item.type.startsWith('image/')) {
            const blob = item.getAsFile();
            const reader = new FileReader();
            reader.onload = function(event) {
                const imageData = event.target.result;
                const imgTag = `<img src="${imageData}" style="max-width:100%; border-radius:10px; display:block; margin-top:5px; cursor:pointer;" onclick="window.open(this.src)">`;
                socket.emit('message', imgTag, token);
                myPoints++;
                updatePointsLevelDisplay();
            };
            reader.readAsDataURL(blob);
        }
    }
});
// ─────────────── دالة إضافة الرسالة (مع إمكانية المنشن بالضغط على الاسم) ───────────────
function appendMessage(username, msg, avatar, isMe = false, role = 'guest', border = 'none') {
    const chatWindow = document.getElementById('chatWindow');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isMe ? 'my-message' : ''}`;
    const badge = getUserBadge(username, role);
   
    let formattedMsg = msg.replace(/@(\w+)/g, '<span style="color:#3b82f6; font-weight:bold;">@$1</span>');
    messageDiv.innerHTML = `
        <img src="${avatar || 'https://via.placeholder.com/40'}" alt="${username}"
             onclick="openUserProfile('${username}', '${role}', '${avatar}')"
             style="cursor:pointer; border: ${border}; border-radius: 50%; width: 42px; height: 42px; object-fit: cover; padding: 2px;">
        <div class="message-content">
            <div class="username-line">
                ${badge}
                <strong onclick="mentionUser('${username}'); event.stopPropagation();"
                        style="cursor:pointer; color: #3b82f6;">
                    ${username}
                </strong>
            </div>
            <p>${formattedMsg}</p>
        </div>
    `;
    chatWindow.appendChild(messageDiv);
    scrollToBottom();
}
function scrollToBottom() {
    const chatWindow = document.getElementById('chatWindow');
    chatWindow.scrollTop = chatWindow.scrollHeight;
}
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
        updateFriendRequestBadge(user.friend_requests);
        updateMessageBadge(user.unread_messages || 0); // تحديث عداد الرسائل عند التحميل
        window.myFriends = user.friends || []; // تخزين قائمة الأصدقاء
        window.myRank = user.rank; // تخزين الرتبة لاستخدامها في أزرار الإدارة
        console.log("تم تحميل اسم المستخدم:", myUsername);
    } catch (err) {
        console.error('خطأ في تحميل البروفايل:', err);
    }
}
loadMyProfile();
document.getElementById('profileBtn').addEventListener('click', () => {
    document.getElementById('myProfilePanel').style.display = 'block';
    loadMyProfile();
});
document.getElementById('closeMyProfile').addEventListener('click', () => {
    document.getElementById('myProfilePanel').style.display = 'none';
});
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
function toggleRankList() {
    const list = document.getElementById('ranksListMenu');
    if (list.style.display === 'none' || list.style.display === '') {
        list.style.display = 'grid';
    } else {
        list.style.display = 'none';
    }
}
function openUserProfile(username, role = 'guest', avatar = '') {
    document.getElementById('otherUserDisplayName').textContent = username;
    document.getElementById('otherUserAvatarLarge').src = avatar || 'https://via.placeholder.com/80';
    const modal = document.getElementById('otherUserProfileModal');
    modal.classList.remove('hidden');
 modal.style.display = 'flex';
    modal.style.overflowY = 'auto'; // يسمح بالتمرير إذا زاد طول المحتوى
    modal.style.maxHeight = '90vh';
 // --- كود إغلاق الملف للجميع (مستخدم عادي وأدمن) ---
   
    // --- إخفاء أزرار التفاعل إذا كان الملف يخصني ---
    const isMe = (username === myUsername);
    const msgBtn = document.getElementById('sendPrivateMsgBtn');
    const friendBtn = document.getElementById('addFriendFromProfile');
    const reportBtns = document.querySelectorAll('.report-btn');
    if (msgBtn) msgBtn.style.display = isMe ? 'none' : 'inline-block';
    if (friendBtn) friendBtn.style.display = isMe ? 'none' : 'inline-block';
    reportBtns.forEach(btn => btn.style.display = isMe ? 'none' : 'inline-block');
    // 1. الإغلاق عند الضغط على المساحة الفارغة خارج البروفايل
    modal.onclick = (e) => {
        if (e.target === modal) closeOtherUserProfile();
    };
    // 2. إضافة زر (X) صغير في الزاوية العلوية يظهر للجميع
    let closeX = document.getElementById('globalProfileCloseBtn');
    if (!closeX) {
        closeX = document.createElement('div');
        closeX.id = 'globalProfileCloseBtn';
        closeX.innerHTML = '×';
        closeX.style = "position: absolute; top: 10px; right: 20px; font-size: 28px; color: white; cursor: pointer; font-weight: bold; z-index: 1000;";
        closeX.onclick = closeOtherUserProfile;
        modal.appendChild(closeX);
    }
     const adminBtn = document.getElementById('adminCommandsBtn');
    // --- تحديث زر الصداقة (إضافة / إلغاء) ---
    if (friendBtn) {
        // إزالة أي أحداث سابقة لتجنب التكرار
        const newBtn = friendBtn.cloneNode(true);
        friendBtn.parentNode.replaceChild(newBtn, friendBtn);
       
        if (window.myFriends && window.myFriends.includes(username)) {
            newBtn.textContent = 'إلغاء الصداقة';
            newBtn.style.backgroundColor = '#ef4444'; // لون أحمر
            newBtn.onclick = () => {
                if(confirm(`هل أنت متأكد من إلغاء الصداقة مع ${username}؟`)) {
                    socket.emit('remove friend', username);
                    closeOtherUserProfile();
                }
            };
        } else {
            newBtn.textContent = 'إضافة صديق';
            newBtn.style.backgroundColor = '#10b981'; // لون أخضر
            newBtn.onclick = () => {
                socket.emit('send friend request', username);
                alert(`تم إرسال طلب صداقة إلى ${username}`);
                closeOtherUserProfile();
            };
        }
    }
    if (adminBtn) {
        const myName = (myUsername || '').toLowerCase().trim();
        adminBtn.style.display = (myName === 'mohamed-dz' || myName === 'nour') ? 'flex' : 'none';
    }
 // --- كود أزرار الإدارة الجديد ---
 // --- كود أزرار الإدارة المحسن (يوضع في السطر 331) ---
    const adminBox = document.getElementById('adminActionsContainer');
    const myStoredName = localStorage.getItem('username'); // نتحقق من اسمك المسجل
    if (adminBox) {
        // نتحقق إذا كنت أنت محمد أو نور أو رتبتك إدارية
        if (myStoredName === 'mohamed-dz' || myStoredName === 'nour' || ['مالك', 'superadmin', 'admin'].includes(window.myRank)) {
            adminBox.style.display = 'block';
   adminBox.innerHTML = `
            <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 4px; margin-top: 10px; padding: 5px; background: rgba(0,0,0,0.3); border-radius: 8px;">
                <button onclick="adminAction('kick', '${username}')" style="background: #e67e22; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">طرد 🚪</button>
                <button onclick="adminAction('mute', '${username}')" style="background: #f1c40f; color: black; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">كتم 🔇</button>
                <button onclick="adminAction('ban', '${username}')" style="background: #e74c3c; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">حظر 🚫</button>
               
                <button onclick="adminAction('unmute', '${username}')" style="background: #2ecc71; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">فك كتم ✅</button>
                <button onclick="adminAction('unban', '${username}')" style="background: #3498db; color: white; border: none; padding: 5px; border-radius: 4px; cursor: pointer; font-size: 11px; font-weight: bold;">فك حظر 🔓</button>
               
                <button onclick="closeOtherUserProfile()" style="grid-column: span 3; background: #555; color: white; border: none; padding: 4px; margin-top: 2px; border-radius: 4px; cursor: pointer; font-size: 10px;">إغلاق النافذة ×</button>
            </div>
        `;
        } else {
            adminBox.style.display = 'none';
        }
    }
    currentPrivateChat = username;
}
function showProfile() {
    const name = document.getElementById('otherUserDisplayName').textContent;
    alert(`جاري عرض الملف الشخصي لـ ${name}`);
}
function startPrivateChat(targetName) {
    const name = targetName || document.getElementById('otherUserDisplayName').textContent;
    closeOtherUserProfile();
 
    currentPrivateChat = name;
    document.getElementById('privateChatPanel').style.display = 'block';
    document.getElementById('privateChatWith').textContent = 'دردشة مع ' + name;
    socket.emit('join private', name);
    socket.emit('mark messages read', name); // تعليم الرسائل كمقروءة
    socket.emit('get private messages', name);
}
function showAdminCommands() {
    const name = document.getElementById('otherUserDisplayName').textContent;
    alert(`الأوامر الإدارية لـ ${name}\n(حظر - طرد - كتم - فك الحظر...)`);
}
function closeOtherUserProfile() {
    const modal = document.getElementById('otherUserProfileModal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
}
function setUserRole(targetUsername, newRole) {
    socket.emit('set role', { target: targetUsername, role: newRole });
    alert(`تم تعيين رتبة ${newRole} لـ ${targetUsername}`);
    closeOtherUserProfile();
}
socket.on('role updated', ({ username, role }) => {
    console.log(`تم تحديث رتبة ${username} إلى ${role}`);
});
document.addEventListener('DOMContentLoaded', () => {
    const usersPanel = document.getElementById('usersPanel');
    const hideBtn = document.getElementById('hideUsersPanelBtn');
    const showBtn = document.getElementById('showUsersPanelBtn');
    if (!usersPanel || !hideBtn || !showBtn) return;
    usersPanel.style.display = 'block';
    hideBtn.style.display = 'inline-block';
    showBtn.style.display = 'none';
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
});
document.getElementById('sendPrivateMsgBtn').onclick = () => {
    startPrivateChat();
};
document.getElementById('closePrivateChat').addEventListener('click', () => {
    document.getElementById('privateChatPanel').style.display = 'none';
});
document.getElementById('privateChatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const input = document.getElementById('privateChatInput');
    const msg = input.value.trim();
 
    if (msg && currentPrivateChat) {
        socket.emit('private message', {
            to: currentPrivateChat,
            msg
        });
     
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
socket.on('private message', ({ from, to, msg, avatar }) => {
    if (from === myUsername) return; // منع تكرار الرسالة لأنها أضيفت محلياً
    if (currentPrivateChat === from || currentPrivateChat === to) {
        const isMe = from === myUsername;
        appendPrivateMessage(
            isMe ? myUsername : from,
            msg,
            isMe ? myAvatar : (avatar || 'https://via.placeholder.com/30'),
            isMe
        );
    } else {
        console.log(`رسالة خاصة جديدة من ${from}`);
    }
});
socket.on('previous private messages', ({ withUser, messages }) => {
    if (currentPrivateChat !== withUser) return;
 
    const chat = document.getElementById('privateChatMessages');
    chat.innerHTML = '';
 
    messages.forEach(m => {
        const isMe = m.from === myUsername;
        appendPrivateMessage(
            isMe ? myUsername : m.from,
            m.msg,
            isMe ? myAvatar : (m.avatar || 'https://via.placeholder.com/30'),
            isMe
        );
    });
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
    let current = input.value.trim();
  
    if (current === '') {
        input.value = mention;
    } else {
        if (!current.endsWith(mention.trim())) {
            if (current[current.length - 1] !== ' ') {
                current += ' ';
            }
            current += mention;
            input.value = current;
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
            alert('تم حفظ الخلفية بنجاح!');
        } else {
            alert('فشل حفظ الخلفية: ' + (data.msg || 'خطأ غير معروف'));
        }
    } catch (err) {
        console.error('خطأ رفع الخلفية:', err);
        alert('حصل خطأ أثناء رفع الخلفية');
    }
});
document.addEventListener('DOMContentLoaded', () => {
    const emojiBtn = document.getElementById('emojiBtn');
    const emojiPicker = document.getElementById('emojiPicker');
    const messageInput = document.getElementById('messageInput');
 
    if (!emojiBtn || !emojiPicker || !messageInput) return;
 
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle('hidden');
    });
 
    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.classList.add('hidden');
        }
    });
 
    document.querySelectorAll('.emoji-tab')?.forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.emoji-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            document.querySelectorAll('.emoji-grid').forEach(grid => {
                grid.classList.add('hidden');
            });
            document.getElementById(`tab-${tab.dataset.tab}`)?.classList.remove('hidden');
        });
    });
 
    emojiPicker.addEventListener('click', function(e) {
        let emojiToInsert = '';
        if (e.target.tagName === 'SPAN') {
            emojiToInsert = e.target.textContent.trim();
        }
        else if (e.target.tagName === 'IMG') {
            emojiToInsert = `<img src="${e.target.src}" style="width:30px; height:30px; vertical-align:middle;">`;
        }
        if (emojiToInsert) {
            const input = document.getElementById('messageInput');
            const start = input.selectionStart;
            const end = input.selectionEnd;
            input.value =
                input.value.substring(0, start) +
                emojiToInsert +
                input.value.substring(end);
            const newPos = start + emojiToInsert.length;
            input.setSelectionRange(newPos, newPos);
            input.focus();
        }
    });
});
function toggleRankListMenu() {
    const menu = document.getElementById('ranksListMenu');
    if (menu) {
        menu.style.display = (menu.style.display === 'none' || menu.style.display === '') ? 'grid' : 'none';
    }
}
function giftUserRole(role) {
    const target = document.getElementById('otherUserDisplayName').textContent;
    if (!target) return alert("لم يتم العثور على اسم المستخدم");
    if (confirm(`هل تريد منح رتبة [${role}] للمستخدم [${target}]؟`)) {
        socket.emit('change-rank-gift', {
            targetUsername: target,
            newRank: role
        });
        document.getElementById('ranksListMenu').style.display = 'none';
    }
}
function checkUserFullData() {
    const target = document.getElementById('otherUserDisplayName').textContent;
    alert("جارٍ فحص بيانات المستخدم: " + target);
}
const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
        if (mutation.attributeName === "class") {
            const modal = document.getElementById('otherUserProfileModal');
            const adminPanel = document.getElementById('adminActionsContainer');
            if (modal && !modal.classList.contains('hidden') && adminPanel) {
                // يمكن إضافة منطق إضافي هنا إذا لزم الأمر
            }
        }
    });
});
const targetModal = document.getElementById('otherUserProfileModal');
if (targetModal) {
    observer.observe(targetModal, { attributes: true });
}
// --- كود استقبال إشارة الحظر ---
socket.on('execute-ban', (data) => {
    const myCurrentUsername = localStorage.getItem('username');
    if (data.target === myCurrentUsername) {
        document.body.innerHTML = `
            <div style="position:fixed; top:0; left:0; width:100vw; height:100vh; background:#000; z-index:10000000; display:flex; align-items:center; justify-content:center;">
                <h1 style="color:red;">تم حظرك من الموقع</h1>
            </div>`;
        socket.disconnect();
    }
});
// --- كود استقبال إشارة الكتم ---
socket.on('mute-update', (data) => {
    const myName = localStorage.getItem('username');
    if (data.target === myName) {
        window.isMuted = data.status;
        if (data.status) {
            alert("🔇 لقد تم كتمك من قبل الإدارة.");
        } else {
            alert("🔊 تم فك الكتم عنك.");
        }
    }
});
// منع إرسال الرسائل إذا كان المستخدم مكتوماً
document.getElementById('messageForm').addEventListener('submit', (e) => {
    if (window.isMuted) {
        e.stopImmediatePropagation();
        e.preventDefault();
        alert("🔇 لا يمكنك إرسال رسائل، أنت مكتوم حالياً!");
    }
}, true);
function adminAction(actionType, targetName) {
    const actionsNames = { kick: 'طرد', mute: 'كتم', ban: 'حظر', unmute: 'فك كتم', unban: 'فك حظر' };
    if (confirm(`هل أنت متأكد من تنفيذ ${actionsNames[actionType]} على ${targetName}؟`)) {
        socket.emit('admin command', {
            action: actionType,
            target: targetName,
            token: localStorage.getItem('token')
        });
    }
}
let selectedBorderTemp = "";
function updateAvatarBorder(border) {
    selectedBorderTemp = border;
    const myAvatar = document.getElementById('myProfileAvatar');
    if (myAvatar) {
        myAvatar.style.border = border === 'none' ? '5px solid #0f172a' : border;
    }
}
function saveBorderSelection() {
    if (selectedBorderTemp !== "") {
        socket.emit('update-user-border', {
            border: selectedBorderTemp,
            token: localStorage.getItem('token')
        });
        alert("✅ تم حفظ إطار الصورة بنجاح!");
    } else {
        alert("⚠️ يرجى اختيار إطار أولاً");
    }
}
document.getElementById('privateMsgBtn')?.addEventListener('click', () => {
    socket.emit('get private conversations');
});
socket.on('private conversations list', (list) => {
    const container = document.getElementById('conversationsList');
    if (!container) return;
    container.innerHTML = '';
    if (!list || list.length === 0) {
        container.innerHTML = '<div style="padding:20px; text-align:center; color:#aaa;">لا توجد محادثات سابقة</div>';
        return;
    }
    list.forEach(user => {
        const div = document.createElement('div');
        div.className = 'conversation-item';
        div.innerHTML = `
            <img src="${user.avatar || 'https://via.placeholder.com/40'}" alt="${user.username}">
            <span>${user.username}</span>
        `;
        div.onclick = () => {
            startPrivateChat(user.username);
            document.getElementById('conversationsPanel').style.display = 'none';
        };
        container.appendChild(div);
    });
});
// تحديث شارة طلبات الصداقة
function updateFriendRequestBadge(requests) {
    window.myFriendRequests = requests || [];
    const count = window.myFriendRequests.length;
    const badge = document.getElementById('friendReqBadge');
    if (badge) {
        badge.innerText = count;
        badge.style.display = count > 0 ? 'block' : 'none';
    }
}
// استقبال الإشعارات وتحديث الشارة
socket.on('new notification', (note) => {
    if (note.type === 'friend_request') {
        // إضافة الطلب محلياً لتحديث الرقم فوراً
        if (!window.myFriendRequests) window.myFriendRequests = [];
        if (!window.myFriendRequests.includes(note.from)) {
            window.myFriendRequests.push(note.from);
            updateFriendRequestBadge(window.myFriendRequests);
        }
        // تشغيل صوت تنبيه خفيف (اختياري)
        mentionSound.play().catch(()=>{});
    }
});
// عرض قائمة طلبات الصداقة عند الضغط على الزر
document.getElementById('friendReqBtn')?.addEventListener('click', () => {
    const list = document.getElementById('friendRequestsList');
    if (!list) return;
    list.innerHTML = '';
   
    const reqs = window.myFriendRequests || [];
    if (reqs.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#aaa;">لا توجد طلبات صداقة جديدة</div>';
        return;
    }
    reqs.forEach(username => {
        const div = document.createElement('div');
        div.className = 'request-item';
        div.innerHTML = `
            <img src="https://via.placeholder.com/40" alt="${username}">
            <span style="flex:1; font-weight:bold;">${username}</span>
            <button class="action-btn-small accept-btn">قبول</button>
            <button class="action-btn-small reject-btn">رفض</button>
        `;
        div.querySelector('.accept-btn').onclick = () => handleFriendAction('accept', username, div);
        div.querySelector('.reject-btn').onclick = () => handleFriendAction('reject', username, div);
        list.appendChild(div);
    });
});
function handleFriendAction(action, username, element) {
    socket.emit(`${action} friend request`, username);
   
    // إذا تم القبول، أضفه لقائمة الأصدقاء محلياً
    if (action === 'accept') {
        if (!window.myFriends) window.myFriends = [];
        window.myFriends.push(username);
    }
    // تحديث القائمة المحلية والشارة فوراً
    if (window.myFriendRequests) {
        window.myFriendRequests = window.myFriendRequests.filter(u => u !== username);
        updateFriendRequestBadge(window.myFriendRequests);
    }
   
    // حذف العنصر من الواجهة
    element.remove();
   
    // إذا أصبحت القائمة فارغة
    const list = document.getElementById('friendRequestsList');
    if (list && list.children.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#aaa;">لا توجد طلبات صداقة جديدة</div>';
    }
}
// استقبال تحديثات الصداقة
socket.on('friend removed', (targetName) => {
    if (window.myFriends) {
        window.myFriends = window.myFriends.filter(f => f !== targetName);
    }
});
socket.on('friend_accepted', (newFriend) => {
    if (!window.myFriends) window.myFriends = [];
    window.myFriends.push(newFriend);
});
// --- منطق عداد الرسائل الخاصة ---
let totalUnreadMsgs = 0;
function updateMessageBadge(count) {
    totalUnreadMsgs = count;
    const badge = document.getElementById('msgBadge');
    if (badge) {
        badge.innerText = totalUnreadMsgs;
        badge.style.display = totalUnreadMsgs > 0 ? 'block' : 'none';
    }
}
socket.on('msg_notification', () => {
    // زيادة العداد عند وصول رسالة جديدة
    totalUnreadMsgs++;
    updateMessageBadge(totalUnreadMsgs);
    mentionSound.play().catch(()=>{});
});
socket.on('messages read confirmed', ({ count }) => {
    // إنقاص العداد بعدد الرسائل التي تمت قراءتها
    totalUnreadMsgs = Math.max(0, totalUnreadMsgs - count);
    updateMessageBadge(totalUnreadMsgs);
});
