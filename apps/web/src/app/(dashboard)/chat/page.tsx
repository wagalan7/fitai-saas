'use client';

import { useEffect, useRef, useState, Suspense, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Send, Plus, Dumbbell, Salad, Brain, TrendingUp, Camera, X, ImageIcon, Play } from 'lucide-react';
import Link from 'next/link';
import { useChatStore } from '@/store/chat.store';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

type AgentType = 'TRAINER' | 'NUTRITIONIST' | 'COACH' | 'ANALYST' | 'EVALUATOR';

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
    welcome: 'Olá! Sou o Dr. Shape, seu especialista em avaliação corporal. Envie uma foto do seu corpo (frente, costas ou lateral) e farei uma análise completa da sua composição e evolução. 📸',
    supportsImage: true,
  },
};

interface ChatMessage {
  role: string;
  content: string;
  imagePreview?: string;
  streaming?: boolean;
  savedPlan?: 'saving' | 'saved' | 'error';
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

  const [activeAgent, setActiveAgent] = useState<AgentType>(defaultAgent);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { token } = useAuthStore();
  const socket = useSocket(token);

  async function startNewSession(agent: AgentType = activeAgent) {
    const { data } = await api.post('/chat/sessions', {
      agentType: agent,
      title: `${AGENTS[agent].label} — ${new Date().toLocaleDateString('pt-BR')}`,
    });
    setSessionId(data.id);
    setMessages([{ role: 'assistant', content: AGENTS[agent].welcome }]);
    setSelectedImage(null);
    setImagePreview(null);
  }

  useEffect(() => {
    startNewSession(activeAgent);
  }, [activeAgent]);

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
        if (last?.streaming) updated[updated.length - 1] = { ...last, streaming: false };
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

  function handleImageSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedImage(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  function clearImage() {
    setSelectedImage(null);
    setImagePreview(null);
  }

  async function savePlan(index: number) {
    const msg = messages[index];
    if (!msg) return;

    setMessages((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], savedPlan: 'saving' };
      return updated;
    });

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
    } catch {
      setMessages((prev) => {
        const updated = [...prev];
        updated[index] = { ...updated[index], savedPlan: 'error' };
        return updated;
      });
    }
  }

  async function sendMessage() {
    const hasImage = !!selectedImage;
    const hasText = input.trim().length > 0;
    if ((!hasText && !hasImage) || isStreaming || !sessionId || !socket) return;

    const content = input.trim();
    setInput('');

    if (hasImage && imagePreview) {
      // Show image preview in user bubble
      setMessages((prev) => [...prev, { role: 'user', content, imagePreview }]);

      // Convert to base64 (strip data URL prefix)
      const base64 = imagePreview.split(',')[1];
      const mimeType = selectedImage!.type || 'image/jpeg';

      clearImage();
      socket.emit('message', {
        sessionId,
        agentType: activeAgent,
        content: content || 'Por favor, analise esta foto.',
        imageBase64: base64,
        imageMimeType: mimeType,
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
                  {msg.imagePreview && (
                    <img
                      src={msg.imagePreview}
                      alt="Foto enviada"
                      className="rounded-lg mb-2 max-w-[220px] max-h-[280px] object-cover"
                    />
                  )}
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
                msg.content.length > 150 && (
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
                    <span className="text-xs px-3 py-1.5 rounded-lg bg-red-50 border border-red-200 text-red-600">
                      ❌ Erro ao salvar
                    </span>
                  )}
                </div>
              )}
            </motion.div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Image preview */}
        {imagePreview && (
          <div className="px-4 pb-2">
            <div className="relative inline-block">
              <img src={imagePreview} alt="Preview" className="h-20 rounded-lg object-cover border border-gray-200" />
              <button
                onClick={clearImage}
                className="absolute -top-2 -right-2 w-5 h-5 bg-gray-700 text-white rounded-full flex items-center justify-center hover:bg-red-500 transition-colors"
              >
                <X size={10} />
              </button>
            </div>
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
              disabled={(!input.trim() && !selectedImage) || isStreaming}
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
