/**
 * AISHE Scrapers
 *
 * Downloads institution data from AISHE (All India Survey on Higher Education) portal.
 * Source: https://dashboard.aishe.gov.in/hedirectory/
 * Method: Playwright (JavaScript-rendered Angular portal with pagination)
 * Returns: AsyncIterable<RawRow>
 *
 * Scrapes two types:
 * - Universities (U/ALL)
 * - Colleges (C/ALL)
 */

import { RawRow, FetchContext } from "../types";
import { BaseScraper } from "./base";

const AISHE_BASE_URL = "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails";

/**
 * Scrape AISHE Universities
 */
export async function* scrapeAISHEUniversities(ctx?: FetchContext): AsyncIterable<RawRow> {
  const scraper = new BaseScraper();
  const typeCode = "U"; // Universities

  ctx?.logger?.info(`AISHE Universities: Starting scrape for all universities`);

  try {
    const { page, browser } = await scraper.getPlaywrightPage();

    try {
      const url = `${AISHE_BASE_URL}/${typeCode}/ALL`;
      ctx?.logger?.info(`AISHE Universities: Navigating to ${url}`);

      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 120000,
      });

      // Wait for the table rows to be attached to DOM
      ctx?.logger?.info(`AISHE Universities: Waiting for table rows to load...`);
      await page.waitForSelector("mat-table mat-row", {
        state: "attached",
        timeout: 120000,
      }).catch(() => null);

      // Verify rows are present before proceeding
      const initialRowCount = await page.locator("mat-table mat-row").count();
      ctx?.logger?.info(`AISHE Universities: Table loaded (${initialRowCount} initial rows visible)`);

      // Note: We'll paginate through pages instead of trying to load all records at once
      // This is more reliable than trying to change page size for large datasets
      ctx?.logger?.info(`AISHE Universities: Paginating through pages (5 rows per page)`);

      const allRows: any[] = [];
      let pageCount = 0;
      const maxPages = 50; // Limit to 50 pages (250 rows) to avoid browser resource exhaustion

      // Extract data from all pages
      let failedExtractions = 0;
      while (pageCount < maxPages) {
        pageCount++;

        try {
          // Wait and extract
          await page.waitForTimeout(1000).catch(() => null);

          const rows = await page.evaluate(() => {
          const results: any[] = [];

          // Find all mat-row elements in the table
          const tableRows = document.querySelectorAll("mat-table mat-row");

          tableRows.forEach((row) => {
            try {
              const cells = row.querySelectorAll("mat-cell");
              if (cells.length < 5) return; // Need at least: aisheCode, name, state, district, url

              const aisheCode = (cells[0]?.textContent || "").trim();
              const name = (cells[1]?.textContent || "").trim();
              const state = (cells[2]?.textContent || "").trim();
              const district = (cells[3]?.textContent || "").trim();

              // Extract URL from link
              const urlLink = cells[4]?.querySelector("a");
              const website = urlLink?.getAttribute("href") || undefined;

              const institutionType = cells.length > 5 ? (cells[5]?.textContent || "").trim() : undefined;
              const yearOfEstablishment = cells.length > 6 ? (cells[6]?.textContent || "").trim() : undefined;
              const location = cells.length > 7 ? (cells[7]?.textContent || "").trim() : undefined;

              if (!name || !aisheCode) return;

              results.push({
                aisheCode,
                name,
                state: state || undefined,
                district: district || undefined,
                website,
                institutionType: institutionType || undefined,
                yearOfEstablishment: yearOfEstablishment || undefined,
                location: location || undefined,
              });
            } catch (e) {
              // Skip rows with errors
            }
          });

          return results;
        });

        if (rows.length > 0) {
          allRows.push(...rows);
          failedExtractions = 0;
          ctx?.logger?.info(`AISHE Universities: Extracted ${rows.length} rows from current page (total: ${allRows.length})`);
        } else {
          failedExtractions++;
          if (failedExtractions > 2) {
            ctx?.logger?.info(`AISHE Universities: No data extracted after 2 attempts, stopping pagination`);
            break;
          }
        }

        // Try to click next page
        try {
          const nextButton = await page.$("button.mat-mdc-paginator-navigation-next:not([disabled])");
          if (nextButton) {
            await nextButton.click();
            await page.waitForTimeout(2000);
          } else {
            break; // No more pages
          }
        } catch (e) {
          break; // No next button, we're done
        }
        } catch (error) {
          // Browser crash or other error during pagination
          const errorMsg = error instanceof Error ? error.message : String(error);
          if (errorMsg.includes("crashed") || errorMsg.includes("Target")) {
            ctx?.logger?.warn(`AISHE Universities: Browser crash detected, stopping after ${allRows.length} rows`);
          } else {
            ctx?.logger?.warn(`AISHE Universities: Error during pagination: ${errorMsg}`);
          }
          break; // Stop pagination on error
        }
      }

      ctx?.logger?.info(`AISHE Universities: Found ${allRows.length} total universities`);

      // Yield each row
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        yield {
          name: row.name,
          state: row.state,
          city: row.district,
          website: row.website,
          externalId: `aishe-university-${row.aisheCode}`.toLowerCase(),
          aisheCode: row.aisheCode,
          district: row.district,
          institutionType: row.institutionType,
          yearOfEstablishment: row.yearOfEstablishment,
          location: row.location,
        } as RawRow;

        await scraper.rateLimit();
      }

      ctx?.logger?.info(`AISHE Universities: Scrape completed`);
    } finally {
      await browser.close();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx?.logger?.warn(`AISHE Universities: Failed to fetch - ${errorMsg}`);
    throw error;
  }
}

/**
 * Scrape AISHE Colleges
 */
export async function* scrapeAISHEColleges(ctx?: FetchContext): AsyncIterable<RawRow> {
  const scraper = new BaseScraper();
  const typeCode = "C"; // Colleges

  ctx?.logger?.info(`AISHE Colleges: Starting scrape for all colleges`);

  try {
    const { page, browser } = await scraper.getPlaywrightPage();

    try {
      const url = `${AISHE_BASE_URL}/${typeCode}/ALL`;
      ctx?.logger?.info(`AISHE Colleges: Navigating to ${url}`);

      await page.goto(url, {
        waitUntil: "networkidle",
        timeout: 90000,
      });

      // Wait for the table to load
      await page.waitForSelector("mat-table", { timeout: 30000 }).catch(() => null);

      const allRows: any[] = [];

      // Extract data from all pages
      while (true) {
        await page.waitForTimeout(500);

        const rows = await page.evaluate(() => {
          const results: any[] = [];
          const tableRows = document.querySelectorAll("mat-table mat-row");

          tableRows.forEach((row) => {
            try {
              const cells = row.querySelectorAll("mat-cell");
              if (cells.length < 4) return;

              const aisheCode = (cells[0]?.textContent || "").trim();
              const name = (cells[1]?.textContent || "").trim();
              const state = (cells[2]?.textContent || "").trim();
              const district = (cells[3]?.textContent || "").trim();

              const urlLink = cells.length > 4 ? cells[4]?.querySelector("a") : null;
              const website = urlLink?.getAttribute("href") || undefined;

              if (!name || !aisheCode) return;

              results.push({
                aisheCode,
                name,
                state,
                district,
                website,
              });
            } catch (e) {
              // Skip
            }
          });

          return results;
        });

        allRows.push(...rows);
        ctx?.logger?.info(`AISHE Colleges: Extracted ${rows.length} rows (total: ${allRows.length})`);

        try {
          const nextButton = await page.$("button.mat-mdc-paginator-navigation-next:not([disabled])");
          if (nextButton) {
            await nextButton.click();
            await page.waitForTimeout(2000);
          } else {
            break;
          }
        } catch (e) {
          break;
        }
      }

      ctx?.logger?.info(`AISHE Colleges: Found ${allRows.length} total colleges`);

      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        yield {
          name: row.name,
          state: row.state,
          city: row.district,
          website: row.website,
          externalId: `aishe-college-${row.aisheCode}`.toLowerCase(),
          aisheCode: row.aisheCode,
          district: row.district,
        } as RawRow;

        await scraper.rateLimit();
      }

      ctx?.logger?.info(`AISHE Colleges: Scrape completed`);
    } finally {
      await browser.close();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx?.logger?.warn(`AISHE Colleges: Failed to fetch - ${errorMsg}`);
    throw error;
  }
}
