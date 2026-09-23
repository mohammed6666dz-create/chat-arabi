// ========== التبديل بين Login و Sign Up ==========
const registerLink = document.getElementById('registerLink');
const loginForm = document.getElementById('loginForm');
const registerForm = document.getElementById('registerForm');

if (registerLink) {
  registerLink.addEventListener('click', e => {
    e.preventDefault();
    loginForm.style.display = 'none';
    registerForm.style.display = 'block';
  });
}

// ========== دالة عرض رسالة الخطأ ==========
function showMessage(form, text, type = 'error') {
  const oldMsg = form.querySelector('.form-message');
  if (oldMsg) oldMsg.remove();

  const msg = document.createElement('div');
  msg.className = 'form-message ' + type;
  msg.textContent = text;
  msg.style.cssText = `
    padding: 10px 15px;
    border-radius: 10px;
    font-size: 0.85rem;
    margin-bottom: 10px;
    text-align: center;
    background: ${type === 'error' ? 'rgba(239, 68, 68, 0.25)' : 'rgba(16, 185, 129, 0.25)'};
    color: ${type === 'error' ? '#fecaca' : '#a7f3d0'};
    border: 1px solid ${type === 'error' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(16, 185, 129, 0.5)'};
  `;
  form.insertBefore(msg, form.firstChild);

  setTimeout(() => {
    if (msg.parentNode) msg.remove();
  }, 5000);
}

// ========== إنشاء حساب جديد ==========
if (registerForm) {
  registerForm.addEventListener('submit', async e => {
    e.preventDefault();

    const username = document.getElementById('regUsername').value.trim();
    const password = document.getElementById('regPassword').value.trim();

    if (!username || !password) {
      showMessage(registerForm, '❌ الرجاء إدخال اسم المستخدم وكلمة المرور', 'error');
      return;
    }

    try {
      const res = await fetch('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (!res.ok) {
        showMessage(registerForm, '❌ ' + (data.msg || 'فشل إنشاء الحساب'), 'error');
        return;
      }

      // نجح إنشاء الحساب
      showMessage(registerForm, '✅ تم إنشاء حسابك بنجاح! جاري تسجيل دخولك...', 'success');

      // تعبئة بيانات الدخول تلقائياً
      document.getElementById('username').value = username;
      document.getElementById('password').value = password;

      // الانتقال إلى نموذج تسجيل الدخول بعد ثانية
      setTimeout(() => {
        registerForm.style.display = 'none';
        loginForm.style.display = 'block';

        // تسجيل الدخول تلقائياً
        setTimeout(async () => {
          const loginRes = await fetch('/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
          });
          const loginData = await loginRes.json();

          if (loginRes.ok && loginData.token) {
            localStorage.setItem('token', loginData.token);
            window.location.href = 'rooms.html';
          } else {
            showMessage(loginForm, '❌ فشل الدخول التلقائي، الرجاء تسجيل الدخول يدوياً', 'error');
          }
        }, 500);
      }, 1200);

    } catch (err) {
      console.error('خطأ في إنشاء الحساب:', err);
      showMessage(registerForm, '❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    }
  });
}

// ========== تسجيل الدخول ==========
if (loginForm) {
  loginForm.addEventListener('submit', async e => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const remember = document.getElementById('remember').checked;

    if (!username || !password) {
      showMessage(loginForm, '❌ الرجاء إدخال اسم المستخدم وكلمة المرور', 'error');
      return;
    }

    try {
      const res = await fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await res.json();

      if (res.ok && data.token) {
        // نجح تسجيل الدخول → حفظ التوكن
        (remember ? localStorage : sessionStorage).setItem('token', data.token);
        // الانتقال إلى صفحة الغرف
        window.location.href = 'rooms.html';
      } else {
        // فشل تسجيل الدخول → البقاء في الصفحة وعرض الخطأ
        showMessage(loginForm, '❌ ' + (data.msg || 'اسم المستخدم أو كلمة المرور غير صحيحة'), 'error');
      }
    } catch (err) {
      console.error('خطأ في تسجيل الدخول:', err);
      showMessage(loginForm, '❌ حدث خطأ في الاتصال بالسيرفر', 'error');
    }
  });
}
