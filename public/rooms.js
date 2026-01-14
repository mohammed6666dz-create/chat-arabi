const token = localStorage.getItem('token') || sessionStorage.getItem('token'); 
if (!token) window.location.href = 'index.html'; 

async function loadRooms() { 
  const res = await fetch('/room-counts'); 
  const counts = await res.json(); 
  const rooms = ['general', 'algeria', 'all_countries'];

  // قمت بإضافة أيقونات (Emojis) لتناسب التصميم الاحترافي 
  const names = { 
    general: { name: 'العامة', icon: '💬' }, 
    algeria: { name: 'الجزائر', icon: '🇩🇿' }, 
    all_countries: { name: 'كل البلدان', icon: '🌍' } 
  };

  const list = document.getElementById('roomsList'); 
  list.innerHTML = ''; // تنظيف القائمة قبل التحميل 
  rooms.forEach(room => { 
    const div = document.createElement('div');

    // تغيير الكلاس من room إلى room-card ليتناسب مع الـ CSS 
    div.className = 'room-card'; 
    div.innerHTML = `
      <div class="icon">${names[room].icon}</div>
      <div class="name">${names[room].name}</div>
      <div class="count">عدد الأشخاص: ${counts[room] || 0}</div>
      <button onclick="enterRoom('${room}')">دخول الغرفة</button>
    `; 
    list.appendChild(div); 
  }); 
} 

function enterRoom(room) { 
  window.location.href = `chat.html?room=${room}`; 
} 

loadRooms();
