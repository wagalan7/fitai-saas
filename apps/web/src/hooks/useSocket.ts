import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';

export function useSocket(token: string | null) {
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/chat`, {
      auth: { token },
      transports: ['websocket'],
      autoConnect: true,
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  return socketRef.current;
}
