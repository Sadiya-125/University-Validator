/**
 * PCI Scrapers
 *
 * Downloads approved pharmacy institution data from PCI (Pharmacy Council of India).
 * Source: https://www.pci.nic.in/
 * Method: HTTP GET + DOM parsing (static HTML tables, no JavaScript)
 * Returns: AsyncIterable<RawRow>
 *
 * Approved URLs:
 * - Degree institutes
 * - Diploma colleges
 * - M.Pharm institutes
 * - Bridge courses
 * - PharmD programs
 */

import { RawRow, FetchContext } from "../types";
import { BaseScraper } from "./base";

const APPROVED_URLS = [
  "https://www.pci.nic.in/approved_degree_institutes_us__12.html",
  "https://www.pci.nic.in/approved_colleges_diplom_us_12.html",
  "https://www.pci.nic.in/approved_institutes_mpharm.html",
  "https://www.pci.nic.in/Diploma_institutions_only__conduct.html",
  "https://www.pci.nic.in/degre_institutes-only_for-conduct.html",
  "https://www.pci.nic.in/ApprovedInstitutionsForConductofPharmD.html",
  "https://www.pci.nic.in/ApprovedInstitutionsForConductofPharm.D_PostBaccalaureate.html",
  "https://www.pci.nic.in/approved_institutes_bridge-courses_6.html",
];

/**
 * Scrape PCI approved pharmacy institutions
 */
export async function* scrapePCIInstitutions(
  ctx?: FetchContext
): AsyncIterable<RawRow> {
  const scraper = new BaseScraper();
  ctx?.logger?.info(`PCI Institutions: Starting scrape for approved pharmacy institutes`);

  const allRows: any[] = [];
  const seenInstitutions = new Set<string>();

  try {
    // Fetch and parse each approved URL
    for (const url of APPROVED_URLS) {
      ctx?.logger?.info(`PCI Institutions: Fetching ${url}`);

      try {
        const response = await scraper.fetchWithRetry(url);
        const html = await response.text();

        const rows = extractInstitutionsFromHtml(html, url, ctx);
        ctx?.logger?.info(
          `PCI Institutions: Extracted ${rows.length} rows from ${url}`
        );

        // Add rows, avoiding duplicates based on institution name + state
        for (const row of rows) {
          const key = `${row.name}|${row.state || ""}`;
          if (!seenInstitutions.has(key)) {
            allRows.push(row);
            seenInstitutions.add(key);
          }
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        ctx?.logger?.warn(
          `PCI Institutions: Error processing ${url}: ${errorMsg}`
        );
      }
    }

    ctx?.logger?.info(
      `PCI Institutions: Found ${allRows.length} total unique institutions`
    );

    // Yield each row
    for (let i = 0; i < allRows.length; i++) {
      const row = allRows[i];

      // Generate externalId from PCI Code if available, otherwise from name
      const externalId = row.pciCode
        ? `pci-${row.pciCode}`
        : `pci-${row.name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "")}`;

      yield {
        name: row.name,
        state: row.state,
        externalId,
        institutionType: row.institutionType,
        programType: row.programType,
        pciCode: row.pciCode,
        approvalInfo: row.approvalInfo,
        examinationAuthority: row.examinationAuthority,
      } as RawRow;

      await scraper.rateLimit();
    }

    ctx?.logger?.info(`PCI Institutions: Scrape completed`);
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    ctx?.logger?.warn(`PCI Institutions: Failed to fetch - ${errorMsg}`);
    throw error;
  }
}

/**
 * Extract institutions from PCI HTML page
 */
function extractInstitutionsFromHtml(
  html: string,
  url: string,
  ctx?: FetchContext
): any[] {
  const institutions: any[] = [];

  // Simple regex to find table rows
  const tableRowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  const cellRegex = /<(?:td|th)[^>]*>([\s\S]*?)<\/(?:td|th)>/gi;

  let rowMatch;
  const tableRows: string[] = [];

  // Extract all table rows
  while ((rowMatch = tableRowRegex.exec(html)) !== null) {
    if (rowMatch[1]) {
      tableRows.push(rowMatch[1]);
    }
  }

  for (let i = 0; i < tableRows.length; i++) {
    const rowHtml = tableRows[i];
    if (!rowHtml) continue;
    const cells: string[] = [];

    let cellMatch;
    cellRegex.lastIndex = 0; // Reset regex state

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      let cellContent = cellMatch[1] || "";
      // Remove HTML tags and decode entities
      cellContent = cellContent
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .trim();

      if (cellContent) {
        cells.push(cellContent);
      }
    }

    // Skip header rows and empty rows
    if (cells.length < 2 || !cells[0]) continue;

    // Skip rows that appear to be headers
    const firstCell = cells[0].toLowerCase();
    if (
      firstCell.includes("s.no") ||
      firstCell.includes("sl.") ||
      firstCell.includes("name") ||
      firstCell.includes("institute")
    ) {
      continue;
    }

    // Parse based on number of cells (different URLs have different formats)
    let institution: any = null;

    if (cells.length >= 4) {
      // PCI format: S.No | PCI Code | State | Name of Institution | Approval Info | Examining Authority
      // cells[0] = S.No
      // cells[1] = PCI Code (or Name if old format)
      // cells[2] = State (or could be Name)
      // cells[3] = Name of Institution (or State)

      let slNo: string;
      let pciCode: string = "";
      let state: string = "";
      let name: string = "";
      let approvalInfo: string = "";
      let examinationAuthority: string = "";

      // Detect format: if cells[1] is numeric (PCI Code), use new format; otherwise use old format
      const cell1IsNumeric = cells[1] && /^\d+$/.test(cells[1].trim());

      if (cell1IsNumeric && cells.length >= 4) {
        // New format: S.No | PCI Code | State | Name | Approval | Authority
        slNo = cells[0] || "";
        pciCode = cells[1] || "";
        state = cells[2] || "";
        name = cells[3] || "";
        approvalInfo = cells[4] || "";
        examinationAuthority = cells[5] || "";
      } else {
        // Old/Alternative format: S.No | Name | State | [Extra]
        slNo = cells[0] || "";
        name = cells[1] || "";
        state = cells[2] || "";
        approvalInfo = cells[3] || "";
        examinationAuthority = cells[4] || "";
      }

      if (!name || name.length < 2) continue;

      institution = {
        name: name.trim(),
        state: state && state !== "-" ? state.trim() : undefined,
        pciCode: pciCode && pciCode !== "-" ? pciCode.trim() : undefined,
        approvalInfo: approvalInfo && approvalInfo !== "-" ? approvalInfo.trim() : undefined,
        examinationAuthority:
          examinationAuthority && examinationAuthority !== "-"
            ? examinationAuthority.trim()
            : undefined,
        institutionType: "College",
        programType: determineProgramType(url),
      };
    }

    if (institution) {
      institutions.push(institution);
    }
  }

  return institutions;
}

/**
 * Determine program type based on URL
 */
function determineProgramType(url: string): string {
  if (url.includes("degree")) return "Degree";
  if (url.includes("diploma")) return "Diploma";
  if (url.includes("mpharm")) return "M.Pharm";
  if (url.includes("PharmD")) return "PharmD";
  if (url.includes("bridge")) return "Bridge Course";
  return "Pharmacy";
}
