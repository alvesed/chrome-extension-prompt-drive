// =========================
// API - Backend Integration (Stub)
// =========================

const api = {
  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.classList.add('toast--show'), 10);
    setTimeout(() => {
      toast.classList.remove('toast--show');
      setTimeout(() => {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 300);
    }, 3000);
  },

  getErrorMessageFromStatus(status) {
    const map = {
      400: 'Credenciais inválidas ou dados incorretos.',
      401: 'Acesso não autorizado. Verifique a chave da API.',
      422: 'Dados inválidos. Revise os campos informados.',
      429: 'Muitas tentativas. Aguarde alguns instantes.',
      500: 'Erro interno no serviço de autenticação.'
    };
    return map[status] || 'Falha na requisição de autenticação.';
  },

  storageGet(keys) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.get(keys, (result) => resolve(result || {}));
        return;
      }

      const keyList = Array.isArray(keys) ? keys : [keys];
      const result = {};
      keyList.forEach((key) => {
        const value = localStorage.getItem(key);
        result[key] = value !== null ? value : undefined;
      });
      resolve(result);
    });
  },

  storageSet(payload) {
    return new Promise((resolve) => {
      if (typeof chrome !== 'undefined' && chrome.storage?.local) {
        chrome.storage.local.set(payload, () => resolve());
        return;
      }

      Object.entries(payload || {}).forEach(([key, value]) => {
        localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
      });
      resolve();
    });
  },

  async ensureAccessTokenKey() {
    const current = await this.storageGet([USER_ACCESS_TOKEN_KEY]);
    if (typeof current[USER_ACCESS_TOKEN_KEY] === 'undefined') {
      await this.storageSet({ [USER_ACCESS_TOKEN_KEY]: '' });
      return '';
    }
    return current[USER_ACCESS_TOKEN_KEY] || '';
  },

  async getAccessToken() {
    await this.ensureAccessTokenKey();
    const current = await this.storageGet([USER_ACCESS_TOKEN_KEY]);
    return current[USER_ACCESS_TOKEN_KEY] || '';
  },

  async setAccessToken(token) {
    await this.storageSet({ [USER_ACCESS_TOKEN_KEY]: token || '' });
  },

  async clearAccessToken() {
    await this.setAccessToken('');
  },

  async doLogin(email, password) {
    try {
      await this.ensureAccessTokenKey();
      const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email, password })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.msg || payload?.error_description || payload?.error || this.getErrorMessageFromStatus(response.status);
        this.showToast(message);
        throw new Error(message);
      }

      if (!payload?.access_token || !payload?.user?.id) {
        const message = 'Resposta de login inválida.';
        this.showToast(message);
        throw new Error(message);
      }

      await this.setAccessToken(payload.access_token);
      return payload;
    } catch (error) {
      if (!error?.message) {
        this.showToast('Erro inesperado ao fazer login.');
      }
      throw error;
    }
  },

  async createuser(email, senha, nome) {
    try {
      const response = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          email,
          password: senha,
          data: { full_name: nome }
        })
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = payload?.msg || payload?.error_description || payload?.error || this.getErrorMessageFromStatus(response.status);
        this.showToast(message);
        throw new Error(message);
      }
      return payload;
    } catch (error) {
      if (!error?.message) {
        this.showToast('Erro inesperado ao criar conta.');
      }
      throw error;
    }
  },

  async loadCurrentUserData() {
    const token = await this.getAccessToken();
    if (!token) return null;
    if (!window.supabase?.createClient) {
      throw new Error('Supabase client indisponível para carga inicial.');
    }

    const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr) throw userErr;
    const user = userData?.user;
    if (!user) return null;

    const userName = user.user_metadata?.full_name ?? user.user_metadata?.name ?? user.email ?? 'Sem nome';

    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('user_id, stripe_customer_id, plan')
      .eq('user_id', user.id)
      .maybeSingle();
    if (profileErr) throw profileErr;

    const { data: subscription, error: subErr } = await supabase
      .from('subscriptions')
      .select(`
        id,
        status,
        current_period_start,
        current_period_end,
        cancel_at_period_end
      `)
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing'])
      .order('current_period_end', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subErr) throw subErr;

    const { data: folders, error: foldersErr } = await supabase
      .from('folders')
      .select(`
        id,
        name,
        created_at,
        updated_at,
        prompts (
          id,
          name,
          content,
          created_at,
          updated_at
        )
      `)
      .eq('user_id', user.id)
      .order('created_at', { ascending: true });
    if (foldersErr) throw foldersErr;

    return {
      user: { id: user.id, name: userName },
      profile: {
        stripe_customer_id: profile?.stripe_customer_id ?? null,
        plan: profile?.plan ?? 'free'
      },
      subscription: subscription
        ? {
            id: subscription.id,
            status: subscription.status,
            period_start: subscription.current_period_start,
            period_end: subscription.current_period_end,
            cancel_at_period_end: subscription.cancel_at_period_end
          }
        : null,
      folders: (folders || []).map(folder => ({
        ...folder,
        prompts: folder.prompts || []
      }))
    };
  },

  createFolder: (payload) => {
    console.log('[API] createFolder', payload);
    // Future: fetch POST /api/folders
  },

  updateFolder: (payload) => {
    console.log('[API] updateFolder', payload);
    // Future: fetch PUT /api/folders/:folderId
  },

  deleteFolder: (payload) => {
    console.log('[API] deleteFolder', payload);
    // Future: fetch DELETE /api/folders/:folderId
  },

  createPrompt: (payload) => {
    console.log('[API] createPrompt', payload);
    // Future: fetch POST /api/prompts
  },

  updatePrompt: (payload) => {
    console.log('[API] updatePrompt', payload);
    // Future: fetch PUT /api/prompts/:promptId
  },

  deletePrompt: (payload) => {
    console.log('[API] deletePrompt', payload);
    // Future: fetch DELETE /api/prompts/:promptId
  },

  activateLicenseKey: (payload) => {
    console.log('[API] activateLicenseKey', payload);
    // Future: fetch POST /api/licenses/activate
  }
};
