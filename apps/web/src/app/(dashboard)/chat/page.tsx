'use client';

import { useEffect, useRef, useState, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Send, Plus, Dumbbell, Salad, Brain, TrendingUp, Camera, X, ImageIcon, Play } from 'lucide-react';
import Link from 'next/link';
import { useChatStore } from '@/store/chat.store';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { useAuthStore } from '@/store/auth.store';

type AgentType = 'TRAINER' | 'NUTRITIONIST' | 'COACH' | 'ANALYST' | 'EVALUATOR';

// Detect if an assistant message actually contains a structured plan worth saving.
// Requires strong signals: at least 2 days + 2 exercise names, or 2 meals + macro numbers.
function looksLikePlan(content: string, agentType: AgentType): boolean {
  if (agentType === 'TRAINER') {
    const days = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];
    const dayCount = days.filter(d => content.toLowerCase().includes(d)).length;
    const exercises = ['supino', 'agachamento', 'rosca', 'remada', 'leg press', 'stiff', 'afundo', 'hip thrust', 'puxada', 'desenvolvimento', 'tríceps', 'bíceps', 'panturrilha', 'prancha', 'levantamento terra'];
    const exCount = exercises.filter(e => content.toLowerCase().includes(e)).length;
    return dayCount >= 2 && exCount >= 2;
  }
  if (agentType === 'NUTRITIONIST') {
    const meals = ['café da manhã', 'almoço', 'jantar', 'lanche', 'pré-treino', 'pós-treino'];
    const mealCount = meals.filter(m => content.toLowerCase().includes(m)).length;
    const hasMacro = /\d+\s*g\s*(de\s*)?(proteína|carb|gordura)|\d+\s*kcal/i.test(content);
    return mealCount >= 2 && hasMacro;
  }
  return false;
}

// Detect if Dr Shape (EVALUATOR) produced a real body-composition analysis.
// Requires the response to have at least two of the section markers AND
// substantial length. This avoids triggering on greetings/clarifications.
function looksLikeEvaluation(content: string): boolean {
  if (!content || content.length < 400) return false;
  const markers = [
    'avaliação corporal',
    'pontos positivos',
    'áreas de desenvolvimento',
    'recomendações de treino',
    'ajustes nutricionais',
    'composição corporal',
    'percentual de gordura',
  ];
  const hits = markers.filter((m) => content.toLowerCase().includes(m)).length;
  return hits >= 2;
}

const AGENTS: Record<AgentType, { label: string; icon: React.ReactNode; color: string; welcome: string; supportsImage?: boolean }> = {
  TRAINER: {
    label: 'Personal Trainer',
    icon: <Dumbbell size={18} />,
    color: 'text-blue-600 bg-blue-100',
    welcome: 'Olá! Sou seu personal trainer de IA. Posso criar treinos, ajustar exercícios ou tirar dúvidas sobre técnica. Como posso te ajudar hoje?',
  },
  NUTRITIONIST: {
    label: 'Nutricionista',
    icon: <Salad size={18} />,
    color: 'text-gray-800 bg-gray-200',
    welcome: 'Olá! Sou sua nutricionista de IA. Posso criar dietas, calcular macros ou ajudar com substituições alimentares. O que você precisa?',
  },
  COACH: {
    label: 'Coach Motivacional',
    icon: <Brain size={18} />,
    color: 'text-purple-600 bg-purple-100',
    welcome: 'Olá! Sou seu coach de IA. Estou aqui para te apoiar na jornada, trabalhar mentalidade e manter sua consistência. Como você está hoje?',
  },
  ANALYST: {
    label: 'Analista de Progresso',
    icon: <TrendingUp size={18} />,
    color: 'text-orange-600 bg-orange-100',
    welcome: 'Olá! Sou seu analista de performance. Posso analisar sua evolução, identificar padrões e gerar insights sobre seu progresso. O que quer analisar?',
  },
  EVALUATOR: {
    label: 'Avaliador Corporal',
    icon: <Camera size={18} />,
    color: 'text-pink-600 bg-pink-100',
    welcome: 'Olá! Sou o Dr. Shape, seu especialista em avaliação corporal. Para uma avaliação completa, envie 3 fotos: 1 de frente, 1 de costas e 1 de lateral. Com base nelas vou montar um novo plano de treino e dieta. 📸',
    supportsImage: true,
  },
};

interface ChatMessage {
  role: string;
  content: string;
  imagePreview?: string;        // legacy single-image (kept for back-compat)
  imagePreviews?: string[];     // multi-image (Dr Shape body evaluation)
  streaming?: boolean;
  savedPlan?: 'saving' | 'saved' | 'error';
  saveError?: string;
  autoRegenTriggered?: boolean;
}

// Render markdown-like formatting inline
function renderInline(text: string): React.ReactNode[] {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return <span key={i}>{part}</span>;
  });
}

// Extract exercise names from a line for the animation button
function extractExerciseName(line: string): string | null {
  // Match patterns like: "**Exercício 1 — Supino Reto**" or "- **Supino Reto**"
  const boldMatch = line.match(/\*\*([^*]{4,60})\*\*/);
  if (!boldMatch) return null;
  const name = boldMatch[1].trim();
  // Filter out section headers and metadata
  if (/^(treino|dia|semana|grupo|muscular|aquecimento|volta à calma|obs|dica|note|atenção|importante)/i.test(name)) return null;
  if (/^\d+\s*[—–-]/.test(name)) {
    // "1 — Supino Reto" → extract after the dash
    const afterDash = name.replace(/^\d+\s*[—–-]\s*/, '').trim();
    return afterDash || null;
  }
  return name;
}

function MessageContent({ content, agentType, streaming }: { content: string; agentType: AgentType; streaming?: boolean }) {
  const lines = content.split('\n');
  const isTrainer = agentType === 'TRAINER';

  return (
    <div className="text-sm leading-relaxed space-y-0.5">
      {lines.map((line, i) => {
        const exerciseName = isTrainer ? extractExerciseName(line) : null;
        const trimmed = line.trim();

        if (trimmed === '') return <div key={i} className="h-2" />;

        if (trimmed.startsWith('#')) {
          const level = trimmed.match(/^#+/)?.[0].length ?? 1;
          const text = trimmed.replace(/^#+\s*/, '');
          const cls = level === 1 ? 'font-bold text-base mt-2' : level === 2 ? 'font-semibold mt-2' : 'font-medium mt-1';
          return <p key={i} className={cls}>{text}</p>;
        }

        return (
          <div key={i} className="flex flex-wrap items-center gap-x-2">
            <p>{renderInline(line)}</p>
            {exerciseName && (
              <a
                href={`https://www.youtube.com/results?search_query=${encodeURIComponent(exerciseName + ' como fazer execução')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-0.5 rounded-full transition-colors flex-shrink-0"
                title={`Ver como fazer: ${exerciseName}`}
              >
                <Play size={10} fill="currentColor" />
                Ver como fazer
              </a>
            )}
          </div>
        );
      })}
      {streaming && <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 rounded-sm" />}
    </div>
  );
}

function ChatPageInner() {
  const searchParams = useSearchParams();
  const defaultAgent = (searchParams.get('agent') as AgentType) || 'TRAINER';
  const fromDrShape = searchParams.get('from') === 'drshape';

  const [activeAgent, setActiveAgent] = useState<AgentType>(defaultAgent);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  // Multi-image support: Dr Shape needs front/back/side photos for a real
  // body-composition read. Other agents currently don't use images.
  const [selectedImages, setSelectedImages] = useState<Array<{ file: File; preview: string }>>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const autoSentRef = useRef(false);
  const pendingAutoSend = useRef<{ sessionId: string; agent: AgentType } | null>(null);
  const { token } = useAuthStore();
  const { socket, connected } = useSocket(token);

  async function startNewSession(agent: AgentType = activeAgent) {
    const { data } = await api.post('/chat/sessions', {
      agentType: agent,
      title: `${AGENTS[agent].label} — ${new Date().toLocaleDateString('pt-BR')}`,
    });
    setSessionId(data.id);
    setMessages([{ role: 'assistant', content: AGENTS[agent].welcome }]);
    setSelectedImages([]);

    if (fromDrShape && !autoSentRef.current) {
      autoSentRef.current = true;
      const autoMessage = 'Com base na minha avaliação corporal mais recente do Dr. Shape, por favor ajuste meu plano para focar nas áreas indicadas para melhoria.';
      setMessages((prev) => [...prev, { role: 'user', content: autoMessage }]);
      if (socket) {
        socket.emit('message', { sessionId: data.id, agentType: agent, content: autoMessage });
      } else {
        // Socket not ready yet — store for sending once socket connects
        pendingAutoSend.current = { sessionId: data.id, agent };
      }
    }
  }

  useEffect(() => {
    startNewSession(activeAgent);
  }, [activeAgent]);

  // Flush pending auto-send once socket connects
  useEffect(() => {
    if (!socket || !pendingAutoSend.current) return;
    const { sessionId: sid, agent } = pendingAutoSend.current;
    pendingAutoSend.current = null;
    const autoMessage = 'Com base na minha avaliação corporal mais recente do Dr. Shape, por favor ajuste meu plano para focar nas áreas indicadas para melhoria.';
    socket.emit('message', { sessionId: sid, agentType: agent, content: autoMessage });
  }, [socket]);

  useEffect(() => {
    if (!socket) return;

    socket.on('stream:start', () => {
      setIsStreaming(true);
      setMessages((prev) => [...prev, { role: 'assistant', content: '', streaming: true }]);
    });

    socket.on('stream:chunk', ({ delta }: { delta: string }) => {
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.streaming) {
          updated[updated.length - 1] = { ...last, content: last.content + delta };
        }
        return updated;
      });
    });

    socket.on('stream:end', () => {
      setIsStreaming(false);
      setMessages((prev) => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last?.streaming) {
          const finalized = { ...last, streaming: false };
          updated[updated.length - 1] = finalized;

          // Auto-save plan if the message looks like one
          if (
            (activeAgent === 'TRAINER' || activeAgent === 'NUTRITIONIST') &&
            looksLikePlan(finalized.content, activeAgent) &&
            !finalized.savedPlan
          ) {
            // Trigger save async — index is last element
            setTimeout(() => {
              setMessages((msgs) => {
                const idx = msgs.length - 1;
                if (msgs[idx]?.savedPlan) return msgs; // already saving/saved
                const next = [...msgs];
                next[idx] = { ...next[idx], savedPlan: 'saving' };
                return next;
              });
              const endpoint = activeAgent === 'TRAINER'
                ? '/workouts/save-from-chat'
                : '/nutrition/save-from-chat';
              const startedAt = Date.now();
              api.post(endpoint, { text: finalized.content }, { timeout: 60000 })
                .then(() => {
                  setMessages((msgs) => {
                    const idx = msgs.length - 1;
                    const next = [...msgs];
                    next[idx] = { ...next[idx], savedPlan: 'saved' };
                    return next;
                  });
                  toast.success(activeAgent === 'TRAINER'
                    ? 'Plano de treino salvo em Meus Treinos!'
                    : 'Plano alimentar salvo em Nutrição!');
                })
                .catch(async (err: any) => {
                  // The save may have actually succeeded server-side even though
                  // we received an error (proxy/edge timeout, idempotency dedup
                  // returning a stale rejected promise, etc.). Verify by checking
                  // if a plan was created in the last ~2 min before showing error.
                  try {
                    const verifyUrl = activeAgent === 'TRAINER' ? '/workouts/plan' : '/nutrition/plan';
                    const { data } = await api.get(verifyUrl);
                    const createdAt = data?.createdAt ? new Date(data.createdAt).getTime() : 0;
                    if (createdAt && Date.now() - createdAt < 120_000 && createdAt >= startedAt - 5_000) {
                      // Plan was actually saved — treat as success.
                      setMessages((msgs) => {
                        const idx = msgs.length - 1;
                        const next = [...msgs];
                        next[idx] = { ...next[idx], savedPlan: 'saved' };
                        return next;
                      });
                      toast.success(activeAgent === 'TRAINER'
                        ? 'Plano de treino salvo em Meus Treinos!'
                        : 'Plano alimentar salvo em Nutrição!');
                      return;
                    }
                  } catch {
                    // Verification failed — fall through to error state.
                  }
                  const msg = err?.response?.data?.message || 'Erro ao salvar plano';
                  setMessages((msgs) => {
                    const idx = msgs.length - 1;
                    const next = [...msgs];
                    next[idx] = { ...next[idx], savedPlan: 'error', saveError: msg };
                    return next;
                  });
                });
            }, 0);
          }

          // Multi-agent orchestration: after Dr Shape (EVALUATOR) finishes a
          // substantial body analysis, automatically regenerate workout + diet
          // in background using the new evaluator memories. Heuristic: response
          // must look like a real evaluation (has analysis markers and >400 chars).
          if (
            activeAgent === 'EVALUATOR' &&
            looksLikeEvaluation(finalized.content) &&
            !finalized.autoRegenTriggered
          ) {
            updated[updated.length - 1] = { ...finalized, autoRegenTriggered: true };
            setTimeout(() => {
              toast.info('Atualizando seu treino e dieta com base na nova avaliação…');
              Promise.allSettled([
                api.post('/workouts/generate', {}, { timeout: 90000 }),
                api.post('/nutrition/generate', {}, { timeout: 90000 }),
              ]).then(([w, n]) => {
                const okW = w.status === 'fulfilled';
                const okN = n.status === 'fulfilled';
                if (okW && okN) toast.success('Treino e dieta atualizados em Meus Treinos e Nutrição!');
                else if (okW) toast.info('Treino atualizado. A dieta falhou — tente novamente.');
                else if (okN) toast.info('Dieta atualizada. O treino falhou — tente novamente.');
                else toast.error('Não consegui atualizar os planos. Tente em alguns minutos.');
              });
            }, 800);
          }
        }
        return updated;
      });
    });

    socket.on('stream:error', () => {
      setIsStreaming(false);
      setMessages((prev) => [
        ...prev.filter((m) => !m.streaming),
        { role: 'assistant', content: 'Desculpe, ocorreu um erro. Tente novamente.' },
      ]);
    });

    return () => {
      socket.off('stream:start');
      socket.off('stream:chunk');
      socket.off('stream:end');
      socket.off('stream:error');
    };
  }, [socket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Compress image to max 1280px on the longest side, JPEG 82% quality.
  // Phone photos can be 4-8MB raw; that overflows the WebSocket buffer and
  // the message gets silently dropped (= "Dr Shape ignored my photo").
  async function compressImage(file: File): Promise<{ blob: Blob; dataUrl: string }> {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const r = new FileReader();
      r.onloadend = () => resolve(r.result as string);
      r.onerror = reject;
      r.readAsDataURL(file);
    });

    return await new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const MAX = 1280;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          if (width >= height) { height = Math.round(height * (MAX / width)); width = MAX; }
          else { width = Math.round(width * (MAX / height)); height = MAX; }
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('No 2d context')); return; }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (!blob) { reject(new Error('toBlob failed')); return; }
            const r2 = new FileReader();
            r2.onloadend = () => resolve({ blob, dataUrl: r2.result as string });
            r2.onerror = reject;
            r2.readAsDataURL(blob);
          },
          'image/jpeg',
          0.82,
        );
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  async function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;

    const MAX_IMAGES = 5;
    const remaining = Math.max(0, MAX_IMAGES - selectedImages.length);
    const toAdd = files.slice(0, remaining);
    if (files.length > remaining) {
      toast.info(`Máximo de ${MAX_IMAGES} fotos por mensagem.`);
    }

    const processed = await Promise.all(
      toAdd.map(async (file) => {
        try {
          const { blob, dataUrl } = await compressImage(file);
          const compressed = new File([blob], file.name.replace(/\.[^.]+$/, '.jpg'), { type: 'image/jpeg' });
          return { file: compressed, preview: dataUrl };
        } catch {
          const dataUrl = await new Promise<string>((resolve, reject) => {
            const r = new FileReader();
            r.onloadend = () => resolve(r.result as string);
            r.onerror = reject;
            r.readAsDataURL(file);
          });
          return { file, preview: dataUrl };
        }
      }),
    );
    setSelectedImages((prev) => [...prev, ...processed]);
  }

  function removeImage(idx: number) {
    setSelectedImages((prev) => prev.filter((_, i) => i !== idx));
  }

  function clearImages() {
    setSelectedImages([]);
  }

  async function savePlan(index: number) {
    const msg = messages[index];
    if (!msg) return;

    setMessages((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], savedPlan: 'saving', saveError: undefined };
      return updated;
    });

    const startedAt = Date.now();
    try {
      if (activeAgent === 'TRAINER') {
        await api.post('/workouts/save-from-chat', { text: msg.content }, { timeout: 60000 });
      } else {
        await api.post('/nutrition/save-from-chat', { text: msg.content }, { timeout: 60000 });
      }
      setMessages((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], savedPlan: 'saved' };
        return updated;
      });
    } catch (err: any) {
      // Verify: the save may have succeeded even on error (proxy timeout, etc.)
      try {
        const verifyUrl = activeAgent === 'TRAINER' ? '/workouts/plan' : '/nutrition/plan';
        const { data } = await api.get(verifyUrl);
        const createdAt = data?.createdAt ? new Date(data.createdAt).getTime() : 0;
        if (createdAt && Date.now() - createdAt < 120_000 && createdAt >= startedAt - 5_000) {
          setMessages((prev) => {
            const updated = [...prev];
            updated[index] = { ...updated[index], savedPlan: 'saved' };
            return updated;
          });
          toast.success('Plano salvo!');
          return;
        }
      } catch {}
      const errMsg = err?.response?.data?.message || err?.message || 'Erro desconhecido';
      console.error('[savePlan] error:', errMsg, err?.response?.status);
      toast.error(`Erro ao salvar: ${errMsg}`);
      setMessages((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], savedPlan: 'error', saveError: errMsg };
        return updated;
      });
    }
  }

  async function sendMessage() {
    const hasImages = selectedImages.length > 0;
    const hasText = input.trim().length > 0;
    if ((!hasText && !hasImages) || isStreaming || !sessionId || !socket) return;

    // Dr Shape (EVALUATOR) needs at least 3 photos (front/back/side) to give
    // a meaningful composition read. Warn but still allow override via confirm.
    if (activeAgent === 'EVALUATOR' && hasImages && selectedImages.length < 3) {
      const ok = window.confirm(
        `Para uma avaliação corporal completa, o ideal é enviar 3 fotos: 1 de frente, 1 de costas e 1 de lateral. Você enviou ${selectedImages.length}. Continuar mesmo assim?`,
      );
      if (!ok) return;
    }

    const content = input.trim();
    setInput('');

    if (hasImages) {
      const previews = selectedImages.map((s) => s.preview);
      setMessages((prev) => [...prev, { role: 'user', content, imagePreviews: previews }]);

      const images = selectedImages.map((s) => ({
        data: s.preview.split(',')[1],
        mimeType: s.file.type || 'image/jpeg',
      }));

      const defaultText =
        activeAgent === 'EVALUATOR' && images.length >= 3
          ? 'Por favor, faça uma avaliação corporal completa a partir destas fotos (frente, costas e lateral).'
          : 'Por favor, analise esta(s) foto(s).';

      clearImages();
      socket.emit('message', {
        sessionId,
        agentType: activeAgent,
        content: content || defaultText,
        images,
      });
    } else {
      setMessages((prev) => [...prev, { role: 'user', content }]);
      socket.emit('message', { sessionId, agentType: activeAgent, content });
    }
  }

  const agent = AGENTS[activeAgent];
  const canUploadImage = agent.supportsImage;

  return (
    <div className="h-full flex gap-4">
      {/* Agent selector */}
      <div className="w-56 flex-shrink-0 hidden lg:flex flex-col gap-2">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider px-2 mb-2">Agentes</p>
        {(Object.entries(AGENTS) as [AgentType, typeof AGENTS[AgentType]][]).map(([key, a]) => (
          <button
            key={key}
            onClick={() => setActiveAgent(key)}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl text-left transition-all ${
              activeAgent === key
                ? 'bg-white shadow-sm border border-gray-200 text-gray-900'
                : 'text-gray-500 hover:text-gray-700 hover:bg-white/50'
            }`}
          >
            <span className={`p-1.5 rounded-lg ${a.color}`}>{a.icon}</span>
            <span className="text-sm font-medium">{a.label}</span>
          </button>
        ))}
      </div>

      {/* Chat area */}
      <div className="flex-1 card flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 p-4 border-b border-gray-100">
          <span className={`p-2 rounded-xl ${agent.color}`}>{agent.icon}</span>
          <div>
            <p className="font-semibold text-gray-900">{agent.label}</p>
            <p className="text-xs text-gray-400">
              {canUploadImage ? 'IA • Análise visual com fotos' : 'IA • Responde em tempo real'}
            </p>
          </div>
          <button
            onClick={() => startNewSession(activeAgent)}
            title="Nova conversa"
            className="ml-auto p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <Plus size={18} />
          </button>
        </div>

        {/* Reconnection banner */}
        {!connected && sessionId && (
          <div className="flex items-center gap-2 px-4 py-2 bg-yellow-50 border-b border-yellow-200 text-yellow-700 text-xs">
            <div className="w-3 h-3 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin flex-shrink-0" />
            Reconectando ao servidor...
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
            >
              <div className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} w-full`}>
                {msg.role === 'assistant' && (
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mr-2 mt-1 text-sm ${agent.color}`}>
                    {agent.icon}
                  </span>
                )}
                <div className={msg.role === 'user' ? 'chat-bubble-user max-w-xs' : 'chat-bubble-ai'}>
                  {(msg.imagePreviews && msg.imagePreviews.length > 0) ? (
                    <div className="flex gap-1.5 flex-wrap mb-2">
                      {msg.imagePreviews.map((src, idx) => (
                        <img
                          key={idx}
                          src={src}
                          alt={`Foto ${idx + 1}`}
                          className="rounded-lg w-20 h-20 object-cover"
                        />
                      ))}
                    </div>
                  ) : msg.imagePreview ? (
                    <img
                      src={msg.imagePreview}
                      alt="Foto enviada"
                      className="rounded-lg mb-2 max-w-[220px] max-h-[280px] object-cover"
                    />
                  ) : null}
                  {msg.role === 'assistant' ? (
                    <MessageContent content={msg.content} agentType={activeAgent} streaming={msg.streaming} />
                  ) : (
                    msg.content && <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
              </div>
              {msg.role === 'assistant' &&
                !msg.streaming &&
                (activeAgent === 'TRAINER' || activeAgent === 'NUTRITIONIST') &&
                looksLikePlan(msg.content, activeAgent) && (
                <div className="ml-9 mt-1">
                  {!msg.savedPlan && (
                    <button
                      onClick={() => savePlan(i)}
                      className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-600 hover:border-primary-400 hover:text-primary-600 transition-colors shadow-sm"
                    >
                      💾 {activeAgent === 'TRAINER' ? 'Salvar como Plano de Treino' : 'Salvar como Plano Alimentar'}
                    </button>
                  )}
                  {msg.savedPlan === 'saving' && (
                    <span className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-gray-200 text-gray-400">
                      <span className="inline-block w-3 h-3 border border-gray-400 border-t-transparent rounded-full animate-spin" />
                      Salvando...
                    </span>
                  )}
                  {msg.savedPlan === 'saved' && (
                    <Link
                      href={activeAgent === 'TRAINER' ? '/workouts' : '/nutrition'}
                      className="text-xs flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-50 border border-green-200 text-green-700 hover:bg-green-100 transition-colors"
                    >
                      ✅ Plano salvo! Ver em {activeAgent === 'TRAINER' ? 'Treinos' : 'Nutrição'} →
                    </Link>
                  )}
                  {msg.savedPlan === 'error' && (
                    <button
                      onClick={() => savePlan(i)}
                      title={msg.saveError || 'Erro ao salvar'}
                      className="text-xs px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 transition-colors"
                    >
                      ❌ Erro ao salvar — clique para tentar novamente
                    </button>
                  )}
                </div>
              )}
              {msg.role === 'assistant' && activeAgent === 'EVALUATOR' && !msg.streaming && msg.content.length > 100 && (
                <div className="ml-9 mt-1 flex gap-2 flex-wrap">
                  <Link
                    href="/chat?agent=TRAINER&from=drshape"
                    className="inline-flex items-center gap-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    <Dumbbell size={12} /> Ajustar Treino
                  </Link>
                  <Link
                    href="/chat?agent=NUTRITIONIST&from=drshape"
                    className="inline-flex items-center gap-1.5 text-xs bg-gray-700 hover:bg-gray-800 text-white px-3 py-1.5 rounded-lg transition-colors font-medium"
                  >
                    <Salad size={12} /> Ajustar Dieta
                  </Link>
                </div>
              )}
            </motion.div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Image previews (multi) */}
        {selectedImages.length > 0 && (
          <div className="px-4 pb-2">
            <div className="flex gap-2 flex-wrap">
              {selectedImages.map((img, i) => (
                <div key={i} className="relative">
                  <img
                    src={img.preview}
                    alt={`Foto ${i + 1}`}
                    className="h-20 w-20 rounded-lg object-cover border border-gray-200"
                  />
                  <button
                    onClick={() => removeImage(i)}
                    className="absolute -top-2 -right-2 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
                    aria-label="Remover foto"
                  >
                    <X size={10} />
                  </button>
                </div>
              ))}
            </div>
            {activeAgent === 'EVALUATOR' && (
              <p className={`text-xs mt-2 ${selectedImages.length >= 3 ? 'text-emerald-600' : 'text-amber-600'}`}>
                {selectedImages.length >= 3
                  ? `✓ ${selectedImages.length} foto(s) prontas para avaliação`
                  : `${selectedImages.length}/3 fotos · adicione ${3 - selectedImages.length} para avaliação completa (frente, costas e lateral)`}
              </p>
            )}
          </div>
        )}

        {/* Input */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-end gap-2">
            {canUploadImage && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isStreaming}
                  title="Enviar foto"
                  className="w-11 h-11 flex-shrink-0 border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-40 text-gray-500 rounded-xl flex items-center justify-center transition-colors"
                >
                  <ImageIcon size={18} />
                </button>
              </>
            )}
            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage();
                }
              }}
              placeholder={
                canUploadImage
                  ? 'Envie uma foto ou escreva uma dúvida...'
                  : `Mensagem para ${agent.label}...`
              }
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent max-h-32 overflow-y-auto"
              disabled={isStreaming}
            />
            <button
              onClick={sendMessage}
              disabled={(!input.trim() && selectedImages.length === 0) || isStreaming || !sessionId || !socket || !connected}
              className="w-11 h-11 flex-shrink-0 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            {canUploadImage
              ? 'Envie foto + mensagem ou só a foto para análise'
              : 'Enter para enviar · Shift+Enter para nova linha'}
          </p>
        </div>
      </div>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="flex items-center justify-center h-full"><div className="animate-spin w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full" /></div>}>
      <ChatPageInner />
    </Suspense>
  );
}
