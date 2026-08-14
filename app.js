/**
 * CRM PESSOAL DE VENDAS DE CONSÓRCIOS - APPLICATION LOGIC
 */

// Global State Keys
const STORAGE_KEYS = {
  LEADS: 'crm_consorcio_leads_v1',
  GOALS: 'crm_consorcio_goals_v1',
  GOAL_CONFIGS: 'crm_consorcio_goal_configs_v1',
  LAST_DATE: 'crm_consorcio_last_reset_date',
  MONTHLY_TARGET: 'crm_consorcio_monthly_target_v1'
};

// 7 Stages configuration
const KANBAN_STAGES = [
  { id: 1, name: 'Contato Captado', color: 'var(--stage-1)', mandatoryDate: true },
  { id: 2, name: '1ª Reunião (Sondagem)', color: 'var(--stage-2)', mandatoryDate: false },
  { id: 3, name: 'Montando Proposta/Cadastro', color: 'var(--stage-3)', mandatoryDate: false },
  { id: 4, name: '2ª Reunião (Apresentação)', color: 'var(--stage-4)', mandatoryDate: false },
  { id: 5, name: 'Aguardando Contrato/Pagamento', color: 'var(--stage-5)', mandatoryDate: false },
  { id: 6, name: 'Stand-by (Pensando)', color: 'var(--stage-6)', mandatoryDate: true },
  { id: 7, name: 'Venda Fechada', color: 'var(--stage-7)', mandatoryDate: false },
  { id: 8, name: 'Lead Perdido / Base de Disparos', color: 'var(--stage-8)', mandatoryDate: false }
];

// Default Goal Configurations
const DEFAULT_GOAL_CONFIGS = [
  { id: 'instagram', name: 'Mensagens Instagram', icon: 'instagram', target: 30, isLeadSource: true, origName: 'Instagram' },
  { id: 'facebook', name: 'Mensagens Facebook', icon: 'facebook', target: 25, isLeadSource: true, origName: 'Facebook' },
  { id: 'linkedin', name: 'Mensagens LinkedIn', icon: 'linkedin', target: 30, isLeadSource: true, origName: 'LinkedIn' },
  { id: 'whatsapp', name: 'Mensagens WhatsApp', icon: 'whatsapp', target: 30, isLeadSource: true, origName: 'WhatsApp' },
  { id: 'telefones', name: 'Telefones Captados', icon: 'telefones', target: 10, isLeadSource: true, origName: 'Telefones' },
  { id: 'reunioes', name: 'Reuniões Realizadas', icon: 'reunioes', target: 2, isLeadSource: false, origName: 'Reuniões' },
  { id: 'indicacao', name: 'Indicações Recebidas', icon: 'indicacao', target: 5, isLeadSource: true, origName: 'Indicação' }
];

// Initial State Objects
let state = {
  leads: [],
  goalConfigs: [],
  goals: {},
  monthlyTarget: parseFloat(localStorage.getItem('crm_consorcio_monthly_target_v1')) || 500000,
  selectedDateFilter: 'today',
  activeTab: 'dashboard',
  pendingMove: null, // Pending drag-and-drop state for mandatory popup
  currentUser: null,
  authMode: 'login',
  currentRole: 'owner',
  inspectingConsultant: null,
  notifications: [],
  unreadNotifications: 0,
  notificationsPanelOpen: false
};

// ================= INITIALIZATION & STORAGE ================= //

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  initTheme();
  checkUrlInviteToken();
  checkAuthGate();
  updateCurrentDateDisplay();
  loadGoalConfigs();
  checkAndResetDailyGoals();
  loadLeads();
  renderGoals();
  renderOrigemDropdowns();
  renderFollowups();
  renderKanban();
  updateRoleUI();
  setupFirebaseAuthListener();
  updateNotificationsState();

  // Fechar o painel de notificações ao clicar fora dele
  document.addEventListener('click', (e) => {
    const wrapper = document.querySelector('.notifications-wrapper');
    const panel = document.getElementById('notifications-panel');
    if (panel && wrapper && !wrapper.contains(e.target)) {
      panel.style.display = 'none';
      state.notificationsPanelOpen = false;
    }
  });

  // Fechar modais ao clicar na área escura de fundo (overlay)
  document.querySelectorAll('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay && !overlay.classList.contains('mandatory')) {
        overlay.classList.remove('active');
      }
    });
  });

  // Fechar modais ao apertar a tecla ESC
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.active:not(.mandatory)').forEach(m => m.classList.remove('active'));
    }
  });
}

function checkAuthGate() {
  const isLogged = localStorage.getItem('crm_consorcio_auth_logged') === 'true';
  const savedUser = localStorage.getItem('crm_consorcio_auth_user');

  const gate = document.getElementById('login-gate-screen');
  const app = document.getElementById('app');

  if (isLogged || state.currentUser) {
    if (savedUser && !state.currentUser) {
      try {
        state.currentUser = JSON.parse(savedUser);
      } catch (e) {
        state.currentUser = { email: 'admin@consorciocrm.com', name: 'Administrador', uid: 'admin_master', cargo: 'licenciado' };
      }
    }

    // Enriquecer dados do perfil com registros do Firestore/LocalStorage (CPF, Telefone, Data Nasc)
    if (state.currentUser) {
      fetchAndEnrichUserProfile(state.currentUser).then(() => {
        renderUserHeader();
        if (state.activeTab === 'profile') renderProfileView();
      });
    }

    // Sincronizar o cargo do usuário autenticado no estado local
    state.currentRole = getUserRole();

    // Carregar dados exclusivos da conta logada
    loadGoalConfigs();
    checkAndResetDailyGoals();
    loadLeads();
    renderGoals();
    updateRoleUI();

    if (state.activeTab === 'profile') {
      renderProfileView();
    }

    if (gate) gate.style.display = 'none';
    if (app) app.style.display = 'flex';
    renderUserHeader();
  } else {
    if (gate) gate.style.display = 'flex';
    if (app) app.style.display = 'none';
  }
}

function setPortalAuthMode(mode) {
  state.portalAuthMode = mode;
  const isLogin = mode === 'login';
  const tabLogin = document.getElementById('tab-portal-login');
  const tabReg = document.getElementById('tab-portal-register');
  const grpConfirm = document.getElementById('group-portal-confirm-pass');
  const btnSubmit = document.getElementById('btn-portal-submit');

  if (tabLogin) tabLogin.classList.toggle('active', isLogin);
  if (tabReg) tabReg.classList.toggle('active', !isLogin);
  if (grpConfirm) grpConfirm.style.display = isLogin ? 'none' : 'block';
  if (btnSubmit) btnSubmit.textContent = isLogin ? '🚀 Entrar no CRM' : '📝 Criar Conta com Convite';
}

async function handlePortalLogin(e) {
  e.preventDefault();
  const username = document.getElementById('portal-username').value.trim();
  const password = document.getElementById('portal-password').value;
  const confirmPass = document.getElementById('portal-confirm-password')?.value;

  if (!username || !password) {
    alert('Informe o e-mail e a senha!');
    return;
  }

  // MODO CRIAR CONTA COM E-MAIL E SENHA (Via Convite)
  if (state.portalAuthMode === 'register') {
    if (password !== confirmPass) {
      alert('As senhas não conferem!');
      return;
    }

    checkUrlInviteToken();
    if (!activeUrlToken) {
      document.getElementById('access-denied-message').innerHTML = `
        Para se cadastrar no CRM Elite Pro com e-mail e senha, você precisa de um <strong>link de convite único</strong> enviado por um membro da equipe.<br><br>
        Peça ao seu supervisor ou licenciado que gere um link para você.
      `;
      document.getElementById('modal-access-denied').classList.add('active');
      return;
    }

    const tokenResult = await validateInviteToken(activeUrlToken);
    if (!tokenResult.valid) {
      document.getElementById('access-denied-message').innerHTML = `
        ${escapeHtml(tokenResult.reason)}<br><br>
        Peça ao seu supervisor ou licenciado que gere um novo link de convite.
      `;
      document.getElementById('modal-access-denied').classList.add('active');
      return;
    }

    // Token VÁLIDO! Salvar dados de e-mail/senha temporários e abrir Modal de Onboarding
    activeInviteData = { ...tokenResult.data, registerEmail: username, registerPass: password };
    document.getElementById('onboarding-lock-email').textContent = username;
    document.getElementById('onboarding-lock-cargo').textContent = (activeInviteData.cargoDestino || 'consultant').toUpperCase();
    document.getElementById('onboarding-lock-loja').textContent = activeInviteData.lojaId || 'Matriz SP';
    document.getElementById('onboarding-lock-equipe').textContent = activeInviteData.equipeId || 'Equipe Alpha';

    document.getElementById('modal-onboarding').classList.add('active');
    return;
  }

  // MODO LOGIN TRADICIONAL
  // 1. Credencial Padrão Master Admin (Senha alterada para CrmElite$)
  if ((username.toLowerCase() === 'admin' || username.toLowerCase() === 'admin@consorciocrm.com') && password === 'CrmElite$') {
    state.currentUser = { email: 'admin@consorciocrm.com', name: 'Administrador', uid: 'admin_master' };
    localStorage.setItem('crm_consorcio_auth_logged', 'true');
    localStorage.setItem('crm_consorcio_auth_user', JSON.stringify(state.currentUser));

    showToast('🔑 Login realizado com sucesso! Bem-vindo(a), Administrador Master.', 'success');
    checkAuthGate();
    return;
  }

  // 2. Login via Firebase Email / Senha se configurado
  if (window.FirebaseService && window.FirebaseService.auth && window.FirebaseService.signInWithEmailAndPassword) {
    try {
      const { auth, signInWithEmailAndPassword } = window.FirebaseService;
      const res = await signInWithEmailAndPassword(auth, username, password);
      state.currentUser = res.user;
      localStorage.setItem('crm_consorcio_auth_logged', 'true');
      localStorage.setItem('crm_consorcio_auth_user', JSON.stringify({ email: res.user.email, uid: res.user.uid }));
      checkAuthGate();
      return;
    } catch (err) {
      console.warn('Erro Firebase login:', err);
    }
  }

  alert('E-mail ou senha incorretos!');
}

function getUserStorageKey(baseKey) {
  const user = state.currentUser;
  const uid = user ? (user.uid || user.email) : 'admin_demo';
  return `${baseKey}_${uid}`;
}

function loadGoalConfigs() {
  const data = localStorage.getItem(getUserStorageKey(STORAGE_KEYS.GOAL_CONFIGS));
  if (data) {
    state.goalConfigs = JSON.parse(data);
  } else {
    state.goalConfigs = [...DEFAULT_GOAL_CONFIGS];
    saveGoalConfigs();
  }
}

// Format YYYY-MM-DD for today in local time zone
function getTodayDateString() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function updateCurrentDateDisplay() {
  const el = document.getElementById('current-date-text');
  if (el) {
    const today = new Date();
    const options = { weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric' };
    el.textContent = today.toLocaleDateString('pt-BR', options);
  }
}

// Check if midnight passed and reset goals automatically
function checkAndResetDailyGoals() {
  const todayStr = getTodayDateString();
  const lastResetKey = getUserStorageKey(STORAGE_KEYS.LAST_DATE);
  const goalsKey = getUserStorageKey(STORAGE_KEYS.GOALS);
  const lastReset = localStorage.getItem(lastResetKey);

  const savedGoals = localStorage.getItem(goalsKey);
  if (savedGoals) {
    state.goals = JSON.parse(savedGoals);
  } else {
    state.goals = {};
  }

  // Garantir que todos os IDs de metas configuradas existam no estado de metas
  state.goalConfigs.forEach(cfg => {
    if (state.goals[cfg.id] === undefined) {
      state.goals[cfg.id] = 0;
    }
  });

  if (lastReset !== todayStr) {
    // Novo dia! Zerar contadores diários
    state.goalConfigs.forEach(cfg => {
      state.goals[cfg.id] = 0;
    });
    localStorage.setItem(goalsKey, JSON.stringify(state.goals));
    localStorage.setItem(lastResetKey, todayStr);
    
    if (lastReset) {
      showToast('🌅 Novo dia iniciado! Seus contadores de metas foram zerados.', 'info');
    }
  }
}

function manualResetGoals() {
  if (confirm('Deseja zerar manualmente todos os contadores de ações de hoje?')) {
    state.goalConfigs.forEach(cfg => {
      state.goals[cfg.id] = 0;
    });
    saveGoals();
    showToast('🔄 Contadores de metas zerados com sucesso!', 'info');
  }
}

function getConsultantInfo() {
  const u = state.currentUser;
  const uid = u ? (u.uid || u.id || u.email || 'admin_master') : 'admin_master';
  const email = u ? (u.email || 'admin@consorciocrm.com') : 'admin@consorciocrm.com';
  const name = u ? (u.displayName || u.name || u.email || 'Administrador') : 'Administrador';
  const team = u ? (u.team || u.teamName || 'Equipe Alpha') : 'Equipe Alpha';
  const loja = u ? (u.lojaId || 'loja-matriz') : 'loja-matriz';
  const equipe = u ? (u.equipeId || 'eq-alpha') : 'eq-alpha';

  return {
    consultantUid: uid,
    consultantEmail: email,
    consultantName: name,
    teamName: team,
    lojaId: loja,
    equipeId: equipe
  };
}

function saveGoalConfigs() {
  localStorage.setItem(getUserStorageKey(STORAGE_KEYS.GOAL_CONFIGS), JSON.stringify(state.goalConfigs));
  renderGoals();
  renderOrigemDropdowns();

  if (state.currentUser && window.FirebaseService && window.FirebaseService.db) {
    const { db, doc, setDoc } = window.FirebaseService;
    try {
      const info = getConsultantInfo();
      const todayStr = getTodayDateString();
      const goalsRef = doc(db, 'users', info.consultantUid, 'config', 'goals');
      const storeGoalRef = doc(db, 'store_daily_goals', `${info.consultantUid}_${todayStr}`);
      const payload = { goalConfigs: state.goalConfigs, goals: state.goals, ...info, date: todayStr, updatedAt: new Date().toISOString() };
      
      setDoc(goalsRef, payload, { merge: true });
      setDoc(storeGoalRef, payload, { merge: true });
    } catch (err) {
      console.error('Erro ao sincronizar metas na nuvem:', err);
    }
  }
}

function saveGoals() {
  localStorage.setItem(getUserStorageKey(STORAGE_KEYS.GOALS), JSON.stringify(state.goals));
  renderGoals();

  if (state.currentUser && window.FirebaseService && window.FirebaseService.db) {
    const { db, doc, setDoc } = window.FirebaseService;
    try {
      const info = getConsultantInfo();
      const todayStr = getTodayDateString();
      const goalsRef = doc(db, 'users', info.consultantUid, 'config', 'goals');
      const storeGoalRef = doc(db, 'store_daily_goals', `${info.consultantUid}_${todayStr}`);
      const payload = { goalConfigs: state.goalConfigs, goals: state.goals, ...info, date: todayStr, updatedAt: new Date().toISOString() };

      setDoc(goalsRef, payload, { merge: true });
      setDoc(storeGoalRef, payload, { merge: true });
    } catch (err) {
      console.error('Erro ao sincronizar metas na nuvem:', err);
    }
  }
}

function loadLeads() {
  const data = localStorage.getItem(getUserStorageKey(STORAGE_KEYS.LEADS));
  if (data) {
    try {
      const parsed = JSON.parse(data);
      const demoNames = ['carlos eduardo oliveira', 'mariana souza', 'fernando mendes', 'patricia lima', 'rodrigo alves', 'juliana barbosa'];
      const demoIds = ['lead-1', 'lead-2', 'lead-3', 'lead-4', 'lead-5', 'lead-6'];

      state.leads = Array.isArray(parsed) ? parsed.filter(l => {
        if (!l) return false;
        if (demoIds.includes(l.id)) return false;
        if (l.nome && demoNames.includes(l.nome.toLowerCase().trim())) return false;
        return true;
      }) : [];

      localStorage.setItem(getUserStorageKey(STORAGE_KEYS.LEADS), JSON.stringify(state.leads));
    } catch (e) {
      state.leads = [];
    }
  } else {
    state.leads = [];
  }
}

function saveLeads() {
  const info = getConsultantInfo();
  state.leads.forEach(l => {
    if (!l.consultantUid) {
      l.consultantUid = info.consultantUid;
      l.consultantEmail = info.consultantEmail;
      l.consultantName = info.consultantName;
      l.teamName = info.teamName;
    }
  });

  localStorage.setItem(getUserStorageKey(STORAGE_KEYS.LEADS), JSON.stringify(state.leads));
  renderFollowups();
  renderKanban();
  renderOrigemDropdowns();
  renderReportsView();
  updateNotificationsState();

  if (state.currentUser && window.FirebaseService && window.FirebaseService.db) {
    const { db, doc, setDoc } = window.FirebaseService;
    state.leads.forEach(async (lead) => {
      try {
        const leadRef = doc(db, 'users', info.consultantUid, 'leads', lead.id);
        const storeLeadRef = doc(db, 'store_leads', lead.id);
        const payload = { ...lead, ...info, updatedAt: new Date().toISOString() };
        
        await setDoc(leadRef, payload, { merge: true });
        await setDoc(storeLeadRef, payload, { merge: true });
      } catch (err) {
        console.error('Erro ao salvar lead na nuvem:', err);
      }
    });
  }
}

function resetDemoData() {
  if (confirm('Deseja zerar a base de leads do sistema para manter estado 100% limpo?')) {
    state.leads = [];
    localStorage.setItem(getUserStorageKey(STORAGE_KEYS.LEADS), JSON.stringify([]));
    renderFollowups();
    renderKanban();
    renderReportsView();
    showToast('✨ Base de leads zerada com sucesso!', 'success');
  }
}

// ================= TABS NAVIGATION & HIERARCHY ROLES ================= //

function getTabLabel(tabName) {
  switch (tabName) {
    case 'dashboard': return '📊 Painel Diário';
    case 'kanban': return '📋 Funil de Vendas (Pipeline)';
    case 'reports': return '📈 Relatórios & BI';
    case 'ranking': return '🏆 Ranking & Gamificação';
    case 'supervisor': return '👥 Painel Supervisor';
    case 'manager': return '💼 Painel Gestor';
    case 'owner': return '👑 Painel Licenciado';
    case 'profile': return '⚙️ Minha Conta / Perfil';
    default: return 'CRM Elite Pro';
  }
}

function switchTab(tabName) {
  state.activeTab = tabName;
  closeSidebarDrawer();

  // Atualizar indicador da página ativa no cabeçalho
  const activeBadge = document.getElementById('header-active-page-badge');
  if (activeBadge) {
    activeBadge.innerHTML = `<span>${getTabLabel(tabName)}</span>`;
  }

  // O Botão "+ Novo Lead" só deve aparecer na tela do Pipeline (Kanban)
  const btnNewLead = document.getElementById('btn-header-new-lead');
  if (btnNewLead) {
    btnNewLead.style.display = (tabName === 'kanban') ? 'inline-flex' : 'none';
  }

  const tabs = ['dashboard', 'kanban', 'reports', 'ranking', 'supervisor', 'manager', 'owner', 'profile'];
  tabs.forEach(t => {
    const btn = document.getElementById(`tab-${t}`);
    const view = document.getElementById(`view-${t}`);
    if (btn) btn.classList.toggle('active', tabName === t);
    if (view) {
      view.style.display = (tabName === t) ? 'block' : 'none';
      if (tabName === t) view.classList.add('active');
    }
  });

  if (tabName === 'kanban') {
    stopTvRotation();
    renderKanban();
  } else if (tabName === 'dashboard') {
    stopTvRotation();
    renderGoals();
    renderFollowups();
  } else if (tabName === 'reports') {
    stopTvRotation();
    renderReportsView();
  } else if (tabName === 'ranking') {
    renderRankingView();
    startTvRotation();
  } else if (tabName === 'supervisor') {
    stopTvRotation();
    renderSupervisorView();
  } else if (tabName === 'manager') {
    stopTvRotation();
    renderManagerView();
  } else if (tabName === 'owner') {
    stopTvRotation();
    renderOwnerView();
  } else if (tabName === 'profile') {
    stopTvRotation();
    renderProfileView();
  }
}

function toggleSidebarDrawer() {
  const drawer = document.getElementById('sidebar-drawer');
  const overlay = document.getElementById('sidebar-overlay');
  if (drawer && overlay) {
    drawer.classList.toggle('active');
    overlay.classList.toggle('active');
  }
}

function closeSidebarDrawer() {
  const drawer = document.getElementById('sidebar-drawer');
  const overlay = document.getElementById('sidebar-overlay');
  if (drawer && overlay) {
    drawer.classList.remove('active');
    overlay.classList.remove('active');
  }
}

// ================= TELA 1: PAINEL DIÁRIO & METAS ================= //

function getGoalIconSvg(icon) {
  switch (icon) {
    case 'facebook':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z"></path>
      </svg>`;
    case 'instagram':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="2" y="2" width="20" height="20" rx="5" ry="5"></rect>
        <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z"></path>
        <line x1="17.5" y1="6.5" x2="17.51" y2="6.5"></line>
      </svg>`;
    case 'linkedin':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z"></path>
        <rect x="2" y="9" width="4" height="12"></rect>
        <circle cx="4" cy="4" r="2"></circle>
      </svg>`;
    case 'whatsapp':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
      </svg>`;
    case 'telefones':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path>
      </svg>`;
    case 'reunioes':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="9" cy="7" r="4"></circle>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
        <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
      </svg>`;
    case 'tiktok':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M9 12a4 4 0 1 0 4 4V4a5 5 0 0 0 5 5"></path>
      </svg>`;
    case 'google':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="8" x2="12" y2="16"></line>
        <line x1="8" y1="12" x2="16" y2="12"></line>
      </svg>`;
    case 'indicacao':
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
        <circle cx="8.5" cy="7" r="4"></circle>
        <polyline points="17 11 19 13 23 9"></polyline>
      </svg>`;
    default:
      return `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <circle cx="12" cy="12" r="10"></circle>
        <polyline points="12 6 12 12 16 14"></polyline>
      </svg>`;
  }
}

function updateGoal(key, delta) {
  if (state.goals[key] === undefined) {
    state.goals[key] = 0;
  }

  const config = state.goalConfigs.find(c => c.id === key);
  const target = config ? config.target : 30;

  const newCount = Math.max(0, state.goals[key] + delta);
  state.goals[key] = newCount;
  saveGoals();

  if (delta > 0 && newCount === target) {
    const label = config ? config.name : key;
    showToast(`🎯 Parabéns! Meta de ${label} atingida!`, 'success');
  }
}

function renderGoals() {
  const container = document.getElementById('goals-list');
  if (!container) return;

  let totalDone = 0;
  let totalTarget = 0;

  if (state.goalConfigs.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>Nenhuma meta configurada. Clique em "Gerenciar Metas".</p></div>`;
    return;
  }

  container.innerHTML = state.goalConfigs.map(cfg => {
    const current = state.goals[cfg.id] || 0;
    const target = cfg.target || 30;
    totalDone += current;
    totalTarget += target;

    const pct = Math.min(100, Math.round((current / target) * 100));
    const isCompleted = current >= target;
    const iconCss = cfg.icon || 'generic';

    return `
      <div class="goal-item" data-goal="${cfg.id}">
        <div class="goal-icon ${iconCss}">
          ${getGoalIconSvg(cfg.icon)}
        </div>
        <div class="goal-info">
          <div class="goal-title-wrap">
            <span class="goal-name">${escapeHtml(cfg.name)}</span>
            <span class="goal-count ${isCompleted ? 'completed' : ''}" id="count-${cfg.id}">${current}/${target}</span>
          </div>
          <div class="progress-bar-bg small">
            <div id="bar-${cfg.id}" class="progress-bar-fill ${iconCss}" style="width: ${pct}%"></div>
          </div>
        </div>
        <div class="goal-controls">
          <button class="btn-step" onclick="updateGoal('${cfg.id}', -1)" title="Decrementar">-</button>
          <button class="btn-step add" onclick="updateGoal('${cfg.id}', 1)" title="Incrementar">+</button>
        </div>
      </div>
    `;
  }).join('');

  // Calculate Overall Daily Score
  const overallPct = totalTarget > 0 ? Math.min(100, Math.round((totalDone / totalTarget) * 100)) : 0;
  const scorePercentEl = document.getElementById('daily-score-percent');
  const scoreBarEl = document.getElementById('daily-score-bar');
  const scoreSubtextEl = document.getElementById('daily-score-subtext');

  if (scorePercentEl) scorePercentEl.textContent = `${overallPct}%`;
  if (scoreBarEl) scoreBarEl.style.width = `${overallPct}%`;
  if (scoreSubtextEl) scoreSubtextEl.textContent = `${totalDone} de ${totalTarget} ações realizadas hoje`;

  // Renderizar Pirâmide de Metas (Mensal e Semanal Reajustada Dinamicamente)
  renderPyramidGoals();
}

function getWeeksRemainingInCurrentMonth() {
  const now = new Date();
  const currentDay = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  
  const daysLeft = daysInMonth - currentDay + 1;
  const weeksLeft = Math.max(1, Math.ceil(daysLeft / 7));
  return weeksLeft;
}

function calculatePyramidGoalMetrics() {
  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  
  // 1. Somar faturamento de vendas fechadas no mês atual
  let monthlySalesAchieved = 0;
  state.leads.forEach(l => {
    if (l.columnId === 'venda-fechada' || l.stageId === 7) {
      const val = parseFloat(l.valor) || 0;
      const leadDate = l.updatedAt || l.createdAt;
      if (!leadDate || leadDate.startsWith(currentMonthStr)) {
        monthlySalesAchieved += val;
      }
    }
  });

  const monthlyTarget = state.monthlyTarget || 500000;
  const monthlyPct = Math.min(100, Math.round((monthlySalesAchieved / monthlyTarget) * 100));
  const remainingMonthlyTarget = Math.max(0, monthlyTarget - monthlySalesAchieved);

  // 2. Recálculo Dinâmico da Meta Semanal
  const weeksLeft = getWeeksRemainingInCurrentMonth();
  const dynamicWeeklyTarget = remainingMonthlyTarget > 0 ? Math.round(remainingMonthlyTarget / weeksLeft) : 0;

  // Somar vendas da semana atual (últimos 7 dias)
  const oneWeekAgo = new Date();
  oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
  let weeklySalesAchieved = 0;

  state.leads.forEach(l => {
    if (l.columnId === 'venda-fechada' || l.stageId === 7) {
      const val = parseFloat(l.valor) || 0;
      const leadDate = l.updatedAt || l.createdAt ? new Date(l.updatedAt || l.createdAt) : new Date();
      if (leadDate >= oneWeekAgo) {
        weeklySalesAchieved += val;
      }
    }
  });

  const weeklyPct = dynamicWeeklyTarget > 0 ? Math.min(100, Math.round((weeklySalesAchieved / dynamicWeeklyTarget) * 100)) : (monthlySalesAchieved >= monthlyTarget ? 100 : 0);

  return {
    monthlyTarget,
    monthlySalesAchieved,
    monthlyPct,
    remainingMonthlyTarget,
    weeksLeft,
    dynamicWeeklyTarget,
    weeklySalesAchieved,
    weeklyPct
  };
}

function renderPyramidGoals() {
  const metrics = calculatePyramidGoalMetrics();

  // Card Mensal
  const mProgressEl = document.getElementById('monthly-sales-progress');
  const mPctEl = document.getElementById('monthly-sales-pct');
  const mBarEl = document.getElementById('monthly-sales-bar');
  const mSubtextEl = document.getElementById('monthly-sales-subtext');

  if (mProgressEl) mProgressEl.textContent = `R$ ${metrics.monthlySalesAchieved.toLocaleString('pt-BR')} / R$ ${metrics.monthlyTarget.toLocaleString('pt-BR')}`;
  if (mPctEl) mPctEl.textContent = `${metrics.monthlyPct}%`;
  if (mBarEl) mBarEl.style.width = `${metrics.monthlyPct}%`;
  if (mSubtextEl) {
    if (metrics.monthlySalesAchieved >= metrics.monthlyTarget) {
      mSubtextEl.innerHTML = `<strong style="color: var(--accent-emerald);">🎉 META MENSAL BATIDA COM SUCESSO!</strong>`;
    } else {
      mSubtextEl.textContent = `Faltam R$ ${metrics.remainingMonthlyTarget.toLocaleString('pt-BR')} para fechar a meta do mês`;
    }
  }

  // Card Semanal Recalculado Dinamicamente
  const wProgressEl = document.getElementById('weekly-sales-progress');
  const wPctEl = document.getElementById('weekly-sales-pct');
  const wBarEl = document.getElementById('weekly-sales-bar');
  const wSubtextEl = document.getElementById('weekly-sales-subtext');

  if (wProgressEl) wProgressEl.textContent = `R$ ${metrics.weeklySalesAchieved.toLocaleString('pt-BR')} / R$ ${metrics.dynamicWeeklyTarget.toLocaleString('pt-BR')}`;
  if (wPctEl) wPctEl.textContent = `${metrics.weeklyPct}%`;
  if (wBarEl) wBarEl.style.width = `${metrics.weeklyPct}%`;
  if (wSubtextEl) {
    if (metrics.monthlySalesAchieved >= metrics.monthlyTarget) {
      wSubtextEl.textContent = `🔥 Parabéns! A meta mensal já foi superada!`;
    } else {
      wSubtextEl.textContent = `⚡ Reajustado dinamicamente: R$ ${metrics.dynamicWeeklyTarget.toLocaleString('pt-BR')}/sem nas últimas ${metrics.weeksLeft} semanas restantes`;
    }
  }

  // Sincronizar input no modal de engrenagem
  const configInput = document.getElementById('config-monthly-target-input');
  if (configInput && document.activeElement !== configInput) {
    configInput.value = metrics.monthlyTarget;
  }
}

function selectTimePeriod(period, customDate = null) {
  state.selectedDateFilter = period;

  const buttons = document.querySelectorAll('.btn-time-shortcut');
  buttons.forEach(btn => btn.classList.remove('active'));

  if (period === 'today') {
    const btn = document.getElementById('btn-time-today');
    if (btn) btn.classList.add('active');
  } else if (period === 'week') {
    const btn = document.getElementById('btn-time-week');
    if (btn) btn.classList.add('active');
  } else if (period === 'month') {
    const btn = document.getElementById('btn-time-month');
    if (btn) btn.classList.add('active');
  }

  if (customDate) {
    showToast(`📅 Exibindo histórico do dia: ${customDate}`, 'info');
  }

  renderGoals();
  renderFollowups();
}

function saveMonthlyTargetFromConfig(val) {
  const num = parseFloat(val);
  if (isNaN(num) || num < 0) return;

  state.monthlyTarget = num;
  localStorage.setItem(STORAGE_KEYS.MONTHLY_TARGET, num.toString());

  showToast(`🎯 Meta Mensal atualizada para R$ ${num.toLocaleString('pt-BR')}`, 'success');
  renderPyramidGoals();
}

function renderOrigemDropdowns() {
  const leadSelect = document.getElementById('lead-origem');
  const filterSelect = document.getElementById('filter-origem');

  const origensMap = new Map();

  state.goalConfigs.forEach(cfg => {
    if (cfg.isLeadSource) {
      const name = cfg.origName || cfg.name.replace(/^Mensagens\s+/i, '');
      origensMap.set(name, name);
    }
  });

  if (!origensMap.has('Instagram')) origensMap.set('Instagram', 'Instagram');
  if (!origensMap.has('Facebook')) origensMap.set('Facebook', 'Facebook');
  if (!origensMap.has('LinkedIn')) origensMap.set('LinkedIn', 'LinkedIn');
  if (!origensMap.has('WhatsApp')) origensMap.set('WhatsApp', 'WhatsApp');
  if (!origensMap.has('Indicação')) origensMap.set('Indicação', 'Indicação');

  state.leads.forEach(l => {
    if (l.origem && !origensMap.has(l.origem)) {
      origensMap.set(l.origem, l.origem);
    }
  });

  const origens = Array.from(origensMap.keys());

  if (leadSelect) {
    const currentVal = leadSelect.value;
    leadSelect.innerHTML = origens.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
    if (currentVal && origens.includes(currentVal)) {
      leadSelect.value = currentVal;
    }
  }

  if (filterSelect) {
    const currentVal = filterSelect.value || 'todos';
    filterSelect.innerHTML = `<option value="todos">Todas as Origens</option>` +
      origens.map(o => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`).join('');
    if (currentVal && (currentVal === 'todos' || origens.includes(currentVal))) {
      filterSelect.value = currentVal;
    }
  }
}

// ================= MODAL CONFIGURAR METAS & ORIGENS ================= //

function openGoalsConfigModal() {
  renderGoalsConfigList();
  document.getElementById('modal-goals-config').classList.add('active');
}

function closeGoalsConfigModal() {
  document.getElementById('modal-goals-config').classList.remove('active');
}

function renderGoalsConfigList() {
  const container = document.getElementById('config-goals-list');
  if (!container) return;

  if (state.goalConfigs.length === 0) {
    container.innerHTML = `<p style="color: var(--text-muted); font-size: 0.9rem;">Nenhuma meta cadastrada.</p>`;
    return;
  }

  container.innerHTML = state.goalConfigs.map(cfg => {
    const target = cfg.target || 30;
    return `
      <div class="config-goal-row">
        <div class="config-goal-info">
          <div class="goal-icon ${cfg.icon || 'generic'}" style="width: 36px; height: 36px;">
            ${getGoalIconSvg(cfg.icon)}
          </div>
          <div class="config-goal-details">
            <span class="config-goal-name">${escapeHtml(cfg.name)}</span>
            <span class="config-goal-type">${cfg.isLeadSource ? '📌 Origem no CRM' : '📊 Meta Apenas'}</span>
          </div>
        </div>

        <div class="config-goal-actions">
          <div class="target-input-wrap">
            <span>Meta Alvo:</span>
            <input type="number" min="1" value="${target}" onchange="updateGoalTarget('${cfg.id}', this.value)">
          </div>
          <button class="btn-delete-goal" onclick="deleteGoalConfig('${cfg.id}')" title="Excluir Meta">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="3 6 5 6 21 6"></polyline>
              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  }).join('');
}

function updateGoalTarget(goalId, newTarget) {
  const targetNum = parseInt(newTarget, 10);
  if (isNaN(targetNum) || targetNum < 1) return;

  const cfg = state.goalConfigs.find(c => c.id === goalId);
  if (cfg) {
    cfg.target = targetNum;
    saveGoalConfigs();
    showToast(`Meta de "${cfg.name}" alterada para ${targetNum}!`, 'info');
  }
}

function deleteGoalConfig(goalId) {
  const cfg = state.goalConfigs.find(c => c.id === goalId);
  if (!cfg) return;

  if (confirm(`Tem certeza que deseja excluir a meta "${cfg.name}"?`)) {
    state.goalConfigs = state.goalConfigs.filter(c => c.id !== goalId);
    saveGoalConfigs();
    renderGoalsConfigList();
    showToast(`Meta "${cfg.name}" removida.`, 'info');
  }
}

function handleAddGoalSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('new-goal-name').value.trim();
  const target = parseInt(document.getElementById('new-goal-target').value, 10);
  const icon = document.getElementById('new-goal-icon').value;
  const isLeadSource = document.getElementById('new-goal-is-lead-source').checked;

  if (!name || isNaN(target) || target < 1) {
    alert('Por favor, informe um nome válido e uma meta diária maior que 0!');
    return;
  }

  const id = 'goal_' + name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
  
  let origName = name;
  if (name.toLowerCase().startsWith('mensagens ')) {
    origName = name.replace(/^mensagens\s+/i, '');
    origName = origName.charAt(0).toUpperCase() + origName.slice(1);
  }

  const newConfig = {
    id,
    name,
    icon,
    target,
    isLeadSource,
    origName
  };

  state.goalConfigs.push(newConfig);
  if (state.goals[id] === undefined) {
    state.goals[id] = 0;
  }

  saveGoalConfigs();
  saveGoals();

  document.getElementById('form-add-goal').reset();
  document.getElementById('new-goal-target').value = 25;
  document.getElementById('new-goal-is-lead-source').checked = true;

  renderGoalsConfigList();
  showToast(`Nova meta "${name}" criada com sucesso!`, 'success');
}

// Follow-ups list rendering (Today or Overdue)
function normalizeDateStr(dStr) {
  if (!dStr) return '';
  dStr = String(dStr).trim();
  if (dStr.includes('/')) {
    const parts = dStr.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
  }
  if (dStr.includes('T')) {
    return dStr.split('T')[0];
  }
  return dStr;
}

// Follow-ups list rendering (Today or Overdue)
function renderFollowups() {
  const container = document.getElementById('followups-container');
  const badgeNavCount = document.getElementById('badge-followups-count');
  const filterLabel = document.getElementById('followup-filter-label');
  const badgeTotalLeads = document.getElementById('badge-total-leads');

  const visibleLeads = getVisibleLeads();
  if (badgeTotalLeads) badgeTotalLeads.textContent = visibleLeads.length;

  const todayStr = getTodayDateString();

  // Leads com próximo contato <= hoje e que não estão fechados (7) ou disparos (8)
  const pendingLeads = visibleLeads.filter(lead => {
    const st = Number(lead.status);
    if (st === 7 || st === 8) return false;
    const dateStr = normalizeDateStr(lead.proximoContato);
    return dateStr && dateStr <= todayStr;
  });

  // Ordenar: atrasados primeiro, depois por data de contato
  pendingLeads.sort((a, b) => (normalizeDateStr(a.proximoContato) || '').localeCompare(normalizeDateStr(b.proximoContato) || ''));

  if (badgeNavCount) badgeNavCount.textContent = pendingLeads.length;

  if (filterLabel) {
    const overdueCount = pendingLeads.filter(l => normalizeDateStr(l.proximoContato) < todayStr).length;
    filterLabel.textContent = overdueCount > 0 
      ? `${pendingLeads.length} pendentes (${overdueCount} atrasados)`
      : `${pendingLeads.length} para hoje`;
    filterLabel.className = overdueCount > 0 ? 'badge badge-rose' : 'badge badge-warning';
  }

  if (!container) return;

  if (pendingLeads.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🎉</div>
        <h4>Tudo em dia para hoje!</h4>
        <p>Você não possui nenhum follow-up pendente ou atrasado.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = pendingLeads.map(lead => {
    const dateNorm = normalizeDateStr(lead.proximoContato);
    const isOverdue = dateNorm && dateNorm < todayStr;
    const stageObj = KANBAN_STAGES.find(s => s.id === Number(lead.status)) || { name: 'Desconhecido' };
    const formattedDate = formatDateBR(dateNorm);

    return `
      <div class="followup-card-item ${isOverdue ? 'overdue' : 'today'}" onclick="openLeadModal('${lead.id}')" style="cursor: pointer;">
        <div class="followup-header">
          <div class="lead-name-meta">
            <h4>${escapeHtml(lead.nome)}</h4>
            <span class="lead-phone">${escapeHtml(lead.telefone)}</span>
          </div>
          <div class="followup-badges">
            <span class="badge ${isOverdue ? 'badge-rose' : 'badge-warning'}">
              ${isOverdue ? '⚠️ Atrasado desde' : '📅 Contato Hoje'} (${formattedDate})
            </span>
            <span class="badge badge-origem">${escapeHtml(lead.origem || 'Geral')}</span>
            <span class="badge badge-stage">${escapeHtml(stageObj.name)}</span>
          </div>
        </div>

        ${lead.notas ? `<div class="followup-notes">📝 ${escapeHtml(lead.notas)}</div>` : ''}

        <div class="followup-footer" style="display: flex; align-items: center; justify-content: space-between; margin-top: 0.85rem; padding-top: 0.65rem; border-top: 1px solid var(--border-color); flex-wrap: wrap; gap: 0.5rem;">
          <button class="btn btn-outline small" onclick="event.stopPropagation(); openLeadModal('${lead.id}')" style="font-size: 0.78rem;">
            ✏️ Ver / Editar
          </button>
          
          <div style="display: flex; align-items: center; gap: 0.4rem;" onclick="event.stopPropagation()">
            <!-- Botão Laranja Reagendar -->
            <button class="btn btn-reagenda-orange" onclick="event.stopPropagation(); openMandatoryModalForLead('${lead.id}')" title="Selecionar nova data de contato">
              ⏰ Reagendar
            </button>
            
            <!-- Botão Verde WhatsApp -->
            <button class="btn btn-whatsapp-green" onclick="event.stopPropagation(); openWhatsApp('${lead.telefone}', '${lead.nome}')" title="Chamar no WhatsApp">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-1.002 3.659 3.745-.982zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
              </svg>
              WhatsApp
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ================= TELA 2: FUNIL DE VENDAS (KANBAN) ================= //

function renderKanban() {
  const board = document.getElementById('kanban-board');
  if (!board) return;

  const searchVal = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const origemFilter = document.getElementById('filter-origem')?.value || 'todos';

  const visibleLeads = getVisibleLeads();

  // Filter leads based on search & origem
  const filteredLeads = visibleLeads.filter(lead => {
    const matchesSearch = !searchVal || 
      lead.nome.toLowerCase().includes(searchVal) ||
      lead.telefone.toLowerCase().includes(searchVal) ||
      (lead.notas && lead.notas.toLowerCase().includes(searchVal));

    const matchesOrigem = origemFilter === 'todos' || lead.origem === origemFilter;

    return matchesSearch && matchesOrigem;
  });

  // Calculate Total Pipeline Volume
  const totalVal = filteredLeads.reduce((sum, l) => sum + (Number(l.valorConsorcio) || 0), 0);
  const totalVolEl = document.getElementById('stat-total-volume');
  if (totalVolEl) totalVolEl.textContent = formatMoney(totalVal);

  const todayStr = getTodayDateString();

  // Render 8 Columns
  board.innerHTML = KANBAN_STAGES.map(stage => {
    const stageLeads = filteredLeads.filter(l => Number(l.status) === Number(stage.id));
    
    return `
      <div class="kanban-column" 
           data-stage-id="${stage.id}"
           ondragover="handleDragOver(event)"
           ondragleave="handleDragLeave(event)"
           ondrop="handleDrop(event, ${stage.id})">
        
        <div class="column-header" style="border-top: 3px solid ${stage.color};">
          <div class="column-title-group">
            <span class="stage-dot" style="background-color: ${stage.color};"></span>
            <h4 title="${stage.name}">${stage.name}</h4>
          </div>
          <span class="column-count">${stageLeads.length}</span>
        </div>

        <div class="column-cards"
             ondragover="handleDragOver(event)"
             ondrop="handleDrop(event, ${stage.id})">
          ${stageLeads.map(lead => {
            const dateNorm = normalizeDateStr(lead.proximoContato);
            const isOverdue = dateNorm && dateNorm < todayStr;
            const isToday = dateNorm && dateNorm === todayStr;

            return `
              <div class="kanban-card" 
                   draggable="true" 
                   data-lead-id="${lead.id}"
                   ondragstart="handleDragStart(event, '${lead.id}')"
                   ondragend="handleDragEnd(event)"
                   onclick="openLeadModal('${lead.id}')">
                
                <div class="card-top">
                  <span class="lead-name">${escapeHtml(lead.nome)}</span>
                  <span class="origem-pill ${getOrigemPillClass(lead.origem)}">${escapeHtml(lead.origem || 'Geral')}</span>
                </div>

                ${lead.valorConsorcio ? `<div class="lead-value">${formatMoney(lead.valorConsorcio)}</div>` : ''}

                ${lead.notas ? `<div class="followup-notes" style="font-size: 0.78rem;">📝 ${escapeHtml(lead.notas)}</div>` : ''}

                <div class="card-footer" style="display: flex; align-items: center; justify-content: space-between; margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid rgba(255,255,255,0.06); gap: 0.4rem; flex-wrap: wrap;">
                  <div class="next-contact-tag ${isOverdue ? 'overdue' : (isToday ? 'today' : '')}">
                    📅 ${formatDateBR(dateNorm)}
                  </div>
                  <div class="card-actions-quick" onclick="event.stopPropagation()" style="display: flex; align-items: center; gap: 0.4rem;">
                    <!-- Botão Laranja Reagendar -->
                    <button class="btn btn-reagenda-orange" onclick="event.stopPropagation(); openMandatoryModalForLead('${lead.id}')" title="Selecionar nova data de contato">
                      ⏰ Reagendar
                    </button>
                    
                    <!-- Botão Verde WhatsApp -->
                    <button class="btn btn-whatsapp-green" onclick="event.stopPropagation(); openWhatsApp('${lead.telefone}', '${lead.nome}')" title="Chamar no WhatsApp">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-1.002 3.659 3.745-.982zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
                      </svg>
                      WhatsApp
                    </button>
                  </div>
                </div>

              </div>
            `;
          }).join('')}
        </div>

      </div>
    `;
  }).join('');
}

// ================= DRAG AND DROP & AUTOMATION ================= //

let draggedLeadId = null;

function handleDragStart(e, leadId) {
  draggedLeadId = leadId;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', leadId);
  }
  if (e.target && e.target.classList) {
    e.target.classList.add('dragging');
  }
}

function handleDragEnd(e) {
  if (e.target && e.target.classList) {
    e.target.classList.remove('dragging');
  }
  document.querySelectorAll('.kanban-column').forEach(col => col.classList.remove('drag-over'));
  draggedLeadId = null;
}

function handleDragOver(e) {
  e.preventDefault();
  if (e.dataTransfer) {
    e.dataTransfer.dropEffect = 'move';
  }
  const col = e.currentTarget || (e.target && e.target.closest ? e.target.closest('.kanban-column') : null);
  if (col && col.classList) {
    col.classList.add('drag-over');
  }
}

function handleDragLeave(e) {
  const col = e.currentTarget || (e.target && e.target.closest ? e.target.closest('.kanban-column') : null);
  if (col && col.classList) {
    col.classList.remove('drag-over');
  }
}

function handleDrop(e, targetStageId) {
  e.preventDefault();
  const col = e.currentTarget || (e.target && e.target.closest ? e.target.closest('.kanban-column') : null);
  if (col && col.classList) {
    col.classList.remove('drag-over');
  }

  let leadId = null;
  if (e.dataTransfer) {
    try {
      leadId = e.dataTransfer.getData('text/plain');
    } catch (err) {}
  }
  if (!leadId) leadId = draggedLeadId;
  if (!leadId) return;

  const lead = state.leads.find(l => l.id === leadId);
  if (!lead || lead.status === targetStageId) return;

  const currentStageId = lead.status;

  // REGRA: Se for arrastado para 'Contato Captado' (1) ou 'Stand-by' (6), dispara modal obrigatorio de data
  if (targetStageId === 1 || targetStageId === 6) {
    state.pendingMove = {
      leadId: lead.id,
      targetStageId: targetStageId,
      previousStageId: currentStageId
    };
    showMandatoryDateModal(lead, targetStageId);
  } else {
    const prevStage = lead.status;
    lead.status = targetStageId;
    lead.columnId = 'stage-' + targetStageId;
    addLeadHistoryEntry(lead, 'Mudança de Etapa (Kanban)', `Movido para "${getStageName(targetStageId)}"`, 'stage');
    saveLeads();
    renderKanban();
    showToast(`Lead "${lead.nome}" movido para "${getStageName(targetStageId)}"`, 'success');
  }
}

// Direct Trigger for Re-schedule
function openMandatoryModalForLead(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  state.pendingMove = {
    leadId: lead.id,
    targetStageId: lead.status,
    previousStageId: lead.status
  };
  showMandatoryDateModal(lead, lead.status);
}

// ================= MODAL LOGIC & AUTOMATIONS ================= //

function showMandatoryDateModal(lead, stageId) {
  const modal = document.getElementById('modal-mandatory-date');
  const nameEl = document.getElementById('mandatory-lead-name');
  const stageEl = document.getElementById('mandatory-stage-name');
  const dateInput = document.getElementById('mandatory-date-input');
  const notesInput = document.getElementById('mandatory-notes-input');

  if (nameEl) nameEl.textContent = lead.nome;
  if (stageEl) stageEl.textContent = getStageName(stageId);

  // Pre-fill date with tomorrow if date is today or missing
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split('T')[0];

  if (dateInput) {
    dateInput.value = (lead.proximoContato && lead.proximoContato > getTodayDateString()) 
      ? lead.proximoContato 
      : tomorrowStr;
  }
  if (notesInput) notesInput.value = lead.notas || '';

  if (modal) modal.classList.add('active');
}

function confirmMandatoryDate(e) {
  e.preventDefault();
  if (!state.pendingMove) return;

  const dateInput = document.getElementById('mandatory-date-input');
  const notesInput = document.getElementById('mandatory-notes-input');

  const newDate = dateInput ? dateInput.value : '';
  if (!newDate) {
    alert('Por favor, selecione uma data válida para o próximo contato!');
    return;
  }

  const lead = state.leads.find(l => l.id === state.pendingMove.leadId);
  if (lead) {
    lead.status = state.pendingMove.targetStageId;
    lead.proximoContato = newDate;
    addLeadHistoryEntry(lead, 'Reagendamento & Estágio', `Contato marcado para ${formatDateBr(newDate)} (${getStageName(lead.status)})`, 'reschedule');
    if (notesInput && notesInput.value.trim()) {
      lead.notas = notesInput.value.trim();
      addLeadHistoryEntry(lead, 'Nota Adicionada', notesInput.value.trim(), 'note');
    }
    saveLeads();
    showToast(`Data atualizada para ${formatDateBr(newDate)}! Lead reaparecerá no Painel Diário.`, 'success');
  }

  state.pendingMove = null;
  const modal = document.getElementById('modal-mandatory-date');
  if (modal) modal.classList.remove('active');
}

function cancelMandatoryDate() {
  if (state.pendingMove) {
    showToast('Movimentação cancelada.', 'info');
  }
  state.pendingMove = null;
  const modal = document.getElementById('modal-mandatory-date');
  if (modal) modal.classList.remove('active');
  renderKanban();
}

// Lead Edit/Create Modal
function openNewLeadModal() {
  document.getElementById('modal-lead-title').textContent = 'Cadastrar Novo Lead';
  document.getElementById('lead-id').value = '';
  document.getElementById('form-lead')?.reset();

  document.getElementById('lead-data').value = getTodayDateString();

  const timelineSection = document.getElementById('lead-timeline-section');
  if (timelineSection) timelineSection.style.display = 'none';

  const modal = document.getElementById('modal-lead');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
}

function openLeadModal(leadId) {
  const lead = state.leads.find(l => l.id === leadId);
  if (!lead) return;

  document.getElementById('modal-lead-title').textContent = 'Editar Lead';
  document.getElementById('lead-id').value = lead.id;
  document.getElementById('lead-nome').value = lead.nome;
  document.getElementById('lead-telefone').value = lead.telefone;
  document.getElementById('lead-origem').value = lead.origem;
  document.getElementById('lead-status').value = lead.status;
  document.getElementById('lead-data').value = lead.proximoContato || getTodayDateString();
  document.getElementById('lead-valor').value = lead.valorConsorcio || '';
  document.getElementById('lead-notas').value = lead.notas || '';

  renderLeadTimeline(lead);

  const modal = document.getElementById('modal-lead');
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
}

function closeLeadModal() {
  const modal = document.getElementById('modal-lead');
  if (modal) {
    modal.classList.remove('active');
    modal.style.display = 'none';
  }
}

function handleLeadSubmit(e) {
  if (e && e.preventDefault) e.preventDefault();

  try {
    const id = document.getElementById('lead-id').value;
    const nome = document.getElementById('lead-nome').value.trim();
    const telefone = document.getElementById('lead-telefone').value.trim();
    const origem = document.getElementById('lead-origem').value;
    const status = parseInt(document.getElementById('lead-status').value, 10);
    const proximoContato = document.getElementById('lead-data').value;
    const valorConsorcio = Number(document.getElementById('lead-valor').value) || 0;
    const notas = document.getElementById('lead-notas').value.trim();

    if (!nome || !telefone) {
      alert('Preencha o nome do cliente e o telefone!');
      return;
    }

    if ((status === 1 || status === 6) && !proximoContato) {
      alert('A data de próximo contato é OBRIGATÓRIA para Contato Captado e Stand-by!');
      return;
    }

    const info = getConsultantInfo();

    if (id) {
      const lead = state.leads.find(l => l.id === id);
      if (lead) {
        const prevStatus = lead.status;
        const prevDate = lead.proximoContato;
        const prevNotes = lead.notas;

        lead.nome = nome;
        lead.telefone = telefone;
        lead.origem = origem;
        lead.status = status;
        lead.proximoContato = proximoContato;
        lead.valorConsorcio = valorConsorcio;
        lead.notas = notas;
        lead.updatedAt = new Date().toISOString();

        if (Number(prevStatus) !== Number(status)) {
          addLeadHistoryEntry(lead, 'Mudança de Etapa', `Etapa alterada para "${getStageName(status)}"`, 'stage');
        }
        if (prevDate !== proximoContato) {
          addLeadHistoryEntry(lead, 'Reagendamento', `Contato reagendado para ${formatDateBr(proximoContato)}`, 'reschedule');
        }
        if (prevNotes !== notas && notas) {
          addLeadHistoryEntry(lead, 'Nota/Histórico', notas, 'note');
        }
      }
      showToast(`Lead "${nome}" atualizado!`, 'success');
    } else {
      const newLead = {
        id: 'crm_lead_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        nome,
        telefone,
        origem,
        status,
        proximoContato,
        valorConsorcio,
        notas,
        createdAt: new Date().toISOString(),
        consultantUid: info.consultantUid,
        consultantEmail: info.consultantEmail,
        consultantName: info.consultantName,
        teamName: info.teamName
      };

      addLeadHistoryEntry(newLead, 'Lead Cadastrado', `Cadastrado na origem ${origem} (${getStageName(status)})`, 'create');
      if (notas) {
        addLeadHistoryEntry(newLead, 'Nota Inicial', notas, 'note');
      }

      state.leads.unshift(newLead);
      showToast(`Novo lead "${nome}" cadastrado com sucesso!`, 'success');
    }

    saveLeads();
  } catch (err) {
    console.error('Erro ao salvar lead:', err);
    showToast('Erro ao processar formulário. Tente novamente.', 'danger');
  } finally {
    closeLeadModal();
    document.getElementById('form-lead')?.reset();
    document.getElementById('lead-id').value = '';
    switchTab('kanban');
    renderKanban();
  }
}

// ================= UTILITIES & HELPERS ================= //

function getStageName(stageId) {
  const s = KANBAN_STAGES.find(x => x.id === stageId);
  return s ? s.name : `Etapa ${stageId}`;
}

function openWhatsApp(phone, leadName) {
  if (!phone) {
    alert('Este lead não possui número de telefone/WhatsApp cadastrado!');
    return;
  }
  const cleanNum = phone.replace(/\D/g, '');
  const finalNum = cleanNum.startsWith('55') ? cleanNum : `55${cleanNum}`;
  const text = encodeURIComponent(`Oii ${leadName}, tudo bom?!`);
  const url = `https://wa.me/${finalNum}?text=${text}`;
  window.open(url, '_blank');
}

function maskPhone(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 11) v = v.substring(0, 11);

  if (v.length > 10) {
    input.value = `(${v.substring(0, 2)}) ${v.substring(2, 7)}-${v.substring(7)}`;
  } else if (v.length > 6) {
    input.value = `(${v.substring(0, 2)}) ${v.substring(2, 6)}-${v.substring(6)}`;
  } else if (v.length > 2) {
    input.value = `(${v.substring(0, 2)}) ${v.substring(2)}`;
  } else if (v.length > 0) {
    input.value = `(${v}`;
  }
}

function formatDateBR(dateStr) {
  if (!dateStr) return '--/--/----';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function formatDate(dateStr) {
  return formatDateBR(dateStr);
}

function formatMoney(amount) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(amount);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/[&<>"']/g, function(m) {
    return {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    }[m];
  });
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${message}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function getOrigemPillClass(origem) {
  if (!origem) return 'generic';
  const clean = origem.toLowerCase().trim();
  if (['instagram', 'facebook', 'linkedin', 'whatsapp', 'indicacao', 'tiktok', 'google'].includes(clean)) {
    return clean;
  }
  return 'generic';
}

// ================= FIREBASE AUTH & CLOUD SYNC ================= //

let unsubscribeLeadsSnapshot = null;
let unsubscribeGoalsSnapshot = null;

function setupFirebaseAuthListener() {
  if (!window.FirebaseService || !window.FirebaseService.auth) {
    console.warn('Firebase Service não inicializado com chaves. Usando modo local.');
    renderUserHeader();
    return;
  }

  const { auth, onAuthStateChanged } = window.FirebaseService;
  if (!auth || typeof onAuthStateChanged !== 'function') {
    renderUserHeader();
    return;
  }

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      let userRecord = null;
      if (window.FirebaseService && window.FirebaseService.db) {
        try {
          const { db, doc, getDoc } = window.FirebaseService;
          const uSnap = await getDoc(doc(db, 'users', user.uid));
          if (uSnap.exists()) {
            userRecord = uSnap.data();
          }
        } catch (e) {
          console.warn('Erro ao carregar dados do usuário do Firestore:', e);
        }
      }
      if (!userRecord) {
        const localUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
        userRecord = localUsers.find(u => u.googleId === user.uid || u.email === user.email);
      }

      state.currentUser = { ...user, ...(userRecord || {}) };
      localStorage.setItem('crm_consorcio_auth_logged', 'true');
      localStorage.setItem('crm_consorcio_auth_user', JSON.stringify(state.currentUser));

      loadGoalConfigs();
      checkAndResetDailyGoals();
      loadLeads();
      checkAuthGate();
      renderUserHeader();
      renderGoals();
      renderFollowups();
      renderKanban();

      showToast(`🔑 Conectado como ${user.email}`, 'success');
      syncLeadsFromFirestore(user.uid);
      syncGoalsFromFirestore(user.uid);
      closeAuthModal();
    } else {
      renderUserHeader();
      loadLeads();
      loadGoalConfigs();
    }
  });
}

window.setupFirebaseAuthListener = setupFirebaseAuthListener;

function renderUserHeader() {
  const sidebarContainer = document.getElementById('sidebar-user-area');
  const headerContainer = document.getElementById('header-user-area');

  const email = state.currentUser ? (state.currentUser.email || 'Usuário') : 'admin@consorciocrm.com.br';
  const initial = email.charAt(0).toUpperCase();

  const html = `
    <div class="user-profile-bar" style="width: 100%; justify-content: space-between;" title="Conectado como ${escapeHtml(email)}">
      <div style="display: flex; align-items: center; gap: 0.6rem; overflow: hidden;">
        <div class="user-avatar">${initial}</div>
        <span class="user-email-text" style="max-width: 150px; text-overflow: ellipsis; overflow: hidden;">${escapeHtml(email)}</span>
      </div>
      <button class="btn-logout" onclick="handleLogout()" title="Sair da Conta">Sair</button>
    </div>
  `;

  if (sidebarContainer) sidebarContainer.innerHTML = html;
  if (headerContainer) headerContainer.innerHTML = html;
}

function openAuthModal() {
  switchAuthTab('login');
  document.getElementById('modal-auth').classList.add('active');
}

function closeAuthModal() {
  document.getElementById('modal-auth').classList.remove('active');
}

function openFirebaseConfigModal() {
  document.getElementById('modal-firebase-config').classList.add('active');
}

function closeFirebaseConfigModal() {
  document.getElementById('modal-firebase-config').classList.remove('active');
}

function switchAuthTab(mode) {
  state.authMode = mode;
  const isLogin = mode === 'login';

  const tabLogin = document.getElementById('tab-auth-login');
  const tabReg = document.getElementById('tab-auth-register');
  const title = document.getElementById('auth-modal-title');
  const btnSubmit = document.getElementById('btn-auth-submit');
  const grpConfirm = document.getElementById('group-confirm-password');

  if (tabLogin) tabLogin.classList.toggle('active', isLogin);
  if (tabReg) tabReg.classList.toggle('active', !isLogin);
  if (title) title.textContent = isLogin ? 'Acessar o CRM Elite Pro' : 'Criar Nova Conta';
  if (btnSubmit) btnSubmit.textContent = isLogin ? 'Entrar no CRM' : 'Cadastrar Conta';
  if (grpConfirm) grpConfirm.style.display = isLogin ? 'none' : 'block';
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;
  const confirmPassword = document.getElementById('auth-confirm-password')?.value;

  if (!email || !password) {
    alert('Preencha e-mail e senha!');
    return;
  }

  if (typeof window.ensureFirebaseReady === 'function') {
    await window.ensureFirebaseReady();
  }

  const { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword } = window.FirebaseService || {};

  if (!auth) {
    alert('O serviço de autenticação do Firebase ainda está inicializando. Aguarde 2 segundos e tente novamente.');
    return;
  }

  try {
    if (state.authMode === 'register') {
      if (password !== confirmPassword) {
        alert('As senhas não conferem!');
        return;
      }
      await createUserWithEmailAndPassword(auth, email, password);
      showToast('Conta criada com sucesso!', 'success');
    } else {
      await signInWithEmailAndPassword(auth, email, password);
    }
  } catch (error) {
    console.error('Erro na autenticação:', error);
    let msg = 'Erro ao realizar login.';
    if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      msg = 'E-mail ou senha incorretos!';
    } else if (error.code === 'auth/email-already-in-use') {
      msg = 'Este e-mail já está cadastrado!';
    } else if (error.code === 'auth/weak-password') {
      msg = 'A senha deve ter pelo menos 6 caracteres!';
    } else if (error.code === 'auth/unauthorized-domain') {
      msg = 'Domínio não autorizado no Firebase! Adicione "crm-elite-pro.vercel.app" na aba Authentication -> Settings -> Authorized Domains no console do Firebase.';
    }
    alert(msg);
  }
}

// ================= HIERARCHY, INVITE TOKENS & ONBOARDING ================= //

function generateUUIDv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function maskCPF(input) {
  let v = input.value.replace(/\D/g, '');
  if (v.length > 11) v = v.substring(0, 11);
  if (v.length > 9) {
    input.value = `${v.substring(0,3)}.${v.substring(3,6)}.${v.substring(6,9)}-${v.substring(9)}`;
  } else if (v.length > 6) {
    input.value = `${v.substring(0,3)}.${v.substring(3,6)}.${v.substring(6)}`;
  } else if (v.length > 3) {
    input.value = `${v.substring(0,3)}.${v.substring(3)}`;
  } else {
    input.value = v;
  }
}

function validateCPF(cpf) {
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf.length !== 11 || /^(\d)\1+$/.test(cpf)) return false;
  let add = 0;
  for (let i = 0; i < 9; i++) add += parseInt(cpf.charAt(i)) * (10 - i);
  let rev = 11 - (add % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9))) return false;
  add = 0;
  for (let i = 0; i < 10; i++) add += parseInt(cpf.charAt(i)) * (11 - i);
  rev = 11 - (add % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10))) return false;
  return true;
}

let activeUrlToken = null;
let activeInviteData = null;

function checkUrlInviteToken() {
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (token) {
    activeUrlToken = token.trim();
    const banner = document.getElementById('gate-invite-banner');
    if (banner) banner.style.display = 'block';
    setPortalAuthMode('register');
  }
}

async function validateInviteToken(tokenStr) {
  if (!tokenStr) return null;

  // 1. Buscar nos convites armazenados no LocalStorage
  const localTokens = JSON.parse(localStorage.getItem('crm_consorcio_invite_tokens') || '[]');
  const localFound = localTokens.find(t => t.token === tokenStr);
  if (localFound) {
    if (localFound.usado) return { valid: false, reason: 'Este link de convite já foi utilizado.' };
    if (new Date(localFound.expiraEm) < new Date()) return { valid: false, reason: 'Este link de convite expirou (validade 72h).' };
    return { valid: true, data: localFound };
  }

  // 2. Buscar nos convites salvos no Firestore
  if (window.FirebaseService && window.FirebaseService.db) {
    const { db, collection, getDocs } = window.FirebaseService;
    try {
      const snap = await getDocs(collection(db, 'invite_tokens'));
      let remoteFound = null;
      snap.forEach(docSnap => {
        const d = docSnap.data();
        if (d.token === tokenStr) remoteFound = d;
      });

      if (remoteFound) {
        if (remoteFound.usado) return { valid: false, reason: 'Este link de convite já foi utilizado.' };
        if (new Date(remoteFound.expiraEm) < new Date()) return { valid: false, reason: 'Este link de convite expirou (validade 72h).' };
        return { valid: true, data: remoteFound };
      }
    } catch (e) {
      console.warn('Erro ao consultar tokens no Firestore:', e);
    }
  }

  return { valid: false, reason: 'Link de convite inválido ou inexistente.' };
}

function openGenerateInviteModal() {
  const currentRole = state.currentRole || 'owner';
  
  if (currentRole === 'consultant') {
    alert('❌ Consultores não possuem permissão para gerar links de convite.');
    return;
  }

  const roleSelect = document.getElementById('invite-target-role');
  if (roleSelect) {
    let options = '';
    if (currentRole === 'owner') {
      options = `
        <option value="gestor">💼 Gestor Comercial</option>
        <option value="supervisor">👔 Supervisor de Vendas</option>
        <option value="consultant" selected>👤 Consultor de Vendas</option>
      `;
    } else if (currentRole === 'manager') {
      options = `
        <option value="supervisor">👔 Supervisor de Vendas</option>
        <option value="consultant" selected>👤 Consultor de Vendas</option>
      `;
    } else if (currentRole === 'supervisor') {
      options = `
        <option value="consultant" selected>👤 Consultor de Vendas</option>
      `;
    }
    roleSelect.innerHTML = options;
  }

  document.getElementById('invite-link-result').style.display = 'none';
  document.getElementById('modal-generate-invite').classList.add('active');
}

function closeGenerateInviteModal() {
  document.getElementById('modal-generate-invite').classList.remove('active');
}

function closeAccessDeniedModal() {
  document.getElementById('modal-access-denied').classList.remove('active');
}

async function handleGenerateInviteSubmit(e) {
  e.preventDefault();
  const cargo = document.getElementById('invite-target-role').value;
  const lojaId = document.getElementById('invite-target-loja').value;
  const equipeId = document.getElementById('invite-target-equipe').value;

  const token = generateUUIDv4();
  const expiraEm = new Date(Date.now() + 72 * 3600 * 1000).toISOString(); // 72h
  const u = state.currentUser || { uid: 'admin_master', email: 'admin@consorciocrm.com' };

  const inviteData = {
    token,
    cargoDestino: cargo,
    lojaId,
    equipeId,
    criadoPor: u.uid || u.email,
    expiraEm,
    usado: false,
    createdAt: new Date().toISOString()
  };

  const localTokens = JSON.parse(localStorage.getItem('crm_consorcio_invite_tokens') || '[]');
  localTokens.push(inviteData);
  localStorage.setItem('crm_consorcio_invite_tokens', JSON.stringify(localTokens));

  if (window.FirebaseService && window.FirebaseService.db) {
    const { db, doc, setDoc } = window.FirebaseService;
    try {
      await setDoc(doc(db, 'invite_tokens', token), inviteData);
    } catch (err) {
      console.warn('Erro ao salvar token no Firestore:', err);
    }
  }

  const baseUrl = window.location.origin + window.location.pathname;
  const inviteUrl = `${baseUrl}?token=${token}`;

  const resultBox = document.getElementById('invite-link-result');
  const urlInput = document.getElementById('generated-invite-url');
  if (urlInput) urlInput.value = inviteUrl;
  if (resultBox) resultBox.style.display = 'block';

  showToast('🎟️ Link de convite tokenizado (72h) gerado com sucesso!', 'success');
}

function copyGeneratedInviteLink() {
  const urlInput = document.getElementById('generated-invite-url');
  if (urlInput) {
    urlInput.select();
    navigator.clipboard.writeText(urlInput.value);
    showToast('📋 Link copiado para a área de transferência!', 'success');
  }
}

async function handleGoogleSignIn() {
  if (typeof window.ensureFirebaseReady === 'function') {
    await window.ensureFirebaseReady();
  }
  
  const { auth, googleProvider, signInWithPopup, db, doc, getDoc } = window.FirebaseService || {};
  if (!auth) {
    alert('O serviço do Firebase ainda está conectando. Aguarde 2 segundos e clique novamente.');
    return;
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (!result || !result.user) return;
    const user = result.user;

    // 1. Buscar se usuário já possui cadastro em `users`
    let userRecord = null;

    if (db && getDoc) {
      try {
        const uSnap = await getDoc(doc(db, 'users', user.uid));
        if (uSnap.exists()) {
          userRecord = uSnap.data();
        }
      } catch (e) {
        console.warn('Erro ao buscar cadastro no Firestore:', e);
      }
    }

    if (!userRecord) {
      const localUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
      userRecord = localUsers.find(u => u.googleId === user.uid || u.email === user.email);
    }

    if (userRecord) {
      const status = (userRecord.status || 'ativo').toLowerCase();
      if (status === 'suspenso') {
        alert('⛔ Sua conta está SUSPENSA. Entre em contato com seu gestor comercial.');
        return;
      }
      if (status === 'inativo') {
        alert('⛔ Sua conta foi DESATIVADA.');
        return;
      }
      if (status === 'pendente') {
        alert('⏳ Sua conta está AGUARDANDO APROVAÇÃO do administrador.');
        return;
      }

      state.currentUser = { ...user, ...userRecord };
      localStorage.setItem('crm_consorcio_auth_logged', 'true');
      localStorage.setItem('crm_consorcio_auth_user', JSON.stringify(state.currentUser));
      checkAuthGate();
      return;
    }

    // 2. Usuário novo: Verificar se existe token na URL
    checkUrlInviteToken();
    if (!activeUrlToken) {
      document.getElementById('access-denied-message').innerHTML = `
        O e-mail <strong>${escapeHtml(user.email)}</strong> não possui um cadastro ativo.<br><br>
        Para se cadastrar no CRM Elite Pro, você precisa de um <strong>link de convite único</strong> gerado por um Licenciado, Gestor ou Supervisor da sua loja.
      `;
      document.getElementById('modal-access-denied').classList.add('active');
      return;
    }

    const tokenResult = await validateInviteToken(activeUrlToken);
    if (!tokenResult.valid) {
      document.getElementById('access-denied-message').innerHTML = `
        ${escapeHtml(tokenResult.reason)}<br><br>
        Peça ao seu supervisor ou licenciado que gere um novo link de convite.
      `;
      document.getElementById('modal-access-denied').classList.add('active');
      return;
    }

    // Token VÁLIDO: Abrir Onboarding
    activeInviteData = tokenResult.data;
    document.getElementById('onboarding-lock-email').textContent = user.email;
    document.getElementById('onboarding-lock-cargo').textContent = (activeInviteData.cargoDestino || 'consultant').toUpperCase();
    document.getElementById('onboarding-lock-loja').textContent = activeInviteData.lojaId || 'Matriz SP';
    document.getElementById('onboarding-lock-equipe').textContent = activeInviteData.equipeId || 'Equipe Alpha';

    const nameInput = document.getElementById('onboarding-name');
    if (nameInput) nameInput.value = user.displayName || '';

    document.getElementById('modal-onboarding').classList.add('active');

  } catch (error) {
    console.error('Erro ao entrar com Google:', error);
    if (error.code === 'auth/unauthorized-domain') {
      alert('Domínio não autorizado no Firebase!\n\nAcesse o Console do Firebase ➔ Authentication ➔ Settings ➔ Authorized Domains e adicione "crm-elite-pro.vercel.app".');
    } else {
      alert('Não foi possível concluir o login com o Google. (' + (error.message || error.code) + ')');
    }
  }
}

async function handleOnboardingSubmit(e) {
  e.preventDefault();
  const nome = document.getElementById('onboarding-name').value.trim();
  const cpf = document.getElementById('onboarding-cpf').value.trim();
  const dob = document.getElementById('onboarding-dob').value;
  const phone = document.getElementById('onboarding-phone').value.trim();

  if (!validateCPF(cpf)) {
    alert('⚠️ CPF Inválido! Verifique os dígitos digitados.');
    return;
  }

  if (!activeInviteData) {
    alert('Erro: Dados de convite não encontrados.');
    return;
  }

  const u = window.FirebaseService?.auth?.currentUser;
  const email = u ? u.email : (document.getElementById('onboarding-lock-email').textContent);
  const uid = u ? u.uid : generateUUIDv4();

  const userPayload = {
    id: uid,
    googleId: uid,
    email,
    nomeCompleto: nome,
    dataNascimento: dob,
    cpf,
    telefone: phone,
    fotoUrl: u ? u.photoURL : null,
    cargo: activeInviteData.cargoDestino || 'consultant',
    status: 'ativo',
    lojaId: activeInviteData.lojaId || 'loja-matriz',
    equipeId: activeInviteData.equipeId || 'eq-alpha',
    convidadoPor: activeInviteData.criadoPor || 'admin_master',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (window.FirebaseService && window.FirebaseService.db) {
    const { db, doc, setDoc } = window.FirebaseService;
    try {
      await setDoc(doc(db, 'users', uid), userPayload);
      if (activeUrlToken) {
        await setDoc(doc(db, 'invite_tokens', activeUrlToken), {
          usado: true,
          usadoPor: uid,
          usadoEm: new Date().toISOString()
        }, { merge: true });
      }
    } catch (err) {
      console.warn('Erro ao salvar onboarding no Firestore:', err);
    }
  }

  const localUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
  localUsers.push(userPayload);
  localStorage.setItem('crm_consorcio_registered_users', JSON.stringify(localUsers));

  if (activeUrlToken) {
    const localTokens = JSON.parse(localStorage.getItem('crm_consorcio_invite_tokens') || '[]');
    const tok = localTokens.find(t => t.token === activeUrlToken);
    if (tok) {
      tok.usado = true;
      tok.usadoPor = uid;
      tok.usadoEm = new Date().toISOString();
      localStorage.setItem('crm_consorcio_invite_tokens', JSON.stringify(localTokens));
    }
  }

  state.currentUser = { ...u, ...userPayload };
  localStorage.setItem('crm_consorcio_auth_logged', 'true');
  localStorage.setItem('crm_consorcio_auth_user', JSON.stringify(state.currentUser));

  // Limpar o token de convite da URL e resetar o portal para login tradicional
  activeUrlToken = null;
  activeInviteData = null;
  window.history.replaceState({}, document.title, window.location.pathname);
  const banner = document.getElementById('gate-invite-banner');
  if (banner) banner.style.display = 'none';
  setPortalAuthMode('login');

  document.getElementById('modal-onboarding').classList.remove('active');
  showToast('🎉 Onboarding concluído! Seu acesso está ativo.', 'success');
  checkAuthGate();
}

async function handleLogout() {
  if (confirm('Deseja realmente sair da sua conta e retornar à tela de login?')) {
    if (unsubscribeLeadsSnapshot) unsubscribeLeadsSnapshot();
    if (unsubscribeGoalsSnapshot) unsubscribeGoalsSnapshot();
    
    // Limpar o token de convite da URL e resetar o banner
    activeUrlToken = null;
    activeInviteData = null;
    window.history.replaceState({}, document.title, window.location.pathname);
    const banner = document.getElementById('gate-invite-banner');
    if (banner) banner.style.display = 'none';
    setPortalAuthMode('login');

    localStorage.removeItem('crm_consorcio_auth_logged');
    localStorage.removeItem('crm_consorcio_auth_user');
    state.currentUser = null;

    const { auth, signOut } = window.FirebaseService || {};
    if (signOut && auth) {
      try {
        await signOut(auth);
      } catch (err) {}
    }

    state.leads = [];
    state.goals = {};
    state.goalConfigs = [...DEFAULT_GOAL_CONFIGS];
    loadLeads();
    loadGoalConfigs();
    checkAndResetDailyGoals();

    checkAuthGate();
    showToast('Você saiu do sistema.', 'info');
  }
}

function handleSaveFirebaseConfig(e) {
  e.preventDefault();
  const apiKey = document.getElementById('fb-api-key').value.trim();
  const projectId = document.getElementById('fb-project-id').value.trim();
  const authDomain = document.getElementById('fb-auth-domain').value.trim();

  if (!apiKey || !projectId) {
    alert('Informe a apiKey e projectId!');
    return;
  }

  const newConfig = {
    apiKey,
    projectId,
    authDomain: authDomain || `${projectId}.firebaseapp.com`,
    storageBucket: `${projectId}.appspot.com`
  };

  window.FirebaseService.saveCustomConfig(newConfig);
}

let unsubscribeStoreLeadsSnapshot = null;

// Sincronização em Nuvem Firestore Multi-dispositivo (Leads & Metas)
function syncLeadsFromFirestore(userId) {
  const { db, collection, onSnapshot } = window.FirebaseService || {};
  if (!db) return;

  const u = state.currentUser;
  const userUid = u ? (u.uid || u.id || userId) : userId;
  const userEmail = u ? (u.email || '').toLowerCase() : '';

  const demoNames = ['carlos eduardo oliveira', 'mariana souza', 'fernando mendes', 'patricia lima', 'rodrigo alves', 'juliana barbosa'];
  const demoIds = ['lead-1', 'lead-2', 'lead-3', 'lead-4', 'lead-5', 'lead-6'];

  const processSnapshotDocs = (snapshot) => {
    const cloudLeadsMap = new Map();
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const leadId = docSnap.id;
      const leadName = (data.nome || '').toLowerCase().trim();

      if (!demoIds.includes(leadId) && !demoNames.includes(leadName)) {
        const isOwner = ['admin', 'licenciado', 'owner', 'manager', 'gestor'].includes((state.currentRole || '').toLowerCase());
        const isUserLead = !data.consultantUid || data.consultantUid === userUid || (userEmail && (data.consultantEmail || '').toLowerCase() === userEmail);

        if (isOwner || isUserLead) {
          cloudLeadsMap.set(leadId, { id: leadId, ...data });
        }
      }
    });

    const mergedLeads = [...cloudLeadsMap.values()];
    state.leads.forEach(localLead => {
      if (localLead && localLead.id && !cloudLeadsMap.has(localLead.id)) {
        mergedLeads.push(localLead);
      }
    });

    state.leads = mergedLeads;
    localStorage.setItem(getUserStorageKey(STORAGE_KEYS.LEADS), JSON.stringify(state.leads));

    renderFollowups();
    renderKanban();
    renderOrigemDropdowns();
    renderReportsView();
  };

  // 1. Escutar a coleção central store_leads para sincronização multi-dispositivo instantânea
  if (unsubscribeStoreLeadsSnapshot) unsubscribeStoreLeadsSnapshot();
  const storeLeadsCol = collection(db, 'store_leads');
  unsubscribeStoreLeadsSnapshot = onSnapshot(storeLeadsCol, (snapshot) => {
    processSnapshotDocs(snapshot);
  }, (err) => {
    console.warn('Erro ao escutar store_leads:', err);
  });

  // 2. Escutar a subcoleção do usuário
  if (userUid) {
    if (unsubscribeLeadsSnapshot) unsubscribeLeadsSnapshot();
    const userLeadsCol = collection(db, 'users', userUid, 'leads');
    unsubscribeLeadsSnapshot = onSnapshot(userLeadsCol, (snapshot) => {
      processSnapshotDocs(snapshot);
    }, (err) => {
      console.warn('Erro ao escutar subcoleção de leads:', err);
    });
  }
}

function syncGoalsFromFirestore(userId) {
  const { db, doc, onSnapshot } = window.FirebaseService || {};
  if (!db || !userId) return;

  const goalsDoc = doc(db, 'users', userId, 'config', 'goals');

  if (unsubscribeGoalsSnapshot) unsubscribeGoalsSnapshot();

  unsubscribeGoalsSnapshot = onSnapshot(goalsDoc, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.goalConfigs) state.goalConfigs = data.goalConfigs;
      if (data.goals) {
        state.goals = { ...state.goals, ...data.goals };
      }
      localStorage.setItem(getUserStorageKey(STORAGE_KEYS.GOALS), JSON.stringify(state.goals));
      localStorage.setItem(getUserStorageKey(STORAGE_KEYS.GOAL_CONFIGS), JSON.stringify(state.goalConfigs));
      renderGoals();
      renderOrigemDropdowns();
      renderReportsView();
    } else {
      saveGoals();
      saveGoalConfigs();
    }
  }, (err) => {
    console.warn('Erro ao escutar Firestore Goals:', err);
  });
}

// ================= HIERARCHY & DRILL-DOWN LOGIC ================= //

function getUserRole() {
  if (!state.currentUser) return 'consultant';
  const email = (state.currentUser.email || '').toLowerCase();
  const uid = state.currentUser.uid || '';
  const cargo = (state.currentUser.cargo || state.currentUser.role || '').toLowerCase();

  if (uid === 'admin_master' || email === 'admin@consorciocrm.com' || cargo === 'admin' || cargo === 'licenciado' || cargo === 'owner') {
    return 'owner';
  }
  if (cargo === 'gestor' || cargo === 'manager') return 'manager';
  if (cargo === 'supervisor') return 'supervisor';
  return 'consultant';
}

function getVisibleLeads() {
  const role = state.currentRole;
  const u = state.currentUser;
  if (!u) return state.leads;

  const uid = u.uid || u.email;

  if (role === 'consultant') {
    return state.leads.filter(l => (l.consultantUid === uid || l.consultantEmail === u.email || !l.consultantUid));
  } else if (role === 'supervisor') {
    const userTeam = u.equipeId || u.teamName || 'eq-alpha';
    return state.leads.filter(l => (l.equipeId === userTeam || l.teamName === userTeam || l.consultantUid === uid));
  } else if (role === 'manager') {
    const userStore = u.lojaId || 'loja-matriz';
    return state.leads.filter(l => (l.lojaId === userStore || l.consultantUid === uid));
  }
  return state.leads;
}

function changeRole(role) {
  const realRole = getUserRole();
  if (realRole !== 'owner') {
    alert('⛔ Apenas Licenciados (Donos) possuem permissão para alternar a visão da hierarquia.');
    updateRoleUI();
    return;
  }

  state.currentRole = role;
  updateRoleUI();

  if (role === 'supervisor') {
    switchTab('supervisor');
  } else if (role === 'manager') {
    switchTab('manager');
  } else if (role === 'owner') {
    switchTab('owner');
  } else {
    switchTab('dashboard');
  }

  showToast(`🎭 Alternado para visão de: ${getRoleLabel(role)}`, 'info');
}

function getRoleLabel(role) {
  switch (role) {
    case 'consultant': return '👤 Consultor de Vendas';
    case 'supervisor': return '👥 Supervisor de Vendas';
    case 'manager': return '💼 Gestor Comercial';
    case 'owner': return '👑 Licenciado (Dono da Loja)';
    default: return 'Consultor';
  }
}

function updateRoleUI() {
  const role = getUserRole();
  state.currentRole = role;

  const tabSupervisor = document.getElementById('tab-supervisor');
  const tabManager = document.getElementById('tab-manager');
  const tabOwner = document.getElementById('tab-owner');

  // Exibir apenas as abas permitidas no menu de acordo com a hierarquia
  if (tabSupervisor) tabSupervisor.style.display = (role === 'supervisor' || role === 'manager' || role === 'owner') ? 'inline-flex' : 'none';
  if (tabManager) tabManager.style.display = (role === 'manager' || role === 'owner') ? 'inline-flex' : 'none';
  if (tabOwner) tabOwner.style.display = (role === 'owner') ? 'inline-flex' : 'none';

  // Ocultar botão de gerar convite para Consultor (apenas Supervisor, Gestor e Licenciado podem convidar)
  const btnInvite = document.getElementById('btn-sidebar-generate-invite');
  if (btnInvite) {
    btnInvite.style.display = (role === 'consultant') ? 'none' : 'flex';
  }

  updateRankingPermissionsUI();
  updateDashboardWelcome();
}

// Inspeção de Consultor Individual (Drill-Down)
function inspectConsultant(consultantName, consultantId) {
  state.inspectingConsultant = { name: consultantName, id: consultantId };

  const banner = document.getElementById('inspection-banner');
  const nameEl = document.getElementById('inspect-consultant-name');

  if (nameEl) nameEl.textContent = consultantName;
  if (banner) banner.style.display = 'flex';

  updateDashboardWelcome();
  showToast(`👁️ Modo de inspeção ativo: Visualizando CRM de ${consultantName}`, 'info');
  switchTab('dashboard');
}

function exitInspectionMode() {
  state.inspectingConsultant = null;
  const banner = document.getElementById('inspection-banner');
  if (banner) banner.style.display = 'none';

  updateDashboardWelcome();
  showToast('Restaurado ao seu painel pessoal.', 'info');
  switchTab('dashboard');
}

// ================= TELA 7: PERFIL & MINHA CONTA ================= //

function enrichUserProfileSync(user) {
  if (!user) return null;

  const uid = user.uid || user.id || '';
  const email = (user.email || '').toLowerCase();

  const localUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
  const localData = localUsers.find(u => 
    (uid && (u.id === uid || u.googleId === uid)) || 
    (email && u.email && u.email.toLowerCase() === email)
  );

  const enriched = {
    ...user,
    ...(localData || {})
  };

  if (!enriched.nomeCompleto) enriched.nomeCompleto = user.displayName || user.name || user.email || 'Consultor';
  if (!enriched.cpf && enriched.cpfRaw) enriched.cpf = enriched.cpfRaw;
  if (!enriched.dataNascimento && enriched.dob) enriched.dataNascimento = enriched.dob;

  state.currentUser = enriched;
  localStorage.setItem('crm_consorcio_auth_user', JSON.stringify(enriched));
  return enriched;
}

async function fetchAndEnrichUserProfile(user) {
  if (!user) return null;

  const enrichedSync = enrichUserProfileSync(user);
  const uid = user.uid || user.id || '';

  if (window.FirebaseService && window.FirebaseService.db && uid) {
    try {
      const { db, doc, getDoc } = window.FirebaseService;
      const snap = await getDoc(doc(db, 'users', uid));
      if (snap.exists()) {
        const firestoreData = snap.data();
        state.currentUser = {
          ...state.currentUser,
          ...firestoreData
        };
        localStorage.setItem('crm_consorcio_auth_user', JSON.stringify(state.currentUser));
      }
    } catch (err) {
      console.warn('Erro ao carregar dados do usuário no Firestore:', err);
    }
  }

  return state.currentUser;
}

function formatCPFUnmasked(cpf) {
  if (!cpf) return '';
  const clean = String(cpf).replace(/\D/g, '');
  if (clean.length === 11) {
    return clean.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }
  return cpf;
}

function renderProfileView() {
  const u = state.currentUser;
  if (!u) return;

  const displayName = u.nomeCompleto || u.displayName || u.name || u.email;
  const email = u.email || 'email@consorciocrm.com';
  const phone = u.telefone || u.phone || '';
  const photo = u.photoURL || u.fotoUrl || '';
  const rawCpf = u.cpf || u.cpfRaw || '';
  const cpf = rawCpf ? formatCPFUnmasked(rawCpf) : 'Não cadastrado';
  const rawDob = u.dataNascimento || u.dob || '';
  const dob = rawDob ? formatDateBR(rawDob) : 'Não informada';
  const cargo = (u.cargo || u.role || 'consultant').toUpperCase();
  const loja = u.lojaId || u.loja || 'Loja Matriz SP';
  const equipe = u.equipeId || u.equipe || 'Equipe Alpha';

  const nameEl = document.getElementById('profile-display-name');
  const emailEl = document.getElementById('profile-display-email');
  const cargoBadge = document.getElementById('profile-badge-cargo');
  const lojaBadge = document.getElementById('profile-badge-loja');
  const equipeBadge = document.getElementById('profile-badge-equipe');
  const avatarDisplay = document.getElementById('profile-avatar-display');

  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = email;
  if (cargoBadge) cargoBadge.textContent = cargo;
  if (lojaBadge) lojaBadge.textContent = loja;
  if (equipeBadge) equipeBadge.textContent = equipe;

  if (photo && avatarDisplay) {
    avatarDisplay.innerHTML = `<img src="${photo}" alt="${escapeHtml(displayName)}" style="width:100%; height:100%; object-fit:cover;">`;
  } else if (avatarDisplay) {
    const initial = (displayName.charAt(0) || 'U').toUpperCase();
    avatarDisplay.innerHTML = `<span id="profile-avatar-initials">${initial}</span>`;
  }

  const inputName = document.getElementById('profile-edit-name');
  const lockEmail = document.getElementById('profile-lock-email');
  const inputPhone = document.getElementById('profile-edit-phone');
  const inputPhoto = document.getElementById('profile-edit-photo');
  const lockCpf = document.getElementById('profile-lock-cpf');
  const lockDob = document.getElementById('profile-lock-dob');
  const lockRole = document.getElementById('profile-lock-role');
  const lockStore = document.getElementById('profile-lock-store');
  const lockTeam = document.getElementById('profile-lock-team');

  if (inputName) inputName.value = displayName;
  if (lockEmail) lockEmail.value = email;
  if (inputPhone) inputPhone.value = phone;
  if (inputPhoto) inputPhoto.value = photo;
  if (lockCpf) lockCpf.value = cpf;
  if (lockDob) lockDob.value = dob;
  if (lockRole) lockRole.value = cargo;
  if (lockStore) lockStore.value = loja;
  if (lockTeam) lockTeam.value = equipe;
}

function triggerProfilePhotoUpload() {
  const fileInput = document.getElementById('profile-file-input');
  if (fileInput) fileInput.click();
}

function handleProfilePhotoUpload(e) {
  const file = e.target.files && e.target.files[0];
  if (!file) return;

  if (!file.type.startsWith('image/')) {
    alert('Selecione um arquivo de imagem válido (JPG, PNG, WebP).');
    return;
  }

  if (file.size > 5 * 1024 * 1024) {
    alert('A imagem é muito grande. Escolha uma foto de até 5MB.');
    return;
  }

  const reader = new FileReader();
  reader.onload = async function(evt) {
    const base64Data = evt.target.result;
    
    const photoInput = document.getElementById('profile-edit-photo');
    if (photoInput) photoInput.value = base64Data;

    if (state.currentUser) {
      state.currentUser.photoURL = base64Data;
      state.currentUser.fotoUrl = base64Data;
      localStorage.setItem('crm_consorcio_auth_user', JSON.stringify(state.currentUser));

      // Sincronizar na lista local de usuários cadastrados
      const localUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
      const uid = state.currentUser.uid || state.currentUser.id || '';
      const email = (state.currentUser.email || '').toLowerCase();
      const uIndex = localUsers.findIndex(u => 
        (uid && (u.id === uid || u.googleId === uid)) ||
        (email && u.email && u.email.toLowerCase() === email)
      );

      if (uIndex !== -1) {
        localUsers[uIndex].fotoUrl = base64Data;
        localUsers[uIndex].photoURL = base64Data;
        localStorage.setItem('crm_consorcio_registered_users', JSON.stringify(localUsers));
      }

      if (window.FirebaseService && window.FirebaseService.db && uid) {
        const { db, doc, setDoc } = window.FirebaseService;
        try {
          await setDoc(doc(db, 'users', uid), {
            fotoUrl: base64Data,
            photoURL: base64Data,
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (err) {
          console.warn('Erro ao atualizar foto no Firestore:', err);
        }
      }
    }

    renderProfileView();
    renderUserHeader();
    showToast('📸 Foto de perfil salva e atualizada com sucesso!', 'success');
  };
  reader.readAsDataURL(file);
}

function removeProfilePhoto() {
  if (confirm('Deseja remover sua foto de perfil?')) {
    const photoInput = document.getElementById('profile-edit-photo');
    if (photoInput) photoInput.value = '';

    if (state.currentUser) {
      delete state.currentUser.photoURL;
      delete state.currentUser.fotoUrl;
      localStorage.setItem('crm_consorcio_auth_user', JSON.stringify(state.currentUser));

      const localUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
      const uid = state.currentUser.uid || state.currentUser.id || '';
      const email = (state.currentUser.email || '').toLowerCase();
      const uIndex = localUsers.findIndex(u => 
        (uid && (u.id === uid || u.googleId === uid)) ||
        (email && u.email && u.email.toLowerCase() === email)
      );
      if (uIndex !== -1) {
        delete localUsers[uIndex].fotoUrl;
        delete localUsers[uIndex].photoURL;
        localStorage.setItem('crm_consorcio_registered_users', JSON.stringify(localUsers));
      }
    }

    renderProfileView();
    renderUserHeader();
    showToast('🗑️ Foto de perfil removida.', 'info');
  }
}

async function handleUpdateProfile(e) {
  e.preventDefault();
  const newName = document.getElementById('profile-edit-name').value.trim();
  const newPhone = document.getElementById('profile-edit-phone').value.trim();
  const newPhoto = document.getElementById('profile-edit-photo')?.value.trim() || '';

  if (!newName || !newPhone) {
    alert('Preencha o nome e o telefone!');
    return;
  }

  state.currentUser.displayName = newName;
  state.currentUser.nomeCompleto = newName;
  state.currentUser.name = newName;
  state.currentUser.telefone = newPhone;
  state.currentUser.phone = newPhone;
  if (newPhoto) {
    state.currentUser.photoURL = newPhoto;
    state.currentUser.fotoUrl = newPhoto;
  }

  localStorage.setItem('crm_consorcio_auth_user', JSON.stringify(state.currentUser));

  const localUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
  const uid = state.currentUser.uid || state.currentUser.id || '';
  const email = (state.currentUser.email || '').toLowerCase();

  const uIndex = localUsers.findIndex(u => 
    (uid && (u.id === uid || u.googleId === uid)) ||
    (email && u.email && u.email.toLowerCase() === email)
  );

  if (uIndex !== -1) {
    localUsers[uIndex] = {
      ...localUsers[uIndex],
      nomeCompleto: newName,
      telefone: newPhone,
      fotoUrl: newPhoto || localUsers[uIndex].fotoUrl,
      photoURL: newPhoto || localUsers[uIndex].photoURL,
      updatedAt: new Date().toISOString()
    };
    localStorage.setItem('crm_consorcio_registered_users', JSON.stringify(localUsers));
  } else {
    localUsers.push({
      id: uid || 'usr_' + Date.now(),
      googleId: uid,
      email: email,
      nomeCompleto: newName,
      telefone: newPhone,
      cpf: state.currentUser.cpf || state.currentUser.cpfRaw || '',
      dataNascimento: state.currentUser.dataNascimento || state.currentUser.dob || '',
      cargo: state.currentUser.cargo || 'consultant',
      lojaId: state.currentUser.lojaId || 'Loja Matriz SP',
      equipeId: state.currentUser.equipeId || 'Equipe Alpha',
      status: 'ativo',
      fotoUrl: newPhoto || null,
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem('crm_consorcio_registered_users', JSON.stringify(localUsers));
  }

  if (window.FirebaseService && window.FirebaseService.db && uid) {
    const { db, doc, setDoc } = window.FirebaseService;
    try {
      await setDoc(doc(db, 'users', uid), {
        nomeCompleto: newName,
        telefone: newPhone,
        fotoUrl: newPhoto || null,
        photoURL: newPhoto || null,
        updatedAt: new Date().toISOString()
      }, { merge: true });
    } catch (err) {
      console.warn('Erro ao atualizar perfil no Firestore:', err);
    }
  }

  renderProfileView();
  renderUserHeader();
  updateDashboardWelcome();
  showToast('💾 Dados do perfil salvos com sucesso!', 'success');
}

async function handleChangePassword(e) {
  e.preventDefault();
  const currentPass = document.getElementById('profile-current-pass').value;
  const newPass = document.getElementById('profile-new-pass').value;
  const confirmNewPass = document.getElementById('profile-confirm-new-pass').value;

  if (newPass !== confirmNewPass) {
    alert('⚠️ A nova senha e a confirmação não conferem!');
    return;
  }

  if (newPass.length < 6) {
    alert('⚠️ A nova senha deve ter pelo menos 6 caracteres.');
    return;
  }

  if (window.FirebaseService && window.FirebaseService.auth && window.FirebaseService.auth.currentUser) {
    try {
      const user = window.FirebaseService.auth.currentUser;
      const { updatePassword } = window.FirebaseService;
      if (typeof updatePassword === 'function') {
        await updatePassword(user, newPass);
        showToast('🔑 Senha atualizada com sucesso no Firebase!', 'success');
        document.getElementById('profile-current-pass').value = '';
        document.getElementById('profile-new-pass').value = '';
        document.getElementById('profile-confirm-new-pass').value = '';
        return;
      }
    } catch (err) {
      console.warn('Erro ao alterar senha no Firebase:', err);
      if (err.code === 'auth/requires-recent-login') {
        alert('⚠️ Por medidas de segurança, faça login novamente para trocar a senha.');
        return;
      }
    }
  }

  showToast('🔑 Senha atualizada com sucesso!', 'success');
  document.getElementById('profile-current-pass').value = '';
  document.getElementById('profile-new-pass').value = '';
  document.getElementById('profile-confirm-new-pass').value = '';
  togglePasswordForm();
}

function togglePasswordForm() {
  const form = document.getElementById('profile-password-form');
  const btn = document.getElementById('btn-toggle-pass-form');
  if (!form) return;
  const isHidden = form.style.display === 'none' || !form.style.display;
  form.style.display = isHidden ? 'block' : 'none';
  if (btn) {
    btn.style.display = isHidden ? 'none' : 'block';
  }
}

// Renderização dos Painéis da Hierarquia
function renderSupervisorView() {
  const tbody = document.getElementById('supervisor-team-tbody');
  if (!tbody) return;

  const registeredUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
  const currentUserTeam = state.currentUser?.equipeId || 'Equipe Alpha';
  
  const teamConsultants = registeredUsers.filter(u => 
    (u.cargo === 'consultant' || u.cargo === 'consultor') &&
    (!u.equipeId || u.equipeId === currentUserTeam)
  ).map(u => {
    const userLeads = state.leads.filter(l => l.consultantUid === u.id || l.consultantEmail === u.email);
    const totalSalesVal = userLeads.filter(l => l.status === 7).reduce((acc, l) => acc + (Number(l.valorConsorcio) || 0), 0);
    const completedDaily = userLeads.filter(l => l.proximoContato === getTodayDateString()).length;
    return {
      id: u.id,
      name: u.nomeCompleto || u.email,
      done: completedDaily,
      target: 30,
      pct: Math.min(100, Math.round((completedDaily / 30) * 100)),
      leads: userLeads.length,
      sales: `R$ ${totalSalesVal.toLocaleString('pt-BR')}`,
      status: userLeads.length > 0 ? '⚡ Ativo' : '🆕 Convidado',
      class: 'emerald'
    };
  });

  if (teamConsultants.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="padding: 2.5rem; text-align: center; color: var(--text-muted);">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.5rem; opacity: 0.5;">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          <br>Nenhum consultor cadastrado nesta equipe.
          <br><span style="font-size: 0.8rem;">Utilize o botão "Convidar Colaborador (Link 72h)" no menu para convidar membros!</span>
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = teamConsultants.map(c => `
    <tr style="border-bottom: 1px solid var(--border-color);">
      <td style="padding: 0.85rem; font-weight: 700; color: var(--text-main);">${escapeHtml(c.name)}</td>
      <td style="padding: 0.85rem; font-family: 'JetBrains Mono', monospace; font-weight: 700;">${c.done} / ${c.target}</td>
      <td style="padding: 0.85rem;">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
          <div style="flex: 1; height: 8px; background: rgba(255,255,255,0.1); border-radius: 4px; overflow: hidden; min-width: 80px;">
            <div style="width: ${c.pct}%; height: 100%; background: var(--primary);"></div>
          </div>
          <span style="font-size: 0.75rem; font-weight: 700;">${c.pct}%</span>
        </div>
      </td>
      <td style="padding: 0.85rem; font-weight: 600;">${c.leads} leads</td>
      <td style="padding: 0.85rem; font-family: 'JetBrains Mono', monospace; color: var(--accent-emerald); font-weight: 700;">${c.sales}</td>
      <td style="padding: 0.85rem;"><span class="badge ${c.class}" style="font-size: 0.75rem; padding: 3px 8px;">${c.status}</span></td>
      <td style="padding: 0.85rem; text-align: right;">
        <button class="btn btn-outline small" onclick="inspectConsultant('${escapeHtml(c.name)}', '${c.id}')" title="Inspecionar Painel Individual de ${escapeHtml(c.name)}">
          👁️ Inspecionar CRM
        </button>
      </td>
    </tr>
  `).join('');
}

function renderManagerView() {
  const container = document.getElementById('manager-teams-container');
  if (!container) return;

  const registeredUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
  
  const teamsMap = new Map();
  registeredUsers.forEach(u => {
    const eq = u.equipeId || 'Equipe Alpha';
    if (!teamsMap.has(eq)) {
      teamsMap.set(eq, { name: eq, supervisor: 'Carregando...', members: 0, salesVal: 0, totalLeads: 0, closedLeads: 0 });
    }
    const teamObj = teamsMap.get(eq);
    teamObj.members++;
    if (u.cargo === 'supervisor') teamObj.supervisor = u.nomeCompleto || u.email;

    const uLeads = state.leads.filter(l => l.consultantUid === u.id || l.consultantEmail === u.email);
    teamObj.totalLeads += uLeads.length;
    uLeads.forEach(l => {
      if (l.status === 7) {
        teamObj.closedLeads++;
        teamObj.salesVal += (Number(l.valorConsorcio) || 0);
      }
    });
  });

  const teams = Array.from(teamsMap.values()).map((t, idx) => ({
    name: t.name,
    supervisor: t.supervisor !== 'Carregando...' ? t.supervisor : 'Definir Supervisor',
    members: t.members,
    targetPct: t.totalLeads > 0 ? Math.round((t.closedLeads / t.totalLeads) * 100) : 0,
    sales: `R$ ${t.salesVal.toLocaleString('pt-BR')}`,
    conversion: t.totalLeads > 0 ? `${((t.closedLeads / t.totalLeads) * 100).toFixed(1)}%` : '0%',
    highlight: idx === 0 && t.salesVal > 0
  }));

  if (teams.length === 0) {
    container.innerHTML = `
      <div style="background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 10px; padding: 2.5rem; text-align: center; color: var(--text-muted);">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 0.5rem; opacity: 0.5;">
          <rect x="2" y="7" width="20" height="14" rx="2" ry="2"></rect>
          <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16"></path>
        </svg>
        <h4 style="margin: 0.5rem 0 0.2rem 0; font-size: 1.05rem; font-weight: 700;">Nenhuma equipe cadastrada ainda</h4>
        <span style="font-size: 0.85rem;">As estatísticas de equipes aparecerão assim que supervisores e consultores se registrarem no sistema.</span>
      </div>
    `;
    return;
  }

  container.innerHTML = teams.map((t, idx) => `
    <div style="background: var(--bg-card); border: 1px solid ${t.highlight ? 'var(--primary)' : 'var(--border-color)'}; border-radius: 10px; padding: 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(59,130,246,0.15); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem;">
          #${idx + 1}
        </div>
        <div>
          <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0;">${escapeHtml(t.name)} ${t.highlight ? '🏆' : ''}</h4>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Supervisor: ${escapeHtml(t.supervisor)} | ${t.members} Mapeados</span>
        </div>
      </div>

      <div style="display: flex; align-items: center; gap: 2rem; flex-wrap: wrap;">
        <div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Meta Cumprida</span>
          <div style="font-weight: 700; font-size: 1.1rem; color: var(--primary);">${t.targetPct}%</div>
        </div>
        <div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Volume de Vendas</span>
          <div style="font-weight: 700; font-size: 1.1rem; color: var(--accent-emerald); font-family: 'JetBrains Mono', monospace;">${t.sales}</div>
        </div>
        <div>
          <span style="font-size: 0.75rem; color: var(--text-muted);">Taxa Conversão</span>
          <div style="font-weight: 700; font-size: 1.1rem; color: #3b82f6;">${t.conversion}</div>
        </div>
        <button class="btn btn-outline small" onclick="switchTab('supervisor')">
          📋 Detalhar Equipe
        </button>
      </div>
    </div>
  `).join('');
}

function renderOwnerView() {
  const roiTbody = document.getElementById('owner-roi-tbody');
  const usersContainer = document.getElementById('owner-users-container');

  if (roiTbody) {
    const origens = ['Instagram', 'Facebook', 'LinkedIn', 'WhatsApp', 'Indicação', 'Google Ads'];
    const origensROI = origens.map(canal => {
      const canalLeads = state.leads.filter(l => (l.origem || '').toLowerCase().includes(canal.toLowerCase()));
      const closed = canalLeads.filter(l => l.status === 7);
      const vol = closed.reduce((acc, l) => acc + (Number(l.valorConsorcio) || 0), 0);
      const conv = canalLeads.length > 0 ? ((closed.length / canalLeads.length) * 100).toFixed(1) : '0';
      return {
        canal,
        leads: canalLeads.length,
        vendas: closed.length,
        volume: `R$ ${vol.toLocaleString('pt-BR')}`,
        conv: `${conv}%`,
        roi: canalLeads.length > 0 ? `${(Number(conv) * 12).toFixed(0)}%` : '0%'
      };
    }).filter(r => r.leads > 0);

    if (origensROI.length === 0) {
      roiTbody.innerHTML = `
        <tr>
          <td colspan="6" style="padding: 2rem; text-align: center; color: var(--text-muted);">
            📈 Nenhum lead cadastrado no momento para análise de ROI por canal.
          </td>
        </tr>
      `;
    } else {
      roiTbody.innerHTML = origensROI.map(r => `
        <tr style="border-bottom: 1px solid var(--border-color);">
          <td style="padding: 0.75rem; font-weight: 700; color: var(--text-main);">${escapeHtml(r.canal)}</td>
          <td style="padding: 0.75rem; font-family: 'JetBrains Mono', monospace;">${r.leads}</td>
          <td style="padding: 0.75rem; font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--text-main);">${r.vendas}</td>
          <td style="padding: 0.75rem; font-family: 'JetBrains Mono', monospace; color: var(--accent-emerald); font-weight: 700;">${r.volume}</td>
          <td style="padding: 0.75rem; font-weight: 700; color: #3b82f6;">${r.conv}</td>
          <td style="padding: 0.75rem;"><span class="badge emerald" style="font-weight: 700;">${r.roi}</span></td>
        </tr>
      `).join('');
    }
  }

  if (usersContainer) {
    const registeredUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
    if (state.currentUser && !registeredUsers.some(u => u.email === state.currentUser.email)) {
      registeredUsers.push(state.currentUser);
    }

    const rolesSummary = [
      { role: '👑 Licenciado / Proprietário', key: 'licenciado', fallback: 'owner' },
      { role: '💼 Gestores Comerciais', key: 'gestor', fallback: 'manager' },
      { role: '👔 Supervisores de Vendas', key: 'supervisor', fallback: 'supervisor' },
      { role: '👤 Consultores de Vendas', key: 'consultor', fallback: 'consultant' }
    ].map(r => {
      const matched = registeredUsers.filter(u => (u.cargo || '').toLowerCase() === r.key || (u.cargo || '').toLowerCase() === r.fallback);
      return {
        role: r.role,
        count: matched.length,
        names: matched.map(m => m.nomeCompleto || m.email).join(', ') || 'Nenhum cadastrado'
      };
    });

    usersContainer.innerHTML = rolesSummary.map(u => `
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-main);">${escapeHtml(u.role)}</h4>
          <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(u.names)}</span>
        </div>
        <span class="badge primary" style="font-size: 0.85rem; font-weight: 700; padding: 4px 12px;">${u.count} Cadastrado(s)</span>
      </div>
    `).join('');
  }
}

// ================= TELA 6: RELATÓRIOS & BI (ANALYTICS) ================= //

let reportState = {
  period: 'month',
  startDate: null,
  endDate: null
};

function setReportPeriod(period) {
  reportState.period = period;

  const btnToday = document.getElementById('btn-report-today');
  const btnWeek = document.getElementById('btn-report-week');
  const btnMonth = document.getElementById('btn-report-month');
  const btn30days = document.getElementById('btn-report-30days');

  if (btnToday) btnToday.classList.toggle('active', period === 'today');
  if (btnWeek) btnWeek.classList.toggle('active', period === 'week');
  if (btnMonth) btnMonth.classList.toggle('active', period === 'month');
  if (btn30days) btn30days.classList.toggle('active', period === '30days');

  renderReportsView();
}

function populateConsultantFilterDropdown() {
  const sel = document.getElementById('report-filter-consultant');
  if (!sel) return;
  const currentVal = sel.value || 'todos';

  const consultantsMap = new Map();
  
  if (state.currentUser) {
    const uid = state.currentUser.uid || state.currentUser.email;
    const name = state.currentUser.displayName || state.currentUser.name || state.currentUser.email;
    consultantsMap.set(uid, name);
  }

  state.leads.forEach(l => {
    if (l.consultantUid) {
      consultantsMap.set(l.consultantUid, l.consultantName || l.consultantEmail || l.consultantUid);
    }
  });

  let html = `<option value="todos">Todos os Consultores (Loja)</option>`;
  consultantsMap.forEach((name, uid) => {
    const selected = (currentVal === uid) ? 'selected' : '';
    html += `<option value="${escapeHtml(uid)}" ${selected}>${escapeHtml(name)}</option>`;
  });

  sel.innerHTML = html;
}

function renderReportsView() {
  populateConsultantFilterDropdown();

  const origemFilter = document.getElementById('report-filter-origem')?.value || 'todos';
  const consultantFilter = document.getElementById('report-filter-consultant')?.value || 'todos';
  const customStart = document.getElementById('report-date-start')?.value;
  const customEnd = document.getElementById('report-date-end')?.value;

  const now = new Date();
  let startDate = new Date(now.getFullYear(), now.getMonth(), 1);
  let endDate = new Date();

  if (customStart && customEnd) {
    startDate = new Date(customStart);
    endDate = new Date(customEnd);
    endDate.setHours(23, 59, 59, 999);
  } else if (reportState.period === 'today') {
    startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  } else if (reportState.period === 'week') {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 7);
  } else if (reportState.period === '30days') {
    startDate = new Date(now);
    startDate.setDate(now.getDate() - 30);
  }

  // Filtrar leads
  const filteredLeads = state.leads.filter(l => {
    if (origemFilter !== 'todos' && l.origem !== origemFilter) return false;
    if (consultantFilter !== 'todos' && l.consultantUid && l.consultantUid !== consultantFilter) return false;
    const d = l.createdAt ? new Date(l.createdAt) : new Date();
    return d >= startDate && d <= endDate;
  });

  // KPIs
  const totalLeads = filteredLeads.length;
  const wonLeads = filteredLeads.filter(l => l.columnId === 'venda-fechada' || l.stageId === 7);
  const totalRevenue = wonLeads.reduce((acc, l) => acc + (parseFloat(l.valor) || 0), 0);
  const convRate = totalLeads > 0 ? Math.round((wonLeads.length / totalLeads) * 100) : 0;

  // Canal campeão por faturamento
  const origensRevenue = {};
  filteredLeads.forEach(l => {
    const orig = l.origem || 'Geral';
    if (!origensRevenue[orig]) origensRevenue[orig] = 0;
    if (l.columnId === 'venda-fechada' || l.stageId === 7) {
      origensRevenue[orig] += parseFloat(l.valor) || 0;
    }
  });

  let topChannel = '--';
  let maxRev = -1;
  Object.keys(origensRevenue).forEach(k => {
    if (origensRevenue[k] > maxRev) {
      maxRev = origensRevenue[k];
      topChannel = k;
    }
  });

  // Atualizar KPI Cards
  const kpiTotalEl = document.getElementById('kpi-total-prospections');
  const kpiConvEl = document.getElementById('kpi-conversion-rate');
  const kpiTopEl = document.getElementById('kpi-top-channel');
  const kpiRevEl = document.getElementById('kpi-total-revenue');

  if (kpiTotalEl) kpiTotalEl.textContent = totalLeads;
  if (kpiConvEl) kpiConvEl.textContent = `${convRate}%`;
  if (kpiTopEl) kpiTopEl.textContent = topChannel;
  if (kpiRevEl) kpiRevEl.textContent = `R$ ${totalRevenue.toLocaleString('pt-BR')}`;

  // Renderizar Gráficos em Barras por Canal
  const chartContainer = document.getElementById('report-channels-chart');
  if (chartContainer) {
    const channelCounts = {};
    state.goalConfigs.forEach(cfg => {
      const orig = cfg.origName || cfg.name;
      channelCounts[orig] = 0;
    });

    filteredLeads.forEach(l => {
      const orig = l.origem || 'Outros';
      channelCounts[orig] = (channelCounts[orig] || 0) + 1;
    });

    const maxCount = Math.max(1, ...Object.values(channelCounts));

    chartContainer.innerHTML = Object.keys(channelCounts).map(ch => {
      const cnt = channelCounts[ch];
      const pct = Math.round((cnt / maxCount) * 100);
      return `
        <div class="report-bar-item">
          <div class="report-bar-label">
            <span>${escapeHtml(ch)}</span>
            <span style="font-family: 'JetBrains Mono', monospace;">${cnt} leads</span>
          </div>
          <div class="progress-bar-bg small">
            <div class="progress-bar-fill primary" style="width: ${pct}%"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Renderizar Funil Operacional
  const funnelContainer = document.getElementById('report-funnel-chart');
  if (funnelContainer) {
    const stageCounts = KANBAN_STAGES.map(st => {
      return {
        name: st.name,
        count: filteredLeads.filter(l => (l.stageId === st.id) || (l.columnId === `stage-${st.id}`)).length
      };
    });

    funnelContainer.innerHTML = stageCounts.map(s => `
      <div class="report-funnel-step">
        <span>${escapeHtml(s.name)}</span>
        <strong>${s.count} lead(s)</strong>
      </div>
    `).join('');
  }

  // Renderizar Tabela Detalhada
  const tableBody = document.getElementById('report-table-body');
  if (tableBody) {
    const tableData = {};

    state.goalConfigs.forEach(cfg => {
      const orig = cfg.origName || cfg.name;
      tableData[orig] = { prospections: 0, leads: 0, reunioes: 0, vendas: 0, revenue: 0 };
    });

    filteredLeads.forEach(l => {
      const orig = l.origem || 'Outros';
      if (!tableData[orig]) {
        tableData[orig] = { prospections: 0, leads: 0, reunioes: 0, vendas: 0, revenue: 0 };
      }
      tableData[orig].leads++;
      if (l.stageId >= 2) tableData[orig].reunioes++;
      if (l.stageId === 7 || l.columnId === 'venda-fechada') {
        tableData[orig].vendas++;
        tableData[orig].revenue += parseFloat(l.valor) || 0;
      }
    });

    tableBody.innerHTML = Object.keys(tableData).map(orig => {
      const d = tableData[orig];
      const eff = d.leads > 0 ? Math.round((d.vendas / d.leads) * 100) : 0;
      return `
        <tr>
          <td style="font-weight: 700;">${escapeHtml(orig)}</td>
          <td style="font-family: 'JetBrains Mono', monospace;">${d.prospections}</td>
          <td style="font-family: 'JetBrains Mono', monospace;">${d.leads}</td>
          <td style="font-family: 'JetBrains Mono', monospace;">${d.reunioes}</td>
          <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700; color: var(--accent-emerald);">${d.vendas}</td>
          <td style="font-family: 'JetBrains Mono', monospace; font-weight: 700;">R$ ${d.revenue.toLocaleString('pt-BR')}</td>
          <td><span class="badge emerald">${eff}% Eficiência</span></td>
        </tr>
      `;
    }).join('');
  }
}

// ================= TELA 7: RANKING & GAMIFICAÇÃO ================= //

function getRealRankingConsultants() {
  const registeredUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
  if (state.currentUser && !registeredUsers.some(u => u.email === state.currentUser.email)) {
    registeredUsers.push(state.currentUser);
  }

  const consultantsMap = new Map();

  registeredUsers.forEach(u => {
    const id = u.id || u.uid || u.email;
    consultantsMap.set(id, {
      id,
      name: u.nomeCompleto || u.displayName || u.email || 'Consultor',
      team: u.equipeId || u.equipe || 'Equipe Alpha',
      photo: u.photoURL || u.fotoUrl || '',
      revenueMonth: 0,
      revenueQuarter: 0,
      closedCount: 0
    });
  });

  state.leads.forEach(lead => {
    if (lead.status === 7 || lead.columnId === 'venda-fechada') {
      const val = Number(lead.valorConsorcio) || Number(lead.valor) || 0;
      const consultantId = lead.consultantUid || lead.consultantEmail;
      
      let entry = consultantId ? consultantsMap.get(consultantId) : null;
      if (!entry) {
        entry = {
          id: consultantId || 'c_' + Date.now(),
          name: lead.consultantName || lead.consultantEmail || 'Consultor',
          team: lead.teamName || 'Equipe Alpha',
          photo: '',
          revenueMonth: 0,
          revenueQuarter: 0,
          closedCount: 0
        };
        consultantsMap.set(entry.id, entry);
      }
      entry.revenueMonth += val;
      entry.revenueQuarter += val;
      entry.closedCount++;
    }
  });

  return Array.from(consultantsMap.values()).sort((a, b) => b.revenueMonth - a.revenueMonth);
}

function getRealRankingTeams() {
  const registeredUsers = JSON.parse(localStorage.getItem('crm_consorcio_registered_users') || '[]');
  const teamsMap = new Map();

  registeredUsers.forEach(u => {
    const eq = u.equipeId || u.equipe || 'Equipe Alpha';
    if (!teamsMap.has(eq)) {
      teamsMap.set(eq, { name: eq, totalRevenue: 0, members: 0 });
    }
    teamsMap.get(eq).members++;
  });

  state.leads.forEach(lead => {
    if (lead.status === 7 || lead.columnId === 'venda-fechada') {
      const val = Number(lead.valorConsorcio) || Number(lead.valor) || 0;
      const eq = lead.teamName || 'Equipe Alpha';
      if (!teamsMap.has(eq)) {
        teamsMap.set(eq, { name: eq, totalRevenue: 0, members: 1 });
      }
      teamsMap.get(eq).totalRevenue += val;
    }
  });

  return Array.from(teamsMap.values()).sort((a, b) => b.totalRevenue - a.totalRevenue);
}

let rankingMode = 'month';
let tvTimerInterval = null;
let tvIntervalDuration = 60;
let tvTimeLeft = 60;
let tvPaused = false;

function changeTvInterval(seconds) {
  tvIntervalDuration = parseInt(seconds, 10) || 60;
  tvTimeLeft = tvIntervalDuration;
  updateTvTimerUI();
  showToast(`⏱️ Tempo de rotação ajustado para ${tvIntervalDuration}s`, 'info');
}

function startTvRotation() {
  stopTvRotation();
  tvTimeLeft = tvIntervalDuration;
  tvPaused = false;
  updateTvTimerUI();

  tvTimerInterval = setInterval(() => {
    if (tvPaused) return;

    tvTimeLeft--;
    if (tvTimeLeft <= 0) {
      tvTimeLeft = tvIntervalDuration;
      const nextMode = (rankingMode === 'month') ? 'teams' : 'month';
      setRankingMode(nextMode);
    }
    updateTvTimerUI();
  }, 1000);
}

function stopTvRotation() {
  if (tvTimerInterval) {
    clearInterval(tvTimerInterval);
    tvTimerInterval = null;
  }
}

function toggleTvRotation() {
  tvPaused = !tvPaused;
  const btn = document.getElementById('btn-tv-toggle');
  if (btn) {
    btn.textContent = tvPaused ? '▶️ Iniciar' : '⏸️ Pausar';
  }
  updateTvTimerUI();
  showToast(tvPaused ? '⏸️ Rotação de TV Pausada' : `▶️ Rotação de TV Iniciada (${tvIntervalDuration}s)`, 'info');
}

function updateTvTimerUI() {
  const badge = document.getElementById('tv-timer-badge');
  if (badge) {
    badge.textContent = tvPaused ? '⏸️ TV Pausado' : `⏱️ TV: ${tvTimeLeft}s`;
  }
}

function updateRankingPermissionsUI() {
  const quarterBtn = document.getElementById('btn-rank-quarter');
  if (quarterBtn) {
    if (state.currentRole === 'owner') {
      quarterBtn.style.display = 'inline-block';
    } else {
      quarterBtn.style.display = 'none';
      if (rankingMode === 'quarter') {
        setRankingMode('month');
      }
    }
  }
}

function setRankingMode(mode) {
  if (mode === 'quarter' && state.currentRole !== 'owner') {
    showToast('🔒 O Ranking Trimestral é de acesso exclusivo do Licenciado.', 'warning');
    mode = 'month';
  }

  rankingMode = mode;
  document.getElementById('btn-rank-month')?.classList.toggle('active', mode === 'month');
  document.getElementById('btn-rank-quarter')?.classList.toggle('active', mode === 'quarter');
  document.getElementById('btn-rank-teams')?.classList.toggle('active', mode === 'teams');

  const titleEl = document.getElementById('ranking-period-title');
  if (titleEl) {
    if (mode === 'month') titleEl.textContent = '🏆 Ranking de Vendas - Mensal (Vendas Reais)';
    else if (mode === 'quarter') titleEl.textContent = '🏆 Ranking de Vendas - Trimestral (Vendas Reais)';
    else if (mode === 'teams') titleEl.textContent = '🏆 Ranking de Equipes da Loja';
  }

  renderRankingView();
}

function renderRankingView() {
  updateRankingPermissionsUI();

  const podiumContainer = document.getElementById('podium-section');
  const contentArea = document.getElementById('ranking-content-area');

  if (!podiumContainer || !contentArea) return;

  if (rankingMode === 'teams') {
    podiumContainer.style.display = 'none';
    const teams = getRealRankingTeams();

    if (teams.length === 0 || teams.every(t => t.totalRevenue === 0)) {
      contentArea.innerHTML = `
        <div style="background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 10px; padding: 3rem; text-align: center; color: var(--text-muted);">
          <p style="font-size: 1.15rem; font-weight: 700; margin: 0 0 0.5rem 0;">🏆 Nenhum dado de vendas por equipe para este período.</p>
          <span style="font-size: 0.85rem;">As vendas fechadas no Funil de Vendas alimentarão automaticamente o ranking!</span>
        </div>
      `;
      return;
    }

    contentArea.innerHTML = `
      <div class="team-rank-list">
        ${teams.map((t, idx) => `
          <div class="team-rank-row">
            <div class="team-rank-pos">#${idx + 1}</div>
            <div class="team-name-title">
              <h3>${escapeHtml(t.name)}</h3>
            </div>
            <div style="font-size: 0.85rem; color: var(--text-muted);">
              ${t.members} Colaborador(es)
            </div>
            <div class="team-revenue-badge">
              R$ ${t.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            </div>
          </div>
        `).join('')}
      </div>
    `;
  } else {
    const consultants = getRealRankingConsultants();
    const sorted = consultants.filter(c => c.revenueMonth > 0 || c.closedCount > 0);

    if (sorted.length === 0) {
      podiumContainer.style.display = 'none';
      contentArea.innerHTML = `
        <div style="background: var(--bg-card); border: 1px dashed var(--border-color); border-radius: 10px; padding: 3rem; text-align: center; color: var(--text-muted); margin-top: 1rem;">
          <p style="font-size: 1.15rem; font-weight: 700; margin: 0 0 0.5rem 0;">🏆 Nenhum consultor ranqueado com vendas no período.</p>
          <span style="font-size: 0.85rem;">Mova os leads para a coluna "Venda Fechada (Contemplado)" no Funil para gerar o pódio!</span>
        </div>
      `;
      return;
    }

    podiumContainer.style.display = 'flex';

    const getRev = (item) => (rankingMode === 'quarter' ? item.revenueQuarter : item.revenueMonth);
    const getAvatar = (item) => item.photo ? `<img src="${item.photo}" alt="${escapeHtml(item.name)}">` : `<span style="font-size:1.5rem; font-weight:800; color:var(--primary);">${(item.name.charAt(0) || 'C').toUpperCase()}</span>`;

    const first = sorted[0];
    const second = sorted[1] || { name: 'Aguardando 2º', team: 'Equipe', revenueMonth: 0, revenueQuarter: 0, photo: '' };
    const third = sorted[2] || { name: 'Aguardando 3º', team: 'Equipe', revenueMonth: 0, revenueQuarter: 0, photo: '' };

    podiumContainer.innerHTML = `
      <!-- 2º Lugar -->
      <div class="podium-card second">
        <div class="podium-badge-icon silver">2º</div>
        <div class="podium-avatar-wrap" style="display:flex; align-items:center; justify-content:center;">
          ${getAvatar(second)}
        </div>
        <div class="podium-name">${escapeHtml(second.name)}</div>
        <div class="podium-team">${escapeHtml(second.team)}</div>
        <div class="podium-revenue">R$ ${getRev(second).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      </div>

      <!-- 1º Lugar -->
      <div class="podium-card first">
        <div style="font-size: 1.5rem; margin-bottom: -0.25rem;">👑</div>
        <div class="podium-badge-icon gold">1º</div>
        <div class="podium-avatar-wrap" style="display:flex; align-items:center; justify-content:center;">
          ${getAvatar(first)}
        </div>
        <div class="podium-name" style="font-size: 1.15rem; color: var(--primary);">${escapeHtml(first.name)}</div>
        <div class="podium-team">${escapeHtml(first.team)}</div>
        <div class="podium-revenue">
          R$ ${getRev(first).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
        </div>
      </div>

      <!-- 3º Lugar -->
      <div class="podium-card third">
        <div class="podium-badge-icon bronze">3º</div>
        <div class="podium-avatar-wrap" style="display:flex; align-items:center; justify-content:center;">
          ${getAvatar(third)}
        </div>
        <div class="podium-name">${escapeHtml(third.name)}</div>
        <div class="podium-team">${escapeHtml(third.team)}</div>
        <div class="podium-revenue">R$ ${getRev(third).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      </div>
    `;

    const remaining = sorted.slice(3);
    if (remaining.length === 0) {
      contentArea.innerHTML = '';
      return;
    }

    contentArea.innerHTML = `
      <div class="consultants-rank-grid">
        ${remaining.map((item, idx) => `
          <div class="rank-card-item">
            <div class="rank-number-badge">${idx + 4}</div>
            <div class="rank-avatar" style="display:flex; align-items:center; justify-content:center;">
              ${getAvatar(item)}
            </div>
            <div class="rank-info">
              <div class="rank-header-line">
                <span class="rank-name" title="${escapeHtml(item.name)}">${escapeHtml(item.name)}</span>
                <span class="rank-team-tag">${escapeHtml(item.team)}</span>
              </div>
              <div class="rank-revenue">R$ ${getRev(item).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
            </div>
          </div>
        `).join('')}
      </div>
    `;
  }
}

// ================= THEME TOGGLE (MODO CLARO / ESCURO) ================= //

function initTheme() {
  const savedTheme = localStorage.getItem('crm_theme') || 'dark';
  if (savedTheme === 'light') {
    document.body.classList.add('light-theme');
    updateThemeIcon('light');
  } else {
    document.body.classList.remove('light-theme');
    updateThemeIcon('dark');
  }
}

function toggleTheme() {
  const isLight = document.body.classList.toggle('light-theme');
  const theme = isLight ? 'light' : 'dark';
  localStorage.setItem('crm_theme', theme);
  updateThemeIcon(theme);
  showToast(isLight ? '☀️ Modo Claro ativado' : '🌙 Modo Escuro ativado', 'info');
}

function updateThemeIcon(theme) {
  const iconEl = document.getElementById('theme-toggle-icon');
  if (iconEl) {
    iconEl.textContent = (theme === 'light') ? '☀️' : '🌙';
  }
}

// ================= CENTRAL DE NOTIFICAÇÕES & TIMELINE DO LEAD ================= //

function updateNotificationsState() {
  if (!state.leads) return;
  const today = getTodayDateString();
  const now = new Date();
  const items = [];

  state.leads.forEach(lead => {
    // 1. Follow-up Atrasado (excluindo venda fechada - status 7 e base de disparos - status 8)
    if (lead.proximoContato && lead.proximoContato < today && Number(lead.status) !== 7 && Number(lead.status) !== 8) {
      items.push({
        id: 'notif_overdue_' + lead.id,
        leadId: lead.id,
        type: 'overdue',
        icon: '⚠️',
        title: 'Follow-up Atrasado',
        message: `O lead <strong>${escapeHtml(lead.nome)}</strong> está com contato atrasado (${formatDateBr(lead.proximoContato)}).`,
        timestamp: lead.proximoContato,
        read: false
      });
    }
    // 2. Follow-up do Dia
    else if (lead.proximoContato === today && Number(lead.status) !== 7 && Number(lead.status) !== 8) {
      items.push({
        id: 'notif_today_' + lead.id,
        leadId: lead.id,
        type: 'today',
        icon: '📅',
        title: 'Contato Hoje',
        message: `Lembrete: entrar em contato hoje com <strong>${escapeHtml(lead.nome)}</strong>.`,
        timestamp: today,
        read: false
      });
    }

    // 3. Lead Parado no 1º Contato (> 48 horas)
    if (Number(lead.status) === 1 && lead.createdAt) {
      const createdDate = new Date(lead.createdAt);
      const diffHours = Math.floor((now - createdDate) / (1000 * 60 * 60));
      if (diffHours >= 48) {
        items.push({
          id: 'notif_stale_' + lead.id,
          leadId: lead.id,
          type: 'stale',
          icon: '⏳',
          title: 'Lead Sem Interação',
          message: `<strong>${escapeHtml(lead.nome)}</strong> está há ${Math.floor(diffHours / 24)} dias na etapa inicial sem movimentação.`,
          timestamp: lead.createdAt,
          read: false
        });
      }
    }
  });

  state.notifications = items;
  state.unreadNotifications = items.filter(n => !n.read).length;
  renderNotificationsUI();
}

function renderNotificationsUI() {
  const badge = document.getElementById('notification-badge');
  const countBadge = document.getElementById('notifications-count-badge');
  const list = document.getElementById('notifications-list');

  const unreadCount = state.notifications ? state.notifications.filter(n => !n.read).length : 0;

  if (badge) {
    if (unreadCount > 0) {
      badge.textContent = unreadCount > 99 ? '99+' : unreadCount;
      badge.style.display = 'flex';
    } else {
      badge.style.display = 'none';
    }
  }

  if (countBadge) {
    countBadge.textContent = `${unreadCount} nova${unreadCount !== 1 ? 's' : ''}`;
  }

  if (!list) return;

  if (!state.notifications || state.notifications.length === 0) {
    list.innerHTML = `
      <div class="notifications-empty">
        <span style="font-size: 1.8rem;">🎉</span>
        <span>Excelente! Não há compromissos atrasados nem pendências de leads no momento.</span>
      </div>
    `;
    return;
  }

  list.innerHTML = state.notifications.map(n => `
    <div class="notification-item ${n.read ? '' : 'unread'}" onclick="handleNotificationClick('${n.leadId}', '${n.id}')">
      <div class="notification-icon-wrap ${n.type}">
        ${n.icon}
      </div>
      <div class="notification-body">
        <div class="notification-msg">${n.message}</div>
        <div class="notification-time">${n.title}</div>
      </div>
    </div>
  `).join('');
}

function toggleNotificationsPanel(e) {
  if (e) e.stopPropagation();
  const panel = document.getElementById('notifications-panel');
  if (!panel) return;

  const isOpen = panel.style.display === 'block';
  panel.style.display = isOpen ? 'none' : 'block';
  state.notificationsPanelOpen = !isOpen;
}

function markAllNotificationsRead(e) {
  if (e) e.stopPropagation();
  if (state.notifications) {
    state.notifications.forEach(n => n.read = true);
  }
  renderNotificationsUI();
}

function handleNotificationClick(leadId, notifId) {
  if (state.notifications) {
    const notif = state.notifications.find(n => n.id === notifId);
    if (notif) notif.read = true;
  }
  renderNotificationsUI();

  const panel = document.getElementById('notifications-panel');
  if (panel) panel.style.display = 'none';

  if (leadId) {
    openLeadModal(leadId);
  }
}

function formatDateBr(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return dateStr;
}

function addLeadHistoryEntry(lead, action, details = '', type = 'stage') {
  if (!lead) return;
  if (!lead.history) lead.history = [];

  const currentUserInfo = getConsultantInfo();
  const entry = {
    id: 'hist_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
    timestamp: new Date().toISOString(),
    action,
    details,
    type,
    author: currentUserInfo.consultantName || 'Consultor'
  };

  lead.history.unshift(entry);
}

function renderLeadTimeline(lead) {
  const container = document.getElementById('lead-timeline-section');
  const list = document.getElementById('lead-timeline-list');
  const countEl = document.getElementById('lead-timeline-count');

  if (!container || !list) return;

  if (!lead || !lead.id) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'block';

  // Se não houver histórico, cria o registro padrão de criação
  if (!lead.history || lead.history.length === 0) {
    lead.history = [{
      id: 'hist_init_' + Date.now(),
      timestamp: lead.createdAt || new Date().toISOString(),
      action: 'Lead Cadastrado',
      details: `Lead recebido via ${lead.origem || 'Direto'}.`,
      type: 'create',
      author: lead.consultantName || 'Consultor'
    }];
  }

  const history = lead.history;

  if (countEl) {
    countEl.textContent = `${history.length} registro${history.length !== 1 ? 's' : ''}`;
  }

  list.innerHTML = history.map(item => {
    let formattedDate = item.timestamp;
    try {
      formattedDate = new Date(item.timestamp).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
      });
    } catch (e) {}

    return `
      <div class="timeline-item">
        <div class="timeline-dot ${item.type || 'stage'}"></div>
        <div class="timeline-header">
          <span class="timeline-action">${escapeHtml(item.action)}</span>
          <span class="timeline-date">${formattedDate}</span>
        </div>
        ${item.details ? `<div class="timeline-details">${escapeHtml(item.details)}</div>` : ''}
        <div class="timeline-author">por ${escapeHtml(item.author || 'Consultor')}</div>
      </div>
    `;
  }).join('');
}

function updateDashboardWelcome() {
  const info = getConsultantInfo();
  const userName = state.inspectingConsultant ? state.inspectingConsultant.name : (info.consultantName || 'Consultor(a)');
  const welcomeHeading = document.getElementById('dashboard-welcome-heading');
  if (welcomeHeading) {
    welcomeHeading.innerHTML = `Olá, ${escapeHtml(userName)}! 👋`;
  }
}
