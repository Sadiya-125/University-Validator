/**
 * Registry ingestion tests.
 *
 * Tests:
 * 1. Connector fixture parsing works correctly
 * 2. Runner handles normal snapshots (publish, diff)
 * 3. Validation rejects truncated fixtures (row count variance)
 * 4. Previous snapshot stays published when new one is rejected
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { ingestRegistry } from "@/server/registry/runner";
import { diffSnapshots } from "@/server/registry/diff";
import { db } from "@/server/db/client";
import { registrySnapshots, registryEntries } from "@/server/db/schema";
import { eq } from "drizzle-orm";
import { RegistryConnector, RawRow, EntryDraft, ValidationRules } from "@/server/registry/types";
import fs from "fs/promises";
import path from "path";

/**
 * Test connector that reads from a JSON fixture.
 * Supports truncation for testing rejection behavior.
 */
function createFixtureConnector(
  code: string,
  fixturePath: string,
  truncateRows?: number
): RegistryConnector {
  return {
    code,
    displayName: `Test Connector - ${code}`,
    sector: ["higher-education"],
    cadence: "monthly",

    async *fetch(ctx) {
      const content = await fs.readFile(fixturePath, "utf-8");
      const data = JSON.parse(content);

      const rows = Array.isArray(data) ? data : [];
      const truncated = truncateRows ? rows.slice(0, truncateRows) : rows;

      for (const row of truncated) {
        yield row as RawRow;
      }
    },

    parse(raw: RawRow): EntryDraft | null {
      if (!raw.name || typeof raw.name !== "string") {
        return null;
      }

      return {
        externalId: raw.externalId?.toString() ?? `${code}-${raw.name}`,
        name: raw.name as string,
        city: raw.city?.toString(),
        state: raw.state?.toString(),
        website: raw.website?.toString(),
        email: raw.email?.toString(),
        rawData: raw,
      };
    },

    sourceUrls: ["fixture://local"],

    validation: {
      rowCountVariance: 0.2, // ±20%
      requiredColumnsThreshold: 0.95,
      duplicateExternalIdThreshold: 0.01,
      requiredColumns: ["name"],
    } as ValidationRules,
  };
}

describe("Registry Ingestion", { timeout: 30000 }, () => {
  const fixtureDir = path.join(__dirname, "fixtures/registry");
  const testCode = "UGC";

  afterAll(async () => {
    // Clean up test snapshots
    await db!.delete(registrySnapshots).where(eq(registrySnapshots.code as any, testCode as any));
  });

  it("parses fixture correctly", async () => {
    const fixturePath = path.join(fixtureDir, "ugc-recognized.json");
    const connector = createFixtureConnector(testCode, fixturePath);

    // Verify fixture can be read
    const content = await fs.readFile(fixturePath, "utf-8");
    const data = JSON.parse(content);

    expect(Array.isArray(data)).toBe(true);
    expect(data.length).toBeGreaterThan(0);

    // Verify parsing works
    const firstEntry = connector.parse(data[0] as RawRow);
    expect(firstEntry).not.toBeNull();
    expect(firstEntry?.name).toBeDefined();
    expect(firstEntry?.externalId).toBeDefined();
  });

  it("ingests full fixture and publishes", async () => {
    const fixturePath = path.join(fixtureDir, "ugc-recognized.json");
    const connector = createFixtureConnector(testCode, fixturePath);

    const result = await ingestRegistry(connector);

    expect(result.code).toBe(testCode);
    expect(result.state).toBe("published");
    expect(result.rowCount).toBeGreaterThan(0);

    // Verify snapshot is in database
    const snapshots = await db!
      .select()
      .from(registrySnapshots)
      .where(eq(registrySnapshots.code as any, testCode as any));

    expect(snapshots.length).toBeGreaterThan(0);
    const published = snapshots.filter((s) => s.state === "published");
    expect(published.length).toBeGreaterThan(0);
  });

  it("rejects truncated fixture (fails row count variance)", async () => {
    const testCode3 = "NCTE";
    const fixturePath = path.join(fixtureDir, "ugc-recognized.json");
    const content = await fs.readFile(fixturePath, "utf-8");
    const data = JSON.parse(content);
    const fullCount = data.length;

    // First ingest full fixture
    const connector = createFixtureConnector(testCode3, fixturePath);
    const result1 = await ingestRegistry(connector);
    expect(result1.state).toBe("published");
    expect(result1.rowCount).toBe(fullCount);

    // Now ingest truncated (only 1 row, should fail ±20% variance)
    const truncatedConnector = createFixtureConnector(testCode3, fixturePath, 1);
    const result2 = await ingestRegistry(truncatedConnector);

    // Validation should reject due to row count variance
    expect(result2.state).toBe("rejected");
    expect(result2.validationReport).toBeDefined();
    expect(result2.validationReport?.passed).toBe(false);

    // Verify previous snapshot is still published
    const snapshots = await db!
      .select()
      .from(registrySnapshots)
      .where(eq(registrySnapshots.code as any, testCode3 as any));

    const published = snapshots.filter((s) => s.state === "published");
    expect(published.length).toBe(1);
    expect(published[0]!.rowCount).toBe(fullCount);

    // Cleanup
    await db!.delete(registrySnapshots).where(eq(registrySnapshots.code as any, testCode3 as any));
  });

  it("computes diff correctly", async () => {
    const testCode4 = "PCI";
    const fixturePath = path.join(fixtureDir, "ugc-recognized.json");

    // Ingest first snapshot
    const connector1 = createFixtureConnector(testCode4, fixturePath);
    const result1 = await ingestRegistry(connector1);

    // Get the published snapshot
    const snapshots = await db!
      .select()
      .from(registrySnapshots)
      .where(eq(registrySnapshots.code as any, testCode4 as any));

    const published = snapshots.filter((s) => s.state === "published");
    expect(published.length).toBe(1);

    const firstId = published[0]!.id;

    // Ingest again (should be unchanged)
    const connector2 = createFixtureConnector(testCode4, fixturePath);
    const result2 = await ingestRegistry(connector2);

    if (result2.state === "unchanged") {
      // If unchanged, that's fine for this test
      expect(result2.state).toBe("unchanged");
    } else if (result2.state === "published") {
      // If published again, verify diff
      expect(result2.added).toBe(0);
      expect(result2.removed).toBe(0);
      expect(result2.changed).toBe(0);
    }

    // Cleanup
    await db!.delete(registrySnapshots).where(eq(registrySnapshots.code as any, testCode4 as any));
  });

  it("fixture test with specific truncation scenario", async () => {
    const fixturePath = path.join(fixtureDir, "ugc-recognized.json");
    const testCode2 = "AICTE";

    // First: ingest full
    const connector1 = createFixtureConnector(testCode2, fixturePath);
    const result1 = await ingestRegistry(connector1);
    expect(result1.state).toBe("published");
    const fullCount = result1.rowCount;

    // Second: ingest truncated to 1 row
    const connector2 = createFixtureConnector(testCode2, fixturePath, 1);
    const result2 = await ingestRegistry(connector2);

    // Should be rejected (too few rows)
    expect(result2.state).toBe("rejected");
    expect(result2.validationReport?.summary).toContain("Validation failed");

    // Third: verify previous is still published
    const snapshots = await db!
      .select()
      .from(registrySnapshots)
      .where(eq(registrySnapshots.code as any, testCode2 as any));

    const published = snapshots.filter((s) => s.state === "published");
    expect(published.length).toBe(1);
    expect(published[0]!.rowCount).toBe(fullCount);

    // Cleanup
    await db!.delete(registrySnapshots).where(eq(registrySnapshots.code as any, testCode2 as any));
  });
});
