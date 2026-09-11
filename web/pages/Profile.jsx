import { useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { isDemoMode } from '../services/imageAnalysis.js';
import { createBackup, downloadBackup, readBackupFile } from '../services/dataTransfer.js';

const DEMO_USER = {
  id: 'demo-student',
  name: 'Ana Beatriz',
  email: 'ana.beatriz@demo.jovi',
  picture: '',
};

export default function Profile() {
  const { user, setUser, plan, setPlan, records, notes, aiHistory, subjectArtifacts, learningPreferences, setLearningPreferences, restoreLocalData, clearLocalData } = useAppData();
  const [authMessage, setAuthMessage] = useState('');
  const fileRef = useRef(null);
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

  function exportData() {
    downloadBackup(createBackup({ records, notes, aiHistory, plan, user, subjectArtifacts, learningPreferences }));
    setAuthMessage('Backup dos seus estudos exportado para este dispositivo.');
  }

  function updateLearningPreference(key, value) {
    setLearningPreferences({ ...learningPreferences, [key]: value });
    setAuthMessage('Preferências de aprendizagem atualizadas.');
  }

  async function importData(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    try {
      const backup = await readBackupFile(file);
      const confirmed = window.confirm('Importar este backup vai substituir suas notas, histórico e preferências locais. As mídias serão mescladas. Continuar?');
      if (!confirmed) return;
      const result = await restoreLocalData(backup);
      setAuthMessage(`Backup restaurado: ${result.notes} notas e ${result.records} mídias.`);
    } catch (error) {
      setAuthMessage(error.message || 'Não foi possível restaurar esse backup.');
    }
  }

  async function clearData() {
    const confirmed = window.confirm('Apagar fotos, notas, histórico e preferências locais? Os exemplos da demonstração serão mantidos.');
    if (!confirmed) return;
    await clearLocalData();
    setAuthMessage('Dados locais removidos. Os exemplos da demonstração foram mantidos.');
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
      <section className="learning-preferences-card">
        <div className="learning-preferences-heading"><div><strong>Seu jeito de aprender</strong><span>Usamos essas escolhas para encontrar aulas mais adequadas no YouTube.</span></div><Icon name="sparkle" size={18} /></div>
        <label>Estilo da aula<select value={learningPreferences.videoStyle} onChange={(event) => updateLearningPreference('videoStyle', event.target.value)}><option value="animated">Animada e visual</option><option value="balanced">Equilibrada</option><option value="calm">Calma e detalhada</option><option value="exam">Focada em exercícios</option></select></label>
        <label>Duração preferida<select value={learningPreferences.duration} onChange={(event) => updateLearningPreference('duration', event.target.value)}><option value="short">Curta · até 15 min</option><option value="standard">Média · 15 a 40 min</option><option value="long">Aprofundada · mais de 40 min</option></select></label>
        <label>Nível atual<select value={learningPreferences.level} onChange={(event) => updateLearningPreference('level', event.target.value)}><option value="beginner">Estou começando</option><option value="intermediate">Já tenho base</option><option value="advanced">Quero aprofundar</option></select></label>
        <label>Critério de busca<select value={learningPreferences.sort} onChange={(event) => updateLearningPreference('sort', event.target.value)}><option value="relevance">Melhor combinação</option><option value="viewCount">Mais populares</option><option value="date">Mais recentes</option></select></label>
      </section>
      <section className="data-tools-card">
        <div><div><strong>Seus dados</strong><span>Faça uma cópia local ou restaure um backup anterior.</span></div><Icon name="download" size={18} /></div>
        <div className="data-tools-actions"><button onClick={exportData}><Icon name="download" size={14} /> Exportar backup</button><button onClick={() => fileRef.current?.click()}><Icon name="upload" size={14} /> Importar backup</button></div>
        <small>O arquivo fica no seu dispositivo. A importação mescla mídias pelo identificador e substitui notas, histórico e preferências locais.</small>
      </section>
      <section className="privacy-card">
        <div><div><strong>Privacidade local</strong><span>Remova o conteúdo criado neste aparelho quando quiser.</span></div><Icon name="lock" size={18} /></div>
        <button onClick={clearData}><Icon name="trash" size={14} /> Limpar dados locais</button>
        <small>Essa ação apaga fotos, notas, histórico, plano demonstrativo e artefatos do Estúdio deste navegador. Ela não remove os exemplos do app.</small>
      </section>
      <input ref={fileRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={importData} />
      {authMessage && <div className="inline-message" role="status"><Icon name="info" size={15} /> {authMessage}</div>}
    </main>
  );
}
