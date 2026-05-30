'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { toast } from '@/lib/toast';
import { User, Phone, MapPin, CreditCard, Calendar, Save, CheckCircle, AlertCircle, Edit3, Brain, Trash2, ChevronDown, ChevronUp, Bell, BellOff } from 'lucide-react';
import { enablePush, disablePush, getNotificationStatus } from '@/lib/push';

const AGENT_LABELS: Record<string, string> = {
  TRAINER: '🏋️ Personal Trainer',
  NUTRITIONIST: '🥗 Nutricionista',
  COACH: '🧠 Coach',
  ANALYST: '📊 Analista',
  EVALUATOR: '📸 Dr. Shape',
  SYSTEM: '⚙️ Sistema',
};

const TYPE_COLORS: Record<string, string> = {
  FACT: 'bg-blue-100 text-blue-700',
  PREFERENCE: 'bg-purple-100 text-purple-700',
  PROGRESS: 'bg-green-100 text-green-700',
  INSIGHT: 'bg-orange-100 text-orange-700',
  SUMMARY: 'bg-gray-100 text-gray-600',
};

function MemoriesSection() {
  const [grouped, setGrouped] = useState<Record<string, any[]> | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/profile/memories').then(r => {
      setGrouped(r.data);
      // Auto-expand first group
      const first = Object.keys(r.data)[0];
      if (first) setExpanded({ [first]: true });
    }).finally(() => setLoading(false));
  }, []);

  async function deleteMemory(agentType: string, id: string) {
    try {
      await api.delete(`/profile/memories/${id}`);
      setGrouped(prev => {
        if (!prev) return prev;
        const updated = { ...prev };
        updated[agentType] = updated[agentType].filter(m => m.id !== id);
        if (updated[agentType].length === 0) delete updated[agentType];
        return updated;
      });
      toast.success('Memória removida.');
    } catch {
      toast.error('Erro ao remover memória.');
    }
  }

  const totalMemories = grouped ? Object.values(grouped).reduce((acc, arr) => acc + arr.length, 0) : 0;

  return (
    <div className="card p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Brain size={18} className="text-primary-500" />
        <h2 className="text-base font-semibold text-gray-900">O que seus coaches sabem sobre você</h2>
        {totalMemories > 0 && (
          <span className="ml-auto text-xs text-gray-400">{totalMemories} memórias</span>
        )}
      </div>
      <p className="text-xs text-gray-400">Os agentes de IA aprendem com suas conversas para personalizar respostas. Você pode remover memórias que não refletem mais sua realidade.</p>

      {loading && <div className="flex justify-center py-4"><div className="animate-spin w-5 h-5 border-2 border-primary-500 border-t-transparent rounded-full" /></div>}

      {!loading && totalMemories === 0 && (
        <p className="text-sm text-gray-400 text-center py-4">Nenhuma memória ainda. Converse com os agentes para eles aprenderem sobre você.</p>
      )}

      {!loading && grouped && Object.entries(grouped).map(([agentType, memories]) => (
        <div key={agentType} className="border border-gray-100 rounded-xl overflow-hidden">
          <button
            onClick={() => setExpanded(p => ({ ...p, [agentType]: !p[agentType] }))}
            className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
          >
            <span className="text-sm font-medium text-gray-700">{AGENT_LABELS[agentType] || agentType}</span>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-400">{memories.length}</span>
              {expanded[agentType] ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </div>
          </button>
          {expanded[agentType] && (
            <div className="divide-y divide-gray-50">
              {memories.map((m: any) => (
                <div key={m.id} className="flex items-start gap-3 px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0 mt-0.5 ${TYPE_COLORS[m.type] || 'bg-gray-100 text-gray-600'}`}>
                    {m.type}
                  </span>
                  <p className="text-sm text-gray-700 flex-1 leading-relaxed">{m.content}</p>
                  <button
                    onClick={() => deleteMemory(agentType, m.id)}
                    className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0 mt-0.5"
                    title="Remover memória"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function validateCPF(cpf: string): boolean {
  const c = cpf.replace(/[^\d]/g, '');
  if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(c[i]) * (10 - i);
  let r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  if (r !== parseInt(c[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(c[i]) * (11 - i);
  r = (sum * 10) % 11;
  if (r === 10 || r === 11) r = 0;
  return r === parseInt(c[10]);
}

function maskCPF(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2').slice(0, 14);
}

function maskPhone(v: string) {
  return v.replace(/\D/g, '').replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2').slice(0, 15);
}

export default function ProfilePage() {
  const { user: authUser } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '',
    cpf: '',
    phone: '',
    genderIdentity: '',
    age: '',
    address: '',
    email: '',
  });

  useEffect(() => {
    api.get('/profile').then((r) => {
      const { user, profile } = r.data;
      setForm({
        name: user?.name || '',
        email: user?.email || '',
        cpf: profile?.cpf ? profile.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '',
        phone: profile?.phone ? profile.phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : '',
        genderIdentity: profile?.genderIdentity || '',
        age: profile?.age && profile.age > 0 ? String(profile.age) : '',
        address: profile?.address || '',
      });
    }).finally(() => setLoading(false));
  }, []);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
    setSaved(false);
  }

  function validate() {
    const e: Record<string, string> = {};
    if (!form.name.trim()) e.name = 'Nome obrigatório';
    if (!form.cpf) e.cpf = 'CPF obrigatório';
    else if (!validateCPF(form.cpf)) e.cpf = 'CPF inválido';
    if (!form.phone) e.phone = 'Telefone obrigatório';
    else if (form.phone.replace(/\D/g, '').length < 10) e.phone = 'Telefone inválido';
    if (!form.genderIdentity) e.genderIdentity = 'Selecione o sexo';
    if (!form.age) e.age = 'Idade obrigatória';
    else if (isNaN(Number(form.age)) || Number(form.age) < 1 || Number(form.age) > 120) e.age = 'Idade inválida';
    if (!form.address.trim()) e.address = 'Endereço obrigatório';
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setSaving(true);
    try {
      await api.patch('/profile', {
        name: form.name.trim(),
        cpf: form.cpf,
        phone: form.phone,
        genderIdentity: form.genderIdentity,
        age: Number(form.age),
        address: form.address.trim(),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err: any) {
      setErrors({ _global: err?.response?.data?.message || 'Erro ao salvar.' });
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center">
          <User size={24} className="text-primary-600" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meu Perfil</h1>
          <p className="text-gray-500 text-sm">Mantenha seus dados atualizados</p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-4">
        {errors._global && (
          <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-600 text-sm">
            <AlertCircle size={16} /> {errors._global}
          </div>
        )}
        {saved && (
          <div className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-xl px-4 py-3 text-green-700 text-sm">
            <CheckCircle size={16} /> Perfil salvo com sucesso!
          </div>
        )}

        <div className="card p-6 space-y-5">
          <h2 className="text-base font-semibold text-gray-900 flex items-center gap-2"><Edit3 size={16} /> Dados pessoais</h2>

          {/* Email (read-only) */}
          <div>
            <label className="text-sm font-medium text-gray-600 block mb-1.5">E-mail</label>
            <input type="email" value={form.email} disabled className="w-full bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-gray-400 cursor-not-allowed text-sm" />
          </div>

          {/* Name */}
          <FormField label="Nome completo" error={errors.name} icon={<User size={15} />}>
            <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="Seu nome completo" className={inp(errors.name)} />
          </FormField>

          {/* CPF */}
          <FormField label="CPF" error={errors.cpf} icon={<CreditCard size={15} />}>
            <input type="text" value={form.cpf} onChange={(e) => set('cpf', maskCPF(e.target.value))} placeholder="000.000.000-00" className={inp(errors.cpf)} maxLength={14} />
          </FormField>

          {/* Phone */}
          <FormField label="Telefone / WhatsApp" error={errors.phone} icon={<Phone size={15} />}>
            <input type="text" value={form.phone} onChange={(e) => set('phone', maskPhone(e.target.value))} placeholder="(11) 99999-9999" className={inp(errors.phone)} maxLength={15} />
          </FormField>

          {/* Gender */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Sexo biológico</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'MALE', label: '♂️ Masculino' },
                { value: 'FEMALE', label: '♀️ Feminino' },
                { value: 'OTHER', label: '⚧️ Outro' },
              ].map((opt) => (
                <button key={opt.value} type="button" onClick={() => set('genderIdentity', opt.value)}
                  className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    form.genderIdentity === opt.value
                      ? 'border-primary-500 bg-primary-50 text-primary-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}>
                  {opt.label}
                </button>
              ))}
            </div>
            {errors.genderIdentity && <p className="text-red-500 text-xs mt-1">{errors.genderIdentity}</p>}
          </div>

          {/* Age */}
          <FormField label="Idade" error={errors.age} icon={<Calendar size={15} />}>
            <input type="number" value={form.age} onChange={(e) => set('age', e.target.value)} placeholder="Ex: 28" min={1} max={120} className={inp(errors.age)} />
          </FormField>

          {/* Address */}
          <FormField label="Endereço" error={errors.address} icon={<MapPin size={15} />}>
            <input type="text" value={form.address} onChange={(e) => set('address', e.target.value)} placeholder="Rua, número, bairro, cidade — UF" className={inp(errors.address)} />
          </FormField>
        </div>

        <button type="submit" disabled={saving}
          className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-semibold px-6 py-3 rounded-xl transition-colors">
          {saving ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" /> : <Save size={16} />}
          {saving ? 'Salvando...' : 'Salvar alterações'}
        </button>
      </form>

      <PushNotificationsSection />
      <MemoriesSection />
    </div>
  );
}

function TestReminderButton() {
  const [busy, setBusy] = useState(false);

  async function testNow() {
    setBusy(true);
    try {
      const { api } = await import('@/lib/api');
      const { data } = await api.post('/reminders/test-now', {}, { timeout: 20000 });
      if (data?.ok && (data?.sent ?? 0) > 0) {
        toast.success('Push enviado! Veja sua notificação.');
      } else if (data?.reason === 'no_subscription') {
        toast.error('Nenhuma inscrição de push registrada. Reative as notificações.');
      } else if (data?.reason === 'push_disabled') {
        toast.error('Push desabilitado no servidor (VAPID não configurado).');
      } else if (data?.reason === 'push_send_returned_zero') {
        toast.error('Push não foi entregue. A inscrição pode ter expirado — reative as notificações.');
      } else {
        toast.error('Falha ao testar o lembrete.');
      }
    } catch {
      toast.error('Erro ao chamar o servidor.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={testNow}
      disabled={busy}
      className="w-full mt-2 bg-gray-50 hover:bg-gray-100 disabled:opacity-50 text-gray-700 text-sm font-medium py-2.5 rounded-lg border border-gray-200 transition-colors"
    >
      {busy ? 'Enviando teste...' : 'Testar lembrete agora'}
    </button>
  );
}

function PushNotificationsSection() {
  const [status, setStatus] = useState<'loading' | 'unsupported' | 'denied' | 'granted' | 'default' | 'unsubscribed'>('loading');
  const [busy, setBusy] = useState(false);
  // Reminder preferences (load from /profile)
  const [remindersEnabled, setRemindersEnabled] = useState(true);
  const [reminderHour, setReminderHour] = useState(8);
  const [savingPrefs, setSavingPrefs] = useState(false);

  useEffect(() => {
    getNotificationStatus().then((s) => setStatus(s));
    // Pull current reminder preferences so the dropdowns show the right value.
    import('@/lib/api').then(({ api }) =>
      api.get('/profile').then(({ data }) => {
        if (typeof data?.profile?.workoutRemindersEnabled === 'boolean') {
          setRemindersEnabled(data.profile.workoutRemindersEnabled);
        }
        if (typeof data?.profile?.workoutReminderHour === 'number') {
          setReminderHour(data.profile.workoutReminderHour);
        }
      }).catch(() => {}),
    );
  }, []);

  async function savePrefs(next: { remindersEnabled?: boolean; reminderHour?: number }) {
    setSavingPrefs(true);
    try {
      const { api } = await import('@/lib/api');
      // Detect user's IANA timezone from the browser; backend stores it so the
      // cron knows what "8am" means for this user.
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
      await api.patch('/profile', {
        workoutRemindersEnabled: next.remindersEnabled ?? remindersEnabled,
        workoutReminderHour: next.reminderHour ?? reminderHour,
        timezone: tz,
      });
      toast.success('Preferência salva.');
    } catch {
      toast.error('Não foi possível salvar a preferência.');
    } finally {
      setSavingPrefs(false);
    }
  }

  async function turnOn() {
    setBusy(true);
    const res = await enablePush();
    setBusy(false);
    if (res.ok) {
      setStatus('granted');
      toast.success('Notificações ativadas!');
    } else if (res.reason === 'denied') {
      setStatus('denied');
      toast.error('Permissão negada. Habilite manualmente nas configurações do navegador.');
    } else if (res.reason === 'disabled') {
      toast.info('Notificações push ainda não estão configuradas no servidor.');
    } else if (res.reason === 'unsupported') {
      toast.error('Seu navegador não suporta notificações push.');
    } else {
      toast.error('Não foi possível ativar as notificações.');
    }
  }

  async function turnOff() {
    setBusy(true);
    await disablePush();
    setBusy(false);
    setStatus('unsubscribed');
    toast.success('Notificações desativadas.');
  }

  if (status === 'loading') return null;

  return (
    <div className="card p-6 mt-6">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 flex-1 min-w-0">
          <div className="w-10 h-10 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
            {status === 'granted' ? <Bell size={18} className="text-primary-600" /> : <BellOff size={18} className="text-gray-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-gray-900">Notificações push</h3>
            <p className="text-sm text-gray-500 mt-0.5">
              {status === 'granted' && 'Você receberá lembretes de treino, mesmo com o app fechado.'}
              {(status === 'default' || status === 'unsubscribed') && 'Receba lembretes de treino e dieta no celular ou navegador.'}
              {status === 'denied' && 'Permissão negada. Ative manualmente nas configurações do navegador.'}
              {status === 'unsupported' && 'Seu navegador não suporta notificações push.'}
            </p>
          </div>
        </div>
        {status === 'granted' && (
          <button onClick={turnOff} disabled={busy} className="text-sm text-gray-500 hover:text-red-600 disabled:opacity-50 flex-shrink-0">
            Desativar
          </button>
        )}
        {(status === 'default' || status === 'unsubscribed') && (
          <button onClick={turnOn} disabled={busy} className="bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg flex-shrink-0">
            {busy ? 'Ativando...' : 'Ativar'}
          </button>
        )}
      </div>

      {/* Workout reminder preferences — only show when notifications are on */}
      {status === 'granted' && (
        <div className="mt-5 pt-5 border-t border-gray-100 space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Lembrete diário de treino</p>
              <p className="text-xs text-gray-500 mt-0.5">
                Receba um push nos dias em que você tem treino marcado.
              </p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
              <input
                type="checkbox"
                checked={remindersEnabled}
                disabled={savingPrefs}
                onChange={(e) => {
                  setRemindersEnabled(e.target.checked);
                  savePrefs({ remindersEnabled: e.target.checked });
                }}
                className="sr-only peer"
              />
              <div className="w-10 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-500"></div>
            </label>
          </div>

          {remindersEnabled && (
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-gray-700">Horário do lembrete</p>
              <select
                value={reminderHour}
                disabled={savingPrefs}
                onChange={(e) => {
                  const h = parseInt(e.target.value, 10);
                  setReminderHour(h);
                  savePrefs({ reminderHour: h });
                }}
                className="bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                {Array.from({ length: 24 }, (_, h) => (
                  <option key={h} value={h}>
                    {String(h).padStart(2, '0')}:00
                  </option>
                ))}
              </select>
            </div>
          )}

          <TestReminderButton />
        </div>
      )}
    </div>
  );
}

function FormField({ label, error, icon, children }: { label: string; error?: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5 block">
        <span className="text-gray-400">{icon}</span>{label}
      </label>
      {children}
      {error && <p className="text-red-500 text-xs mt-1 flex items-center gap-1"><AlertCircle size={11} />{error}</p>}
    </div>
  );
}

function inp(error?: string) {
  return `w-full bg-white border ${error ? 'border-red-300' : 'border-gray-200'} rounded-xl px-4 py-3 text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm transition-colors`;
}
