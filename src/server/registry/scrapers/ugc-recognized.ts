/**
 * UGC Recognized Universities Scraper
 *
 * Downloads recognized institutions from UGC portal.
 * Source: https://www.ugc.gov.in/universitydetails/university
 * Method: Playwright (JavaScript-rendered portal)
 * Returns: AsyncIterable<RawRow> - nothing else
 *
 * No parsing, no validation, no database operations.
 */

import { RawRow, FetchContext } from "../types";
import { BaseScraper } from "./base";

const UGC_RECOGNIZED_URL =
  "https://www.ugc.gov.in/universitydetails/university?type=ddmCMsxJZgXH2S/m0uMOKQ==";

/**
 * Scrape UGC recognized institutions.
 * Yields raw rows as-is from the website.
 * Handles Playwright automation and rate limiting internally.
 */
export async function* scrapeUGCRecognized(ctx?: FetchContext): AsyncIterable<RawRow> {
  const scraper = new BaseScraper();

  ctx?.logger?.info(`UGC Recognized: Starting scrape for all universities`);

  try {
    const { page, browser } = await scraper.getPlaywrightPage();

    try {
      ctx?.logger?.info(`UGC Recognized: Navigating to ${UGC_RECOGNIZED_URL}`);
      await page.goto(UGC_RECOGNIZED_URL, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      // Wait for page to be interactive
      await page.waitForLoadState("networkidle");

      // Wait for the data table to load
      await page.waitForSelector("table#tbl, table.dataTable", { timeout: 10000 }).catch(() => null);

      // Click "View All" button to show all records (not just filtered by category)
      try {
        ctx?.logger?.info(`UGC Recognized: Clicking 'View All' button to fetch all records`);
        const viewAllButton = await page.locator("#btnall, button:has-text('View All')").first();
        if (await viewAllButton.isVisible().catch(() => false)) {
          await viewAllButton.click();
          ctx?.logger?.info(`UGC Recognized: Clicked View All button`);
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        ctx?.logger?.info(`UGC Recognized: Could not click View All button (may already be showing all)`);
      }

      // Try to change page length to show all rows
      try {
        ctx?.logger?.info(`UGC Recognized: Changing DataTable page length to show all rows`);
        const lengthSelector = await page.$("select[name*='length']");
        if (lengthSelector) {
          // Try setting to -1 (show all) or a large number
          try {
            await lengthSelector.selectOption("-1");
            ctx?.logger?.info(`UGC Recognized: Set page length to -1 (all)`);
          } catch (e) {
            // If -1 doesn't work, try 100
            try {
              await lengthSelector.selectOption("100");
              ctx?.logger?.info(`UGC Recognized: Set page length to 100`);
            } catch (e2) {
              ctx?.logger?.info(`UGC Recognized: Could not set page length`);
            }
          }
          await page.waitForLoadState("networkidle");
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        ctx?.logger?.info(`UGC Recognized: Could not find pagination controls`);
      }

      // Extract all institution data from the table
      const institutions = await page.evaluate(() => {
        const results: any[] = [];

        // UGC recognized uses a DataTable with ID 'tbl'
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

            // UGC recognized list has format: Sr.No | Type | Name | Address | Zip | state | Status | URL
            if (cells.length < 3) return;

            // Extract fields
            const srNo = (cells[0]?.textContent || "").trim();
            const type = (cells[1]?.textContent || "").trim();
            const name = (cells[2]?.textContent || "").trim();
            const address = (cells[3]?.textContent || "").trim();
            const zip = (cells[4]?.textContent || "").trim();
            const state = (cells[5]?.textContent || "").trim();
            const status = (cells[6]?.textContent || "").trim();

            // Try to extract URL from link in the last cell
            let url = undefined;
            if (cells.length > 7) {
              const link = cells[cells.length - 1]?.querySelector("a");
              if (link) {
                url = link.getAttribute("href") || undefined;
              }
            }

            // Skip if no name or if Sr No is not numeric (skip empty rows)
            if (!name || isNaN(parseInt(srNo))) return;

            results.push({
              srNo: parseInt(srNo),
              name: name,
              type: type || undefined,
              address: address || undefined,
              zip: zip || undefined,
              state: state || undefined,
              status: status || undefined,
              url: url,
            });
          } catch (e) {
            // Skip problematic rows
          }
        });

        // Sort by Sr No to ensure order
        results.sort((a, b) => a.srNo - b.srNo);
        return results;
      });

      ctx?.logger?.info(`UGC Recognized: Found ${institutions.length} institutions`);

      // Yield each institution as a raw row
      for (let i = 0; i < institutions.length; i++) {
        const institution = institutions[i];

        yield {
          name: institution.name,
          city: undefined,
          state: institution.state,
          type: institution.type || undefined,
          address: institution.address || undefined,
          zip: institution.zip || undefined,
          status: institution.status || undefined,
          url: institution.url || undefined,
          externalId: `ugc-recognized-${institution.srNo}-${institution.name.replace(/\s+/g, "-")}`.toLowerCase(),
          website: undefined,
          email: undefined,
        } as RawRow;

        // Respect rate limiting
        await scraper.rateLimit();
      }

      ctx?.logger?.info(`UGC Recognized: Scrape completed - processed ${institutions.length} universities`);
    } finally {
      await browser.close();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx?.logger?.warn(`UGC Recognized: Failed to fetch - ${errorMsg}`);
    throw error;
  }
}
