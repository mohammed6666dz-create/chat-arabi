/**
 * نظام إدارة غرف الدردشة - كود التشغيل (Script)
 */

// 1. التحقق من التوكن (الأمان)
const token = localStorage.getItem('token') || sessionStorage.getItem('token'); 
if (!token) {
    // إذا لم يوجد توكن، يتم توجيه المستخدم لصفحة تسجيل الدخول
    window.location.href = 'index.html'; 
}

// ========== استرجاع آخر غرفة وفتحها تلقائياً ==========
const lastRoom = localStorage.getItem('lastRoom');
if (lastRoom) {
    window.location.href = `chat.html?room=${lastRoom}`;
}

/**
 * دالة جلب بيانات الغرف وتحديث الواجهة
 */
async function loadRooms() { 
    try {
        // محاولة جلب عدد الأشخاص من السيرفر
        const res = await fetch('/room-counts'); 
        
        // التحقق مما إذا كان الرابط يعمل (Status 200)
        if (!res.ok) throw new Error('تعذر الاتصال بالسيرفر لجلب البيانات');
        
        const counts = await res.json(); 
        renderRooms(counts); // تحديث الواجهة بالبيانات الحقيقية

    } catch (error) {
        console.error('خطأ تقني:', error.message);
        // في حال وجود مشكلة بالسيرفر، نظهر الغرف بقيمة 0 بدلاً من صفحة فارغة
        renderRooms({}); 
    }
} 

/**
 * دالة بناء عناصر HTML للغرف بناءً على البيانات
 */
function renderRooms(counts) {
    const rooms = ['all_countries', 'algeria', 'general'];

    // تعريف الأيقونات والأسماء (مطابقة لتصميمك)
    const names = { 
        general: { name: 'العامة', icon: '💬' }, 
        algeria: { name: 'الجزائر', icon: '🇩🇿' }, 
        all_countries: { name: 'كل البلدان', icon: '🌍' } 
    };

    const list = document.getElementById('roomsList'); 
    if (!list) return; // تأكد من وجود div بالمعرف roomsList في HTML

    list.innerHTML = ''; // تنظيف القائمة قبل إعادة البناء

    rooms.forEach(room => { 
        const div = document.createElement('div');
        
        // --- حل المشكلة: مطابقة الكلاسات مع كود الـ CSS الخاص بك ---
        div.className = 'room-card'; 
        
        div.innerHTML = `
            <div class="room-icon">${names[room].icon}</div>
            <h2>${names[room].name}</h2>
            <div class="online-count">
                عدد الأشخاص: ${counts[room] || 0}
            </div>
            <button class="enter-btn" onclick="enterRoom('${room}')">دخول الغرفة</button>
        `; 
        list.appendChild(div); 
    });
}

/**
 * دالة الانتقال إلى غرفة الدردشة (مع حفظ آخر غرفة)
 */
function enterRoom(room) { 
    // حفظ آخر غرفة في localStorage
    localStorage.setItem('lastRoom', room);
    window.location.href = `chat.html?room=${room}`; 
} 

// تشغيل الدالة فور تحميل الصفحة
document.addEventListener('DOMContentLoaded', loadRooms);
