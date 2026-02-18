import { useState } from "react";
import { useSubagentMonitor } from "../hooks";
import { useDeckStore } from "../lib/store";
import type { GatewaySession } from "../types";
import styles from "./SubagentList.module.css";

// ─── Helpers ───

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

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

function SessionCard({ session }: { session: GatewaySession }) {
  const [expanded, setExpanded] = useState(false);
  const isActive = session.active || session.status === "running" || session.status === "streaming";
  const statusColor = getStatusColor(session.status);
  const duration = Date.now() - session.createdAt;

  let cardClass = styles.sessionCard;
  if (session.status === "streaming") cardClass += ` ${styles.sessionCardStreaming}`;
  else if (isActive) cardClass += ` ${styles.sessionCardActive}`;
  else if (session.status === "completed") cardClass += ` ${styles.sessionCardCompleted}`;
  else if (session.status === "error") cardClass += ` ${styles.sessionCardError}`;

  return (
    <div 
      className={cardClass}
      onClick={() => setExpanded(!expanded)}
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
      </div>

      {expanded && (
        <div className={styles.sessionKey}>
          <strong>Key:</strong> {session.key}
          {session.parentSession && (
            <>
              <br />
              <strong>Parent:</strong> {session.parentSession}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section ───

function SessionSection({ 
  title, 
  sessions, 
  emptyText 
}: { 
  title: string; 
  sessions: GatewaySession[];
  emptyText: string;
}) {
  if (sessions.length === 0) return null;

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>
        {title}
        <span className={styles.sectionCount}>{sessions.length}</span>
      </div>
      {sessions.map((session) => (
        <SessionCard key={session.key} session={session} />
      ))}
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

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await refresh();
    setTimeout(() => setIsRefreshing(false), 500);
  };

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
            />
            <SessionSection 
              title="Completed" 
              sessions={completedSubagents}
              emptyText="No completed subagents"
            />
          </>
        )}
      </div>
    </div>
  );
}
