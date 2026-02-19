import { useEffect, useRef, useCallback, useMemo } from "react";
import { useDeckStore } from "../lib/store";
import type { AgentConfig, DeckConfig, GatewaySession } from "../types";

/**
 * Initialize the deck with config. Call once at app root.
 */
export function useDeckInit(config: Partial<DeckConfig>) {
  const initialize = useDeckStore((s) => s.initialize);
  const disconnect = useDeckStore((s) => s.disconnect);
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      initialized.current = true;
      initialize(config);
    }
    return () => {
      initialized.current = false;
      disconnect();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * Get session data for a specific agent.
 */
export function useAgentSession(agentId: string) {
  return useDeckStore((s) => s.sessions[agentId]);
}

/**
 * Get the agent config by ID.
 */
export function useAgentConfig(agentId: string): AgentConfig | undefined {
  return useDeckStore((s) => s.config.agents.find((a) => a.id === agentId));
}

/**
 * Send a message to an agent. Returns a stable callback.
 */
export function useSendMessage(agentId: string) {
  const sendMessage = useDeckStore((s) => s.sendMessage);
  return useCallback(
    (text: string) => sendMessage(agentId, text),
    [agentId, sendMessage]
  );
}

/**
 * Auto-scroll a container to bottom when content changes.
 */
export function useAutoScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
    }
  }, [dep]);

  return ref;
}

/**
 * Get global deck stats.
 */
export function useDeckStats() {
  const sessions = useDeckStore((s) => s.sessions);
  const connected = useDeckStore((s) => s.gatewayConnected);

  const agents = Object.values(sessions);
  const streaming = agents.filter((a) => a.status === "streaming").length;
  const thinking = agents.filter((a) => a.status === "thinking").length;
  const errors = agents.filter((a) => a.status === "error").length;
  const totalTokens = agents.reduce(
    (sum, a) => sum + (a.usage?.totalTokens ?? a.tokenCount),
    0
  );
  const waitingForUser = agents.filter((a) => {
    if (a.status !== "idle" || a.messages.length === 0) return false;
    const last = a.messages[a.messages.length - 1];
    return last.role === "assistant" && !last.streaming;
  }).length;

  return {
    gatewayConnected: connected,
    totalAgents: agents.length,
    streaming,
    thinking,
    active: streaming + thinking,
    idle: agents.length - streaming - thinking,
    errors,
    totalTokens,
    waitingForUser,
  };
}

/**
 * Monitor subagents with polling.
 * Polls the gateway for active sessions every `intervalMs` (default 5000ms).
 */
export function useSubagentMonitor(intervalMs: number = 5000) {
  const gatewaySessions = useDeckStore((s) => s.gatewaySessions);
  const pollingEnabled = useDeckStore((s) => s.subagentPollingEnabled);
  const gatewayConnected = useDeckStore((s) => s.gatewayConnected);
  const refreshGatewaySessions = useDeckStore((s) => s.refreshGatewaySessions);
  const lastPoll = useDeckStore((s) => s.lastSubagentPoll);

  useEffect(() => {
    if (!pollingEnabled || !gatewayConnected) return;

    // Initial fetch
    refreshGatewaySessions();

    // Set up polling
    const timer = setInterval(() => {
      refreshGatewaySessions();
    }, intervalMs);

    return () => clearInterval(timer);
  }, [pollingEnabled, gatewayConnected, intervalMs, refreshGatewaySessions]);

  // Filter and categorize sessions
  const categorized = useMemo(() => {
    const subagents: GatewaySession[] = [];
    const mainSessions: GatewaySession[] = [];
    
    for (const session of gatewaySessions) {
      // Subagents have keys like "agent:main:subagent:uuid"
      if (session.key.includes(":subagent:") || session.parentSession) {
        subagents.push(session);
      } else {
        mainSessions.push(session);
      }
    }
    
    // Sort by activity (most recent first)
    subagents.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    mainSessions.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    
    return {
      subagents,
      mainSessions,
      all: gatewaySessions,
      activeSubagents: subagents.filter(s => s.active || s.status === "running" || s.status === "streaming"),
      completedSubagents: subagents.filter(s => !s.active && s.status !== "running" && s.status !== "streaming"),
    };
  }, [gatewaySessions]);

  return {
    ...categorized,
    lastPoll,
    pollingEnabled,
    refresh: refreshGatewaySessions,
  };
}

/**
 * Get subagent stats for the TopBar.
 */
export function useSubagentStats() {
  const gatewaySessions = useDeckStore((s) => s.gatewaySessions);
  
  return useMemo(() => {
    const subagents = gatewaySessions.filter(
      s => s.key.includes(":subagent:") || s.parentSession
    );
    
    const active = subagents.filter(
      s => s.active || s.status === "running" || s.status === "streaming"
    ).length;
    
    return {
      total: subagents.length,
      active,
      idle: subagents.length - active,
    };
  }, [gatewaySessions]);
}

/**
 * Get available subagents for delegation (not already assigned to another column).
 */
export function useAvailableSubagents(currentColumnId: string) {
  const gatewaySessions = useDeckStore((s) => s.gatewaySessions);
  const sessions = useDeckStore((s) => s.sessions);
  
  return useMemo(() => {
    // Get all assigned subagent keys
    const assignedKeys = new Set<string>();
    for (const [columnId, session] of Object.entries(sessions)) {
      if (columnId !== currentColumnId && session.assignedSubagent) {
        assignedKeys.add(session.assignedSubagent);
      }
    }
    
    // Filter to subagents that are active and not assigned elsewhere
    const subagents = gatewaySessions.filter(s => {
      const isSubagent = s.key.includes(":subagent:") || s.parentSession;
      const isActive = s.active || s.status === "running" || s.status === "streaming";
      const notAssigned = !assignedKeys.has(s.key);
      return isSubagent && isActive && notAssigned;
    });
    
    // Sort by activity (most recent first)
    subagents.sort((a, b) => b.lastActivityAt - a.lastActivityAt);
    
    return subagents;
  }, [gatewaySessions, sessions, currentColumnId]);
}

/**
 * Hook for column delegation actions.
 */
export function useColumnDelegation(columnId: string) {
  const assignSubagentToColumn = useDeckStore((s) => s.assignSubagentToColumn);
  const unassignSubagentFromColumn = useDeckStore((s) => s.unassignSubagentFromColumn);
  const session = useDeckStore((s) => s.sessions[columnId]);
  
  const assign = useCallback(
    (sessionKey: string) => assignSubagentToColumn(columnId, sessionKey),
    [columnId, assignSubagentToColumn]
  );
  
  const unassign = useCallback(
    () => unassignSubagentFromColumn(columnId),
    [columnId, unassignSubagentFromColumn]
  );
  
  return {
    mode: session?.mode ?? 'chat',
    assignedSubagent: session?.assignedSubagent,
    assign,
    unassign,
  };
}

/**
 * Get available models. Fetches from gateway, falls back to hardcoded.
 */
export function useAvailableModels() {
  const availableModels = useDeckStore((s) => s.availableModels);
  const modelsLoaded = useDeckStore((s) => s.modelsLoaded);
  const fetchAvailableModels = useDeckStore((s) => s.fetchAvailableModels);
  const gatewayConnected = useDeckStore((s) => s.gatewayConnected);

  useEffect(() => {
    if (gatewayConnected && !modelsLoaded) {
      fetchAvailableModels();
    }
  }, [gatewayConnected, modelsLoaded, fetchAvailableModels]);

  const fallbackModels = useMemo(
    () => [
      "claude-sonnet-4-5",
      "claude-opus-4-6",
      "claude-opus-4-5",
      "gpt-5.3-codex",
    ],
    []
  );

  return modelsLoaded && availableModels.length > 0
    ? availableModels
    : fallbackModels;
}

/**
 * Get subagent sessions that should be displayed as columns.
 */
export function useSubagentColumns() {
  const subagentColumnOrder = useDeckStore((s) => s.subagentColumnOrder);
  const gatewaySessions = useDeckStore((s) => s.gatewaySessions);

  return useMemo(() => {
    const sessionMap = new Map(gatewaySessions.map((s) => [s.key, s]));
    return subagentColumnOrder
      .map((key) => sessionMap.get(key))
      .filter((s): s is GatewaySession => s != null);
  }, [subagentColumnOrder, gatewaySessions]);
}
