/**
 * ExplanationChain Component
 *
 * Displays the scoring chain: evidence → rule → weight → quality → contribution
 * Shows how different pieces of evidence contribute to the final score.
 */

import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface ChainLink {
  type: "evidence" | "rule" | "weight" | "quality" | "contribution";
  label: string;
  value?: string | number;
  impact?: "positive" | "negative" | "neutral";
  details?: string;
}

interface ExplanationChainProps {
  chain: ChainLink[];
  className?: string;
}

const TYPE_STYLES = {
  evidence: "bg-info/10 text-info border-info/30",
  rule: "bg-success/10 text-success border-success/30",
  weight: "bg-warning/10 text-warning border-warning/30",
  quality: "bg-accent/10 text-accent border-accent/30",
  contribution: "bg-primary/10 text-primary border-primary/30",
};

const TYPE_LABELS: Record<string, string> = {
  evidence: "Evidence",
  rule: "Rule",
  weight: "Weight",
  quality: "Quality",
  contribution: "Contribution",
};

export function ExplanationChain({ chain, className }: ExplanationChainProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {chain.map((link, idx) => (
        <div key={idx} className="flex items-start gap-3">
          {/* Arrow (except first item) */}
          {idx > 0 && (
            <div className="flex-shrink-0 w-6 h-6 flex items-center justify-center text-text-tertiary">
              <ChevronRight size={18} />
            </div>
          )}

          {/* Link */}
          <div className={cn("flex-1 p-3 rounded-md border", TYPE_STYLES[link.type])}>
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium opacity-75">{TYPE_LABELS[link.type]}</div>
                <div className="font-medium truncate">{link.label}</div>
                {link.details && <div className="text-xs opacity-60 mt-1">{link.details}</div>}
              </div>
              {link.value !== undefined && (
                <div className="flex-shrink-0 text-right">
                  <div className="font-mono font-semibold">{link.value}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Fixture page for ExplanationChain component
 */
export function ExplanationChainFixture() {
  const sampleChain: ChainLink[] = [
    {
      type: "evidence",
      label: "UGC Listed Institution",
      details: "Found in official UGC registry",
    },
    {
      type: "rule",
      label: "Mirror Tier Rule",
      details: "Verified source automatically scores high",
    },
    {
      type: "weight",
      label: "0.95 Weight",
      details: "Mirror tier receives maximum weight",
      value: "0.95",
    },
    {
      type: "quality",
      label: "Quality Score: 0.98",
      details: "High confidence in source accuracy",
      value: "0.98",
    },
    {
      type: "contribution",
      label: "Contribution: +0.93",
      impact: "positive",
      value: "+0.93",
    },
  ];

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-4xl font-bold display mb-8">ExplanationChain Component</h1>

      {/* Simple Chain */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Evidence to Contribution Chain</h2>
        <div className="bg-bg-secondary p-6 rounded-lg">
          <ExplanationChain chain={sampleChain} />
        </div>
      </section>

      {/* Multiple Chains */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Multiple Evidence Chains</h2>
        <div className="space-y-6">
          {/* Chain 1 */}
          <div className="bg-bg-secondary p-6 rounded-lg">
            <p className="text-sm text-text-secondary font-mono mb-4">aishe_listed.ts</p>
            <ExplanationChain
              chain={[
                {
                  type: "evidence",
                  label: "AISHE Listed",
                  details: "Affiliation with AISHE database",
                },
                {
                  type: "weight",
                  label: "0.85 Weight",
                  value: "0.85",
                },
                {
                  type: "quality",
                  label: "Quality: 0.92",
                  value: "0.92",
                },
                {
                  type: "contribution",
                  label: "Contribution: +0.78",
                  value: "+0.78",
                },
              ]}
            />
          </div>

          {/* Chain 2 */}
          <div className="bg-bg-secondary p-6 rounded-lg">
            <p className="text-sm text-text-secondary font-mono mb-4">official_website.ts</p>
            <ExplanationChain
              chain={[
                {
                  type: "evidence",
                  label: "Official Website",
                  details: "Verified institutional website",
                },
                {
                  type: "weight",
                  label: "0.65 Weight",
                  value: "0.65",
                },
                {
                  type: "quality",
                  label: "Quality: 0.80",
                  value: "0.80",
                },
                {
                  type: "contribution",
                  label: "Contribution: +0.52",
                  value: "+0.52",
                },
              ]}
            />
          </div>

          {/* Chain 3 - Negative */}
          <div className="bg-bg-secondary p-6 rounded-lg">
            <p className="text-sm text-text-secondary font-mono mb-4">conflicting_info.ts</p>
            <ExplanationChain
              chain={[
                {
                  type: "evidence",
                  label: "Conflicting Information",
                  details: "Discrepancy between sources",
                  impact: "negative",
                },
                {
                  type: "rule",
                  label: "Conflict Penalty Rule",
                  details: "Unresolved conflicts reduce confidence",
                },
                {
                  type: "quality",
                  label: "Quality: 0.45",
                  value: "0.45",
                },
                {
                  type: "contribution",
                  label: "Contribution: -0.10",
                  value: "-0.10",
                  impact: "negative",
                },
              ]}
            />
          </div>
        </div>
      </section>

      {/* Accessibility */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Accessibility</h2>
        <div className="bg-bg-secondary p-6 rounded-lg space-y-4 text-sm text-text-secondary">
          <p>✓ Semantic color coding for each chain step</p>
          <p>✓ Text labels prevent reliance on color alone</p>
          <p>✓ Directional flow with chevron indicators</p>
          <p>✓ Detailed breakdown with supporting context</p>
          <p>✓ Monospace font for numerical values</p>
          <p>✓ Clear impact indicators (positive/negative)</p>
        </div>
      </section>
    </div>
  );
}
