const token = localStorage.getItem('token') || sessionStorage.getItem('token');
if (!token) window.location.href = 'index.html';

async function loadRooms() {
  const res = await fetch('/room-counts');
  const counts = await res.json();
  const rooms = ['general', 'algeria', 'all_countries'];
  const names = { general: 'العامة', algeria: 'الجزائر', all_countries: 'كل البلدان' };
  const list = document.getElementById('roomsList');
  rooms.forEach(room => {
    const div = document.createElement('div');
    div.className = 'room';
    div.innerHTML = `<h2>${names[room]}</h2><p>عدد الأشخاص: ${counts[room] || 0}</p><button onclick="enterRoom('${room}')">دخول الغرفة</button>`;
    list.appendChild(div);
  });
}
function enterRoom(room) {
  window.location.href = `chat.html?room=${room}`;
}
loadRooms();