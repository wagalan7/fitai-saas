import { create } from 'zustand';

interface ChatStore {
  activeSessions: Record<string, string>; // agentType -> sessionId
  setSession: (agentType: string, sessionId: string) => void;
}

export const useChatStore = create<ChatStore>((set) => ({
  activeSessions: {},
  setSession: (agentType, sessionId) =>
    set((s) => ({ activeSessions: { ...s.activeSessions, [agentType]: sessionId } })),
}));
