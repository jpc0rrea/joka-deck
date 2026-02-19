// ─── OpenClaw Gateway WebSocket Protocol Types ───

/** Outbound request frame */
export interface GatewayRequest {
  type: "req";
  id: string;
  method: string;
  params?: Record<string, unknown>;
}

/** Inbound response frame */
export interface GatewayResponse {
  type: "res";
  id: string;
  ok: boolean;
  payload?: unknown;
  error?: { code: string; message: string };
}

/** Inbound event frame (streaming, presence, ticks) */
export interface GatewayEvent {
  type: "event";
  event: string;
  payload: unknown;
  seq?: number;
  stateVersion?: number;
}

export type GatewayFrame = GatewayRequest | GatewayResponse | GatewayEvent;

// ─── Agent Types ───

export type AgentStatus =
  | "idle"
  | "streaming"
  | "thinking"
  | "tool_use"
  | "error"
  | "disconnected";

export interface AgentConfig {
  id: string;
  name: string;
  icon: string;
  accent: string;
  /** Path to agent workspace (maps to OpenClaw agent config) */
  workspace?: string;
  /** Model override for this agent */
  model?: string;
  /** Short description of agent's role */
  context: string;
  /** Agent envelope runtime shell (#1835) */
  shell?: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system" | "compaction";
  text: string;
  timestamp: number;
  /** If assistant is still streaming this message */
  streaming?: boolean;
  /** Agent thinking / status indicator */
  thinking?: boolean;
  /** Tool use metadata */
  toolUse?: {
    name: string;
    status: "running" | "done" | "error";
  };
  /** Run ID from gateway for tracking streaming responses */
  runId?: string;
  /** Compaction metadata (present when role === "compaction") */
  compaction?: {
    beforeTokens: number;
    afterTokens: number;
    droppedMessages: number;
  };
}

export interface SessionUsage {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costCents?: number;
  model?: string;
  failover?: {
    from: string;
    to: string;
    reason: string;
  };
}

export interface AgentSession {
  agentId: string;
  status: AgentStatus;
  messages: ChatMessage[];
  /** Current streaming run ID */
  activeRunId: string | null;
  /** Token count for this session */
  tokenCount: number;
  /** Whether the WS connection to this agent's session is live */
  connected: boolean;
  /** Real usage data from gateway */
  usage?: SessionUsage;
  /** Assigned subagent session key (for delegation mode) */
  assignedSubagent?: string;
  /** Mode: 'chat' for normal input, 'delegation' when watching a subagent */
  mode: 'chat' | 'delegation';
}

// ─── Subagent Chat Types ───

/** Stored messages for subagent sessions, keyed by sessionKey */
export type SubagentMessages = Record<string, ChatMessage[]>;

// ─── Connection Config ───

export interface DeckConfig {
  /** Gateway WebSocket URL, default ws://127.0.0.1:18789 */
  gatewayUrl: string;
  /** Gateway auth token (from OPENCLAW_GATEWAY_TOKEN) */
  token?: string;
  /** Agent definitions */
  agents: AgentConfig[];
}

// ─── Store Types ───

export interface DeckState {
  config: DeckConfig;
  sessions: Record<string, AgentSession>;
  /** Global connection status to gateway */
  gatewayConnected: boolean;
  /** Column ordering (agent IDs) */
  columnOrder: string[];
}

// ─── Gateway Session Types ───

export interface GatewaySession {
  /** Session key (e.g., "agent:main:subagent:abc123") */
  key: string;
  /** Agent ID running this session */
  agentId: string;
  /** Session label (if any) */
  label?: string;
  /** Display name from gateway */
  displayName?: string;
  /** Whether session is currently active */
  active: boolean;
  /** Last update / activity timestamp (epoch ms from gateway) */
  updatedAt: number;
  /** Session kind (e.g., "subagent") */
  kind?: string;
  /** Channel info */
  channel?: string;
  /** Last channel used */
  lastChannel?: string;
  /** Delivery context */
  deliveryContext?: string;
  /** Gateway session ID */
  sessionId?: string;
  /** Parent session key (for subagents) */
  parentSession?: string;
  /** Current status */
  status: "idle" | "running" | "thinking" | "streaming" | "completed" | "error";
  /** Token usage */
  usage?: SessionUsage;
  /** Context tokens */
  contextTokens?: number;
  /** Total tokens */
  totalTokens?: number;
  /** Model being used */
  model?: string;
  /** Whether last run was aborted */
  abortedLastRun?: boolean;
  /** Transcript path */
  transcriptPath?: string;
  /** Message count from gateway */
  messages?: number;
}
