/**
 * INI (Institutes of National Importance) Scraper
 *
 * Institutes of National Importance are created by Acts of Parliament
 * and are NOT under UGC or AICTE. They include IITs, NITs, IIMs, AIIMS, etc.
 *
 * Source: AISHE Dashboard (https://dashboard.aishe.gov.in/hedirectory/)
 * Method: Playwright-based scraping from mat-table data
 * Scope: All 173+ INIs across all categories
 *
 * Expected data fields:
 * - AISHE Code
 * - Name
 * - State
 * - District
 * - Web Url
 * - Year Of Establishment
 * - Location (Rural/Urban)
 */

import { RawRow, FetchContext } from "../types";
import { BaseScraper } from "./base";

/**
 * AISHE Dashboard URLs for all INI categories
 */
const INI_URLS = [
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/indian%20institute%20of%20information%20technology",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/indian%20institute%20of%20management",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/indian%20institute%20of%20science%20education%20&%20research",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/indian%20institute%20of%20technology",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/indian%20statistical%20institute",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/national%20institute%20of%20desig",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/national%20institute%20of%20fashion%20technology",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/national%20institute%20of%20technology",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/school%20of%20planning%20&%20architecture",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/national%20institute%20of%20pharmaceutical",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/inicu",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/all%20india%20institute%20of%20medical%20science",
  "https://dashboard.aishe.gov.in/hedirectory/#/hedirectory/universityDetails/INI/others",
];

/**
 * Extract institutions from AISHE dashboard mat-table
 */
async function extractInstitutionsFromPage(
  url: string,
  ctx?: FetchContext
): Promise<RawRow[]> {
  const scraper = new BaseScraper();
  const institutions: RawRow[] = [];

  try {
    const { page, browser } = await scraper.getPlaywrightPage();

    ctx?.logger?.info(`INI: Loading ${url}`);
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

    // Wait for mat-table to load
    await page.waitForSelector("mat-table", { timeout: 10000 });

    // Extract all mat-row data
    const rows = await page.evaluate(() => {
      const rows: Record<string, string>[] = [];
      const matRows = document.querySelectorAll("mat-row");

      matRows.forEach((matRow) => {
        const cells = matRow.querySelectorAll("mat-cell");
        if (cells.length >= 7) {
          rows.push({
            aisheCode: cells[0]?.textContent?.trim() || "",
            name: cells[1]?.textContent?.trim() || "",
            state: cells[2]?.textContent?.trim() || "",
            district: cells[3]?.textContent?.trim() || "",
            webUrl: cells[4]?.textContent?.trim() || "",
            yearOfEstablishment: cells[5]?.textContent?.trim() || "",
            location: cells[6]?.textContent?.trim() || "",
          });
        }
      });

      return rows;
    });

    ctx?.logger?.info(`INI: Extracted ${rows.length} institutions from ${url}`);

    // Convert to RawRow format
    for (const row of rows) {
      if (row.aisheCode && row.name && row.name.length > 3) {
        institutions.push({
          externalId: `ini-${row.aisheCode}`,
          name: row.name,
          state: row.state || undefined,
          city: row.district || undefined,
          website: row.webUrl || undefined,
          yearOfEstablishment: row.yearOfEstablishment || undefined,
          location: row.location || undefined,
          aisheCode: row.aisheCode,
          district: row.district || undefined,
        } as RawRow);
      }
    }

    await browser.close();
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx?.logger?.warn(`INI: Error scraping ${url}: ${errorMsg}`);
  }

  return institutions;
}

/**
 * Scrape INI institutions from AISHE Dashboard.
 * Iterates through all INI category URLs and extracts data.
 */
export async function* scrapeINI(ctx?: FetchContext): AsyncIterable<RawRow> {
  ctx?.logger?.info(`INI: Starting scrape from AISHE Dashboard (${INI_URLS.length} categories)`);

  const seenInstitutions = new Set<string>();
  let totalCount = 0;

  for (const url of INI_URLS) {
    try {
      const institutions = await extractInstitutionsFromPage(url, ctx);

      for (const inst of institutions) {
        const key = `${inst.name}|${inst.state}`;
        if (!seenInstitutions.has(key)) {
          seenInstitutions.add(key);
          totalCount++;
          yield inst;
        }
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      ctx?.logger?.warn(`INI: Error processing ${url}: ${errorMsg}`);
    }
  }

  ctx?.logger?.info(`INI: Scrape completed - ${totalCount} unique institutions found`);
}
