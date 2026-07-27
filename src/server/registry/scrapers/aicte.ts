/**
 * AICTE Scraper
 *
 * Downloads raw institution data from AICTE PHP API.
 * Returns AsyncIterable<RawRow> - nothing else.
 * No parsing, no validation, no database operations.
 *
 * Source: https://facilities.aicte-india.org/dashboard/pages/php/approvedinstituteserver.php
 * Method: GET with query parameters
 * Returns: JSON array of institution records
 */

import { RawRow, FetchContext } from "../types";
import { BaseScraper } from "./base";

const STATES = [
  "Andaman and Nicobar Islands",
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chandigarh",
  "Chhattisgarh",
  "Dadra and Nagar Haveli",
  "Daman and Diu",
  "Delhi",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jammu and Kashmir",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Orissa",
  "Puducherry",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
];

const API_BASE = "https://facilities.aicte-india.org/dashboard/pages/php/approvedinstituteserver.php";
const YEAR = "2026-2027";

/**
 * Scrape AICTE institution data for all states.
 * Yields raw rows as-is from the API.
 * Handles rate limiting and retries internally.
 */
export async function* scrapeAICTE(
  ctx?: FetchContext
): AsyncIterable<RawRow> {
  const scraper = new BaseScraper();

  ctx?.logger?.info(`AICTE: Starting scrape for year ${YEAR}`);

  for (const state of STATES) {
    try {
      ctx?.logger?.info(`AICTE: Fetching institutions for state: ${state}`);

      // Build URL with query parameters
      const url = new URL(API_BASE);
      url.searchParams.set("method", "fetchdata");
      url.searchParams.set("year", YEAR);
      url.searchParams.set("state", state);
      url.searchParams.set("program", "1");
      url.searchParams.set("level", "1");
      url.searchParams.set("institutiontype", "1");
      url.searchParams.set("Women", "1");
      url.searchParams.set("Minority", "1");
      url.searchParams.set("course", "1");

      // Fetch with retries
      const response = await scraper.fetchWithRetry(url.toString());
      const data = await response.json();

      if (!Array.isArray(data)) {
        ctx?.logger?.warn(`AICTE: Expected array, got ${typeof data} for state ${state}`);
        continue;
      }

      ctx?.logger?.info(`AICTE: Received ${data.length} records for state ${state}`);

      // Yield each row as-is from API
      for (const row of data) {
        yield {
          aicteId: row[0],
          name: row[1],
          address: row[2],
          district: row[3],
          institutionType: row[4],
          women: row[5],
          minority: row[6],
          pid: row[7],
          state: state,
        } as RawRow;
      }

      // Respect rate limiting between state requests
      await scraper.rateLimit();
    } catch (error) {
      ctx?.logger?.error(
        `AICTE: Failed to fetch state ${state}`,
        error instanceof Error ? error : new Error(String(error))
      );
      // Continue with next state - don't fail entire scrape
    }
  }

  ctx?.logger?.info(`AICTE: Scrape completed`);
}
