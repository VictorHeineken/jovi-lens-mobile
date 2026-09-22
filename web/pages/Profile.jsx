import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import StudentDashboard from '../components/StudentDashboard.jsx';
import { useAppData } from '../context/AppDataContext.jsx';
import { createBackup, downloadBackup, readBackupFile } from '../services/dataTransfer.js';
import { isGoogleSignInConfigured, renderGoogleSignInButton, signOutGoogle } from '../services/googleAuth.js';
import { createDemoOutlookCalendar, daysUntilEvent, EMPTY_STUDY_CALENDAR, formatEventDate } from '../../shared/studyCalendar.js';

const DEMO_USER = {
  id: 'demo-student',
  name: 'Ana Beatriz',
  email: 'ana.beatriz@demo.jovi',
  picture: '',
};

const STUDY_GOAL_OPTIONS = [
  { value: 'vestibular', label: 'Vestibular' },
  { value: 'enem', label: 'ENEM' },
  { value: 'school_exam', label: 'Prova da escola' },
  { value: 'general', label: 'Revisão geral' },
];
const STUDY_CONTEXT_OPTIONS = [
  { value: 'classes', label: 'Acompanhar aulas' },
  { value: 'exam_season', label: 'Período de provas' },
  { value: 'catch_up', label: 'Recuperar atrasos' },
  { value: 'maintenance', label: 'Manter revisão' },
];
const WEEKLY_PACE_OPTIONS = [
  { value: 'light', label: 'Leve · 15 min/dia' },
  { value: 'regular', label: 'Regular · 30 min/dia' },
  { value: 'intense', label: 'Intensivo · 60 min/dia' },
];
const PRACTICE_MODE_OPTIONS = [
  { value: 'concept_first', label: 'Entender primeiro' },
  { value: 'questions_first', label: 'Questões primeiro' },
  { value: 'mixed', label: 'Misto' },
];
const REVIEW_METHOD_OPTIONS = [
  { value: 'spaced', label: 'Revisão espaçada' },
  { value: 'retrieval', label: 'Teste ativo' },
  { value: 'interleaved', label: 'Misturar temas' },
  { value: 'flashcards', label: 'Flashcards' },
];
const VIDEO_STYLE_OPTIONS = [
  { value: 'animated', label: 'Animada e visual' },
  { value: 'balanced', label: 'Equilibrada' },
  { value: 'calm', label: 'Calma e detalhada' },
  { value: 'exam', label: 'Focada em exercícios' },
];
const DURATION_OPTIONS = [
  { value: 'short', label: 'Curta · até 15 min' },
  { value: 'standard', label: 'Média · 15 a 40 min' },
  { value: 'long', label: 'Aprofundada · mais de 40 min' },
];
const LEVEL_OPTIONS = [
  { value: 'beginner', label: 'Estou começando' },
  { value: 'intermediate', label: 'Já tenho base' },
  { value: 'advanced', label: 'Quero aprofundar' },
];
const SORT_OPTIONS = [
  { value: 'relevance', label: 'Melhor combinação' },
  { value: 'viewCount', label: 'Mais populares' },
  { value: 'date', label: 'Mais recentes' },
];

export default function Profile({ embedded = false }) {
  const { user, setUser, plan, setPlan, records, notes, aiHistory, subjects, subjectArtifacts, learningPreferences, setLearningPreferences, studyCalendar, setStudyCalendar, restoreLocalData, clearLocalData } = useAppData();
  const [authMessage, setAuthMessage] = useState('');
  const fileRef = useRef(null);
  const googleButtonRef = useRef(null);

  const trialActive = plan.type === 'trial' && new Date(plan.endsAt) > new Date();
  const daysLeft = trialActive ? Math.max(1, Math.ceil((new Date(plan.endsAt) - new Date()) / 86400000)) : 0;

  useEffect(() => {
    if (user || !isGoogleSignInConfigured()) return;
    renderGoogleSignInButton(googleButtonRef.current, ({ user: googleUser, error }) => {
      if (error) setAuthMessage(error);
      else {
        setUser(googleUser);
        setAuthMessage('Login com Google realizado.');
      }
    });
  }, [user, setUser]);

  function enterDemoAccount() {
    setUser(DEMO_USER);
    setAuthMessage('Conta de demonstração ativada. Nenhum login real foi realizado.');
  }

  function leaveDemoAccount() {
    signOutGoogle();
    setUser(null);
    setAuthMessage('Você saiu da conta.');
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
    downloadBackup(createBackup({ records, notes, aiHistory, plan, user, subjectArtifacts, learningPreferences, studyCalendar }));
    setAuthMessage('Backup dos seus estudos exportado para este dispositivo.');
  }

  function updateLearningPreference(key, value) {
    setLearningPreferences({ ...learningPreferences, [key]: value });
    setAuthMessage('Preferências de aprendizagem atualizadas.');
  }

  function connectOutlookDemo() {
    setStudyCalendar(createDemoOutlookCalendar());
    setAuthMessage('Outlook conectado em modo demo. As provas detectadas já entram no plano de estudo.');
  }

  function preparePresentationDemo() {
    setUser(DEMO_USER);
    setPlan({ type: 'pro', demo: true, presentationMode: true, activatedAt: new Date().toISOString() });
    setStudyCalendar(createDemoOutlookCalendar());
    setAuthMessage('Modo apresentação pronto: estudante demo, História e provas do Outlook já estão preparados.');
  }

  function disconnectOutlookDemo() {
    setStudyCalendar(EMPTY_STUDY_CALENDAR);
    setAuthMessage('Calendário desconectado.');
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

  const Container = embedded ? 'section' : 'main';
  const containerClassName = embedded ? 'profile-page origin-profile-view' : 'light-page profile-page';

  return (
    <Container className={containerClassName}>
      {!embedded && (
        <header className="mobile-header">
          <div><div className="eyebrow"><Icon name="user" size={13} /> Seu espaço</div><h1>Perfil</h1></div>
        </header>
      )}

      <section className="profile-card">
        <div className="avatar placeholder"><span>{user ? 'AB' : <Icon name="user" size={19} />}</span></div>
        <div className="profile-copy">
          <strong>{user ? user.name : 'Conta de demonstração'}</strong>
          <span>{user ? user.email : 'Entre para testar o Copilot da JOVI'}</span>
        </div>
        {user && <button className="text-button" onClick={leaveDemoAccount}>Sair</button>}
      </section>

      {!user && isGoogleSignInConfigured() && <section className="google-signin-card">
        <h2>Entrar com sua conta Google</h2>
        <p>Sua cota de uso da IA passa a ser controlada pela sua conta em vez do seu endereço na rede.</p>
        <div className="google-button-slot" ref={googleButtonRef} />
      </section>}

      {!user && <section className="demo-auth-card">
        <div className="demo-card-top"><span className="plan-label">Fluxo de apresentação</span><span className="demo-badge">DEMO · SEM LOGIN REAL</span></div>
        <h2>Entre para continuar sua trilha</h2>
        <p>Este botão representa um futuro login da conta JOVI. Nesta proposta, tudo acontece localmente para você apresentar o produto sem depender de cadastro externo.</p>
        <button className="primary-wide demo-login-button" onClick={enterDemoAccount}><Icon name="user" size={16} /> Entrar como estudante</button>
      </section>}

      <section className="presentation-mode-card">
        <div>
          <span className="plan-label">Modo apresentação</span>
          <h2>Demo pronta em um toque</h2>
          <p>Ativa a aluna demo, libera o Copilot e conecta as provas do Outlook para mostrar o fluxo completo sem criar nada na hora.</p>
        </div>
        <button onClick={preparePresentationDemo}><Icon name="sparkle" size={16} /> Preparar demo</button>
      </section>

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

      <section className="learning-preferences-card">
        <div className="learning-preferences-heading"><div><strong>Seu plano de estudo</strong><span>Usamos essas escolhas nas perguntas, simulados, podcasts, planos e recomendações de vídeo.</span></div><Icon name="sparkle" size={18} /></div>
        <div className="learning-preferences-summary" aria-label="Personalização aplicada">
          <span>Perguntas alinhadas</span>
          <span>Simulado no foco</span>
          <span>Vídeos no seu foco</span>
        </div>
        <div className="learning-preferences-grid">
          <PreferenceSelect label="Objetivo principal" options={STUDY_GOAL_OPTIONS} value={learningPreferences.studyGoal} onChange={(value) => updateLearningPreference('studyGoal', value)} />
          <PreferenceSelect label="Estratégia geral" options={STUDY_CONTEXT_OPTIONS} value={learningPreferences.studyContext} onChange={(value) => updateLearningPreference('studyContext', value)} />
          <PreferenceSelect label="Ritmo de estudo" options={WEEKLY_PACE_OPTIONS} value={learningPreferences.weeklyPace} onChange={(value) => updateLearningPreference('weeklyPace', value)} />
          <PreferenceSelect label="Como praticar" options={PRACTICE_MODE_OPTIONS} value={learningPreferences.practiceMode} onChange={(value) => updateLearningPreference('practiceMode', value)} />
          <PreferenceSelect label="Revisão preferida" options={REVIEW_METHOD_OPTIONS} value={learningPreferences.reviewMethod} onChange={(value) => updateLearningPreference('reviewMethod', value)} />
          <PreferenceSelect label="Estilo da aula" options={VIDEO_STYLE_OPTIONS} value={learningPreferences.videoStyle} onChange={(value) => updateLearningPreference('videoStyle', value)} />
          <PreferenceSelect label="Duração preferida" options={DURATION_OPTIONS} value={learningPreferences.duration} onChange={(value) => updateLearningPreference('duration', value)} />
          <PreferenceSelect label="Nível atual" options={LEVEL_OPTIONS} value={learningPreferences.level} onChange={(value) => updateLearningPreference('level', value)} />
          <PreferenceSelect label="Critério de busca" options={SORT_OPTIONS} value={learningPreferences.sort} onChange={(value) => updateLearningPreference('sort', value)} />
        </div>
      </section>
      <section className={`outlook-card${studyCalendar.connected ? ' connected' : ''}`}>
        <div className="outlook-card-head">
          <div><strong>Calendário de provas</strong><span>Use o Outlook para ajustar o plano por matéria com datas reais.</span></div>
          <Icon name="calendar" size={18} />
        </div>
        {studyCalendar.connected ? (
          <>
            <div className="outlook-status"><span>Outlook conectado</span><b>{studyCalendar.account}</b></div>
            <div className="outlook-events">
              {studyCalendar.events.slice(0, 3).map((event) => (
                <div className="outlook-event" key={event.id}>
                  <span>{event.subject}</span>
                  <strong>{event.title}</strong>
                  <small>{formatEventDate(event)} · em {daysUntilEvent(event)} dias</small>
                </div>
              ))}
            </div>
            <div className="outlook-actions">
              <button onClick={connectOutlookDemo}><Icon name="rotate" size={14} /> Atualizar provas</button>
              <button onClick={disconnectOutlookDemo}><Icon name="close" size={14} /> Desconectar</button>
            </div>
          </>
        ) : (
          <>
            <p>Ao conectar, o JOVI detecta eventos de prova e muda a prioridade do plano automaticamente.</p>
            <button className="primary-wide" onClick={connectOutlookDemo}><Icon name="calendar" size={16} /> Conectar Outlook · Demo</button>
          </>
        )}
        <small>Demo local: nenhum login Microsoft real é feito nesta versão.</small>
      </section>
      <StudentDashboard
        subjects={subjects}
        notes={notes}
        aiHistory={aiHistory}
        subjectArtifacts={subjectArtifacts}
        studyCalendar={studyCalendar}
      />
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
    </Container>
  );
}

function PreferenceSelect({ label, options, value, onChange }) {
  return (
    <label>{label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
    </label>
  );
}
