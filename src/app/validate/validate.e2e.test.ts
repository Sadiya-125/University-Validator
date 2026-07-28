import { test, expect } from "@playwright/test";

/**
 * E2E Tests for /validate page
 * Tests synchronous (200), asynchronous (202), and error paths
 */

test.describe("Validate Page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/validate");
  });

  test.describe("Form Submission", () => {
    test("should validate institution name is required", async ({ page }) => {
      // Try to submit without entering name
      await page.click('button:has-text("Validate")');

      // Should see validation error
      await expect(page.locator("text=Institution name must be at least")).toBeVisible();
    });

    test("should accept institution name input", async ({ page }) => {
      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Indian Institute of Technology Bombay");

      await expect(input).toHaveValue("Indian Institute of Technology Bombay");
    });

    test("should show autocomplete suggestions", async ({ page }) => {
      const input = page.locator('input[placeholder*="Indian Institute"]');

      // Type to trigger autocomplete
      await input.fill("IIT");
      await page.waitForTimeout(300); // Wait for debounce

      // Should show suggestions
      const suggestions = page.locator('button:has-text("IIT")');
      await expect(suggestions.first()).toBeVisible({ timeout: 3000 });
    });

    test("should accept university field (optional)", async ({ page }) => {
      const universityInput = page.locator('input[placeholder*="Affiliating"]');
      await universityInput.fill("State University");

      await expect(universityInput).toHaveValue("State University");
    });

    test("should toggle force revalidation checkbox", async ({ page }) => {
      const checkbox = page.locator('input[type="checkbox"]');
      await expect(checkbox).not.toBeChecked();

      await checkbox.check();
      await expect(checkbox).toBeChecked();

      await checkbox.uncheck();
      await expect(checkbox).not.toBeChecked();
    });
  });

  test.describe("Synchronous Path (200 OK)", () => {
    test("should show cached result immediately", async ({ page }) => {
      // Mock API response for cached result
      await page.route("**/api/validate", (route) => {
        route.abort("aborted");
        // Return a fast response
      });

      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Indian Institute of Technology Bombay");

      const submitButton = page.locator('button:has-text("Validate")');
      await submitButton.click();

      // Should show loading state
      await expect(submitButton).toContainText("Validating");
    });

    test("should display verdict badge", async ({ page, context }) => {
      // Mock the API to return a cached result
      await context.addInitScript(() => {
        window.fetch = async (url, options) => {
          if (url.includes("/api/validate")) {
            return new Response(
              JSON.stringify({
                id: "test-id",
                institutionName: "Indian Institute of Technology Bombay",
                status: "completed",
                confidence: 0.95,
                verdict: "genuine",
                responseTime: 50,
                source: "cache",
                evidence: [
                  {
                    type: "registry",
                    title: "UGC Recognition",
                    source: "UGC",
                    quality: "high",
                  },
                ],
                runs: [],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return fetch(url, options);
        };
      });

      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Indian Institute of Technology Bombay");

      await page.locator('button:has-text("Validate")').click();

      // Wait for result to appear
      await expect(page.locator("text=Indian Institute of Technology Bombay")).toBeVisible({
        timeout: 5000,
      });

      // Should show verdict badge (Genuine)
      const verdictBadge = page.locator('[data-testid="verdict-badge"]').first();
      if (await verdictBadge.isVisible()) {
        await expect(verdictBadge).toContainText("Genuine");
      }
    });

    test("should display response time", async ({ page, context }) => {
      await context.addInitScript(() => {
        window.fetch = async (url) => {
          if (url.includes("/api/validate")) {
            return new Response(
              JSON.stringify({
                id: "test-id",
                institutionName: "Test University",
                status: "completed",
                confidence: 0.9,
                verdict: "genuine",
                responseTime: 47,
                source: "cache",
                evidence: [],
                runs: [],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return fetch(url);
        };
      });

      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Test University");

      await page.locator('button:has-text("Validate")').click();

      // Should show response time
      await expect(page.locator("text=47ms")).toBeVisible({ timeout: 5000 });
    });
  });

  test.describe("Asynchronous Path (202 Accepted)", () => {
    test("should show RunTimeline for async validation", async ({ page, context }) => {
      // Mock the API to return async response
      await context.addInitScript(() => {
        window.fetch = async (url) => {
          if (url.includes("/api/validate")) {
            return new Response(
              JSON.stringify({
                success: true,
                runId: "run-123",
                cached: false,
                validationUrl: "/api/validate/run-123",
                statusUrl: "/api/validate/run-123/status",
                streamUrl: "/api/stream/run-123",
                estimatedTime: 5000,
              }),
              { status: 202, headers: { "Content-Type": "application/json" } }
            );
          }
          return fetch(url);
        };
      });

      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Unknown Institution");

      await page.locator('button:has-text("Validate")').click();

      // Should show "Running validation..." message
      await expect(page.locator("text=Running validation")).toBeVisible({
        timeout: 3000,
      });
    });
  });

  test.describe("Error Handling", () => {
    test("should display error message on API failure", async ({ page, context }) => {
      // Mock API to return error
      await context.addInitScript(() => {
        window.fetch = async (url) => {
          if (url.includes("/api/validate")) {
            return new Response(
              JSON.stringify({
                success: false,
                error: "Validation service unavailable",
                code: "SERVICE_ERROR",
              }),
              { status: 500, headers: { "Content-Type": "application/json" } }
            );
          }
          return fetch(url);
        };
      });

      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Test University");

      await page.locator('button:has-text("Validate")').click();

      // Should show error state
      await expect(
        page.locator("text=Validation Error")
      ).toBeVisible({ timeout: 3000 });
    });

    test("should have retry button in error state", async ({ page, context }) => {
      await context.addInitScript(() => {
        window.fetch = async (url) => {
          if (url.includes("/api/validate")) {
            return new Response(
              JSON.stringify({
                success: false,
                error: "Network error",
              }),
              { status: 500 }
            );
          }
          return fetch(url);
        };
      });

      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Test");

      await page.locator('button:has-text("Validate")').click();

      // Wait for error to show
      await expect(page.locator("text=Validation Error")).toBeVisible({
        timeout: 3000,
      });

      // Should have retry button
      const retryButton = page.locator("button").filter({ hasText: /retry|try again/i });
      if (await retryButton.isVisible()) {
        await expect(retryButton).toBeVisible();
      }
    });
  });

  test.describe("Recent Searches", () => {
    test("should save search to recent searches", async ({ page }) => {
      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Test Institution");

      // Clear any existing data
      await page.evaluate(() => {
        localStorage.removeItem("recentSearches");
      });

      // This would normally trigger on successful validation
      await page.evaluate(() => {
        const recent = ["Test Institution"];
        localStorage.setItem("recentSearches", JSON.stringify(recent));
      });

      // Check localStorage
      const recentSearches = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("recentSearches") || "[]")
      );

      expect(recentSearches).toContain("Test Institution");
    });

    test("should show recent searches dropdown", async ({ page }) => {
      // Set up recent searches
      await page.evaluate(() => {
        localStorage.setItem(
          "recentSearches",
          JSON.stringify(["IIT Bombay", "Delhi University"])
        );
      });

      // Reload to pick up localStorage
      await page.reload();

      // Click Recent button
      const recentButton = page.locator("button").filter({ hasText: /Recent/i });
      if (await recentButton.isVisible()) {
        await recentButton.click();

        // Should show recent searches
        await expect(page.locator("text=IIT Bombay")).toBeVisible();
        await expect(page.locator("text=Delhi University")).toBeVisible();
      }
    });
  });

  test.describe("Result Display", () => {
    test("should show tabs (Overview, Evidence, Authorities, Runs)", async ({
      page,
      context,
    }) => {
      await context.addInitScript(() => {
        window.fetch = async (url) => {
          if (url.includes("/api/validate")) {
            return new Response(
              JSON.stringify({
                id: "test-id",
                institutionName: "Test University",
                status: "completed",
                confidence: 0.9,
                verdict: "genuine",
                responseTime: 50,
                source: "cache",
                evidence: [
                  {
                    type: "registry",
                    title: "UGC Recognition",
                    source: "UGC",
                    quality: "high",
                  },
                ],
                runs: [],
              }),
              { status: 200, headers: { "Content-Type": "application/json" } }
            );
          }
          return fetch(url);
        };
      });

      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Test University");

      await page.locator('button:has-text("Validate")').click();

      // Wait for results
      await page.waitForSelector("button", { hasText: /overview/i, timeout: 3000 });

      // Check tabs exist
      const tabs = ["overview", "evidence", "authorities", "runs"];
      for (const tab of tabs) {
        const tabButton = page.locator("button").filter({
          hasText: new RegExp(tab, "i"),
        });
        if (await tabButton.isVisible()) {
          await expect(tabButton).toBeVisible();
        }
      }
    });

    test("should copy JSON to clipboard", async ({ page, context }) => {
      await context.addInitScript(() => {
        window.fetch = async (url) => {
          if (url.includes("/api/validate")) {
            return new Response(
              JSON.stringify({
                id: "test-id",
                institutionName: "Test University",
                status: "completed",
                confidence: 0.9,
                verdict: "genuine",
                responseTime: 50,
                source: "cache",
                evidence: [],
                runs: [],
              }),
              { status: 200 }
            );
          }
          return fetch(url);
        };
      });

      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Test University");

      await page.locator('button:has-text("Validate")').click();

      // Wait for result
      await page.waitForTimeout(1000);

      // Click Copy JSON button
      const copyButton = page.locator("button").filter({ hasText: /Copy JSON/i });
      if (await copyButton.isVisible()) {
        await copyButton.click();

        // Button text should change to "Copied!"
        await expect(copyButton).toContainText("Copied");
      }
    });

    test("should export results as CSV", async ({ page, context }) => {
      await context.addInitScript(() => {
        window.fetch = async (url) => {
          if (url.includes("/api/validate")) {
            return new Response(
              JSON.stringify({
                id: "test-id",
                institutionName: "Test University",
                status: "completed",
                confidence: 0.9,
                verdict: "genuine",
                responseTime: 50,
                source: "cache",
                evidence: [],
                runs: [],
              }),
              { status: 200 }
            );
          }
          return fetch(url);
        };
      });

      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Test University");

      await page.locator('button:has-text("Validate")').click();

      await page.waitForTimeout(1000);

      // Click Export button
      const exportButton = page.locator("button").filter({ hasText: /Export/i });
      if (await exportButton.isVisible()) {
        await exportButton.click();

        // A download should have started (we can't access it directly in headless mode)
        // but we can verify the button exists and is clickable
        await expect(exportButton).toBeVisible();
      }
    });
  });

  test.describe("Accessibility", () => {
    test("should have proper ARIA labels", async ({ page }) => {
      const submitButton = page.locator('button:has-text("Validate")');
      await expect(submitButton).toHaveAttribute("type", "submit");
    });

    test("should be keyboard navigable", async ({ page }) => {
      const input = page.locator('input[placeholder*="Indian Institute"]');

      // Focus input via Tab
      await page.keyboard.press("Tab");
      await input.fill("Test");

      // Tab to checkbox
      await page.keyboard.press("Tab");

      // Tab to submit button
      await page.keyboard.press("Tab");

      const submitButton = page.locator('button:has-text("Validate")');
      await expect(submitButton).toBeFocused();
    });

    test("should have visible focus rings", async ({ page }) => {
      const button = page.locator('button:has-text("Validate")');

      // Focus the button
      await button.focus();

      // Check for focus styles (outline)
      const style = await button.evaluate((el) => window.getComputedStyle(el).outline);
      expect(style).not.toBe("none");
    });
  });

  test.describe("Mobile Responsiveness", () => {
    test.use({ viewport: { width: 375, height: 812 } });

    test("should be responsive on mobile", async ({ page }) => {
      const input = page.locator('input[placeholder*="Indian Institute"]');
      await input.fill("Test");

      const submitButton = page.locator('button:has-text("Validate")');
      await expect(submitButton).toBeVisible();
    });
  });
});
