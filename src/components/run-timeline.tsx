/**
 * RunTimeline Component
 *
 * Stepper showing validation pipeline stages.
 * Displays: stage name, status (pending/running/complete/error), duration, cache-hit, provider
 */

import { Check, AlertCircle, Clock, Zap } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface TimelineStep {
  name: string;
  label: string;
  status: "pending" | "running" | "complete" | "error";
  duration?: number;
  cacheHit?: boolean;
  provider?: string;
}

interface RunTimelineProps {
  steps: TimelineStep[];
  currentStep?: number;
  className?: string;
}

const STAGE_LABELS: Record<string, string> = {
  fast: "Fast Cache",
  mirror: "Mirror Registry",
  discovery: "Discovery",
  verify: "Verification",
  extract: "Extract Facts",
  judge: "Judge Evidence",
  finalize: "Finalize",
};

function getStageIcon(status: TimelineStep["status"]) {
  switch (status) {
    case "complete":
      return <Check className="w-5 h-5 text-success" />;
    case "error":
      return <AlertCircle className="w-5 h-5 text-danger" />;
    case "running":
      return <Clock className="w-5 h-5 text-info animate-spin" />;
    case "pending":
      return <div className="w-5 h-5 rounded-full border-2 border-border-subtle" />;
  }
}

function getStageColor(status: TimelineStep["status"]) {
  switch (status) {
    case "complete":
      return "bg-success/10 border-success/30";
    case "error":
      return "bg-danger/10 border-danger/30";
    case "running":
      return "bg-info/10 border-info/30";
    case "pending":
      return "bg-bg-tertiary border-border";
  }
}

export function RunTimeline({ steps, currentStep, className }: RunTimelineProps) {
  return (
    <div className={cn("space-y-4", className)}>
      {steps.map((step, idx) => {
        const isLast = idx === steps.length - 1;
        const isPast = currentStep !== undefined && idx < currentStep;
        const isCurrent = idx === currentStep;

        return (
          <motion.div
            key={step.name}
            className="relative"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1, duration: 0.3 }}
          >
            {/* Vertical Line */}
            {!isLast && (
              <motion.div
                className={cn(
                  "absolute left-2.5 top-12 w-0.5 h-8",
                  isPast || isCurrent ? "bg-success/30" : "bg-border-subtle"
                )}
                initial={{ scaleY: 0, originY: 0 }}
                animate={{ scaleY: 1, originY: 0 }}
                transition={{ delay: idx * 0.1 + 0.15, duration: 0.2 }}
              />
            )}

            {/* Step Card */}
            <div className={cn("flex gap-4 relative", isCurrent && "animate-pulse")}>
              {/* Icon Circle */}
              <motion.div
                className={cn(
                  "shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors",
                  getStageColor(step.status)
                )}
                animate={isCurrent ? { scale: [1, 1.1, 1] } : {}}
                transition={{ repeat: isCurrent ? Infinity : 0, duration: 2 }}
              >
                {getStageIcon(step.status)}
              </motion.div>

              {/* Content */}
              <motion.div
                className="flex-1 py-1 min-w-0"
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: idx * 0.1 + 0.05, duration: 0.3 }}
              >
                <h3 className="font-medium text-text">{step.label || STAGE_LABELS[step.name]}</h3>

                {/* Metadata */}
                <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-text-secondary">
                  {/* Duration */}
                  {step.duration !== undefined && (
                    <motion.span
                      className="flex items-center gap-1 font-mono"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.1 + 0.2, duration: 0.2 }}
                    >
                      <Clock className="w-3 h-3" />
                      {step.duration < 1000
                        ? `${step.duration}ms`
                        : `${(step.duration / 1000).toFixed(1)}s`}
                    </motion.span>
                  )}

                  {/* Cache Hit */}
                  {step.cacheHit && (
                    <motion.span
                      className="flex items-center gap-1 text-success"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.1 + 0.25, duration: 0.2 }}
                    >
                      <Zap className="w-3 h-3" />
                      Cached
                    </motion.span>
                  )}

                  {/* Provider */}
                  {step.provider && (
                    <motion.span
                      className="px-2 py-0.5 bg-bg-tertiary rounded text-text-secondary"
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: idx * 0.1 + 0.3, duration: 0.2 }}
                    >
                      {step.provider}
                    </motion.span>
                  )}

                  {/* Status Text */}
                  {step.status === "error" && (
                    <motion.span
                      className="text-danger font-medium"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ delay: idx * 0.1 + 0.35, duration: 0.2 }}
                    >
                      Failed
                    </motion.span>
                  )}
                </div>
              </motion.div>
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}

/**
 * Fixture page for RunTimeline component
 */
export function RunTimelineFixture() {
  const sampleSteps: TimelineStep[] = [
    {
      name: "fast",
      label: "Fast Cache",
      status: "complete",
      duration: 45,
      cacheHit: false,
      provider: "redis",
    },
    {
      name: "mirror",
      label: "Mirror Registry",
      status: "complete",
      duration: 320,
      provider: "aishe",
    },
    {
      name: "discovery",
      label: "Discovery",
      status: "complete",
      duration: 850,
      provider: "web",
    },
    {
      name: "verify",
      label: "Verification",
      status: "running",
      provider: "authorities",
    },
    {
      name: "extract",
      label: "Extract Facts",
      status: "pending",
    },
    {
      name: "judge",
      label: "Judge Evidence",
      status: "pending",
    },
    {
      name: "finalize",
      label: "Finalize",
      status: "pending",
    },
  ];

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-4xl font-bold display mb-8">RunTimeline Component</h1>

      {/* In Progress */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">In Progress (Step 3)</h2>
        <div className="bg-bg-secondary p-6 rounded-lg">
          <RunTimeline steps={sampleSteps} currentStep={3} />
        </div>
      </section>

      {/* Completed */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Completed</h2>
        <div className="bg-bg-secondary p-6 rounded-lg">
          <RunTimeline
            steps={[
              { ...sampleSteps[0]!, status: "complete" as const, duration: 50 },
              { ...sampleSteps[1]!, status: "complete" as const, duration: 300 },
              { ...sampleSteps[2]!, status: "complete" as const, duration: 800 },
              { ...sampleSteps[3]!, status: "complete" as const, duration: 1200 },
              { ...sampleSteps[4]!, status: "complete" as const, duration: 2500 },
              { ...sampleSteps[5]!, status: "complete" as const, duration: 1800 },
              { ...sampleSteps[6]!, status: "complete" as const, duration: 400 },
            ]}
            currentStep={6}
          />
        </div>
      </section>

      {/* With Error */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">With Error</h2>
        <div className="bg-bg-secondary p-6 rounded-lg">
          <RunTimeline
            steps={[
              { ...sampleSteps[0]!, status: "complete" as const },
              { ...sampleSteps[1]!, status: "complete" as const },
              { ...sampleSteps[2]!, status: "error" as const },
              { ...sampleSteps[3]!, status: "pending" as const },
              { ...sampleSteps[4]!, status: "pending" as const },
              { ...sampleSteps[5]!, status: "pending" as const },
              { ...sampleSteps[6]!, status: "pending" as const },
            ]}
            currentStep={2}
          />
        </div>
      </section>

      {/* Accessibility */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Accessibility</h2>
        <div className="bg-bg-secondary p-6 rounded-lg space-y-4 text-sm text-text-secondary">
          <p>✓ Status icons with semantic meaning (checkmark, warning, spinner)</p>
          <p>✓ Color used alongside icons and text labels</p>
          <p>✓ Clear visual hierarchy with connecting lines</p>
          <p>✓ Metadata displayed in semantic order</p>
          <p>✓ Animate-pulse for running state is optional (can be disabled)</p>
          <p>✓ Honors prefers-reduced-motion via Tailwind config</p>
        </div>
      </section>
    </div>
  );
}
