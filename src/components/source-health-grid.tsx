/**
 * SourceHealthGrid Component
 *
 * Per-authority dashboard showing:
 * - Last published snapshot
 * - Row count
 * - Data drift percentage
 * - Next scheduled run
 */

import { Calendar, Database, TrendingUp, Clock, AlertCircle, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface SourceHealth {
  authority: string;
  displayName: string;
  status: "healthy" | "warning" | "error";
  lastSnapshot: Date;
  recordCount: number;
  drift: number; // 0-1, percentage of records changed
  nextRun: Date;
  trend: "stable" | "increasing" | "decreasing";
}

interface SourceHealthGridProps {
  sources: SourceHealth[];
  className?: string;
}

function getDriftColor(drift: number) {
  if (drift < 0.05) return "text-success";
  if (drift < 0.15) return "text-warning";
  return "text-danger";
}

function getStatusIcon(status: string) {
  switch (status) {
    case "healthy":
      return <CheckCircle className="w-5 h-5 text-success" />;
    case "warning":
      return <AlertCircle className="w-5 h-5 text-warning" />;
    case "error":
      return <AlertCircle className="w-5 h-5 text-danger" />;
  }
}

function getTrendIcon(trend: string) {
  if (trend === "stable") {
    return <div className="w-4 h-4 border-b border-text-tertiary" />;
  }
  return (
    <TrendingUp
      className={cn(
        "w-4 h-4",
        trend === "increasing" ? "text-danger -rotate-45" : "text-success rotate-180"
      )}
    />
  );
}

export function SourceHealthGrid({ sources, className }: SourceHealthGridProps) {
  const formatDate = (date: Date) => {
    const days = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    if (days === 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 7) return `${days}d ago`;
    if (days < 30) return `${Math.floor(days / 7)}w ago`;
    return `${Math.floor(days / 30)}m ago`;
  };

  const formatNextRun = (date: Date) => {
    const hours = Math.ceil((date.getTime() - Date.now()) / (1000 * 60 * 60));
    if (hours <= 0) return "Now";
    if (hours === 1) return "In 1h";
    if (hours < 24) return `In ${hours}h`;
    const days = Math.ceil(hours / 24);
    return `In ${days}d`;
  };

  return (
    <div className={cn("grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4", className)}>
      {sources.map((source) => (
        <div
          key={source.authority}
          className={cn(
            "p-4 rounded-lg border transition-colors",
            source.status === "healthy"
              ? "bg-success/5 border-success/20"
              : source.status === "warning"
                ? "bg-warning/5 border-warning/20"
                : "bg-danger/5 border-danger/20"
          )}
        >
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                {getStatusIcon(source.status)}
                <h3 className="font-display font-semibold text-text">{source.displayName}</h3>
              </div>
              <p className="text-xs text-text-secondary font-mono">{source.authority}</p>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="space-y-3">
            {/* Last Snapshot */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-text-secondary">
                <Calendar className="w-4 h-4" />
                <span>Last Snapshot</span>
              </div>
              <span className="font-mono font-medium text-text">{formatDate(source.lastSnapshot)}</span>
            </div>

            {/* Record Count */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-text-secondary">
                <Database className="w-4 h-4" />
                <span>Records</span>
              </div>
              <span className="font-mono font-medium text-text">
                {source.recordCount.toLocaleString()}
              </span>
            </div>

            {/* Drift */}
            <div className="flex items-center justify-between text-sm">
              <div className="flex items-center gap-2 text-text-secondary">
                <TrendingUp className="w-4 h-4" />
                <span>Data Drift</span>
              </div>
              <div className="flex items-center gap-2">
                <span className={cn("font-mono font-medium", getDriftColor(source.drift))}>
                  {(source.drift * 100).toFixed(1)}%
                </span>
                {getTrendIcon(source.trend)}
              </div>
            </div>

            {/* Next Run */}
            <div className="flex items-center justify-between text-sm pt-2 border-t border-border-subtle">
              <div className="flex items-center gap-2 text-text-secondary">
                <Clock className="w-4 h-4" />
                <span>Next Run</span>
              </div>
              <span className="font-mono font-medium text-text">{formatNextRun(source.nextRun)}</span>
            </div>
          </div>

          {/* Status Badge */}
          <div className="mt-4 pt-3 border-t border-border-subtle">
            <span
              className={cn(
                "inline-block px-2 py-1 text-xs font-medium rounded",
                source.status === "healthy"
                  ? "bg-success/20 text-success"
                  : source.status === "warning"
                    ? "bg-warning/20 text-warning"
                    : "bg-danger/20 text-danger"
              )}
            >
              {source.status.charAt(0).toUpperCase() + source.status.slice(1)}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Fixture page for SourceHealthGrid component
 */
export function SourceHealthGridFixture() {
  const sampleSources: SourceHealth[] = [
    {
      authority: "aishe",
      displayName: "AISHE",
      status: "healthy",
      lastSnapshot: new Date(Date.now() - 2 * 60 * 60 * 1000),
      recordCount: 45230,
      drift: 0.02,
      nextRun: new Date(Date.now() + 22 * 60 * 60 * 1000),
      trend: "stable",
    },
    {
      authority: "ugc",
      displayName: "UGC India",
      status: "healthy",
      lastSnapshot: new Date(Date.now() - 6 * 60 * 60 * 1000),
      recordCount: 38000,
      drift: 0.04,
      nextRun: new Date(Date.now() + 18 * 60 * 60 * 1000),
      trend: "stable",
    },
    {
      authority: "nad",
      displayName: "NAD",
      status: "warning",
      lastSnapshot: new Date(Date.now() - 12 * 60 * 60 * 1000),
      recordCount: 22500,
      drift: 0.12,
      nextRun: new Date(Date.now() + 12 * 60 * 60 * 1000),
      trend: "increasing",
    },
    {
      authority: "aicte",
      displayName: "AICTE",
      status: "error",
      lastSnapshot: new Date(Date.now() - 48 * 60 * 60 * 1000),
      recordCount: 15800,
      drift: 0.25,
      nextRun: new Date(Date.now() + 1 * 60 * 60 * 1000),
      trend: "decreasing",
    },
    {
      authority: "nmc",
      displayName: "NMC",
      status: "healthy",
      lastSnapshot: new Date(Date.now() - 3 * 60 * 60 * 1000),
      recordCount: 8900,
      drift: 0.01,
      nextRun: new Date(Date.now() + 21 * 60 * 60 * 1000),
      trend: "stable",
    },
    {
      authority: "dnb",
      displayName: "DNB",
      status: "healthy",
      lastSnapshot: new Date(Date.now() - 4 * 60 * 60 * 1000),
      recordCount: 12340,
      drift: 0.03,
      nextRun: new Date(Date.now() + 20 * 60 * 60 * 1000),
      trend: "stable",
    },
  ];

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-4xl font-bold display mb-8">SourceHealthGrid Component</h1>

      {/* Full Grid */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Registry Health Dashboard</h2>
        <SourceHealthGrid sources={sampleSources} />
      </section>

      {/* Status Variants */}
      <section>
        <h2 className="text-2xl font-bold display mb-4">Status Variants</h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Healthy</h3>
            <SourceHealthGrid
              sources={[
                {
                  authority: "aishe",
                  displayName: "AISHE (Healthy)",
                  status: "healthy",
                  lastSnapshot: new Date(Date.now() - 2 * 60 * 60 * 1000),
                  recordCount: 45230,
                  drift: 0.02,
                  nextRun: new Date(Date.now() + 22 * 60 * 60 * 1000),
                  trend: "stable",
                },
              ]}
            />
          </div>

          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Warning</h3>
            <SourceHealthGrid
              sources={[
                {
                  authority: "nad",
                  displayName: "NAD (Warning)",
                  status: "warning",
                  lastSnapshot: new Date(Date.now() - 12 * 60 * 60 * 1000),
                  recordCount: 22500,
                  drift: 0.12,
                  nextRun: new Date(Date.now() + 12 * 60 * 60 * 1000),
                  trend: "increasing",
                },
              ]}
            />
          </div>

          <div>
            <h3 className="text-sm font-medium text-text-secondary mb-3">Error</h3>
            <SourceHealthGrid
              sources={[
                {
                  authority: "aicte",
                  displayName: "AICTE (Error)",
                  status: "error",
                  lastSnapshot: new Date(Date.now() - 48 * 60 * 60 * 1000),
                  recordCount: 15800,
                  drift: 0.25,
                  nextRun: new Date(Date.now() + 1 * 60 * 60 * 1000),
                  trend: "decreasing",
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
          <p>✓ Semantic icons paired with text labels</p>
          <p>✓ Color-independent status indication (badges, icons, text)</p>
          <p>✓ Monospace numbers for easy scanning</p>
          <p>✓ Responsive grid (1 col mobile, 3 col desktop)</p>
          <p>✓ Clear hierarchy with section dividers</p>
          <p>✓ Human-readable date/time formats</p>
        </div>
      </section>
    </div>
  );
}
