import { describe, it, expect } from "vitest";
import { extractPage, normalizePhone } from "./extract";

// Mock HTML fixtures
const fixtures = {
  simple: `
    <!DOCTYPE html>
    <html>
    <head>
      <title>Test University</title>
      <meta name="description" content="A test university">
    </head>
    <body>
      <h1>Welcome to Test University</h1>
      <p>Email: info@test.edu</p>
      <p>Phone: +91-9876543210</p>
    </body>
    </html>
  `,

  iitBombay: `
    <!DOCTYPE html>
    <html>
    <head>
      <title>IIT Bombay</title>
      <meta name="description" content="Indian Institute of Technology Bombay">
    </head>
    <body>
      <main>
        <h1>Indian Institute of Technology Bombay</h1>
        <p>Affiliated to: University of Mumbai</p>
        <p>Approved by: AICTE</p>
        <address>IIT Bombay, Powai, Mumbai, Maharashtra 400076</address>
        <p>Phone: +91-22-2576 7000</p>
        <p>Email: admissions@iitb.ac.in</p>
        <a href="https://facebook.com/iitbombay">Facebook</a>
        <a href="https://twitter.com/iitbombay">Twitter</a>
      </main>
    </body>
    </html>
  `,

  delayedContent: `
    <!DOCTYPE html>
    <html>
    <head><title>App</title></head>
    <body>
      <div id="root"></div>
      <script>React.render(...)</script>
    </body>
    </html>
  `,

  withJsonLd: `
    <!DOCTYPE html>
    <html>
    <head>
      <title>University</title>
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "EducationalOrganization",
        "name": "Test University",
        "url": "https://test.edu"
      }
      </script>
    </head>
    <body>
      <h1>Test University</h1>
    </body>
    </html>
  `,

  withPinCode: `
    <!DOCTYPE html>
    <html>
    <body>
      <p>Address: Test City, Mumbai 400001</p>
      <p>Postal Code: 400101</p>
    </body>
    </html>
  `,

  withState: `
    <!DOCTYPE html>
    <html>
    <body>
      <p>Located in Karnataka</p>
      <p>Bangalore Institute of Technology</p>
    </body>
    </html>
  `,

  multipleEmails: `
    <!DOCTYPE html>
    <html>
    <body>
      <p>General: info@test.edu</p>
      <p>Admissions: admissions@test.edu</p>
      <p>Support: support@test.edu</p>
    </body>
    </html>
  `,

  indianPhones: `
    <!DOCTYPE html>
    <html>
    <body>
      <p>Call us: 9876543210</p>
      <p>Toll free: 1800-123-4567</p>
      <p>Landline: 022-2576 7000</p>
      <p>WhatsApp: +91 98765 43210</p>
    </body>
    </html>
  `,
};

describe("extractPage", () => {
  describe("Basic extraction", () => {
    it("should extract title", () => {
      const result = extractPage(fixtures.simple, "https://example.com");
      expect(result.title).toBe("Test University");
    });

    it("should extract description", () => {
      const result = extractPage(fixtures.simple, "https://example.com");
      expect(result.description).toContain("test university");
    });

    it("should extract headings", () => {
      const result = extractPage(fixtures.simple, "https://example.com");
      expect(result.headings).toContain("Welcome to Test University");
    });

    it("should extract main text", () => {
      const result = extractPage(fixtures.simple, "https://example.com");
      expect(result.mainText.length).toBeGreaterThan(0);
    });
  });

  describe("Contact information", () => {
    it("should extract email addresses", () => {
      const result = extractPage(fixtures.simple, "https://example.com");
      expect(result.emails).toContain("info@test.edu");
    });

    it("should extract multiple emails", () => {
      const result = extractPage(fixtures.multipleEmails, "https://example.com");
      expect(result.emails.length).toBeGreaterThanOrEqual(2);
      expect(result.emails).toContain("info@test.edu");
      expect(result.emails).toContain("admissions@test.edu");
    });

    it("should extract phone numbers", () => {
      const result = extractPage(fixtures.simple, "https://example.com");
      expect(result.phones.length).toBeGreaterThan(0);
    });

    it("should handle various phone formats", () => {
      const result = extractPage(fixtures.indianPhones, "https://example.com");
      expect(result.phones.length).toBeGreaterThan(0);
    });

    it("should extract addresses", () => {
      const result = extractPage(fixtures.iitBombay, "https://example.com");
      expect(result.addresses.length).toBeGreaterThan(0);
    });
  });

  describe("India-specific extraction", () => {
    it("should detect state from text", () => {
      const result = extractPage(fixtures.withState, "https://example.com");
      expect(result.detectedState).toBe("karnataka");
    });

    it("should detect PIN code", () => {
      const result = extractPage(fixtures.withPinCode, "https://example.com");
      expect(result.detectedPinCode).toBeDefined();
      expect(result.detectedPinCode).toMatch(/\d{6}/);
    });

    it("should extract affiliation information", () => {
      const result = extractPage(fixtures.iitBombay, "https://example.com");
      if (result.affiliation) {
        expect(result.affiliation.text).toContain("Mumbai");
        expect(result.affiliation.snippet).toBeDefined();
      }
    });

    it("should extract approval information", () => {
      const result = extractPage(fixtures.iitBombay, "https://example.com");
      if (result.approval) {
        expect(result.approval.text).toContain("AICTE");
        expect(result.approval.snippet).toBeDefined();
      }
    });
  });

  describe("Social links", () => {
    it("should extract social media links", () => {
      const result = extractPage(fixtures.iitBombay, "https://iitb.ac.in");
      expect(result.socialLinks.length).toBeGreaterThan(0);
    });

    it("should identify Facebook links", () => {
      const result = extractPage(fixtures.iitBombay, "https://iitb.ac.in");
      const facebookLinks = result.socialLinks.filter((l) => l.platform === "facebook");
      expect(facebookLinks.length).toBeGreaterThan(0);
    });

    it("should identify Twitter links", () => {
      const result = extractPage(fixtures.iitBombay, "https://iitb.ac.in");
      const twitterLinks = result.socialLinks.filter((l) => l.platform === "twitter");
      expect(twitterLinks.length).toBeGreaterThan(0);
    });
  });

  describe("Structured data", () => {
    it("should extract JSON-LD", () => {
      const result = extractPage(fixtures.withJsonLd, "https://example.com");
      expect(result.jsonLd.length).toBeGreaterThan(0);
      expect(result.jsonLd[0]).toHaveProperty("@type");
    });

    it("should extract meta tags", () => {
      const result = extractPage(fixtures.simple, "https://example.com");
      expect(Object.keys(result.metaTags).length).toBeGreaterThan(0);
    });
  });

  describe("JavaScript detection", () => {
    it("should detect SPA applications", () => {
      const result = extractPage(fixtures.delayedContent, "https://example.com");
      expect(result.needsJavaScript).toBe(true);
    });

    it("should not require JavaScript for static pages", () => {
      const result = extractPage(fixtures.simple, "https://example.com");
      expect(result.needsJavaScript).toBe(false);
    });
  });

  describe("Text size limits", () => {
    it("should cap main text at 8KB", () => {
      const result = extractPage(fixtures.simple, "https://example.com");
      expect(result.mainText.length).toBeLessThanOrEqual(8192);
    });
  });

  describe("Link extraction", () => {
    it("should extract outbound links", () => {
      const result = extractPage(fixtures.iitBombay, "https://iitb.ac.in");
      expect(result.outboundLinks.length).toBeGreaterThan(0);
    });

    it("should classify links as internal or external", () => {
      const result = extractPage(fixtures.iitBombay, "https://iitb.ac.in");
      const link = result.outboundLinks[0];
      if (link) {
        expect(["internal", "external"]).toContain(link.type);
      }
    });
  });
});

describe("normalizePhone", () => {
  it("should convert 10-digit Indian number to E.164", () => {
    const phone = normalizePhone("9876543210");
    expect(phone).toBe("+919876543210");
  });

  it("should handle formatted numbers", () => {
    const phone = normalizePhone("98765-43210");
    expect(phone).toMatch(/\+91/);
  });

  it("should handle +91 prefix", () => {
    const phone = normalizePhone("+919876543210");
    expect(phone).toBe("+919876543210");
  });

  it("should handle leading zero format", () => {
    const phone = normalizePhone("09876543210");
    expect(phone).toBe("+919876543210");
  });

  it("should handle parentheses and dots", () => {
    const phone = normalizePhone("(98) 7654.3210");
    expect(phone).toMatch(/\+91/);
  });

  it("should return empty string for invalid numbers", () => {
    const phone = normalizePhone("123456");
    expect(phone).toBe("");
  });

  it("should handle numbers starting with 6-9", () => {
    const validStarts = ["6", "7", "8", "9"];
    for (const start of validStarts) {
      const phone = normalizePhone(`${start}876543210`);
      expect(phone).toMatch(/\+91/);
    }
  });

  it("should reject numbers starting with 0-5", () => {
    const phone = normalizePhone("5876543210");
    expect(phone).toBe("");
  });
});

describe("Real-world fixtures", () => {
  it("should handle IIT Bombay homepage", () => {
    const result = extractPage(fixtures.iitBombay, "https://iitb.ac.in");

    expect(result.title).toContain("IIT");
    expect(result.headings.length).toBeGreaterThan(0);
    expect(result.emails.length).toBeGreaterThan(0);
    expect(result.phones.length).toBeGreaterThan(0);
    expect(result.addresses.length).toBeGreaterThan(0);
  });

  it("should handle JSON-LD structured data", () => {
    const result = extractPage(fixtures.withJsonLd, "https://example.com");

    expect(result.title).toBe("University");
    expect(result.jsonLd.length).toBeGreaterThan(0);
  });

  it("should handle SPA detection", () => {
    const result = extractPage(fixtures.delayedContent, "https://example.com");

    expect(result.needsJavaScript).toBe(true);
  });
});

describe("Edge cases", () => {
  it("should handle empty HTML", () => {
    const result = extractPage("", "https://example.com");
    expect(result.mainText).toBe("");
  });

  it("should handle malformed HTML", () => {
    const html = "<html><body><p>Unclosed paragraph</body></html>";
    const result = extractPage(html, "https://example.com");
    expect(result.mainText.length).toBeGreaterThan(0);
  });

  it("should handle HTML with no title", () => {
    const html = "<html><body>No title</body></html>";
    const result = extractPage(html, "https://example.com");
    expect(result.title).toBeUndefined();
  });

  it("should handle invalid JSON-LD", () => {
    const html = `
      <html>
      <head>
        <script type="application/ld+json">
        {invalid json}
        </script>
      </head>
      </html>
    `;
    const result = extractPage(html, "https://example.com");
    // Should not crash, just skip invalid JSON-LD
    expect(result).toBeDefined();
  });
});
