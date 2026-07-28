/**
 * Evidence store tests
 *
 * Tests:
 * - Dedup by hash
 * - Blob offload threshold
 * - toLLMPayload contains no HTML and respects cap
 * - Quality calculations
 * - Collector functionality
 */

import { describe, it, expect } from "vitest";
import type { EvidenceItem } from "../verification/types";
import { recordEvidence, InMemoryEvidenceStore } from "./store";
import { toLLMPayload, validatePayload, getPayloadStats } from "./project";
import { createCollector } from "./collector";
import { calculateQuality, calculateQualityWithConfidence } from "./quality";

describe("Evidence Store", () => {
  const createEvidence = (overrides?: Partial<EvidenceItem>): EvidenceItem => ({
    source: "UGC" as any,
    tier: "mirror",
    timestamp: Date.now(),
    category: "legitimacy",
    quality_score: 0.9,
    ...overrides,
  });

  describe("Deduplication", () => {
    it("should dedup by (kind, url, hash)", async () => {
      const evidence = [
        createEvidence({
          category: "identity",
          url: "https://example.com",
          matched_text: "Same content",
        }),
        createEvidence({
          category: "identity",
          url: "https://example.com",
          matched_text: "Same content", // Exact duplicate
        }),
        createEvidence({
          category: "identity",
          url: "https://example.com",
          matched_text: "Different content", // Same URL/kind, different hash
        }),
      ];

      const stored = await recordEvidence("run-1", evidence);

      // Should have 2 items (one deduped)
      expect(stored.length).toBe(2);
    });

    it("should keep different URLs separate", async () => {
      const evidence = [
        createEvidence({
          url: "https://example.com/1",
          matched_text: "Content A",
        }),
        createEvidence({
          url: "https://example.com/2",
          matched_text: "Content A", // Same text, different URL
        }),
      ];

      const stored = await recordEvidence("run-2", evidence);

      expect(stored.length).toBe(2);
    });

    it("should keep different kinds separate", async () => {
      const evidence = [
        createEvidence({
          category: "identity",
          matched_text: "Same text",
        }),
        createEvidence({
          category: "legitimacy",
          matched_text: "Same text", // Same text, different kind
        }),
      ];

      const stored = await recordEvidence("run-3", evidence);

      expect(stored.length).toBe(2);
    });
  });

  describe("Blob offload", () => {
    it("should offload large content (>100KB) to blob storage", async () => {
      const largeContent = "A".repeat(150 * 1024); // 150KB

      const evidence = [
        createEvidence({
          content: largeContent,
          matched_text: undefined,
        }),
      ];

      const stored = await recordEvidence("run-4", evidence);

      expect(stored[0].blob_key).toBeDefined();
      expect(stored[0].blob_key).toMatch(/^evidence\/\d{4}\/\d{2}\//); // Format check
      expect(stored[0].matched_text).toBeUndefined(); // Not stored in DB
    });

    it("should keep small content (<100KB) in database", async () => {
      const smallContent = "A".repeat(50 * 1024); // 50KB

      const evidence = [
        createEvidence({
          content: smallContent,
          matched_text: smallContent,
        }),
      ];

      const stored = await recordEvidence("run-5", evidence);

      expect(stored[0].blob_key).toBeUndefined();
      expect(stored[0].matched_text).toBeDefined();
    });
  });

  describe("Quality calculations", () => {
    it("should calculate quality from tier", () => {
      const mirrorEv = createEvidence({ tier: "mirror" });
      const qualityMirror = calculateQuality({ evidence: mirrorEv });
      expect(qualityMirror).toBeGreaterThan(0.8); // Mirror tier high quality

      const apiEv = createEvidence({ tier: "api" });
      const qualityAPI = calculateQuality({ evidence: apiEv });
      expect(qualityAPI).toBeLessThan(qualityMirror); // API < mirror

      const liveEv = createEvidence({ tier: "live" });
      const qualityLive = calculateQuality({ evidence: liveEv });
      expect(qualityLive).toBeGreaterThan(qualityAPI); // Live > API
    });

    it("should adjust quality based on domain authority", () => {
      const govEv = createEvidence({ url: "https://ugc.gov.in" });
      const govQuality = calculateQuality({ evidence: govEv });

      const eduEv = createEvidence({ url: "https://example.edu.in" });
      const eduQuality = calculateQuality({ evidence: eduEv });

      expect(govQuality).toBeGreaterThan(eduQuality); // .gov.in > .edu.in
    });

    it("should adjust quality based on recency", () => {
      const freshEv = createEvidence();
      const freshQuality = calculateQuality({
        evidence: freshEv,
        recency_days: 0,
      });

      const oldEv = createEvidence();
      const oldQuality = calculateQuality({
        evidence: oldEv,
        recency_days: 400, // >1 year old
      });

      expect(freshQuality).toBeGreaterThan(oldQuality);
    });

    it("should incorporate evidence confidence", () => {
      const ev = createEvidence({ confidence: 0.5 });

      const qualityWithConfidence = calculateQualityWithConfidence({
        evidence: ev,
      });
      const qualityWithoutConfidence = calculateQuality({ evidence: ev });

      // Should blend them
      expect(qualityWithConfidence).toBeGreaterThan(0);
      expect(qualityWithConfidence).toBeLessThanOrEqual(1);
    });
  });

  describe("Evidence Collector", () => {
    it("should accumulate evidence with typed methods", () => {
      const collector = createCollector("run-6", "Test Institution");

      collector.addMirror("UGC", "Found in UGC registry");
      collector.addAPI("WEBSITE", "contact", "example@test.edu.in");
      collector.addLive("AICTE", "Verified by AICTE");

      const items = collector.getItems();
      expect(items.length).toBe(3);
      expect(items[0].tier).toBe("mirror");
      expect(items[1].tier).toBe("api");
      expect(items[2].tier).toBe("live");
    });

    it("should group items by tier", () => {
      const collector = createCollector("run-7", "Test");

      collector.addMirror("UGC", "Text 1");
      collector.addMirror("AISHE", "Text 2");
      collector.addAPI("WEBSITE", "contact", "Text 3");

      const mirrorItems = collector.getByTier("mirror");
      expect(mirrorItems.length).toBe(2);

      const apiItems = collector.getByTier("api");
      expect(apiItems.length).toBe(1);
    });

    it("should calculate statistics", () => {
      const collector = createCollector("run-8", "Test");

      collector.addMirror("UGC", "Text 1");
      collector.addAPI("WEBSITE", "contact", "Text 2");
      collector.addUnavailable("NMC", "API unavailable");

      const stats = collector.getStats();
      expect(stats.total).toBe(3);
      expect(stats.by_tier.mirror).toBe(1);
      expect(stats.by_tier.api).toBe(1);
      expect(stats.by_tier.live).toBe(0);
      expect(stats.by_category.unavailable).toBe(1);
    });
  });

  describe("LLM Payload Projection", () => {
    it("should strip HTML from payload", () => {
      const collector = createCollector("run-9", "Test");

      collector.addAPI(
        "WEBSITE",
        "contact",
        "<p>Contact: <strong>example@test.edu.in</strong></p>"
      );

      const payload = toLLMPayload(collector);

      expect(payload.evidence.length).toBeGreaterThan(0);
      expect(JSON.stringify(payload)).not.toMatch(/<[^>]+>/);
    });

    it("should cap payload at 24k characters", () => {
      const collector = createCollector("run-10", "Test");

      // Add many items to exceed 24k
      for (let i = 0; i < 100; i++) {
        collector.addAPI(
          "WEBSITE",
          "identity",
          `Evidence item ${i} with some content to inflate size`
        );
      }

      const payload = toLLMPayload(collector);
      const payloadStr = JSON.stringify(payload);

      expect(payloadStr.length).toBeLessThanOrEqual(24 * 1024 + 500); // Small tolerance
    });

    it("should prioritize high-quality items when truncating", () => {
      const collector = createCollector("run-11", "Test");

      // Add low-quality item
      collector.add({
        source: "reddit" as any,
        tier: "api",
        timestamp: Date.now(),
        category: "identity",
        quality_score: 0.1,
        matched_text: "A".repeat(10000),
      });

      // Add high-quality item
      collector.add({
        source: "UGC" as any,
        tier: "mirror",
        timestamp: Date.now(),
        category: "legitimacy",
        quality_score: 0.95,
        matched_text: "High quality evidence",
      });

      const payload = toLLMPayload(collector);

      // High-quality item should be retained
      const highQualityItem = payload.evidence.find(
        (e) => e.quality >= 0.9
      );
      expect(highQualityItem).toBeDefined();
    });

    it("should assign stable refs (e1, e2, ...)", () => {
      const collector = createCollector("run-12", "Test");

      collector.addMirror("UGC", "Item 1");
      collector.addMirror("AISHE", "Item 2");
      collector.addMirror("NAD", "Item 3");

      const payload = toLLMPayload(collector);

      expect(payload.evidence[0].ref).toBe("e1");
      expect(payload.evidence[1].ref).toBe("e2");
      expect(payload.evidence[2].ref).toBe("e3");
    });

    it("should throw on HTML in payload (security guard)", () => {
      const collector = createCollector("run-13", "Test");

      collector.add({
        source: "TEST" as any,
        tier: "api",
        timestamp: Date.now(),
        category: "identity",
        quality_score: 0.5,
        content: "<html><body>Test</body></html>", // Large HTML content
      });

      expect(() => toLLMPayload(collector)).toThrow("HTML tags");
    });
  });

  describe("Payload validation", () => {
    it("should validate payload format", () => {
      const collector = createCollector("run-14", "Test");

      collector.addMirror("UGC", "Test");

      const payload = toLLMPayload(collector);
      const validation = validatePayload(payload);

      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);
    });

    it("should detect HTML in payload", () => {
      const payload = {
        run_id: "test",
        institution_name: "Test",
        evidence: [
          {
            ref: "e1",
            kind: "identity" as const,
            source: "TEST",
            tier: "api" as const,
            quality: 0.5,
            text: "<html>Invalid</html>",
          },
        ],
        sources_summary: { total: 1, by_tier: {}, by_kind: {} },
        generated_at: Date.now(),
      };

      const validation = validatePayload(payload);

      expect(validation.valid).toBe(false);
      expect(validation.errors.length).toBeGreaterThan(0);
    });

    it("should validate quality scores (0-1)", () => {
      const payload = {
        run_id: "test",
        institution_name: "Test",
        evidence: [
          {
            ref: "e1",
            kind: "identity" as const,
            source: "TEST",
            tier: "api" as const,
            quality: 1.5, // Invalid
          },
        ],
        sources_summary: { total: 1, by_tier: {}, by_kind: {} },
        generated_at: Date.now(),
      };

      const validation = validatePayload(payload);

      expect(validation.valid).toBe(false);
    });
  });

  describe("InMemory Store", () => {
    it("should store and retrieve evidence", async () => {
      const store = new InMemoryEvidenceStore();

      const evidence = [
        createEvidence({ category: "identity" }),
        createEvidence({ category: "legitimacy" }),
      ];

      await store.record("run-15", evidence);
      const grouped = await store.getRunEvidence("run-15");

      expect(grouped.summary.total).toBeGreaterThan(0);
      expect(grouped.by_kind.identity).toBeDefined();
      expect(grouped.by_kind.legitimacy).toBeDefined();
    });

    it("should clear evidence", async () => {
      const store = new InMemoryEvidenceStore();

      const evidence = [createEvidence()];
      await store.record("run-16", evidence);

      await store.clear("run-16");
      const grouped = await store.getRunEvidence("run-16");

      expect(grouped.summary.total).toBe(0);
    });
  });

  describe("Payload statistics", () => {
    it("should calculate payload stats", () => {
      const collector = createCollector("run-17", "Test");

      collector.addMirror("UGC", "Evidence 1");
      collector.addMirror("AISHE", "Evidence 2");

      const payload = toLLMPayload(collector);
      const stats = getPayloadStats(payload);

      expect(stats.character_count).toBeGreaterThan(0);
      expect(stats.evidence_count).toBe(2);
      expect(stats.avg_quality).toBeGreaterThan(0);
      expect(stats.truncated).toBe(false);
      expect(stats.estimated_token_count).toBeGreaterThan(0);
    });
  });
});
