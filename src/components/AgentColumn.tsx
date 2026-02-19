import { useState, useRef, useEffect, type KeyboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import "highlight.js/styles/github-dark.css";
import {
  useAgentSession,
  useAgentConfig,
  useSendMessage,
  useAutoScroll,
  useAvailableSubagents,
  useColumnDelegation,
  useAvailableModels,
} from "../hooks";
import { useDeckStore } from "../lib/store";
import type { AgentStatus, ChatMessage, AgentSession, GatewaySession } from "../types";
import styles from "./AgentColumn.module.css";

// ─── Status Indicator ───

function StatusBadge({
  status,
  accent,
}: {
  status: AgentStatus;
  accent: string;
}) {
  const color =
    status === "streaming" || status === "thinking" || status === "tool_use"
      ? accent
      : status === "error"
        ? "#ef4444"
        : status === "disconnected"
          ? "#6b7280"
          : "rgba(255,255,255,0.25)";

  const label =
    status === "tool_use" ? "tool use" : status;

  const isActive =
    status === "streaming" || status === "thinking" || status === "tool_use";

  return (
    <div className={styles.statusBadge}>
      <div
        className={isActive ? styles.statusDotPulse : styles.statusDot}
        style={{ backgroundColor: color }}
      />
      <span className={styles.statusLabel} style={{ color }}>
        {label}
      </span>
    </div>
  );
}

// ─── Message Bubble ───

function MessageBubble({
  message,
  accent,
}: {
  message: ChatMessage;
  accent: string;
}) {
  const isUser = message.role === "user";

  if (message.thinking) {
    return (
      <div className={styles.thinkingBubble}>
        <span className={styles.thinkingDot} style={{ color: accent }}>
          ●
        </span>
        <span style={{ color: accent }}>{message.text}</span>
      </div>
    );
  }

  if (message.toolUse) {
    return (
      <div className={styles.toolBubble}>
        <span className={styles.toolIcon}>⚙</span>
        <span>
          {message.toolUse.name}
          {message.toolUse.status === "running" && (
            <span className={styles.thinkingDot}> ...</span>
          )}
        </span>
      </div>
    );
  }

  return (
    <div
      className={`${styles.messageBubble} ${
        isUser ? styles.userMsg : styles.assistantMsg
      }`}
    >
      {isUser && <div className={styles.roleLabel}>You</div>}
      {!isUser && <div className={styles.roleLabel}>Assistant</div>}
      <div
        className={styles.messageText}
        style={
          isUser
            ? undefined
            : { borderLeft: `2px solid ${accent}33`, paddingLeft: 12 }
        }
      >
        {isUser ? (
          message.text
        ) : (
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            rehypePlugins={[rehypeHighlight]}
          >
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

// ─── Compaction Divider ───

function CompactionDivider({ message }: { message: ChatMessage }) {
  const c = message.compaction;
  if (!c) return null;

  return (
    <div className={styles.compactionDivider}>
      <div className={styles.compactionLine} />
      <span className={styles.compactionLabel}>
        context compacted &middot; {c.droppedMessages} msgs dropped &middot;{" "}
        {c.beforeTokens.toLocaleString()} &rarr; {c.afterTokens.toLocaleString()} tokens
      </span>
      <div className={styles.compactionLine} />
    </div>
  );
}

// ─── Failover Badge ───

function FailoverBadge({ session }: { session: AgentSession }) {
  const failover = session.usage?.failover;
  if (!failover) return null;

  return (
    <span className={styles.failoverBadge} title={failover.reason}>
      failover: {failover.from} &rarr; {failover.to}
    </span>
  );
}

// ─── Delegation Badge ───

function DelegationBadge({ 
  mode, 
  assignedSubagent, 
  onUnassign 
}: { 
  mode: 'chat' | 'delegation';
  assignedSubagent?: string;
  onUnassign: () => void;
}) {
  if (mode !== 'delegation' || !assignedSubagent) return null;
  
  const shortKey = assignedSubagent.split(':').pop()?.slice(0, 8) || assignedSubagent;
  
  return (
    <span className={styles.delegationBadge} title={assignedSubagent}>
      📡 {shortKey}
      <button 
        className={styles.delegationUnassignBtn}
        onClick={(e) => {
          e.stopPropagation();
          onUnassign();
        }}
        title="Stop watching"
      >
        ×
      </button>
    </span>
  );
}

// ─── Subagent Selector Dropdown ───

function SubagentSelector({
  columnId,
  availableSubagents,
  onSelect,
  accent,
}: {
  columnId: string;
  availableSubagents: GatewaySession[];
  onSelect: (sessionKey: string) => void;
  accent: string;
}) {
  const [isOpen, setIsOpen] = useState(false);

  if (availableSubagents.length === 0) {
    return (
      <button 
        className={styles.subagentSelectorBtn}
        disabled
        title="No active subagents available"
      >
        📡 No subagents
      </button>
    );
  }

  return (
    <div className={styles.subagentSelectorWrapper}>
      <button 
        className={styles.subagentSelectorBtn}
        onClick={() => setIsOpen(!isOpen)}
        style={{ borderColor: isOpen ? accent : undefined }}
      >
        📡 Assign Subagent ({availableSubagents.length})
      </button>
      
      {isOpen && (
        <div className={styles.subagentDropdown}>
          <div className={styles.subagentDropdownHeader}>
            Select a subagent to watch
          </div>
          {availableSubagents.map((subagent) => {
            const shortKey = subagent.key.split(':').pop()?.slice(0, 8) || subagent.key;
            const label = subagent.label || shortKey;
            
            return (
              <button
                key={subagent.key}
                className={styles.subagentDropdownItem}
                onClick={() => {
                  onSelect(subagent.key);
                  setIsOpen(false);
                }}
              >
                <span className={styles.subagentDropdownIcon}>◈</span>
                <span className={styles.subagentDropdownLabel}>{label}</span>
                <span className={styles.subagentDropdownStatus} data-status={subagent.status}>
                  {subagent.status}
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── System Message ───

function SystemMessage({ message }: { message: ChatMessage }) {
  return (
    <div className={styles.systemMessage}>
      <span>{message.text}</span>
    </div>
  );
}

// ─── Model Selector ───

function ModelSelector({
  currentModel,
  agentId,
  accent,
}: {
  currentModel?: string;
  agentId: string;
  accent: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const models = useAvailableModels();
  const updateAgentModel = useDeckStore((s) => s.updateAgentModel);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  const displayModel = currentModel || "default";
  const shortModel = displayModel.replace("claude-", "").replace("gpt-", "");

  return (
    <div className={styles.modelSelectorWrapper} ref={dropdownRef}>
      <button
        className={styles.modelSelectorBtn}
        onClick={() => setIsOpen(!isOpen)}
        title={`Model: ${displayModel}`}
        style={{ borderColor: isOpen ? accent : undefined }}
      >
        🤖 {shortModel}
      </button>

      {isOpen && (
        <div className={styles.modelDropdown}>
          <div className={styles.modelDropdownHeader}>Select Model</div>
          {models.map((model) => {
            const isSelected = model === currentModel;
            return (
              <button
                key={model}
                className={`${styles.modelDropdownItem} ${isSelected ? styles.modelDropdownItemSelected : ""}`}
                onClick={() => {
                  updateAgentModel(agentId, model);
                  setIsOpen(false);
                }}
              >
                <span className={styles.modelDropdownIcon} style={{ color: isSelected ? accent : undefined }}>
                  {isSelected ? "●" : "○"}
                </span>
                <span className={styles.modelDropdownLabel}>{model}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Column ───

export function AgentColumn({ agentId, columnIndex }: { agentId: string; columnIndex: number }) {
  const session = useAgentSession(agentId);
  const config = useAgentConfig(agentId);
  const send = useSendMessage(agentId);
  const deleteAgentOnGateway = useDeckStore((s) => s.deleteAgentOnGateway);
  const clearMessageHistory = useDeckStore((s) => s.clearMessageHistory);
  const [input, setInput] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const scrollRef = useAutoScroll(session?.messages);
  
  // Delegation hooks
  const { mode, assignedSubagent, assign, unassign } = useColumnDelegation(agentId);
  const availableSubagents = useAvailableSubagents(agentId);

  if (!config || !session) return null;

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    setInput("");
    send(text);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    } else if (e.key === "Tab") {
      const offset = e.shiftKey ? -1 : 1;
      const next = document.querySelector<HTMLTextAreaElement>(
        `[data-deck-input="${columnIndex + offset}"]`
      );
      if (next) {
        e.preventDefault();
        next.focus();
      }
    }
  };

  const isActive =
    session.status === "streaming" ||
    session.status === "thinking" ||
    session.status === "tool_use";

  // Determine if agent has completed work ready to review
  const lastMessage = session.messages[session.messages.length - 1];
  const hasCompletedWork = 
    session.status === "idle" &&
    session.messages.length > 0 &&
    lastMessage?.role === "assistant" &&
    !lastMessage?.streaming;

  return (
    <div 
      className={styles.column} 
      data-status={session.status}
      data-has-completed-work={hasCompletedWork}
    >
      {/* Header */}
      <div className={styles.header}>
        <div
          className={styles.agentIcon}
          style={{
            color: config.accent,
            backgroundColor: `${config.accent}15`,
            borderColor: `${config.accent}30`,
          }}
        >
          {columnIndex + 1}
        </div>
        <div className={styles.headerInfo}>
          <div className={styles.headerRow}>
            <span className={styles.agentName}>{config.name}</span>
            <StatusBadge status={session.status} accent={config.accent} />
            <DelegationBadge 
              mode={mode} 
              assignedSubagent={assignedSubagent}
              onUnassign={unassign}
            />
          </div>
          <div className={styles.headerMeta}>
            {mode === 'delegation' ? (
              <span style={{ color: config.accent }}>Watching subagent stream</span>
            ) : (
              <>
                {config.context ? <span>{config.context}</span> : null}
                {config.model && (
                  <>
                    {config.context ? <span className={styles.metaDot}>·</span> : null}
                    <span style={{ color: config.accent, opacity: 0.5 }}>
                      {config.model}
                    </span>
                  </>
                )}
              </>
            )}
            <FailoverBadge session={session} />
          </div>
        </div>
        <div className={styles.headerActions}>
          <ModelSelector
            currentModel={config.model}
            agentId={agentId}
            accent={config.accent}
          />
          <button 
            className={styles.headerBtn} 
            title="Clear history"
            onClick={() => clearMessageHistory(agentId)}
          >
            🗑
          </button>
          <button
            className={`${styles.deleteBtn} ${confirmDelete ? styles.confirmDelete : ""}`}
            title={confirmDelete ? "Click again to confirm" : "Delete agent"}
            onClick={() => {
              if (confirmDelete) {
                deleteAgentOnGateway(agentId);
              } else {
                setConfirmDelete(true);
                setTimeout(() => setConfirmDelete(false), 3000);
              }
            }}
          >
            {confirmDelete ? "✕" : "×"}
          </button>
        </div>
      </div>

      {/* Messages */}
      <div ref={scrollRef} className={styles.messages}>
        {session.messages.length === 0 && (
          <div className={styles.emptyState}>
            <div
              className={styles.emptyIcon}
              style={{ color: config.accent }}
            >
              {columnIndex + 1}
            </div>
            <p>
              {mode === 'delegation' 
                ? 'Waiting for subagent activity...'
                : `Send a message to start a conversation with ${config.name}`}
            </p>
          </div>
        )}
        {session.messages.map((msg) =>
          msg.role === "compaction" ? (
            <CompactionDivider key={msg.id} message={msg} />
          ) : msg.role === "system" ? (
            <SystemMessage key={msg.id} message={msg} />
          ) : (
            <MessageBubble key={msg.id} message={msg} accent={config.accent} />
          )
        )}
      </div>

      {/* Input */}
      <div className={styles.inputArea}>
        {mode === 'delegation' ? (
          <div className={styles.delegationFooter}>
            <span className={styles.delegationFooterText}>
              📡 Streaming from subagent
            </span>
            <button 
              className={styles.delegationStopBtn}
              onClick={unassign}
              style={{ borderColor: config.accent }}
            >
              Stop Watching
            </button>
          </div>
        ) : (
          <>
            <div className={styles.inputActions}>
              <SubagentSelector
                columnId={agentId}
                availableSubagents={availableSubagents}
                onSelect={assign}
                accent={config.accent}
              />
            </div>
            <div className={styles.inputWrapper}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Message ${config.name}...`}
                className={styles.input}
                data-deck-input={columnIndex}
                autoComplete="off"
                autoCapitalize="off"
                rows={4}
              />
              <button
                className={styles.sendBtn}
                onClick={handleSend}
                disabled={!input.trim()}
                style={
                  input.trim()
                    ? { backgroundColor: config.accent, color: "#000" }
                    : undefined
                }
              >
                ↑
              </button>
            </div>
          </>
        )}
        {isActive && (
          <div
            className={styles.streamingBar}
            style={{ backgroundColor: config.accent }}
          />
        )}
      </div>
    </div>
  );
}
