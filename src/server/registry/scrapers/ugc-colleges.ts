/**
 * UGC Colleges Scraper
 *
 * Downloads list of UGC-affiliated colleges using browser automation.
 * Source: https://www.ugc.gov.in/colleges
 * Method: Playwright (trigger CSV/Excel download, parse exported file)
 * Returns: AsyncIterable<RawRow> - nothing else
 *
 * No parsing, no validation, no database operations.
 */

import { RawRow, FetchContext } from "../types";
import { BaseScraper } from "./base";

const UGC_COLLEGES_URL = "https://www.ugc.gov.in/colleges";

/**
 * Scrape UGC colleges list.
 * Uses Playwright to trigger CSV export and parse the data.
 * Handles rate limiting internally.
 */
export async function* scrapeUGCColleges(ctx?: FetchContext): AsyncIterable<RawRow> {
  const scraper = new BaseScraper();

  ctx?.logger?.info(`UGC Colleges: Starting scrape for colleges`);

  try {
    const { page, browser } = await scraper.getPlaywrightPage();

    try {
      ctx?.logger?.info(`UGC Colleges: Navigating to ${UGC_COLLEGES_URL}`);
      await page.goto(UGC_COLLEGES_URL, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });

      ctx?.logger?.info("UGC Colleges: Waiting for college table...");

      await page.waitForSelector("#tbl tbody tr", {
        state: "attached",
        timeout: 120000,
      });

      const initialRows = await page.locator("#tbl tbody tr").count();

      ctx?.logger?.info(`UGC Colleges: Table loaded (${initialRows} visible rows)`);

      // Try to change page length to show all rows
      try {
        ctx?.logger?.info(`UGC Colleges: Changing DataTable page length to show all rows`);
        const lengthSelector = await page.$("select[name*='length']");
        if (lengthSelector) {
          // Try setting to -1 (show all)
          try {
            await lengthSelector.selectOption("-1");
            ctx?.logger?.info(`UGC Colleges: Set page length to -1 (all)`);
          } catch (e) {
            // If -1 doesn't work, try 100
            try {
              await lengthSelector.selectOption("100");
              ctx?.logger?.info(`UGC Colleges: Set page length to 100`);
            } catch (e2) {
              ctx?.logger?.info(`UGC Colleges: Could not set page length`);
            }
          }
          await page.waitForTimeout(1000);
          await page.waitForFunction(() => {
            return document.querySelectorAll("#tbl tbody tr").length > 0;
          });
        }
      } catch (e) {
        ctx?.logger?.info(`UGC Colleges: Could not find pagination controls`);
      }

      // Extract college data using page.evaluate
      // Table format: Sr No | Name | Affiliated To University | Address | District | State | Status | Year of Estb. | Teaching Upto | Govt or Non Govt | Aided or Unaided
      const colleges = await page.evaluate(() => {
        const results: any[] = [];

        // UGC colleges uses a DataTable with ID 'tbl'
        const table = document.querySelector("table#tbl")
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

            // Minimum columns needed: Sr No + Name + Affiliated + Address + District + State
            if (cells.length < 6) return;

            // Extract fields from the 11-column table
            const srNo = (cells[0]?.textContent || "").trim();
            const name = (cells[1]?.textContent || "").trim();
            const affiliatedUniversity = (cells[2]?.textContent || "").trim();
            const address = (cells[3]?.textContent || "").trim();
            const district = (cells[4]?.textContent || "").trim();
            const state = (cells[5]?.textContent || "").trim();
            const status = cells.length > 6 ? (cells[6]?.textContent || "").trim() : undefined;
            const yearEstablished =
              cells.length > 7 ? (cells[7]?.textContent || "").trim() : undefined;
            const teachingUpto =
              cells.length > 8 ? (cells[8]?.textContent || "").trim() : undefined;
            const govtOrNonGovt =
              cells.length > 9 ? (cells[9]?.textContent || "").trim() : undefined;
            const aiddedOrUnaided =
              cells.length > 10 ? (cells[10]?.textContent || "").trim() : undefined;

            // Skip if no name or if Sr No is not numeric
            if (!name || isNaN(parseInt(srNo))) return;

            results.push({
              srNo: parseInt(srNo),
              name: name,
              affiliatedUniversity: affiliatedUniversity || undefined,
              address: address || undefined,
              district: district || undefined,
              state: state || undefined,
              status: status,
              yearEstablished: yearEstablished,
              teachingUpto: teachingUpto,
              govtOrNonGovt: govtOrNonGovt,
              aiddedOrUnaided: aiddedOrUnaided,
            });
          } catch (e) {
            // Skip problematic rows
          }
        });

        // Sort by Sr No
        results.sort((a, b) => a.srNo - b.srNo);
        return results;
      });

      ctx?.logger?.info(`UGC Colleges: Found ${colleges.length} colleges on page`);

      // Yield each college as a raw row
      for (let i = 0; i < colleges.length; i++) {
        const college = colleges[i];

        yield {
          name: college.name,
          city: undefined,
          state: college.state,
          address: college.address || undefined,
          district: college.district || undefined,
          affiliatedUniversity: college.affiliatedUniversity || undefined,
          status: college.status || undefined,
          yearEstablished: college.yearEstablished || undefined,
          teachingUpto: college.teachingUpto || undefined,
          govtOrNonGovt: college.govtOrNonGovt || undefined,
          aiddedOrUnaided: college.aiddedOrUnaided || undefined,
          externalId:
            `ugc-college-${college.srNo}-${college.name.replace(/\s+/g, "-")}`.toLowerCase(),
          website: undefined,
          email: undefined,
        } as RawRow;

        // Respect rate limiting
        await scraper.rateLimit();
      }

      ctx?.logger?.info(`UGC Colleges: Scrape completed - processed ${colleges.length} colleges`);
    } finally {
      await browser.close();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx?.logger?.warn(`UGC Colleges: Failed to fetch - ${errorMsg}`);
    throw error;
  }
}
