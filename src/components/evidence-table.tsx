/**
 * EvidenceTable Component
 *
 * Displays collected evidence grouped by kind.
 * Features: tier badge, quality meter, collapsible payload drawer.
 */

"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface Evidence {
  id: string;
  kind: string;
  tier: "mirror" | "live" | "api";
  category: string;
  status: "confirmed" | "verified" | "pending" | "failed";
  quality: number;
  collectedAt: Date;
  payload?: Record<string, unknown>;
}

interface EvidenceTableProps {
  evidence: Evidence[];
  className?: string;
}

const TIER_STYLES = {
  mirror: "bg-success/10 text-success border-success/20",
  live: "bg-info/10 text-info border-info/20",
  api: "bg-warning/10 text-warning border-warning/20",
};

const STATUS_ICONS = {
  confirmed: "✓",
  verified: "✓",
  pending: "◌",
  failed: "✕",
};

function getQualityColor(quality: number) {
  if (quality >= 0.8) return "bg-success";
  if (quality >= 0.6) return "bg-info";
  if (quality >= 0.4) return "bg-warning";
  return "bg-danger";
}

/**
 * Evidence row with collapsible payload drawer
 */
function EvidenceRow({ evidence }: { evidence: Evidence }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <motion.tr
        className="border-b border-border hover:bg-bg-tertiary transition-colors"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.2 }}
      >
        <td className="px-4 py-3 text-sm font-medium text-text">{evidence.kind}</td>
        <td className="px-4 py-3 text-sm text-text-secondary">{evidence.category}</td>
        <td className="px-4 py-3">
          <motion.span
            className={cn(
              "inline-block px-2 py-1 text-xs font-medium rounded border",
              TIER_STYLES[evidence.tier]
            )}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.2, delay: 0.05 }}
          >
            {evidence.tier.toUpperCase()}
          </motion.span>
        </td>
        <td className="px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="w-12 h-2 bg-bg rounded overflow-hidden">
              <motion.div
                className={cn("h-full transition-all", getQualityColor(evidence.quality))}
                initial={{ width: 0 }}
                animate={{ width: `${evidence.quality * 100}%` }}
                transition={{ duration: 0.5, ease: "easeOut", delay: 0.1 }}
              />
            </div>
            <span className="text-xs font-mono text-text-secondary">{(evidence.quality * 100).toFixed(0)}%</span>
          </div>
        </td>
        <td className="px-4 py-3 text-sm text-text-secondary">
          {evidence.collectedAt.toLocaleDateString()}
        </td>
        <td className="px-4 py-3 text-right">
          {evidence.payload && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 hover:bg-bg-tertiary rounded transition-colors"
              aria-label={expanded ? "Collapse payload" : "Expand payload"}
            >
              <motion.div
                animate={{ rotate: expanded ? 180 : 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChevronDown size={18} />
              </motion.div>
            </button>
          )}
        </td>
      </motion.tr>

      {/* Payload Drawer */}
      <AnimatePresence>
        {expanded && evidence.payload && (
          <motion.tr
            className="bg-bg-tertiary"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            <td colSpan={6} className="px-4 py-4">
              <motion.div
                className="bg-bg p-4 rounded border border-border-subtle"
                initial={{ y: -10 }}
                animate={{ y: 0 }}
                transition={{ duration: 0.2, delay: 0.05 }}
              >
                <pre className="text-xs font-mono text-text-secondary overflow-auto max-h-48">
                  {JSON.stringify(evidence.payload, null, 2)}
                </pre>
              </motion.div>
            </td>
          </motion.tr>
        )}
      </AnimatePresence>
    </>
  );
}

/**
 * Evidence group by kind
 */
function EvidenceGroup({ kind, items }: { kind: string; items: Evidence[] }) {
  return (
    <>
      <motion.tr
        className="bg-bg-secondary sticky top-0 border-b-2 border-border"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        <td colSpan={6} className="px-4 py-3">
          <motion.h3
            className="font-display font-semibold text-text flex items-center gap-2"
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <motion.span
              className="text-primary"
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              transition={{ duration: 0.2, delay: 0.1 }}
            >
              {items.length}
            </motion.span>
            {kind}
          </motion.h3>
        </td>
      </motion.tr>
      {items.map((item, idx) => (
        <motion.div
          key={item.id}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.05 + idx * 0.02 }}
        >
          <EvidenceRow evidence={item} />
        </motion.div>
      ))}
    </>
  );
}

export function EvidenceTable({ evidence, className }: EvidenceTableProps) {
  // Group by kind
  const grouped = evidence.reduce(
    (acc, item) => {
      if (!acc[item.kind]) acc[item.kind] = [];
      acc[item.kind]!.push(item);
      return acc;
    },
    {} as Record<string, Evidence[]>
  );

  if (evidence.length === 0) {
    return (
      <motion.div
        className="text-center py-8 text-text-secondary"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.3 }}
      >
        No evidence collected yet
      </motion.div>
    );
  }

  return (
    <motion.div
      className={cn("overflow-x-auto", className)}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
    >
      <table className="w-full text-sm">
        <thead className="bg-bg-secondary border-b border-border">
          <motion.tr
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.05 }}
          >
            <th className="px-4 py-3 text-left font-semibold text-text-secondary">Kind</th>
            <th className="px-4 py-3 text-left font-semibold text-text-secondary">Category</th>
            <th className="px-4 py-3 text-left font-semibold text-text-secondary">Tier</th>
            <th className="px-4 py-3 text-left font-semibold text-text-secondary">Quality</th>
            <th className="px-4 py-3 text-left font-semibold text-text-secondary">Collected</th>
            <th className="px-4 py-3 text-right font-semibold text-text-secondary">Details</th>
          </motion.tr>
        </thead>
        <tbody>
          {Object.entries(grouped).map(([kind, items], idx) => (
            <motion.div
              key={kind}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 + idx * 0.05 }}
            >
              <EvidenceGroup kind={kind} items={items} />
            </motion.div>
          ))}
        </tbody>
      </table>
    </motion.div>
  );
}

/**
 * Fixture page for EvidenceTable component
 */
export function EvidenceTableFixture() {
  const sampleEvidence: Evidence[] = [
    {
      id: "ev-1",
      kind: "verified_source",
      tier: "mirror",
      category: "ugc_listed",
      status: "confirmed",
      quality: 0.95,
      collectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      payload: {
        source: "UGC India",
        affiliationType: "Permanent",
        dateVerified: "2026-07-21",
      },
    },
    {
      id: "ev-2",
      kind: "verified_source",
      tier: "mirror",
      category: "aishe_listed",
      status: "confirmed",
      quality: 0.94,
      collectedAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
    },
    {
      id: "ev-3",
      kind: "verified_source",
      tier: "live",
      category: "nad_listed",
      status: "verified",
      quality: 0.92,
      collectedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
    },
    {
      id: "ev-4",
      kind: "web_evidence",
      tier: "api",
      category: "official_website",
      status: "verified",
      quality: 0.85,
      collectedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      payload: {
        url: "https://example-university.edu",
        statusCode: 200,
        title: "Example University",
      },
    },
    {
      id: "ev-5",
      kind: "web_evidence",
      tier: "api",
      category: "contact_info",
      status: "verified",
      quality: 0.78,
      collectedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
    },
    {
      id: "ev-6",
      kind: "identity_match",
      tier: "api",
      category: "name_variant",
      status: "pending",
      quality: 0.65,
      collectedAt: new Date(),
    },
  ];

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-4xl font-bold display mb-8">EvidenceTable Component</h1>

      {/* Full Table */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Evidence Collection</h2>
        <div className="bg-bg-secondary rounded-lg overflow-hidden">
          <EvidenceTable evidence={sampleEvidence} />
        </div>
      </section>

      {/* Empty State */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Empty State</h2>
        <div className="bg-bg-secondary rounded-lg">
          <EvidenceTable evidence={[]} />
        </div>
      </section>

      {/* Features Explained */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-bg-secondary p-6 rounded-lg space-y-3">
            <h3 className="font-display font-bold">Grouping</h3>
            <p className="text-sm text-text-secondary">Evidence automatically grouped by kind with item counts</p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg space-y-3">
            <h3 className="font-display font-bold">Tier Badges</h3>
            <p className="text-sm text-text-secondary">Semantic color coding: Mirror (green), Live (cyan), API (amber)</p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg space-y-3">
            <h3 className="font-display font-bold">Quality Meter</h3>
            <p className="text-sm text-text-secondary">Visual bar + percentage showing evidence confidence</p>
          </div>
          <div className="bg-bg-secondary p-6 rounded-lg space-y-3">
            <h3 className="font-display font-bold">Payload Drawer</h3>
            <p className="text-sm text-text-secondary">Collapsible details with raw JSON payload display</p>
          </div>
        </div>
      </section>

      {/* Accessibility */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Accessibility</h2>
        <div className="bg-bg-secondary p-6 rounded-lg space-y-4 text-sm text-text-secondary">
          <p>✓ Semantic table markup with proper thead/tbody</p>
          <p>✓ Aria-labels on expansion buttons</p>
          <p>✓ Sticky group headers for context</p>
          <p>✓ Quality meter with percentage fallback text</p>
          <p>✓ Hover states for better discoverability</p>
          <p>✓ Proper contrast ratios throughout</p>
        </div>
      </section>
    </div>
  );
}
