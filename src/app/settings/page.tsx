"use client";

import { useState } from "react";
import { Save, AlertCircle, Check } from "lucide-react";

const featureFlags = [
  {
    key: "USE_BROWSER",
    label: "Browser Rendering",
    description: "Enable Playwright-based DOM inspection for live websites",
    enabled: true,
  },
  {
    key: "USE_LLM_REASONING",
    label: "LLM Reasoning",
    description: "Use AI for multi-hop inference across registry data",
    enabled: true,
  },
  {
    key: "USE_VECTOR_SEARCH",
    label: "Vector Search",
    description: "Enable semantic similarity matching for institution names",
    enabled: true,
  },
  {
    key: "USE_WIKIDATA",
    label: "Wikidata Integration",
    description: "Query Wikidata for historical institution data",
    enabled: true,
  },
  {
    key: "USE_LIVE_AUTHORITIES",
    label: "Live Authority Calls",
    description: "Make real-time requests to authority portals",
    enabled: false,
  },
  {
    key: "STRICT_ROBOTS",
    label: "Strict Robots.txt",
    description: "Enforce robots.txt; fall back to cached data if blocked",
    enabled: true,
  },
];

const scoringPolicies = [
  {
    type: "engineering_college",
    weights: { source: 0.5, derived: 0.3, inferred: 0.2 },
  },
  {
    type: "medical_college",
    weights: { source: 0.6, derived: 0.25, inferred: 0.15 },
  },
  {
    type: "law_college",
    weights: { source: 0.5, derived: 0.3, inferred: 0.2 },
  },
  {
    type: "university",
    weights: { source: 0.5, derived: 0.3, inferred: 0.2 },
  },
];

const embeddingSpaces = [
  {
    model: "e5-small-384",
    dimensions: 384,
    status: "active",
    usage: "Name matching, semantic search",
  },
];

const llmProviders = [
  {
    name: "Gemini API",
    status: "active",
    model: "gemini-pro",
    cost24h: "$2.34",
  },
];

export default function SettingsPage() {
  const [flags, setFlags] = useState(featureFlags);
  const [saved, setSaved] = useState(false);

  const toggleFlag = (key: string) => {
    setFlags(flags.map((f) => (f.key === key ? { ...f, enabled: !f.enabled } : f)));
    setSaved(false);
  };

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-display font-bold">Settings</h1>
        <p className="text-text-secondary mt-2">Configure system behavior and LLM providers</p>
      </div>

      {/* Feature Flags */}
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-6">Feature Flags</h2>
        <div className="space-y-4">
          {flags.map((flag) => (
            <div
              key={flag.key}
              className="flex items-start justify-between p-4 border border-border rounded-lg hover:bg-bg transition-colors"
            >
              <div className="flex-1">
                <div className="font-medium">{flag.label}</div>
                <div className="text-sm text-text-secondary mt-1">{flag.description}</div>
              </div>
              <button
                onClick={() => toggleFlag(flag.key)}
                className={`relative ml-4 w-12 h-7 rounded-full transition-colors ${
                  flag.enabled ? "bg-success" : "bg-neutral-600"
                }`}
              >
                <div
                  className={`absolute top-1 w-5 h-5 bg-white rounded-full transition-transform ${
                    flag.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          ))}
        </div>

        <button
          onClick={handleSave}
          className="mt-6 flex items-center gap-2 px-4 py-2 bg-primary text-white rounded-lg hover:opacity-90 transition-opacity"
        >
          <Save size={16} />
          Save Changes
        </button>

        {saved && (
          <div className="mt-4 flex items-center gap-2 text-success">
            <Check size={16} />
            <span>Settings saved successfully</span>
          </div>
        )}
      </div>

      {/* Scoring Policies */}
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-6">Scoring Policies</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {scoringPolicies.map((policy) => (
            <div key={policy.type} className="border border-border rounded-lg p-4">
              <div className="font-medium mb-4 capitalize">{policy.type.replace("_", " ")}</div>
              <div className="space-y-2 text-sm">
                {Object.entries(policy.weights).map(([key, value]) => (
                  <div key={key} className="flex justify-between">
                    <span className="text-text-secondary capitalize">{key}:</span>
                    <span className="font-mono font-medium">{(value * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Embedding Spaces */}
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-6">Embedding Spaces</h2>
        {embeddingSpaces.map((space) => (
          <div key={space.model} className="border border-border rounded-lg p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="font-medium">{space.model}</div>
                <div className="text-sm text-text-secondary mt-1">{space.dimensions} dimensions</div>
              </div>
              <div className="flex items-center gap-2 text-success">
                <Check size={16} />
                <span className="text-sm font-medium">{space.status}</span>
              </div>
            </div>
            <div className="text-sm text-text-secondary">{space.usage}</div>
          </div>
        ))}
      </div>

      {/* LLM Providers */}
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-6">LLM Provider Status</h2>
        {llmProviders.map((provider) => (
          <div key={provider.name} className="border border-border rounded-lg p-4">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="font-medium">{provider.name}</div>
                <div className="text-sm text-text-secondary mt-1">{provider.model}</div>
              </div>
              <div className="flex items-center gap-2 text-success">
                <Check size={16} />
                <span className="text-sm font-medium capitalize">{provider.status}</span>
              </div>
            </div>
            <div className="flex justify-between pt-4 border-t border-border text-sm">
              <span className="text-text-secondary">24h Cost</span>
              <span className="font-mono font-medium">{provider.cost24h}</span>
            </div>
          </div>
        ))}
      </div>

      {/* System Health */}
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <h2 className="text-xl font-semibold mb-6">System Health</h2>
        <div className="space-y-3">
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <span className="text-sm">Database Connection</span>
            <div className="flex items-center gap-2 text-success">
              <div className="w-2 h-2 bg-success rounded-full"></div>
              <span className="text-xs font-medium">Healthy</span>
            </div>
          </div>
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <span className="text-sm">Redis Cache</span>
            <div className="flex items-center gap-2 text-success">
              <div className="w-2 h-2 bg-success rounded-full"></div>
              <span className="text-xs font-medium">Healthy</span>
            </div>
          </div>
          <div className="flex items-center justify-between pb-3 border-b border-border">
            <span className="text-sm">Inngest Queue</span>
            <div className="flex items-center gap-2 text-success">
              <div className="w-2 h-2 bg-success rounded-full"></div>
              <span className="text-xs font-medium">Healthy</span>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm">Browser Service</span>
            <div className="flex items-center gap-2 text-warning">
              <div className="w-2 h-2 bg-warning rounded-full"></div>
              <span className="text-xs font-medium">Degraded (1/4 workers)</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
