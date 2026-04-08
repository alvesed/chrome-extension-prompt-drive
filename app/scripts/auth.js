// =========================
// Auth Page
// =========================

const authPage = {
  async init() {
    await api.ensureAccessTokenKey();
    const token = await api.getAccessToken();
    if (token) {
      window.location.href = APP_PAGE_PATH;
      return;
    }
    this.bindEvents();
  },

  bindEvents() {
    const loginForm = document.querySelector('#loginForm');
    const signupForm = document.querySelector('#signupForm');
    const loginSection = document.querySelector('#loginSection');
    const signupSection = document.querySelector('#signupSection');
    const btnShowSignup = document.querySelector('#btnShowSignup');
    const btnBackToLogin = document.querySelector('#btnBackToLogin');

    const showLogin = () => {
      if (loginSection) loginSection.style.display = 'block';
      if (signupSection) signupSection.style.display = 'none';
    };

    const showSignup = () => {
      if (loginSection) loginSection.style.display = 'none';
      if (signupSection) signupSection.style.display = 'block';
    };

    showLogin();

    if (btnShowSignup) {
      btnShowSignup.addEventListener('click', () => {
        showSignup();
      });
    }

    if (btnBackToLogin) {
      btnBackToLogin.addEventListener('click', () => {
        showLogin();
      });
    }

    if (loginForm) {
      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(loginForm);
        const email = String(formData.get('email') || '').trim();
        const password = String(formData.get('password') || '').trim();

        try {
          await api.doLogin(email, password);
          api.showToast('Login realizado com sucesso.');
          setTimeout(() => {
            window.location.href = APP_PAGE_PATH;
          }, 400);
        } catch (_) {
          // Toast handled in API.
        }
      });
    }

    if (signupForm) {
      signupForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const formData = new FormData(signupForm);
        const name = String(formData.get('name') || '').trim();
        const email = String(formData.get('email') || '').trim();
        const password = String(formData.get('password') || '').trim();

        try {
          await api.createuser(email, password, name);
          api.showToast('Usuário criado com sucesso sucesso');
          const message = document.querySelector('#authRedirectingMessage');
          if (message) {
            message.style.display = 'block';
          }
          setTimeout(() => {
            if (message) {
              message.style.display = 'none';
            }
            signupForm.reset();
            showLogin();
          }, 1300);
        } catch (_) {
          // Toast handled in API.
        }
      });
    }
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => authPage.init());
} else {
  authPage.init();
}
