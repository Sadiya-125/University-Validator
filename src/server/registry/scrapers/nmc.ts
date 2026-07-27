/**
 * NMC Scrapers
 *
 * Downloads archival college and course data from NMC (National Medical Commission) portal.
 * Source: https://www.nmc.org.in/information-desk/college-and-course-search/archival-data-of-college-and-course/
 * Method: Playwright (DataTables-based pagination)
 * Returns: AsyncIterable<RawRow> - institution records from closed/archival data
 */

import { RawRow, FetchContext } from "../types";
import { BaseScraper } from "./base";

const NMC_URL = "https://www.nmc.org.in/information-desk/college-and-course-search/archival-data-of-college-and-course/";

/**
 * Scrape NMC closed colleges and courses
 */
export async function* scrapeNMCColleges(ctx?: FetchContext): AsyncIterable<RawRow> {
  const scraper = new BaseScraper();

  ctx?.logger?.info(`NMC Colleges: Starting scrape for closed/archival colleges`);

  try {
    const { page, browser } = await scraper.getPlaywrightPage();

    try {
      ctx?.logger?.info(`NMC Colleges: Navigating to ${NMC_URL}`);

      await page.goto(NMC_URL, {
        waitUntil: "networkidle",
        timeout: 90000,
      });

      // Wait for the DataTable to load
      ctx?.logger?.info(`NMC Colleges: Waiting for table to load...`);
      await page.waitForSelector("table#colleges_closed_courses", { timeout: 30000 }).catch(() => null);

      const allRows: any[] = [];

      // Set page length to 1000 to get maximum records per page
      try {
        ctx?.logger?.info(`NMC Colleges: Setting page length to 1000...`);
        const lengthSelect = await page.$("select[name='colleges_closed_courses_length']");
        if (lengthSelect) {
          await lengthSelect.selectOption("1000");
          await page.waitForTimeout(2000);
        }
      } catch (e) {
        ctx?.logger?.info(`NMC Colleges: Could not set page length, using default`);
      }

      // Extract data from all pages
      while (true) {
        await page.waitForTimeout(500);

        const rows = await page.evaluate(() => {
          const results: any[] = [];
          const tableRows = document.querySelectorAll("table#colleges_closed_courses tbody tr");

          tableRows.forEach((row) => {
            try {
              const cells = row.querySelectorAll("td");
              if (cells.length < 3) return; // Need at least: sl.no, state, name

              const slNo = (cells[0]?.textContent || "").trim();
              const state = (cells[1]?.textContent || "").trim();
              const collegeName = (cells[2]?.textContent || "").trim();
              const courseName = cells.length > 3 ? (cells[3]?.textContent || "").trim() : undefined;
              const universityName = cells.length > 4 ? (cells[4]?.textContent || "").trim() : undefined;
              const yearOfInception = cells.length > 5 ? (cells[5]?.textContent || "").trim() : undefined;
              const intake = cells.length > 6 ? (cells[6]?.textContent || "").trim() : undefined;
              const recognition = cells.length > 7 ? (cells[7]?.textContent || "").trim() : undefined;
              const remarks = cells.length > 8 ? (cells[8]?.textContent || "").trim() : undefined;

              if (!collegeName || !state) return;

              results.push({
                slNo,
                state,
                collegeName,
                courseName,
                universityName,
                yearOfInception,
                intake,
                recognition,
                remarks,
              });
            } catch (e) {
              // Skip rows with errors
            }
          });

          return results;
        });

        allRows.push(...rows);
        ctx?.logger?.info(`NMC Colleges: Extracted ${rows.length} rows from current page (total: ${allRows.length})`);

        // Try to click next page button
        try {
          const nextButton = await page.$("a.paginate_button.next:not(.disabled)");
          if (nextButton) {
            await nextButton.click();
            await page.waitForTimeout(1000);
          } else {
            break; // No more pages
          }
        } catch (e) {
          break; // No next button, we're done
        }
      }

      ctx?.logger?.info(`NMC Colleges: Found ${allRows.length} total closed/archival records`);

      // Yield each row
      for (let i = 0; i < allRows.length; i++) {
        const row = allRows[i];
        yield {
          name: row.collegeName,
          state: row.state,
          city: undefined,
          website: undefined,
          externalId: `nmc-${row.slNo}-${row.state.replace(/\s+/g, "-")}`.toLowerCase(),
          courseName: row.courseName,
          universityName: row.universityName,
          yearOfInception: row.yearOfInception,
          intake: row.intake,
          recognition: row.recognition,
          remarks: row.remarks,
        } as RawRow;

        await scraper.rateLimit();
      }

      ctx?.logger?.info(`NMC Colleges: Scrape completed`);
    } finally {
      await browser.close();
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx?.logger?.warn(`NMC Colleges: Failed to fetch - ${errorMsg}`);
    throw error;
  }
}
