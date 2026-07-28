/**
 * Discovery types for institution identification
 *
 * Resolves institution input to canonical identity through multi-layer resolver chain:
 * L0 - Cache (in-memory, 24h)
 * L1 - Institution resolver (matching/resolver with fuzzy matching)
 * L2 - Mirror resolver (registry/lookup)
 * L3+ - Wikidata resolver (SPARQL queries)
 */

/**
 * Per-candidate resolution details
 */
export interface ResolvedCandidate {
  id: number | string;
  name: string;
  type: "institution" | "registry" | "wikidata";
  confidence: number; // 0.0-1.0
  source?: string;
  score?: number;
}

/**
 * Resolved institution identity
 */
export interface ResolvedIdentity {
  // Primary identification
  institutionId?: number; // Local database ID
  registryEntryId?: string; // External registry ID
  canonicalName: string;
  type: "institution" | "registry" | "wikidata";

  // Location and authority
  state?: string;
  city?: string;
  country?: string;

  // Official presence
  officialUrl?: string;
  officialUrlConfidence?: number;

  // Quality metrics
  confidence: number; // 0.0-1.0 (weighted across all resolvers)
  needsReview: boolean; // >0.70 AND <0.90 OR missing official URL
  needsHumanReview: boolean; // <0.70

  // Resolution metadata
  resolverChain: string[]; // ["cache", "institutions", "mirror", "wikidata"]
  resolvedAt: number;
  ttl?: number;

  // Candidates (for UI and review)
  candidates: ResolvedCandidate[];

  // Website discovery metadata
  websiteDiscovery?: {
    searched: boolean;
    attempts: number;
    bestMatch?: SearchResult;
    titleMatchScore?: number;
  };
}

/**
 * Search result reference
 */
export interface SearchResult {
  title: string;
  url: string;
  domain?: string;
  description?: string;
}

/**
 * Identity resolver interface
 */
export interface IdentityResolver {
  /**
   * Resolver name (e.g., "cache", "institutions", "mirror", "wikidata")
   */
  name: string;

  /**
   * Resolve institution input to candidates
   */
  resolve(
    input: string,
    opts?: { limit?: number; timeout?: number }
  ): Promise<ResolvedCandidate[]>;

  /**
   * Health check
   */
  health(): Promise<boolean>;
}

/**
 * Discovery options
 */
export interface DiscoveryOptions {
  // Confidence thresholds
  highConfidenceThreshold?: number; // Default: 0.90
  reviewThreshold?: number; // Default: 0.70

  // Timeouts and budgets
  identityBudgetMs?: number; // Default: 400ms
  websiteBudgetMs?: number; // Default: 2000ms
  totalBudgetMs?: number; // Default: 6000ms

  // Website discovery
  discoverWebsite?: boolean; // Default: true
  maxWebRequests?: number; // Default: 3

  // Search options
  searchLanguage?: string; // Default: "en"
  safeSearch?: boolean; // Default: true
}

/**
 * Discovery step (for audit trail)
 */
export interface DiscoveryStep {
  resolver: string;
  timestamp: number;
  durationMs: number;
  success: boolean;
  candidatesFound: number;
  error?: string;
}

/**
 * Discovery run result (full audit trail)
 */
export interface DiscoveryRun {
  input: string;
  result: ResolvedIdentity;
  steps: DiscoveryStep[];
  totalDurationMs: number;
  budgetExceeded: boolean;
}
