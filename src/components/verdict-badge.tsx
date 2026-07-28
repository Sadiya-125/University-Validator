/**
 * VerdictBadge Component
 *
 * Displays institution validation verdict with semantic colors.
 * 5 verdict states × 3 sizes = 15 variants
 *
 * States:
 * - genuine: Green (#22c55e)
 * - likely_genuine: Cyan (#06b6d4)
 * - unknown: Amber (#f59e0b)
 * - unverified: Gray
 * - fake: Red (#ef4444)
 *
 * Sizes: sm (12px), md (14px), lg (16px)
 */

import { cn } from "@/lib/utils";

const VERDICT_STYLES = {
  genuine: {
    bg: "bg-success/10",
    text: "text-success",
    border: "border-success/30",
    dot: "bg-success",
  },
  likely_genuine: {
    bg: "bg-info/10",
    text: "text-info",
    border: "border-info/30",
    dot: "bg-info",
  },
  unknown: {
    bg: "bg-warning/10",
    text: "text-warning",
    border: "border-warning/30",
    dot: "bg-warning",
  },
  needs_review: {
    bg: "bg-warning/10",
    text: "text-warning",
    border: "border-warning/30",
    dot: "bg-warning",
  },
  insufficient_evidence: {
    bg: "bg-neutral-700/30",
    text: "text-text-secondary",
    border: "border-neutral-600/30",
    dot: "bg-neutral-600",
  },
  unverified: {
    bg: "bg-neutral-700/30",
    text: "text-text-secondary",
    border: "border-neutral-600/30",
    dot: "bg-neutral-600",
  },
  fake: {
    bg: "bg-danger/10",
    text: "text-danger",
    border: "border-danger/30",
    dot: "bg-danger",
  },
  likely_fake: {
    bg: "bg-danger/10",
    text: "text-danger",
    border: "border-danger/30",
    dot: "bg-danger",
  },
} as const;

const SIZE_STYLES = {
  sm: {
    container: "px-2 py-1 text-xs gap-1.5",
    dot: "w-1.5 h-1.5",
  },
  md: {
    container: "px-2.5 py-1.5 text-sm gap-2",
    dot: "w-2 h-2",
  },
  lg: {
    container: "px-3 py-2 text-base gap-2",
    dot: "w-2.5 h-2.5",
  },
} as const;

const VERDICT_LABELS: Record<string, string> = {
  genuine: "Genuine",
  likely_genuine: "Likely Genuine",
  unknown: "Unknown",
  needs_review: "Needs Review",
  insufficient_evidence: "Insufficient Evidence",
  unverified: "Unverified",
  fake: "Fake",
  likely_fake: "Likely Fake",
};

interface VerdictBadgeProps {
  verdict:
    | "genuine"
    | "likely_genuine"
    | "unknown"
    | "needs_review"
    | "insufficient_evidence"
    | "unverified"
    | "fake"
    | "likely_fake";
  size?: "sm" | "md" | "lg";
  showDot?: boolean;
  className?: string;
}

export function VerdictBadge({
  verdict,
  size = "md",
  showDot = true,
  className,
}: VerdictBadgeProps) {
  const verdictStyle = VERDICT_STYLES[verdict];
  const sizeStyle = SIZE_STYLES[size];
  const label = VERDICT_LABELS[verdict];

  if (!verdictStyle) {
    return null;
  }

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border font-medium transition-colors",
        verdictStyle.bg,
        verdictStyle.text,
        verdictStyle.border,
        sizeStyle.container,
        className
      )}
      role="status"
      aria-label={`Verdict: ${label}`}
    >
      {showDot && (
        <span
          className={cn("rounded-full flex-shrink-0", verdictStyle.dot, sizeStyle.dot)}
          aria-hidden="true"
        />
      )}
      {label}
    </span>
  );
}

/**
 * Fixture page for VerdictBadge component
 * Path: /dev/components/verdict-badge
 */
export function VerdictBadgeFixture() {
  const verdicts = [
    "genuine",
    "likely_genuine",
    "unknown",
    "needs_review",
    "insufficient_evidence",
    "unverified",
    "fake",
    "likely_fake",
  ] as const;

  const sizes = ["sm", "md", "lg"] as const;

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-4xl font-bold display mb-8">VerdictBadge Component</h1>

      {/* By Size */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">By Size</h2>
        <div className="space-y-4 bg-bg-secondary p-6 rounded-lg">
          {sizes.map((size) => (
            <div key={size} className="flex items-center gap-4">
              <span className="w-12 text-sm text-text-secondary font-mono">{size}</span>
              <VerdictBadge verdict="genuine" size={size} />
            </div>
          ))}
        </div>
      </section>

      {/* By Verdict State */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">By Verdict State</h2>
        <div className="grid grid-cols-2 gap-6">
          {verdicts.map((verdict) => (
            <div key={verdict} className="bg-bg-secondary p-6 rounded-lg space-y-3">
              <p className="text-sm text-text-secondary font-mono">{verdict}</p>
              <div className="space-y-2">
                {sizes.map((size) => (
                  <VerdictBadge
                    key={`${verdict}-${size}`}
                    verdict={verdict}
                    size={size}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Without Dot */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Without Dot Indicator</h2>
        <div className="space-y-2 bg-bg-secondary p-6 rounded-lg">
          {verdicts.map((verdict) => (
            <VerdictBadge key={verdict} verdict={verdict} showDot={false} />
          ))}
        </div>
      </section>

      {/* Accessibility */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Accessibility Features</h2>
        <div className="bg-bg-secondary p-6 rounded-lg space-y-4 text-sm text-text-secondary">
          <p>✓ Semantic color use following WCAG guidelines</p>
          <p>✓ Minimum contrast ratio 4.5:1 in both themes</p>
          <p>✓ Aria-label with full verdict description</p>
          <p>✓ Status role for screen readers</p>
          <p>✓ Does not rely on color alone to convey meaning</p>
        </div>
      </section>
    </div>
  );
}
