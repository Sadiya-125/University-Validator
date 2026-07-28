/**
 * Applicability tests
 *
 * Tests all 11 institution types and their mapped verification sources
 */

import { describe, it, expect } from "vitest";
import { relevantSources, isAuthorityApplicable, AUTHORITY_TIERS, ALWAYS_INCLUDED } from "./applicability";
import { AuthorityCode, InstitutionType } from "./types";
import type { ResolvedIdentity } from "../discovery/types";

describe("Applicability mapping", () => {
  const createIdentity = (name: string, state?: string): ResolvedIdentity => ({
    canonicalName: name,
    type: "institution",
    confidence: 0.9,
    needsReview: false,
    needsHumanReview: false,
    resolverChain: [],
    resolvedAt: Date.now(),
    candidates: [],
    state,
  });

  describe("Institution type detection", () => {
    it("should detect engineering colleges", () => {
      const identity = createIdentity("IIT Bombay");
      const sources = relevantSources(identity);
      const authorities = sources.map((s) => s.authority);

      expect(authorities).toContain(AuthorityCode.AICTE);
      expect(authorities).toContain(AuthorityCode.UGC);
    });

    it("should detect medical colleges", () => {
      const identity = createIdentity("AIIMS Delhi");
      const sources = relevantSources(identity);
      const authorities = sources.map((s) => s.authority);

      expect(authorities).toContain(AuthorityCode.NMC);
      expect(authorities).toContain(AuthorityCode.UGC);
    });

    it("should detect dental colleges", () => {
      const identity = createIdentity("Dental College");
      const sources = relevantSources(identity);
      const authorities = sources.map((s) => s.authority);

      expect(authorities).toContain(AuthorityCode.NMC);
      expect(authorities).toContain(AuthorityCode.UGC);
    });

    it("should detect pharmacy colleges", () => {
      const identity = createIdentity("Pharmacy Institute");
      const sources = relevantSources(identity);
      const authorities = sources.map((s) => s.authority);

      expect(authorities).toContain(AuthorityCode.PCI);
      expect(authorities).toContain(AuthorityCode.AICTE);
      expect(authorities).toContain(AuthorityCode.UGC);
    });

    it("should detect nursing institutions", () => {
      const identity = createIdentity("Nursing College");
      const sources = relevantSources(identity);
      const authorities = sources.map((s) => s.authority);

      expect(authorities).toContain(AuthorityCode.INC);
      expect(authorities).toContain(AuthorityCode.UGC);
    });

    it("should detect teacher education", () => {
      const identity = createIdentity("Teacher Education");
      const sources = relevantSources(identity);
      const authorities = sources.map((s) => s.authority);

      expect(authorities).toContain(AuthorityCode.NCTE);
      expect(authorities).toContain(AuthorityCode.UGC);
    });

    it("should detect architecture colleges", () => {
      const identity = createIdentity("Architecture College");
      const sources = relevantSources(identity);
      const authorities = sources.map((s) => s.authority);

      expect(authorities).toContain(AuthorityCode.COA);
      expect(authorities).toContain(AuthorityCode.AICTE);
      expect(authorities).toContain(AuthorityCode.UGC);
    });

    it("should detect law colleges", () => {
      const identity = createIdentity("Law College");
      const sources = relevantSources(identity);
      const authorities = sources.map((s) => s.authority);

      expect(authorities).toContain(AuthorityCode.BCI);
      expect(authorities).toContain(AuthorityCode.UGC);
    });

    it("should detect universities", () => {
      const identity = createIdentity("University");
      const sources = relevantSources(identity);
      const authorities = sources.map((s) => s.authority);

      expect(authorities).toContain(AuthorityCode.UGC);
      expect(authorities).toContain(AuthorityCode.AISHE);
    });

    it("should detect schools", () => {
      const identity = createIdentity("School");
      const sources = relevantSources(identity);
      const authorities = sources.map((s) => s.authority);

      expect(authorities).toContain(AuthorityCode.CBSE);
      expect(authorities).toContain(AuthorityCode.CISCE);
      expect(authorities).toContain(AuthorityCode.NIOS);
    });
  });

  describe("Always-included sources", () => {
    it("should always include UGC_FAKE, AISHE, WIKIDATA, WEBSITE, NAD", () => {
      const identity = createIdentity("Test Institution");
      const sources = relevantSources(identity);
      const authorities = sources.map((s) => s.authority);

      expect(authorities).toContain(AuthorityCode.UGC_FAKE);
      expect(authorities).toContain(AuthorityCode.AISHE);
      expect(authorities).toContain(AuthorityCode.WIKIDATA);
      expect(authorities).toContain(AuthorityCode.WEBSITE);
      expect(authorities).toContain(AuthorityCode.NAD);
    });

    it("should include always-included sources for medical colleges", () => {
      const identity = createIdentity("Medical College");
      const sources = relevantSources(identity);

      // Should include both type-specific (NMC, UGC) and always-included
      const authorities = sources.map((s) => s.authority);
      expect(authorities).toContain(AuthorityCode.NMC);
      expect(authorities).toContain(AuthorityCode.UGC);
      expect(authorities).toContain(AuthorityCode.UGC_FAKE);
      expect(authorities).toContain(AuthorityCode.AISHE);
    });
  });

  describe("Authority applicability", () => {
    it("should not penalize medical colleges for absent AICTE", () => {
      const isApplicable = isAuthorityApplicable(
        InstitutionType.MEDICAL,
        AuthorityCode.AICTE
      );
      expect(isApplicable).toBe(false);
    });

    it("should apply AICTE to engineering colleges", () => {
      const isApplicable = isAuthorityApplicable(
        InstitutionType.ENGINEERING,
        AuthorityCode.AICTE
      );
      expect(isApplicable).toBe(true);
    });

    it("should apply NMC to medical colleges", () => {
      const isApplicable = isAuthorityApplicable(
        InstitutionType.MEDICAL,
        AuthorityCode.NMC
      );
      expect(isApplicable).toBe(true);
    });
  });

  describe("Authority tiers", () => {
    it("should have tier mapping for all authorities", () => {
      const authorities = Object.values(AuthorityCode);

      for (const auth of authorities) {
        const tier = AUTHORITY_TIERS[auth];
        expect(tier).toBeDefined();
        expect(["mirror", "api", "live"]).toContain(tier);
      }
    });

    it("should map always-included to appropriate tiers", () => {
      for (const auth of ALWAYS_INCLUDED) {
        const tier = AUTHORITY_TIERS[auth];
        expect(tier).toBeDefined();
      }
    });
  });

  describe("Source rationale", () => {
    it("should provide rationale for each source", () => {
      const identity = createIdentity("Engineering College");
      const sources = relevantSources(identity);

      for (const source of sources) {
        expect(source.rationale).toBeDefined();
        expect(source.rationale.length).toBeGreaterThan(0);
      }
    });

    it("should differentiate rationale by type and authority", () => {
      const engineering = createIdentity("Engineering Institute");
      const medical = createIdentity("Medical College");

      const engSources = relevantSources(engineering);
      const medSources = relevantSources(medical);

      const engRationales = engSources.map((s) => s.rationale).join("|");
      const medRationales = medSources.map((s) => s.rationale).join("|");

      // Should have different rationales (not identical)
      expect(engRationales).not.toBe(medRationales);
    });
  });
});
