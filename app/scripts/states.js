// =========================
// State Container - Fonte da Verdade
// =========================

const createStateManager = () => {
  let state = {
    user: {
      id: null,
      name: null,
      plan: 'free',
      licenseKey: null,
      licenseExpiry: null,
      createdAt: Date.now(),
      updatedAt: Date.now()
    },
    ui: {
      loading: false,
      error: null,
      dialogs: {
        folderDialogOpen: false,
        editFolderDialogOpen: false,
        promptDialogOpen: false,
        promptEditDialogOpen: false,
        confirmDeletePromptDialogOpen: false,
        deleteFolderDialogOpen: false,
        licenseDialogOpen: false,
        importDialogOpen: false
      },
      expandedFolders: {},
      currentEditingFolderId: null,
      currentEditingPromptId: null,
      currentDeletingPromptId: null,
      currentDeletingFolderId: null
    },
    data: {
      folders: []
    }
  };

  const listeners = [];

  const getState = () => ({ ...state });

  const setState = (update) => {
    if (typeof update === 'function') {
      state = update(state);
    } else {
      state = { ...state, ...update };
    }
    notifyListeners();
  };

  const subscribe = (listener) => {
    listeners.push(listener);
    return () => {
      const index = listeners.indexOf(listener);
      if (index > -1) {
        listeners.splice(index, 1);
      }
    };
  };

  const notifyListeners = () => {
    listeners.forEach(listener => listener(state));
  };

  // Selectors / Derived State
  const getPromptCountTotal = () => {
    return state.data.folders.reduce((total, folder) => {
      return total + (folder.prompts?.length || 0);
    }, 0);
  };

  const getPromptsByFolder = (folderId) => {
    const folder = state.data.folders.find(item => item.id === folderId);
    if (!folder) return [];
    return [...(folder.prompts || [])].sort((a, b) => a.nome.localeCompare(b.nome));
  };

  const getFolderById = (folderId) => {
    return state.data.folders.find(item => item.id === folderId) || null;
  };

  const getPromptById = (promptId) => {
    for (const folder of state.data.folders) {
      const prompt = (folder.prompts || []).find(item => item.id === promptId);
      if (prompt) {
        return { ...prompt, folderId: folder.id };
      }
    }
    return null;
  };

  const isFreePlan = () => {
    return state.user.plan === 'free';
  };

  const canCreatePrompt = () => {
    if (!isFreePlan()) return true;
    return getPromptCountTotal() < FREE_MAX_PROMPTS;
  };

  return {
    getState,
    setState,
    subscribe,
    getPromptCountTotal,
    getPromptsByFolder,
    getFolderById,
    getPromptById,
    isFreePlan,
    canCreatePrompt
  };
};

const stateManager = createStateManager();
