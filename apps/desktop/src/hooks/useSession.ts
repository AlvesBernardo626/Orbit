import { useEffect, useState, useSyncExternalStore } from 'react';
import { authStore, renew } from '../lib/api';
export function useSession() {
  const session = useSyncExternalStore(authStore.subscribe, authStore.snapshot);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void renew()
      .catch((e) => console.error('useSession: renew() falhou na inicialização:', e))
      .finally(() => setReady(true));
  }, []);
  return { session, ready };
}
