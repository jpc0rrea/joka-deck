import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import { useAutoScroll } from "../hooks";
import { useDeckStore } from "../lib/store";
import type { GatewaySession, ChatMessage } from "../types";
import styles from "./SubagentColumn.module.css";

// ─── Helpers ───

function formatDuration(ms: number): string {
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
  const duration = Date.now() - session.createdAt;

  // Get any messages routed to this subagent from the main store
  // Subagent events get routed through the gateway event system
  const agentSessions = useDeckStore((s) => s.sessions);
  
  // Find messages for this subagent - check if any column is watching it
  const watchingColumn = useDeckStore((s) => {
    for (const [columnId, sess] of Object.entries(s.sessions)) {
      if (sess.assignedSubagent === session.key) {
        return columnId;
      }
    }
    return null;
  });

  // Get messages from the watching column, or show empty
  const messages: ChatMessage[] = useMemo(() => {
    if (watchingColumn && agentSessions[watchingColumn]) {
      // Filter to only delegation-related messages  
      return agentSessions[watchingColumn].messages.filter(
        (m) => m.role === "assistant" || m.role === "system"
      );
    }
    return [];
  }, [watchingColumn, agentSessions]);

  const scrollRef = useAutoScroll(messages);

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

      {/* Footer */}
      <div className={styles.footer}>
        <div className={styles.footerContent}>
          <span className={styles.footerIcon} style={{ color: statusColor }}>◈</span>
          <span className={styles.footerLabel}>
            {isActive ? "Working..." : session.status}
          </span>
          {session.parentSession && (
            <span className={styles.footerParent}>
              ← {session.parentSession.split(":").pop()?.slice(0, 8)}
            </span>
          )}
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
