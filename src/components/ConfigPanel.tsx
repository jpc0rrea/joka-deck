import { useState, useEffect, useCallback } from "react";
import {
  getModelDisplayName,
  loadModelPreferences,
  saveModelPreferences,
  type ModelPreferences,
} from "../lib/models";
import { ProviderIcon } from "./ProviderIcon";
import { useAvailableModels } from "../hooks";
import styles from "./ConfigPanel.module.css";

interface ModelItemProps {
  modelId: string;
  enabled: boolean;
  isDefault: boolean;
  onToggle: () => void;
  onSetDefault: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function ModelItem({
  modelId,
  enabled,
  isDefault,
  onToggle,
  onSetDefault,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: ModelItemProps) {
  const displayName = getModelDisplayName(modelId);

  return (
    <div className={`${styles.modelItem} ${enabled ? styles.modelEnabled : styles.modelDisabled}`}>
      <div className={styles.modelInfo}>
        <ProviderIcon modelId={modelId} size={16} />
        <span className={styles.modelName}>{displayName}</span>
        <span className={styles.modelId}>{modelId}</span>
        {isDefault && <span className={styles.defaultBadge}>default</span>}
      </div>
      
      <div className={styles.modelActions}>
        {/* Move buttons */}
        <button
          className={styles.moveBtn}
          onClick={onMoveUp}
          disabled={isFirst}
          title="Move up"
        >
          ↑
        </button>
        <button
          className={styles.moveBtn}
          onClick={onMoveDown}
          disabled={isLast}
          title="Move down"
        >
          ↓
        </button>
        
        {/* Set as default */}
        <button
          className={`${styles.defaultBtn} ${isDefault ? styles.defaultBtnActive : ""}`}
          onClick={onSetDefault}
          disabled={!enabled}
          title={isDefault ? "Current default" : "Set as default"}
        >
          ★
        </button>
        
        {/* Enable/disable toggle */}
        <button
          className={`${styles.toggleBtn} ${enabled ? styles.toggleOn : styles.toggleOff}`}
          onClick={onToggle}
        >
          {enabled ? "ON" : "OFF"}
        </button>
      </div>
    </div>
  );
}

export function ConfigPanel() {
  const allModels = useAvailableModels();
  const [prefs, setPrefs] = useState<ModelPreferences>(() => loadModelPreferences());
  const [hasChanges, setHasChanges] = useState(false);

  // Merge available models with preferences
  const orderedModels = (() => {
    const orderMap = new Map(prefs.modelOrder.map((m, i) => [m, i]));
    const sorted = [...allModels].sort((a, b) => {
      const orderA = orderMap.get(a) ?? 999;
      const orderB = orderMap.get(b) ?? 999;
      return orderA - orderB;
    });
    return sorted;
  })();

  const updatePrefs = useCallback((newPrefs: Partial<ModelPreferences>) => {
    setPrefs((prev) => {
      const updated = { ...prev, ...newPrefs };
      return updated;
    });
    setHasChanges(true);
  }, []);

  const handleToggle = useCallback((modelId: string) => {
    setPrefs((prev) => {
      const enabledSet = new Set(prev.enabledModels);
      if (enabledSet.has(modelId)) {
        enabledSet.delete(modelId);
        // If disabling the default, pick a new one
        if (prev.defaultModel === modelId) {
          const remaining = prev.enabledModels.filter((m) => m !== modelId);
          return {
            ...prev,
            enabledModels: Array.from(enabledSet),
            defaultModel: remaining[0] || "",
          };
        }
      } else {
        enabledSet.add(modelId);
      }
      return { ...prev, enabledModels: Array.from(enabledSet) };
    });
    setHasChanges(true);
  }, []);

  const handleSetDefault = useCallback((modelId: string) => {
    updatePrefs({ defaultModel: modelId });
  }, [updatePrefs]);

  const handleMoveUp = useCallback((modelId: string) => {
    setPrefs((prev) => {
      const order = [...prev.modelOrder];
      const idx = order.indexOf(modelId);
      if (idx > 0) {
        [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
      }
      return { ...prev, modelOrder: order };
    });
    setHasChanges(true);
  }, []);

  const handleMoveDown = useCallback((modelId: string) => {
    setPrefs((prev) => {
      const order = [...prev.modelOrder];
      const idx = order.indexOf(modelId);
      if (idx >= 0 && idx < order.length - 1) {
        [order[idx], order[idx + 1]] = [order[idx + 1], order[idx]];
      }
      return { ...prev, modelOrder: order };
    });
    setHasChanges(true);
  }, []);

  const handleSave = useCallback(() => {
    saveModelPreferences(prefs);
    setHasChanges(false);
  }, [prefs]);

  const handleReset = useCallback(() => {
    const defaultPrefs = loadModelPreferences();
    setPrefs(defaultPrefs);
    setHasChanges(false);
  }, []);

  // Ensure all available models are in the order list
  useEffect(() => {
    const orderSet = new Set(prefs.modelOrder);
    const newModels = allModels.filter((m) => !orderSet.has(m));
    if (newModels.length > 0) {
      setPrefs((prev) => ({
        ...prev,
        modelOrder: [...prev.modelOrder, ...newModels],
      }));
    }
  }, [allModels, prefs.modelOrder]);

  return (
    <div className={styles.container}>
      <div className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2 className={styles.sectionTitle}>🤖 Model Configuration</h2>
          <p className={styles.sectionDesc}>
            Enable/disable models and set their order in the dropdown. The order here
            determines how models appear when selecting for each agent.
          </p>
        </div>

        <div className={styles.modelList}>
          {orderedModels.map((modelId, index) => (
            <ModelItem
              key={modelId}
              modelId={modelId}
              enabled={prefs.enabledModels.includes(modelId)}
              isDefault={prefs.defaultModel === modelId}
              onToggle={() => handleToggle(modelId)}
              onSetDefault={() => handleSetDefault(modelId)}
              onMoveUp={() => handleMoveUp(modelId)}
              onMoveDown={() => handleMoveDown(modelId)}
              isFirst={index === 0}
              isLast={index === orderedModels.length - 1}
            />
          ))}
        </div>

        <div className={styles.actions}>
          <button
            className={`${styles.saveBtn} ${hasChanges ? styles.saveBtnActive : ""}`}
            onClick={handleSave}
            disabled={!hasChanges}
          >
            {hasChanges ? "Save Changes" : "Saved"}
          </button>
          <button className={styles.resetBtn} onClick={handleReset}>
            Reset
          </button>
        </div>
      </div>

      <div className={styles.section}>
        <h2 className={styles.sectionTitle}>📋 Quick Info</h2>
        <div className={styles.infoGrid}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Enabled Models</span>
            <span className={styles.infoValue}>{prefs.enabledModels.length}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Default Model</span>
            <span className={styles.infoValue}>
              {getModelDisplayName(prefs.defaultModel)}
            </span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>Available Models</span>
            <span className={styles.infoValue}>{allModels.length}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
