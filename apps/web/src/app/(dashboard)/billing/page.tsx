'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { swrConfig } from '@/lib/swr';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Crown, Check, CreditCard, Loader2, Sparkles } from 'lucide-react';

interface Subscription {
  plan: 'FREE' | 'PRO' | 'PREMIUM';
  status: string;
  currentPeriodEnd: string | null;
  isPro: boolean;
  billingEnabled: boolean;
}

const PRO_PERKS = [
  'Planos de treino e dieta ilimitados',
  'Auto-titulação da dieta e deload inteligente',
  'Análises do Dr. Shape com fotos de progresso',
  'Relatórios e acompanhamento completo',
  'Suporte prioritário',
];

export default function BillingPage() {
  return (
    <Suspense fallback={null}>
      <BillingContent />
    </Suspense>
  );
}

function BillingContent() {
  const { data, mutate, isLoading } = useSWR<Subscription>('/billing/subscription', swrConfig);
  const [busy, setBusy] = useState<'checkout' | 'portal' | null>(null);
  const params = useSearchParams();
  const router = useRouter();

  // Surface the Checkout return state, then strip the query so a refresh
  // doesn't re-toast. The webhook is the source of truth, so we just revalidate.
  useEffect(() => {
    const status = params.get('status');
    if (status === 'success') {
      toast.success('Assinatura confirmada! Bem-vindo ao PRO.');
      mutate();
      router.replace('/billing');
    } else if (status === 'cancel') {
      toast.info('Checkout cancelado.');
      router.replace('/billing');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  async function startCheckout() {
    setBusy('checkout');
    try {
      const { data } = await api.post<{ url: string }>('/billing/checkout', {});
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Não foi possível iniciar o checkout.');
      setBusy(null);
    }
  }

  async function openPortal() {
    setBusy('portal');
    try {
      const { data } = await api.post<{ url: string }>('/billing/portal', {});
      window.location.href = data.url;
    } catch (err: any) {
      toast.error(err?.response?.data?.message || 'Não foi possível abrir o portal.');
      setBusy(null);
    }
  }

  const isPro = !!data?.isPro;
  const billingEnabled = data?.billingEnabled ?? false;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
          <Crown className="text-amber-500" size={24} /> Assinatura
        </h1>
        <p className="text-sm text-gray-500 mt-1">
          Gerencie seu plano e libere todos os recursos do app.
        </p>
      </div>

      {isLoading ? (
        <div className="card p-8 flex items-center justify-center text-gray-400">
          <Loader2 className="animate-spin" size={24} />
        </div>
      ) : (
        <>
          {/* Current plan badge */}
          <div className="card p-5 flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-wide text-gray-400">Plano atual</p>
              <p className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                {isPro ? (
                  <>
                    <Sparkles size={18} className="text-amber-500" />
                    {data?.plan === 'PREMIUM' ? 'PREMIUM' : 'PRO'}
                  </>
                ) : (
                  'Gratuito'
                )}
              </p>
              {isPro && data?.currentPeriodEnd && (
                <p className="text-xs text-gray-500 mt-1">
                  Renova em {new Date(data.currentPeriodEnd).toLocaleDateString('pt-BR')}
                </p>
              )}
            </div>
            {isPro && (
              <span className="text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
                Ativo
              </span>
            )}
          </div>

          {/* PRO card */}
          <div className="card p-6 border border-amber-200 bg-gradient-to-b from-amber-50/60 to-white">
            <div className="flex items-center gap-2">
              <Crown className="text-amber-500" size={20} />
              <h2 className="text-lg font-bold text-gray-900">FIT Muscle PRO</h2>
            </div>
            <ul className="mt-4 space-y-2">
              {PRO_PERKS.map((perk) => (
                <li key={perk} className="flex items-start gap-2 text-sm text-gray-700">
                  <Check size={16} className="text-green-600 flex-shrink-0 mt-0.5" />
                  {perk}
                </li>
              ))}
            </ul>

            <div className="mt-6">
              {!billingEnabled ? (
                <p className="text-sm text-gray-500 bg-gray-50 rounded-xl px-4 py-3 text-center">
                  Os pagamentos estão sendo configurados. Volte em breve. 🚧
                </p>
              ) : isPro ? (
                <button
                  onClick={openPortal}
                  disabled={busy !== null}
                  className="w-full inline-flex items-center justify-center gap-2 disabled:opacity-50 bg-gray-900 hover:bg-gray-800 text-white px-4 py-3 rounded-xl font-medium transition-colors"
                >
                  {busy === 'portal' ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <CreditCard size={18} />
                  )}
                  Gerenciar assinatura
                </button>
              ) : (
                <button
                  onClick={startCheckout}
                  disabled={busy !== null}
                  className="w-full inline-flex items-center justify-center gap-2 disabled:opacity-50 bg-amber-500 hover:bg-amber-600 text-white px-4 py-3 rounded-xl font-semibold transition-colors"
                >
                  {busy === 'checkout' ? (
                    <Loader2 className="animate-spin" size={18} />
                  ) : (
                    <Crown size={18} />
                  )}
                  Assinar PRO
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
