import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type {
  AgentConfig,
  AgentSession,
  AgentStatus,
  ChatMessage,
  DeckConfig,
  GatewayEvent,
  GatewaySession,
  SessionUsage,
} from "../types";
import { GatewayClient } from "./gateway-client";

// ─── Storage Keys ───

const STORAGE_KEY = "openclaw-deck-state";

// ─── Default Config ───

const DEFAULT_CONFIG: DeckConfig = {
  gatewayUrl: "ws://127.0.0.1:18789",
  token: undefined,
  agents: [],
};

// ─── Store Shape ───

interface DeckStore {
  config: DeckConfig;
  sessions: Record<string, AgentSession>;
  gatewayConnected: boolean;
  columnOrder: string[];
  client: GatewayClient | null;
  
  // Subagent monitoring
  gatewaySessions: GatewaySession[];
  subagentPollingEnabled: boolean;
  lastSubagentPoll: number | null;
  
  // Model selection
  availableModels: string[];
  modelsLoaded: boolean;
  
  // Subagent columns
  subagentColumnOrder: string[];

  // Actions
  initialize: (config: Partial<DeckConfig>) => void;
  addAgent: (agent: AgentConfig) => void;
  removeAgent: (agentId: string) => void;
  reorderColumns: (order: string[]) => void;
  sendMessage: (agentId: string, text: string) => Promise<void>;
  setAgentStatus: (agentId: string, status: AgentStatus) => void;
  appendMessageChunk: (agentId: string, runId: string, chunk: string) => void;
  finalizeMessage: (agentId: string, runId: string) => void;
  handleGatewayEvent: (event: GatewayEvent) => void;
  createAgentOnGateway: (agent: AgentConfig) => Promise<void>;
  deleteAgentOnGateway: (agentId: string) => Promise<void>;
  updateAgentModel: (agentId: string, model: string) => void;
  disconnect: () => void;
  
  // Model actions
  fetchAvailableModels: () => Promise<void>;
  
  // Subagent actions
  refreshGatewaySessions: () => Promise<void>;
  setSubagentPolling: (enabled: boolean) => void;
  clearMessageHistory: (agentId: string) => void;
  
  // Delegation actions
  assignSubagentToColumn: (columnId: string, sessionKey: string) => void;
  unassignSubagentFromColumn: (columnId: string) => void;
  getColumnBySubagent: (sessionKey: string) => string | undefined;
  
  // Subagent column actions
  addSubagentColumn: (sessionKey: string) => void;
  removeSubagentColumn: (sessionKey: string) => void;
}

// ─── Helpers ───

function createSession(agentId: string): AgentSession {
  return {
    agentId,
    status: "idle",
    messages: [],
    activeRunId: null,
    tokenCount: 0,
    connected: false,
    mode: 'chat',
  };
}

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ─── Store ───

// Helper to load persisted messages
function loadPersistedMessages(): Record<string, ChatMessage[]> {
  try {
    const stored = localStorage.getItem(`${STORAGE_KEY}-messages`);
    if (stored) {
      const parsed = JSON.parse(stored);
      console.log("[DeckStore] Loaded persisted messages:", Object.keys(parsed).map(k => `${k}: ${parsed[k]?.length ?? 0} msgs`));
      return parsed;
    }
    console.log("[DeckStore] No persisted messages found");
  } catch (err) {
    console.warn("[DeckStore] Failed to load persisted messages:", err);
  }
  return {};
}

// Helper to save messages
function saveMessages(sessions: Record<string, AgentSession>) {
  try {
    const messages: Record<string, ChatMessage[]> = {};
    for (const [id, session] of Object.entries(sessions)) {
      // Only persist non-streaming messages
      messages[id] = session.messages.filter(m => !m.streaming);
    }
    localStorage.setItem(`${STORAGE_KEY}-messages`, JSON.stringify(messages));
    console.log("[DeckStore] Saved messages:", Object.keys(messages).map(k => `${k}: ${messages[k]?.length ?? 0} msgs`));
  } catch (err) {
    console.warn("[DeckStore] Failed to save messages:", err);
  }
}

export const useDeckStore = create<DeckStore>((set, get) => ({
  config: DEFAULT_CONFIG,
  sessions: {},
  gatewayConnected: false,
  columnOrder: [],
  client: null,
  
  // Subagent monitoring
  gatewaySessions: [],
  subagentPollingEnabled: true,
  lastSubagentPoll: null,
  
  // Model selection
  availableModels: [],
  modelsLoaded: false,
  
  // Subagent columns
  subagentColumnOrder: [],

  initialize: (partialConfig) => {
    const config = { ...DEFAULT_CONFIG, ...partialConfig };
    const sessions: Record<string, AgentSession> = {};
    const columnOrder: string[] = [];
    
    // Load persisted messages
    const persistedMessages = loadPersistedMessages();

    for (const agent of config.agents) {
      const session = createSession(agent.id);
      // Restore persisted messages if available
      if (persistedMessages[agent.id]) {
        session.messages = persistedMessages[agent.id];
      }
      sessions[agent.id] = session;
      columnOrder.push(agent.id);
    }

    // Create the gateway client
    const client = new GatewayClient({
      url: config.gatewayUrl,
      token: config.token,
      onEvent: (event) => get().handleGatewayEvent(event),
      onConnection: (connected) => {
        set({ gatewayConnected: connected });
        if (connected) {
          // Mark all agent sessions as connected
          const sessions = { ...get().sessions };
          for (const id of Object.keys(sessions)) {
            sessions[id] = { ...sessions[id], connected: true };
          }
          set({ sessions });
          
          // Fetch available models on connection
          get().fetchAvailableModels();
        }
      },
    });

    set({ config, sessions, columnOrder, client });
    client.connect();
  },

  addAgent: (agent) => {
    set((state) => ({
      config: {
        ...state.config,
        agents: [...state.config.agents, agent],
      },
      sessions: {
        ...state.sessions,
        [agent.id]: createSession(agent.id),
      },
      columnOrder: [...state.columnOrder, agent.id],
    }));
  },

  removeAgent: (agentId) => {
    set((state) => {
      const { [agentId]: _, ...sessions } = state.sessions;
      return {
        config: {
          ...state.config,
          agents: state.config.agents.filter((a) => a.id !== agentId),
        },
        sessions,
        columnOrder: state.columnOrder.filter((id) => id !== agentId),
      };
    });
  },

  reorderColumns: (order) => set({ columnOrder: order }),

  sendMessage: async (agentId, text) => {
    const { client, sessions, config } = get();
    if (!client?.connected) {
      console.error("Gateway not connected");
      return;
    }

    // Add user message immediately
    const userMsg: ChatMessage = {
      id: makeId(),
      role: "user",
      text,
      timestamp: Date.now(),
    };

    const session = sessions[agentId];
    if (!session) return;
    
    // Get model from agent config
    const agentConfig = config.agents.find(a => a.id === agentId);
    const model = agentConfig?.model;

    set((state) => ({
      sessions: {
        ...state.sessions,
        [agentId]: {
          ...session,
          messages: [...session.messages, userMsg],
          status: "thinking",
        },
      },
    }));

    try {
      // All columns route through the default "main" agent on the gateway,
      // using distinct session keys to keep conversations separate.
      const sessionKey = `agent:main:${agentId}`;
      const { runId } = await client.runAgent("main", text, sessionKey, model);

      // Create placeholder assistant message for streaming
      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: "assistant",
        text: "",
        timestamp: Date.now(),
        streaming: true,
        runId,
      };

      set((state) => ({
        sessions: {
          ...state.sessions,
          [agentId]: {
            ...state.sessions[agentId],
            messages: [...state.sessions[agentId].messages, assistantMsg],
            activeRunId: runId,
            status: "streaming",
          },
        },
      }));
    } catch (err) {
      console.error(`Failed to run agent ${agentId}:`, err);
      set((state) => ({
        sessions: {
          ...state.sessions,
          [agentId]: {
            ...state.sessions[agentId],
            status: "error",
          },
        },
      }));
    }
  },

  setAgentStatus: (agentId, status) => {
    set((state) => {
      const session = state.sessions[agentId];
      if (!session) return state; // Ignore events for unknown agents
      return {
        sessions: {
          ...state.sessions,
          [agentId]: {
            ...session,
            status,
          },
        },
      };
    });
  },

  appendMessageChunk: (agentId, runId, chunk) => {
    set((state) => {
      const session = state.sessions[agentId];
      if (!session) return state;

      const messages = session.messages.map((msg) => {
        if (msg.runId === runId && msg.streaming) {
          return { ...msg, text: msg.text + chunk };
        }
        return msg;
      });

      return {
        sessions: {
          ...state.sessions,
          [agentId]: {
            ...session,
            messages,
            tokenCount: session.tokenCount + chunk.length, // approximate
          },
        },
      };
    });
  },

  finalizeMessage: (agentId, runId) => {
    set((state) => {
      const session = state.sessions[agentId];
      if (!session) return state;

      const messages = session.messages.map((msg) => {
        if (msg.runId === runId) {
          return { ...msg, streaming: false };
        }
        return msg;
      });

      return {
        sessions: {
          ...state.sessions,
          [agentId]: {
            ...session,
            messages,
            activeRunId: null,
            status: "idle",
          },
        },
      };
    });
  },

  handleGatewayEvent: (event) => {
    const payload = event.payload as Record<string, unknown>;

    switch (event.event) {
      // Agent streaming events
      // Format: { runId, stream: "assistant"|"lifecycle"|"tool_use", data: {...}, sessionKey: "agent:<id>:<key>" }
      case "agent": {
        const runId = payload.runId as string;
        const stream = payload.stream as string | undefined;
        const data = payload.data as Record<string, unknown> | undefined;
        const sessionKey = payload.sessionKey as string | undefined;

        // Check if this is a subagent event that should be routed to a column
        const delegatedColumn = sessionKey ? get().getColumnBySubagent(sessionKey) : undefined;
        
        // Extract column ID from sessionKey "agent:main:<columnId>" or use delegated column
        let agentId: string;
        if (delegatedColumn) {
          // Route subagent events to the column watching it
          agentId = delegatedColumn;
        } else {
          const parts = sessionKey?.split(":") ?? [];
          agentId = parts[2] ?? parts[1] ?? "main";
        }

        // For delegated columns, ensure we have a message placeholder for streaming
        if (delegatedColumn) {
          const session = get().sessions[agentId];
          const hasRunMessage = session?.messages.some(m => m.runId === runId);
          
          if (!hasRunMessage && stream === "assistant") {
            // Create placeholder for subagent streaming
            const assistantMsg: ChatMessage = {
              id: makeId(),
              role: "assistant",
              text: "",
              timestamp: Date.now(),
              streaming: true,
              runId,
            };
            
            set((state) => ({
              sessions: {
                ...state.sessions,
                [agentId]: {
                  ...state.sessions[agentId],
                  messages: [...state.sessions[agentId].messages, assistantMsg],
                  activeRunId: runId,
                },
              },
            }));
          }
        }

        if (stream === "assistant" && data?.delta) {
          get().appendMessageChunk(agentId, runId, data.delta as string);
          get().setAgentStatus(agentId, "streaming");
        } else if (stream === "lifecycle") {
          const phase = data?.phase as string | undefined;
          if (phase === "start") {
            get().setAgentStatus(agentId, "thinking");
          } else if (phase === "end") {
            get().finalizeMessage(agentId, runId);
          }
        } else if (stream === "tool_use") {
          get().setAgentStatus(agentId, "tool_use");
        }
        break;
      }

      // Presence changes (agents coming online/offline)
      case "presence": {
        const agents = payload.agents as
          | Record<string, { online: boolean }>
          | undefined;
        if (agents) {
          set((state) => {
            const sessions = { ...state.sessions };
            for (const [id, info] of Object.entries(agents)) {
              if (sessions[id]) {
                sessions[id] = {
                  ...sessions[id],
                  connected: info.online,
                  status: info.online ? sessions[id].status : "disconnected",
                };
              }
            }
            return { sessions };
          });
        }
        break;
      }

      // Tick events (keep-alive, can update token counts, etc.)
      case "tick": {
        // Could update token usage, cost, etc.
        break;
      }

      // Context compaction dividers
      case "compaction": {
        const sessionKey = payload.sessionKey as string | undefined;
        const parts = sessionKey?.split(":") ?? [];
        const agentId = parts[2] ?? parts[1] ?? "main";
        const beforeTokens = (payload.beforeTokens as number) ?? 0;
        const afterTokens = (payload.afterTokens as number) ?? 0;
        const droppedMessages = (payload.droppedMessages as number) ?? 0;

        const compactionMsg: ChatMessage = {
          id: makeId(),
          role: "compaction",
          text: "",
          timestamp: Date.now(),
          compaction: { beforeTokens, afterTokens, droppedMessages },
        };

        set((state) => {
          const session = state.sessions[agentId];
          if (!session) return state;
          return {
            sessions: {
              ...state.sessions,
              [agentId]: {
                ...session,
                messages: [...session.messages, compactionMsg],
              },
            },
          };
        });
        break;
      }

      // Real usage data from gateway
      case "sessions.usage": {
        const sessionKey = payload.sessionKey as string | undefined;
        const parts = sessionKey?.split(":") ?? [];
        const agentId = parts[2] ?? parts[1] ?? "main";
        const usage = payload.usage as SessionUsage | undefined;

        if (usage) {
          set((state) => {
            const session = state.sessions[agentId];
            if (!session) return state;
            return {
              sessions: {
                ...state.sessions,
                [agentId]: {
                  ...session,
                  usage,
                  tokenCount: usage.totalTokens,
                },
              },
            };
          });
        }
        break;
      }

      default:
        console.log("[DeckStore] Unhandled event:", event.event, payload);
    }
  },

  createAgentOnGateway: async (agent) => {
    const { client } = get();
    try {
      if (client?.connected) {
        await client.createAgent({
          id: agent.id,
          name: agent.name,
          model: agent.model,
          context: agent.context,
          shell: agent.shell,
        });
      }
    } catch (err) {
      console.warn("[DeckStore] Gateway createAgent failed, adding locally:", err);
    }
    get().addAgent(agent);
  },

  deleteAgentOnGateway: async (agentId) => {
    const { client } = get();
    try {
      if (client?.connected) {
        await client.deleteAgent(agentId);
      }
    } catch (err) {
      console.warn("[DeckStore] Gateway deleteAgent failed, removing locally:", err);
    }
    get().removeAgent(agentId);
  },

  disconnect: () => {
    // Save messages before disconnecting
    saveMessages(get().sessions);
    get().client?.disconnect();
    set({ gatewayConnected: false, client: null });
  },
  
  // Model actions
  fetchAvailableModels: async () => {
    const { client } = get();
    if (!client?.connected) return;
    
    try {
      const models = await client.listModels();
      if (models.length > 0) {
        set({ availableModels: models, modelsLoaded: true });
      } else {
        // Fallback to hardcoded models
        set({ 
          availableModels: [
            "claude-sonnet-4-5",
            "claude-opus-4-6",
            "claude-opus-4-5",
            "gpt-5.3-codex",
          ],
          modelsLoaded: true,
        });
      }
    } catch {
      // Fallback to hardcoded models
      set({ 
        availableModels: [
          "claude-sonnet-4-5",
          "claude-opus-4-6",
          "claude-opus-4-5",
          "gpt-5.3-codex",
        ],
        modelsLoaded: true,
      });
    }
  },
  
  updateAgentModel: (agentId: string, model: string) => {
    set((state) => {
      const agents = state.config.agents.map((a) =>
        a.id === agentId ? { ...a, model } : a
      );
      return { config: { ...state.config, agents } };
    });
    
    // Also update on gateway if connected
    const { client } = get();
    if (client?.connected) {
      client.updateAgent({ id: agentId, model }).catch((err: unknown) => {
        console.warn("[DeckStore] Failed to update agent model on gateway:", err);
      });
    }
  },
  
  // Subagent actions
  refreshGatewaySessions: async () => {
    const { client } = get();
    if (!client?.connected) return;
    
    try {
      // Request sessions with message history for subagent columns
      const gatewaySessions = await client.listSessions(50);
      
      // Auto-manage subagent columns
      const subagentSessions = gatewaySessions.filter(
        (s) => s.key.includes(":subagent:") || s.parentSession
      );
      const activeSubagentKeys = subagentSessions
        .filter((s) => s.active || s.status === "running" || s.status === "streaming" || s.status === "thinking")
        .map((s) => s.key);
      
      const currentOrder = get().subagentColumnOrder;
      
      // Add new active subagents
      const newOrder = [...currentOrder];
      for (const key of activeSubagentKeys) {
        if (!newOrder.includes(key)) {
          newOrder.push(key);
        }
      }
      
      // Remove subagents that no longer exist in gateway sessions at all
      const allSubagentKeys = new Set(subagentSessions.map((s) => s.key));
      const filteredOrder = newOrder.filter((key) => allSubagentKeys.has(key));
      
      set({ 
        gatewaySessions,
        subagentColumnOrder: filteredOrder,
        lastSubagentPoll: Date.now() 
      });
    } catch (err) {
      console.warn("[DeckStore] Failed to fetch gateway sessions:", err);
    }
  },
  
  setSubagentPolling: (enabled: boolean) => {
    set({ subagentPollingEnabled: enabled });
  },
  
  clearMessageHistory: (agentId: string) => {
    set((state) => {
      const session = state.sessions[agentId];
      if (!session) return state;
      
      const newSessions = {
        ...state.sessions,
        [agentId]: {
          ...session,
          messages: [],
          tokenCount: 0,
          usage: undefined,
        },
      };
      
      // Persist the cleared state
      saveMessages(newSessions);
      
      return { sessions: newSessions };
    });
  },
  
  // Delegation actions
  assignSubagentToColumn: (columnId: string, sessionKey: string) => {
    set((state) => {
      const session = state.sessions[columnId];
      if (!session) return state;
      
      // Add a system message indicating delegation started
      const delegationMsg: ChatMessage = {
        id: makeId(),
        role: "system",
        text: `📡 Watching subagent: ${sessionKey.split(':').pop()?.slice(0, 8) || sessionKey}`,
        timestamp: Date.now(),
      };
      
      return {
        sessions: {
          ...state.sessions,
          [columnId]: {
            ...session,
            assignedSubagent: sessionKey,
            mode: 'delegation',
            messages: [...session.messages, delegationMsg],
            status: 'idle',
          },
        },
      };
    });
  },
  
  unassignSubagentFromColumn: (columnId: string) => {
    set((state) => {
      const session = state.sessions[columnId];
      if (!session) return state;
      
      // Add a system message indicating delegation ended
      const unassignMsg: ChatMessage = {
        id: makeId(),
        role: "system",
        text: `📡 Stopped watching subagent`,
        timestamp: Date.now(),
      };
      
      return {
        sessions: {
          ...state.sessions,
          [columnId]: {
            ...session,
            assignedSubagent: undefined,
            mode: 'chat',
            messages: [...session.messages, unassignMsg],
            status: 'idle',
          },
        },
      };
    });
  },
  
  getColumnBySubagent: (sessionKey: string) => {
    const { sessions } = get();
    for (const [columnId, session] of Object.entries(sessions)) {
      if (session.assignedSubagent === sessionKey) {
        return columnId;
      }
    }
    return undefined;
  },
  
  // Subagent column actions
  addSubagentColumn: (sessionKey: string) => {
    set((state) => {
      if (state.subagentColumnOrder.includes(sessionKey)) {
        return state;
      }
      return {
        subagentColumnOrder: [...state.subagentColumnOrder, sessionKey],
      };
    });
  },
  
  removeSubagentColumn: (sessionKey: string) => {
    set((state) => ({
      subagentColumnOrder: state.subagentColumnOrder.filter(k => k !== sessionKey),
    }));
  },
}));

// Auto-save messages on changes (debounced)
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
useDeckStore.subscribe((state, prevState) => {
  // Only save if messages changed
  if (state.sessions !== prevState.sessions) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
      saveMessages(state.sessions);
    }, 1000);
  }
});

// Save immediately before page unload (F5, close tab, etc.)
if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", () => {
    // Cancel pending debounced save
    if (saveTimeout) clearTimeout(saveTimeout);
    // Save immediately
    const state = useDeckStore.getState();
    if (Object.keys(state.sessions).length > 0) {
      saveMessages(state.sessions);
    }
  });

  // Also save when tab becomes hidden (user switching tabs before closing browser)
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      if (saveTimeout) clearTimeout(saveTimeout);
      const state = useDeckStore.getState();
      if (Object.keys(state.sessions).length > 0) {
        saveMessages(state.sessions);
      }
    }
  });
}
