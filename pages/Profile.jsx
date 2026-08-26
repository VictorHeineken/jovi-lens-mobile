import { useEffect, useRef, useState } from 'react';
import Icon from '../components/Icon.jsx';
import { useAppData } from '../context/AppDataContext.jsx';

const GOOGLE_SCRIPT = 'https://accounts.google.com/gsi/client';

function loadGoogleScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) return resolve();
    const existing = document.querySelector(`script[src="${GOOGLE_SCRIPT}"]`);
    if (existing) {
      existing.addEventListener('load', resolve, { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = GOOGLE_SCRIPT;
    script.async = true;
    script.defer = true;
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

export default function Profile() {
  const { user, setUser, plan, setPlan } = useAppData();
  const googleButtonRef = useRef(null);
  const [authMessage, setAuthMessage] = useState('');
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

  useEffect(() => {
    if (!clientId || user) return;
    let alive = true;
    loadGoogleScript().then(() => {
      if (!alive || !googleButtonRef.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: async ({ credential }) => {
          setAuthMessage('Validando conta Google...');
          const response = await fetch('/api/auth/google', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ credential }),
          });
          const data = await response.json();
          if (response.ok) {
            setUser(data.user);
            setAuthMessage('');
          } else {
            setAuthMessage(data.message || 'Não foi possível entrar com Google.');
          }
        },
      });
      window.google.accounts.id.renderButton(googleButtonRef.current, { theme: 'outline', size: 'large', width: 315, shape: 'pill', text: 'continue_with' });
    }).catch(() => setAuthMessage('Falha ao carregar Google Sign-In.'));
    return () => { alive = false; };
  }, [clientId, user, setUser]);

  const trialActive = plan.type === 'trial' && new Date(plan.endsAt) > new Date();
  const daysLeft = trialActive ? Math.max(1, Math.ceil((new Date(plan.endsAt) - new Date()) / 86400000)) : 0;

  function startTrial() {
    const startedAt = new Date();
    const endsAt = new Date(startedAt.getTime() + 7 * 86400000);
    setPlan({ type: 'trial', startedAt: startedAt.toISOString(), endsAt: endsAt.toISOString() });
  }

  function subscribe() {
    const checkoutUrl = import.meta.env.VITE_BILLING_CHECKOUT_URL;
    if (checkoutUrl) window.location.href = checkoutUrl;
    else setAuthMessage('Checkout ainda não configurado. O protótipo não simula uma cobrança real.');
  }

  return (
    <main className="light-page profile-page">
      <header className="mobile-header"><div><div className="eyebrow">Conta e plano</div><h1>Perfil</h1></div></header>

      <section className="profile-card">
        {user ? (
          <>
            <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" />
            <div className="profile-copy"><strong>{user.name}</strong><span>{user.email}</span></div>
            <button className="text-button" onClick={() => setUser(null)}>Sair</button>
          </>
        ) : (
          <>
            <div className="avatar placeholder"><Icon name="user" /></div>
            <div className="profile-copy"><strong>Conecte sua conta</strong><span>Sincronização preparada para Google.</span></div>
          </>
        )}
      </section>

      {!user && (
        <section className="google-signin-card">
          <h2>Continuar com Google</h2>
          <p>O login identifica o usuário. Ele não compartilha assinatura Gemini/Google AI nem credenciais da API.</p>
          {clientId ? <div ref={googleButtonRef} className="google-button-slot" /> : <div className="config-pill"><Icon name="lock" size={16} /> Configure VITE_GOOGLE_CLIENT_ID</div>}
        </section>
      )}

      <section className="plan-card">
        <div className="plan-top">
          <div><span className="plan-label">JOVI Plus</span><h2>{trialActive ? `${daysLeft} dias de teste restantes` : plan.type === 'pro' ? 'Plano ativo' : 'Mais IA, menos passos'}</h2></div>
          <div className="plan-icon"><Icon name="crown" size={24} /></div>
        </div>
        <div className="plan-benefits">
          <div><Icon name="check" size={15} /> Mais análises por mês</div>
          <div><Icon name="check" size={15} /> Histórico inteligente</div>
          <div><Icon name="check" size={15} /> Organização de notas</div>
        </div>
        {!trialActive && plan.type !== 'pro' && <button className="primary-wide" onClick={startTrial}>Testar grátis por 7 dias</button>}
        <button className="secondary-wide" onClick={subscribe}>Assinar JOVI Plus</button>
        <small>A cobrança do app é independente do Google Sign-In e da Gemini API.</small>
      </section>

      <section className="settings-card">
        <div><span>IA</span><strong>Google Gemini</strong></div>
        <div><span>Armazenamento local</span><strong>IndexedDB</strong></div>
        <div><span>Experiência</span><strong>PWA mobile-first</strong></div>
      </section>
      {authMessage && <div className="inline-message">{authMessage}</div>}
    </main>
  );
}
