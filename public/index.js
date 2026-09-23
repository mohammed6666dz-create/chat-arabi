// ============================================
// Moh Chat - Login & Register Logic
// ============================================

document.addEventListener('DOMContentLoaded', () => {

  // ========== عناصر DOM ==========
  const container = document.querySelector('.container');
  const tabLogin = document.getElementById('tabLogin');
  const tabSignup = document.getElementById('tabSignup');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');

  // حقول تسجيل الدخول
  const loginUsername = document.getElementById('username');
  const loginPassword = document.getElementById('password');
  const rememberCheckbox = document.getElementById('remember');

  // حقول إنشاء الحساب
  const regUsername = document.getElementById('regUsername');
  const regPassword = document.getElementById('regPassword');
  const regEmail = document.getElementById('regEmail');
  const regCountry = document.getElementById('regCountry');
  const regAvatarInput = document.getElementById('regAvatar');
  const regAvatarPreview = document.getElementById('regAvatarPreview');

  // ========== التبديل بين النماذج ==========
  function showLogin() {
    if (container) container.classList.remove('show-signup');
    if (tabLogin) tabLogin.classList.add('active');
    if (tabSignup) tabSignup.classList.remove('active');
    if (loginForm) loginForm.style.display = 'block';
    if (registerForm) registerForm.style.display = 'none';
  }

  function showSignup() {
    if (container) container.classList.add('show-signup');
    if (tabLogin) tabLogin.classList.remove('active');
    if (tabSignup) tabSignup.classList.add('active');
    if (loginForm) loginForm.style.display = 'none';
    if (registerForm) registerForm.style.display = 'block';
  }

  if (tabLogin) tabLogin.addEventListener('click', showLogin);
  if (tabSignup) tabSignup.addEventListener('click', showSignup);

  // ========== معاينة صورة البروفايل ==========
  if (regAvatarInput) {
    regAvatarInput.addEventListener('change', function (e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
          regAvatarPreview.src = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // ========== دالة عرض الرسائل ==========
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

  // ========== تسجيل الدخول ==========
  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = loginUsername.value.trim();
      const password = loginPassword.value.trim();
      const remember = rememberCheckbox ? rememberCheckbox.checked : false;

      if (!username || !password) {
        showMessage(loginForm, '❌ الرجاء إدخال اسم المستخدم وكلمة المرور', 'error');
        return;
      }

      const submitBtn = loginForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'جاري الدخول...';
      submitBtn.disabled = true;

      try {
        const res = await fetch('/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password })
        });

        const data = await res.json();

        if (res.ok && data.token) {
          // نجح → حفظ التوكن والانتقال لصفحة الغرف
          (remember ? localStorage : sessionStorage).setItem('token', data.token);
          window.location.href = 'rooms.html';
        } else {
          // فشل → عرض الخطأ والبقاء
          showMessage(loginForm, '❌ ' + (data.msg || 'اسم المستخدم أو كلمة المرور غير صحيحة'), 'error');
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
        }
      } catch (err) {
        console.error('خطأ:', err);
        showMessage(loginForm, '❌ حدث خطأ في الاتصال بالسيرفر', 'error');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  // ========== إنشاء حساب جديد ==========
  if (registerForm) {
    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = regUsername.value.trim();
      const password = regPassword.value.trim();
      const email = regEmail ? regEmail.value.trim() : '';
      const country = regCountry ? regCountry.value : '';

      // التحقق من الحقول
      if (!username || !password) {
        showMessage(registerForm, '❌ الرجاء إدخال اسم المستخدم وكلمة المرور', 'error');
        return;
      }
      if (password.length < 4) {
        showMessage(registerForm, '❌ كلمة المرور قصيرة جداً (4 أحرف على الأقل)', 'error');
        return;
      }
      if (email && !email.includes('@')) {
        showMessage(registerForm, '❌ البريد الإلكتروني غير صحيح', 'error');
        return;
      }

      const submitBtn = registerForm.querySelector('button[type="submit"]');
      const originalText = submitBtn.textContent;
      submitBtn.textContent = 'جاري إنشاء الحساب...';
      submitBtn.disabled = true;

      try {
        const res = await fetch('/register', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password, email, country })
        });

        const data = await res.json();

        if (!res.ok) {
          showMessage(registerForm, '❌ ' + (data.msg || 'فشل إنشاء الحساب'), 'error');
          submitBtn.textContent = originalText;
          submitBtn.disabled = false;
          return;
        }

        // ✅ نجح إنشاء الحساب
        showMessage(registerForm, '✅ تم إنشاء حسابك! جاري تسجيل دخولك...', 'success');

        // الانتقال إلى Login بعد لحظة
        setTimeout(async () => {
          showLogin();

          // تعبئة الحقول
          if (loginUsername) loginUsername.value = username;
          if (loginPassword) loginPassword.value = password;

          // تسجيل الدخول تلقائياً
          setTimeout(async () => {
            try {
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
                showMessage(loginForm, '❌ فشل الدخول التلقائي، سجل دخولك يدوياً', 'error');
              }
            } catch (err) {
              console.error(err);
              showMessage(loginForm, '❌ خطأ في الدخول التلقائي', 'error');
            }
          }, 500);
        }, 1200);

      } catch (err) {
        console.error('خطأ:', err);
        showMessage(registerForm, '❌ حدث خطأ في الاتصال بالسيرفر', 'error');
        submitBtn.textContent = originalText;
        submitBtn.disabled = false;
      }
    });
  }

  console.log('✅ تم تحميل كود تسجيل الدخول بنجاح');
});
