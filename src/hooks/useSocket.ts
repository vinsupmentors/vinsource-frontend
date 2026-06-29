import { useEffect, useRef } from 'react';
import { io, Socket } from 'socket.io-client';
import { useDispatch } from 'react-redux';
import { addNotification } from '@/store/slices/notificationSlice';
import { AppDispatch } from '@/store';
import { Notification } from '@/types';

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

export const useSocket = (token: string | null) => {
  const socketRef = useRef<Socket | null>(null);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    if (!token) return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log('🔌 Socket connected:', socket.id);
    });

    socket.on('disconnect', (reason) => {
      console.log('🔌 Socket disconnected:', reason);
    });

    socket.on('notification', (notif: Notification) => {
      dispatch(addNotification(notif));
    });

    socket.on('connect_error', (err) => {
      console.warn('Socket error:', err.message);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token, dispatch]);

  return socketRef;
};
