'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Plus, TrendingUp } from 'lucide-react';
import ProgressChart from '@/components/dashboard/ProgressChart';

export default function ProgressPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    weightKg: '',
    waistCm: '',
    hipCm: '',
    armCm: '',
    legCm: '',
    notes: '',
  });

  useEffect(() => {
    Promise.all([
      api.get('/progress?days=90'),
      api.get('/progress/summary'),
    ]).then(([logsRes, summaryRes]) => {
      setLogs(logsRes.data);
      setSummary(summaryRes.data);
      setLoading(false);
    });
  }, []);

  async function logProgress(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {};
    if (form.weightKg) payload.weightKg = +form.weightKg;
    if (form.waistCm) payload.waistCm = +form.waistCm;
    if (form.hipCm) payload.hipCm = +form.hipCm;
    if (form.armCm) payload.armCm = +form.armCm;
    if (form.legCm) payload.legCm = +form.legCm;
    if (form.notes) payload.notes = form.notes;

    const { data } = await api.post('/progress', payload);
    setLogs((prev) => [data, ...prev]);
    setShowForm(false);
    setForm({ weightKg: '', waistCm: '', hipCm: '', armCm: '', legCm: '', notes: '' });
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meu Progresso</h1>
          <p className="text-gray-500">Acompanhe sua evolução</p>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 text-white px-4 py-2.5 rounded-xl font-medium"
        >
          <Plus size={16} /> Registrar
        </button>
      </div>

      {/* Summary cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card p-5">
            <p className="text-xs text-gray-400 mb-1">Peso atual</p>
            <p className="text-2xl font-bold text-gray-900">{summary.currentWeight ? `${summary.currentWeight}kg` : '—'}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs text-gray-400 mb-1">Variação total</p>
            <p className={`text-2xl font-bold ${summary.weightChange < 0 ? 'text-primary-600' : summary.weightChange > 0 ? 'text-red-500' : 'text-gray-900'}`}>
              {summary.weightChange !== null ? `${summary.weightChange > 0 ? '+' : ''}${summary.weightChange}kg` : '—'}
            </p>
          </div>
          <div className="card p-5">
            <p className="text-xs text-gray-400 mb-1">Treinos realizados</p>
            <p className="text-2xl font-bold text-gray-900">{summary.totalWorkouts}</p>
          </div>
          <div className="card p-5">
            <p className="text-xs text-gray-400 mb-1">Refeições registradas</p>
            <p className="text-2xl font-bold text-gray-900">{summary.totalMealsLogged}</p>
          </div>
        </div>
      )}

      {/* Chart */}
      {logs.length > 1 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Evolução do Peso (90 dias)</h2>
          <ProgressChart data={logs} />
        </div>
      )}

      {/* Log form modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Registrar Progresso</h2>
            <form onSubmit={logProgress} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { key: 'weightKg', label: 'Peso (kg)' },
                  { key: 'waistCm', label: 'Cintura (cm)' },
                  { key: 'hipCm', label: 'Quadril (cm)' },
                  { key: 'armCm', label: 'Braço (cm)' },
                  { key: 'legCm', label: 'Perna (cm)' },
                ].map((f) => (
                  <div key={f.key}>
                    <label className="text-xs font-medium text-gray-600 mb-1 block">{f.label}</label>
                    <input
                      type="number"
                      step="0.1"
                      value={(form as any)[f.key]}
                      onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                      className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    />
                  </div>
                ))}
              </div>
              <div>
                <label className="text-xs font-medium text-gray-600 mb-1 block">Observações</label>
                <textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  className="w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                />
              </div>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 border border-gray-200 text-gray-600 py-2.5 rounded-xl font-medium hover:bg-gray-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="flex-1 bg-primary-500 hover:bg-primary-600 text-white py-2.5 rounded-xl font-medium"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* History */}
      {logs.length === 0 && (
        <div className="card p-12 text-center">
          <TrendingUp size={48} className="text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">Nenhum registro ainda. Comece a rastrear seu progresso!</p>
        </div>
      )}

      {logs.length > 0 && (
        <div className="card p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Histórico</h2>
          <div className="space-y-2">
            {logs.slice(0, 20).map((log: any) => (
              <div key={log.id} className="flex items-center justify-between py-3 border-b border-gray-100 last:border-0">
                <span className="text-sm text-gray-500">
                  {new Date(log.loggedAt).toLocaleDateString('pt-BR')}
                </span>
                <div className="flex gap-4 text-sm">
                  {log.weightKg && <span className="font-medium">{log.weightKg}kg</span>}
                  {log.waistCm && <span className="text-gray-500">Cin: {log.waistCm}cm</span>}
                  {log.notes && <span className="text-gray-400 italic truncate max-w-[150px]">{log.notes}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
