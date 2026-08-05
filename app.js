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
  { id: 7, name: 'Venda Fechada', color: 'var(--stage-7)', mandatoryDate: false }
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
  inspectingConsultant: null
};

// ================= INITIALIZATION & STORAGE ================= //

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  initTheme();
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
        state.currentUser = { email: 'admin@consorciocrm.com', name: 'Administrador', uid: 'admin_master' };
      }
    }

    // Carregar dados exclusivos da conta logada
    loadGoalConfigs();
    checkAndResetDailyGoals();
    loadLeads();
    renderGoals();

    if (gate) gate.style.display = 'none';
    if (app) app.style.display = 'flex';
    renderUserHeader();
  } else {
    if (gate) gate.style.display = 'flex';
    if (app) app.style.display = 'none';
  }
}

function quickFillAdminCredentials() {
  const inputUser = document.getElementById('portal-username');
  const inputPass = document.getElementById('portal-password');
  if (inputUser) inputUser.value = 'admin';
  if (inputPass) inputPass.value = 'admin';
}

async function handlePortalLogin(e) {
  e.preventDefault();
  const username = document.getElementById('portal-username').value.trim();
  const password = document.getElementById('portal-password').value;

  if (!username || !password) {
    alert('Informe o usuário e a senha!');
    return;
  }

  // Credencial padrão master admin / admin
  if ((username.toLowerCase() === 'admin' || username.toLowerCase() === 'admin@consorciocrm.com') && password === 'admin') {
    state.currentUser = { email: 'admin@consorciocrm.com', name: 'Administrador', uid: 'admin_master' };
    localStorage.setItem('crm_consorcio_auth_logged', 'true');
    localStorage.setItem('crm_consorcio_auth_user', JSON.stringify(state.currentUser));

    showToast('🔑 Login realizado com sucesso! Bem-vindo(a), Administrador.', 'success');
    checkAuthGate();
    return;
  }

  // Login via Firebase se estiver configurado
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

  alert('Usuário ou senha incorretos!\n\n💡 Dica de acesso padrão:\nUsuário: admin\nSenha: admin');
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

function saveGoalConfigs() {
  localStorage.setItem(getUserStorageKey(STORAGE_KEYS.GOAL_CONFIGS), JSON.stringify(state.goalConfigs));
  renderGoals();
  renderOrigemDropdowns();

  if (state.currentUser && window.FirebaseService && window.FirebaseService.db) {
    const { db, doc, setDoc } = window.FirebaseService;
    try {
      const goalsRef = doc(db, 'users', state.currentUser.uid, 'config', 'goals');
      setDoc(goalsRef, { goalConfigs: state.goalConfigs, goals: state.goals }, { merge: true });
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
      const goalsRef = doc(db, 'users', state.currentUser.uid, 'config', 'goals');
      setDoc(goalsRef, { goalConfigs: state.goalConfigs, goals: state.goals }, { merge: true });
    } catch (err) {
      console.error('Erro ao sincronizar metas na nuvem:', err);
    }
  }
}

function loadLeads() {
  const data = localStorage.getItem(getUserStorageKey(STORAGE_KEYS.LEADS));
  if (data) {
    state.leads = JSON.parse(data);
  } else {
    state.leads = getDemoLeads();
    saveLeads();
  }
}

function saveLeads() {
  localStorage.setItem(getUserStorageKey(STORAGE_KEYS.LEADS), JSON.stringify(state.leads));
  renderFollowups();
  renderKanban();
  renderOrigemDropdowns();

  if (state.currentUser && window.FirebaseService && window.FirebaseService.db) {
    const { db, doc, setDoc } = window.FirebaseService;
    state.leads.forEach(async (lead) => {
      try {
        const leadRef = doc(db, 'users', state.currentUser.uid, 'leads', lead.id);
        await setDoc(leadRef, lead);
      } catch (err) {
        console.error('Erro ao salvar lead na nuvem:', err);
      }
    });
  }
}

// Demo leads for instant rich experience
function getDemoLeads() {
  const today = getTodayDateString();
  const pastDate = new Date();
  pastDate.setDate(pastDate.getDate() - 2);
  const pastStr = pastDate.toISOString().split('T')[0];

  const futureDate = new Date();
  futureDate.setDate(futureDate.getDate() + 3);
  const futureStr = futureDate.toISOString().split('T')[0];

  return [
    {
      id: 'lead-1',
      nome: 'Carlos Eduardo Oliveira',
      telefone: '(11) 98765-4321',
      origem: 'Instagram',
      status: 1,
      notas: 'Interessado em cota imobiliária de R$ 300k. Mandou mensagem no direct.',
      proximoContato: today,
      valorConsorcio: 300000
    },
    {
      id: 'lead-2',
      nome: 'Mariana Souza',
      telefone: '(21) 99123-4567',
      origem: 'LinkedIn',
      status: 2,
      notas: 'Empresária querendo renovar frota via consórcio de automóveis.',
      proximoContato: pastStr,
      valorConsorcio: 150000
    },
    {
      id: 'lead-3',
      nome: 'Fernando Mendes',
      telefone: '(31) 98888-7777',
      origem: 'Indicação',
      status: 3,
      notas: 'Simulação enviada de R$ 500k. Analisando capacidade de lance.',
      proximoContato: today,
      valorConsorcio: 500000
    },
    {
      id: 'lead-4',
      nome: 'Patricia Lima',
      telefone: '(11) 97654-3210',
      origem: 'WhatsApp',
      status: 4,
      notas: 'Apresentação realizada. Gostou do grupo com taxa reduzida.',
      proximoContato: futureStr,
      valorConsorcio: 200000
    },
    {
      id: 'lead-5',
      nome: 'Rodrigo Alves',
      telefone: '(41) 99911-2233',
      origem: 'Instagram',
      status: 6,
      notas: 'Pediu para retornar em alguns dias pois está aguardando fechar um contrato.',
      proximoContato: today,
      valorConsorcio: 400000
    },
    {
      id: 'lead-6',
      nome: 'Juliana Barbosa',
      telefone: '(19) 98112-3344',
      origem: 'Indicação',
      status: 7,
      notas: 'Venda Fechada! Cota de R$ 250k contemplada por lance livre.',
      proximoContato: futureStr,
      valorConsorcio: 250000
    }
  ];
}

function resetDemoData() {
  if (confirm('Deseja restaurar os dados de teste demonstrativos?')) {
    state.leads = getDemoLeads();
    saveLeads();
    showToast('Dados de teste restaurados!', 'success');
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

  const tabs = ['dashboard', 'kanban', 'reports', 'ranking', 'supervisor', 'manager', 'owner'];
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
function renderFollowups() {
  const container = document.getElementById('followups-container');
  const badgeNavCount = document.getElementById('badge-followups-count');
  const filterLabel = document.getElementById('followup-filter-label');
  const badgeTotalLeads = document.getElementById('badge-total-leads');

  if (badgeTotalLeads) badgeTotalLeads.textContent = state.leads.length;

  const todayStr = getTodayDateString();

  // Leads where proximoContato <= today AND not closed (or active)
  const pendingLeads = state.leads.filter(lead => {
    if (lead.status === 7) return false; // Excluir Venda Fechada dos followups
    return lead.proximoContato && lead.proximoContato <= todayStr;
  });

  // Sort: overdue first, then today
  pendingLeads.sort((a, b) => a.proximoContato.localeCompare(b.proximoContato));

  if (badgeNavCount) badgeNavCount.textContent = pendingLeads.length;

  if (filterLabel) {
    const overdueCount = pendingLeads.filter(l => l.proximoContato < todayStr).length;
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
    const isOverdue = lead.proximoContato < todayStr;
    const stageObj = KANBAN_STAGES.find(s => s.id === lead.status) || { name: 'Desconhecido' };
    const formattedDate = formatDateBR(lead.proximoContato);

    return `
      <div class="followup-card-item ${isOverdue ? 'overdue' : 'today'}">
        <div class="followup-header">
          <div class="lead-name-meta">
            <h4>${escapeHtml(lead.nome)}</h4>
            <span class="lead-phone">${escapeHtml(lead.telefone)}</span>
          </div>
          <div class="followup-badges">
            <span class="badge ${isOverdue ? 'badge-rose' : 'badge-warning'}">
              ${isOverdue ? '⚠️ Atrasado' : '📅 Hoje'} (${formattedDate})
            </span>
            <span class="badge badge-origem">${escapeHtml(lead.origem)}</span>
            <span class="badge badge-stage">${escapeHtml(stageObj.name)}</span>
          </div>
        </div>

        ${lead.notas ? `<div class="followup-notes">📝 ${escapeHtml(lead.notas)}</div>` : ''}

        <div class="followup-actions">
          <button class="btn btn-outline small" onclick="openLeadModal('${lead.id}')">
            <span>Editar Lead</span>
          </button>
          <button class="btn btn-warning small" onclick="openMandatoryModalForLead('${lead.id}')">
            <span>Reagendar</span>
          </button>
          <button class="btn btn-whatsapp small" onclick="openWhatsApp('${lead.telefone}', '${lead.nome}')">
            <span>Chamar WhatsApp</span>
          </button>
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

  // Filter leads based on search & origem
  const filteredLeads = state.leads.filter(lead => {
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

  // Render 7 Columns
  board.innerHTML = KANBAN_STAGES.map(stage => {
    const stageLeads = filteredLeads.filter(l => l.status === stage.id);
    
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

        <div class="column-cards">
          ${stageLeads.map(lead => {
            const isOverdue = lead.proximoContato && lead.proximoContato < todayStr;
            const isToday = lead.proximoContato && lead.proximoContato === todayStr;

            return `
              <div class="kanban-card" 
                   draggable="true" 
                   data-lead-id="${lead.id}"
                   ondragstart="handleDragStart(event, '${lead.id}')"
                   ondragend="handleDragEnd(event)"
                   onclick="openLeadModal('${lead.id}')">
                
                <div class="card-top">
                  <span class="lead-name">${escapeHtml(lead.nome)}</span>
                  <span class="origem-pill ${getOrigemPillClass(lead.origem)}">${escapeHtml(lead.origem)}</span>
                </div>

                ${lead.valorConsorcio ? `<div class="lead-value">${formatMoney(lead.valorConsorcio)}</div>` : ''}

                ${lead.notas ? `<div class="followup-notes" style="font-size: 0.78rem;">${escapeHtml(lead.notas)}</div>` : ''}

                <div class="card-footer">
                  <div class="next-contact-tag ${isOverdue ? 'overdue' : (isToday ? 'today' : '')}">
                    📅 ${formatDateBR(lead.proximoContato)}
                  </div>
                  <div class="card-actions-quick" onclick="event.stopPropagation()">
                    <button class="btn-icon" title="Abrir WhatsApp" onclick="openWhatsApp('${lead.telefone}', '${lead.nome}')">
                      💬
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
  e.target.classList.add('dragging');
  e.dataTransfer.setData('text/plain', leadId);
}

function handleDragEnd(e) {
  e.target.classList.remove('dragging');
  draggedLeadId = null;
}

function handleDragOver(e) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.add('drag-over');
}

function handleDragLeave(e) {
  const col = e.currentTarget;
  col.classList.remove('drag-over');
}

function handleDrop(e, targetStageId) {
  e.preventDefault();
  const col = e.currentTarget;
  col.classList.remove('drag-over');

  const leadId = e.dataTransfer.getData('text/plain') || draggedLeadId;
  if (!leadId) return;

  const lead = state.leads.find(l => l.id === leadId);
  if (!lead || lead.status === targetStageId) return;

  const currentStageId = lead.status;

  // CHECK AUTOMATION RULE:
  // Se for arrastado para 'Contato Captado' (1) ou 'Stand-by (Pensando)' (6), DISPARAR POP-UP OBRIGATÓRIO!
  if (targetStageId === 1 || targetStageId === 6) {
    state.pendingMove = {
      leadId: lead.id,
      targetStageId: targetStageId,
      previousStageId: currentStageId
    };
    showMandatoryDateModal(lead, targetStageId);
  } else {
    // Movimentação direta sem obrigatoriedade de popup
    lead.status = targetStageId;
    saveLeads();
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
    if (notesInput && notesInput.value.trim()) {
      lead.notas = notesInput.value.trim();
    }
    saveLeads();
    showToast(`Data atualizada para ${formatDateBR(newDate)}! Lead reaparecerá no Painel Diário.`, 'success');
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
  document.getElementById('form-lead').reset();

  // Set default date to today
  document.getElementById('lead-data').value = getTodayDateString();

  document.getElementById('modal-lead').classList.add('active');
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

  document.getElementById('modal-lead').classList.add('active');
}

function closeLeadModal() {
  document.getElementById('modal-lead').classList.remove('active');
}

function handleLeadSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('lead-id').value;
  const nome = document.getElementById('lead-nome').value.trim();
  const telefone = document.getElementById('lead-telefone').value.trim();
  const origem = document.getElementById('lead-origem').value;
  const status = parseInt(document.getElementById('lead-status').value, 10);
  const proximoContato = document.getElementById('lead-data').value;
  const valorConsorcio = Number(document.getElementById('lead-valor').value) || 0;
  const notas = document.getElementById('lead-notas').value.trim();

  // Check mandatory date rule if status is 1 or 6
  if ((status === 1 || status === 6) && !proximoContato) {
    alert('A data de próximo contato é OBRIGATÓRIA para Contato Captado e Stand-by!');
    return;
  }

  if (id) {
    // Edit existing
    const lead = state.leads.find(l => l.id === id);
    if (lead) {
      lead.nome = nome;
      lead.telefone = telefone;
      lead.origem = origem;
      lead.status = status;
      lead.proximoContato = proximoContato;
      lead.valorConsorcio = valorConsorcio;
      lead.notas = notas;
    }
    showToast(`Lead "${nome}" atualizado!`, 'success');
  } else {
    // Create new
    const newLead = {
      id: 'lead-' + Date.now(),
      nome,
      telefone,
      origem,
      status,
      proximoContato,
      valorConsorcio,
      notas
    };
    state.leads.push(newLead);
    showToast(`Novo lead "${nome}" cadastrado com sucesso!`, 'success');
  }

  saveLeads();
  closeLeadModal();
}

// ================= UTILITIES & HELPERS ================= //

function getStageName(stageId) {
  const s = KANBAN_STAGES.find(x => x.id === stageId);
  return s ? s.name : `Etapa ${stageId}`;
}

function openWhatsApp(phone, leadName) {
  const cleanNum = phone.replace(/\D/g, '');
  const finalNum = cleanNum.startsWith('55') ? cleanNum : `55${cleanNum}`;
  const text = encodeURIComponent(`Olá ${leadName}, tudo bem? Sou da consultoria de consórcios.`);
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

  onAuthStateChanged(auth, (user) => {
    state.currentUser = user;

    if (user) {
      localStorage.setItem('crm_consorcio_auth_logged', 'true');
      localStorage.setItem('crm_consorcio_auth_user', JSON.stringify({ email: user.email, name: user.displayName || user.email }));
      checkAuthGate();
      renderUserHeader();
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

async function handleGoogleSignIn() {
  if (typeof window.ensureFirebaseReady === 'function') {
    await window.ensureFirebaseReady();
  }
  
  const { auth, googleProvider, signInWithPopup } = window.FirebaseService || {};
  if (!auth) {
    alert('O serviço do Firebase ainda está conectando. Aguarde 2 segundos e clique novamente.');
    return;
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    if (result && result.user) {
      state.currentUser = result.user;
      localStorage.setItem('crm_consorcio_auth_logged', 'true');
      localStorage.setItem('crm_consorcio_auth_user', JSON.stringify({ email: result.user.email, name: result.user.displayName || result.user.email }));
      checkAuthGate();
    }
  } catch (error) {
    console.error('Erro ao entrar com Google:', error);
    if (error.code === 'auth/unauthorized-domain') {
      alert('Domínio não autorizado no Firebase!\n\nAcesse o Console do Firebase ➔ Authentication ➔ Settings ➔ Authorized Domains e adicione "crm-elite-pro.vercel.app".');
    } else {
      alert('Não foi possível concluir o login com o Google. (' + (error.message || error.code) + ')');
    }
  }
}

async function handleLogout() {
  if (confirm('Deseja realmente sair da sua conta e retornar à tela de login?')) {
    if (unsubscribeLeadsSnapshot) unsubscribeLeadsSnapshot();
    if (unsubscribeGoalsSnapshot) unsubscribeGoalsSnapshot();
    
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

// Sincronização em Nuvem Firestore (Leads & Metas)
function syncLeadsFromFirestore(userId) {
  const { db, collection, onSnapshot } = window.FirebaseService || {};
  if (!db) return;

  const leadsCol = collection(db, 'users', userId, 'leads');

  if (unsubscribeLeadsSnapshot) unsubscribeLeadsSnapshot();

  unsubscribeLeadsSnapshot = onSnapshot(leadsCol, (snapshot) => {
    const cloudLeads = [];
    snapshot.forEach(docSnap => {
      cloudLeads.push({ id: docSnap.id, ...docSnap.data() });
    });

    state.leads = cloudLeads;
    localStorage.setItem(getUserStorageKey(STORAGE_KEYS.LEADS), JSON.stringify(state.leads));
    renderFollowups();
    renderKanban();
    renderOrigemDropdowns();
  }, (err) => {
    console.warn('Erro ao escutar Firestore Leads:', err);
  });
}

function syncGoalsFromFirestore(userId) {
  const { db, doc, onSnapshot } = window.FirebaseService || {};
  if (!db) return;

  const goalsDoc = doc(db, 'users', userId, 'config', 'goals');

  if (unsubscribeGoalsSnapshot) unsubscribeGoalsSnapshot();

  unsubscribeGoalsSnapshot = onSnapshot(goalsDoc, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      if (data.goalConfigs) state.goalConfigs = data.goalConfigs;
      if (data.goals) state.goals = data.goals;
      localStorage.setItem(getUserStorageKey(STORAGE_KEYS.GOALS), JSON.stringify(state.goals));
      localStorage.setItem(getUserStorageKey(STORAGE_KEYS.GOAL_CONFIGS), JSON.stringify(state.goalConfigs));
      renderGoals();
      renderOrigemDropdowns();
    }
  }, (err) => {
    console.warn('Erro ao escutar Firestore Goals:', err);
  });
}

// ================= HIERARCHY & DRILL-DOWN LOGIC ================= //

function changeRole(role) {
  state.currentRole = role;
  updateRoleUI();

  // Abrir automaticamente a aba principal do perfil selecionado
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
  const role = state.currentRole;
  const tabSupervisor = document.getElementById('tab-supervisor');
  const tabManager = document.getElementById('tab-manager');
  const tabOwner = document.getElementById('tab-owner');

  if (tabSupervisor) tabSupervisor.style.display = (role === 'supervisor' || role === 'manager' || role === 'owner') ? 'inline-flex' : 'none';
  if (tabManager) tabManager.style.display = (role === 'manager' || role === 'owner') ? 'inline-flex' : 'none';
  if (tabOwner) tabOwner.style.display = (role === 'owner') ? 'inline-flex' : 'none';

  updateRankingPermissionsUI();
}

// Inspeção de Consultor Individual (Drill-Down)
function inspectConsultant(consultantName, consultantId) {
  state.inspectingConsultant = { name: consultantName, id: consultantId };

  const banner = document.getElementById('inspection-banner');
  const nameEl = document.getElementById('inspect-consultant-name');

  if (nameEl) nameEl.textContent = consultantName;
  if (banner) banner.style.display = 'flex';

  showToast(`👁️ Modo de inspeção ativo: Visualizando CRM de ${consultantName}`, 'info');
  switchTab('dashboard');
}

function exitInspectionMode() {
  state.inspectingConsultant = null;
  const banner = document.getElementById('inspection-banner');
  if (banner) banner.style.display = 'none';

  showToast('Restaurado ao seu painel pessoal.', 'info');
  switchTab('dashboard');
}

// Renderização dos Painéis da Hierarquia
function renderSupervisorView() {
  const tbody = document.getElementById('supervisor-team-tbody');
  if (!tbody) return;

  const teamConsultants = [
    { id: 'c1', name: 'Lucas Silva', done: 28, target: 30, pct: 93, leads: 8, sales: 'R$ 450.000', status: '⚡ Em Alta', class: 'emerald' },
    { id: 'c2', name: 'Mariana Santos', done: 25, target: 30, pct: 83, leads: 12, sales: 'R$ 520.000', status: '⚡ Ativa', class: 'emerald' },
    { id: 'c3', name: 'Rafael Oliveira', done: 18, target: 30, pct: 60, leads: 6, sales: 'R$ 320.000', status: '⚠️ Meta Pendente', class: 'amber' },
    { id: 'c4', name: 'Beatriz Lima', done: 30, target: 30, pct: 100, leads: 9, sales: 'R$ 380.000', status: '🔥 Meta Concluída', class: 'emerald' },
    { id: 'c5', name: 'Felipe Costa', done: 27, target: 30, pct: 90, leads: 7, sales: 'R$ 180.000', status: '⚡ Ativo', class: 'emerald' }
  ];

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

  const teams = [
    { name: 'Equipe Alpha', supervisor: 'Carlos Eduardo', members: 5, targetPct: 85, sales: 'R$ 1.850.000', conversion: '34.2%', highlight: true },
    { name: 'Equipe Beta', supervisor: 'Ana Paula', members: 5, targetPct: 78, sales: 'R$ 1.540.000', conversion: '31.0%', highlight: false },
    { name: 'Equipe Gamma', supervisor: 'Marcos Vinícius', members: 5, targetPct: 72, sales: 'R$ 1.230.000', conversion: '29.5%', highlight: false }
  ];

  container.innerHTML = teams.map((t, idx) => `
    <div style="background: var(--bg-card); border: 1px solid ${t.highlight ? 'var(--primary)' : 'var(--border-color)'}; border-radius: 10px; padding: 1.25rem; display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap;">
      <div style="display: flex; align-items: center; gap: 1rem;">
        <div style="width: 44px; height: 44px; border-radius: 50%; background: rgba(59,130,246,0.15); color: var(--primary); display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 1.1rem;">
          #${idx + 1}
        </div>
        <div>
          <h4 style="font-size: 1.05rem; font-weight: 700; margin: 0;">${escapeHtml(t.name)} ${t.highlight ? '🏆' : ''}</h4>
          <span style="font-size: 0.8rem; color: var(--text-muted);">Supervisor: ${escapeHtml(t.supervisor)} | ${t.members} Consultores</span>
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
    const origensROI = [
      { canal: 'Instagram Direct / Ads', leads: 142, vendas: 28, volume: 'R$ 3.850.000', conv: '19.7%', roi: '480%' },
      { canal: 'Facebook Ads', leads: 110, vendas: 18, volume: 'R$ 2.420.000', conv: '16.3%', roi: '360%' },
      { canal: 'Indicação de Clientes', leads: 45, vendas: 16, volume: 'R$ 2.150.000', conv: '35.5%', roi: '950%' },
      { canal: 'WhatsApp Direto', leads: 88, vendas: 12, volume: 'R$ 1.120.000', conv: '13.6%', roi: '290%' },
      { canal: 'Google Ads', leads: 35, vendas: 4, volume: 'R$ 300.000', conv: '11.4%', roi: '180%' }
    ];

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

  if (usersContainer) {
    const rolesSummary = [
      { role: '👑 Licenciado / Proprietário', count: 1, names: 'Gabriel Medeiros (Dono da Loja)' },
      { role: '💼 Gestores Comerciais', count: 1, names: 'Roberto Mendes' },
      { role: '👔 Supervisores de Vendas', count: 3, names: 'Carlos Eduardo (Alpha), Ana Paula (Beta), Marcos Vinícius (Gamma)' },
      { role: '👤 Consultores de Vendas', count: 15, names: 'Lucas Silva, Mariana Santos, Rafael Oliveira, Beatriz Lima, Felipe Costa...' }
    ];

    usersContainer.innerHTML = rolesSummary.map(u => `
      <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--border-color); border-radius: 8px; padding: 1rem; margin-bottom: 0.75rem; display: flex; align-items: center; justify-content: space-between;">
        <div>
          <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: var(--text-main);">${escapeHtml(u.role)}</h4>
          <span style="font-size: 0.8rem; color: var(--text-muted);">${escapeHtml(u.names)}</span>
        </div>
        <span class="badge primary" style="font-size: 0.85rem; font-weight: 700; padding: 4px 12px;">${u.count} Ativo(s)</span>
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

function renderReportsView() {
  const origemFilter = document.getElementById('report-filter-origem')?.value || 'todos';
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
      tableData[orig] = { prospections: cfg.target * 30, leads: 0, reunioes: 0, vendas: 0, revenue: 0 };
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

const MOCK_RANKING_CONSULTANTS = [
  { rank: 1, name: 'Eliana & Caique', team: 'Summit', photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80', revenueMonth: 3560000, revenueQuarter: 9800000 },
  { rank: 2, name: 'Sol & Emerson', team: 'Martins PG', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80', revenueMonth: 2340000, revenueQuarter: 7200000 },
  { rank: 3, name: 'Taila', team: 'Maesta', photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80', revenueMonth: 2195000, revenueQuarter: 6500000 },
  { rank: 4, name: 'Gabriela E Tiago', team: 'Jezreel', photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80', revenueMonth: 2170000, revenueQuarter: 5900000 },
  { rank: 5, name: 'Vitoria E Bruno', team: "Pickler's", photo: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=120&q=80', revenueMonth: 2046204.04, revenueQuarter: 5400000 },
  { rank: 6, name: 'Gustavo M', team: 'Braves', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80', revenueMonth: 2025000, revenueQuarter: 5100000 },
  { rank: 7, name: 'Tiago Ferreira', team: "Pickler's", photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=120&q=80', revenueMonth: 1720000, revenueQuarter: 4800000 },
  { rank: 8, name: 'Vanessa E Renan', team: 'Guebers', photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80', revenueMonth: 1440736, revenueQuarter: 4200000 },
  { rank: 9, name: 'Michele', team: 'Braves', photo: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=120&q=80', revenueMonth: 1410000, revenueQuarter: 3900000 },
  { rank: 10, name: 'Francieli Giare', team: 'Gabardo', photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=120&q=80', revenueMonth: 1300000, revenueQuarter: 3600000 },
  { rank: 11, name: 'Rosiane Oliveira', team: "Pickler's", photo: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=120&q=80', revenueMonth: 1216000, revenueQuarter: 3400000 },
  { rank: 12, name: 'Mahye E Paulo', team: 'Braves', photo: 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=120&q=80', revenueMonth: 1200000, revenueQuarter: 3200000 },
  { rank: 13, name: 'Arthur Vinicius', team: 'Guebers', photo: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=120&q=80', revenueMonth: 1200000, revenueQuarter: 3100000 },
  { rank: 14, name: 'Andreje', team: 'Ribeirão Preto', photo: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=120&q=80', revenueMonth: 1200000, revenueQuarter: 3000000 },
  { rank: 15, name: 'Piri & Alanna', team: 'Invictus', photo: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&q=80', revenueMonth: 1120000, revenueQuarter: 2900000 },
  { rank: 16, name: 'Sandra Peleg', team: 'Gabardo', photo: 'https://images.unsplash.com/photo-1573497019940-1c28c88b4f3e?auto=format&fit=crop&w=120&q=80', revenueMonth: 1080000, revenueQuarter: 2800000 },
  { rank: 17, name: 'Neildo', team: 'Olimpo', photo: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=120&q=80', revenueMonth: 1040000, revenueQuarter: 2700000 },
  { rank: 18, name: 'Gabi E Brian', team: 'Jezreel', photo: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=120&q=80', revenueMonth: 1020000, revenueQuarter: 2600000 },
  { rank: 19, name: 'Maria & Patrick', team: 'Olimpo', photo: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=120&q=80', revenueMonth: 1000000, revenueQuarter: 2500000 },
  { rank: 20, name: 'Italo', team: 'Ribeirão Preto', photo: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=120&q=80', revenueMonth: 1000000, revenueQuarter: 2400000 },
  { rank: 21, name: 'Bruna', team: 'Ribeirão Preto', photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=120&q=80', revenueMonth: 968000, revenueQuarter: 2300000 },
  { rank: 22, name: 'Regina', team: 'Ribeirão Preto', photo: 'https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=120&q=80', revenueMonth: 950870, revenueQuarter: 2200000 },
  { rank: 23, name: 'Cauê Costa', team: 'Summit', photo: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?auto=format&fit=crop&w=120&q=80', revenueMonth: 940000, revenueQuarter: 2100000 },
  { rank: 24, name: 'Brenda', team: "Pickler's", photo: 'https://images.unsplash.com/photo-1567532939604-b6b5b0db2604?auto=format&fit=crop&w=120&q=80', revenueMonth: 895000, revenueQuarter: 2000000 }
];

const MOCK_RANKING_TEAMS = [
  { rank: 1, name: 'RIBEIRÃO PRETO', totalRevenue: 11023696.55, members: 22 },
  { rank: 2, name: "PICKLER'S", totalRevenue: 11012690.04, members: 31 },
  { rank: 3, name: 'BRAVES', totalRevenue: 10497039.17, members: 18 },
  { rank: 4, name: 'MARTINS PG', totalRevenue: 6787928.00, members: 14 },
  { rank: 5, name: 'SUMMIT', totalRevenue: 5420000.00, members: 10 },
  { rank: 6, name: 'OLIMPO', totalRevenue: 4980000.00, members: 12 }
];

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
      // Alternar entre 'month' e 'teams' (ou 'quarter' se for owner)
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
  // Se tentar acessar 'quarter' sem ser owner, força 'month'
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
    if (mode === 'month') titleEl.textContent = '🏆 Ranking de Vendas - Agosto/2026 (Mensal)';
    else if (mode === 'quarter') titleEl.textContent = '🏆 Ranking de Vendas - 3º Trimestre/2026';
    else if (mode === 'teams') titleEl.textContent = '🏆 Ranking de Equipes da Loja - Agosto/2026';
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

    contentArea.innerHTML = `
      <div class="team-rank-list">
        ${MOCK_RANKING_TEAMS.map(t => {
          const avatarCount = Math.min(16, t.members);
          let avatarsHtml = '';
          for (let i = 0; i < avatarCount; i++) {
            const avatarUrl = MOCK_RANKING_CONSULTANTS[i % MOCK_RANKING_CONSULTANTS.length].photo;
            avatarsHtml += `<div class="avatar-cluster-item"><img src="${avatarUrl}" alt="Membro"></div>`;
          }
          return `
            <div class="team-rank-row">
              <div class="team-rank-pos">${t.rank}</div>
              <div class="team-name-title">
                <h3>${escapeHtml(t.name)}</h3>
              </div>
              <div class="avatar-cluster">
                ${avatarsHtml}
              </div>
              <div class="team-revenue-badge">
                R$ ${t.totalRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } else {
    podiumContainer.style.display = 'flex';

    const sorted = [...MOCK_RANKING_CONSULTANTS].sort((a, b) => {
      const valA = (rankingMode === 'quarter') ? a.revenueQuarter : a.revenueMonth;
      const valB = (rankingMode === 'quarter') ? b.revenueQuarter : b.revenueMonth;
      return valB - valA;
    });

    const first = sorted[0];
    const second = sorted[1];
    const third = sorted[2];

    const getRev = (item) => (rankingMode === 'quarter' ? item.revenueQuarter : item.revenueMonth);

    podiumContainer.innerHTML = `
      <!-- 2º Lugar -->
      <div class="podium-card second">
        <div class="podium-badge-icon silver">2º</div>
        <div class="podium-avatar-wrap">
          <img src="${second.photo}" alt="${escapeHtml(second.name)}">
        </div>
        <div class="podium-name">${escapeHtml(second.name)}</div>
        <div class="podium-team">${escapeHtml(second.team)}</div>
        <div class="podium-revenue">R$ ${getRev(second).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      </div>

      <!-- 1º Lugar -->
      <div class="podium-card first">
        <div style="font-size: 1.5rem; margin-bottom: -0.25rem;">👑</div>
        <div class="podium-badge-icon gold">1º</div>
        <div class="podium-avatar-wrap">
          <img src="${first.photo}" alt="${escapeHtml(first.name)}">
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
        <div class="podium-avatar-wrap">
          <img src="${third.photo}" alt="${escapeHtml(third.name)}">
        </div>
        <div class="podium-name">${escapeHtml(third.name)}</div>
        <div class="podium-team">${escapeHtml(third.team)}</div>
        <div class="podium-revenue">R$ ${getRev(third).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}</div>
      </div>
    `;

    const remaining = sorted.slice(3);
    contentArea.innerHTML = `
      <div class="consultants-rank-grid">
        ${remaining.map((item, idx) => `
          <div class="rank-card-item">
            <div class="rank-number-badge">${idx + 4}</div>
            <div class="rank-avatar">
              <img src="${item.photo}" alt="${escapeHtml(item.name)}">
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
