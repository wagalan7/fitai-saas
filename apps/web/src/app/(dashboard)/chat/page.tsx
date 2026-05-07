'use client';

import { useEffect, useRef, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion } from 'framer-motion';
import { Send, Plus, Dumbbell, Salad, Brain, TrendingUp } from 'lucide-react';
import { useChatStore } from '@/store/chat.store';
import { useSocket } from '@/hooks/useSocket';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/auth.store';

type AgentType = 'TRAINER' | 'NUTRITIONIST' | 'COACH' | 'ANALYST';

const AGENTS: Record<AgentType, { label: string; icon: React.ReactNode; color: string; welcome: string }> = {
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
};

function ChatPageInner() {
  const searchParams = useSearchParams();
  const defaultAgent = (searchParams.get('agent') as AgentType) || 'TRAINER';

  const [activeAgent, setActiveAgent] = useState<AgentType>(defaultAgent);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Array<{ role: string; content: string; streaming?: boolean }>>([]);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { token } = useAuthStore();
  const socket = useSocket(token);

  async function startNewSession(agent: AgentType = activeAgent) {
    const { data } = await api.post('/chat/sessions', {
      agentType: agent,
      title: `${AGENTS[agent].label} — ${new Date().toLocaleDateString('pt-BR')}`,
    });
    setSessionId(data.id);
    setMessages([{ role: 'assistant', content: AGENTS[agent].welcome }]);
  }

  // Create or load session
  useEffect(() => {
    startNewSession(activeAgent);
  }, [activeAgent]);

  // Socket events
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
          updated[updated.length - 1] = { ...last, streaming: false };
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

  function sendMessage() {
    if (!input.trim() || isStreaming || !sessionId || !socket) return;

    const content = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', content }]);

    socket.emit('message', { sessionId, agentType: activeAgent, content });
  }

  const agent = AGENTS[activeAgent];

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
            <p className="text-xs text-gray-400">IA • Responde em tempo real</p>
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
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mr-2 mt-1 text-sm ${agent.color}`}>
                  {agent.icon}
                </span>
              )}
              <div
                className={msg.role === 'user' ? 'chat-bubble-user' : `chat-bubble-ai ${msg.streaming ? 'streaming-cursor' : ''}`}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
              </div>
            </motion.div>
          ))}
          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-4 border-t border-gray-100">
          <div className="flex items-end gap-3">
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
              placeholder={`Mensagem para ${agent.label}...`}
              className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent max-h-32 overflow-y-auto"
              disabled={isStreaming}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || isStreaming}
              className="w-11 h-11 bg-primary-500 hover:bg-primary-600 disabled:opacity-40 text-white rounded-xl flex items-center justify-center transition-colors flex-shrink-0"
            >
              <Send size={16} />
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2 text-center">
            Enter para enviar · Shift+Enter para nova linha
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
