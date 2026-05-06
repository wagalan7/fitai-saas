'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Salad, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';

export default function NutritionPage() {
  const [plan, setPlan] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => { loadPlan(); }, []);

  async function loadPlan() {
    setLoading(true);
    try {
      const { data } = await api.get('/nutrition/plan');
      setPlan(data);
    } finally {
      setLoading(false);
    }
  }

  async function generatePlan() {
    setGenerating(true);
    try {
      const { data } = await api.post('/nutrition/generate');
      setPlan(data);
    } finally {
      setGenerating(false);
    }
  }

  if (loading) return <div className="flex items-center justify-center h-64"><div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" /></div>;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Minha Dieta</h1>
          <p className="text-gray-500">Plano alimentar personalizado por IA</p>
        </div>
        <button
          onClick={generatePlan}
          disabled={generating}
          className="flex items-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white px-4 py-2.5 rounded-xl font-medium transition-colors"
        >
          <RefreshCw size={16} className={generating ? 'animate-spin' : ''} />
          {generating ? 'Calculando...' : plan ? 'Atualizar' : 'Gerar Dieta'}
        </button>
      </div>

      {!plan && !generating && (
        <div className="card p-12 text-center">
          <Salad size={48} className="text-gray-300 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-600 mb-2">Nenhum plano ainda</h2>
          <p className="text-gray-400 mb-6">Gere seu plano alimentar personalizado</p>
          <button onClick={generatePlan} className="bg-primary-500 hover:bg-primary-600 text-white px-6 py-3 rounded-xl font-medium">
            Gerar meu plano agora
          </button>
        </div>
      )}

      {generating && (
        <div className="card p-12 text-center">
          <div className="animate-spin w-12 h-12 border-2 border-primary-500 border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-gray-600 font-medium">Calculando seu plano nutricional...</p>
        </div>
      )}

      {plan && !generating && (
        <>
          {/* Macro summary */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MacroCard label="Calorias" value={`${plan.calories}`} unit="kcal" color="bg-orange-50 text-orange-600" />
            <MacroCard label="Proteína" value={`${plan.proteinG}g`} unit="proteína" color="bg-blue-50 text-blue-600" />
            <MacroCard label="Carboidratos" value={`${plan.carbsG}g`} unit="carbos" color="bg-yellow-50 text-yellow-600" />
            <MacroCard label="Gorduras" value={`${plan.fatG}g`} unit="gordura" color="bg-red-50 text-red-600" />
          </div>

          {/* Meals */}
          <div className="space-y-3">
            {plan.meals?.map((meal: any) => (
              <div key={meal.id} className="card overflow-hidden">
                <button
                  onClick={() => setExpanded(expanded === meal.id ? null : meal.id)}
                  className="w-full flex items-center gap-4 p-5 text-left hover:bg-gray-50 transition-colors"
                >
                  <div className="w-12 h-12 bg-primary-100 rounded-xl flex items-center justify-center flex-shrink-0">
                    <Salad size={20} className="text-primary-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">{meal.name}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{meal.calories} kcal · P: {meal.proteinG}g · C: {meal.carbsG}g · G: {meal.fatG}g</p>
                  </div>
                  <span className="text-gray-400">{expanded === meal.id ? <ChevronUp size={18} /> : <ChevronDown size={18} />}</span>
                </button>

                {expanded === meal.id && (
                  <div className="border-t border-gray-100 p-5 space-y-3">
                    {meal.foods?.map((food: any) => (
                      <div key={food.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-xl">
                        <div>
                          <p className="font-medium text-gray-900 text-sm">{food.name}</p>
                          <p className="text-xs text-gray-400">{food.quantityG}g · {food.calories} kcal</p>
                          {food.alternatives?.length > 0 && (
                            <p className="text-xs text-primary-600 mt-1">
                              Alt: {food.alternatives.join(', ')}
                            </p>
                          )}
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <div>P: {food.proteinG}g</div>
                          <div>C: {food.carbsG}g</div>
                          <div>G: {food.fatG}g</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function MacroCard({ label, value, unit, color }: any) {
  return (
    <div className="card p-5 text-center">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-sm font-medium text-gray-700 mt-1">{label}</p>
      <p className="text-xs text-gray-400">{unit}/dia</p>
    </div>
  );
}
