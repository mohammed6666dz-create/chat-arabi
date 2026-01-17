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
    const list = document.getElementById('usersList');
    list.innerHTML = '';
    users.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-item';
        div.innerHTML = `
            <img src="${user.avatar || 'https://via.placeholder.com/40'}" alt="${user.username}">
            <span>${user.username}</span>
        `;
  
        div.onclick = () => openUserActions(user.username, user.role || 'guest', user.avatar);
  
        div.addEventListener('dblclick', (e) => {
            e.preventDefault();
            mentionUser(user.username);
        });
  
        list.appendChild(div);
    });
});
socket.on('message', ({ username, msg, avatar, role }) => {
    appendMessage(username, msg, avatar, username === myUsername, role || 'guest');
});
socket.on('system message', (msg) => {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = msg;
    document.getElementById('chatWindow').appendChild(div);
    scrollToBottom();
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
        alert(`تم الحصول على رتبة ${role.toUpperCase()} بنجاح! 🎉`);
        loadMyProfile();
    } else {
        alert(message || 'فشل الحصول على الرتبة');
    }
});
function getUserBadge(username, role = 'guest') {
    const lowerUsername = username.toLowerCase();
    if (lowerUsername === 'nour') {
        return '<span class="badge owner">مديرة الموقع 👑</span>';
    }
    if (lowerUsername === 'mohamed-dz') {
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

// ─────────────── دالة إضافة الرسالة (تم التعديل لعرض HTML) ───────────────
function appendMessage(username, msg, avatar, isMe = false, role = 'guest') {
    const chatWindow = document.getElementById('chatWindow');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${isMe ? 'my-message' : ''}`;
   
    const badge = getUserBadge(username, role);
   
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
function openUserActions(username, currentRole = 'guest', avatar = '') {
    document.getElementById('otherUserDisplayName').textContent = username;
    document.getElementById('otherUserAvatarLarge').src = avatar || 'https://via.placeholder.com/140';
   
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

// ────────────────────────────────────────────────
//      تعديل التحكم بلوحة الإيموجي (لإرسال الصور)
// ────────────────────────────────────────────────
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
        // التعديل الأساسي هنا: عند الضغط على صورة، يتم إرسال وسم IMG كامل بدلاً من كلمة الـ ALT
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
});// --- كود نظام الإدارة والتحكم بالمستخدمين ---

// 1. تحديث دالة فتح ملف الشخص الآخر لتشغيل الأزرار
function openUserActions(username, currentRole = 'guest', avatar = '') {
    const modal = document.getElementById('otherUserProfileModal');
    if (!modal) return;

    // إظهار النافذة المنبثقة
    modal.style.display = 'flex'; 
    
    // تعبئة البيانات الأساسية
    document.getElementById('otherUserDisplayName').textContent = username;
    document.getElementById('otherUserAvatarLarge').src = avatar || 'https://via.placeholder.com/140';
    
    currentPrivateChat = username;

    const actionButtonsContainer = document.getElementById('userActionButtons');
    // --- ضعه في الدائرة الكبيرة تحت سطر actionButtonsContainer ---
    
    // 1. الأزرار التي تظهر للجميع
    let buttonsHtml = `
        <button onclick="checkUserProfile('${username}')" style="background:#3b82f6; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold; width:100%; margin-bottom:5px;">فحص الملف</button>
        <button onclick="showUserCommands('${username}')" style="background:#10b981; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold; width:100%; margin-bottom:5px;">الأوامر</button>
    `;

    // 2. التحقق من أنك المالك لإظهار أزرار الإدارة (كتم/طرد/حظر)
    if (myUsername && myUsername.toLowerCase() === 'mohamed-dz' && username.toLowerCase() !== 'mohamed-dz') {
        buttonsHtml += `
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; margin-top:5px; width:100%;">
                <button onclick="adminAction('mute', '${username}')" style="background:#f59e0b; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer; font-size:12px;">كتم</button>
                <button onclick="adminAction('kick', '${username}')" style="background:#ef4444; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer; font-size:12px;">طرد</button>
                <button onclick="adminAction('ban', '${username}')" style="background:#000; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer; font-size:12px;">حظر</button>
            </div>
        `;
    }

    // 3. وضع الأزرار داخل المربع
    if (actionButtonsContainer) {
        actionButtonsContainer.innerHTML = buttonsHtml;
    }
} // <--- هذا القوس لإغلاق الدالة (مهم جداً)
// --- ضع هذا الكود بعد السطر 538 مباشرة لكي تعمل الأزرار ---

// 1. دالة إغلاق النافذة عند الضغط على زر إغلاق
function closeOtherUserProfile() {
    const modal = document.getElementById('otherUserProfileModal');
    if (modal) modal.style.display = 'none';
}

// 2. دالة إرسال أوامر الإدارة (كتم/طرد/حظر) إلى السيرفر
function adminAction(action, target) {
    if(confirm(`هل أنت متأكد من تنفيذ أمر (${action}) على المستخدم ${target}؟`)) {
        // تأكد أن متغير socket و token معرفين في مشروعك
        socket.emit('admin command', { action, target, token });
        alert(`تم إرسال طلب ${action} بنجاح`);
    }
}

// 3. دوال إضافية للفحص والأوامر
function checkUserProfile(username) {
    alert("🔍 جاري فحص ملف المستخدم: " + username);
}

function showUserCommands(username) {
    alert("📜 الأوامر المتاحة: (دردشة خاصة، إضافة صديق، منشن، فحص)");
}
// --- الآن أضف هذه الدوال تحت الدائرة الكبيرة لكي تعمل الأزرار ---

function closeOtherUserProfile() {
    document.getElementById('otherUserProfileModal').style.display = 'none';
}

function adminAction(action, target) {
    if(confirm(`هل أنت متأكد من تنفيذ ${action} على ${target}؟`)) {
        socket.emit('admin command', { action, target, token });
        alert(`تم إرسال طلب ${action} بنجاح`);
    }
}

function checkUserProfile(username) {
    alert("🔍 جاري فحص ملف المستخدم: " + username);
}

function showUserCommands(username) {
    alert("📜 الأوامر المتاحة: (دردشة خاصة، إضافة صديق، منشن، فحص)");
}
    
    // الأزرار التي تظهر للجميع
    let buttonsHtml = `
        <button onclick="checkUserProfile('${username}')" style="background:#3b82f6; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold; width:100%;">فحص الملف</button>
        <button onclick="showUserCommands('${username}')" style="background:#10b981; color:white; border:none; padding:10px; border-radius:8px; cursor:pointer; font-weight:bold; width:100%;">الأوامر</button>
    `;

    // 2. التحقق من صلاحية المالك (محمد) لإضافة أزرار الطرد والكتم
    if (myUsername && myUsername.toLowerCase() === 'mohamed-dz' && username.toLowerCase() !== 'mohamed-dz') {
        buttonsHtml += `
            <div style="display:grid; grid-template-columns: 1fr 1fr 1fr; gap:5px; margin-top:5px; width:100%;">
                <button onclick="adminAction('mute', '${username}')" style="background:#f59e0b; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer; font-size:12px;">كتم</button>
                <button onclick="adminAction('kick', '${username}')" style="background:#ef4444; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer; font-size:12px;">طرد</button>
                <button onclick="adminAction('ban', '${username}')" style="background:#000; color:white; border:none; padding:8px; border-radius:5px; cursor:pointer; font-size:12px;">حظر</button>
            </div>
        `;
    }

    actionButtonsContainer.innerHTML = buttonsHtml;
}

// 3. دالة إغلاق النافذة
function closeOtherUserProfile() {
    const modal = document.getElementById('otherUserProfileModal');
    if (modal) modal.style.display = 'none';
}

// 4. إرسال أوامر الإدارة للسيرفر
function adminAction(action, target) {
    if(confirm(`هل أنت متأكد من تنفيذ أمر (${action}) على المستخدم ${target}؟`)) {
        socket.emit('admin command', { action, target, token });
        alert(`تم إرسال طلب ${action} بنجاح`);
    }
}

// 5. دوال إضافية للفحص والأوامر
function checkUserProfile(username) {
    alert("🔍 جاري فحص ملف المستخدم: " + username);
}

function showUserCommands(username) {
    alert("📜 الأوامر المتاحة: (دردشة خاصة، إضافة صديق، منشن، فحص)");
}
