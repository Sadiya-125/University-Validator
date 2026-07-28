import { describe, it, expect } from "vitest";
import { normalizeName, extractCity, areSimilar } from "./normalize";

describe("normalizeName", () => {
  describe("Basic normalization", () => {
    it("should lowercase text", () => {
      const result = normalizeName("INDIAN INSTITUTE OF TECHNOLOGY");
      expect(result.normalized).toBe("indian institute of technology");
    });

    it("should collapse multiple spaces", () => {
      const result = normalizeName("Indian  Institute   Of   Technology");
      expect(result.normalized).toBe("indian institute of technology");
    });

    it("should handle leading/trailing spaces", () => {
      const result = normalizeName("  Delhi University  ");
      expect(result.normalized).toBe("delhi university");
    });

    it("should remove punctuation", () => {
      const result = normalizeName("St. Xavier's College, Mumbai!");
      expect(result.normalized).not.toContain(".");
      expect(result.normalized).not.toContain(",");
      expect(result.normalized).not.toContain("!");
    });

    it("should convert & to and", () => {
      const result = normalizeName("A & M Institute");
      expect(result.normalized).toContain("and");
      expect(result.normalized).not.toContain("&");
    });

    it("should handle empty string", () => {
      const result = normalizeName("");
      expect(result.normalized).toBe("");
      expect(result.tokens).toEqual([]);
    });

    it("should handle null/undefined gracefully", () => {
      const result1 = normalizeName(null as any);
      const result2 = normalizeName(undefined as any);
      expect(result1.normalized).toBe("");
      expect(result2.normalized).toBe("");
    });
  });

  describe("Honorific removal", () => {
    it("should remove Sri", () => {
      const result = normalizeName("Sri Ramakrishna College");
      expect(result.stripped).not.toContain("sri");
      expect(result.normalized).not.toContain("sri");
    });

    it("should remove Shri", () => {
      const result = normalizeName("Shri Vaishnav College");
      expect(result.normalized).not.toContain("shri");
    });

    it("should remove Dr", () => {
      const result = normalizeName("Dr. B.R. Ambedkar Institute");
      expect(result.normalized).not.toContain("dr");
    });

    it("should remove Prof", () => {
      const result = normalizeName("Prof. Rajendra Prasad University");
      expect(result.normalized).not.toContain("prof");
    });

    it("should remove Smt", () => {
      const result = normalizeName("Smt. Rani Laxmi Institute");
      expect(result.normalized).not.toContain("smt");
    });

    it("should remove case-insensitive honorifics", () => {
      const result = normalizeName("SRI College");
      expect(result.normalized).not.toContain("sri");
    });

    it("should preserve stripped field", () => {
      const result = normalizeName("Dr. APJ Abdul Kalam Institute");
      expect(result.stripped).toContain("APJ");
    });
  });

  describe("Ordinal expansion", () => {
    it("should expand 'first' to '1st'", () => {
      const result = normalizeName("First Institute of Technology");
      expect(result.normalized).toContain("1st");
    });

    it("should expand 'second' to '2nd'", () => {
      const result = normalizeName("Second College");
      expect(result.normalized).toContain("2nd");
    });

    it("should expand 'third' to '3rd'", () => {
      const result = normalizeName("Third University");
      expect(result.normalized).toContain("3rd");
    });

    it("should expand multiple ordinals", () => {
      const result = normalizeName("First and Second Institute");
      expect(result.normalized).toContain("1st");
      expect(result.normalized).toContain("2nd");
    });

    it("should expand ordinals case-insensitively", () => {
      const result = normalizeName("FIRST College");
      expect(result.normalized).toContain("1st");
    });
  });

  describe("Place variant canonicalization", () => {
    it("should convert Bombay to Mumbai", () => {
      const result = normalizeName("IIT Bombay");
      expect(result.normalized).toContain("mumbai");
      expect(result.normalized).not.toContain("bombay");
    });

    it("should convert Mumbai to Mumbai (idempotent)", () => {
      const result = normalizeName("IIT Mumbai");
      expect(result.normalized).toContain("mumbai");
    });

    it("should convert Calcutta to Kolkata", () => {
      const result = normalizeName("Calcutta University");
      expect(result.normalized).toContain("kolkata");
    });

    it("should convert Bangalore to Bengaluru", () => {
      const result = normalizeName("Indian Institute Bangalore");
      expect(result.normalized).toContain("bengaluru");
    });

    it("should convert Trivandrum to Thiruvananthapuram", () => {
      const result = normalizeName("University Trivandrum");
      expect(result.normalized).toContain("thiruvananthapuram");
    });

    it("should convert Pondicherry to Puducherry", () => {
      const result = normalizeName("Pondicherry Institute");
      expect(result.normalized).toContain("puducherry");
    });

    it("should handle case-insensitive place variants", () => {
      const result = normalizeName("BOMBAY University");
      expect(result.normalized).toContain("mumbai");
    });
  });

  describe("Tokenization", () => {
    it("should split into tokens", () => {
      const result = normalizeName("Indian Institute of Technology");
      expect(result.tokens).toContain("indian");
      expect(result.tokens).toContain("institute");
      expect(result.tokens).toContain("of");
      expect(result.tokens).toContain("technology");
    });

    it("should not include empty tokens", () => {
      const result = normalizeName("Indian  Institute");
      expect(result.tokens).not.toContain("");
    });

    it("should preserve token order", () => {
      const result = normalizeName("Delhi University");
      expect(result.tokens[0]).toBe("delhi");
      expect(result.tokens[1]).toBe("university");
    });
  });

  describe("Core tokens (stop word removal)", () => {
    it("should remove generic words from core tokens", () => {
      const result = normalizeName("Indian Institute of Technology");
      expect(result.coreTokens).toContain("indian");
      expect(result.coreTokens).toContain("technology");
      expect(result.coreTokens).not.toContain("of");
      expect(result.coreTokens).not.toContain("institute");
    });

    it("should remove university from core tokens", () => {
      const result = normalizeName("Delhi University");
      expect(result.coreTokens).toContain("delhi");
      expect(result.coreTokens).not.toContain("university");
    });

    it("should remove college from core tokens", () => {
      const result = normalizeName("Miranda College");
      expect(result.coreTokens).toContain("miranda");
      expect(result.coreTokens).not.toContain("college");
    });

    it("should remove the from core tokens", () => {
      const result = normalizeName("The Cambridge Institute");
      expect(result.coreTokens).not.toContain("the");
      expect(result.coreTokens).toContain("cambridge");
    });

    it("should remove common institutional suffixes", () => {
      const result = normalizeName("Tata Institute of Fundamental Research");
      expect(result.coreTokens).toContain("tata");
      expect(result.coreTokens).toContain("fundamental");
      expect(result.coreTokens).toContain("research");
      expect(result.coreTokens).not.toContain("institute");
      expect(result.coreTokens).not.toContain("of");
    });
  });

  describe("State detection", () => {
    it("should detect Maharashtra", () => {
      const result = normalizeName("College in Maharashtra");
      expect(result.state).toBe("maharashtra");
    });

    it("should detect Karnataka", () => {
      const result = normalizeName("Institute Karnataka");
      expect(result.state).toBe("karnataka");
    });

    it("should detect Delhi", () => {
      const result = normalizeName("Delhi University");
      expect(result.state).toBe("delhi");
    });

    it("should detect state case-insensitively", () => {
      const result = normalizeName("College in KARNATAKA");
      expect(result.state).toBe("karnataka");
    });

    it("should return undefined for no state", () => {
      const result = normalizeName("College of Engineering");
      expect(result.state).toBeUndefined();
    });

    it("should detect first state if multiple present", () => {
      const result = normalizeName("Delhi University of Maharashtra");
      expect(result.state).toBe("delhi");
    });
  });

  describe("Real-world examples", () => {
    it("should normalize IIT Bombay correctly", () => {
      const result = normalizeName("Indian Institute of Technology, Bombay");
      expect(result.normalized).toContain("mumbai");
      expect(result.coreTokens).toContain("indian");
      expect(result.coreTokens).toContain("technology");
    });

    it("should normalize Delhi University correctly", () => {
      const result = normalizeName("University of Delhi");
      expect(result.normalized).toBe("university of delhi");
      expect(result.coreTokens).toContain("delhi");
    });

    it("should normalize St. Xavier's College correctly", () => {
      const result = normalizeName("St. Xavier's College, Mumbai");
      expect(result.normalized).toContain("xavier");
      expect(result.normalized).toContain("mumbai");
    });

    it("should normalize Shri Ramakrishna College correctly", () => {
      const result = normalizeName("Shri Ramakrishna College of Arts & Science");
      expect(result.normalized).not.toContain("shri");
      expect(result.normalized).toContain("and");
      expect(result.normalized).toContain("science");
    });

    it("should normalize Dr. B.R. Ambedkar correctly", () => {
      const result = normalizeName("Dr. B.R. Ambedkar Institute of Technology, Hyderabad");
      expect(result.normalized).not.toContain("dr");
      expect(result.normalized).toContain("hyderabad");
    });
  });

  describe("Accent handling", () => {
    it("should remove accents from French characters", () => {
      const result = normalizeName("Café Institute");
      expect(result.normalized).toBe("cafe institute");
    });

    it("should handle Indian diacritics", () => {
      const result = normalizeName("Hari Nath Institute");
      expect(result.normalized).toBe("hari nath institute");
    });
  });
});

describe("extractCity", () => {
  it("should extract Delhi", () => {
    const result = extractCity(["indian", "institute", "delhi"]);
    expect(result).toBe("delhi");
  });

  it("should extract Mumbai", () => {
    const result = extractCity(["iit", "mumbai"]);
    expect(result).toBe("mumbai");
  });

  it("should extract Bangalore", () => {
    const result = extractCity(["institute", "bangalore"]);
    expect(result).toBe("bangalore");
  });

  it("should return undefined for no city", () => {
    const result = extractCity(["institute", "technology"]);
    expect(result).toBeUndefined();
  });

  it("should return first city if multiple present", () => {
    const result = extractCity(["delhi", "mumbai", "college"]);
    expect(result).toBe("delhi");
  });
});

describe("areSimilar", () => {
  it("should match identical names", () => {
    const name1 = normalizeName("Indian Institute of Technology Bombay");
    const name2 = normalizeName("Indian Institute of Technology Bombay");
    expect(areSimilar(name1, name2)).toBe(true);
  });

  it("should match with place variant differences", () => {
    const name1 = normalizeName("IIT Bombay");
    const name2 = normalizeName("IIT Mumbai");
    expect(areSimilar(name1, name2)).toBe(true);
  });

  it("should match with honorific differences", () => {
    const name1 = normalizeName("Dr. Rajendra Institute");
    const name2 = normalizeName("Rajendra Institute");
    expect(areSimilar(name1, name2)).toBe(true);
  });

  it("should match with institutional suffixes omitted", () => {
    const name1 = normalizeName("Delhi University");
    const name2 = normalizeName("Delhi");
    // Single core token "delhi" appears in both, so they match
    expect(areSimilar(name1, name2)).toBe(true);
  });

  it("should not match completely different names", () => {
    const name1 = normalizeName("Indian Institute");
    const name2 = normalizeName("American University");
    expect(areSimilar(name1, name2)).toBe(false);
  });

  it("should handle empty core tokens gracefully", () => {
    const name1 = normalizeName("A");
    const name2 = normalizeName("B");
    expect(areSimilar(name1, name2)).toBe(false);
  });
});
