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
let myPoints = 1;
let myLevel = 1;
let myRole = 'guest'; // متغير لتخزين رتبة المستخدم
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
    
    const usersList = document.getElementById('usersList');
    if (!usersList) return;
    
    usersList.innerHTML = '';
    
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-item-simple';
        div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px;margin-bottom:8px;background:#1e293b;border-radius:10px;cursor:pointer;transition:all0.2s;';
        div.innerHTML = `
            <img src="${user.avatar || 'https://via.placeholder.com/40'}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;">
            <div style="flex:1;">
                <div style="font-weight:bold;color:white;">${user.username}</div>
                <div style="font-size:11px;">${getUserBadge(user.username, user.role || 'guest')}</div>
            </div>
        `;
        div.onclick = () => openUserProfile(user.username, user.role || 'guest', user.avatar);
        div.ondblclick = (e) => {
            e.preventDefault();
            mentionUser(user.username);
        };
        usersList.appendChild(div);
    });
});

socket.on('message', ({ username, msg, avatar, role, border }) => {
    appendMessage(username, msg, avatar, username === myUsername, role || 'guest', border || 'none');
});

socket.on('system message', (msg) => {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = msg;
    document.getElementById('chatWindow').appendChild(div);
    scrollToBottom();
});

socket.on('mention notification', ({ from, room }) => {
    mentionSound.currentTime = 0;
    mentionSound.play().catch(err => {
        console.log("مشكلة تشغيل صوت الطاق:", err);
    });
});

document.getElementById('messageForm').addEventListener('submit', (e) => {
    e.preventDefault();
    if (window.isMuted) {
        alert("🔇 لا يمكنك إرسال رسائل، أنت مكتوم حالياً!");
        return;
    }
    const input = document.getElementById('messageInput');
    const msg = input.value.trim();
    if (msg) {
        socket.emit('message', msg, token);
        input.value = '';
        myPoints++;
        updatePointsLevelDisplay();
    }
});

socket.on('your points updated', ({ points, level }) => {
    myPoints = points;
    myLevel = level;
    updatePointsLevelDisplay();
});

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

document.getElementById('myLevelBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('levelPointsPanel');
    if (panel) {
        panel.classList.remove('hidden');
        panel.style.display = 'block';
        updatePointsLevelDisplay();
    }
});

document.querySelector('.close-level-panel')?.addEventListener('click', () => {
    const panel = document.getElementById('levelPointsPanel');
    if (panel) {
        panel.classList.add('hidden');
        panel.style.display = 'none';
    }
});

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
            return '<span class="badge superadmin">سوبر أدمن 🌟</span>';
        case 'admin':
            return '<span class="badge admin">أدمن 🛡️</span>';
        case 'بريميوم':
        case 'premium':
            return '<span class="badge premium">بريميوم 💎</span>';
        case 'vip':
            return '<span class="badge vip">VIP ★</span>';
        default:
            return '<span class="badge guest">ضيف</span>';
    }
}

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

function appendMessage(username, msg, avatar, isMe = false, role = 'guest', border = 'none') {
    const chatWindow = document.getElementById('chatWindow');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isMe ? 'my-message' : ''}`;
    const badge = getUserBadge(username, role);
   
    let formattedMsg = msg.replace(/@(\w+)/g, '<span style="color:#3b82f6; font-weight:bold;">@$1</span>');
    messageDiv.innerHTML = `
        <img src="${avatar || 'https://via.placeholder.com/40'}" alt="${username}" onclick="openUserProfile('${username}', '${role}', '${avatar}')" style="cursor:pointer; border: ${border}; border-radius: 50%; width: 42px; height: 42px; object-fit: cover; padding: 2px;">
        <div class="message-content">
            <div class="username-line">
                ${badge}
                <strong onclick="mentionUser('${username}'); event.stopPropagation();" style="cursor:pointer; color: #3b82f6;"> ${username} </strong>
            </div>
            <p>${formattedMsg}</p>
        </div>
    `;
    chatWindow.appendChild(messageDiv);
    scrollToBottom();
}

function scrollToBottom() {
    const chatWindow = document.getElementById('chatWindow');
    if (chatWindow) chatWindow.scrollTop = chatWindow.scrollHeight;
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
        myRole = user.rank || 'guest'; // تخزين رتبة المستخدم
        const timestamp = new Date().getTime();
        const avatarImg = document.getElementById('avatar');
        const profileAvatar = document.getElementById('myProfileAvatar');
        if (avatarImg) avatarImg.src = myAvatar + '?t=' + timestamp;
        if (profileAvatar) profileAvatar.src = myAvatar + '?t=' + timestamp;
        const usernameSpan = document.getElementById('myProfileUsername');
        if (usernameSpan) usernameSpan.textContent = myUsername;
        updateFriendRequestBadge(user.friend_requests);
        updateMessageBadge(user.unread_messages || 0);
        window.myFriends = user.friends || [];
        window.myRank = user.rank;
        console.log("تم تحميل اسم المستخدم:", myUsername, "الرتبة:", myRole);
    } catch (err) {
        console.error('خطأ في تحميل البروفايل:', err);
    }
}

loadMyProfile();

document.getElementById('profileBtn')?.addEventListener('click', () => {
    const panel = document.getElementById('myProfilePanel');
    if (panel) panel.style.display = 'block';
    loadMyProfile();
});

document.getElementById('closeMyProfile')?.addEventListener('click', () => {
    const panel = document.getElementById('myProfilePanel');
    if (panel) panel.style.display = 'none';
});

document.getElementById('avatarUpload')?.addEventListener('change', async (e) => {
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
            const profileAvatar = document.getElementById('myProfileAvatar');
            const avatarImg = document.getElementById('avatar');
            if (profileAvatar) profileAvatar.src = data.avatar + '?t=' + timestamp;
            if (avatarImg) avatarImg.src = data.avatar + '?t=' + timestamp;
            alert('تم رفع الصورة بنجاح!');
        } else {
            alert('فشل رفع الصورة: ' + (data.msg || 'خطأ غير معروف'));
        }
    } catch (e) {
        console.error('خطأ في رفع الصورة:', e);
        alert('حصل خطأ أثناء رفع الصورة');
    }
});

// ─────────────── دالة فتح البروفايل مع أزرار الإدارة (للسوبر أدمن فقط) ───────────────
function openUserProfile(username, role = 'guest', avatar = '') {
    const displayName = document.getElementById('otherUserDisplayName');
    const largeAvatar = document.getElementById('otherUserAvatarLarge');
    if (displayName) displayName.textContent = username;
    if (largeAvatar) largeAvatar.src = avatar || 'https://via.placeholder.com/80';
    
    const modal = document.getElementById('otherUserProfileModal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modal.style.overflowY = 'auto';
    modal.style.maxHeight = '90vh';
   
    const isMe = (username === myUsername);
    const msgBtn = document.getElementById('sendPrivateMsgBtn');
    const friendBtn = document.getElementById('addFriendFromProfile');
    const reportBtns = document.querySelectorAll('.report-btn');
    if (msgBtn) msgBtn.style.display = isMe ? 'none' : 'inline-block';
    if (friendBtn) friendBtn.style.display = isMe ? 'none' : 'inline-block';
    reportBtns.forEach(btn => btn.style.display = isMe ? 'none' : 'inline-block');
   
    modal.onclick = (e) => {
        if (e.target === modal) closeOtherUserProfile();
    };
   
    let closeX = document.getElementById('globalProfileCloseBtn');
    if (!closeX) {
        closeX = document.createElement('div');
        closeX.id = 'globalProfileCloseBtn';
        closeX.innerHTML = '×';
        closeX.style = "position: absolute; top: 10px; right: 20px; font-size: 28px; color: white; cursor: pointer; font-weight: bold; z-index: 1000;";
        closeX.onclick = closeOtherUserProfile;
        modal.appendChild(closeX);
    }
   
    if (friendBtn) {
        const newBtn = friendBtn.cloneNode(true);
        friendBtn.parentNode.replaceChild(newBtn, friendBtn);
       
        if (window.myFriends && window.myFriends.includes(username)) {
            newBtn.textContent = 'إلغاء الصداقة';
            newBtn.style.backgroundColor = '#ef4444';
            newBtn.onclick = () => {
                if(confirm(`هل أنت متأكد من إلغاء الصداقة مع ${username}؟`)) {
                    socket.emit('remove friend', username);
                    closeOtherUserProfile();
                }
            };
        } else {
            newBtn.textContent = 'إضافة صديق';
            newBtn.style.backgroundColor = '#10b981';
            newBtn.onclick = () => {
                socket.emit('send friend request', username);
                alert(`تم إرسال طلب صداقة إلى ${username}`);
                closeOtherUserProfile();
            };
        }
    }
   
    // ─────────────── أزرار الإدارة (تظهر فقط للسوبر أدمن) ───────────────
    const adminBox = document.getElementById('adminActionsContainer');
    if (adminBox) {
        // التحقق: هل المستخدم الحالي لديه رتبة "superadmin" في قاعدة البيانات؟
        const isSuperAdmin = (myRole === 'superadmin');
        
        console.log('الرتبة الحالية:', myRole, 'هل هو سوبر أدمن؟', isSuperAdmin);
        
        if (isSuperAdmin && !isMe) {
            adminBox.style.display = 'block';
            adminBox.innerHTML = `
                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 10px; padding: 10px; background: rgba(0,0,0,0.4); border-radius: 10px;">
                    <button onclick="adminAction('kick', '${username}')" style="background: #e67e22; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold;">🚪 طرد</button>
                    <button onclick="adminAction('mute', '${username}')" style="background: #f1c40f; color: black; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold;">🔇 كتم</button>
                    <button onclick="adminAction('ban', '${username}')" style="background: #e74c3c; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold;">🚫 حظر</button>
                    <button onclick="adminAction('unmute', '${username}')" style="background: #2ecc71; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold;">✅ فك كتم</button>
                    <button onclick="adminAction('unban', '${username}')" style="background: #3498db; color: white; border: none; padding: 8px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: bold;">🔓 فك حظر</button>
                    <button onclick="closeOtherUserProfile()" style="grid-column: span 3; background: #555; color: white; border: none; padding: 6px; margin-top: 2px; border-radius: 6px; cursor: pointer; font-size: 11px;">✖ إغلاق</button>
                </div>
                <div style="margin-top: 8px; padding: 5px; background: rgba(231, 76, 60, 0.2); border-radius: 6px; text-align: center; font-size: 11px; color: #f1c40f;">
                    ⚡ أنت سوبر أدمن - يمكنك إدارة المستخدمين
                </div>
            `;
        } else {
            adminBox.style.display = 'none';
        }
    }
    currentPrivateChat = username;
}

// ─────────────── دالة تنفيذ أوامر الإدارة ───────────────
function adminAction(actionType, targetName) {
    const actionsNames = { 
        kick: 'طرد', 
        mute: 'كتم', 
        ban: 'حظر', 
        unmute: 'فك الكتم', 
        unban: 'فك الحظر' 
    };
    
    let message = '';
    switch(actionType) {
        case 'kick':
            message = `⚠️ هل أنت متأكد من طرد ${targetName} من الغرفة؟`;
            break;
        case 'mute':
            message = `🔇 هل أنت متأكد من كتم ${targetName}؟ لن يتمكن من إرسال الرسائل`;
            break;
        case 'ban':
            message = `🚫 هل أنت متأكد من حظر ${targetName}؟ لن يتمكن من دخول الموقع مرة أخرى`;
            break;
        case 'unmute':
            message = `✅ هل أنت متأكد من فك الكتم عن ${targetName}؟`;
            break;
        case 'unban':
            message = `🔓 هل أنت متأكد من فك الحظر عن ${targetName}؟`;
            break;
    }
    
    if (confirm(message)) {
        console.log(`📢 تنفيذ أمر: ${actionType} على ${targetName}`);
        socket.emit('admin command', {
            action: actionType,
            target: targetName,
            token: localStorage.getItem('token')
        });
        closeOtherUserProfile();
        alert(`✅ تم تنفيذ أمر ${actionsNames[actionType]} على ${targetName}`);
    }
}

function startPrivateChat(targetName) {
    const name = targetName || document.getElementById('otherUserDisplayName')?.textContent;
    if (!name) return;
    closeOtherUserProfile();
    currentPrivateChat = name;
    const panel = document.getElementById('privateChatPanel');
    const title = document.getElementById('privateChatWith');
    if (panel) panel.style.display = 'block';
    if (title) title.textContent = 'دردشة مع ' + name;
    socket.emit('join private', name);
    socket.emit('mark messages read', name);
    socket.emit('get private messages', name);
}

function closeOtherUserProfile() {
    const modal = document.getElementById('otherUserProfileModal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}

socket.on('role updated', ({ username, role }) => {
    console.log(`تم تحديث رتبة ${username} إلى ${role}`);
    if (username === myUsername) {
        myRole = role;
    }
});

document.addEventListener('DOMContentLoaded', () => {
    const usersPanel = document.getElementById('usersPanel');
    const hideBtns = document.querySelectorAll('#hideUsersPanelBtn, #hideUsersPanelBtn2');
    const showBtns = document.querySelectorAll('#showUsersPanelBtn, #showUsersPanelBtn2');
    
    hideBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                if (usersPanel) usersPanel.style.display = 'none';
                hideBtns.forEach(b => b.style.display = 'none');
                showBtns.forEach(b => b.style.display = 'inline-flex');
            });
        }
    });
    
    showBtns.forEach(btn => {
        if (btn) {
            btn.addEventListener('click', () => {
                if (usersPanel) usersPanel.style.display = 'block';
                showBtns.forEach(b => b.style.display = 'none');
                hideBtns.forEach(b => b.style.display = 'inline-flex');
            });
        }
    });
});

document.getElementById('sendPrivateMsgBtn')?.addEventListener('click', () => {
    startPrivateChat();
});

document.getElementById('closePrivateChat')?.addEventListener('click', () => {
    const panel = document.getElementById('privateChatPanel');
    if (panel) panel.style.display = 'none';
});

document.getElementById('privateChatForm')?.addEventListener('submit', (e) => {
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
    if (!chat) return;
    const div = document.createElement('div');
    div.className = isMe ? 'my-private-message' : 'private-message';
    div.innerHTML = `
        <img src="${avatar || 'https://via.placeholder.com/30'}" alt="${username}" style="width:30px;height:30px;border-radius:50%;">
        <div class="private-content">
            <strong>${username}</strong>
            <p>${msg}</p>
        </div>
    `;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

socket.on('private message', ({ from, to, msg, avatar }) => {
    if (from === myUsername) return;
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
        totalUnreadMsgs++;
        updateMessageBadge(totalUnreadMsgs);
    }
});

socket.on('previous private messages', ({ withUser, messages }) => {
    if (currentPrivateChat !== withUser) return;
    const chat = document.getElementById('privateChatMessages');
    if (chat) chat.innerHTML = '';
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

document.getElementById('logoutBtn')?.addEventListener('click', () => {
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

let myCover = 'https://via.placeholder.com/800x200/0f172a/ffffff?text=خلفيتك+هنا';

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
            const coverPhoto = document.getElementById('myCoverPhoto');
            if (coverPhoto) coverPhoto.style.backgroundImage = `url(${myCover})`;
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
    if (!emojiBtn || !emojiPicker) return;
    emojiBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPicker.classList.toggle('hidden');
    });
    document.addEventListener('click', (e) => {
        if (!emojiPicker.contains(e.target) && e.target !== emojiBtn) {
            emojiPicker.classList.add('hidden');
        }
    });
    emojiPicker.addEventListener('click', function(e) {
        let emojiToInsert = '';
        if (e.target.tagName === 'SPAN') {
            emojiToInsert = e.target.textContent.trim();
        } else if (e.target.tagName === 'IMG') {
            emojiToInsert = `<img src="${e.target.src}" style="width:30px; height:30px; vertical-align:middle;">`;
        }
        if (emojiToInsert) {
            const input = document.getElementById('messageInput');
            const start = input.selectionStart;
            const end = input.selectionEnd;
            input.value = input.value.substring(0, start) + emojiToInsert + input.value.substring(end);
            const newPos = start + emojiToInsert.length;
            input.setSelectionRange(newPos, newPos);
            input.focus();
        }
    });
});

function updateFriendRequestBadge(requests) {
    window.myFriendRequests = requests || [];
    const count = window.myFriendRequests.length;
    const badge = document.getElementById('friendReqBadge');
    if (badge) {
        badge.innerText = count;
        badge.style.display = count > 0 ? 'flex' : 'none';
    }
}

socket.on('new notification', (note) => {
    if (note.type === 'friend_request') {
        if (!window.myFriendRequests) window.myFriendRequests = [];
        if (!window.myFriendRequests.includes(note.from)) {
            window.myFriendRequests.push(note.from);
            updateFriendRequestBadge(window.myFriendRequests);
        }
        mentionSound.play().catch(()=>{});
    }
});

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
    if (action === 'accept') {
        if (!window.myFriends) window.myFriends = [];
        window.myFriends.push(username);
    }
    if (window.myFriendRequests) {
        window.myFriendRequests = window.myFriendRequests.filter(u => u !== username);
        updateFriendRequestBadge(window.myFriendRequests);
    }
    element.remove();
    const list = document.getElementById('friendRequestsList');
    if (list && list.children.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#aaa;">لا توجد طلبات صداقة جديدة</div>';
    }
}

socket.on('friend removed', (targetName) => {
    if (window.myFriends) {
        window.myFriends = window.myFriends.filter(f => f !== targetName);
    }
});

socket.on('friend_accepted', (newFriend) => {
    if (!window.myFriends) window.myFriends = [];
    window.myFriends.push(newFriend);
});

let totalUnreadMsgs = 0;
function updateMessageBadge(count) {
    totalUnreadMsgs = count;
    const badge = document.getElementById('msgBadge');
    if (badge) {
        badge.innerText = totalUnreadMsgs;
        badge.style.display = totalUnreadMsgs > 0 ? 'flex' : 'none';
    }
}

socket.on('msg_notification', () => {
    totalUnreadMsgs++;
    updateMessageBadge(totalUnreadMsgs);
    mentionSound.play().catch(()=>{});
});

socket.on('messages read confirmed', ({ count }) => {
    totalUnreadMsgs = Math.max(0, totalUnreadMsgs - count);
    updateMessageBadge(totalUnreadMsgs);
});

window.isMuted = false;
socket.on('mute-update', (data) => {
    if (data.target === myUsername) {
        window.isMuted = data.status;
        if (data.status) {
            alert("🔇 لقد تم كتمك من قبل الإدارة.");
        } else {
            alert("🔊 تم فك الكتم عنك.");
        }
    }
});

// ─────────────── قائمة المحادثات الخاصة ───────────────
document.getElementById('privateMsgBtn')?.addEventListener('click', () => {
    console.log('🔘 تم فتح قائمة الرسائل الخاصة');
    
    document.querySelectorAll('.conversations-panel, .friend-requests-panel, .reports-panel').forEach(p => {
        if (p) p.style.display = 'none';
    });
    
    const panel = document.getElementById('conversationsPanel');
    if (panel) panel.style.display = 'block';
    
    const container = document.getElementById('conversationsList');
    if (container) {
        container.innerHTML = '<div style="padding:20px;text-align:center;color:#aaa;"><i class="fas fa-spinner fa-spin"></i> جاري تحميل المحادثات...</div>';
    }
    
    socket.emit('get private conversations');
});

socket.on('private conversations list', (conversations) => {
    console.log('📋 قائمة المحادثات المستلمة:', conversations);
    
    const container = document.getElementById('conversationsList');
    if (!container) return;
    
    container.innerHTML = '';
    
    if (!conversations || conversations.length === 0) {
        container.innerHTML = `
            <div style="padding:40px 20px; text-align:center; color:#64748b;">
                <i class="fas fa-comments" style="font-size:50px; margin-bottom:15px; display:block; opacity:0.5;"></i>
                لا توجد محادثات سابقة<br>
                <span style="font-size:12px;">💬 أرسل رسالة خاصة لأي شخص وستظهر هنا</span>
            </div>
        `;
        return;
    }
    
    conversations.forEach(conv => {
        const div = document.createElement('div');
        div.className = 'conversation-item';
        div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:12px;border-radius:10px;margin-bottom:8px;background:#0f172a;cursor:pointer;transition:all0.2s;border:1px solid transparent;';
        div.onmouseenter = () => div.style.borderColor = '#3b82f6';
        div.onmouseleave = () => div.style.borderColor = 'transparent';
        
        div.innerHTML = `
            <img src="${conv.avatar || 'https://via.placeholder.com/45'}" style="width:48px;height:48px;border-radius:50%;object-fit:cover;">
            <div style="flex:1;">
                <strong style="color:white;display:block;">${conv.username}</strong>
                <span style="font-size:11px;color:#94a3b8;">${conv.last_message || 'انقر للدردشة'}</span>
            </div>
            <i class="fas fa-chevron-left" style="color:#475569;"></i>
        `;
        
        div.onclick = () => {
            startPrivateChat(conv.username);
            document.getElementById('conversationsPanel').style.display = 'none';
        };
        
        container.appendChild(div);
    });
});

// استقبال تحديثات الكتم من السيرفر
socket.on('mute update', (data) => {
    if (data.target === myUsername) {
        window.isMuted = data.status;
        if (data.status) {
            alert("🔇 تم كتمك من قبل الإدارة!");
        } else {
            alert("🔊 تم فك الكتم عنك!");
        }
    }
});

// استقبال تحديثات الحظر
socket.on('ban update', (data) => {
    if (data.target === myUsername) {
        alert("🚫 تم حظرك من الموقع!");
        localStorage.removeItem('token');
        sessionStorage.removeItem('token');
        window.location.href = 'index.html';
    }
});
