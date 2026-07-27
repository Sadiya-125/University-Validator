/**
 * UGC Fake Universities Scraper
 *
 * Downloads list of fake/fraudulent institutions from UGC.
 * Source: https://www.ugc.gov.in/universitydetails/Fakeuniversity
 * Method: Playwright HTML extraction
 * Returns: AsyncIterable<RawRow> - nothing else
 *
 * No parsing, no validation, no database operations.
 */

import { RawRow, FetchContext } from "../types";
import { BaseScraper } from "./base";

const UGC_FAKE_URL = "https://www.ugc.gov.in/universitydetails/Fakeuniversity";

/**
 * Scrape UGC fake universities list.
 * Uses Playwright to extract table data from the page.
 * Handles rate limiting internally.
 */
export async function* scrapeUGCFake(
  ctx?: FetchContext
): AsyncIterable<RawRow> {
  const scraper = new BaseScraper();

  ctx?.logger?.info(`UGC Fake: Starting scrape for fake universities`);

  try {
    const { page, browser } = await scraper.getPlaywrightPage();

    try {
      ctx?.logger?.info(`UGC Fake: Navigating to ${UGC_FAKE_URL}`);
      await page.goto(UGC_FAKE_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      // Wait for page to load
      await page.waitForLoadState("networkidle");

      // Wait for the data table to load
      await page.waitForSelector("table#tbl, table.dataTable", { timeout: 10000 }).catch(() => null);

      // Try to click "Show All" or change page length to show all rows
      try {
        // First, try to find the page length selector (DataTables usually has one with name like _length)
        const lengthSelector = await page.$("select[name*='length']");
        if (lengthSelector) {
          ctx?.logger?.info(`UGC Fake: Changing DataTable page length to show all rows`);
          // Try setting to -1 (show all) or a large number like 100
          try {
            await lengthSelector.selectOption("-1");
          } catch (e) {
            // If -1 doesn't work, try 100
            await lengthSelector.selectOption("100");
          }
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(2000); // Give table time to re-render
        } else {
          // Try clicking "Show All" link if it exists
          const showAllLink = await page.locator("text=Show All").first();
          if (await showAllLink.isVisible().catch(() => false)) {
            ctx?.logger?.info(`UGC Fake: Clicking 'Show All' link`);
            await showAllLink.click();
            await page.waitForLoadState("networkidle");
          }
        }
      } catch (e) {
        ctx?.logger?.info(`UGC Fake: Could not find pagination controls (may be showing all by default)`);
      }

      // Extract fake institutions from the page using page.evaluate
      const fakeInstitutions = await page.evaluate(() => {
        const results: any[] = [];

        // UGC fake list uses a DataTable with ID 'tbl'
        const table = document.querySelector("table#tbl") || document.querySelector("table.dataTable") || document.querySelector("table");
        if (!table) {
          return results;
        }

        // Get tbody and extract rows
        const tbody = table.querySelector("tbody");
        if (!tbody) {
          return results;
        }

        const rows = tbody.querySelectorAll("tr");

        rows.forEach((row) => {
          try {
            const cells = row.querySelectorAll("td");

            // UGC fake list has format: Sr No | State | University Name
            if (cells.length < 3) return;

            // Extract fields: cells[0] = Sr No, cells[1] = State, cells[2] = University Name (may include address)
            const srNo = (cells[0]?.textContent || "").trim();
            const state = (cells[1]?.textContent || "").trim();
            const fullText = (cells[2]?.textContent || "").trim();

            // Skip if no name or if Sr No is not numeric (skip empty rows)
            if (!fullText || isNaN(parseInt(srNo))) return;

            // Parse university name and address
            // The full text format is: "University Name, Address info"
            const parts = fullText.split(",");
            const universityName = parts[0]?.trim() || fullText;

            // Extract address (everything after the first comma)
            const address = parts.length > 1 ? parts.slice(1).join(",").trim() : undefined;

            results.push({
              srNo: parseInt(srNo),
              name: universityName,
              state: state || undefined,
              address: address,
            });
          } catch (e) {
            // Skip problematic rows
          }
        });

        // Sort by Sr No to ensure order
        results.sort((a, b) => a.srNo - b.srNo);
        return results;
      });

      ctx?.logger?.info(
        `UGC Fake: Found ${fakeInstitutions.length} fake institutions`
      );

      // Yield each institution as a raw row
      for (let i = 0; i < fakeInstitutions.length; i++) {
        const institution = fakeInstitutions[i];

        yield {
          name: institution.name,
          city: institution.city,
          state: institution.state,
          address: institution.address || undefined,
          status: "Fake/Fraudulent",
          externalId: `ugc-fake-${i + 1}-${institution.name.replace(/\s+/g, "-")}`.toLowerCase(),
          website: undefined,
          email: undefined,
        } as RawRow;

        // Respect rate limiting
        await scraper.rateLimit();
      }

      ctx?.logger?.info(
        `UGC Fake: Scrape completed - processed ${fakeInstitutions.length} fake institutions`
      );
    } finally {
      await browser.close();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx?.logger?.warn(`UGC Fake: Failed to fetch - ${errorMsg}`);
    throw error;
  }
}
