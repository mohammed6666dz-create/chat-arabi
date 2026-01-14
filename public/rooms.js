const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

async function loadRooms() {
  const res = await fetch('/room-counts');
  const counts = await res.json();
  
  // أضفت 'admin' إلى قائمة الغرف
  const rooms = ['general', 'algeria', 'all_countries', 'admin'];

  // إعدادات غرفة الإدارة الجديدة
  const names = {
    general: { name: 'العامة', icon: '💬' },
    algeria: { name: 'الجزائر', icon: '🇩🇿' },
    all_countries: { name: 'كل البلدان', icon: '🌍' },
    admin: { name: 'الإدارة', icon: '🛠️' } // غرفة التحكم
  };

  const list = document.getElementById('roomsList');
  list.innerHTML = ''; 

  rooms.forEach(room => {
    const div = document.createElement('div');
    div.className = 'room-card';
    
    // إذا كانت الغرفة هي الإدارة، نغير وظيفة الزر لفتح لوحة التحكم
    const onClickFunction = room === 'admin' ? `openAdminPanel()` : `enterRoom('${room}')`;
    const btnText = room === 'admin' ? 'فتح اللوحة' : 'دخول الغرفة';

    div.innerHTML = `
      <div class="icon">${names[room].icon}</div>
      <div class="name">${names[room].name}</div>
      <div class="count">عدد الأشخاص: ${counts[room] || 0}</div>
      <button onclick="${onClickFunction}">${btnText}</button>
    `;
    list.appendChild(div);
  });
}

// وظيفة دخول الغرف العادية
function enterRoom(room) {
  window.location.href = `chat.html?room=${room}`;
}

// وظيفة لوحة تحكم الإدارة (تظهر مكان القائمة عند الضغط)
function openAdminPanel() {
  const list = document.getElementById('roomsList');
  list.innerHTML = `
    <div class="admin-panel" style="background: #f4f4f4; padding: 20px; border-radius: 10px; width: 100%; direction: rtl;">
      <h3>🛠️ لوحة تحكم الرتب</h3>
      <input type="text" id="targetUser" placeholder="اسم المستخدم" style="padding: 8px; margin: 5px; width: 80%;">
      <br>
      <select id="roleSelect" style="padding: 8px; margin: 5px; width: 80%;">
        <option value="admin">مدير</option>
        <option value="mod">مراقب</option>
        <option value="vip">عضو مميز</option>
      </select>
      <br>
      <button onclick="manageRole('add')" style="background: green; color: white; padding: 10px; margin: 5px; cursor: pointer;">إرسال رتبة</button>
      <button onclick="manageRole('remove')" style="background: red; color: white; padding: 10px; margin: 5px; cursor: pointer;">سحب رتبة</button>
      <br>
      <button onclick="loadRooms()" style="background: gray; color: white; margin-top: 15px;">العودة للغرف</button>
    </div>
  `;
}

// وظيفة إرسال أو سحب الرتبة (تعمل مع السيرفر)
async function manageRole(action) {
  const username = document.getElementById('targetUser').value;
  const role = document.getElementById('roleSelect').value;

  if (!username) return alert("يرجى كتابة اسم المستخدم");

  const endpoint = action === 'add' ? '/assign-role' : '/remove-role';
  
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ username, role })
  });

  if (res.ok) {
    alert(action === 'add' ? "تم إعطاء الرتبة بنجاح ✅" : "تم سحب الرتبة بنجاح ❌");
  } else {
    alert("حدث خطأ، تأكد من الصلاحيات أو اسم المستخدم");
  }
}

loadRooms();
