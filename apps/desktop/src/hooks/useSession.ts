import { useEffect, useState, useSyncExternalStore } from 'react';
import { authStore, renew } from '../lib/api';
export function useSession() {
  const session = useSyncExternalStore(authStore.subscribe, authStore.snapshot);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void renew()
      .catch(() => undefined)
      .finally(() => setReady(true));
  }, []);
  return { session, ready };
}
