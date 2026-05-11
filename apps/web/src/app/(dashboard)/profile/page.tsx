'use client';

import { useState, useEffect } from 'react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';
import { User, Phone, MapPin, CreditCard, Calendar, Save, CheckCircle, AlertCircle, Edit3 } from 'lucide-react';

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
