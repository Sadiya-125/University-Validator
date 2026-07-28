/**
 * Performance benchmark for institution matching
 *
 * Generates synthetic institution data and measures matching performance.
 * Reports p50 (median) and p95 latency metrics.
 *
 * Target: p95 <400ms at 100k registry rows (per MASTER-PLAN)
 *
 * Usage: tsx scripts/bench-matching.ts
 */

import { resolveInstitution } from "@/server/matching/resolver";
import { getEmbeddingProvider } from "@/server/matching/embeddings";

/**
 * Synthetic test case with variations
 */
interface TestCase {
  input: string;
  expected?: string;
  category: "exact" | "abbreviation" | "misspelling" | "variant";
}

/**
 * Generate synthetic test cases
 */
function generateTestCases(count: number): TestCase[] {
  const bases = [
    "Indian Institute of Technology Bombay",
    "National Institute of Technology Warangal",
    "Birla Institute of Technology and Science Pilani",
    "All India Institute of Medical Sciences Delhi",
    "Jawaharlal Nehru University",
    "Delhi University",
    "Banaras Hindu University",
    "Aligarh Muslim University",
    "University of Delhi",
    "Osmania University",
  ];

  const variations = [
    // Abbreviations
    (name: string) => name.replace(/Institute/g, "Inst."),
    (name: string) => name.replace(/Technology/g, "Tech"),
    (name: string) => name.replace(/University/g, "Univ."),

    // Misspellings
    (name: string) => name.replace(/Bombay/, "Mumbay"),
    (name: string) => name.replace(/Warangal/, "Warangel"),
    (name: string) => name.replace(/Pilani/, "Palani"),

    // Place variants
    (name: string) => name.replace(/Bombay/, "Mumbai"),
    (name: string) => name.replace(/Delhi/, "New Delhi"),

    // All caps
    (name: string) => name.toUpperCase(),

    // All lowercase
    (name: string) => name.toLowerCase(),
  ];

  const testCases: TestCase[] = [];

  for (let i = 0; i < count; i++) {
    const base = bases[i % bases.length]!;
    const variationFn = variations[i % variations.length]!;
    const input = variationFn(base);

    let category: "exact" | "abbreviation" | "misspelling" | "variant" =
      "variant";
    if (
      input.includes("Inst.") ||
      input.includes("Tech") ||
      input.includes("Univ.")
    ) {
      category = "abbreviation";
    } else if (
      input.includes("Mumbay") ||
      input.includes("Warangel") ||
      input.includes("Palani")
    ) {
      category = "misspelling";
    } else if (input === base) {
      category = "exact";
    }

    testCases.push({
      input,
      expected: base,
      category,
    });
  }

  return testCases;
}

/**
 * Run matching benchmark
 */
async function benchmark(): Promise<void> {
  console.log("🏃 Institution Matching Benchmark\n");

  const embeddingProvider = await getEmbeddingProvider("fake");

  // Generate test cases
  const testCases = generateTestCases(100);
  const categoryBreakdown: Record<
    "exact" | "abbreviation" | "misspelling" | "variant",
    number
  > = {
    exact: 0,
    abbreviation: 0,
    misspelling: 0,
    variant: 0,
  };

  testCases.forEach((tc) => {
    categoryBreakdown[tc.category]++;
  });

  console.log(`Test Configuration:`);
  console.log(`  Total test cases: ${testCases.length}`);
  console.log(
    `  Breakdown: ${JSON.stringify(categoryBreakdown, null, 2).replace(/\n/g, "\n  ")}`
  );
  console.log(``);

  // Run matching for each test case and measure latency
  const latencies: number[] = [];
  const results = {
    successful: 0,
    noMatch: 0,
    errors: 0,
  };

  console.log(`Running matches...`);
  for (const testCase of testCases) {
    const startTime = performance.now();
    try {
      const candidates = await resolveInstitution(testCase.input, {
        embeddingProvider,
        limit: 5,
        threshold: 0.3,
      });

      const endTime = performance.now();
      const latency = endTime - startTime;
      latencies.push(latency);

      if (candidates.length > 0) {
        results.successful++;
      } else {
        results.noMatch++;
      }
    } catch (error) {
      results.errors++;
      console.error(`  Error resolving "${testCase.input}":`, error);
    }
  }

  // Calculate statistics
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)]!;
  const p95 = latencies[Math.floor(latencies.length * 0.95)]!;
  const p99 = latencies[Math.floor(latencies.length * 0.99)]!;
  const mean = latencies.reduce((a, b) => a + b, 0) / latencies.length;
  const min = latencies[0]!;
  const max = latencies[latencies.length - 1]!;

  // Print results
  console.log(`\n📊 Latency Metrics (ms):`);
  console.log(`  Min:    ${min.toFixed(2)}`);
  console.log(`  P50:    ${p50.toFixed(2)}`);
  console.log(`  P95:    ${p95.toFixed(2)}`);
  console.log(`  P99:    ${p99.toFixed(2)}`);
  console.log(`  Mean:   ${mean.toFixed(2)}`);
  console.log(`  Max:    ${max.toFixed(2)}`);

  console.log(`\n✅ Results:`);
  console.log(`  Successful: ${results.successful}/${testCases.length}`);
  console.log(`  No match:   ${results.noMatch}/${testCases.length}`);
  console.log(`  Errors:     ${results.errors}/${testCases.length}`);

  // Check if targets are met
  console.log(`\n🎯 Performance Targets:`);
  const target95 = 400; // 400ms target
  const p95Met = p95 < target95;
  console.log(
    `  P95 < ${target95}ms: ${p95Met ? "✅ PASS" : "❌ FAIL"} (actual: ${p95.toFixed(2)}ms)`
  );

  // Throughput calculation
  const totalTime = latencies.reduce((a, b) => a + b, 0);
  const throughputPerSecond = (testCases.length / (totalTime / 1000)).toFixed(1);
  console.log(`  Throughput: ${throughputPerSecond} resolutions/sec`);

  process.exit(p95Met ? 0 : 1);
}

// Run benchmark
benchmark().catch((error) => {
  console.error("Benchmark failed:", error);
  process.exit(1);
});
