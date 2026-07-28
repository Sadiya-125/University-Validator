/**
 * Component Tests
 *
 * Tests for design system and domain components
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { VerdictBadge } from "./verdict-badge";
import { ConfidenceBar } from "./confidence-bar";
import { RunTimeline } from "./run-timeline";
import { EmptyState, ErrorState, LoadingSkeleton } from "./states";
import { EvidenceTable } from "./evidence-table";
import { SourceHealthGrid } from "./source-health-grid";
import { IdentityGraph } from "./identity-graph";
import { ExplanationChain } from "./explanation-chain";

describe("VerdictBadge Component", () => {
  it("renders verdict with correct color for genuine", () => {
    render(<VerdictBadge verdict="genuine" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveClass("bg-success/10");
    expect(badge).toHaveTextContent("Genuine");
  });

  it("renders verdict with correct color for fake", () => {
    render(<VerdictBadge verdict="fake" />);
    const badge = screen.getByRole("status");
    expect(badge).toHaveClass("bg-danger/10");
    expect(badge).toHaveTextContent("Fake");
  });

  it("renders with dot indicator when specified", () => {
    const { container } = render(
      <VerdictBadge verdict="genuine" showDot={true} />
    );
    const dot = container.querySelector(".w-2.h-2.rounded-full");
    expect(dot).toBeInTheDocument();
  });

  it("renders with large size variant", () => {
    const { container } = render(
      <VerdictBadge verdict="genuine" size="lg" />
    );
    expect(container.firstChild).toHaveClass("px-4 py-2");
  });

  it("renders all verdict types", () => {
    const verdicts = [
      "genuine",
      "likely_genuine",
      "unknown",
      "fake",
    ] as const;

    verdicts.forEach((verdict) => {
      const { unmount } = render(<VerdictBadge verdict={verdict} />);
      expect(screen.getByRole("status")).toBeInTheDocument();
      unmount();
    });
  });
});

describe("ConfidenceBar Component", () => {
  it("renders confidence percentage", () => {
    render(<ConfidenceBar confidence={0.75} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("displays label when showLabel is true", () => {
    render(<ConfidenceBar confidence={0.75} showLabel={true} />);
    expect(screen.getByText("Confidence")).toBeInTheDocument();
  });

  it("hides label when showLabel is false", () => {
    render(<ConfidenceBar confidence={0.75} showLabel={false} />);
    expect(screen.queryByText("Confidence")).not.toBeInTheDocument();
  });

  it("hides percentage when showPercent is false", () => {
    render(<ConfidenceBar confidence={0.75} showPercent={false} />);
    expect(screen.queryByText("75%")).not.toBeInTheDocument();
  });

  it("renders contribution legend", () => {
    const contributions = [
      { label: "Evidence 1", value: 0.5, color: "success" as const },
      { label: "Evidence 2", value: 0.25, color: "info" as const },
    ];
    render(
      <ConfidenceBar
        confidence={0.75}
        contributions={contributions}
      />
    );
    expect(screen.getByText("Evidence 1")).toBeInTheDocument();
    expect(screen.getByText("Evidence 2")).toBeInTheDocument();
  });

  it("renders different sizes", () => {
    const sizes = ["sm", "md", "lg"] as const;
    sizes.forEach((size) => {
      const { unmount } = render(
        <ConfidenceBar confidence={0.75} size={size} />
      );
      expect(screen.getByText("75%")).toBeInTheDocument();
      unmount();
    });
  });
});

describe("RunTimeline Component", () => {
  const sampleSteps = [
    {
      name: "stage1",
      label: "Stage 1",
      status: "complete" as const,
      duration: 100,
    },
    {
      name: "stage2",
      label: "Stage 2",
      status: "running" as const,
      provider: "test-provider",
    },
    {
      name: "stage3",
      label: "Stage 3",
      status: "pending" as const,
    },
  ];

  it("renders all timeline steps", () => {
    render(<RunTimeline steps={sampleSteps} />);
    expect(screen.getByText("Stage 1")).toBeInTheDocument();
    expect(screen.getByText("Stage 2")).toBeInTheDocument();
    expect(screen.getByText("Stage 3")).toBeInTheDocument();
  });

  it("displays duration for steps with duration", () => {
    render(<RunTimeline steps={sampleSteps} />);
    expect(screen.getByText("100ms")).toBeInTheDocument();
  });

  it("displays provider badge when available", () => {
    render(<RunTimeline steps={sampleSteps} />);
    expect(screen.getByText("test-provider")).toBeInTheDocument();
  });

  it("marks current step with pulse animation", () => {
    const { container } = render(
      <RunTimeline steps={sampleSteps} currentStep={1} />
    );
    const stepCards = container.querySelectorAll(".animate-pulse");
    expect(stepCards.length).toBeGreaterThan(0);
  });

  it("displays error status for failed steps", () => {
    const errorSteps = [
      {
        name: "failed",
        label: "Failed Stage",
        status: "error" as const,
      },
    ];
    render(<RunTimeline steps={errorSteps} />);
    expect(screen.getByText("Failed")).toBeInTheDocument();
  });
});

describe("EmptyState Component", () => {
  it("renders title", () => {
    render(
      <EmptyState
        title="No data"
        description="Try again"
      />
    );
    expect(screen.getByText("No data")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(
      <EmptyState
        title="No data"
        description="Try again"
      />
    );
    expect(screen.getByText("Try again")).toBeInTheDocument();
  });

  it("renders action button when provided", () => {
    const mockAction = vi.fn();
    render(
      <EmptyState
        title="No data"
        action={{ label: "Retry", onClick: mockAction }}
      />
    );
    const button = screen.getByRole("button", { name: "Retry" });
    expect(button).toBeInTheDocument();
  });

  it("calls action onClick when button is clicked", async () => {
    const user = userEvent.setup();
    const mockAction = vi.fn();
    render(
      <EmptyState
        title="No data"
        action={{ label: "Retry", onClick: mockAction }}
      />
    );
    const button = screen.getByRole("button", { name: "Retry" });
    await user.click(button);
    expect(mockAction).toHaveBeenCalled();
  });
});

describe("ErrorState Component", () => {
  it("renders default title", () => {
    render(<ErrorState />);
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
  });

  it("renders custom title", () => {
    render(<ErrorState title="Custom Error" />);
    expect(screen.getByText("Custom Error")).toBeInTheDocument();
  });

  it("renders description when provided", () => {
    render(<ErrorState description="This is an error description" />);
    expect(screen.getByText("This is an error description")).toBeInTheDocument();
  });

  it("displays error message in code block", () => {
    render(<ErrorState error="Database connection timeout" />);
    expect(screen.getByText("Database connection timeout")).toBeInTheDocument();
  });

  it("renders action button", async () => {
    const user = userEvent.setup();
    const mockAction = vi.fn();
    render(
      <ErrorState
        action={{ label: "Retry", onClick: mockAction }}
      />
    );
    const button = screen.getByRole("button", { name: "Retry" });
    await user.click(button);
    expect(mockAction).toHaveBeenCalled();
  });
});

describe("LoadingSkeleton Component", () => {
  it("renders multiple skeleton rows", () => {
    const { container } = render(<LoadingSkeleton count={3} />);
    const skeletons = container.querySelectorAll(".animate-pulse");
    expect(skeletons.length).toBeGreaterThan(0);
  });

  it("renders correct number of skeleton rows", () => {
    const { container } = render(<LoadingSkeleton count={5} />);
    const rows = container.querySelectorAll(".space-y-3");
    expect(rows).toHaveLength(5);
  });
});

describe("EvidenceTable Component", () => {
  const sampleEvidence = [
    {
      id: "ev-1",
      kind: "verified_source",
      tier: "mirror" as const,
      category: "ugc",
      status: "confirmed" as const,
      quality: 0.95,
      collectedAt: new Date(),
    },
    {
      id: "ev-2",
      kind: "web_evidence",
      tier: "api" as const,
      category: "website",
      status: "verified" as const,
      quality: 0.85,
      collectedAt: new Date(),
    },
  ];

  it("renders evidence table with evidence items", () => {
    render(<EvidenceTable evidence={sampleEvidence} />);
    expect(screen.getByText("verified_source")).toBeInTheDocument();
    expect(screen.getByText("web_evidence")).toBeInTheDocument();
  });

  it("displays tier badges", () => {
    render(<EvidenceTable evidence={sampleEvidence} />);
    expect(screen.getByText("MIRROR")).toBeInTheDocument();
    expect(screen.getByText("API")).toBeInTheDocument();
  });

  it("displays quality percentages", () => {
    render(<EvidenceTable evidence={sampleEvidence} />);
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("85%")).toBeInTheDocument();
  });

  it("renders empty state when no evidence", () => {
    render(<EvidenceTable evidence={[]} />);
    expect(screen.getByText("No evidence collected yet")).toBeInTheDocument();
  });

  it("groups evidence by kind", () => {
    render(<EvidenceTable evidence={sampleEvidence} />);
    expect(screen.getByText("2 matches")).toBeInTheDocument();
    expect(screen.getByText("1 match")).toBeInTheDocument();
  });

  it("expands payload drawer on button click", async () => {
    const user = userEvent.setup();
    const evidenceWithPayload = [
      {
        ...sampleEvidence[0],
        payload: { test: "value" },
      },
    ];
    render(<EvidenceTable evidence={evidenceWithPayload} />);
    const expandButton = screen.getByLabelText("Expand payload");
    await user.click(expandButton);
    expect(screen.getByText(/test/)).toBeInTheDocument();
  });
});

describe("SourceHealthGrid Component", () => {
  const sampleSources = [
    {
      name: "AISHE",
      status: "healthy" as const,
      lastSnapshot: new Date(Date.now() - 2 * 60 * 60 * 1000),
      recordCount: 25000,
      dataDrift: "stable" as const,
      nextRun: new Date(Date.now() + 22 * 60 * 60 * 1000),
    },
    {
      name: "UGC",
      status: "warning" as const,
      lastSnapshot: new Date(Date.now() - 12 * 60 * 60 * 1000),
      recordCount: 15000,
      dataDrift: "increasing" as const,
      nextRun: new Date(Date.now() + 12 * 60 * 60 * 1000),
    },
  ];

  it("renders source cards for each authority", () => {
    render(<SourceHealthGrid sources={sampleSources} />);
    expect(screen.getByText("AISHE")).toBeInTheDocument();
    expect(screen.getByText("UGC")).toBeInTheDocument();
  });

  it("displays status badges", () => {
    render(<SourceHealthGrid sources={sampleSources} />);
    expect(screen.getByText("Healthy")).toBeInTheDocument();
    expect(screen.getByText("Warning")).toBeInTheDocument();
  });

  it("displays record counts", () => {
    render(<SourceHealthGrid sources={sampleSources} />);
    expect(screen.getByText("25,000")).toBeInTheDocument();
    expect(screen.getByText("15,000")).toBeInTheDocument();
  });

  it("displays data drift indicators", () => {
    render(<SourceHealthGrid sources={sampleSources} />);
    expect(screen.getByText("Stable")).toBeInTheDocument();
    expect(screen.getByText("Increasing")).toBeInTheDocument();
  });
});

describe("IdentityGraph Component", () => {
  const sampleIdentities = [
    {
      id: "id-1",
      source: "AISHE",
      name: "Test University",
      confidence: 0.95,
    },
    {
      id: "id-2",
      source: "UGC",
      name: "Test University",
      confidence: 0.92,
    },
  ];

  it("renders institution name", () => {
    render(
      <IdentityGraph
        institution="Test University"
        identities={sampleIdentities}
      />
    );
    expect(screen.getByText("Test University")).toBeInTheDocument();
  });

  it("groups identities by source", () => {
    render(
      <IdentityGraph
        institution="Test University"
        identities={sampleIdentities}
      />
    );
    expect(screen.getByText("AISHE")).toBeInTheDocument();
    expect(screen.getByText("UGC")).toBeInTheDocument();
  });

  it("displays confidence percentages", () => {
    render(
      <IdentityGraph
        institution="Test University"
        identities={sampleIdentities}
      />
    );
    expect(screen.getByText("95%")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
  });

  it("renders empty state when no identities", () => {
    render(
      <IdentityGraph
        institution="Test University"
        identities={[]}
      />
    );
    expect(screen.getByText("No identity matches found")).toBeInTheDocument();
  });

  it("displays match counts per source", () => {
    const identities = [
      { id: "id-1", source: "AISHE", name: "Uni 1", confidence: 0.9 },
      { id: "id-2", source: "AISHE", name: "Uni 2", confidence: 0.8 },
      { id: "id-3", source: "UGC", name: "Uni 3", confidence: 0.85 },
    ];
    render(
      <IdentityGraph
        institution="Test University"
        identities={identities}
      />
    );
    expect(screen.getByText("2 matches")).toBeInTheDocument();
    expect(screen.getByText("1 match")).toBeInTheDocument();
  });

  it("highlights conflicting identities", () => {
    const identities = [
      {
        id: "id-1",
        source: "AISHE",
        name: "Test University",
        confidence: 0.95,
        conflicting: false,
      },
      {
        id: "id-2",
        source: "Web",
        name: "Different University",
        confidence: 0.4,
        conflicting: true,
      },
    ];
    const { container } = render(
      <IdentityGraph
        institution="Test University"
        identities={identities}
      />
    );
    const conflictingCard = container.querySelector(".bg-danger\\/5");
    expect(conflictingCard).toBeInTheDocument();
  });
});

describe("ExplanationChain Component", () => {
  const sampleChain = [
    {
      type: "evidence" as const,
      label: "AISHE Listed",
      impact: "positive" as const,
      value: "0.35",
    },
    {
      type: "rule" as const,
      label: "Authority Weighting",
      value: "2.0x",
    },
    {
      type: "weight" as const,
      label: "Quality Score",
      impact: "positive" as const,
      value: "0.95",
    },
  ];

  it("renders chain links", () => {
    render(<ExplanationChain chain={sampleChain} />);
    expect(screen.getByText("AISHE Listed")).toBeInTheDocument();
    expect(screen.getByText("Authority Weighting")).toBeInTheDocument();
    expect(screen.getByText("Quality Score")).toBeInTheDocument();
  });

  it("displays values when provided", () => {
    render(<ExplanationChain chain={sampleChain} />);
    expect(screen.getByText("0.35")).toBeInTheDocument();
    expect(screen.getByText("2.0x")).toBeInTheDocument();
    expect(screen.getByText("0.95")).toBeInTheDocument();
  });

  it("shows impact indicators for positive impacts", () => {
    const { container } = render(<ExplanationChain chain={sampleChain} />);
    const positiveImpacts = container.querySelectorAll(".text-success");
    expect(positiveImpacts.length).toBeGreaterThan(0);
  });

  it("renders empty state with no chain", () => {
    render(<ExplanationChain chain={[]} />);
    expect(screen.getByText("No scoring explanation available")).toBeInTheDocument();
  });
});
