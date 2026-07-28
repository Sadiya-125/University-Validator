/**
 * LLM schemas for extraction and reasoning
 *
 * FLAT and SHALLOW structures for Qwen (8B model) compatibility.
 * Every field carries sourceRefs pointing at evidence refs (e1, e2, ...).
 * NO nested objects or long enums.
 * ValidationJudgment contains NO numbers (scoring is separate, arithmetic).
 */

import { z } from "zod";

/**
 * Address structure (flat)
 */
export const AddressSchema = z.object({
  street?: z.string().optional(),
  city: z.string(),
  state: z.string().optional(),
  postal_code?: z.string().optional(),
  country: z.string().default("India"),
  sourceRefs: z.array(z.string()).describe("Evidence refs (e1, e2, ...)"),
});

export type Address = z.infer<typeof AddressSchema>;

/**
 * Contact information (flat)
 */
export const ContactsSchema = z.object({
  emails: z.array(z.string().email()).default([]),
  phones: z.array(z.string()).default([]),
  website?: z.string().url().optional(),
  sourceRefs: z.array(z.string()).describe("Evidence refs (e1, e2, ...)"),
});

export type Contacts = z.infer<typeof ContactsSchema>;

/**
 * Social media links (flat)
 */
export const SocialLinksSchema = z.object({
  facebook?: z.string().url().optional(),
  twitter?: z.string().url().optional(),
  linkedin?: z.string().url().optional(),
  youtube?: z.string().url().optional(),
  instagram?: z.string().url().optional(),
  sourceRefs: z.array(z.string()).describe("Evidence refs (e1, e2, ...)"),
});

export type SocialLinks = z.infer<typeof SocialLinksSchema>;

/**
 * Extracted facts schema (FLAT, no nesting)
 *
 * Every field carries sourceRefs to evidence items.
 * Strings only (no structured objects except Address, Contacts, SocialLinks).
 * All optional except officialName.
 */
export const ExtractedFactsSchema = z.object({
  // Core identity
  officialName: z.string().describe("Official name of the institution"),
  officialNameRefs: z.array(z.string()).describe("Evidence refs for official name"),

  aliases: z.array(z.string()).default([]).describe("Known alternate names"),
  aliasesRefs: z.array(z.string()).default([]),

  institutionType: z.string().optional().describe("Type: engineering, medical, university, etc."),
  institutionTypeRefs: z.array(z.string()).default([]),

  establishedYear: z.number().int().optional().describe("Year founded (if available)"),
  establishedYearRefs: z.array(z.string()).default([]),

  // Location and contact
  address: AddressSchema.optional(),
  contacts: ContactsSchema.optional(),
  website: z.string().url().optional().describe("Official website URL"),
  websiteRefs: z.array(z.string()).default([]),

  // Affiliations and accreditations (flat strings, not objects)
  affiliatedTo: z.array(z.string()).default([]).describe("Parent organizations or affiliations"),
  affiliatedToRefs: z.array(z.string()).default([]),

  approvals: z.array(z.string()).default([]).describe("Approval statuses (e.g., 'AICTE approved')"),
  approvalsRefs: z.array(z.string()).default([]),

  accreditations: z.array(z.string()).default([]).describe("Accreditations and recognitions"),
  accreditationsRefs: z.array(z.string()).default([]),

  // Social
  socialLinks: SocialLinksSchema.optional(),

  // Conflicts (flat strings)
  conflicts: z.array(z.string()).default([]).describe("Contradictions or conflicting information"),
  conflictsRefs: z.array(z.string()).default([]),

  // Metadata
  extractedAt: z.number().describe("Unix timestamp of extraction"),
  confidence: z.number().min(0).max(1).describe("Overall confidence (0-1)"),
});

export type ExtractedFacts = z.infer<typeof ExtractedFactsSchema>;

/**
 * Validation judgment schema (FLAT, no numbers)
 *
 * Contains qualitative findings only.
 * NO confidence scores, NO verdict numbers.
 * Scoring is separate and arithmetic (in scoring module).
 */
export const ValidationJudgmentSchema = z.object({
  // Findings (flat strings)
  keyFindings: z.array(z.string()).describe("Main factual findings from evidence"),

  contradictions: z.array(z.string()).default([]).describe("Conflicting evidence items"),

  missingEvidence: z.array(z.string()).default([]).describe("Information that should be verified but isn't"),

  // Reasoning (capped at 1200 chars to avoid verbosity)
  reasoning: z
    .string()
    .max(1200)
    .describe("Brief reasoning about findings and contradictions"),

  // Red flags (flat strings, no severity numbers)
  redFlags: z.array(z.string()).default([]).describe("Concerning patterns or anomalies"),

  // Metadata
  judgedAt: z.number().describe("Unix timestamp of judgment"),
});

export type ValidationJudgment = z.infer<typeof ValidationJudgmentSchema>;

/**
 * Combined analysis result (for single LLM call if combined approach used)
 */
export const AnalysisResultSchema = z.object({
  facts: ExtractedFactsSchema,
  judgment: ValidationJudgmentSchema,
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;
