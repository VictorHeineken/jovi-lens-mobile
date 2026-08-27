import { useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { isDemoMode } from '../services/imageAnalysis.js';

const DEMO_USER = {
  id: 'demo-student',
  name: 'Ana Beatriz',
  email: 'ana.beatriz@demo.jovi',
  picture: '',
};

export default function Profile() {
  const { user, setUser, plan, setPlan } = useAppData();
  const [authMessage, setAuthMessage] = useState('');
  const demoMode = isDemoMode();

  const trialActive = plan.type === 'trial' && new Date(plan.endsAt) > new Date();
  const daysLeft = trialActive ? Math.max(1, Math.ceil((new Date(plan.endsAt) - new Date()) / 86400000)) : 0;

  function enterDemoAccount() {
    setUser(DEMO_USER);
    setAuthMessage('Conta de demonstração ativada. Nenhum login real foi realizado.');
  }

  function leaveDemoAccount() {
    setUser(null);
    setAuthMessage('Você saiu da conta de demonstração.');
  }

  function activateCopilot() {
    if (!user) setUser(DEMO_USER);
    setPlan({ type: 'pro', demo: true, activatedAt: new Date().toISOString() });
    setAuthMessage('Acesso de demonstração ao Copilot ativado. Nenhuma cobrança foi feita.');
  }

  function startTrial() {
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 7 * 86400000);
    if (!user) setUser(DEMO_USER);
    setPlan({ type: 'trial', demo: true, startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString() });
    setAuthMessage('Teste de 7 dias ativado para a apresentação. Nenhuma cobrança foi feita.');
  }

  const planTitle = trialActive
    ? `${daysLeft} dias de teste restantes`
    : plan.type === 'pro'
      ? 'Copilot liberado'
      : 'Estude com mais profundidade';

  return (
    <main className="light-page profile-page">
      <header className="mobile-header">
        <div><div className="eyebrow"><Icon name="user" size={13} /> Seu espaço</div><h1>Perfil</h1></div>
      </header>

      <section className="profile-card">
        <div className="avatar placeholder"><span>{user ? 'AB' : <Icon name="user" size={19} />}</span></div>
        <div className="profile-copy">
          <strong>{user ? user.name : 'Conta de demonstração'}</strong>
          <span>{user ? user.email : 'Entre para testar o Copilot da JOVI'}</span>
        </div>
        {user && <button className="text-button" onClick={leaveDemoAccount}>Sair</button>}
      </section>

      {!user && <section className="demo-auth-card">
        <div className="demo-card-top"><span className="plan-label">Fluxo de apresentação</span><span className="demo-badge">DEMO · SEM LOGIN REAL</span></div>
        <h2>Entre para continuar sua trilha</h2>
        <p>Este botão representa um futuro login da conta JOVI. Nesta proposta, tudo acontece localmente para você apresentar o produto sem depender de cadastro externo.</p>
        <button className="primary-wide demo-login-button" onClick={enterDemoAccount}><Icon name="user" size={16} /> Entrar como estudante</button>
      </section>}

      <section className="plan-card">
        <div className="plan-top">
          <div><span className="plan-label">JOVI Copilot</span><h2>{planTitle}</h2></div>
          <div className="plan-icon"><Icon name="crown" size={24} /></div>
        </div>
        <div className="plan-benefits">
          <div><Icon name="check" size={15} /> Análises inteligentes de conteúdo</div>
          <div><Icon name="check" size={15} /> Trilha Entender · Resolver · Praticar</div>
          <div><Icon name="check" size={15} /> Histórico e notas para revisão</div>
        </div>
        {!trialActive && plan.type !== 'pro' && <button className="primary-wide" onClick={startTrial}>Testar por 7 dias · Demo</button>}
        {plan.type !== 'pro' && <button className="secondary-wide" onClick={activateCopilot}>Ativar acesso Copilot · Demo</button>}
        {plan.type === 'pro' && <div className="demo-active-state"><Icon name="check" size={15} /> Acesso demonstrativo ativo</div>}
        <small>Exemplo de apresentação: não há cobrança, assinatura ou login externo neste fluxo.</small>
      </section>

      <section className="settings-card">
        <div><span>Inteligência</span><strong>{demoMode ? 'Modo demonstração' : 'Azure OpenAI'}</strong></div>
        <div><span>Conta</span><strong>Perfil local de estudante</strong></div>
        <div><span>Cobrança</span><strong>Não configurada</strong></div>
      </section>
      {authMessage && <div className="inline-message" role="status"><Icon name="info" size={15} /> {authMessage}</div>}
    </main>
  );
}
