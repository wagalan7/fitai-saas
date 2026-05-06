'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronRight, ChevronLeft, Check } from 'lucide-react';
import { api } from '@/lib/api';

const STEPS = [
  {
    id: 'basics',
    title: 'Vamos nos conhecer',
    subtitle: 'Informações básicas para personalizar sua experiência',
    fields: [
      { key: 'age', label: 'Qual é a sua idade?', type: 'number', placeholder: 'Ex: 28', suffix: 'anos' },
      { key: 'weightKg', label: 'Qual é o seu peso atual?', type: 'number', placeholder: 'Ex: 75', suffix: 'kg', step: '0.1' },
      { key: 'heightCm', label: 'Qual é a sua altura?', type: 'number', placeholder: 'Ex: 175', suffix: 'cm' },
    ],
  },
  {
    id: 'goal',
    title: 'Qual é o seu objetivo?',
    subtitle: 'Isso define toda a sua estratégia',
    type: 'choice',
    key: 'fitnessGoal',
    options: [
      { value: 'LOSE_WEIGHT', label: '🔥 Perder gordura', desc: 'Reduzir peso e melhorar composição corporal' },
      { value: 'GAIN_MUSCLE', label: '💪 Ganhar massa', desc: 'Aumentar massa muscular e força' },
      { value: 'MAINTAIN', label: '⚖️ Manter peso', desc: 'Manter o físico atual saudável' },
      { value: 'IMPROVE_ENDURANCE', label: '🏃 Melhorar resistência', desc: 'Aumentar capacidade cardiovascular' },
      { value: 'IMPROVE_FLEXIBILITY', label: '🧘 Flexibilidade', desc: 'Mobilidade e bem-estar geral' },
      { value: 'GENERAL_FITNESS', label: '⭐ Saúde geral', desc: 'Melhorar saúde e qualidade de vida' },
    ],
  },
  {
    id: 'level',
    title: 'Qual é o seu nível de treino?',
    subtitle: 'Seja honesto — é para o seu bem!',
    type: 'choice',
    key: 'fitnessLevel',
    options: [
      { value: 'BEGINNER', label: '🌱 Iniciante', desc: 'Pouca ou nenhuma experiência com exercícios' },
      { value: 'INTERMEDIATE', label: '📈 Intermediário', desc: '1-2 anos de treino consistente' },
      { value: 'ADVANCED', label: '🏆 Avançado', desc: '3+ anos, conhecimento técnico sólido' },
      { value: 'ATHLETE', label: '⚡ Atleta', desc: 'Atleta ativo ou profissional' },
    ],
  },
  {
    id: 'schedule',
    title: 'Como é sua rotina?',
    subtitle: 'Para montar um plano realista',
    fields: [
      { key: 'workoutsPerWeek', label: 'Quantos dias por semana você pode treinar?', type: 'number', placeholder: 'Ex: 4', min: 1, max: 7, suffix: 'dias/semana' },
      { key: 'workoutDuration', label: 'Quanto tempo você tem por treino?', type: 'number', placeholder: 'Ex: 60', suffix: 'minutos' },
    ],
  },
  {
    id: 'restrictions',
    title: 'Restrições e preferências',
    subtitle: 'Para garantir sua segurança e prazer no processo',
    type: 'textarea-multi',
    fields: [
      { key: 'injuries', label: 'Tem alguma lesão ou limitação física?', placeholder: 'Ex: joelho direito, dor nas costas... (ou "nenhuma")', rows: 2 },
      { key: 'dietaryRestrictions', label: 'Restrições alimentares?', placeholder: 'Ex: vegetariano, intolerante à lactose, alergia a amendoim... (ou "nenhuma")', rows: 2 },
      { key: 'availableEquipment', label: 'Quais equipamentos você tem disponível?', placeholder: 'Ex: academia completa, halteres em casa, apenas peso corporal', rows: 2 },
    ],
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;

  function updateAnswer(key: string, value: any) {
    setAnswers((prev) => ({ ...prev, [key]: value }));
  }

  function parseAnswers(raw: Record<string, any>) {
    const parsed = { ...raw };
    if (parsed.age) parsed.age = +parsed.age;
    if (parsed.weightKg) parsed.weightKg = +parsed.weightKg;
    if (parsed.heightCm) parsed.heightCm = +parsed.heightCm;
    if (parsed.workoutsPerWeek) parsed.workoutsPerWeek = +parsed.workoutsPerWeek;
    if (parsed.workoutDuration) parsed.workoutDuration = +parsed.workoutDuration;

    // Convert textarea strings to arrays
    for (const key of ['injuries', 'dietaryRestrictions', 'availableEquipment']) {
      if (typeof parsed[key] === 'string') {
        const val = parsed[key].trim().toLowerCase();
        parsed[key] = val === 'nenhuma' || val === 'nenhum' || val === '' ? [] : [parsed[key]];
      }
    }
    return parsed;
  }

  async function handleNext() {
    if (isLast) {
      setLoading(true);
      try {
        const finalAnswers = parseAnswers(answers);
        await api.post('/onboarding/complete', finalAnswers);
        router.push('/dashboard');
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    } else {
      setStep((s) => s + 1);
    }
  }

  const canProceed = () => {
    const s = currentStep;
    if (s.type === 'choice') return !!answers[s.key as string];
    if (s.fields) return s.fields.every((f) => !!answers[f.key]);
    return true;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        {/* Progress */}
        <div className="flex gap-1 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full flex-1 transition-all duration-500 ${
                i <= step ? 'bg-primary-500' : 'bg-gray-600'
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.3 }}
            className="bg-gray-800 border border-gray-700 rounded-2xl p-8"
          >
            <h2 className="text-white text-2xl font-bold mb-2">{currentStep.title}</h2>
            <p className="text-gray-400 mb-8">{currentStep.subtitle}</p>

            {/* Choice step */}
            {currentStep.type === 'choice' && (
              <div className="grid grid-cols-1 gap-3">
                {currentStep.options!.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => updateAnswer(currentStep.key!, opt.value)}
                    className={`text-left p-4 rounded-xl border-2 transition-all ${
                      answers[currentStep.key!] === opt.value
                        ? 'border-primary-500 bg-primary-500/10'
                        : 'border-gray-600 hover:border-gray-500 bg-gray-700/30'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-white font-medium">{opt.label}</div>
                        <div className="text-gray-400 text-sm">{opt.desc}</div>
                      </div>
                      {answers[currentStep.key!] === opt.value && (
                        <Check size={18} className="text-primary-400 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Fields step */}
            {!currentStep.type && currentStep.fields && (
              <div className="space-y-5">
                {currentStep.fields.map((field: any) => (
                  <div key={field.key}>
                    <label className="text-gray-300 text-sm font-medium mb-2 block">{field.label}</label>
                    <div className="flex items-center gap-2">
                      <input
                        type={field.type}
                        placeholder={field.placeholder}
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={answers[field.key] || ''}
                        onChange={(e) => updateAnswer(field.key, e.target.value)}
                        className="flex-1 bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500"
                      />
                      {field.suffix && (
                        <span className="text-gray-400 text-sm whitespace-nowrap">{field.suffix}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Textarea multi */}
            {currentStep.type === 'textarea-multi' && currentStep.fields && (
              <div className="space-y-5">
                {currentStep.fields.map((field: any) => (
                  <div key={field.key}>
                    <label className="text-gray-300 text-sm font-medium mb-2 block">{field.label}</label>
                    <textarea
                      rows={field.rows || 2}
                      placeholder={field.placeholder}
                      value={answers[field.key] || ''}
                      onChange={(e) => updateAnswer(field.key, e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                    />
                  </div>
                ))}
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-8">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors px-4 py-3"
                >
                  <ChevronLeft size={18} />
                  Voltar
                </button>
              )}
              <button
                onClick={handleNext}
                disabled={!canProceed() || loading}
                className="flex-1 flex items-center justify-center gap-2 bg-primary-500 hover:bg-primary-600 disabled:opacity-50 text-white font-semibold py-3 rounded-xl transition-colors"
              >
                {loading ? 'Criando seu plano...' : isLast ? 'Criar meu plano' : 'Continuar'}
                {!loading && <ChevronRight size={18} />}
              </button>
            </div>
          </motion.div>
        </AnimatePresence>

        <p className="text-gray-500 text-sm text-center mt-4">
          Passo {step + 1} de {STEPS.length}
        </p>
      </div>
    </div>
  );
}
