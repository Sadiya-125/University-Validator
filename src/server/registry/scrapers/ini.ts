/**
 * INI (Institutes of National Importance) Scraper
 *
 * Institutes of National Importance are created by Acts of Parliament
 * and are NOT under UGC or AICTE. They include IITs, NITs, IIMs, AIIMS, etc.
 *
 * Source: Wikipedia (https://en.wikipedia.org/wiki/Institutes_of_National_Importance)
 * Method: HTTP fetch + HTML table parsing with regex
 * Scope: All 173+ INIs across all categories (as of June 2026)
 *
 * Expected data fields from Wikipedia tables:
 * - Institute (name)
 * - City
 * - State
 * - Founded (year)
 * - Type (IIT, IIM, IIIT, AIIMS, NIT, IISER, NIPER, NID, SPA, NIFTEM, or University)
 * - Specialization
 */

import { RawRow, FetchContext } from "../types";
import { BaseScraper } from "./base";

/**
 * Parse Wikipedia HTML tables for INI institutions
 */
async function parseWikipediaINIs(
  html: string,
  ctx?: FetchContext
): Promise<RawRow[]> {
  const institutions: RawRow[] = [];
  const seen = new Set<string>();

  // Extract all table rows from the HTML
  // Wikipedia uses <table> with <tr> and <td> elements
  const tableRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi;

  let tableMatch;
  let tableIndex = 0;

  // Find all tables in the document
  while ((tableMatch = tableRowRegex.exec(html)) !== null) {
    const rowHtml = tableMatch[1];
    if (!rowHtml) continue;

    // Skip header rows (contain <th> tags)
    if (rowHtml.includes("<th")) continue;

    // Extract cells from row
    const cells: string[] = [];
    let cellMatch;
    cellRegex.lastIndex = 0;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const rawContent = cellMatch[1];
      if (!rawContent) continue;

      let cellContent = rawContent
        .replace(/<[^>]*>/g, "") // Remove HTML tags
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .trim();

      // Handle wiki links: [[Institute Name|Display Name]] → Display Name
      cellContent = cellContent.replace(/\[\[.*?\|([^\]]+)\]\]/g, "$1");
      cellContent = cellContent.replace(/\[\[([^\]]+)\]\]/g, "$1");

      // Clean up multiple spaces
      cellContent = cellContent.replace(/\s+/g, " ");

      if (cellContent) cells.push(cellContent);
    }

    // Parse cells based on table type and column count
    if (cells.length >= 2) {
      let name = "";
      let city = "";
      let state = "";
      let yearFounded = "";
      let type = "";
      let specialization = "";

      // Different table structures:
      // Most tables: Institute, City, State, Founded, Type, Specialization (6 cols)
      // Some: Institute, City, State, Founded, Type (5 cols)
      if (cells.length >= 4) {
        name = cells[0] || "";
        city = cells[1] || "";
        state = cells[2] || "";
        yearFounded = cells[3] || "";
        if (cells.length >= 5) type = cells[4] || "";
        if (cells.length >= 6) specialization = cells[5] || "";
      } else if (cells.length >= 3) {
        // Some rows: Institute, City, State
        name = cells[0] || "";
        city = cells[1] || "";
        state = cells[2] || "";
      } else if (cells.length >= 2) {
        // Fallback: at least name and state/city
        name = cells[0] || "";
        state = cells[1] || "";
      }

      // Validate: need name and state at minimum
      if (name && name.length >= 2 && state && state.length >= 2) {
        // Create composite key to avoid duplicates
        const key = `${name}|${state}`;

        if (!seen.has(key)) {
          seen.add(key);

          // Sanitize name: remove footnote markers like [N 1], [14], etc.
          name = name.replace(/\[[N\d\s,]*\]/g, "").trim();

          institutions.push({
            externalId: `ini-${name
              .toLowerCase()
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-+|-+$/g, "")}`,
            name,
            city: city || undefined,
            state,
            yearOfEstablishment: yearFounded || undefined,
            institution_type: type || undefined,
            specialization: specialization || undefined,
          } as RawRow);
        }
      }
    }
  }

  ctx?.logger?.info(`INI: Parsed ${institutions.length} institutions from Wikipedia`);
  return institutions;
}

/**
 * Scrape INI institutions from Wikipedia.
 * Fetches the Wikipedia article on Institutes of National Importance and parses all tables.
 */
export async function* scrapeINI(ctx?: FetchContext): AsyncIterable<RawRow> {
  const WIKIPEDIA_URL =
    "https://en.wikipedia.org/wiki/Institutes_of_National_Importance";

  ctx?.logger?.info(`INI: Fetching from Wikipedia: ${WIKIPEDIA_URL}`);

  try {
    const scraper = new BaseScraper();

    // Fetch the Wikipedia page
    const response = await scraper.fetchWithRetry(WIKIPEDIA_URL);
    if (!response) {
      ctx?.logger?.warn("INI: Failed to fetch Wikipedia page");
      return;
    }

    // Convert response to text
    const html = await response.text();
    if (!html) {
      ctx?.logger?.warn("INI: Empty response from Wikipedia");
      return;
    }

    // Parse the HTML and extract institutions
    const institutions = await parseWikipediaINIs(html, ctx);

    ctx?.logger?.info(`INI: Extracted ${institutions.length} institutions`);

    // Yield each institution
    for (const inst of institutions) {
      yield inst;
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx?.logger?.error(`INI: Error scraping Wikipedia: ${errorMsg}`);
  }
}
