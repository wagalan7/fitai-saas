'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Dumbbell, LayoutDashboard, MessageSquare, Salad, TrendingUp, LogOut, Camera, X, Menu, User } from 'lucide-react';
import { useAuthStore } from '@/store/auth.store';
import { api } from '@/lib/api';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

const NAV_ITEMS = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { href: '/chat', icon: MessageSquare, label: 'Chat IA' },
  { href: '/workouts', icon: Dumbbell, label: 'Treinos' },
  { href: '/nutrition', icon: Salad, label: 'Nutrição' },
  { href: '/progress', icon: TrendingUp, label: 'Progresso' },
  { href: '/chat?agent=EVALUATOR', icon: Camera, label: 'Dr. Shape' },
  { href: '/profile', icon: User, label: 'Perfil' },
];

const BOTTOM_NAV = [
  { href: '/dashboard', icon: LayoutDashboard, label: 'Início' },
  { href: '/chat', icon: MessageSquare, label: 'Chat' },
  { href: '/workouts', icon: Dumbbell, label: 'Treinos' },
  { href: '/nutrition', icon: Salad, label: 'Nutrição' },
  { href: '/progress', icon: TrendingUp, label: 'Progresso' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { clear } = useAuthStore();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleLogout() {
    await api.post('/auth/logout').catch(() => {});
    clear();
    router.push('/login');
  }

  function isActive(href: string) {
    const base = href.split('?')[0];
    return pathname === base || pathname.startsWith(base + '/');
  }

  const NavLinks = ({ onNavigate }: { onNavigate?: () => void }) => (
    <nav className="flex-1 space-y-1">
      {NAV_ITEMS.map(({ href, icon: Icon, label }) => {
        const active = isActive(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
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
  );

  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────── */}
      <aside className="hidden lg:flex w-64 bg-white border-r border-gray-200 flex-col py-6 px-4 flex-shrink-0">
        <div className="flex items-center gap-2 px-3 mb-8">
          <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
            <Dumbbell size={16} className="text-white" />
          </div>
          <span className="font-bold text-gray-900 text-lg">FitAI</span>
        </div>
        <NavLinks />
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

      {/* ── Mobile: top bar ─────────────────────────── */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-200 flex items-center justify-between px-4 h-14">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-primary-500 rounded-lg flex items-center justify-center">
            <Dumbbell size={14} className="text-white" />
          </div>
          <span className="font-bold text-gray-900">FitAI</span>
        </div>
        <button
          onClick={() => setMobileOpen(true)}
          className="p-2 text-gray-500 hover:text-gray-700 rounded-lg"
          aria-label="Menu"
        >
          <Menu size={22} />
        </button>
      </div>

      {/* ── Mobile: slide-in drawer ──────────────────── */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/40" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 max-w-[85vw] bg-white flex flex-col py-6 px-4 h-full shadow-2xl">
            <div className="flex items-center justify-between px-3 mb-8">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 bg-primary-500 rounded-lg flex items-center justify-center">
                  <Dumbbell size={16} className="text-white" />
                </div>
                <span className="font-bold text-gray-900 text-lg">FitAI</span>
              </div>
              <button onClick={() => setMobileOpen(false)} className="p-1 text-gray-400">
                <X size={20} />
              </button>
            </div>
            <NavLinks onNavigate={() => setMobileOpen(false)} />
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
        </div>
      )}

      {/* ── Mobile: bottom navigation bar ───────────── */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-gray-200 flex">
        {BOTTOM_NAV.map(({ href, icon: Icon, label }) => {
          const active = isActive(href);
          return (
            <Link
              key={href}
              href={href}
              className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 transition-colors ${
                active ? 'text-primary-700' : 'text-gray-400'
              }`}
            >
              <Icon size={20} strokeWidth={active ? 2.5 : 1.8} />
              <span className="text-[10px] font-medium">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
