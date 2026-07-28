/**
 * Extraction prompt builder (versioned)
 *
 * Extracts structured facts from evidence payload.
 * Designed for flat/shallow schemas (Qwen compatibility).
 */

import type { LLMPayload } from "../../evidence/types";

export const version = "1.0.0";

/**
 * Build extraction prompt
 */
export function build(payload: LLMPayload): string {
  const evidenceText = formatEvidence(payload);

  return `You are an expert analyst verifying information about an educational institution.

Your task: Extract structured facts about "${payload.institution_name}" from the evidence provided below.

## CRITICAL INSTRUCTIONS

1. **Use ONLY the evidence provided.** Do not make assumptions or use external knowledge.

2. **Always cite sources.** Every fact must be traced to evidence references (e1, e2, etc.) from the list below.

3. **For contradictions:** If evidence conflicts, report both statements with their source refs.

4. **Keep it factual.** Do not interpret or extrapolate. Report what the evidence explicitly states.

5. **Missing data:** If information is not in the evidence, leave the field empty. Do NOT guess.

## EVIDENCE

${evidenceText}

## EXTRACTION TASK

Extract the following structured facts about the institution:
- Official name (as stated in official documents or authoritative registries)
- Aliases (alternate names it's known by)
- Institution type (e.g., engineering college, medical university, school)
- Year established (if stated)
- Address (street, city, state, postal code)
- Contact info (emails, phones, website)
- Affiliation status (parent organizations, umbrella bodies)
- Approvals/recognitions (AICTE, UGC, NAAC, etc.)
- Accreditations
- Social media links
- Any contradictions in the evidence

For EVERY piece of information, include the evidence ref(s) that support it (e.g., sourceRefs: ["e3", "e5"]).

If a field has no evidence, leave it empty—do NOT invent data.`;
}

/**
 * Format evidence for LLM consumption
 */
function formatEvidence(payload: LLMPayload): string {
  let result = "### Evidence List\n\n";

  for (const item of payload.evidence) {
    result += `**${item.ref}** [${item.source}/${item.tier}] Quality: ${(item.quality * 100).toFixed(0)}%\n`;

    if (item.text) {
      // Truncate long text
      const truncated = item.text.length > 200 ? item.text.substring(0, 200) + "…" : item.text;
      result += `Text: "${truncated}"\n`;
    }

    if (item.url) {
      result += `URL: ${item.url}\n`;
    }

    if (item.claim) {
      result += `Claim: ${item.claim}\n`;
    }

    result += "\n";
  }

  return result;
}
