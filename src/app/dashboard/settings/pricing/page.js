"use client";

import { useState, useEffect, useMemo } from "react";
import Card from "@/shared/components/Card";
import PricingModal from "@/shared/components/PricingModal";
import Button from "@/shared/components/Button";

export default function PricingSettingsPage() {
  const [showModal, setShowModal] = useState(false);
  const [currentPricing, setCurrentPricing] = useState(null);
  const [defaultPricing, setDefaultPricing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProviderTab, setSelectedProviderTab] = useState("all");
  const [selectedTypeTab, setSelectedTypeTab] = useState("all"); // 'all', 'free', 'paid', 'custom'

  // Cost Calculator States
  const [calcModel, setCalcModel] = useState("");
  const [calcInputTokens, setCalcInputTokens] = useState(100000); // 100k defaults
  const [calcOutputTokens, setCalcOutputTokens] = useState(20000);  // 20k defaults
  const [calcCachedTokens, setCalcCachedTokens] = useState(30000);  // 30k defaults
  const [calcReasoningTokens, setCalcReasoningTokens] = useState(10000); // 10k defaults

  // Toast State
  const [toast, setToast] = useState(null);

  useEffect(() => {
    loadPricingData();
  }, []);

  const showToast = (message, type = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const loadPricingData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pricingRes, defaultsRes] = await Promise.all([
        fetch("/api/pricing"),
        fetch("/api/pricing?defaults=true")
      ]);

      if (pricingRes.ok && defaultsRes.ok) {
        const pricingData = await pricingRes.json();
        const defaultsData = await defaultsRes.json();
        setCurrentPricing(pricingData);
        setDefaultPricing(defaultsData);

        // Pre-select first available model for cost calculator
        const firstProvider = Object.keys(pricingData)[0];
        if (firstProvider) {
          const firstModel = Object.keys(pricingData[firstProvider])[0];
          if (firstModel) {
            setCalcModel(`${firstProvider}/${firstModel}`);
          }
        }
      } else {
        setError("Failed to fetch pricing settings");
      }
    } catch (err) {
      console.error("Failed to load pricing:", err);
      setError("An unexpected error occurred while loading pricing");
    } finally {
      setLoading(false);
    }
  };

  const handlePricingUpdated = () => {
    loadPricingData();
    showToast("Pricing configuration updated successfully!");
  };

  const handleResetAll = async () => {
    if (!confirm("Are you sure you want to reset all custom pricing rates to defaults? This cannot be undone.")) return;

    try {
      const response = await fetch("/api/pricing", { method: "DELETE" });
      if (response.ok) {
        showToast("All pricing successfully reset to defaults!");
        loadPricingData();
      } else {
        showToast("Failed to reset pricing", "error");
      }
    } catch (err) {
      console.error("Error resetting pricing:", err);
      showToast("An error occurred while resetting pricing", "error");
    }
  };

  // Process and flatten pricing data for tabular and dashboard use
  const processedModels = useMemo(() => {
    if (!currentPricing) return [];
    const list = [];

    Object.entries(currentPricing).forEach(([provider, models]) => {
      Object.entries(models).forEach(([modelName, rates]) => {
        // Find if this is customized compared to defaults
        let isCustomized = false;
        const defaultRates = defaultPricing?.[provider]?.[modelName];
        if (defaultRates) {
          isCustomized = Object.keys(rates).some(
            field => rates[field] !== defaultRates[field]
          );
        } else {
          // If it doesn't exist in defaults, it is custom added
          isCustomized = true;
        }

        const isFree = rates.input === 0 && rates.output === 0;

        list.push({
          provider,
          name: modelName,
          id: `${provider}/${modelName}`,
          rates,
          isCustomized,
          isFree,
          defaultRates: defaultRates || rates
        });
      });
    });

    return list;
  }, [currentPricing, defaultPricing]);

  // Unique list of providers for filters
  const providersList = useMemo(() => {
    if (!currentPricing) return [];
    return Object.keys(currentPricing).sort();
  }, [currentPricing]);

  // Filtered models for display
  const filteredModels = useMemo(() => {
    return processedModels.filter(m => {
      // 1. Text Search query
      const matchesSearch = searchQuery
        ? m.name.toLowerCase().includes(searchQuery.toLowerCase()) || m.provider.toLowerCase().includes(searchQuery.toLowerCase())
        : true;

      // 2. Provider tab
      const matchesProvider = selectedProviderTab === "all" || m.provider === selectedProviderTab;

      // 3. Type filter
      let matchesType = true;
      if (selectedTypeTab === "free") {
        matchesType = m.isFree;
      } else if (selectedTypeTab === "paid") {
        matchesType = !m.isFree;
      } else if (selectedTypeTab === "custom") {
        matchesType = m.isCustomized;
      }

      return matchesSearch && matchesProvider && matchesType;
    });
  }, [processedModels, searchQuery, selectedProviderTab, selectedTypeTab]);

  // Pricing Stats computations
  const stats = useMemo(() => {
    if (processedModels.length === 0) return { total: 0, customCount: 0, freeCount: 0, paidCount: 0 };
    const customCount = processedModels.filter(m => m.isCustomized).length;
    const freeCount = processedModels.filter(m => m.isFree).length;
    return {
      total: processedModels.length,
      customCount,
      freeCount,
      paidCount: processedModels.length - freeCount
    };
  }, [processedModels]);

  // Calculate live cost simulation
  const simulationResults = useMemo(() => {
    if (!calcModel || !currentPricing) return null;
    const [p, m] = calcModel.split("/");
    const activeRates = currentPricing[p]?.[m];
    const originalRates = defaultPricing?.[p]?.[m];

    if (!activeRates) return null;

    const calc = (rates) => {
      if (!rates) return 0;
      let total = 0;
      // non-cached input
      const nonCached = Math.max(0, calcInputTokens - calcCachedTokens);
      total += nonCached * (rates.input / 1000000);
      total += calcCachedTokens * ((rates.cached || rates.input) / 1000000);
      total += calcOutputTokens * (rates.output / 1000000);
      total += calcReasoningTokens * ((rates.reasoning || rates.output) / 1000000);
      return total;
    };

    const currentCost = calc(activeRates);
    const defaultCost = originalRates ? calc(originalRates) : currentCost;
    const difference = defaultCost - currentCost;

    return {
      currentCost,
      defaultCost,
      difference,
      percentSaved: defaultCost > 0 ? (difference / defaultCost) * 100 : 0
    };
  }, [calcModel, calcInputTokens, calcOutputTokens, calcCachedTokens, calcReasoningTokens, currentPricing, defaultPricing]);

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8 animate-fade-in">
      {/* Toast Notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 px-4 py-3 rounded-lg shadow-elev border ${
          toast.type === "error"
            ? "bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900 text-red-700 dark:text-red-200"
            : "bg-green-50 dark:bg-green-950/40 border-green-200 dark:border-green-900 text-green-700 dark:text-green-200"
        } transition-all slide-in-right`}>
          <span className="material-symbols-outlined text-[20px]">
            {toast.type === "error" ? "error" : "check_circle"}
          </span>
          <span className="text-sm font-medium">{toast.message}</span>
        </div>
      )}

      {/* Hero Header Banner */}
      <div className="relative overflow-hidden rounded-2xl bg-vibrancy border border-border-subtle p-6 md:p-8 flex flex-col md:flex-row md:items-center justify-between gap-6 dot-grid-bg">
        <div className="space-y-2 z-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-500/10 text-brand-600 dark:text-brand-400 text-xs font-semibold uppercase tracking-wider">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-500"></span>
            </span>
            Real-time Cost Engine
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight text-text-main">
            Pricing Settings
          </h1>
          <p className="text-text-muted max-w-2xl text-sm md:text-base leading-relaxed">
            Redesign and refactor pricing models, set customized markups, or revert rate parameters globally.
            All costs recalculate on the fly for token saver simulations.
          </p>
        </div>
        <div className="flex flex-wrap gap-3 z-10">
          <Button
            onClick={handleResetAll}
            variant="outline"
            className="border-red-500/20 text-red-600 hover:bg-red-50 dark:hover:bg-red-950/20 hover:border-red-500/40 h-10 font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">restart_alt</span>
            Reset All Defaults
          </Button>
          <Button
            onClick={() => setShowModal(true)}
            variant="primary"
            className="h-10 bg-brand-500 hover:bg-brand-600 text-white font-semibold"
          >
            <span className="material-symbols-outlined text-[18px]">edit_note</span>
            Edit Custom Pricing
          </Button>
        </div>
      </div>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="relative overflow-hidden hover:shadow-warm hover:border-brand-500/20 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Total AI Models</p>
              <h3 className="text-3xl font-extrabold text-text-main mt-2">
                {loading ? <span className="animate-pulse">...</span> : stats.total}
              </h3>
              <p className="text-xs text-text-muted mt-2">Mapped in catalog</p>
            </div>
            <div className="p-3 rounded-xl bg-brand-500/5 text-brand-500">
              <span className="material-symbols-outlined text-[24px]">model_training</span>
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden hover:shadow-warm hover:border-brand-500/20 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Customized Overrides</p>
              <h3 className="text-3xl font-extrabold text-text-main mt-2">
                {loading ? <span className="animate-pulse">...</span> : stats.customCount}
              </h3>
              <p className="text-xs text-text-muted mt-2">
                {stats.customCount > 0 ? `${((stats.customCount / stats.total) * 100).toFixed(0)}% of total catalog` : "Using standard rates"}
              </p>
            </div>
            <div className={`p-3 rounded-xl bg-amber-500/5 text-amber-500`}>
              <span className="material-symbols-outlined text-[24px]">tune</span>
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden hover:shadow-warm hover:border-brand-500/20 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Free Tiers Ratio</p>
              <h3 className="text-3xl font-extrabold text-text-main mt-2">
                {loading ? <span className="animate-pulse">...</span> : stats.freeCount}
              </h3>
              <div className="w-full bg-border-subtle rounded-full h-1.5 mt-3 max-w-[120px]">
                <div
                  className="bg-green-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${stats.total ? (stats.freeCount / stats.total) * 100 : 0}%` }}
                ></div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-green-500/5 text-green-500">
              <span className="material-symbols-outlined text-[24px]">workspace_premium</span>
            </div>
          </div>
        </Card>

        <Card className="relative overflow-hidden hover:shadow-warm hover:border-brand-500/20 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <p className="text-xs font-bold text-text-subtle uppercase tracking-wider">Billing Engine Status</p>
              <h3 className="text-3xl font-extrabold text-green-500 mt-2 flex items-center gap-2">
                Active
              </h3>
              <p className="text-xs text-text-muted mt-2">Cost simulation synchronized</p>
            </div>
            <div className="p-3 rounded-xl bg-blue-500/5 text-blue-500">
              <span className="material-symbols-outlined text-[24px]">check_circle</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Main Content Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left column (2 cols wide): Catalog and Tables */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
            <div className="space-y-4">
              {/* Header inside card */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-subtle pb-4">
                <div>
                  <h2 className="text-xl font-bold text-text-main">Pricing Catalog</h2>
                  <p className="text-xs text-text-muted mt-1">
                    Explore rates per million tokens. Custom rates overrides are highlighted.
                  </p>
                </div>
                {/* Search Bar */}
                <div className="relative max-w-xs w-full">
                  <span className="material-symbols-outlined text-text-subtle absolute left-3 top-2 text-[18px]">search</span>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search model or provider..."
                    className="w-full pl-9 pr-4 py-1.5 bg-bg border border-border-subtle rounded-lg text-sm text-text-main placeholder-text-subtle focus:outline-none focus:border-brand-500 focus:ring-1 focus:ring-brand-500 transition-all"
                  />
                </div>
              </div>

              {/* Provider Filter Tabs */}
              <div className="flex items-center gap-1.5 overflow-x-auto pb-2 scroll-thin-x">
                <button
                  onClick={() => setSelectedProviderTab("all")}
                  className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all ${
                    selectedProviderTab === "all"
                      ? "bg-brand-500 text-white shadow-sm"
                      : "bg-surface-2 text-text-muted hover:text-text-main hover:bg-surface-3"
                  }`}
                >
                  All Providers
                </button>
                {providersList.map(p => (
                  <button
                    key={p}
                    onClick={() => setSelectedProviderTab(p)}
                    className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap ${
                      selectedProviderTab === p
                        ? "bg-brand-500 text-white shadow-sm"
                        : "bg-surface-2 text-text-muted hover:text-text-main hover:bg-surface-3"
                    }`}
                  >
                    {p.toUpperCase()}
                  </button>
                ))}
              </div>

              {/* Type Filter Tabs */}
              <div className="flex items-center gap-2 border-b border-border-subtle pb-3">
                <button
                  onClick={() => setSelectedTypeTab("all")}
                  className={`px-2.5 py-1 text-xs font-bold border-b-2 transition-all ${
                    selectedTypeTab === "all"
                      ? "border-brand-500 text-brand-500"
                      : "border-transparent text-text-muted hover:text-text-main"
                  }`}
                >
                  All Statuses
                </button>
                <button
                  onClick={() => setSelectedTypeTab("free")}
                  className={`px-2.5 py-1 text-xs font-bold border-b-2 transition-all ${
                    selectedTypeTab === "free"
                      ? "border-brand-500 text-brand-500"
                      : "border-transparent text-text-muted hover:text-text-main"
                  }`}
                >
                  Free Models ({stats.freeCount})
                </button>
                <button
                  onClick={() => setSelectedTypeTab("paid")}
                  className={`px-2.5 py-1 text-xs font-bold border-b-2 transition-all ${
                    selectedTypeTab === "paid"
                      ? "border-brand-500 text-brand-500"
                      : "border-transparent text-text-muted hover:text-text-main"
                  }`}
                >
                  Paid Models ({stats.paidCount})
                </button>
                <button
                  onClick={() => setSelectedTypeTab("custom")}
                  className={`px-2.5 py-1 text-xs font-bold border-b-2 transition-all ${
                    selectedTypeTab === "custom"
                      ? "border-brand-500 text-brand-500"
                      : "border-transparent text-text-muted hover:text-text-main"
                  }`}
                >
                  Custom Overrides ({stats.customCount})
                </button>
              </div>

              {/* Loader or Table */}
              {loading ? (
                <div className="space-y-3 py-6">
                  {[1, 2, 3, 4, 5].map(i => (
                    <div key={i} className="flex gap-4 items-center">
                      <div className="h-6 bg-surface-2 animate-pulse rounded w-1/3"></div>
                      <div className="h-6 bg-surface-2 animate-pulse rounded w-1/6"></div>
                      <div className="h-6 bg-surface-2 animate-pulse rounded w-1/6"></div>
                      <div className="h-6 bg-surface-2 animate-pulse rounded w-1/6"></div>
                      <div className="h-6 bg-surface-2 animate-pulse rounded w-1/6"></div>
                    </div>
                  ))}
                </div>
              ) : filteredModels.length > 0 ? (
                <div className="overflow-x-auto max-h-[500px] overflow-y-auto custom-scrollbar border border-border-subtle rounded-xl">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-surface-2 text-text-muted text-xs uppercase sticky top-0 z-10 font-bold border-b border-border-subtle">
                      <tr>
                        <th className="px-4 py-3">Model Catalog</th>
                        <th className="px-4 py-3 text-right">Input Rate ($/1M)</th>
                        <th className="px-4 py-3 text-right">Output Rate ($/1M)</th>
                        <th className="px-4 py-3 text-right">Cached ($/1M)</th>
                        <th className="px-4 py-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border-subtle bg-surface">
                      {filteredModels.map((m) => (
                        <tr key={m.id} className="hover:bg-surface-2/40 transition-colors group">
                          <td className="px-4 py-3.5">
                            <div className="flex flex-col">
                              <span className="font-semibold text-text-main group-hover:text-brand-500 transition-colors">{m.name}</span>
                              <span className="text-[10px] font-mono text-text-subtle uppercase tracking-wider">{m.provider}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-medium text-text-main">
                            ${m.rates.input.toFixed(2)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-medium text-text-main">
                            ${m.rates.output.toFixed(2)}
                          </td>
                          <td className="px-4 py-3.5 text-right font-mono font-medium text-text-muted">
                            ${(m.rates.cached ?? 0).toFixed(2)}
                          </td>
                          <td className="px-4 py-3.5 text-center">
                            {m.isCustomized ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/10 text-amber-600 border border-amber-500/20 shadow-sm animate-pulse-glow">
                                Custom
                              </span>
                            ) : m.isFree ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/10 text-green-600 border border-green-500/20">
                                Free
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-surface-2 text-text-muted border border-border-subtle">
                                Default
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12 text-text-muted flex flex-col items-center justify-center gap-3">
                  <span className="material-symbols-outlined text-[48px] text-text-subtle">filter_alt_off</span>
                  <div>
                    <p className="font-semibold text-text-main">No models found</p>
                    <p className="text-xs text-text-muted mt-1">Try adjusting your filters or search term</p>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>

        {/* Right column: Interactive Calculator Widget and General FAQ */}
        <div className="space-y-6">
          {/* Quick Calculator Panel */}
          <Card className="p-6 relative overflow-hidden bg-surface border border-border-subtle flex flex-col gap-5 dot-grid-bg">
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-brand-500/10 text-brand-600 dark:text-brand-400 text-[10px] font-bold uppercase tracking-wider">
                <span className="material-symbols-outlined text-[12px]">calculate</span>
                Interactive Simulator
              </div>
              <h2 className="text-xl font-bold text-text-main">Cost Calculator</h2>
              <p className="text-xs text-text-muted">
                Simulate prompt costs instantly based on your current custom configurations.
              </p>
            </div>

            <div className="space-y-4 text-sm">
              {/* Select Model */}
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-text-muted">Select Model to Simulate</label>
                <select
                  value={calcModel}
                  onChange={(e) => setCalcModel(e.target.value)}
                  className="w-full px-3 py-2 bg-surface border border-border-subtle rounded-lg text-sm text-text-main focus:outline-none focus:border-brand-500 transition-all"
                >
                  {processedModels.map(m => (
                    <option key={m.id} value={m.id}>
                      [{m.provider.toUpperCase()}] {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Slider for Prompt/Input Tokens */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-text-muted">Input Tokens</span>
                  <span className="font-mono text-brand-500 font-semibold">{calcInputTokens.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="1000"
                  max="1000000"
                  step="5000"
                  value={calcInputTokens}
                  onChange={(e) => setCalcInputTokens(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-brand-500"
                />
              </div>

              {/* Slider for Output/Completion Tokens */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-text-muted">Output Tokens</span>
                  <span className="font-mono text-brand-500 font-semibold">{calcOutputTokens.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="500"
                  max="200000"
                  step="1000"
                  value={calcOutputTokens}
                  onChange={(e) => setCalcOutputTokens(parseInt(e.target.value))}
                  className="w-full h-1.5 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-brand-500"
                />
              </div>

              {/* Slider for Cached Tokens */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-text-muted">Cached Input Tokens</span>
                  <span className="font-mono text-brand-500 font-semibold">{calcCachedTokens.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={calcInputTokens}
                  step="5000"
                  value={calcCachedTokens}
                  onChange={(e) => setCalcCachedTokens(Math.min(calcInputTokens, parseInt(e.target.value)))}
                  className="w-full h-1.5 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-brand-500"
                />
              </div>

              {/* Slider for Reasoning Tokens */}
              <div className="space-y-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-bold text-text-muted">Reasoning Tokens</span>
                  <span className="font-mono text-brand-500 font-semibold">{calcReasoningTokens.toLocaleString()}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={calcOutputTokens}
                  step="500"
                  value={calcReasoningTokens}
                  onChange={(e) => setCalcReasoningTokens(Math.min(calcOutputTokens, parseInt(e.target.value)))}
                  className="w-full h-1.5 bg-border-subtle rounded-lg appearance-none cursor-pointer accent-brand-500"
                />
              </div>
            </div>

            {/* Simulated Output Block */}
            {simulationResults && (
              <div className="bg-surface-2 border border-border-subtle rounded-xl p-4 space-y-3">
                <div className="flex justify-between items-baseline">
                  <span className="text-xs font-semibold text-text-muted">Estimated Cost</span>
                  <span className="text-2xl font-extrabold text-brand-500 font-mono">
                    ${simulationResults.currentCost.toFixed(4)}
                  </span>
                </div>

                {simulationResults.difference !== 0 && (
                  <div className="flex justify-between items-center border-t border-border-subtle pt-2 text-xs">
                    <span className="text-text-muted">Compared to Default</span>
                    <span className={`font-semibold font-mono ${simulationResults.difference > 0 ? "text-green-500" : "text-red-500"}`}>
                      {simulationResults.difference > 0 ? "-" : "+"}
                      ${Math.abs(simulationResults.difference).toFixed(4)} ({Math.abs(simulationResults.percentSaved).toFixed(1)}%)
                    </span>
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Quick FAQ / Info */}
          <Card className="p-6">
            <h3 className="text-lg font-bold text-text-main mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-brand-500 text-[20px]">info</span>
              Cost Engine Guide
            </h3>
            <div className="space-y-4 text-xs text-text-muted leading-relaxed">
              <div>
                <p className="font-bold text-text-main mb-1">Standard Calculation Formula</p>
                <p>
                  Cost = (Input × Rate) + (Output × Rate) + (Cached × Cached Rate) + (Reasoning × Reasoning Rate) + (Cache Creation × Creation Rate)
                </p>
              </div>
              <div>
                <p className="font-bold text-text-main mb-1">Pricing Format</p>
                <p>
                  All rates are specified in **Dollars per Million Tokens** ($/1M). An input rate of $2.50 means exactly $2.50 for every million tokens sent.
                </p>
              </div>
              <div>
                <p className="font-bold text-text-main mb-1">Caching Incentives</p>
                <p>
                  Cached token reads are significantly cheaper (often up to 90% savings over regular inputs). Overwrite cached rates to fine-tune your tracking metrics.
                </p>
              </div>
            </div>
          </Card>
        </div>

      </div>

      {/* Pricing Modal */}
      {showModal && (
        <PricingModal
          isOpen={showModal}
          onClose={() => setShowModal(false)}
          onSave={handlePricingUpdated}
        />
      )}
    </div>
  );
}
