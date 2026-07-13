"use client";

import { useState, useEffect, useMemo } from "react";

export default function PricingModal({ isOpen, onClose, onSave }) {
  const [pricingData, setPricingData] = useState({});
  const [defaultPricing, setDefaultPricing] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeProvider, setActiveProvider] = useState("");
  const [modalSearchQuery, setModalSearchQuery] = useState("");

  useEffect(() => {
    if (isOpen) {
      loadAllPricing();
    }
  }, [isOpen]);

  const loadAllPricing = async () => {
    setLoading(true);
    try {
      const [pricingRes, defaultsRes] = await Promise.all([
        fetch("/api/pricing"),
        fetch("/api/pricing?defaults=true")
      ]);

      if (pricingRes.ok && defaultsRes.ok) {
        const pricing = await pricingRes.json();
        const defaults = await defaultsRes.json();
        setPricingData(pricing);
        setDefaultPricing(defaults);

        // Pre-select first provider as active
        const providers = Object.keys(pricing).sort();
        if (providers.length > 0) {
          setActiveProvider(providers[0]);
        }
      }
    } catch (error) {
      console.error("Failed to load pricing in modal:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePricingChange = (provider, model, field, value) => {
    const numValue = parseFloat(value);
    if (isNaN(numValue) || numValue < 0) return;

    setPricingData(prev => {
      const newData = JSON.parse(JSON.stringify(prev)); // Deep copy safely
      if (!newData[provider]) newData[provider] = {};
      if (!newData[provider][model]) newData[provider][model] = {};
      newData[provider][model][field] = numValue;
      return newData;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const response = await fetch("/api/pricing", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pricingData)
      });

      if (response.ok) {
        onSave?.();
        onClose();
      } else {
        const error = await response.json();
        alert(`Failed to save pricing: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to save pricing:", error);
      alert("Failed to save pricing");
    } finally {
      setSaving(false);
    }
  };

  const handleResetAll = async () => {
    if (!confirm("Reset all pricing overrides to system defaults? This cannot be undone.")) return;

    try {
      const response = await fetch("/api/pricing", { method: "DELETE" });
      if (response.ok) {
        const freshRes = await fetch("/api/pricing?defaults=true");
        if (freshRes.ok) {
          const defaults = await freshRes.json();
          setPricingData(defaults);
        }
        onSave?.();
      }
    } catch (error) {
      console.error("Failed to reset pricing:", error);
      alert("Failed to reset pricing");
    }
  };

  const handleResetModel = async (provider, model) => {
    if (!confirm(`Reset ${model} pricing overrides to default?`)) return;

    try {
      const response = await fetch(`/api/pricing?provider=${provider}&model=${model}`, {
        method: "DELETE"
      });
      if (response.ok) {
        // Update local state for just this model
        const defaultModelPricing = defaultPricing[provider]?.[model];
        if (defaultModelPricing) {
          setPricingData(prev => {
            const newData = JSON.parse(JSON.stringify(prev));
            if (newData[provider]?.[model]) {
              newData[provider][model] = { ...defaultModelPricing };
            }
            return newData;
          });
        }
      }
    } catch (error) {
      console.error("Failed to reset model pricing:", error);
    }
  };

  // Preset utilities
  const applyMarkup = (markupPercent) => {
    if (!activeProvider || !pricingData[activeProvider]) return;
    const factor = 1 + markupPercent / 100;

    setPricingData(prev => {
      const newData = JSON.parse(JSON.stringify(prev));
      const models = newData[activeProvider];
      Object.keys(models).forEach(model => {
        const originalRates = models[model];
        Object.keys(originalRates).forEach(field => {
          originalRates[field] = parseFloat((originalRates[field] * factor).toFixed(3));
        });
      });
      return newData;
    });
  };

  const syncReasoningRates = () => {
    if (!activeProvider || !pricingData[activeProvider]) return;

    setPricingData(prev => {
      const newData = JSON.parse(JSON.stringify(prev));
      const models = newData[activeProvider];
      Object.keys(models).forEach(model => {
        if (models[model].output !== undefined) {
          models[model].reasoning = models[model].output;
        }
      });
      return newData;
    });
  };

  if (!isOpen) return null;

  const allProviders = Object.keys(pricingData).sort();
  const pricingFields = [
    { key: "input", label: "Input" },
    { key: "output", label: "Output" },
    { key: "cached", label: "Cached Read" },
    { key: "reasoning", label: "Reasoning" },
    { key: "cache_creation", label: "Cache Create" }
  ];

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4 md:p-6 animate-fade-in">
      <div className="bg-surface border border-border rounded-2xl shadow-elevated max-w-7xl w-full max-h-[90vh] overflow-hidden flex flex-col slide-in-top">

        {/* Header */}
        <div className="p-5 border-b border-border-subtle flex items-center justify-between bg-surface-2/30">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-brand-500/10 text-brand-500 flex items-center justify-center">
              <span className="material-symbols-outlined text-[22px]">tune</span>
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-text-main">Pricing Rate Configuration</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Set cost parameters in Dollars per Million Tokens ($/1M). All metrics sync live.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-text-subtle hover:text-text-main text-2xl h-8 w-8 rounded-full hover:bg-surface-2 flex items-center justify-center transition-all cursor-pointer"
          >
            ×
          </button>
        </div>

        {/* Content Panel */}
        <div className="flex-1 overflow-hidden flex flex-col md:flex-row">

          {/* Sidebar - Provider Tabs */}
          <div className="w-full md:w-64 border-b md:border-b-0 md:border-r border-border-subtle bg-surface-2/20 flex flex-row md:flex-col overflow-x-auto md:overflow-x-hidden md:overflow-y-auto custom-scrollbar p-3 gap-1">
            <div className="hidden md:block px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-text-subtle mb-1">
              Providers Registry
            </div>
            {loading ? (
              <div className="space-y-2 p-2 hidden md:block">
                {[1, 2, 3, 4, 5].map(i => (
                  <div key={i} className="h-8 bg-surface-2 animate-pulse rounded"></div>
                ))}
              </div>
            ) : (
              allProviders.map(provider => {
                const isActive = provider === activeProvider;
                const modelCount = Object.keys(pricingData[provider] || {}).length;
                return (
                  <button
                    key={provider}
                    onClick={() => setActiveProvider(provider)}
                    className={`flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-sm font-semibold transition-all text-left whitespace-nowrap cursor-pointer ${
                      isActive
                        ? "bg-brand-500 text-white shadow-sm font-bold"
                        : "text-text-muted hover:bg-surface-2 hover:text-text-main"
                    }`}
                  >
                    <span>{provider.toUpperCase()}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? "bg-white/20 text-white" : "bg-surface-3 text-text-muted"}`}>
                      {modelCount}
                    </span>
                  </button>
                );
              })
            )}
          </div>

          {/* Main Editing Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-surface">
            {/* Search and Quick presets header */}
            <div className="p-4 border-b border-border-subtle bg-surface-2/10 flex flex-col sm:flex-row gap-4 items-center justify-between">

              {/* Inner Search Box */}
              <div className="relative w-full sm:max-w-xs">
                <span className="material-symbols-outlined text-text-subtle absolute left-3 top-2.5 text-[18px]">search</span>
                <input
                  type="text"
                  value={modalSearchQuery}
                  onChange={(e) => setModalSearchQuery(e.target.value)}
                  placeholder={`Search ${activeProvider.toUpperCase()} models...`}
                  className="w-full pl-9 pr-4 py-2 bg-bg border border-border-subtle rounded-xl text-sm text-text-main placeholder-text-subtle focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                />
              </div>

              {/* Bulk Presets Options */}
              <div className="flex items-center gap-2 flex-wrap w-full sm:w-auto justify-end">
                <button
                  onClick={() => applyMarkup(10)}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-surface-2 hover:bg-surface-3 text-text-main rounded-lg border border-border-subtle transition-all cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">trending_up</span>
                  +10% Markup
                </button>
                <button
                  onClick={() => applyMarkup(-10)}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-surface-2 hover:bg-surface-3 text-text-main rounded-lg border border-border-subtle transition-all cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">trending_down</span>
                  -10% Discount
                </button>
                <button
                  onClick={syncReasoningRates}
                  className="px-2.5 py-1.5 text-xs font-semibold bg-surface-2 hover:bg-surface-3 text-text-main rounded-lg border border-border-subtle transition-all cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[14px]">psychology</span>
                  Reasoning = Output
                </button>
              </div>

            </div>

            {/* Model pricing input list */}
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar space-y-6">
              {loading ? (
                <div className="space-y-4 py-4">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="border border-border-subtle rounded-xl p-4 space-y-3">
                      <div className="h-6 bg-surface-2 animate-pulse rounded w-1/4"></div>
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                        {[1, 2, 3, 4, 5].map(j => (
                          <div key={j} className="h-10 bg-surface-2 animate-pulse rounded"></div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : activeProvider && pricingData[activeProvider] ? (
                (() => {
                  const models = Object.keys(pricingData[activeProvider])
                    .filter(modelName => modelName.toLowerCase().includes(modalSearchQuery.toLowerCase()))
                    .sort();

                  if (models.length === 0) {
                    return (
                      <div className="text-center py-16 text-text-muted flex flex-col items-center justify-center gap-3">
                        <span className="material-symbols-outlined text-[40px] text-text-subtle">sentiment_dissatisfied</span>
                        <p className="font-semibold text-text-main">No matching models found</p>
                      </div>
                    );
                  }

                  return models.map(model => {
                    const currentModelPricing = pricingData[activeProvider][model];
                    const defaultModelPricing = defaultPricing[activeProvider]?.[model] || {};

                    // Detect customized overrides
                    const isCustomized = Object.keys(currentModelPricing).some(
                      field => currentModelPricing[field] !== defaultModelPricing[field]
                    );

                    return (
                      <div
                        key={model}
                        className={`border rounded-xl p-4 transition-all ${
                          isCustomized
                            ? "border-amber-500/30 bg-amber-500/[0.01]"
                            : "border-border-subtle bg-surface"
                        }`}
                      >
                        {/* Model name header inside card */}
                        <div className="flex items-center justify-between mb-3 pb-2 border-b border-border-subtle">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-text-main text-base">{model}</span>
                            {isCustomized && (
                              <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-600 text-[9px] font-bold uppercase tracking-wider animate-pulse-glow">
                                Customized Override
                              </span>
                            )}
                          </div>

                          {/* Reset model overrides button */}
                          {isCustomized && (
                            <button
                              onClick={() => handleResetModel(activeProvider, model)}
                              className="text-xs text-brand-500 hover:underline flex items-center gap-1 cursor-pointer font-semibold"
                            >
                              <span className="material-symbols-outlined text-[14px]">undo</span>
                              Reset Model Defaults
                            </button>
                          )}
                        </div>

                        {/* Responsive grid of input parameters */}
                        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                          {pricingFields.map(field => {
                            const val = currentModelPricing[field.key] !== undefined ? currentModelPricing[field.key] : 0;
                            const defVal = defaultModelPricing[field.key] !== undefined ? defaultModelPricing[field.key] : 0;
                            const fieldIsCustomized = val !== defVal;

                            return (
                              <div key={field.key} className="space-y-1.5">
                                <label className="text-[11px] font-bold text-text-muted block truncate">
                                  {field.label}
                                </label>
                                <div className="relative">
                                  <span className="absolute left-2.5 top-1.5 text-xs text-text-subtle">$</span>
                                  <input
                                    type="number"
                                    step="0.001"
                                    min="0"
                                    value={val}
                                    onChange={(e) => handlePricingChange(activeProvider, model, field.key, e.target.value)}
                                    className={`w-full pl-5 pr-2 py-1 bg-bg border rounded-lg text-sm font-mono text-right transition-all focus:outline-none focus:ring-1 ${
                                      fieldIsCustomized
                                        ? "border-amber-500 text-amber-600 focus:ring-amber-500"
                                        : "border-border-subtle text-text-main focus:ring-brand-500 focus:border-brand-500"
                                    }`}
                                  />
                                </div>
                                <span className={`text-[9px] block text-right font-mono ${fieldIsCustomized ? "text-amber-500/70" : "text-text-subtle"}`}>
                                  Def: ${defVal.toFixed(3)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  });
                })()
              ) : (
                <div className="text-center py-12 text-text-muted">No pricing configuration model selected</div>
              )}
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-surface-2/30 flex items-center justify-between gap-3">
          <button
            onClick={handleResetAll}
            className="px-4 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-xl border border-red-500/20 transition-all font-semibold cursor-pointer"
            disabled={saving}
          >
            Reset All Customizations
          </button>

          <div className="flex gap-2.5">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-text-muted hover:text-text-main hover:bg-surface-2 border border-border-subtle rounded-xl transition-all font-semibold cursor-pointer"
              disabled={saving}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-5 py-2 text-sm bg-brand-500 text-white rounded-xl hover:bg-brand-600 shadow-sm transition-all font-bold cursor-pointer disabled:opacity-50"
              disabled={saving}
            >
              {saving ? "Saving Changes..." : "Save Settings"}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
