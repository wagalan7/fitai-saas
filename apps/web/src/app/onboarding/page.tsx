'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Camera, ChevronRight, ChevronLeft, Check, X } from 'lucide-react';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';

/**
 * Read a File as base64 (no `data:` prefix). The /onboarding/evaluation
 * endpoint expects raw base64 and a separate mimeType field — keeps the
 * JSON payload smaller than a data URL and lets the server compose the
 * data URL itself when calling Groq's vision API.
 */
function fileToBase64(file: File): Promise<{ data: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      // result looks like "data:image/jpeg;base64,XXXXX"
      const commaIdx = result.indexOf(',');
      resolve({
        data: commaIdx >= 0 ? result.slice(commaIdx + 1) : result,
        mimeType: file.type || 'image/jpeg',
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

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
    id: 'gender',
    title: 'Qual é o seu sexo biológico?',
    subtitle: 'Essencial para personalizar treino e nutrição corretamente',
    type: 'choice',
    key: 'genderIdentity',
    options: [
      { value: 'MALE', label: '♂️ Masculino', desc: 'Treino e dieta adaptados ao organismo masculino' },
      { value: 'FEMALE', label: '♀️ Feminino', desc: 'Treino e dieta adaptados ao organismo feminino' },
      { value: 'OTHER', label: '⚧️ Outro / Prefiro não informar', desc: 'Plano equilibrado e personalizado' },
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
  {
    // Mandatory-but-skippable evaluation. Skipping is allowed because some
    // users won't have privacy / a camera handy at signup — but we strongly
    // recommend doing it now because the resulting analysis becomes part of
    // the context the TRAINER and NUTRITIONIST agents read on every
    // generation. Without it they're flying blind on actual body composition.
    id: 'evaluation',
    title: 'Avaliação inicial com Dr Shape',
    subtitle: 'Foto do físico atual → plano calibrado de verdade. Leva 30 segundos.',
    type: 'photo',
  },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  // Photos selected on the evaluation step. Each is { data, mimeType, preview }
  // where `preview` is a data URL just for the thumbnail render.
  const [photos, setPhotos] = useState<Array<{ data: string; mimeType: string; preview: string }>>([]);
  const [evalNotes, setEvalNotes] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const isEvaluation = currentStep.id === 'evaluation';

  async function onPickFiles(files: FileList | null) {
    if (!files?.length) return;
    const next: typeof photos = [...photos];
    // Cap at 4 to keep the payload reasonable (~4 × 1MB after compression).
    for (let i = 0; i < files.length && next.length < 4; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;
      try {
        const { data, mimeType } = await fileToBase64(file);
        next.push({ data, mimeType, preview: `data:${mimeType};base64,${data}` });
      } catch {
        toast.error('Não consegui ler uma das fotos. Tenta outra.');
      }
    }
    setPhotos(next);
  }

  function removePhoto(idx: number) {
    setPhotos((prev) => prev.filter((_, i) => i !== idx));
  }

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

  /**
   * Final pipeline on the last step:
   *   1. POST /onboarding/complete (saves profile)
   *   2. If photos: POST /onboarding/evaluation (Dr Shape)
   *   3. Parallel POST /workouts/generate + /nutrition/generate
   *   4. router.push(/dashboard)
   * The eval step shows its own loading overlay; generation shows another.
   * On error at any stage we still try the next stage — better to give the
   * user *something* than block them at signup.
   */
  async function finishOnboarding(opts: { skipEvaluation: boolean }) {
    setLoading(true);
    try {
      const finalAnswers = parseAnswers(answers);
      await api.post('/onboarding/complete', finalAnswers);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao salvar perfil. Tente novamente.');
      setLoading(false);
      return;
    }

    if (!opts.skipEvaluation && photos.length > 0) {
      setEvaluating(true);
      try {
        await api.post(
          '/onboarding/evaluation',
          {
            images: photos.map((p) => ({ data: p.data, mimeType: p.mimeType })),
            notes: evalNotes.trim() || undefined,
          },
          { timeout: 90000 },
        );
        toast.success('Dr Shape registrou sua avaliação inicial.');
      } catch (err: any) {
        // Don't block — proceed to generation. The user can redo the
        // evaluation later from the Dr Shape page.
        console.warn('Initial evaluation failed:', err);
        toast.info(err?.response?.data?.message || 'Avaliação adiada. Você pode fazer pelo Dr Shape depois.');
      } finally {
        setEvaluating(false);
      }
    } else if (opts.skipEvaluation) {
      // Best-effort log on the server; don't await aggressively.
      api.post('/onboarding/evaluation/skip').catch(() => {});
    }

    setGenerating(true);
    const [workout, nutrition] = await Promise.allSettled([
      api.post('/workouts/generate', {}, { timeout: 90000 }),
      api.post('/nutrition/generate', {}, { timeout: 90000 }),
    ]);

    if (workout.status === 'fulfilled' && nutrition.status === 'fulfilled') {
      toast.success('Seu plano de treino e dieta estão prontos!');
    } else if (workout.status === 'fulfilled') {
      toast.info('Treino criado. A dieta pode ser gerada depois pela Nutricionista.');
    } else if (nutrition.status === 'fulfilled') {
      toast.info('Dieta criada. O treino pode ser gerado depois pelo Trainer.');
    } else {
      toast.info('Perfil salvo. Peça seu plano ao Trainer e Nutricionista no chat.');
    }

    router.push('/dashboard');
  }

  async function handleNext() {
    if (isLast) {
      // On the evaluation step "Continuar" means "submit with photos".
      // If the user clicked the dedicated Skip link below, finishOnboarding
      // is invoked separately with skipEvaluation=true.
      await finishOnboarding({ skipEvaluation: photos.length === 0 });
    } else {
      setStep((s) => s + 1);
    }
  }

  const canProceed = () => {
    const s = currentStep;
    if (s.type === 'choice') return !!answers[s.key as string];
    // Photo step: button label flips to "Continuar com avaliação" when at
    // least one photo is loaded; without photos the user has to use the
    // "Pular por agora" link to advance. canProceed gates the main CTA only.
    if (s.type === 'photo') return photos.length > 0;
    if (s.fields) return s.fields.every((f) => !!answers[f.key]);
    return true;
  };

  if (evaluating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-block animate-spin w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full mb-6" />
          <h2 className="text-white text-2xl font-bold mb-3">Dr Shape analisando seu físico…</h2>
          <p className="text-gray-400 mb-6">
            Isso leva uns 20–40 segundos. Nossa análise vira parte do contexto que o
            Trainer e a Nutricionista usam pra montar seus planos.
          </p>
        </div>
      </div>
    );
  }

  if (generating) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-900 to-gray-800 flex items-center justify-center p-4">
        <div className="w-full max-w-md text-center">
          <div className="inline-block animate-spin w-12 h-12 border-4 border-primary-500 border-t-transparent rounded-full mb-6" />
          <h2 className="text-white text-2xl font-bold mb-3">Criando seu plano personalizado</h2>
          <p className="text-gray-400 mb-6">
            Nossos especialistas estão montando seu treino e dieta com base no seu perfil. Isso pode levar até 1 minuto.
          </p>
          <div className="space-y-2 text-left text-sm text-gray-300">
            <div className="flex items-center gap-2"><span className="text-primary-400">💪</span> Personal Trainer montando seu treino…</div>
            <div className="flex items-center gap-2"><span className="text-primary-400">🥗</span> Nutricionista calculando macros e refeições…</div>
          </div>
        </div>
      </div>
    );
  }

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

            {/* Photo / evaluation step */}
            {currentStep.type === 'photo' && (
              <div className="space-y-4">
                <div className="rounded-xl border border-primary-500/30 bg-primary-500/5 p-4 text-sm text-gray-300">
                  <p className="font-medium text-white mb-1">Por que isso importa</p>
                  <p>
                    Sem foto, o Trainer e a Nutricionista trabalham só com peso/altura — chutam composição corporal.
                    Com 1–3 fotos (frente, costas e lateral, se possível), eles ajustam o plano de verdade.
                  </p>
                </div>

                {photos.length > 0 && (
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {photos.map((p, i) => (
                      <div key={i} className="relative aspect-square bg-gray-900 rounded-lg overflow-hidden border border-gray-700">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={p.preview} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          type="button"
                          onClick={() => removePhoto(i)}
                          className="absolute top-1.5 right-1.5 bg-black/70 text-white rounded-full p-1 hover:bg-black"
                          aria-label="Remover foto"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  // `capture` is a hint to mobile browsers to open the camera directly.
                  // Desktop browsers just ignore it and show the regular file picker.
                  // @ts-ignore — non-standard but widely supported attribute
                  capture="environment"
                  onChange={(e) => { onPickFiles(e.target.files); e.target.value = ''; }}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={photos.length >= 4}
                  className="w-full flex items-center justify-center gap-2 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium py-3 rounded-xl transition-colors"
                >
                  <Camera size={18} />
                  {photos.length === 0 ? 'Adicionar foto(s)' : photos.length >= 4 ? 'Máximo de 4 fotos' : 'Adicionar mais fotos'}
                </button>

                <div>
                  <label className="text-gray-300 text-sm font-medium mb-2 block">
                    Observações (opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={evalNotes}
                    onChange={(e) => setEvalNotes(e.target.value.slice(0, 500))}
                    placeholder="Ex: foco em definição abdominal, costas fracas, etc."
                    className="w-full bg-gray-700 border border-gray-600 rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 resize-none"
                  />
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex items-center gap-3 mt-8">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors px-4 py-3"
                  disabled={loading}
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
                {loading
                  ? 'Salvando…'
                  : isEvaluation
                  ? 'Continuar com avaliação'
                  : isLast
                  ? 'Criar meu plano'
                  : 'Continuar'}
                {!loading && <ChevronRight size={18} />}
              </button>
            </div>

            {isEvaluation && (
              <button
                type="button"
                onClick={() => finishOnboarding({ skipEvaluation: true })}
                disabled={loading}
                className="block w-full text-center text-gray-500 hover:text-gray-300 text-sm mt-4 underline-offset-2 hover:underline"
              >
                Pular avaliação por agora (seu plano fica menos preciso)
              </button>
            )}
          </motion.div>
        </AnimatePresence>

        <p className="text-gray-500 text-sm text-center mt-4">
          Passo {step + 1} de {STEPS.length}
        </p>
      </div>
    </div>
  );
}
