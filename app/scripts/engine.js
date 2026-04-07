// =========================
// Engine - Business Logic & Orchestration
// =========================

const engine = {
  // Initialize application - load seed data
  async initialize() {
    const supabase = window.supabase?.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    if (!supabase) {
      console.warn('Supabase client was not initialized.');
    } else {
      this.supabase = supabase;
    }

    stateManager.setState({ ui: { ...stateManager.getState().ui, loading: true } });

    try {
      const seedData = await this.loadSeedData();
      const normalized = this.normalizeSeedData(seedData);
      const state = stateManager.getState();

      stateManager.setState({
        user: {
          ...state.user,
          ...normalized.user
        },
        data: { folders: normalized.folders },
        ui: { ...state.ui, loading: false, error: null }
      });
    } catch (error) {
      console.error('Error initializing:', error);
      stateManager.setState({
        ui: { ...stateManager.getState().ui, loading: false, error: { message: error.message } }
      });
    }
  },

  // Load seed data with robust encoding handling
  async loadSeedData() {
    const paths = ['./data/seed.json', '/data/seed.json', 'data/seed.json'];
    
    for (const path of paths) {
      try {
        const response = await fetch(path);
        if (!response.ok) continue;
        
        // Read as text first
        const text = await response.text();
        
        // Clean BOM and zero-width characters
        const cleanText = text.trim().replace(/^[\uFEFF\u200B-\u200D\u2060]/g, '');
        
        const data = JSON.parse(cleanText);
        return data;
      } catch (error) {
        console.warn(`Failed to load from ${path}:`, error.message);
        continue;
      }
    }

    // Fallback inline data
    console.warn('Using fallback seed data');
    return this.getDefaultSeedData();
  },

  normalizeSeedData(seedData) {
    const userSource = seedData.user || {};
    const profile = seedData.profile || {};
    const subscription = seedData.subscription || {};

    const normalizedUser = {
      id: userSource.id || generateUUID(),
      name: userSource.name || 'Usuário',
      plan: (profile.plan === 'premium' || subscription.status === 'active') ? 'premium' : 'free',
      stripeCustomerId: profile.stripe_customer_id || null,
      subscription: {
        id: subscription.id || null,
        status: subscription.status || null,
        periodStart: subscription.period_start || null,
        periodEnd: subscription.period_end || null,
        cancelAtPeriodEnd: Boolean(subscription.cancel_at_period_end)
      },
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    const normalizedFolders = (seedData.folders || []).map(folder => ({
      id: folder.id || generateUUID(),
      name: folder.name || 'Sem nome',
      createdAt: this.toTimestamp(folder.createdAt || folder.created_at),
      updatedAt: this.toTimestamp(folder.updatedAt || folder.updated_at),
      prompts: (folder.prompts || []).map(prompt => ({
        id: prompt.id || generateUUID(),
        nome: prompt.nome || prompt.name || 'Sem nome',
        conteudo: prompt.conteudo || prompt.content || '',
        createdAt: this.toTimestamp(prompt.createdAt || prompt.created_at),
        updatedAt: this.toTimestamp(prompt.updatedAt || prompt.updated_at)
      }))
    }));

    (seedData.prompts || []).forEach(prompt => {
      const folderId = prompt.folderId || prompt.folder_id;
      const folder = normalizedFolders.find(item => item.id === folderId);
      if (!folder) return;
      folder.prompts.push({
        id: prompt.id || generateUUID(),
        nome: prompt.nome || prompt.name || 'Sem nome',
        conteudo: prompt.conteudo || prompt.content || '',
        createdAt: this.toTimestamp(prompt.createdAt || prompt.created_at),
        updatedAt: this.toTimestamp(prompt.updatedAt || prompt.updated_at)
      });
    });

    return { user: normalizedUser, folders: normalizedFolders };
  },

  getDefaultSeedData() {
    return {
      user: { id: generateUUID(), name: 'Usuário Demo' },
      profile: { stripe_customer_id: null, plan: 'free' },
      subscription: {
        id: null,
        status: 'inactive',
        period_start: null,
        period_end: null,
        cancel_at_period_end: false
      },
      folders: [
        {
          id: 'folder-1',
          name: 'Marketing',
          created_at: '2026-01-01T00:00:00.000Z',
          updated_at: '2026-01-01T00:00:00.000Z',
          prompts: [
            {
              id: 'prompt-1',
              name: 'Post para Redes Sociais',
              content: 'Crie um post engajador para [plataforma] sobre [tema].',
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z'
            }
          ]
        }
      ]
    };
  },

  toTimestamp(value) {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') return Date.parse(value) || Date.now();
    return Date.now();
  },

  normalizeImportPayload(importData) {
    if (importData.folder && Array.isArray(importData.prompts)) {
      return importData;
    }

    if (Array.isArray(importData.folders) && importData.folders.length > 0) {
      const firstFolder = importData.folders[0];
      return {
        folder: firstFolder,
        prompts: firstFolder.prompts || []
      };
    }

    throw new Error('Formato inválido: esperado { folder: {...}, prompts: [...] } ou { folders: [...] }');
  },

  findFolderIndexById(folders, folderId) {
    return folders.findIndex(folder => folder.id === folderId);
  },

  findPromptLocationById(folders, promptId) {
    for (let folderIndex = 0; folderIndex < folders.length; folderIndex++) {
      const promptIndex = (folders[folderIndex].prompts || []).findIndex(prompt => prompt.id === promptId);
      if (promptIndex > -1) return { folderIndex, promptIndex };
    }
    return null;
  },

  // Create folder
  handleCreateFolder(folderName) {
    const validation = validateName(folderName);
    if (!validation.valid) {
      this.showToast(TOAST_MESSAGES.folderError);
      return { success: false, error: validation.error };
    }

    const state = stateManager.getState();
    const folderId = generateUUID();
    const now = Date.now();

    const newFolder = {
      id: folderId,
      name: folderName.trim(),
      createdAt: now,
      updatedAt: now
    };

    stateManager.setState({
      data: {
        ...state.data,
        folders: [...state.data.folders, { ...newFolder, prompts: [] }]
      }
    });

    api.createFolder({
      userId: state.user.id,
      folderId,
      folderName: newFolder.name
    });

    this.showToast(TOAST_MESSAGES.folderCreated);
    this.closeDialog('folderDialog');
    return { success: true };
  },

  // Update folder
  handleUpdateFolder(folderId, newName) {
    const validation = validateName(newName);
    if (!validation.valid) {
      this.showToast(TOAST_MESSAGES.folderError);
      return { success: false, error: validation.error };
    }

    const state = stateManager.getState();
    const folderIndex = this.findFolderIndexById(state.data.folders, folderId);
    const folder = folderIndex > -1 ? state.data.folders[folderIndex] : null;
    if (!folder) {
      this.showToast(TOAST_MESSAGES.folderError);
      return { success: false, error: 'Pasta não encontrada' };
    }

    const updatedFolder = {
      ...folder,
      name: newName.trim(),
      updatedAt: Date.now()
    };

    const folders = [...state.data.folders];
    folders[folderIndex] = { ...folders[folderIndex], ...updatedFolder };
    stateManager.setState({
      data: { ...state.data, folders }
    });

    api.updateFolder({
      userId: state.user.id,
      folderId,
      folderName: updatedFolder.name
    });

    this.showToast(TOAST_MESSAGES.folderUpdated);
    this.closeDialog('editFolderDialog');
    return { success: true };
  },

  // Delete folder
  handleDeleteFolder(folderId, confirmName) {
    const state = stateManager.getState();
    const folderIndex = this.findFolderIndexById(state.data.folders, folderId);
    const folder = folderIndex > -1 ? state.data.folders[folderIndex] : null;
    if (!folder) {
      this.showToast(TOAST_MESSAGES.folderDeleteError);
      return { success: false, error: 'Pasta não encontrada' };
    }

    if (confirmName !== folder.name) {
      this.showToast(TOAST_MESSAGES.folderNameMismatch);
      return { success: false, error: TOAST_MESSAGES.folderNameMismatch };
    }

    const folders = state.data.folders.filter(item => item.id !== folderId);
    stateManager.setState({ data: { ...state.data, folders } });

    api.deleteFolder({
      userId: state.user.id,
      folderId
    });

    this.showToast(TOAST_MESSAGES.folderDeleted);
    this.closeDialog('deleteFolderDialog');
    return { success: true };
  },

  // Create prompt
  handleCreatePrompt(folderId, nome, conteudo) {
    if (!stateManager.canCreatePrompt()) {
      this.showToast(TOAST_MESSAGES.limitReached);
      chrome.tabs.create({ url: SALES_LANDING_PAGE_URL });
      return { success: false, error: TOAST_MESSAGES.limitReached };
    }

    const validationNome = validateName(nome);
    if (!validationNome.valid) {
      this.showToast(TOAST_MESSAGES.promptError);
      return { success: false, error: validationNome.error };
    }

    if (!conteudo || conteudo.trim().length === 0) {
      this.showToast(TOAST_MESSAGES.promptError);
      return { success: false, error: 'Conteúdo é obrigatório' };
    }

    const state = stateManager.getState();
    const promptId = generateUUID();
    const now = Date.now();

    const newPrompt = {
      id: promptId,
      nome: nome.trim(),
      conteudo: conteudo.trim(),
      createdAt: now,
      updatedAt: now
    };

    const folderIndex = this.findFolderIndexById(state.data.folders, folderId);
    if (folderIndex < 0) {
      this.showToast(TOAST_MESSAGES.promptError);
      return { success: false, error: 'Pasta não encontrada' };
    }

    const folders = [...state.data.folders];
    folders[folderIndex] = {
      ...folders[folderIndex],
      prompts: [...(folders[folderIndex].prompts || []), newPrompt]
    };

    stateManager.setState({ data: { ...state.data, folders } });

    api.createPrompt({
      userId: state.user.id,
      prompt: { ...newPrompt, folderId }
    });

    this.showToast(TOAST_MESSAGES.promptCreated);
    this.closeDialog('promptDialog');
    return { success: true };
  },

  // Update prompt
  handleUpdatePrompt(promptId, folderId, nome, conteudo) {
    const validationNome = validateName(nome);
    if (!validationNome.valid) {
      this.showToast(TOAST_MESSAGES.promptError);
      return { success: false, error: validationNome.error };
    }

    if (!conteudo || conteudo.trim().length === 0) {
      this.showToast(TOAST_MESSAGES.promptError);
      return { success: false, error: 'Conteúdo é obrigatório' };
    }

    const state = stateManager.getState();
    const location = this.findPromptLocationById(state.data.folders, promptId);
    if (!location) {
      this.showToast(TOAST_MESSAGES.promptError);
      return { success: false, error: 'Prompt não encontrado' };
    }
    const prompt = state.data.folders[location.folderIndex].prompts[location.promptIndex];
    const updatedPrompt = {
      ...prompt,
      nome: nome.trim(),
      conteudo: conteudo.trim(),
      updatedAt: Date.now()
    };

    const targetFolderIndex = this.findFolderIndexById(state.data.folders, folderId);
    if (targetFolderIndex < 0) {
      this.showToast(TOAST_MESSAGES.promptError);
      return { success: false, error: 'Pasta não encontrada' };
    }

    const folders = state.data.folders.map(folder => ({ ...folder, prompts: [...(folder.prompts || [])] }));
    folders[location.folderIndex].prompts.splice(location.promptIndex, 1);
    folders[targetFolderIndex].prompts.push(updatedPrompt);
    stateManager.setState({ data: { ...state.data, folders } });

    api.updatePrompt({
      userId: state.user.id,
      promptId,
      patch: {
        folderId,
        nome: updatedPrompt.nome,
        conteudo: updatedPrompt.conteudo
      }
    });

    this.showToast(TOAST_MESSAGES.promptUpdated);
    this.closeDialog('promptEditDialog');
    return { success: true };
  },

  // Delete prompt
  handleDeletePrompt(promptId) {
    const state = stateManager.getState();
    const location = this.findPromptLocationById(state.data.folders, promptId);
    if (!location) {
      this.showToast(TOAST_MESSAGES.promptError);
      return { success: false, error: 'Prompt não encontrado' };
    }
    const prompt = state.data.folders[location.folderIndex].prompts[location.promptIndex];

    const folders = state.data.folders.map(folder => ({ ...folder, prompts: [...(folder.prompts || [])] }));
    folders[location.folderIndex].prompts.splice(location.promptIndex, 1);
    stateManager.setState({ data: { ...state.data, folders } });

    api.deletePrompt({
      userId: state.user.id,
      promptId
    });

    this.showToast(TOAST_MESSAGES.promptDeleted);
    this.closeDialog('confirmDeletePromptDialog');
    return { success: true };
  },

  // Copy prompt to clipboard
  async handleCopyPrompt(promptId) {
    const prompt = stateManager.getPromptById(promptId);
    if (!prompt) {
      this.showToast(TOAST_MESSAGES.shareError);
      return;
    }

    const result = await copyToClipboard(prompt.conteudo);
    if (result.success) {
      this.showToast(TOAST_MESSAGES.shareSuccess);
    } else {
      this.showToast(TOAST_MESSAGES.shareError);
    }
  },

  // Activate premium
  handleActivatePremium(licenseKey) {
    if (!licenseKey || licenseKey.trim().length === 0) {
      this.showToast(TOAST_MESSAGES.invalidKey);
      return { success: false, error: 'Chave não pode estar vazia' };
    }

    if (!validateLicenseKey(licenseKey.trim())) {
      this.showToast(TOAST_MESSAGES.invalidKey);
      return { success: false, error: TOAST_MESSAGES.invalidKey };
    }

    const state = stateManager.getState();
    const expiry = Date.now() + (PREMIUM_LICENSE_DURATION_DAYS * 24 * 60 * 60 * 1000);

    stateManager.setState({
      user: {
        ...state.user,
        plan: 'premium',
        licenseKey: licenseKey.trim(),
        licenseExpiry: expiry,
        updatedAt: Date.now()
      }
    });

    api.activateLicenseKey({
      userId: state.user.id,
      licenseKey: licenseKey.trim()
    });

    const expiryDate = new Date(expiry).toLocaleDateString('pt-BR');
    this.showToast(`${TOAST_MESSAGES.premiumActivated} ${expiryDate}`);
    this.closeDialog('licenseDialog');
    return { success: true };
  },

  // Export folder (Premium only)
  handleExportFolder(folderId) {
    if (stateManager.isFreePlan()) {
      this.showToast(TOAST_MESSAGES.premiumFeature);
      chrome.tabs.create({ url: SALES_LANDING_PAGE_URL });
      return { success: false };
    }

    const state = stateManager.getState();
    const folder = stateManager.getFolderById(folderId);
    if (!folder) {
      this.showToast(TOAST_MESSAGES.exportError);
      return { success: false };
    }

    const prompts = stateManager.getPromptsByFolder(folderId);
    const exportData = {
      folder: {
        id: folder.id,
        name: folder.name,
        createdAt: folder.createdAt,
        updatedAt: folder.updatedAt
      },
      prompts: prompts.map(p => ({
        id: p.id,
        name: p.nome,
        content: p.conteudo,
        created_at: new Date(p.createdAt).toISOString(),
        updated_at: new Date(p.updatedAt).toISOString()
      }))
    };

    const filename = `${folder.name.replace(/[^a-z0-9]/gi, '_')}_${Date.now()}.json`;
    const result = downloadJSON(exportData, filename);
    
    if (result.success) {
      this.showToast(TOAST_MESSAGES.exportSuccess);
    } else {
      this.showToast(TOAST_MESSAGES.exportError);
    }

    return result;
  },

  // Import folder (Premium only)
  handleImportFolder(jsonText) {
    if (stateManager.isFreePlan()) {
      this.showToast(TOAST_MESSAGES.premiumFeature);
      chrome.tabs.create({ url: SALES_LANDING_PAGE_URL });
      return { success: false };
    }

    try {
      const importData = parseJSON(jsonText);

      const normalizedImport = this.normalizeImportPayload(importData);

      const state = stateManager.getState();
      const existingFolderIds = new Set(state.data.folders.map(f => f.id));
      const existingPromptIds = new Set(
        state.data.folders.flatMap(folder => (folder.prompts || []).map(prompt => prompt.id))
      );
      const existingFolderNames = state.data.folders.map(f => f.name);
      const existingPromptNames = state.data.folders.flatMap(folder => (folder.prompts || []).map(prompt => prompt.nome));

      // Generate new folder ID if duplicate
      let newFolderId = normalizedImport.folder.id;
      if (existingFolderIds.has(newFolderId)) {
        newFolderId = generateUUID();
      }

      // Generate unique folder name
      let newFolderName = generateUniqueName(normalizedImport.folder.name, existingFolderNames);

      const newFolder = {
        id: newFolderId,
        name: newFolderName,
        createdAt: this.toTimestamp(normalizedImport.folder.createdAt || normalizedImport.folder.created_at),
        updatedAt: Date.now(),
        prompts: []
      };

      // Process prompts
      normalizedImport.prompts.forEach(prompt => {
        let newPromptId = prompt.id;
        if (existingPromptIds.has(newPromptId)) {
          newPromptId = generateUUID();
        }

        const promptName = prompt.nome || prompt.name || 'Sem nome';
        let newPromptName = generateUniqueName(promptName, existingPromptNames);
        existingPromptNames.push(newPromptName);

        const newPrompt = {
          id: newPromptId,
          nome: newPromptName,
          conteudo: prompt.conteudo || prompt.content || '',
          createdAt: this.toTimestamp(prompt.createdAt || prompt.created_at),
          updatedAt: Date.now()
        };
        newFolder.prompts.push(newPrompt);
      });

      stateManager.setState({
        data: {
          ...state.data,
          folders: [...state.data.folders, newFolder]
        }
      });

      this.showToast(TOAST_MESSAGES.importSuccess);
      this.closeDialog('importDialog');
      return { success: true };
    } catch (error) {
      console.error('Import error:', error);
      this.showToast(TOAST_MESSAGES.importError);
      return { success: false, error: error.message };
    }
  },

  // Dialog management
  openDialog(dialogName) {
    const state = stateManager.getState();
    stateManager.setState({
      ui: {
        ...state.ui,
        dialogs: { ...state.ui.dialogs, [`${dialogName}Open`]: true }
      }
    });
  },

  closeDialog(dialogName) {
    const state = stateManager.getState();
    stateManager.setState({
      ui: {
        ...state.ui,
        dialogs: { ...state.ui.dialogs, [`${dialogName}Open`]: false },
        currentEditingFolderId: dialogName === 'editFolderDialog' ? null : state.ui.currentEditingFolderId,
        currentEditingPromptId: dialogName === 'promptEditDialog' ? null : state.ui.currentEditingPromptId,
        currentDeletingPromptId: dialogName === 'confirmDeletePromptDialog' ? null : state.ui.currentDeletingPromptId,
        currentDeletingFolderId: dialogName === 'deleteFolderDialog' ? null : state.ui.currentDeletingFolderId
      }
    });
  },

  toggleFolderExpansion(folderId) {
    const state = stateManager.getState();
    const isExpanded = state.ui.expandedFolders[folderId] || false;
    stateManager.setState({
      ui: {
        ...state.ui,
        expandedFolders: { ...state.ui.expandedFolders, [folderId]: !isExpanded }
      }
    });
  },

  // Toast notification
  showToast(message) {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.add('toast--show');
    }, 10);

    setTimeout(() => {
      toast.classList.remove('toast--show');
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }
};
