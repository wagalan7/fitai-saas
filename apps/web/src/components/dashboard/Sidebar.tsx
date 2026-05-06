'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dumbbell, LayoutDashboard, MessageSquare, Salad, TrendingUp, Settings, LogOut } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/chat', icon: MessageSquare, label: 'Chat IA' },
  { href: '/workouts', icon: Dumbbell, label: 'Treinos' },
  { href: '/nutrition', icon: Salad, label: 'Nutrição' },
  { href: '/progress', icon: TrendingUp, label: 'Progresso' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { clear } = useAuthStore();
  const router = useRouter();

  async function handleLogout() {
    await api.post('/auth/logout').catch(() => {});
    clear();
    router.push('/login');
  }

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col py-6 px-4">
      {/* Logo */}
      <div className="flex items-center gap-2 px-3 mb-8">
        <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
          <Dumbbell size={16} className="text-white" />
        </div>
        <span className="font-bold text-gray-900 text-lg">FitAI</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 space-y-1">
        {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
          const active = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={href}
              href={href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                active
                  ? 'bg-primary-50 text-primary-700'
                  : 'text-gray-500 hover:text-gray-800 hover:bg-gray-50'
              }`}
            >
              <Icon size={18} />
              {label}
            </Link>
          );
        })}
      </nav>

      {/* Bottom */}
      <div className="space-y-1 pt-4 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all"
        >
          <LogOut size={18} />
          Sair
        </button>
      </div>
    </aside>
  );
}
