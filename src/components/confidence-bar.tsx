/**
 * ConfidenceBar Component
 *
 * Stacked contribution bar showing confidence breakdown.
 * Displays visual representation of how different factors contribute to overall confidence.
 */

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface Contribution {
  label: string;
  value: number;
  color: "success" | "info" | "warning" | "danger";
}

interface ConfidenceBarProps {
  confidence: number;
  contributions?: Contribution[];
  showLabel?: boolean;
  showPercent?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const COLOR_MAP = {
  success: "bg-success",
  info: "bg-info",
  warning: "bg-warning",
  danger: "bg-danger",
};

const SIZE_MAP = {
  sm: { bar: "h-2", text: "text-xs" },
  md: { bar: "h-3", text: "text-sm" },
  lg: { bar: "h-4", text: "text-base" },
};

export function ConfidenceBar({
  confidence,
  contributions = [],
  showLabel = true,
  showPercent = true,
  size = "md",
  className,
}: ConfidenceBarProps) {
  const sizeStyle = SIZE_MAP[size];
  const percentage = confidence * 100;

  // Normalize contributions to sum to confidence
  const totalContribution = contributions.reduce((sum, c) => sum + c.value, 0);
  const normalizedContributions = totalContribution > 0
    ? contributions.map(c => ({
        ...c,
        percentage: (c.value / totalContribution) * confidence,
      }))
    : [];

  return (
    <div className={cn("space-y-2", className)}>
      {/* Label */}
      {showLabel && (
        <motion.div
          className="flex items-center justify-between"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          <span className={cn("font-medium text-text", sizeStyle.text)}>Confidence</span>
          {showPercent && (
            <motion.span
              className={cn("font-mono text-text-secondary", sizeStyle.text)}
              initial={{ opacity: 0, x: 10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              {percentage.toFixed(0)}%
            </motion.span>
          )}
        </motion.div>
      )}

      {/* Stacked Bar */}
      <motion.div
        className={cn(
          "w-full bg-bg rounded-md overflow-hidden border border-border-subtle",
          sizeStyle.bar
        )}
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{ opacity: 1, scaleX: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        style={{ originX: 0 }}
      >
        <div className="flex h-full">
          {normalizedContributions.length > 0 ? (
            <>
              {normalizedContributions.map((contrib, idx) => (
                <motion.div
                  key={idx}
                  className={cn(COLOR_MAP[contrib.color])}
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(contrib.percentage / confidence) * 100}%`,
                  }}
                  transition={{
                    duration: 0.6,
                    delay: 0.2 + idx * 0.1,
                    ease: "easeOut",
                  }}
                  title={`${contrib.label}: ${(contrib.percentage * 100).toFixed(1)}%`}
                />
              ))}
              {/* Remaining (unfilled) */}
              {confidence < 1 && (
                <motion.div
                  className="bg-bg-tertiary"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(1 - confidence) * 100}%`,
                  }}
                  transition={{
                    duration: 0.6,
                    delay: 0.2 + normalizedContributions.length * 0.1,
                    ease: "easeOut",
                  }}
                />
              )}
            </>
          ) : (
            <>
              {/* Default filled portion when no contributions provided */}
              <motion.div
                className="bg-success"
                initial={{ width: 0 }}
                animate={{
                  width: `${percentage}%`,
                }}
                transition={{
                  duration: 0.6,
                  delay: 0.2,
                  ease: "easeOut",
                }}
              />
              {/* Unfilled portion */}
              {confidence < 1 && (
                <motion.div
                  className="bg-bg-tertiary"
                  initial={{ width: 0 }}
                  animate={{
                    width: `${(1 - confidence) * 100}%`,
                  }}
                  transition={{
                    duration: 0.6,
                    delay: 0.3,
                    ease: "easeOut",
                  }}
                />
              )}
            </>
          )}
        </div>
      </motion.div>

      {/* Legend */}
      {contributions.length > 0 && (
        <motion.div
          className="grid grid-cols-2 gap-2 mt-3"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          {contributions.map((contrib, idx) => (
            <motion.div
              key={idx}
              className="flex items-center gap-2 text-xs text-text-secondary"
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: 0.4 + idx * 0.05 }}
            >
              <div className={cn("w-2 h-2 rounded-sm", COLOR_MAP[contrib.color])} />
              <span>{contrib.label}</span>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}

/**
 * Fixture page for ConfidenceBar component
 */
export function ConfidenceBarFixture() {
  const sampleContributions: Contribution[] = [
    { label: "Mirror Evidence", value: 0.35, color: "success" },
    { label: "Live Verification", value: 0.28, color: "info" },
    { label: "Web Evidence", value: 0.22, color: "warning" },
    { label: "Conflicts", value: -0.10, color: "danger" },
  ];

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-4xl font-bold display mb-8">ConfidenceBar Component</h1>

      {/* By Size */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">By Size</h2>
        <div className="space-y-6 bg-bg-secondary p-6 rounded-lg">
          <ConfidenceBar confidence={0.85} size="sm" contributions={sampleContributions} />
          <ConfidenceBar confidence={0.85} size="md" contributions={sampleContributions} />
          <ConfidenceBar confidence={0.85} size="lg" contributions={sampleContributions} />
        </div>
      </section>

      {/* Confidence Levels */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Confidence Levels</h2>
        <div className="space-y-4 bg-bg-secondary p-6 rounded-lg">
          <ConfidenceBar confidence={0.95} size="md" contributions={sampleContributions} />
          <ConfidenceBar confidence={0.75} size="md" contributions={sampleContributions} />
          <ConfidenceBar confidence={0.50} size="md" contributions={sampleContributions} />
          <ConfidenceBar confidence={0.25} size="md" contributions={sampleContributions} />
        </div>
      </section>

      {/* Without Legend */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Variants</h2>
        <div className="space-y-4 bg-bg-secondary p-6 rounded-lg">
          <div>
            <p className="text-sm text-text-secondary mb-2">With all options</p>
            <ConfidenceBar confidence={0.82} showLabel showPercent contributions={sampleContributions} />
          </div>
          <div>
            <p className="text-sm text-text-secondary mb-2">Label only</p>
            <ConfidenceBar confidence={0.82} showLabel showPercent={false} />
          </div>
          <div>
            <p className="text-sm text-text-secondary mb-2">Minimal</p>
            <ConfidenceBar confidence={0.82} showLabel={false} showPercent={false} />
          </div>
        </div>
      </section>

      {/* Accessibility */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Accessibility</h2>
        <div className="bg-bg-secondary p-6 rounded-lg space-y-4 text-sm text-text-secondary">
          <p>✓ Color-independent confidence visualization (uses bar width)</p>
          <p>✓ Title attributes on bar segments for hover details</p>
          <p>✓ Legend provides context for color meaning</p>
          <p>✓ Semantic font sizing with clear hierarchy</p>
          <p>✓ Percentage display prevents reliance on color alone</p>
        </div>
      </section>
    </div>
  );
}
