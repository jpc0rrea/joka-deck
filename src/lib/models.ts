// Model configuration with friendly display names (Cursor-style)

export interface ModelConfig {
  id: string;
  displayName: string;
  provider: "anthropic" | "openai" | "google" | "other";
  enabled: boolean;
  order: number;
}

// Map of model IDs to friendly display names
export const MODEL_DISPLAY_NAMES: Record<string, string> = {
  // Anthropic Claude
  "claude-opus-4-6": "Opus 4.6",
  "claude-opus-4-5": "Opus 4.5",
  "claude-sonnet-4-5": "Sonnet 4.5",
  "claude-sonnet-4-0": "Sonnet 4",
  "claude-sonnet-3-5": "Sonnet 3.5",
  "claude-haiku-3-5": "Haiku 3.5",
  "claude-3-5-sonnet": "Sonnet 3.5",
  "claude-3-opus": "Opus 3",
  "claude-3-sonnet": "Sonnet 3",
  "claude-3-haiku": "Haiku 3",
  
  // OpenAI
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "gpt-5.2": "GPT-5.2",
  "gpt-5": "GPT-5",
  "gpt-4o": "GPT-4o",
  "gpt-4-turbo": "GPT-4 Turbo",
  "gpt-4": "GPT-4",
  "gpt-3.5-turbo": "GPT-3.5",
  "o3": "o3",
  "o3-mini": "o3 mini",
  "o1": "o1",
  "o1-mini": "o1 mini",
  "o1-preview": "o1 preview",
  
  // Google
  "gemini-2.0-flash": "Gemini 2.0 Flash",
  "gemini-1.5-pro": "Gemini 1.5 Pro",
  "gemini-1.5-flash": "Gemini 1.5 Flash",
  
  // Aliases (anthropic/ prefix)
  "anthropic/claude-opus-4-6": "Opus 4.6",
  "anthropic/claude-opus-4-5": "Opus 4.5",
  "anthropic/claude-sonnet-4-5": "Sonnet 4.5",
  "anthropic/claude-sonnet-4-0": "Sonnet 4",
  "anthropic/claude-3-5-sonnet": "Sonnet 3.5",
  "anthropic/claude-3-opus": "Opus 3",
  
  // OpenAI aliases
  "openai/gpt-4o": "GPT-4o",
  "openai/gpt-4-turbo": "GPT-4 Turbo",
  "openai/o3": "o3",
  "openai/o3-mini": "o3 mini",
  "openai/o1": "o1",
};

// Get friendly display name for a model
export function getModelDisplayName(modelId: string): string {
  // Check direct mapping
  if (MODEL_DISPLAY_NAMES[modelId]) {
    return MODEL_DISPLAY_NAMES[modelId];
  }
  
  // Try without provider prefix
  const withoutPrefix = modelId.split("/").pop() || modelId;
  if (MODEL_DISPLAY_NAMES[withoutPrefix]) {
    return MODEL_DISPLAY_NAMES[withoutPrefix];
  }
  
  // Fallback: clean up the model name
  return withoutPrefix
    .replace(/^claude-/, "")
    .replace(/^gpt-/, "GPT-")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Get provider icon/emoji for a model
export function getModelProviderIcon(modelId: string): string {
  const id = modelId.toLowerCase();
  if (id.includes("claude") || id.startsWith("anthropic/")) {
    return "🟣"; // Anthropic purple
  }
  if (id.includes("gpt") || id.startsWith("openai/") || id.startsWith("o1") || id.startsWith("o3")) {
    return "🟢"; // OpenAI green
  }
  if (id.includes("gemini") || id.startsWith("google/")) {
    return "🔵"; // Google blue
  }
  return "⚪"; // Unknown
}

// Storage key for model preferences
const MODEL_PREFS_KEY = "openclaw-deck-model-prefs";

export interface ModelPreferences {
  enabledModels: string[];
  modelOrder: string[];
  defaultModel: string;
}

const DEFAULT_PREFS: ModelPreferences = {
  enabledModels: [
    "claude-opus-4-6",
    "claude-opus-4-5", 
    "claude-sonnet-4-5",
    "gpt-5.3-codex",
    "o3",
  ],
  modelOrder: [
    "claude-opus-4-6",
    "claude-opus-4-5",
    "claude-sonnet-4-5",
    "gpt-5.3-codex",
    "o3",
  ],
  defaultModel: "claude-sonnet-4-5",
};

export function loadModelPreferences(): ModelPreferences {
  try {
    const stored = localStorage.getItem(MODEL_PREFS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_PREFS, ...parsed };
    }
  } catch (err) {
    console.warn("[Models] Failed to load preferences:", err);
  }
  return DEFAULT_PREFS;
}

export function saveModelPreferences(prefs: ModelPreferences): void {
  try {
    localStorage.setItem(MODEL_PREFS_KEY, JSON.stringify(prefs));
  } catch (err) {
    console.warn("[Models] Failed to save preferences:", err);
  }
}

// Get ordered list of enabled models (for dropdowns)
export function getOrderedEnabledModels(
  availableModels: string[],
  prefs: ModelPreferences
): string[] {
  const enabledSet = new Set(prefs.enabledModels);
  const orderMap = new Map(prefs.modelOrder.map((m, i) => [m, i]));
  
  // Filter to enabled models that are available
  const enabled = availableModels.filter((m) => enabledSet.has(m));
  
  // Sort by user-defined order
  enabled.sort((a, b) => {
    const orderA = orderMap.get(a) ?? 999;
    const orderB = orderMap.get(b) ?? 999;
    return orderA - orderB;
  });
  
  return enabled;
}
