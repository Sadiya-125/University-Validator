"use client";

import { useState } from "react";
import { ValidateForm } from "./components/validate-form";
import { ValidateResult } from "./components/validate-result";
import { RunTimeline } from "@/components/run-timeline";
import { ErrorState, EmptyState } from "@/components/states";

export interface ValidationResult {
  id: string;
  institutionName: string;
  status: "pending" | "completed" | "error";
  confidence: number;
  verdict: "genuine" | "likely_genuine" | "unknown" | "unverified" | "fake";
  responseTime: number;
  source: string;
  evidence: Array<{
    type: string;
    title: string;
    source: string;
    quality: "high" | "medium" | "low";
  }>;
  runs: Array<{
    id: string;
    name: string;
    status: "pending" | "running" | "completed" | "error";
    duration: number;
    cacheHit: boolean;
    provider: string;
  }>;
  authorities?: Array<{
    name: string;
    code?: string;
    found: boolean;
    snapshotDate: string;
    rowCount: number;
  }>;
  // Institution profile attributes
  profile?: {
    officialName?: string;
    affiliatedUniversity?: string;
    type?: string;
    state?: string;
    city?: string;
    district?: string;
    address?: string;
    website?: string;
    email?: string;
    phone?: string;
    primaryMobileNumber?: string;
    secondaryMobileNumber?: string;
    attributes?: Record<string, any>; // Raw attributes from registry_entries
  };
  // Verification details
  summary?: string;
  redFlags?: string[];
  recommendations?: string[];
  // Statutory body information
  discoveredStatutoryBodies?: Array<{
    name: string;
    contactDetails?: string;
    website?: string;
    email?: string;
    address?: string;
    affiliatedUniversity?: string;
  }>;
  isDuplicate?: boolean;
  duplicateMatchInfo?: Record<string, any>;
  verificationSource?: Record<string, any>;
  // Registry attributes from multiple authorities
  registryAttributes?: Array<{
    authority: string;
    attributes?: Record<string, any>;
    externalId?: string;
  }>;
}

export default function ValidatePage() {
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleValidate = async (institutionName: string) => {
    setIsLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ normalizedName: institutionName }),
      });

      if (response.status === 200) {
        // Cached/synchronous response
        const data = await response.json();
        setResult({
          ...data,
          status: "completed",
          responseTime: data.responseTime || 50,
          source: data.source || "cache",
        });
      } else if (response.status === 202) {
        // Async response with streaming
        const data = await response.json();
        setResult({
          ...data,
          status: "pending",
          runs: [],
        });

        // Subscribe to updates via SSE or polling
        const eventSource = new EventSource(
          `/api/validate/${data.id}/stream`
        );

        eventSource.addEventListener("update", (event) => {
          const update = JSON.parse(event.data);
          setResult((prev) => (prev ? { ...prev, ...update } : null));
        });

        eventSource.addEventListener("complete", (event) => {
          const final = JSON.parse(event.data);
          setResult((prev) => (prev ? { ...prev, ...final, status: "completed" } : null));
          eventSource.close();
        });

        eventSource.addEventListener("error", () => {
          setError("Validation failed. Please try again.");
          eventSource.close();
        });
      } else {
        throw new Error("Unexpected response status");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred"
      );
      setResult(null);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <div>
        <h1 className="text-4xl font-display font-bold mb-2">Validate Institution</h1>
        <p className="text-text-secondary">
          Enter an institution name to verify its authenticity and recognition
          status across Indian registries.
        </p>
      </div>

      {/* Validation Form */}
      <ValidateForm onSubmit={handleValidate} isLoading={isLoading} />

      {/* Results Section */}
      {error && (
        <ErrorState
          title="Validation Error"
          error={error}
          action={{ label: "Retry", onClick: () => setError(null) }}
        />
      )}

      {isLoading && result?.status === "pending" && (
        <div className="space-y-6">
          <h2 className="text-2xl font-display font-bold">Running validation...</h2>
          <p className="text-text-secondary text-sm">
            Validation in progress. This may take a few moments...
          </p>
        </div>
      )}

      {result && result.status === "completed" && (
        <ValidateResult result={result} />
      )}

      {!result && !isLoading && !error && (
        <EmptyState
          title="No validation yet"
          description="Enter an institution name above to get started."
        />
      )}
    </div>
  );
}
