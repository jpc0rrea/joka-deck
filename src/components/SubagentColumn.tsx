import { useMemo, useState, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useAutoScroll } from "../hooks";
import { useDeckStore } from "../lib/store";
import type { GatewaySession, ChatMessage } from "../types";
import styles from "./SubagentColumn.module.css";

// ─── Helpers ───

/**
 * Normalize a timestamp that might be ms, seconds, or ISO string.
 */
function normalizeTimestamp(ts: unknown): number {
  if (typeof ts === "string") {
    const parsed = new Date(ts).getTime();
    return isNaN(parsed) ? 0 : parsed;
  }
  if (typeof ts === "number") {
    if (ts === 0) return 0;
    if (ts < 1e12) return ts * 1000;
    return ts;
  }
  return 0;
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

function extractLabel(session: GatewaySession): string {
  if (session.label) return session.label;
  const parts = session.key.split(":");
  if (parts.length >= 4 && parts[2] === "subagent") {
    return `subagent-${parts[3].slice(0, 8)}`;
  }
  return session.key.split(":").pop() || "unknown";
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

// ─── Status Badge ───

function StatusBadge({ status }: { status: GatewaySession["status"] }) {
  const color = getStatusColor(status);
  const isActive = status === "running" || status === "streaming" || status === "thinking";

  return (
    <div className={styles.statusBadge}>
      <div
        className={isActive ? styles.statusDotPulse : styles.statusDot}
        style={{ backgroundColor: color }}
      />
      <span className={styles.statusLabel} style={{ color }}>
        {status}
      </span>
    </div>
  );
}

// ─── Message Bubble ───

function MessageBubble({ message }: { message: ChatMessage }) {
  const isUser = message.role === "user";
  const accent = "#a78bfa";

  if (message.role === "system") {
    return (
      <div className={styles.systemMessage}>
        <span>{message.text}</span>
      </div>
    );
  }

  return (
    <div className={`${styles.messageBubble} ${isUser ? styles.userMsg : styles.assistantMsg}`}>
      {isUser && <div className={styles.roleLabel}>Prompt</div>}
      {!isUser && <div className={styles.roleLabel}>Subagent</div>}
      <div
        className={styles.messageText}
        style={isUser ? undefined : { borderLeft: `2px solid ${accent}33`, paddingLeft: 12 }}
      >
        {isUser ? (
          message.text
        ) : (
          <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeHighlight]}>
            {message.text}
          </ReactMarkdown>
        )}
        {message.streaming && (
          <span className={styles.cursor} style={{ backgroundColor: accent }} />
        )}
      </div>
    </div>
  );
}

// ─── Main Component ───

export function SubagentColumn({
  session,
  columnIndex,
}: {
  session: GatewaySession;
  columnIndex: number;
}) {
  const statusColor = getStatusColor(session.status);
  const label = extractLabel(session);
  const isActive = session.active || session.status === "running" || session.status === "streaming";
  const createdMs = normalizeTimestamp(session.createdAt);
  const duration = createdMs ? Date.now() - createdMs : 0;
  const [input, setInput] = useState("");

  // Get messages from the subagent message store
  const messages = useDeckStore((s) => s.subagentMessages[session.key] || []);
  const sendSubagentMessage = useDeckStore((s) => s.sendSubagentMessage);

  const scrollRef = useAutoScroll(messages);

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
    <div
      className={styles.column}
      data-status={session.status}
    >
      {/* Header */}
      <div className={styles.header}>
        <div
          className={styles.agentIcon}
          style={{
            color: statusColor,
            backgroundColor: `${statusColor}15`,
            borderColor: `${statusColor}30`,
          }}
        >
          ◈
        </div>
        <div className={styles.headerInfo}>
          <div className={styles.headerRow}>
            <span className={styles.agentName}>{label}</span>
            <StatusBadge status={session.status} />
          </div>
          <div className={styles.headerMeta}>
            {session.model && (
              <span style={{ color: statusColor, opacity: 0.7 }}>
                🤖 {session.model}
              </span>
            )}
            <span className={styles.metaDot}>·</span>
            <span>⏱ {formatDuration(duration)}</span>
            {session.usage && (
              <>
                <span className={styles.metaDot}>·</span>
                <span>📊 {session.usage.totalTokens.toLocaleString()} tok</span>
              </>
            )}
          </div>
        </div>
        <div className={styles.headerBadge}>
          SUBAGENT
        </div>
      </div>

      {/* Messages Area */}
      <div ref={scrollRef} className={styles.messages}>
        {messages.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon} style={{ color: statusColor }}>◈</div>
            <p>
              {isActive
                ? "Subagent is working..."
                : session.status === "completed"
                ? "Subagent has completed"
                : "Waiting for activity"}
            </p>
            <div className={styles.sessionKey}>{session.key}</div>
          </div>
        ) : (
          messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>

      {/* Input / Footer */}
      <div className={styles.footer}>
        <div className={styles.inputRow}>
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message subagent..."
            className={styles.inputField}
            rows={1}
          />
          <button
            className={styles.sendBtn}
            onClick={handleSend}
            disabled={!input.trim()}
            style={input.trim() ? { backgroundColor: statusColor, color: "#000" } : undefined}
          >
            ↑
          </button>
        </div>
        {isActive && (
          <div
            className={styles.streamingBar}
            style={{ backgroundColor: statusColor }}
          />
        )}
      </div>
    </div>
  );
}
