import { describe, it, expect } from "vitest";
import {
  ABBREVIATIONS,
  expandVariants,
  hasAbbreviations,
  getFullForm,
  getAbbreviation,
} from "./abbreviations";

describe("abbreviations", () => {
  describe("ABBREVIATIONS dictionary", () => {
    it("should have 120+ entries", () => {
      expect(Object.keys(ABBREVIATIONS).length).toBeGreaterThanOrEqual(120);
    });

    it("should contain premier institutes", () => {
      expect(ABBREVIATIONS.IIT).toBe("Indian Institute of Technology");
      expect(ABBREVIATIONS.IIM).toBe("Indian Institute of Management");
      expect(ABBREVIATIONS.NIT).toBe("National Institute of Technology");
      expect(ABBREVIATIONS.IIIT).toBe(
        "Indian Institute of Information Technology"
      );
    });

    it("should contain medical institutes", () => {
      expect(ABBREVIATIONS.AIIMS).toBe(
        "All India Institute of Medical Sciences"
      );
      expect(ABBREVIATIONS.JIPMER).toBe(
        "Jawaharlal Institute of Postgraduate Medical Education and Research"
      );
    });

    it("should contain technology institutes", () => {
      expect(ABBREVIATIONS.BITS).toBe(
        "Birla Institute of Technology and Science"
      );
      expect(ABBREVIATIONS.VIT).toBe("Vellore Institute of Technology");
      expect(ABBREVIATIONS.SRM).toBe("SRM Institute of Science and Technology");
    });

    it("should contain regional universities", () => {
      expect(ABBREVIATIONS.DU).toBe("University of Delhi");
      expect(ABBREVIATIONS.BHU).toBe("Banaras Hindu University");
      expect(ABBREVIATIONS.AMU).toBe("Aligarh Muslim University");
    });

    it("should contain NITs (31+)", () => {
      expect(ABBREVIATIONS.MANIT).toBe(
        "Maulana Azad National Institute of Technology"
      );
      expect(ABBREVIATIONS.NITK).toBe("National Institute of Technology Karnataka");
      expect(ABBREVIATIONS.NITP).toBe("National Institute of Technology Patna");
    });

    it("should contain IIITs", () => {
      expect(ABBREVIATIONS.IIITD).toBe(
        "Indraprastha Institute of Information Technology Delhi"
      );
      expect(ABBREVIATIONS.IIITB).toBe(
        "International Institute of Information Technology Bangalore"
      );
    });
  });

  describe("getFullForm", () => {
    it("should get full form of IIT", () => {
      expect(getFullForm("IIT")).toBe("Indian Institute of Technology");
    });

    it("should get full form case-insensitively", () => {
      expect(getFullForm("iit")).toBe("Indian Institute of Technology");
      expect(getFullForm("Iit")).toBe("Indian Institute of Technology");
    });

    it("should return undefined for unknown abbreviation", () => {
      expect(getFullForm("XYZ")).toBeUndefined();
    });

    it("should get full form of medical institutes", () => {
      expect(getFullForm("AIIMS")).toBe("All India Institute of Medical Sciences");
      expect(getFullForm("CMC")).toBe("Christian Medical College");
    });

    it("should get full form of NITs", () => {
      expect(getFullForm("NITK")).toBe("National Institute of Technology Karnataka");
      expect(getFullForm("NITT")).toBe(
        "National Institute of Technology Tiruchirappalli"
      );
    });
  });

  describe("getAbbreviation", () => {
    it("should get abbreviation of full form", () => {
      expect(getAbbreviation("Indian Institute of Technology")).toBe("IIT");
    });

    it("should get abbreviation case-insensitively", () => {
      expect(getAbbreviation("indian institute of technology")).toBe("IIT");
      expect(getAbbreviation("INDIAN INSTITUTE OF TECHNOLOGY")).toBe("IIT");
    });

    it("should return undefined for unknown full form", () => {
      expect(getAbbreviation("Unknown Institute")).toBeUndefined();
    });

    it("should get abbreviation of medical institutes", () => {
      expect(getAbbreviation("All India Institute of Medical Sciences")).toBe(
        "AIIMS"
      );
    });
  });

  describe("hasAbbreviations", () => {
    it("should detect IIT abbreviation", () => {
      expect(hasAbbreviations("iit bombay")).toBe(true);
      expect(hasAbbreviations("IIT Mumbai")).toBe(true);
    });

    it("should detect multiple abbreviations", () => {
      expect(hasAbbreviations("iit delhi nit trichy")).toBe(true);
    });

    it("should return false for text without abbreviations", () => {
      expect(hasAbbreviations("Indian Institute of Technology")).toBe(false);
      expect(hasAbbreviations("University of Delhi")).toBe(false);
    });

    it("should detect NIT abbreviation", () => {
      expect(hasAbbreviations("nit warangal")).toBe(true);
    });

    it("should detect BITS abbreviation", () => {
      expect(hasAbbreviations("bits pilani")).toBe(true);
    });
  });

  describe("expandVariants - Pattern-based expansion", () => {
    it("should expand 'iit <city>' pattern", () => {
      const variants = expandVariants("iit bombay");
      expect(variants[0]).toContain("Indian Institute of Technology");
      expect(variants[0]).toContain("bombay");
    });

    it("should expand 'nit <city>' pattern", () => {
      const variants = expandVariants("nit warangal");
      expect(variants[0]).toContain("National Institute of Technology");
      expect(variants[0]).toContain("warangal");
    });

    it("should handle case-insensitive patterns", () => {
      const variants = expandVariants("IIT Mumbai");
      expect(variants[0]).toContain("Indian Institute of Technology");
    });

    it("should expand with multiple words in city", () => {
      const variants = expandVariants("iit new delhi");
      expect(variants[0]).toContain("Indian Institute of Technology");
      expect(variants[0]).toContain("new delhi");
    });
  });

  describe("expandVariants - Direct abbreviation expansion", () => {
    it("should expand single abbreviation", () => {
      const variants = expandVariants("bits");
      expect(variants[0]).toBe("Birla Institute of Technology and Science");
    });

    it("should expand multiple abbreviations", () => {
      const variants = expandVariants("iit nit");
      expect(variants.length).toBeGreaterThan(0);
      expect(variants[0]).toContain("Indian Institute of Technology");
    });

    it("should return up to 5 variants maximum", () => {
      const variants = expandVariants("iit nit du jnu bits");
      expect(variants.length).toBeLessThanOrEqual(5);
    });

    it("should put full expansion first", () => {
      const variants = expandVariants("iit bits");
      expect(variants[0]).toContain("Indian Institute of Technology");
      expect(variants[0]).toContain("Birla Institute of Technology");
    });
  });

  describe("expandVariants - Real-world examples", () => {
    it("should expand 'iit bombay'", () => {
      const variants = expandVariants("iit bombay");
      expect(variants.length).toBeGreaterThan(0);
      expect(variants[0]).toContain("Indian Institute of Technology");
    });

    it("should expand 'nit trichy'", () => {
      const variants = expandVariants("nit trichy");
      expect(variants.length).toBeGreaterThan(0);
      expect(variants[0]).toContain("National Institute of Technology");
    });

    it("should expand 'bits pilani'", () => {
      const variants = expandVariants("bits pilani");
      expect(variants[0]).toContain("Birla Institute of Technology");
    });

    it("should expand 'du delhi'", () => {
      const variants = expandVariants("du delhi");
      expect(variants[0]).toContain("University of Delhi");
    });

    it("should expand 'aiims new delhi'", () => {
      const variants = expandVariants("aiims new delhi");
      expect(variants[0]).toContain("All India Institute of Medical Sciences");
    });
  });

  describe("expandVariants - Fallback behavior", () => {
    it("should return original if no abbreviations", () => {
      const variants = expandVariants("university of delhi");
      expect(variants).toContain("university of delhi");
    });

    it("should handle empty string", () => {
      const variants = expandVariants("");
      expect(variants.length).toBeGreaterThan(0);
    });

    it("should handle single word", () => {
      const variants = expandVariants("delhi");
      expect(variants).toContain("delhi");
    });
  });

  describe("expandVariants - Partial expansion", () => {
    it("should try partial expansions when multiple abbreviations", () => {
      const variants = expandVariants("iit du");
      expect(variants.length).toBeGreaterThan(0);
      // Should have full expansion first
      if (variants.length > 1) {
        expect(variants[0]).toContain("Indian Institute of Technology");
      }
    });

    it("should prioritize full expansion over partial", () => {
      const variants = expandVariants("iit bits");
      expect(variants[0]).toContain("Indian Institute of Technology");
      expect(variants[0]).toContain("Birla Institute");
    });
  });

  describe("expandVariants - Medical institutes", () => {
    it("should expand 'aiims new delhi'", () => {
      const variants = expandVariants("aiims new delhi");
      expect(variants[0]).toContain("All India Institute of Medical Sciences");
    });

    it("should expand 'jipmer'", () => {
      const variants = expandVariants("jipmer");
      expect(variants[0]).toContain(
        "Jawaharlal Institute of Postgraduate Medical Education"
      );
    });

    it("should expand 'cmc vellore'", () => {
      const variants = expandVariants("cmc vellore");
      expect(variants[0]).toContain("Christian Medical College");
    });
  });

  describe("expandVariants - Regional universities", () => {
    it("should expand 'du'", () => {
      const variants = expandVariants("du");
      expect(variants[0]).toBe("University of Delhi");
    });

    it("should expand 'bhu varanasi'", () => {
      const variants = expandVariants("bhu varanasi");
      expect(variants[0]).toContain("Banaras Hindu University");
    });

    it("should expand 'amu'", () => {
      const variants = expandVariants("amu");
      expect(variants[0]).toBe("Aligarh Muslim University");
    });
  });

  describe("expandVariants - NITs", () => {
    it("should expand 'manit'", () => {
      const variants = expandVariants("manit");
      expect(variants[0]).toContain("Maulana Azad National Institute of Technology");
    });

    it("should expand 'nitk surathkal'", () => {
      const variants = expandVariants("nitk surathkal");
      expect(variants[0]).toContain("National Institute of Technology Karnataka");
    });

    it("should expand 'nitt trichy'", () => {
      const variants = expandVariants("nitt trichy");
      expect(variants[0]).toContain(
        "National Institute of Technology Tiruchirappalli"
      );
    });
  });

  describe("expandVariants - Consistency", () => {
    it("should return same result for repeated calls", () => {
      const variants1 = expandVariants("iit bombay");
      const variants2 = expandVariants("iit bombay");
      expect(variants1).toEqual(variants2);
    });

    it("should not mutate input", () => {
      const input = "iit bombay";
      expandVariants(input);
      expect(input).toBe("iit bombay");
    });

    it("should return array with at least one variant", () => {
      const variants = expandVariants("anything");
      expect(variants.length).toBeGreaterThan(0);
    });
  });

  describe("Round-trip consistency", () => {
    it("should match abbreviation to full form and back", () => {
      const abbr = "IIT";
      const full = getFullForm(abbr);
      expect(full).toBeDefined();
      if (full) {
        const backToAbbr = getAbbreviation(full);
        expect(backToAbbr).toBe("IIT");
      }
    });

    it("should match full form to abbreviation and back", () => {
      const full = "Indian Institute of Technology";
      const abbr = getAbbreviation(full);
      expect(abbr).toBeDefined();
      if (abbr) {
        const backToFull = getFullForm(abbr);
        expect(backToFull).toBe(full);
      }
    });
  });
});
