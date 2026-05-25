'use client';

import { useEffect } from 'react';

const NOTIF_KEY = 'fitai-last-workout-reminder';

export function useWorkoutReminder(todaySession: any | null, hasLoggedToday: boolean) {
  useEffect(() => {
    if (!todaySession || hasLoggedToday) return;
    if (typeof window === 'undefined' || !('Notification' in window)) return;

    // Only remind once per day
    const last = localStorage.getItem(NOTIF_KEY);
    const today = new Date().toDateString();
    if (last === today) return;

    async function requestAndNotify() {
      let permission = Notification.permission;

      if (permission === 'default') {
        permission = await Notification.requestPermission();
      }

      if (permission !== 'granted') return;

      localStorage.setItem(NOTIF_KEY, today);

      new Notification('🏋️ Treino de hoje', {
        body: `${todaySession.name} está no seu plano. Bora!`,
        icon: '/favicon.ico',
        badge: '/favicon.ico',
        tag: 'workout-reminder', // replaces previous notification of same tag
      });
    }

    // Small delay so the page settles first
    const t = setTimeout(requestAndNotify, 2000);
    return () => clearTimeout(t);
  }, [todaySession, hasLoggedToday]);
}
