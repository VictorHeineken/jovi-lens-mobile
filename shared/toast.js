import { useCallback, useEffect, useRef, useState } from 'react';

const DEFAULT_DURATION = 2600;

// Transient confirmation message ("Foto salva na galeria."). Replaces a pattern
// that was repeated across the screens of BOTH clients: `setMessage(text)`
// followed by a bare `setTimeout(() => setMessage(''), 2600)`.
//
// That pattern has a real bug, not just an untidy timer. The timeouts were never
// tracked, so two toasts inside one duration window left two live timers racing:
// the first fires partway through the SECOND message and blanks it early — the
// faster the actions, the less time the message is readable. Cancelling the
// previous timer on every show() gives each message its full duration.
//
// Lives in shared/ rather than a per-client hooks/ directory because it needs
// nothing but React: a bare setTimeout and useState, no native module and no
// `window`. Keeping one copy is the point — the web and native screens had
// drifted once already.
export function useToast(duration = DEFAULT_DURATION) {
  const [message, setMessage] = useState('');
  const timerRef = useRef(null);

  const clear = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const show = useCallback((text) => {
    clear();
    setMessage(text);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      setMessage('');
    }, duration);
  }, [clear, duration]);

  // `clear` is a stable useCallback, so this mounts once and its cleanup runs
  // only on unmount — it never cancels a live timer mid-lifecycle.
  //
  // Deliberately NO "is it still mounted?" guard on show(). A show() arriving
  // from an async continuation after unmount arms one timer that fires a single
  // setState, which React 19 treats as a silent no-op before collecting it —
  // nothing to defend against. A `mountedRef` would be worse than the problem:
  // useRef initializes only on an instance's first render, so any effect re-run
  // on the same instance (Fast Refresh does exactly this) would leave the ref
  // false forever and silently kill every toast until a full reload.
  useEffect(() => clear, [clear]);

  return [message, show];
}
