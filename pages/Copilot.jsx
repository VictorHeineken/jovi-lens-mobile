import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from '../components/Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';

function getTrialState(plan) {
  if (plan.type !== 'trial' || !plan.endsAt) return { active: false, daysLeft: 0 };
  const remaining = new Date(plan.endsAt).getTime() - Date.now();
  return { active: remaining > 0, daysLeft: remaining > 0 ? Math.max(1, Math.ceil(remaining / 86400000)) : 0 };
}

export default function Copilot({ embedded = false }) {
  const navigate = useNavigate();
  const { plan, user, setPlan, setUser } = useAppData();
  const [message, setMessage] = useState('');
  const trial = getTrialState(plan);
  const accessActive = plan.type === 'pro' || trial.active;
  const Page = embedded ? 'section' : 'main';

  function ensureDemoUser() {
    if (!user) setUser({ id: 'demo-student', name: 'Ana Beatriz', email: 'ana.beatriz@demo.jovi', picture: '' });
  }

  function startTrial() {
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 7 * 86400000);
    ensureDemoUser();
    setPlan({ type: 'trial', demo: true, model: 'copilot-advanced', startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString() });
    setMessage('Teste de 7 dias ativado para a apresentação. Nenhuma cobrança foi feita.');
  }

  function connectPaidAccount() {
    ensureDemoUser();
    setPlan({ type: 'pro', demo: true, model: 'copilot-advanced', source: 'existing-subscription', connectedAt: new Date().toISOString() });
    setMessage('Assinatura Copilot conectada neste exemplo. Nenhuma conta real foi consultada.');
  }

  return (
    <Page className={`light-page copilot-page${embedded ? ' copilot-embedded' : ''}`}>
      <header className="mobile-header">
        <div><div className="eyebrow"><Icon name="sparkle" size={13} /> Inteligência avançada</div><h1>Copilot</h1></div>
        <span className="copilot-demo-badge">DEMO</span>
      </header>

      <section className="copilot-hero">
        <div className="copilot-orbit" aria-hidden="true" />
        <div className="copilot-hero-copy">
          <span className="copilot-kicker">JOVI Lens + Copilot</span>
          <h2>Uma IA mais completa para acompanhar seus estudos.</h2>
          <p>Teste um modelo avançado para entender imagens, aprofundar explicações e praticar com mais contexto.</p>
        </div>
        <div className="copilot-model-pill"><Icon name="sparkle" size={15} /> Modelo avançado · exemplo</div>
      </section>

      <section className={`copilot-status-card${accessActive ? ' active' : ''}`}>
        <div className="copilot-status-top">
          <div className="copilot-status-icon"><Icon name={accessActive ? 'check' : 'lock'} size={20} /></div>
          <div><span className="copilot-label">Seu acesso</span><h2>{trial.active ? `Teste ativo · ${trial.daysLeft} ${trial.daysLeft === 1 ? 'dia' : 'dias'} restantes` : plan.type === 'pro' ? 'Copilot conectado' : 'Escolha como experimentar'}</h2></div>
        </div>
        {accessActive ? (
          <>
            <p className="copilot-status-description">O modelo avançado está selecionado nesta demonstração. Abra a câmera para continuar uma sessão de estudo.</p>
            <button className="copilot-primary-button" onClick={() => navigate('/camera')}><Icon name="camera" size={16} /> Abrir câmera com Copilot</button>
          </>
        ) : (
          <>
            <p className="copilot-status-description">Você pode mostrar os dois caminhos de acesso sem criar cadastro, assinatura ou cobrança real.</p>
            <div className="copilot-options">
              <button className="copilot-primary-button" onClick={startTrial}><Icon name="sparkle" size={16} /> Testar por 7 dias</button>
              <button className="copilot-secondary-button" onClick={connectPaidAccount}><Icon name="link" size={16} /> Já assino o Copilot</button>
            </div>
          </>
        )}
        <small className="copilot-demo-note">Demonstração de produto · acesso, modelo e assinatura são ilustrativos.</small>
      </section>

      <section className="copilot-benefits">
        <div className="copilot-section-heading"><div><span>O que muda</span><h2>Mais profundidade para aprender</h2></div><Icon name="arrow-up-right" size={17} /></div>
        <div className="copilot-benefit-list">
          <div><span><Icon name="scan" size={16} /></span><p><strong>Entende imagens complexas</strong><small>Exercícios, textos, gráficos e anotações no mesmo contexto.</small></p></div>
          <div><span><Icon name="question" size={16} /></span><p><strong>Explica no seu ritmo</strong><small>Você pode pedir exemplos, simplificar ou aprofundar a resposta.</small></p></div>
          <div><span><Icon name="cards" size={16} /></span><p><strong>Transforma conteúdo em prática</strong><small>Gera questões e feedback para reforçar o que foi aprendido.</small></p></div>
        </div>
      </section>

      {message && <div className="inline-message copilot-message" role="status"><Icon name="info" size={15} /> {message}</div>}
    </Page>
  );
}
