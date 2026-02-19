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
  "claude-opus-4-6": "Claude Opus 4.6",
  "claude-opus-4-5": "Claude Opus 4.5",
  "claude-sonnet-4-5": "Claude Sonnet 4.5",
  "claude-sonnet-4-0": "Claude Sonnet 4",
  "claude-haiku-3-5": "Claude Haiku 3.5",
  
  // OpenAI
  "gpt-5.3-codex": "GPT-5.3 Codex",
  "gpt-5.3": "GPT-5.3",
  "gpt-5.2": "GPT-5.2",
  "gpt-5": "GPT-5",
  "o3": "o3",
  "o3-mini": "o3 Mini",
  
  // Aliases with provider prefix
  "anthropic/claude-opus-4-6": "Claude Opus 4.6",
  "anthropic/claude-opus-4-5": "Claude Opus 4.5",
  "anthropic/claude-sonnet-4-5": "Claude Sonnet 4.5",
  "openai-codex/gpt-5.3-codex": "GPT-5.3 Codex",
  "openai/gpt-5.3": "GPT-5.3",
  "openai/o3": "o3",
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
    .replace(/^claude-/, "Claude ")
    .replace(/^gpt-/, "GPT-")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// Get provider key for a model (used for icon rendering)
export type ProviderKey = "anthropic" | "openai" | "google" | "xai" | "other";

export function getModelProvider(modelId: string): ProviderKey {
  const id = modelId.toLowerCase();
  if (id.includes("claude") || id.startsWith("anthropic/")) return "anthropic";
  if (id.includes("gpt") || id.startsWith("openai") || id.startsWith("o1") || id.startsWith("o3")) return "openai";
  if (id.includes("gemini") || id.startsWith("google/")) return "google";
  if (id.includes("grok") || id.startsWith("xai/")) return "xai";
  return "other";
}

// Provider accent colors
export const PROVIDER_COLORS: Record<ProviderKey, string> = {
  anthropic: "#d4a27f",
  openai: "#10a37f",
  google: "#4285f4",
  xai: "#ffffff",
  other: "#888888",
};

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
      const parsed = JSON.parse(stored) as Partial<ModelPreferences>;
      
      // Merge: ensure new default models get added to existing prefs
      const storedEnabled = new Set(parsed.enabledModels || []);
      const storedOrder = new Set(parsed.modelOrder || []);
      
      // Add any default models not in stored prefs
      for (const m of DEFAULT_PREFS.enabledModels) {
        if (!storedEnabled.has(m)) {
          (parsed.enabledModels || []).push(m);
        }
      }
      for (const m of DEFAULT_PREFS.modelOrder) {
        if (!storedOrder.has(m)) {
          (parsed.modelOrder || []).push(m);
        }
      }
      
      return {
        enabledModels: parsed.enabledModels || DEFAULT_PREFS.enabledModels,
        modelOrder: parsed.modelOrder || DEFAULT_PREFS.modelOrder,
        defaultModel: parsed.defaultModel || DEFAULT_PREFS.defaultModel,
      };
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

// Get ordered list of enabled models (for dropdowns) - deduplicates by display name
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
  
  // Deduplicate by display name (keep the first one in order)
  const seen = new Set<string>();
  return enabled.filter((m) => {
    const display = getModelDisplayName(m);
    if (seen.has(display)) return false;
    seen.add(display);
    return true;
  });
}
