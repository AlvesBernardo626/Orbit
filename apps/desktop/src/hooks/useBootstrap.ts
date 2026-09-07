import { useCallback, useEffect, useRef, useState } from 'react';
import type { Bootstrap } from '@orbit/shared';
import type { Socket } from 'socket.io-client';
import { api } from '../lib/api';
export function useBootstrap(socket: Socket) {
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState('');
  const version = useRef(0);
  const reload = useCallback(async () => {
    const current = ++version.current;
    try {
      const result = await api<Bootstrap>('/bootstrap');
      if (current === version.current) {
        setData(result);
        setError('');
      }
    } catch (error) {
      if (current === version.current) setError((error as Error).message);
    }
  }, []);
  useEffect(() => {
    const invalidate = () => {
      version.current++;
    };
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void reload(), 200);
    };
    socket
      .on('sync', schedule)
      .on('message', schedule)
      .on('read', schedule)
      .on('connect', schedule);
    void reload();
    return () => {
      invalidate();
      clearTimeout(timer);
      socket
        .off('sync', schedule)
        .off('message', schedule)
        .off('read', schedule)
        .off('connect', schedule);
    };
  }, [socket, reload]);
  return { data, error, reload };
}
