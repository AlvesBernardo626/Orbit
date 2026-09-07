import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import { API, token, renew } from '../lib/api';
export function useSocket() {
  const socket = useMemo(
    () =>
      io(API, {
        autoConnect: false,
        transports: ['websocket'],
        reconnectionDelay: 1000,
        reconnectionDelayMax: 10000,
        randomizationFactor: 0.5,
        auth: (cb) => {
          void token()
            .then((token) => cb({ token }))
            .catch(() => cb({ token: '' }));
        },
      }),
    [],
  );
  const [connected, setConnected] = useState(false);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const connect = () => setConnected(true);
    const retry = () => {
      if (!alive) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        void renew()
          .then(() => {
            if (alive) socket.connect();
          })
          .catch(retry);
      }, 3000);
    };
    const disconnect = (reason: string) => {
      setConnected(false);
      if (reason === 'io server disconnect') retry();
    };
    const error = (error: Error) => {
      if (error.message === 'Autenticação necessária') retry();
    };
    socket.on('connect', connect).on('disconnect', disconnect).on('connect_error', error);
    socket.connect();
    return () => {
      alive = false;
      clearTimeout(timer);
      socket.off('connect', connect).off('disconnect', disconnect).off('connect_error', error);
      socket.disconnect();
    };
  }, [socket]);
  return { socket, connected };
}
