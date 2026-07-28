/**
 * Reasoning prompt builder (versioned)
 *
 * Produces qualitative judgment about extracted facts.
 * Designed to be separate from scoring (which is arithmetic).
 */

import type { ExtractedFacts } from "../schemas";
import type { LLMPayload } from "../../evidence/types";

export const version = "1.0.0";

/**
 * Build reasoning prompt
 */
export function build(facts: ExtractedFacts, payload: LLMPayload): string {
  return `You are an expert analyst evaluating the credibility and consistency of information about an educational institution.

## FACTS EXTRACTED

Institution: ${facts.officialName}
Type: ${facts.institutionType || "(unknown)"}
Established: ${facts.establishedYear || "(unknown)"}
Address: ${facts.address ? formatAddress(facts.address) : "(not provided)"}
Website: ${facts.website || "(not provided)"}
Approvals: ${facts.approvals.join(", ") || "(none found)"}

## TASK

Analyze the evidence and extracted facts to produce a qualitative judgment.

### What to do:

1. **Identify key findings:** What are the most important factual claims supported by high-quality evidence?

2. **Spot contradictions:** Are there conflicting statements in the evidence? Report them clearly.

3. **Note missing evidence:** What important information should be verified but isn't in the evidence?

4. **Flag red flags:** Are there concerning patterns, unusual gaps, or suspicious details?
   - For example: claimed to be UGC-affiliated but no UGC registry entry
   - Website is very new or doesn't mention accreditations that should be there
   - Conflicting approval dates or changing names

5. **Brief reasoning:** Synthesize your findings in 2-3 sentences (max 1200 characters).

### What NOT to do:

- Do NOT assign a numeric score or confidence level
- Do NOT make a pass/fail judgment—that's arithmetic, not analysis
- Do NOT cite evidence you weren't given (only use the refs e1, e2, etc.)
- Do NOT invent missing facts

## EVIDENCE QUALITY SUMMARY

- **Mirror tier** (1.0 quality): Registry snapshots, official database entries—highest reliability
- **API tier** (0.4-0.75 quality): Public APIs, websites, knowledge bases—moderate reliability
- **Live tier** (0.9 quality): Direct checks with authorities—high reliability but may be stale
- **Unavailable**: Source couldn't be checked

The presence of evidence from mirror or live tiers is strong. API-only evidence is weaker.

## OUTPUT FORMAT

Provide your judgment in this exact structure:
- Key findings (list of statements with their evidentiary basis)
- Contradictions (if any)
- Missing evidence (important gaps)
- Reasoning (2-3 sentences, max 1200 chars)
- Red flags (concerning patterns or omissions)`;
}

/**
 * Format address object for display
 */
function formatAddress(addr: any): string {
  const parts: string[] = [];

  if (addr.street) parts.push(addr.street);
  if (addr.city) parts.push(addr.city);
  if (addr.state) parts.push(addr.state);
  if (addr.postal_code) parts.push(addr.postal_code);
  if (addr.country) parts.push(addr.country);

  return parts.join(", ") || "(incomplete address)";
}
