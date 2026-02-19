import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useSubagentMonitor, useAutoScroll } from "../hooks";
import { useDeckStore } from "../lib/store";
import type { GatewaySession, ChatMessage } from "../types";
import styles from "./SubagentList.module.css";

// ─── Helpers ───

/**
 * Normalize a timestamp that might be:
 * - milliseconds epoch (e.g. 1719000000000)
 * - seconds epoch (e.g. 1719000000)
 * - ISO string (e.g. "2025-01-15T10:00:00Z")
 * Returns epoch milliseconds or NaN.
 */
function normalizeTimestamp(ts: unknown): number {
  if (typeof ts === "string") {
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof ts === "number") {
    if (ts === 0) return 0;
    // If it looks like seconds (< year 2100 in seconds = ~4102444800)
    if (ts < 1e12) return ts * 1000;
    return ts;
  }
  return 0;
}

function formatTime(timestamp: number): string {
  const ms = normalizeTimestamp(timestamp);
  if (!ms) return "--:--:--";
  const date = new Date(ms);
  if (isNaN(date.getTime())) return "--:--:--";
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatDuration(ms: number): string {
  if (!isFinite(ms) || isNaN(ms) || ms < 0) return "—";
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  if (minutes < 60) return `${minutes}m ${secs}s`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function getStatusColor(status: GatewaySession["status"]): string {
  switch (status) {
    case "running":
    case "streaming":
      return "#a78bfa";
    case "thinking":
      return "#22d3ee";
    case "idle":
      return "#6b7280";
    case "completed":
      return "#34d399";
    case "error":
      return "#ef4444";
    default:
      return "#6b7280";
  }
}

function extractLabel(session: GatewaySession): string {
  if (session.label) return session.label;
  
  // Try to extract meaningful name from key
  // Format: "agent:main:subagent:uuid" -> extract label if present
  const parts = session.key.split(":");
  if (parts.length >= 4 && parts[2] === "subagent") {
    // Return truncated UUID
    const uuid = parts[3];
    return `subagent-${uuid.slice(0, 8)}`;
  }
  
  return session.key.split(":").pop() || "unknown";
}

// ─── Session Card ───

function SessionCard({ 
  session, 
  onSelect 
}: { 
  session: GatewaySession;
  onSelect?: (session: GatewaySession) => void;
}) {
  const isActive = session.active || session.status === "running" || session.status === "streaming";
  const statusColor = getStatusColor(session.status);
  const createdMs = normalizeTimestamp(session.createdAt);
  const duration = createdMs ? Date.now() - createdMs : 0;
  const messageCount = useDeckStore((s) => (s.subagentMessages[session.key] || []).length);

  let cardClass = styles.sessionCard;
  if (session.status === "streaming") cardClass += ` ${styles.sessionCardStreaming}`;
  else if (isActive) cardClass += ` ${styles.sessionCardActive}`;
  else if (session.status === "completed") cardClass += ` ${styles.sessionCardCompleted}`;
  else if (session.status === "error") cardClass += ` ${styles.sessionCardError}`;

  return (
    <div 
      className={cardClass}
      onClick={() => onSelect?.(session)}
      style={{ cursor: "pointer" }}
    >
      <div className={styles.sessionHeader}>
        <div className={styles.sessionLabel}>
          <span 
            className={styles.sessionLabelIcon}
            style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
          >
            ◈
          </span>
          <span>{extractLabel(session)}</span>
        </div>
        <div className={styles.statusBadge}>
          <span 
            className={isActive ? styles.statusDotPulse : styles.statusDot}
            style={{ backgroundColor: statusColor }}
          />
          <span style={{ color: statusColor }}>{session.status}</span>
        </div>
      </div>

      <div className={styles.sessionMeta}>
        <span>⏱ {formatDuration(duration)}</span>
        {session.model && <span>🤖 {session.model}</span>}
        {session.usage && (
          <span>📊 {session.usage.totalTokens.toLocaleString()} tokens</span>
        )}
        <span>🕐 {formatTime(session.lastActivityAt)}</span>
        {messageCount > 0 && (
          <span>💬 {messageCount} msgs</span>
        )}
      </div>
    </div>
  );
}

// ─── Section ───

function SessionSection({ 
  title, 
  sessions, 
  emptyText,
  onSelect,
}: { 
  title: string; 
  sessions: GatewaySession[];
  emptyText: string;
  onSelect?: (session: GatewaySession) => void;
}) {
  if (sessions.length === 0) return null;

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>
        {title}
        <span className={styles.sectionCount}>{sessions.length}</span>
      </div>
      {sessions.map((session) => (
        <SessionCard key={session.key} session={session} onSelect={onSelect} />
      ))}
    </div>
  );
}

// ─── Message Bubble (for expanded view) ───

function SubagentMessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";

  if (message.role === "system") {
    return (
      <div className={styles.systemMessage}>
        <span>{message.text}</span>
      </div>
    );
  }

  return (
    <div className={`${styles.messageBubble} ${isUser ? styles.userMsg : styles.assistantMsg}`}>
      <div className={styles.roleLabel}>{isUser ? "You" : "Subagent"}</div>
      <div className={styles.messageText}>
        {isUser ? (
          message.text
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {message.text}
          </ReactMarkdown>
        )}
        {message.streaming && (
          <span className={styles.cursor} />
        )}
      </div>
    </div>
  );
}

// ─── Expanded Subagent Detail View ───

function SubagentDetailView({ 
  session, 
  onBack 
}: { 
  session: GatewaySession; 
  onBack: () => void;
}) {
  const messages = useDeckStore((s) => s.subagentMessages[session.key] || []);
  const sendSubagentMessage = useDeckStore((s) => s.sendSubagentMessage);
  const [input, setInput] = useState("");
  const scrollRef = useAutoScroll(messages);
  const isActive = session.active || session.status === "running" || session.status === "streaming";
  const statusColor = getStatusColor(session.status);
  const createdMs = normalizeTimestamp(session.createdAt);
  const duration = createdMs ? Date.now() - createdMs : 0;

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    sendSubagentMessage(session.key, text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={styles.detailView}>
      {/* Detail Header */}
      <div className={styles.detailHeader}>
        <button className={styles.backBtn} onClick={onBack}>
          ← Back
        </button>
        <div className={styles.detailHeaderInfo}>
          <div className={styles.detailTitle}>
            <span 
              className={styles.sessionLabelIcon}
              style={{ backgroundColor: `${statusColor}20`, color: statusColor }}
            >
              ◈
            </span>
            <span>{extractLabel(session)}</span>
            <div className={styles.statusBadge}>
              <span 
                className={isActive ? styles.statusDotPulse : styles.statusDot}
                style={{ backgroundColor: statusColor }}
              />
              <span style={{ color: statusColor }}>{session.status}</span>
            </div>
          </div>
          <div className={styles.detailMeta}>
            <span>⏱ {formatDuration(duration)}</span>
            {session.model && <span>🤖 {session.model}</span>}
            {session.usage && (
              <span>📊 {session.usage.totalTokens.toLocaleString()} tokens</span>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className={styles.detailMessages}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon} style={{ color: statusColor }}>◈</div>
            <div className={styles.emptyTitle}>
              {isActive ? "Subagent is working..." : "No messages yet"}
            </div>
            <div className={styles.emptyDesc}>
              {isActive 
                ? "Messages will appear here as the subagent streams its response."
                : "This subagent hasn't produced any visible messages yet."}
            </div>
            <div className={styles.sessionKey} style={{ marginTop: 12 }}>
              {session.key}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <SubagentMessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Input */}
      <div className={styles.detailInput}>
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Send a message to this subagent..."
          className={styles.inputField}
          rows={2}
        />
        <button
          className={styles.sendBtn}
          onClick={handleSend}
          disabled={!input.trim()}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

// ─── Main Component ───

export function SubagentList() {
  const { 
    subagents, 
    activeSubagents, 
    completedSubagents, 
    lastPoll, 
    pollingEnabled,
    refresh 
  } = useSubagentMonitor(5000);
  
  const setSubagentPolling = useDeckStore((s) => s.setSubagentPolling);
  const gatewayConnected = useDeckStore((s) => s.gatewayConnected);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedSession, setSelectedSession] = useState<GatewaySession | null>(null);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  // If a session is selected, show the detail view
  if (selectedSession) {
    // Find the latest version of this session from the store
    const currentSession = subagents.find(s => s.key === selectedSession.key) || selectedSession;
    return (
      <div className={styles.container}>
        <SubagentDetailView 
          session={currentSession} 
          onBack={() => setSelectedSession(null)} 
        />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.title}>
          <span className={styles.titleIcon}>◈</span>
          Subagent Monitor
        </div>
        <div className={styles.headerActions}>
          {lastPoll && (
            <span className={styles.lastPoll}>
              Last: {formatTime(lastPoll)}
            </span>
          )}
          <label className={styles.pollingToggle}>
            <input
              type="checkbox"
              checked={pollingEnabled}
              onChange={(e) => setSubagentPolling(e.target.checked)}
            />
            Auto-refresh
          </label>
          <button 
            className={styles.refreshBtn}
            onClick={handleRefresh}
            disabled={!gatewayConnected || isRefreshing}
          >
            <span className={isRefreshing ? styles.refreshBtnSpinning : ""}>
              ↻
            </span>
            Refresh
          </button>
        </div>
      </div>

      {/* Stats Summary */}
      {subagents.length > 0 && (
        <div className={styles.statsSummary}>
          <div className={styles.statItem}>
            <span className={styles.statValue}>{subagents.length}</span>
            <span className={styles.statLabel}>Total</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue} style={{ color: "#a78bfa" }}>
              {activeSubagents.length}
            </span>
            <span className={styles.statLabel}>Active</span>
          </div>
          <div className={styles.statItem}>
            <span className={styles.statValue} style={{ color: "#34d399" }}>
              {completedSubagents.length}
            </span>
            <span className={styles.statLabel}>Completed</span>
          </div>
        </div>
      )}

      {/* List */}
      <div className={styles.list}>
        {!gatewayConnected ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>🔌</div>
            <div className={styles.emptyTitle}>Gateway Disconnected</div>
            <div className={styles.emptyDesc}>
              Connect to the gateway to monitor subagents
            </div>
          </div>
        ) : subagents.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>◈</div>
            <div className={styles.emptyTitle}>No Subagents</div>
            <div className={styles.emptyDesc}>
              Subagents spawned by the orchestrator will appear here.
              They're created when the main agent delegates long-running tasks.
            </div>
          </div>
        ) : (
          <>
            <SessionSection 
              title="Active" 
              sessions={activeSubagents}
              emptyText="No active subagents"
              onSelect={setSelectedSession}
            />
            <SessionSection 
              title="Completed" 
              sessions={completedSubagents}
              emptyText="No completed subagents"
              onSelect={setSelectedSession}
            />
          </>
        )}
      </div>
    </div>
  );
}
