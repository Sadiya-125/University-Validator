"use client";

/**
 * Design System Component Fixtures
 *
 * Showcases all domain components with their variants and states.
 * Access at /dev/components
 */

import Link from "next/link";
import { VerdictBadgeFixture } from "@/components/verdict-badge";
import { ConfidenceBarFixture } from "@/components/confidence-bar";
import { RunTimelineFixture } from "@/components/run-timeline";
import { StatesFixture } from "@/components/states";
import { ExplanationChainFixture } from "@/components/explanation-chain";
import { EvidenceTableFixture } from "@/components/evidence-table";
import { SourceHealthGridFixture } from "@/components/source-health-grid";
import { IdentityGraphFixture } from "@/components/identity-graph";

export default function ComponentsPage() {
  const components = [
    { id: "verdict-badge", name: "VerdictBadge", description: "Verdict status with semantic colors" },
    { id: "confidence-bar", name: "ConfidenceBar", description: "Stacked confidence visualization" },
    { id: "run-timeline", name: "RunTimeline", description: "Validation stage stepper" },
    { id: "states", name: "States", description: "Empty, error, and loading states" },
    { id: "explanation-chain", name: "ExplanationChain", description: "Evidence scoring contribution chain" },
    { id: "evidence-table", name: "EvidenceTable", description: "Grouped evidence display with details" },
    { id: "source-health-grid", name: "SourceHealthGrid", description: "Per-authority health metrics" },
    { id: "identity-graph", name: "IdentityGraph", description: "Institution identity mapping" },
  ];

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="sticky top-0 bg-bg-secondary border-b border-border px-8 py-6 z-sticky">
        <div className="max-w-6xl mx-auto">
          <h1 className="text-4xl font-display font-bold mb-2">Design System</h1>
          <p className="text-text-secondary">Component fixtures and documentation</p>
        </div>
      </header>

      {/* Navigation */}
      <nav className="bg-bg-secondary border-b border-border px-8 py-4 sticky top-16">
        <div className="max-w-6xl mx-auto flex flex-wrap gap-4">
          {components.map((comp) => (
            <Link
              key={comp.id}
              href={`#${comp.id}`}
              className="px-4 py-2 rounded-md bg-bg hover:bg-bg-tertiary text-sm font-medium transition-colors"
            >
              {comp.name}
            </Link>
          ))}
        </div>
      </nav>

      {/* Main Content */}
      <main className="py-8">
        <div className="max-w-6xl mx-auto">
          {/* Component Grid */}
          <section className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
            {components.map((comp) => (
              <Link
                key={comp.id}
                href={`#${comp.id}`}
                className="bg-bg-secondary rounded-lg p-6 border border-border hover:border-primary transition-colors cursor-pointer"
              >
                <h2 className="text-2xl font-display font-bold text-primary mb-2">{comp.name}</h2>
                <p className="text-text-secondary">{comp.description}</p>
              </Link>
            ))}
          </section>

          {/* Component Details */}
          <section id="verdict-badge" className="scroll-mt-32 mb-16">
            <VerdictBadgeFixture />
          </section>

          <section id="confidence-bar" className="scroll-mt-32 mb-16">
            <ConfidenceBarFixture />
          </section>

          <section id="run-timeline" className="scroll-mt-32 mb-16">
            <RunTimelineFixture />
          </section>

          <section id="states" className="scroll-mt-32 mb-16">
            <StatesFixture />
          </section>

          <section id="explanation-chain" className="scroll-mt-32 mb-16">
            <ExplanationChainFixture />
          </section>

          <section id="evidence-table" className="scroll-mt-32 mb-16">
            <EvidenceTableFixture />
          </section>

          <section id="source-health-grid" className="scroll-mt-32 mb-16">
            <SourceHealthGridFixture />
          </section>

          <section id="identity-graph" className="scroll-mt-32 mb-16">
            <IdentityGraphFixture />
          </section>

          {/* Design Principles */}
          <section className="mt-16 bg-bg-secondary p-8 rounded-lg border border-border">
            <h2 className="text-3xl font-display font-bold mb-6">Design Principles</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div>
                <h3 className="text-lg font-display font-bold mb-2">Semantic Color Usage</h3>
                <ul className="space-y-2 text-sm text-text-secondary">
                  <li>✓ Green (#22c55e) — Genuine verdict</li>
                  <li>✓ Cyan (#06b6d4) — Likely Genuine verdict</li>
                  <li>✓ Amber (#f59e0b) — Unknown/borderline</li>
                  <li>✓ Red (#ef4444) — Fake verdict</li>
                  <li>✓ Blue (#2563eb) — Interactive controls only</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-display font-bold mb-2">Typography</h3>
                <ul className="space-y-2 text-sm text-text-secondary">
                  <li>✓ Bricolage Grotesque — Headlines & numerals</li>
                  <li>✓ System/Inter — Body text & tables</li>
                  <li>✓ JetBrains Mono — IDs, hashes, timestamps</li>
                  <li>✓ 4px spacing grid throughout</li>
                  <li>✓ Border radii: 4–6px</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-display font-bold mb-2">Motion & Animation</h3>
                <ul className="space-y-2 text-sm text-text-secondary">
                  <li>✓ Restrained Framer Motion usage</li>
                  <li>✓ Timeline step transitions only</li>
                  <li>✓ Progress bar animations</li>
                  <li>✓ Loading state pulse (optional)</li>
                  <li>✓ Respects prefers-reduced-motion</li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-display font-bold mb-2">Accessibility</h3>
                <ul className="space-y-2 text-sm text-text-secondary">
                  <li>✓ WCAG AAA contrast (≥4.5:1)</li>
                  <li>✓ Keyboard navigation throughout</li>
                  <li>✓ Focus ring indicators</li>
                  <li>✓ Semantic HTML & ARIA labels</li>
                  <li>✓ Color-independent meaning</li>
                </ul>
              </div>
            </div>
          </section>

          {/* Getting Started */}
          <section className="mt-8 bg-info/10 p-8 rounded-lg border border-info/30">
            <h2 className="text-2xl font-display font-bold mb-4 text-info">Getting Started</h2>
            <div className="space-y-4 text-sm">
              <p className="text-text-secondary">
                All components are designed to be prop-driven and static (no data fetching).
              </p>
              <p className="text-text-secondary font-mono">
                Import from <code className="bg-bg px-2 py-1 rounded">@/components/component-name</code>
              </p>
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
