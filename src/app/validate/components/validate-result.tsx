"use client";

import { useState } from "react";
import { VerdictBadge } from "@/components/verdict-badge";
import { ConfidenceBar } from "@/components/confidence-bar";
import { EvidenceTable } from "@/components/evidence-table";
import { SourceHealthGrid } from "@/components/source-health-grid";
import { Copy, Download, RotateCcw, Loader2 } from "lucide-react";
import type { ValidationResult } from "../page";

interface ValidateResultProps {
  result: ValidationResult;
  onRevalidate?: (institutionName: string) => void;
  isRevalidating?: boolean;
  onEnrichComplete?: () => void;
}

export function ValidateResult({
  result,
  onRevalidate,
  isRevalidating = false,
  onEnrichComplete,
}: ValidateResultProps) {
  const [activeTab, setActiveTab] = useState<
    "overview" | "contact" | "evidence" | "authorities" | "registry" | "runs"
  >("overview");
  const [copied, setCopied] = useState(false);

  const handleRevalidate = () => {
    if (onRevalidate) {
      onRevalidate(result.institutionName);
    }
  };

  const handleCopyJSON = () => {
    navigator.clipboard.writeText(JSON.stringify(result, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExport = () => {
    const csv = convertToCSV(result);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `validation-${result.id}.csv`;
    a.click();
  };

  return (
    <div className="space-y-8">
      {/* Header with Verdict */}
      <div className="bg-bg-secondary border border-border rounded-lg p-6">
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="text-3xl font-display font-bold mb-2">{result.institutionName}</h2>
            <p className="text-text-secondary text-sm">
              Validated in {result.responseTime}ms · Source: {result.source}
            </p>
          </div>
          <VerdictBadge verdict={result.verdict} size="lg" />
        </div>

        {/* Confidence Bar */}
        <div className="mb-6">
          <ConfidenceBar confidence={result.confidence} />
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2 mt-6 pt-6 border-t border-border">
          <button
            onClick={handleCopyJSON}
            className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-white hover:opacity-90 transition-opacity text-sm font-medium"
          >
            <Copy size={16} />
            {copied ? "Copied!" : "Copy JSON"}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-2 rounded-md border border-border text-text-secondary hover:text-text transition-colors text-sm font-medium"
          >
            <Download size={16} />
            Export
          </button>
          <button
            onClick={handleRevalidate}
            disabled={isRevalidating}
            className={`flex items-center gap-2 px-4 py-2 rounded-md border border-border text-sm font-medium ml-auto transition-colors ${
              isRevalidating
                ? "bg-primary/10 text-text-secondary cursor-not-allowed opacity-60"
                : "text-text-secondary hover:text-text"
            }`}
          >
            <RotateCcw size={16} className={isRevalidating ? "animate-spin" : ""} />
            {isRevalidating ? "Revalidating..." : "Revalidate"}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-border overflow-x-auto">
        <div className="flex gap-4 -mb-px whitespace-nowrap">
          {(["overview", "contact", "authorities", "registry", "evidence", "runs"] as const).map(
            (tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`
                  px-4 py-3 border-b-2 transition-colors capitalize
                  ${
                    activeTab === tab
                      ? "border-primary text-primary font-medium"
                      : "border-transparent text-text-secondary hover:text-text"
                  }
                `}
              >
                {tab.replace(/([A-Z])/g, " $1").trim()}
              </button>
            )
          )}
        </div>
      </div>

      {/* Tab Content */}
      <div>
        {activeTab === "overview" && <OverviewTab result={result} />}
        {activeTab === "contact" && (
          <ContactTab result={result} onEnrichComplete={onEnrichComplete} />
        )}
        {activeTab === "authorities" && <AuthoritiesTab result={result} />}
        {activeTab === "registry" && <RegistryTab result={result} />}
        {activeTab === "evidence" && <EvidenceTable evidence={[]} />}
        {activeTab === "runs" && (
          <div className="text-text-secondary text-sm">
            <p>Run history coming soon...</p>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Overview Tab
 * Shows identity information with source tracking on hover
 */
function OverviewTab({ result }: { result: ValidationResult }) {
  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-6 space-y-6">
      <div>
        <h3 className="text-lg font-display font-bold mb-4">Identity</h3>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-text-secondary mb-1">Official Name</p>
            <p className="font-mono text-text">{result.institutionName}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary mb-1">Confidence</p>
            <p className="font-mono text-text">{Math.round(result.confidence * 100)}%</p>
          </div>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-display font-bold mb-4">Verdict Breakdown</h3>
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-text-secondary">Status</span>
            <VerdictBadge verdict={result.verdict} size="sm" />
          </div>
          <div className="flex justify-between items-center">
            <span className="text-text-secondary">Response Time</span>
            <span className="font-mono text-text">{result.responseTime}ms</span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-text-secondary">Source</span>
            <span className="font-mono text-text">{result.source}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Authorities Tab
 * Shows which registries were queried and their results
 */
function AuthoritiesTab({ result }: { result: ValidationResult }) {
  const authorities = result.authorities || [];

  if (!authorities || authorities.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border rounded-lg p-6 text-center">
        <p className="text-text-secondary">No authority data available for this validation</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-bg">
          <tr>
            <th className="text-left px-6 py-3 font-medium text-text-secondary">Authority</th>
            <th className="text-left px-6 py-3 font-medium text-text-secondary">Status</th>
            <th className="text-left px-6 py-3 font-medium text-text-secondary">Last Updated</th>
            <th className="text-left px-6 py-3 font-medium text-text-secondary">Rows</th>
          </tr>
        </thead>
        <tbody>
          {authorities.map((auth, idx) => (
            <tr key={idx} className="border-b border-border hover:bg-bg-tertiary transition-colors">
              <td className="px-6 py-3 text-text">
                <span className="font-medium">{auth.name}</span>
                {auth.code && <div className="text-xs text-text-secondary">{auth.code}</div>}
              </td>
              <td className="px-6 py-3">
                {auth.found ? (
                  <span className="inline-flex items-center gap-1 text-success font-medium">
                    ✓ Found
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-text-secondary font-medium">
                    ✗ Not found
                  </span>
                )}
              </td>
              <td className="px-6 py-3 font-mono text-text-secondary text-xs">
                {auth.snapshotDate}
              </td>
              <td className="px-6 py-3 font-mono text-text-secondary">
                {auth.rowCount.toLocaleString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Contact Tab
 * Shows contact information and location details with enrich capability
 */
function ContactTab({
  result,
  onEnrichComplete,
}: {
  result: ValidationResult;
  onEnrichComplete?: () => void;
}) {
  const profile = result.profile;
  const [enriching, setEnriching] = useState(false);

  if (!profile) {
    return (
      <div className="bg-bg-secondary border border-border rounded-lg p-6 text-center">
        <p className="text-text-secondary">No contact information available</p>
      </div>
    );
  }

  const contactFields = [
    { label: "Website", value: profile.website },
    { label: "Email", value: profile.email },
    { label: "Phone", value: profile.phone },
    { label: "Primary Mobile", value: profile.primaryMobileNumber },
    { label: "Secondary Mobile", value: profile.secondaryMobileNumber },
    { label: "Address", value: profile.address },
  ];

  const locationFields = [
    { label: "State", value: profile.state },
    { label: "City", value: profile.city },
    { label: "District", value: profile.district },
  ];

  const handleEnrich = async () => {
    if (!profile.website) {
      return;
    }

    setEnriching(true);

    try {
      const response = await fetch("/api/institutions/enrich", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "enrich_by_name",
          institutionName: result.institutionName,
        }),
      });

      if (response.ok) {
        // Trigger parent to refresh validation result
        if (onEnrichComplete) {
          onEnrichComplete();
        }
      }
    } catch (error) {
      console.error("Enrichment error:", error);
    } finally {
      setEnriching(false);
    }
  };

  return (
    <div className="bg-bg-secondary border border-border rounded-lg p-6 space-y-8">
      {/* Enrich Button */}
      <div className="flex items-center justify-between bg-bg-secondary border border-border rounded-lg p-4">
        <div>
          <p className="text-sm font-medium text-text">Extract contact details from website</p>
          <p className="text-xs text-text-secondary mt-1">
            Fetch and extract additional contact info from the institution's website
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleEnrich}
            disabled={enriching || !profile.website}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              enriching || !profile.website
                ? "bg-primary/30 text-text-secondary cursor-not-allowed opacity-60"
                : "bg-primary text-white hover:opacity-90 active:opacity-75"
            }`}
          >
            {enriching ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Enriching...
              </>
            ) : (
              "Enrich"
            )}
          </button>
        </div>
      </div>

      <div>
        <h3 className="text-lg font-display font-bold mb-4">Contact Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {contactFields.map(({ label, value }) => (
            <div key={label}>
              <p className="text-sm text-text-secondary mb-1">{label}</p>
              <p className="font-mono text-text">
                {value || <span className="text-text-tertiary italic">Not available</span>}
              </p>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-lg font-display font-bold mb-4">Location</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {locationFields.map(({ label, value }) => (
            <div key={label}>
              <p className="text-sm text-text-secondary mb-1">{label}</p>
              <p className="font-mono text-text">
                {value || <span className="text-text-tertiary italic">Not available</span>}
              </p>
            </div>
          ))}
        </div>
      </div>

      {profile.affiliatedUniversity && (
        <div>
          <p className="text-sm text-text-secondary mb-1">Affiliated University</p>
          <p className="font-mono text-text">{profile.affiliatedUniversity}</p>
        </div>
      )}
    </div>
  );
}

/**
 * Registry Tab
 * Shows raw attributes from multiple authorities
 */
function RegistryTab({ result }: { result: ValidationResult }) {
  const registryAttributes = result.registryAttributes || [];

  if (registryAttributes.length === 0) {
    return (
      <div className="bg-bg-secondary border border-border rounded-lg p-6 text-center">
        <p className="text-text-secondary">No registry attributes available</p>
      </div>
    );
  }

  return (
    <div className="bg-bg-secondary border border-border rounded-lg space-y-6">
      {registryAttributes.map((reg, idx) => (
        <div key={idx} className="border-b border-border last:border-b-0 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-lg">{reg.authority}</h3>
            {reg.externalId && (
              <code className="text-xs bg-bg px-2 py-1 rounded text-text-secondary">
                {reg.externalId}
              </code>
            )}
          </div>

          {reg.attributes && Object.keys(reg.attributes).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(reg.attributes).map(([key, value]) => (
                <div key={key} className="flex justify-between text-sm">
                  <span className="text-text-secondary font-medium capitalize">
                    {key.replace(/_/g, " ")}:
                  </span>
                  <span className="text-text font-mono text-right">
                    {typeof value === "object" ? JSON.stringify(value) : String(value || "—")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-text-secondary text-sm italic">No attributes available</p>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Convert result to CSV format
 */
function convertToCSV(result: ValidationResult): string {
  const rows = [
    ["Field", "Value"],
    ["Institution Name", result.institutionName],
    ["Verdict", result.verdict],
    ["Confidence", (result.confidence * 100).toFixed(2) + "%"],
    ["Response Time", result.responseTime + "ms"],
    ["Source", result.source],
    ["ID", result.id],
  ];

  return rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");
}
