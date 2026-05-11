'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { User, Phone, MapPin, CreditCard, Calendar, ChevronRight, Check, AlertCircle } from 'lucide-react';

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

export default function ProfileSetupPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [form, setForm] = useState({
    name: '',
    cpf: '',
    phone: '',
    genderIdentity: '',
    age: '',
    address: '',
  });

  useEffect(() => {
    api.get('/profile').then((r) => {
      const { user, profile, isComplete } = r.data;
      if (isComplete) { router.replace('/dashboard'); return; }
      setForm((f) => ({
        ...f,
        name: user?.name || '',
        cpf: profile?.cpf ? profile.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : '',
        phone: profile?.phone ? profile.phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3') : '',
        genderIdentity: profile?.genderIdentity || '',
        age: profile?.age && profile.age > 0 ? String(profile.age) : '',
        address: profile?.address || '',
      }));
    }).catch(() => {
      router.replace('/login');
    }).finally(() => setChecking(false));
  }, [router]);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: '' }));
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    try {
      await api.patch('/profile', {
        name: form.name.trim(),
        cpf: form.cpf,
        phone: form.phone,
        genderIdentity: form.genderIdentity,
        age: Number(form.age),
        address: form.address.trim(),
      });
      router.push('/dashboard');
    } catch (err: any) {
      setErrors({ _global: err?.response?.data?.message || 'Erro ao salvar. Tente novamente.' });
    } finally {
      setLoading(false);
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary-500 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <User size={32} className="text-white" />
          </div>
          <h1 className="text-white text-2xl font-bold">Complete seu perfil</h1>
          <p className="text-gray-400 mt-1">Precisamos de algumas informações para personalizar sua experiência</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-gray-800 border border-gray-700 rounded-2xl p-8 space-y-5">
          {errors._global && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-3 text-red-400 text-sm">
              <AlertCircle size={16} /> {errors._global}
            </div>
          )}

          {/* Name */}
          <Field icon={<User size={16} />} label="Nome completo" error={errors.name}>
            <input
              type="text"
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder="Seu nome completo"
              className={input(errors.name)}
            />
          </Field>

          {/* CPF */}
          <Field icon={<CreditCard size={16} />} label="CPF" error={errors.cpf}>
            <input
              type="text"
              value={form.cpf}
              onChange={(e) => set('cpf', maskCPF(e.target.value))}
              placeholder="000.000.000-00"
              className={input(errors.cpf)}
              maxLength={14}
            />
          </Field>

          {/* Phone */}
          <Field icon={<Phone size={16} />} label="Telefone / WhatsApp" error={errors.phone}>
            <input
              type="text"
              value={form.phone}
              onChange={(e) => set('phone', maskPhone(e.target.value))}
              placeholder="(11) 99999-9999"
              className={input(errors.phone)}
              maxLength={15}
            />
          </Field>

          {/* Gender */}
          <div>
            <label className="text-gray-300 text-sm font-medium mb-2 block">Sexo biológico</label>
            <div className="grid grid-cols-3 gap-2">
              {[
                { value: 'MALE', label: '♂️ Masculino' },
                { value: 'FEMALE', label: '♀️ Feminino' },
                { value: 'OTHER', label: '⚧️ Outro' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => set('genderIdentity', opt.value)}
                  className={`py-2.5 px-3 rounded-xl border-2 text-sm font-medium transition-all ${
                    form.genderIdentity === opt.value
                      ? 'border-primary-500 bg-primary-500/10 text-white'
                      : 'border-gray-600 text-gray-400 hover:border-gray-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {errors.genderIdentity && <p className="text-red-400 text-xs mt-1">{errors.genderIdentity}</p>}
          </div>

          {/* Age */}
          <Field icon={<Calendar size={16} />} label="Idade" error={errors.age}>
            <input
              type="number"
              value={form.age}
              onChange={(e) => set('age', e.target.value)}
              placeholder="Ex: 28"
              min={1} max={120}
              className={input(errors.age)}
            />
          </Field>

          {/* Address */}
          <Field icon={<MapPin size={16} />} label="Endereço completo" error={errors.address}>
            <input
              type="text"
              value={form.address}
              onChange={(e) => set('address', e.target.value)}
              placeholder="Rua, número, bairro, cidade — UF"
              className={input(errors.address)}
            />
          </Field>

          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl transition-colors mt-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>Salvar e continuar <ChevronRight size={18} /></>
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

function Field({ icon, label, error, children }: { icon: React.ReactNode; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-gray-300 text-sm font-medium mb-2 flex items-center gap-1.5">
        <span className="text-gray-400">{icon}</span>
        {label}
      </label>
      {children}
      {error && <p className="text-red-400 text-xs mt-1 flex items-center gap-1"><AlertCircle size={12} />{error}</p>}
    </div>
  );
}

function input(error?: string) {
  return `w-full bg-gray-700 border ${error ? 'border-red-500' : 'border-gray-600'} rounded-xl px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-colors`;
}
