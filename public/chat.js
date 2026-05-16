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
// حفظ آخر غرفة في localStorage و Supabase
if (room) {
    localStorage.setItem('lastRoom', room);
    
    fetch('/api/save-last-room', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token
        },
        body: JSON.stringify({ 
            roomId: room, 
            roomName: room === 'general' ? 'الغرفة العامة' : (room === 'algeria' ? 'الجزائر' : 'جميع الدول')
        })
    }).catch(err => console.log('خطأ في حفظ آخر غرفة:', err));
}
let myUsername = '';
let myAvatar = 'https://via.placeholder.com/40';
let currentPrivateChat = null;
let myPoints = 1;
let myLevel = 1;
let myRole = 'guest';
let myProfileSong = '';
const mentionSound = new Audio('./bird-chirp-short.mp3');
mentionSound.volume = 0.7;
let receivedMessagesIds = new Set();

socket.emit('join', room, token);

socket.on('load messages', (messages) => {
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

socket.on('offline users update', (offlineUsers) => {
    const offlineList = document.getElementById('offlineUsersList');
    const offlineCount = document.getElementById('offlineCount');
    if (!offlineList) return;
    
    offlineList.innerHTML = '';
    offlineUsers.forEach(user => {
        const div = document.createElement('div');
        div.className = 'user-item-simple offline-user';
        div.style.cssText = 'display:flex;align-items:center;gap:12px;padding:10px;margin-bottom:8px;background:#1e293b;border-radius:10px;cursor:pointer;transition:all0.2s;opacity:0.7;';
        div.innerHTML = `
            <img src="${user.avatar || 'https://via.placeholder.com/40'}" style="width:42px;height:42px;border-radius:50%;object-fit:cover;filter:grayscale(0.5);">
            <div style="flex:1;">
                <div style="font-weight:bold;color:#94a3b8;">${user.username}</div>
                <div style="font-size:10px;color:#64748b;">آخر ظهور: ${user.last_room_name || 'غرفة غير معروفة'}</div>
                <div style="font-size:10px;color:#64748b;">${getUserBadge(user.username, user.role || 'guest')}</div>
            </div>
        `;
        div.onclick = () => openUserProfile(user.username, user.role || 'guest', user.avatar);
        offlineList.appendChild(div);
    });
    if (offlineCount) offlineCount.innerText = offlineUsers.length;
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
    if (lowerUsername === 'mira') {
        return '<span class="badge owner">نائبة مدير لموقع🌹</span>';
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
        myRole = user.rank || 'guest';
        myProfileSong = user.profile_song || '';
        myPoints = user.points || 0;
        myLevel = user.level || 1;
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
        updatePointsLevelDisplay();
        
        // استرجاع خلفية الدردشة الخاصة من السيرفر
        if (user.private_bg) {
            const messagesContainer = document.getElementById('privateChatMessages');
            if (messagesContainer) {
                messagesContainer.style.backgroundImage = `url(${user.private_bg})`;
                messagesContainer.style.backgroundSize = 'cover';
                messagesContainer.style.backgroundPosition = 'center';
                messagesContainer.style.backgroundRepeat = 'no-repeat';
            }
        }
        
        if (myProfileSong) {
            const songStatus = document.getElementById('songStatus');
            if (songStatus) {
                songStatus.innerHTML = '🎵 الأغنية مرفوعة ✅';
                songStatus.style.color = '#10b981';
            }
        }
        
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

const uploadSongBtn = document.getElementById('uploadProfileSongBtn');
const songInput = document.getElementById('profileSongUpload');
const songStatus = document.getElementById('songStatus');

if (uploadSongBtn && songInput) {
    uploadSongBtn.addEventListener('click', () => {
        songInput.click();
    });

    songInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        if (songStatus) {
            songStatus.innerHTML = 'جاري رفع الأغنية... ⏳';
            songStatus.style.color = '#fbbf24';
        }
        
        const formData = new FormData();
        formData.append('song', file);
        
        try {
            const res = await fetch('/upload-profile-song', {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + token },
                body: formData
            });
            const data = await res.json();
            if (data.songUrl) {
                myProfileSong = data.songUrl;
                if (songStatus) {
                    songStatus.innerHTML = '✅ تم رفع الأغنية بنجاح! 🎵';
                    songStatus.style.color = '#10b981';
                    setTimeout(() => {
                        if (songStatus) songStatus.innerHTML = '🎵 الأغنية مرفوعة ✅';
                    }, 3000);
                }
                alert('تم رفع الأغنية بنجاح!');
            } else {
                if (songStatus) {
                    songStatus.innerHTML = '❌ فشل رفع الأغنية';
                    songStatus.style.color = '#ef4444';
                }
            }
        } catch (err) {
            console.error(err);
            if (songStatus) {
                songStatus.innerHTML = '❌ حدث خطأ في الرفع';
                songStatus.style.color = '#ef4444';
            }
        }
    });
}

async function getUserProfileData(username) {
    try {
        const res = await fetch(`/profile-data?username=${encodeURIComponent(username)}`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        if (!res.ok) return null;
        return await res.json();
    } catch (err) {
        console.error('خطأ في جلب بيانات المستخدم:', err);
        return null;
    }
}

// ========== رفع خلفية الدردشة الخاصة إلى السيرفر ==========

async function uploadPrivateBgToServer(file) {
    const formData = new FormData();
    formData.append('bg', file);
    
    try {
        const res = await fetch('/upload-private-bg', {
            method: 'POST',
            headers: { 'Authorization': 'Bearer ' + token },
            body: formData
        });
        
        if (!res.ok) {
            throw new Error('فشل رفع الخلفية');
        }
        
        const data = await res.json();
        console.log('✅ رد السيرفر على رفع الخلفية:', data);
        
        if (data.bgUrl) {
            return data.bgUrl;
        } else {
            console.error('❌ السيرفر لم يعد bgUrl');
            return null;
        }
    } catch (err) {
        console.error('❌ خطأ في رفع الخلفية:', err);
        return null;
    }
}

// دالة لتطبيق الخلفية بشكل صحيح
function applyPrivateBackground(bgUrl) {
    const messagesContainer = document.getElementById('privateChatMessages');
    if (!messagesContainer) {
        console.log('❌ عنصر privateChatMessages غير موجود');
        return;
    }
    
    if (bgUrl && bgUrl !== '' && bgUrl !== 'null') {
        const finalUrl = bgUrl + (bgUrl.includes('?') ? '&t=' : '?t=') + new Date().getTime();
        
        messagesContainer.style.setProperty('background-image', `url("${finalUrl}")`, 'important');
        messagesContainer.style.setProperty('background-size', 'cover', 'important');
        messagesContainer.style.setProperty('background-position', 'center', 'important');
        messagesContainer.style.setProperty('background-repeat', 'no-repeat', 'important');
        messagesContainer.style.setProperty('background-color', 'transparent', 'important');
        
        localStorage.setItem('privateChatBg', bgUrl);
        console.log('✅ تم تطبيق الخلفية بنجاح:', finalUrl);
    } else {
        messagesContainer.style.backgroundImage = '';
        messagesContainer.style.backgroundColor = '#1a2a3a';
        localStorage.removeItem('privateChatBg');
        console.log('🔄 تم إزالة الخلفية');
    }
}

// فتح وإغلاق لوحة اختيار الخلفية
const changeBgBtn = document.getElementById('changePrivateBgBtn');
const bgPicker = document.getElementById('privateBgPicker');
const bgInput = document.getElementById('privateBgInput');
const uploadBgBtn = document.getElementById('uploadPrivateBgBtn');
const resetBgBtn = document.getElementById('resetPrivateBgBtn');

if (changeBgBtn && bgPicker) {
    changeBgBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        bgPicker.classList.toggle('show');
    });
    
    document.addEventListener('click', (e) => {
        if (bgPicker && !bgPicker.contains(e.target) && e.target !== changeBgBtn) {
            bgPicker.classList.remove('show');
        }
    });
}

// رفع صورة خلفية من الجهاز
if (uploadBgBtn && bgInput) {
    uploadBgBtn.addEventListener('click', () => {
        bgInput.click();
    });
    
    bgInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) {
            console.log('❌ لم يتم اختيار ملف');
            return;
        }
        
        if (!file.type.startsWith('image/')) {
            alert('❌ الرجاء اختيار ملف صورة فقط');
            return;
        }
        
        const loadingMsg = document.createElement('div');
        loadingMsg.className = 'system-message';
        loadingMsg.textContent = '⏳ جاري رفع الخلفية...';
        document.getElementById('chatWindow')?.appendChild(loadingMsg);
        
        console.log('📤 جاري رفع الخلفية:', file.name);
        
        const bgUrl = await uploadPrivateBgToServer(file);
        
        if (loadingMsg) loadingMsg.remove();
        
        if (bgUrl) {
            applyPrivateBackground(bgUrl);
            alert('✅ تم رفع الخلفية وتطبيقها بنجاح!');
            setTimeout(() => loadMyProfile(), 500);
        } else {
            alert('❌ فشل رفع الخلفية، تأكد من اتصال الإنترنت');
        }
        
        bgPicker.classList.remove('show');
        bgInput.value = '';
    });
}

// إعادة الخلفية الافتراضية
if (resetBgBtn) {
    resetBgBtn.addEventListener('click', async () => {
        if (confirm('هل أنت متأكد من إزالة خلفية الدردشة الخاصة؟')) {
            const messagesContainer = document.getElementById('privateChatMessages');
            if (messagesContainer) {
                messagesContainer.style.backgroundImage = '';
                messagesContainer.style.backgroundColor = '#1a2a3a';
            }
            
            try {
                await fetch('/api/clear-private-bg', {
                    method: 'POST',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                localStorage.removeItem('privateChatBg');
                alert('✅ تم إزالة الخلفية');
            } catch (err) {
                console.error('خطأ:', err);
            }
            
            bgPicker.classList.remove('show');
        }
    });
}

// تحميل الخلفية المحفوظة عند فتح الدردشة
function loadSavedPrivateBackground() {
    const messagesContainer = document.getElementById('privateChatMessages');
    if (!messagesContainer) return;
    
    const savedBg = localStorage.getItem('privateChatBg');
    if (savedBg && savedBg !== 'null' && savedBg !== '') {
        applyPrivateBackground(savedBg);
    }
}

// استدعاء عند فتح الدردشة الخاصة
const originalStartPrivateChat = window.startPrivateChat;
window.startPrivateChat = function(targetName) {
    if (originalStartPrivateChat) {
        originalStartPrivateChat(targetName);
    }
    setTimeout(() => {
        loadSavedPrivateBackground();
    }, 200);
};

// تحميل الخلفية من localStorage عند بدء التشغيل
setTimeout(() => {
    loadSavedPrivateBackground();
}, 1000);
// ========== دوال حائط الأصدقاء ==========

async function loadPosts() {
    try {
        const res = await fetch('/api/get-friends-posts', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const posts = await res.json();
        const postsList = document.getElementById('postsList');
        
        if (postsList) {
            if (posts.length === 0) {
                postsList.innerHTML = '<div class="no-data">لا توجد منشورات من أصدقائك بعد</div>';
                return;
            }
            
            postsList.innerHTML = posts.map(post => `
                <div class="post-item" data-post-id="${post.id}">
                    <div class="post-header">
                        <img src="${post.avatar || 'https://via.placeholder.com/40'}" alt="${post.username}">
                        <span class="post-username">${escapeHtml(post.username)}</span>
                        <span class="post-time">${new Date(post.created_at).toLocaleString('ar')}</span>
                    </div>
                    <div class="post-content">${escapeHtml(post.content)}</div>
                    <div class="post-actions">
                        <button class="like-btn ${post.user_liked ? 'liked' : ''}" onclick="likePost(${post.id})">
                            <i class="fas fa-heart"></i> ${post.likes || 0}
                        </button>
                        <button class="comment-btn" onclick="toggleComments(${post.id})">
                            <i class="fas fa-comment"></i> تعليقات
                        </button>
                    </div>
                    <div id="comments-area-${post.id}" class="comments-area" style="display:none;">
                        <div id="comments-list-${post.id}" class="comments-list"></div>
                        <div class="comment-input-area">
                            <input type="text" id="comment-input-${post.id}" placeholder="اكتب تعليقك..." maxlength="200">
                            <button onclick="addComment(${post.id})"><i class="fas fa-paper-plane"></i></button>
                        </div>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('خطأ في جلب المنشورات:', err);
        const postsList = document.getElementById('postsList');
        if (postsList) {
            postsList.innerHTML = '<div class="no-data">خطأ في تحميل المنشورات</div>';
        }
    }
}

async function toggleComments(postId) {
    const commentsArea = document.getElementById(`comments-area-${postId}`);
    if (commentsArea.style.display === 'none' || commentsArea.style.display === '') {
        commentsArea.style.display = 'block';
        await loadComments(postId);
    } else {
        commentsArea.style.display = 'none';
    }
}

async function loadComments(postId) {
    try {
        const res = await fetch(`/api/get-comments?postId=${postId}`, {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const comments = await res.json();
        const commentsList = document.getElementById(`comments-list-${postId}`);
        
        if (commentsList) {
            if (comments.length === 0) {
                commentsList.innerHTML = '<div style="text-align:center; padding:10px; color:#94a3b8;">لا توجد تعليقات</div>';
                return;
            }
            
            commentsList.innerHTML = comments.map(comment => `
                <div class="comment-item">
                    <img src="${comment.avatar || 'https://via.placeholder.com/20'}" alt="${comment.username}">
                    <div class="comment-text">
                        <span class="comment-username">${escapeHtml(comment.username)}</span>
                        <span>${escapeHtml(comment.content)}</span>
                    </div>
                </div>
            `).join('');
        }
    } catch (err) {
        console.error('خطأ في جلب التعليقات:', err);
    }
}

async function addComment(postId) {
    const input = document.getElementById(`comment-input-${postId}`);
    const content = input.value.trim();
    if (!content) return;
    
    try {
        const res = await fetch('/api/add-comment', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ postId, content })
        });
        
        if (res.ok) {
            input.value = '';
            await loadComments(postId);
        } else {
            alert('فشل في إضافة التعليق');
        }
    } catch (err) {
        console.error('خطأ في إضافة التعليق:', err);
    }
}

async function publishPost() {
    const content = document.getElementById('postContent').value.trim();
    if (!content) {
        alert('الرجاء كتابة منشور قبل النشر');
        return;
    }
    
    try {
        const res = await fetch('/api/create-post', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ content })
        });
        
        if (res.ok) {
            document.getElementById('postContent').value = '';
            loadPosts();
            alert('تم نشر المنشور بنجاح!');
        } else {
            const data = await res.json();
            alert(data.msg || 'فشل في نشر المنشور');
        }
    } catch (err) {
        console.error('خطأ في النشر:', err);
        alert('حدث خطأ في النشر');
    }
}

async function likePost(postId) {
    try {
        const res = await fetch('/api/like-post', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ postId })
        });
        if (res.ok) {
            loadPosts();
        }
    } catch (err) {
        console.error('خطأ في الإعجاب:', err);
    }
}

async function loadNews() {
    const container = document.getElementById('newsList');
    if (!container) return;
    container.innerHTML = '<div class="no-data">⏳ جاري تحميل الأخبار...</div>';
    try {
        const res = await fetch('/api/get-news');
        const news = await res.json();
        if (news.length === 0) {
            container.innerHTML = '<div class="no-data">📭 لا توجد أخبار حالياً</div>';
            return;
        }
        
        // جلب صور المستخدمين لكل خبر
        const newsWithAvatars = await Promise.all(news.map(async (item) => {
            let avatar = 'https://via.placeholder.com/40';
            try {
                const userRes = await fetch(`/profile-data?username=${encodeURIComponent(item.author)}`, {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                if (userRes.ok) {
                    const userData = await userRes.json();
                    avatar = userData.avatar || avatar;
                }
            } catch(e) { console.log(e); }
            return { ...item, avatar };
        }));
        
        container.innerHTML = newsWithAvatars.map(item => `
            <div class="news-item">
                <div class="news-header" style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
                    <img src="${item.avatar}" alt="${escapeHtml(item.author)}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid #3b82f6;">
                    <div>
                        <div style="font-weight: bold; color: #e2e8f0;">${escapeHtml(item.author)}</div>
                        <div style="font-size: 11px; color: #94a3b8;">${new Date(item.created_at).toLocaleString('ar')}</div>
                    </div>
                    ${myUsername === 'MOHAMED' ? `<button class="delete-news-btn" data-id="${item.id}" style="margin-right: auto; background: #ef4444; border: none; padding: 5px 10px; border-radius: 6px; color: white; cursor: pointer; font-size: 11px;">🗑️ حذف</button>` : ''}
                </div>
                <div class="news-title" style="font-size: 18px; font-weight: bold; color: #fbbf24; margin-bottom: 8px;">📰 ${escapeHtml(item.title)}</div>
                <div class="news-content" style="font-size: 14px; line-height: 1.5; color: #cbd5e1; margin-bottom: 10px;">${escapeHtml(item.content)}</div>
            </div>
        `).join('');
        
        // إضافة حدث الحذف للمشرف
        if (myUsername === 'MOHAMED') {
            document.querySelectorAll('.delete-news-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    if (confirm('هل أنت متأكد من حذف هذا الخبر؟')) {
                        await fetch(`/api/delete-news/${id}`, { method: 'DELETE', headers: { 'Authorization': 'Bearer ' + token } });
                        loadNews();
                    }
                });
            });
        }
    } catch (err) {
        console.error('خطأ:', err);
        container.innerHTML = '<div class="no-data">❌ خطأ في تحميل الأخبار</div>';
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== فتح بروفايل المستخدم ==========
async function openUserProfile(username, role = 'guest', avatar = '') {
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
    
    const oldPlayer = document.getElementById('dynamicSongPlayer');
    if (oldPlayer) oldPlayer.remove();
    
    const userData = await getUserProfileData(username);
    
    if (userData && userData.profile_song && userData.profile_song !== '') {
        const songPlayer = document.createElement('div');
        songPlayer.id = 'dynamicSongPlayer';
        songPlayer.style.margin = '15px 20px';
        songPlayer.style.textAlign = 'center';
        songPlayer.style.background = 'rgba(0,0,0,0.3)';
        songPlayer.style.padding = '10px';
        songPlayer.style.borderRadius = '30px';
        songPlayer.innerHTML = `
            <audio controls autoplay style="width: 100%; border-radius: 30px;">
                <source src="${userData.profile_song}" type="audio/mpeg">
                متصفحك لا يدعم تشغيل الصوت
            </audio>
        `;
        const actionsDiv = modal.querySelector('.profile-actions');
        if (actionsDiv) {
            actionsDiv.insertAdjacentElement('afterend', songPlayer);
        } else {
            modal.querySelector('.modal-content')?.appendChild(songPlayer);
        }
    }
   
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
   
    const adminBox = document.getElementById('adminActionsContainer');
    if (adminBox) {
        const superAdminRanks = ['superadmin', 'سوبر أدمن', 'Super Admin', 'سوبرادمن', 'صاحب الموقع', 'مالك'];
        const isSuperAdmin = superAdminRanks.includes(myRole?.toLowerCase());
        
        console.log('رتبتي الحالية:', myRole, 'هل أنا سوبر أدمن؟', isSuperAdmin);
        
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
    const player = document.getElementById('dynamicSongPlayer');
    if (player) player.remove();
}

socket.on('role updated', ({ username, role }) => {
    console.log(`تم تحديث رتبة ${username} إلى ${role}`);
    if (username === myUsername) {
        myRole = role;
    }
});

// ========== الرسائل الخاصة ==========

socket.on('private message', ({ id, from, to, msg, avatar, createdAt }) => {
    if (id && receivedMessagesIds.has(id)) return;
    if (id) receivedMessagesIds.add(id);
    
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
        totalUnreadMsgs++;
        updateMessageBadge(totalUnreadMsgs);
    }
});

socket.on('previous private messages', ({ withUser, messages }) => {
    if (currentPrivateChat !== withUser) return;
    const chat = document.getElementById('privateChatMessages');
    if (chat) {
        chat.innerHTML = '';
        messages.forEach(m => {
            if (m.id) receivedMessagesIds.add(m.id);
            const isMe = m.from === myUsername;
            appendPrivateMessage(
                isMe ? myUsername : m.from,
                m.msg,
                isMe ? myAvatar : (m.avatar || 'https://via.placeholder.com/30'),
                isMe
            );
        });
        chat.scrollTop = chat.scrollHeight;
    }
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
        <img src="${avatar || 'https://via.placeholder.com/30'}" alt="${username}">
        <div class="private-content">
            <strong>${escapeHtml(username)}</strong>
            <p>${escapeHtml(msg)}</p>
        </div>
    `;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

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
    
    const appsBtn = document.getElementById('appsBtn');
    const appsPanel = document.getElementById('appsPanel');
    if (appsBtn && appsPanel) {
        appsBtn.addEventListener('click', () => {
            appsPanel.style.display = 'block';
            loadPosts();
        });
    }
    
    const appBtns = document.querySelectorAll('.app-btn');
    appBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const appName = btn.getAttribute('data-app');
            document.querySelectorAll('.app-content').forEach(content => {
                content.classList.remove('active');
            });
            const targetContent = document.getElementById(`app-${appName}`);
            if (targetContent) {
                targetContent.classList.add('active');
            }
            if (appName === 'wall') {
                loadPosts();
            } else if (appName === 'news') {
                loadNews();
            }
        });
    });
    
    const publishBtn = document.getElementById('publishPostBtn');
    if (publishBtn) {
        publishBtn.addEventListener('click', publishPost);
    }
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

let savedConversations = [];
socket.on('private message', ({ from, to, msg, avatar }) => {
    if (from === myUsername) return;
    
    let existing = savedConversations.find(c => c.username === from);
    if (existing) {
        existing.last_message = msg.substring(0, 40);
        existing.avatar = avatar;
    } else {
        savedConversations.unshift({
            username: from,
            avatar: avatar,
            last_message: msg.substring(0, 40)
        });
    }
    savedConversations = savedConversations.slice(0, 20);
    
    if (currentPrivateChat === from || currentPrivateChat === to) {
        const isMe = from === myUsername;
        appendPrivateMessage(
            isMe ? myUsername : from,
            msg,
            isMe ? myAvatar : (avatar || 'https://via.placeholder.com/30'),
            isMe
        );
    } else {
        totalUnreadMsgs++;
        updateMessageBadge(totalUnreadMsgs);
    }
});

// ========== إصلاح زر الرسالة الخاصة ==========

function fixPrivateMessageButton() {
    const sendBtn = document.getElementById('sendPrivateMsgBtn');
    if (sendBtn && sendBtn.style.display !== 'none') {
        const newBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newBtn, sendBtn);
        
        newBtn.onclick = function(e) {
            e.preventDefault();
            e.stopPropagation();
            console.log('🟢 تم الضغط على زر الرسالة الخاصة');
            const username = document.getElementById('otherUserDisplayName')?.textContent;
            if (username && username !== myUsername) {
                const modal = document.getElementById('otherUserProfileModal');
                if (modal) {
                    modal.classList.add('hidden');
                    modal.style.display = 'none';
                }
                startPrivateChat(username);
            }
        };
        console.log('✅ تم تفعيل زر الرسالة الخاصة');
    }
}

const observer = new MutationObserver(function(mutations) {
    mutations.forEach(function(mutation) {
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
            const modal = document.getElementById('otherUserProfileModal');
            if (modal && modal.style.display === 'flex') {
                setTimeout(fixPrivateMessageButton, 100);
            }
        }
    });
});

const modal = document.getElementById('otherUserProfileModal');
if (modal) {
    observer.observe(modal, { attributes: true });
}

const originalOpenUserProfile = window.openUserProfile;
if (originalOpenUserProfile) {
    window.openUserProfile = async function(username, role, avatar) {
        await originalOpenUserProfile(username, role, avatar);
        setTimeout(fixPrivateMessageButton, 150);
    };
}

if (typeof startPrivateChat !== 'function') {
    function startPrivateChat(targetName) {
        const name = targetName || document.getElementById('otherUserDisplayName')?.textContent;
        if (!name) {
            console.log('❌ لا يوجد اسم مستخدم للدردشة');
            return;
        }
        if (name === myUsername) {
            console.log('❌ لا يمكن بدء دردشة مع نفسك');
            return;
        }
        console.log('🟢 بدء دردشة خاصة مع:', name);
        
        const modal = document.getElementById('otherUserProfileModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
        
        currentPrivateChat = name;
        const panel = document.getElementById('privateChatPanel');
        const title = document.getElementById('privateChatWith');
        if (panel) {
            panel.style.display = 'block';
            panel.style.zIndex = '2000';
        }
        if (title) title.textContent = 'دردشة مع ' + name;
        
        socket.emit('join private', name);
        socket.emit('mark messages read', name);
        socket.emit('get private messages', name);
    }
}

if (typeof closeOtherUserProfile !== 'function') {
    function closeOtherUserProfile() {
        const modal = document.getElementById('otherUserProfileModal');
        if (modal) {
            modal.classList.add('hidden');
            modal.style.display = 'none';
        }
        const player = document.getElementById('dynamicSongPlayer');
        if (player) player.remove();
    }
}

// ========== إغلاق نافذة الدردشة الخاصة ==========

const closePrivateChatBtn = document.getElementById('closePrivateChat');
if (closePrivateChatBtn) {
    const newCloseBtn = closePrivateChatBtn.cloneNode(true);
    closePrivateChatBtn.parentNode.replaceChild(newCloseBtn, closePrivateChatBtn);
    
    newCloseBtn.onclick = function(e) {
        e.preventDefault();
        const panel = document.getElementById('privateChatPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    };
}

document.addEventListener('click', function(e) {
    if (e.target.id === 'closePrivateChat' || e.target.closest('#closePrivateChat')) {
        const panel = document.getElementById('privateChatPanel');
        if (panel) {
            panel.style.display = 'none';
        }
    }
});
// السماح بكتابة المسافة في حقل الرسائل
document.getElementById('messageInput')?.addEventListener('keydown', function(e) {
    if (e.code === 'Space') {
        e.stopPropagation();
    }
});
// ========== نظام الأخبار الجديد ==========

// جلب الأخبار من السيرفر
async function loadNews() {
    const container = document.getElementById('newsList');
    if (!container) return;
    
    container.innerHTML = '<div class="no-data">⏳ جاري تحميل الأخبار...</div>';
    
    try {
        const res = await fetch('/api/get-news');
        const news = await res.json();
        
        if (news.length === 0) {
            container.innerHTML = '<div class="no-data">📭 لا توجد أخبار حالياً</div>';
            return;
        }
        
        container.innerHTML = news.map(item => `
            <div class="news-item" data-id="${item.id}">
                <div class="news-title">
                    <i class="fas fa-newspaper"></i> ${escapeHtml(item.title)}
                </div>
                <div class="news-content">${escapeHtml(item.content)}</div>
                <div class="news-meta">
                    <span class="news-author"><i class="fas fa-user"></i> ${escapeHtml(item.author)}</span>
                    <span class="news-date"><i class="fas fa-calendar-alt"></i> ${new Date(item.created_at).toLocaleString('ar')}</span>
                    ${myUsername === 'MOHAMED' ? `<button class="delete-news-btn" data-id="${item.id}"><i class="fas fa-trash"></i> حذف</button>` : ''}
                </div>
            </div>
        `).join('');
        
        // إضافة حدث الحذف للمشرف
        if (myUsername === 'MOHAMED') {
            document.querySelectorAll('.delete-news-btn').forEach(btn => {
                btn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    if (confirm('هل أنت متأكد من حذف هذا الخبر؟')) {
                        const res = await fetch(`/api/delete-news/${id}`, {
                            method: 'DELETE',
                            headers: { 'Authorization': 'Bearer ' + token }
                        });
                        if (res.ok) {
                            loadNews();
                        } else {
                            alert('فشل حذف الخبر');
                        }
                    }
                });
            });
        }
        
    } catch (err) {
        console.error('خطأ في جلب الأخبار:', err);
        container.innerHTML = '<div class="no-data">❌ خطأ في تحميل الأخبار</div>';
    }
}

// التحقق من صلاحيات المستخدم وإظهار حقل الإضافة
function checkNewsAdmin() {
    const addSection = document.getElementById('addNewsSection');
    if (addSection) {
        if (myUsername === 'MOHAMED') {
            addSection.style.display = 'block';
        } else {
            addSection.style.display = 'none';
        }
    }
}

// نشر خبر جديد
async function publishNews() {
    const title = document.getElementById('newsTitle')?.value.trim();
    const content = document.getElementById('newsContent')?.value.trim();
    
    if (!title || !content) {
        alert('❌ الرجاء إدخال عنوان ومحتوى الخبر');
        return;
    }
    
    try {
        const res = await fetch('/api/add-news', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + token
            },
            body: JSON.stringify({ title, content })
        });
        
        const data = await res.json();
        
        if (data.success) {
            alert('✅ تم نشر الخبر بنجاح!');
            document.getElementById('newsTitle').value = '';
            document.getElementById('newsContent').value = '';
            loadNews();
        } else {
            alert('❌ ' + (data.msg || 'فشل نشر الخبر'));
        }
    } catch (err) {
        console.error('خطأ:', err);
        alert('❌ حدث خطأ في نشر الخبر');
    }
}

// ربط زر النشر
const publishNewsBtn = document.getElementById('publishNewsBtn');
if (publishNewsBtn) {
    publishNewsBtn.addEventListener('click', publishNews);
}

// استماع لتحديثات الأخبار من السيرفر
socket.on('news-updated', () => {
    loadNews();
});
// ========== إظهار حقل الأخبار للمشرف ==========

// أولاً: دالة إظهار الحقل
function showNewsSection() {
    const addSection = document.getElementById('addNewsSection');
    if (addSection) {
        if (myUsername === 'MOHAMED') {
            addSection.style.display = 'block';
            console.log('✅ حقل الأخبار ظهر للمشرف MOHAMED');
        } else {
            addSection.style.display = 'none';
        }
    }
}

// ثانياً: ربط مع loadMyProfile
const originalLoadMyProfile = loadMyProfile;
loadMyProfile = async function() {
    await originalLoadMyProfile();
    showNewsSection();
    if (typeof loadNews === 'function') loadNews();
};

// ثالثاً: إظهار فوري بعد تحميل الصفحة
setTimeout(() => {
    showNewsSection();
}, 1000);
// ========== إصلاح مشكلة المسافة في حقل كتابة الأخبار ==========
const newsTitleInput = document.getElementById('newsTitle');
const newsContentInput = document.getElementById('newsContent');

if (newsTitleInput) {
    newsTitleInput.addEventListener('keydown', function(e) {
        if (e.code === 'Space') {
            e.stopPropagation();
        }
    });
}

if (newsContentInput) {
    newsContentInput.addEventListener('keydown', function(e) {
        if (e.code === 'Space') {
            e.stopPropagation();
        }
    });
}
// ========== إصلاح مشكلة المسافة في حقل كتابة الرسائل الخاصة ==========
const privateChatInput = document.getElementById('privateChatInput');

if (privateChatInput) {
    privateChatInput.addEventListener('keydown', function(e) {
        if (e.code === 'Space') {
            e.stopPropagation();
        }
    });
    
    // كمان نتأكد إنه يقبل المسافة
    privateChatInput.addEventListener('input', function(e) {
        // ما نسوي شيء، بس نسمح للمسافة
        console.log('كتابة في الخاص:', this.value);
    });
}

// كمان إصلاح حقول الأخبار مرة وحدة
const fixAllSpaces = () => {
    const inputs = ['messageInput', 'privateChatInput', 'newsTitle', 'newsContent'];
    inputs.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.code === 'Space') {
                    e.stopPropagation();
                }
            });
        }
    });
};

setTimeout(fixAllSpaces, 1000);
// ========== منع تكرار الرسائل الخاصة ==========
// تخزين معرفات الرسائل المرسلة مسبقاً
const processedMessages = new Set();

// تعديل حدث استقبال الرسائل الخاصة
const originalPrivateMessageHandler = socket._callbacks?.['$private message']?.[0];
if (originalPrivateMessageHandler) {
    socket.off('private message');
}

socket.on('private message', (data) => {
    // إنشاء معرف فريد للرسالة
    const messageKey = `${data.id || data.createdAt}_${data.from}_${data.to}_${data.msg.substring(0, 20)}`;
    
    // التحقق من تكرار الرسالة
    if (processedMessages.has(messageKey)) {
        console.log('⚠️ تم تجاهل رسالة مكررة:', messageKey);
        return;
    }
    
    // إضافة المعرف للقائمة
    processedMessages.add(messageKey);
    
    // تنظيف القائمة القديمة (احتفظ بآخر 100 رسالة فقط)
    if (processedMessages.size > 100) {
        const iterator = processedMessages.values();
        for (let i = 0; i < 50; i++) {
            processedMessages.delete(iterator.next().value);
        }
    }
    
    // معالجة الرسالة الأصلية
    if (data.from === myUsername) return;
    
    if (currentPrivateChat === data.from || currentPrivateChat === data.to) {
        const isMe = data.from === myUsername;
        appendPrivateMessage(
            isMe ? myUsername : data.from,
            data.msg,
            isMe ? myAvatar : (data.avatar || 'https://via.placeholder.com/30'),
            isMe
        );
    } else {
        totalUnreadMsgs++;
        updateMessageBadge(totalUnreadMsgs);
    }
});

// تنفيذ الدالة بعد تحميل الصفحة مباشرة
setTimeout(addFeaturesButtons, 100);
// ========== تعديل شكل الرتبة إلى أيقونة فقط ==========
// استبدال دالة getUserBadge لتعرض أيقونة فقط بدل النص
const originalGetUserBadge = window.getUserBadge;
window.getUserBadge = function(username, role = 'guest') {
    const lowerUsername = username.toLowerCase();
    
    // أصحاب الموقع
    if (lowerUsername === 'nour' || lowerUsername === 'mohamed') {
        return '<span class="rank-icon">👑</span>';
    }
    if (lowerUsername === 'mira') {
        return '<span class="rank-icon">🌹</span>';
    }
    
    // الرتب حسب الدور
    switch (role.toLowerCase()) {
        case 'superadmin':
            return '<span class="rank-icon">⚡</span>';
        case 'admin':
            return '<span class="rank-icon">🛡️</span>';
        case 'premium':
            return '<span class="rank-icon">💎</span>';
        case 'vip':
            return '<span class="rank-icon">⭐</span>';
        case 'بريميوم':
            return '<span class="rank-icon">💎</span>';
        default:
            return '';
    }
};

// تحديث عرض الرسائل الموجودة
setTimeout(() => {
    const messages = document.querySelectorAll('.message');
    messages.forEach(msg => {
        const badgeSpan = msg.querySelector('.username-line .badge');
        if (badgeSpan) {
            const oldBadge = badgeSpan.outerHTML;
            const username = msg.querySelector('strong')?.innerText || '';
            const role = 'guest';
            const newBadge = window.getUserBadge(username, role);
            if (newBadge) {
                badgeSpan.outerHTML = newBadge;
            }
        }
    });
}, 500);
// ========== خلفية الاسم - كل شخص يغير خلفية اسمه فقط ==========
let myNameBg = localStorage.getItem('myNameBg') || '';

// تطبيق الخلفية على اسم المستخدم الحالي فقط
function applyMyNameBackground() {
    const currentUsername = myUsername;
    if (!currentUsername) return;
    
    document.querySelectorAll('.message').forEach(msg => {
        const usernameEl = msg.querySelector('.message-content strong');
        const username = usernameEl?.innerText;
        
        if (username === currentUsername && myNameBg && myNameBg !== 'transparent') {
            usernameEl.style.backgroundColor = myNameBg;
            usernameEl.style.padding = '4px 12px';
            usernameEl.style.borderRadius = '20px';
            usernameEl.style.display = 'inline-block';
        } else if (username !== currentUsername) {
            // نتحقق إذا كان المستخدم الآخر عنده خلفية محفوظة
            const otherUserBg = localStorage.getItem(`nameBg_${username}`);
            if (otherUserBg && otherUserBg !== 'transparent') {
                usernameEl.style.backgroundColor = otherUserBg;
                usernameEl.style.padding = '4px 12px';
                usernameEl.style.borderRadius = '20px';
                usernameEl.style.display = 'inline-block';
            } else {
                usernameEl.style.backgroundColor = '';
                usernameEl.style.padding = '';
                usernameEl.style.borderRadius = '';
            }
        }
    });
}

// تفعيل زر خلفية الاسم
setTimeout(() => {
    const nameBtn = document.getElementById('featureNameBgBtn');
    if (nameBtn) {
        const newBtn = nameBtn.cloneNode(true);
        nameBtn.parentNode.replaceChild(newBtn, nameBtn);
        
        newBtn.addEventListener('click', () => {
            const colors = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#06b6d4', '#000000'];
            const colorNames = ['🔴 أحمر', '🔵 أزرق', '🟢 أخضر', '🟠 برتقالي', '🟣 بنفسجي', '🌸 زهري', '💎 سماوي', '⚫ أسود'];
            
            let html = `
                <div id="nameBgOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.85);z-index:100000;display:flex;align-items:center;justify-content:center;">
                    <div style="background:#1e293b;border-radius:20px;padding:25px;width:380px;text-align:center;border:2px solid #3b82f6;">
                        <h4 style="color:white;margin-bottom:20px;">🎨 اختر لون خلفية اسمك</h4>
                        <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px;">
                            ${colors.map((color, i) => `
                                <div onclick="document.getElementById('nameBgOverlay')?.remove(); window.setMyNameBgColor('${color}')" 
                                     style="background:${color}; height:50px; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold;">
                                    ${colorNames[i]}
                                </div>
                            `).join('')}
                            <div onclick="document.getElementById('nameBgOverlay')?.remove(); window.setMyNameBgColor('transparent')" 
                                 style="background:#334155; height:50px; border-radius:12px; cursor:pointer; display:flex; align-items:center; justify-content:center; color:white; font-weight:bold; border:2px solid white;">
                                🗑️ إلغاء الخلفية
                            </div>
                        </div>
                        <button onclick="document.getElementById('nameBgOverlay')?.remove()" 
                                style="background:#ef4444; border:none; padding:10px 25px; border-radius:10px; color:white; cursor:pointer;">
                            إغلاق
                        </button>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
        });
    }
}, 1000);

// دالة تعيين لون خلفية الاسم للمستخدم الحالي
window.setMyNameBgColor = function(color) {
    const currentUsername = myUsername;
    if (!currentUsername) return;
    
    if (color === 'transparent') {
        myNameBg = '';
        localStorage.removeItem('myNameBg');
        // حفظ في السيرفر
        fetch('/api/save-name-bg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ nameBg: '' })
        }).catch(() => {});
    } else {
        myNameBg = color;
        localStorage.setItem('myNameBg', color);
        // حفظ في السيرفر
        fetch('/api/save-name-bg', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
            body: JSON.stringify({ nameBg: color })
        }).catch(() => {});
    }
    applyMyNameBackground();
};

// جلب خلفية المستخدمين الآخرين من السيرفر
async function loadOtherUsersBackground() {
    try {
        const res = await fetch('/api/get-users-name-bg', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const users = await res.json();
        users.forEach(user => {
            if (user.nameBg && user.nameBg !== '') {
                localStorage.setItem(`nameBg_${user.username}`, user.nameBg);
            }
        });
        applyMyNameBackground();
    } catch(e) { console.log(e); }
}

// تطبيق الخلفية المحفوظة
setTimeout(() => {
    loadOtherUsersBackground();
    applyMyNameBackground();
}, 1500);

// مراقبة الرسائل الجديدة
const bgObserver = new MutationObserver(() => applyMyNameBackground());
setTimeout(() => {
    const chatWin = document.getElementById('chatWindow');
    if (chatWin) bgObserver.observe(chatWin, { childList: true, subtree: true });
}, 2000);
// ========== إضافة أزرار المميزات ==========
function addFeaturesButtons() {
    const featuresPane = document.getElementById('tab-features');
    if (featuresPane) {
        featuresPane.innerHTML = `
            <div class="features-list" style="display: flex; flex-direction: column; gap: 12px;">
                <button class="feature-btn" id="featureNameBgBtn">
                    <i class="fas fa-palette"></i> خلفية الاسم
                </button>
                <button class="feature-btn" id="featureAnimatedAvatarBtn">
                    <i class="fas fa-film"></i> صورة شخصية متحركة
                </button>
                <button class="feature-btn" id="featureNameGlowBtn">
                    <i class="fas fa-magic"></i> توهج خلفية الاسم
                </button>
                <button class="feature-btn" id="featureProfileColorsBtn">
                    <i class="fas fa-fill-drip"></i> ألوان البروفايل
                </button>
                <button class="feature-btn" id="featureAvatarBorderBtn">
                    <i class="fas fa-border-all"></i> إطار الصورة
                </button>
            </div>
        `;
        featuresPane.classList.remove('hidden');
        featuresPane.classList.add('active');
        console.log('✅ تم إضافة أزرار المميزات');
    }
}

// استدعاء الدالة بعد تحميل الصفحة
setTimeout(addFeaturesButtons, 500);
// ========== إطارات الصورة (كل شخص يختار إطار لنفسه ويظهر للجميع) ==========
let mySelectedFrame = localStorage.getItem('mySelectedFrame') || '';

// تطبيق الإطارات على جميع الصور (لكل شخص حسب إطاره)
function applyAllFrames() {
    const currentUsername = myUsername;
    
    document.querySelectorAll('.message img, #avatar, #myProfileAvatar, .user-item-simple img, .private-message img, .my-private-message img').forEach(img => {
        // إزالة جميع الإطارات القديمة
        img.classList.remove('frame-red', 'frame-blue', 'frame-green', 'frame-gold', 'frame-purple', 'frame-pink', 'frame-cyan', 'frame-white');
        img.classList.remove('frame-animated-1', 'frame-animated-2', 'frame-animated-3', 'frame-animated-4', 'frame-animated-5', 'frame-animated-6', 'frame-animated-7', 'frame-animated-8');
        
        // تحديد اسم المستخدم لهذه الصورة
        let username = '';
        const parent = img.closest('.message, .user-item-simple, .private-message, .my-private-message');
        if (parent) {
            const nameEl = parent.querySelector('strong, .user-name-simple');
            if (nameEl) username = nameEl.innerText.trim();
        }
        
        // تطبيق الإطار المناسب
        if (username === currentUsername && mySelectedFrame) {
            img.classList.add(mySelectedFrame);
        } else if (username) {
            const userFrame = localStorage.getItem(`frame_${username}`);
            if (userFrame && userFrame !== '') {
                img.classList.add(userFrame);
            }
        }
    });
}

// عرض لوحة اختيار الإطارات
function showFramePicker() {
    const frames = [
        { name: 'إطار أحمر', class: 'frame-red', color: '#ef4444', animated: false },
        { name: 'إطار أزرق', class: 'frame-blue', color: '#3b82f6', animated: false },
        { name: 'إطار أخضر', class: 'frame-green', color: '#10b981', animated: false },
        { name: 'إطار ذهبي', class: 'frame-gold', color: '#fbbf24', animated: false },
        { name: 'إطار بنفسجي', class: 'frame-purple', color: '#8b5cf6', animated: false },
        { name: 'إطار زهري', class: 'frame-pink', color: '#ec4899', animated: false },
        { name: 'إطار سماوي', class: 'frame-cyan', color: '#06b6d4', animated: false },
        { name: 'إطار أبيض', class: 'frame-white', color: '#ffffff', animated: false },
        { name: '🔥 إطار متوهج أحمر', class: 'frame-animated-1', color: '#ef4444', animated: true },
        { name: '💙 إطار متوهج أزرق', class: 'frame-animated-2', color: '#3b82f6', animated: true },
        { name: '💚 إطار متوهج أخضر', class: 'frame-animated-3', color: '#10b981', animated: true },
        { name: '⭐ إطار متوهج ذهبي', class: 'frame-animated-4', color: '#fbbf24', animated: true },
        { name: '🟣 إطار متوهج بنفسجي', class: 'frame-animated-5', color: '#8b5cf6', animated: true },
        { name: '🌸 إطار متوهج زهري', class: 'frame-animated-6', color: '#ec4899', animated: true },
        { name: '💎 إطار متوهج سماوي', class: 'frame-animated-7', color: '#06b6d4', animated: true },
        { name: '⚪ إطار متوهج أبيض', class: 'frame-animated-8', color: '#ffffff', animated: true }
    ];
    
    let html = `
        <div id="framePickerOverlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:100000;display:flex;align-items:center;justify-content:center;overflow-y:auto;">
            <div style="background:#1e293b;border-radius:20px;padding:25px;width:500px;max-height:80vh;overflow-y:auto;text-align:center;border:2px solid #3b82f6;">
                <h4 style="color:white;margin-bottom:20px;">🖼️ اختر إطار صورتك</h4>
                <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:20px;">
                    ${frames.map(frame => `
                        <div onclick="document.getElementById('framePickerOverlay')?.remove(); window.setMyAvatarFrame('${frame.class}')" 
                             style="background:#0f172a;padding:12px;border-radius:12px;cursor:pointer;text-align:center;border:1px solid #334155;">
                            <div style="width:50px;height:50px;border-radius:50%;background:${frame.color};margin:0 auto 8px auto; ${frame.animated ? 'box-shadow:0 0 10px ' + frame.color : ''}"></div>
                            <span style="color:white;font-size:12px;">${frame.name}</span>
                        </div>
                    `).join('')}
                    <div onclick="document.getElementById('framePickerOverlay')?.remove(); window.setMyAvatarFrame('')" 
                         style="background:#ef4444;padding:12px;border-radius:12px;cursor:pointer;text-align:center;grid-column:span 2;">
                        <span style="color:white;font-weight:bold;">🗑️ إزالة الإطار</span>
                    </div>
                </div>
                <button onclick="document.getElementById('framePickerOverlay')?.remove()" 
                        style="background:#ef4444;border:none;padding:10px 25px;border-radius:10px;color:white;cursor:pointer;">
                    إغلاق
                </button>
            </div>
        </div>
    `;
    document.body.insertAdjacentHTML('beforeend', html);
}

// دالة تعيين الإطار للمستخدم الحالي
window.setMyAvatarFrame = function(frameClass) {
    mySelectedFrame = frameClass;
    localStorage.setItem('mySelectedFrame', mySelectedFrame);
    applyAllFrames();
    
    // حفظ في السيرفر
    fetch('/api/save-avatar-frame', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ frame: mySelectedFrame })
    }).catch(() => {});
};

// جلب إطارات المستخدمين الآخرين من السيرفر
async function loadOtherUsersFrames() {
    try {
        const res = await fetch('/api/get-users-frames', {
            headers: { 'Authorization': 'Bearer ' + token }
        });
        const users = await res.json();
        users.forEach(user => {
            if (user.avatar_frame && user.avatar_frame !== '') {
                localStorage.setItem(`frame_${user.username}`, user.avatar_frame);
            }
        });
        applyAllFrames();
    } catch(e) { console.log(e); }
}

// تفعيل زر إطار الصورة
setTimeout(() => {
    const frameBtn = document.getElementById('featureAvatarBorderBtn');
    if (frameBtn) {
        const newBtn = frameBtn.cloneNode(true);
        frameBtn.parentNode.replaceChild(newBtn, frameBtn);
        newBtn.addEventListener('click', showFramePicker);
    }
}, 1000);

// تحميل الإطارات وتطبيقها
setTimeout(() => {
    loadOtherUsersFrames();
    applyAllFrames();
}, 1500);

// مراقبة الصور الجديدة
const frameObserver = new MutationObserver(() => applyAllFrames());
setTimeout(() => {
    const chatWin = document.getElementById('chatWindow');
    if (chatWin) frameObserver.observe(chatWin, { childList: true, subtree: true });
}, 2000);
