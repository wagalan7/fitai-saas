'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function ProfileGuard() {
  const router = useRouter();

  useEffect(() => {
    api.get('/profile').then((r) => {
      if (!r.data.isComplete) {
        router.replace('/profile/setup');
      }
    }).catch(() => {});
  }, [router]);

  return null;
}
