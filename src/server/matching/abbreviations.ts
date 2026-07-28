/**
 * Abbreviation expansion for Indian institutions
 *
 * Maps common abbreviations to their full forms and provides pattern-based
 * expansion for institutional names. Examples:
 * - "IIT Bombay" → "Indian Institute of Technology Bombay"
 * - "BITS Pilani" → "Birla Institute of Technology and Science Pilani"
 * - "NIT Trichy" → "National Institute of Technology Tiruchirappalli"
 *
 * Seeded from LEGACY-NOTES.md with extensions to 120+ entries.
 * Pure function with no side effects.
 */

/**
 * Abbreviations dictionary: uppercase abbreviations → full forms
 * Sorted by frequency (premier institutes first)
 */
export const ABBREVIATIONS = {
  // ── Premier Institutes ──
  IIT: "Indian Institute of Technology",
  IIM: "Indian Institute of Management",
  IISc: "Indian Institute of Science",
  IISER: "Indian Institute of Science Education and Research",
  NIT: "National Institute of Technology",
  IIIT: "Indian Institute of Information Technology",

  // ── Medical ──
  AIIMS: "All India Institute of Medical Sciences",
  JIPMER: "Jawaharlal Institute of Postgraduate Medical Education and Research",
  PGIMER: "Post Graduate Institute of Medical Education and Research",
  CMC: "Christian Medical College",
  MAMC: "Maulana Azad Medical College",
  LHMC: "Lady Hardinge Medical College",
  UCMS: "University College of Medical Sciences",
  KGMC: "King George's Medical College",
  KGMU: "King George's Medical University",
  VMMC: "Vardhman Mahavir Medical College",
  GMC: "Government Medical College",
  ESIC: "ESIC Medical College",

  // ── Technology / Engineering ──
  BITS: "Birla Institute of Technology and Science",
  VIT: "Vellore Institute of Technology",
  SRM: "SRM Institute of Science and Technology",
  DTU: "Delhi Technological University",
  NSUT: "Netaji Subhas University of Technology",

  // ── Delhi Universities ──
  DU: "University of Delhi",
  JNU: "Jawaharlal Nehru University",
  IIITD: "Indraprastha Institute of Information Technology Delhi",
  JMI: "Jamia Millia Islamia",

  // ── Law ──
  NLU: "National Law University",
  NLUD: "National Law University Delhi",
  NALSAR: "NALSAR University of Law",
  NLSIU: "National Law School of India University",

  // ── Regional Universities ──
  BU: "Bangalore University",
  MU: "Mumbai University",
  CU: "Calcutta University",
  AU: "Anna University",
  OU: "Osmania University",
  PU: "Panjab University",
  BHU: "Banaras Hindu University",
  HU: "Hyderabad University",
  AMU: "Aligarh Muslim University",

  // ── Research Institutes ──
  TISS: "Tata Institute of Social Sciences",
  TIFR: "Tata Institute of Fundamental Research",
  ISI: "Indian Statistical Institute",
  IIST: "Indian Institute of Space Science and Technology",
  IIFT: "Indian Institute of Foreign Trade",
  IRMA: "Institute of Rural Management Anand",

  // ── NITs (All 31) ──
  MANIT: "Maulana Azad National Institute of Technology",
  MNIT: "Malaviya National Institute of Technology",
  SVNIT: "Sardar Vallabhbhai National Institute of Technology",
  NITK: "National Institute of Technology Karnataka",
  NITW: "National Institute of Technology Warangal",
  NITT: "National Institute of Technology Tiruchirappalli",
  NITC: "National Institute of Technology Calicut",
  NITR: "National Institute of Technology Rourkela",
  NITD: "National Institute of Technology Durgapur",
  NITJ: "National Institute of Technology Jalandhar",
  NITKKR: "National Institute of Technology Kurukshetra",
  NITS: "National Institute of Technology Silchar",
  NITA: "National Institute of Technology Agartala",
  NITM: "National Institute of Technology Meghalaya",
  NITP: "National Institute of Technology Patna",
  NITGOA: "National Institute of Technology Goa",
  NITUK: "National Institute of Technology Uttarakhand",
  NITAP: "National Institute of Technology Arunachal Pradesh",
  NITMGR: "National Institute of Technology Nagaland",
  NITSKR: "National Institute of Technology Sikkim",

  // ── IIITs ──
  IIITB: "International Institute of Information Technology Bangalore",
  IIITH: "International Institute of Information Technology Hyderabad",
  IIITM: "Indian Institute of Information Technology and Management",
  DAIICT: "Dhirubhai Ambani Institute of Information and Communication Technology",
  LNMIIT: "The LNM Institute of Information Technology",

  // ── Other Private/Central ──
  UPES: "University of Petroleum and Energy Studies",
  LPU: "Lovely Professional University",
  KIIT: "Kalinga Institute of Industrial Technology",
  GITAM: "Gandhi Institute of Technology and Management",
  SASTRA: "Shanmugha Arts Science Technology and Research Academy",
  SATHYABAMA: "Sathyabama Institute of Science and Technology",

  // ── Central Universities ──
  CUJ: "Central University of Jharkhand",
  CUB: "Central University of Bihar",
  CUG: "Central University of Gujarat",
  CUK: "Central University of Karnataka",
  CUP: "Central University of Punjab",
  CURAJ: "Central University of Rajasthan",
  CUTN: "Central University of Tamil Nadu",

  // ── Northeast Universities ──
  NEHU: "North Eastern Hill University",
  PONDY: "Pondicherry University",
  SU: "Sikkim University",
  TU: "Tezpur University",
  MANU: "Manipur University",
  ASU: "Assam University",
  MGU: "Mahatma Gandhi University",

  // ── Technological Universities ──
  CBIT: "Chaitanya Bharathi Institute of Technology",
  JNTU: "Jawaharlal Nehru Technological University",
  JNTUH: "Jawaharlal Nehru Technological University Hyderabad",
  JNTUK: "Jawaharlal Nehru Technological University Kakinada",
  JNTUA: "Jawaharlal Nehru Technological University Anantapur",
  MGIT: "Mahatma Gandhi Institute of Technology",
  GRIET: "Gokaraju Rangaraju Institute of Engineering and Technology",
  NMIT: "Nitte Meenakshi Institute of Technology",
  BMSIT: "BMS Institute of Technology",
  PESIT: "PES Institute of Technology",
  MSRIT: "MS Ramaiah Institute of Technology",

  // ── Agricultural Universities ──
  GBPUAT: "Govind Ballabh Pant University of Agriculture and Technology",
  PAU: "Punjab Agricultural University",
  CSAU: "Chandra Shekhar Azad University of Agriculture and Technology",
  BAU: "Birsa Agricultural University",
  JAU: "Junagadh Agricultural University",
  MPUAT: "Maharana Pratap University of Agriculture and Technology",
  NDUAT: "Narendra Deva University of Agriculture and Technology",
  RAU: "Rajendra Agricultural University",
  SDAU: "Sardarkrushinagar Dantiwada Agricultural University",
  UAS: "University of Agricultural Sciences",

  // ── Veterinary Universities ──
  KVAFSU: "Karnataka Veterinary Animal and Fisheries Sciences University",
  MAFSU: "Maharashtra Animal and Fishery Sciences University",
  RAJUVAS: "Rajasthan University of Veterinary and Animal Sciences",
  SVVU: "Sri Venkateswara Veterinary University",
  TANUVAS: "Tamil Nadu Veterinary and Animal Sciences University",
  KVASU: "Kerala Veterinary and Animal Sciences University",

  // ── Other Universities ──
  CUSAT: "Cochin University of Science and Technology",
  KU: "Kakatiya University",
  SKU: "Sri Krishnadevaraya University",
  SVU: "Sri Venkateswara University",
  SKUAST: "Sher-e-Kashmir University of Agricultural Sciences and Technology",

  // ── Krishi Vishwavidyalayas ──
  JNKVV: "Jawaharlal Nehru Krishi Vishwavidyalaya",
  IGKV: "Indira Gandhi Krishi Vishwavidyalaya",
  BCKV: "Bidhan Chandra Krishi Viswavidyalaya",
  UBKV: "Uttar Banka Krishi Viswavidyalaya",
  WBUAFS: "West Bengal University of Animal and Fishery Sciences",

  // ── State Universities (Haryana) ──
  GJU: "Guru Jambheshwar University",
  CDLU: "Chaudhary Devi Lal University",
  MDU: "Maharshi Dayanand University",

  // ── Additional Engineering Institutes (Extensions for 120+) ──
  "VNR VJIET": "VNR Vignana Jyothi Institute of Engineering and Technology",
  SRKM: "Sri Ramakrishna Group of Institutions",
  SMIT: "Sikkim Manipal Institute of Technology",
  Amrita: "Amrita Vishwa Vidyapeetham",
  Manipal: "Manipal Academy of Higher Education",
  Symbiosis: "Symbiosis International University",
  "Christ University": "Christ University",
  FLAME: "FLAME University",
  ICFAI: "ICFAI University",
} as const;

/**
 * Reverse mapping: full form → abbreviation (for contraction)
 * Used for finding existing abbreviations in text
 */
const FULL_TO_ABBR = Object.fromEntries(
  Object.entries(ABBREVIATIONS).map(([abbr, full]) => [
    full.toLowerCase(),
    abbr,
  ])
) as Record<string, string>;

/**
 * Patterns for abbreviation expansion
 * Maps patterns like "IIT <city>" to expansion templates
 */
const EXPANSION_PATTERNS = [
  // "IIT <city>" → "Indian Institute of Technology <city>"
  {
    pattern: /^(iit)\s+(.+)$/i,
    expand: (_: string, abbr: string, suffix: string) =>
      `${ABBREVIATIONS["IIT" as keyof typeof ABBREVIATIONS]} ${suffix}`,
  },
  // "NIT <city>" → "National Institute of Technology <city>"
  {
    pattern: /^(nit)\s+(.+)$/i,
    expand: (_: string, abbr: string, suffix: string) =>
      `${ABBREVIATIONS["NIT" as keyof typeof ABBREVIATIONS]} ${suffix}`,
  },
];

/**
 * Expand abbreviations in a normalized name
 *
 * Returns array of variants with most likely first:
 * 1. Full expansion (IIT → Indian Institute of Technology)
 * 2. Pattern-based expansion (IIT Mumbai → Indian Institute of Technology Mumbai)
 * 3-5. Other likely expansions if multiple abbreviations present
 *
 * Max 5 variants returned
 */
export function expandVariants(normalized: string): string[] {
  const variants: string[] = [];
  const seen = new Set<string>();

  const addVariant = (v: string) => {
    const trimmed = v.trim().toLowerCase();
    if (!seen.has(trimmed)) {
      seen.add(trimmed);
      variants.push(v);
    }
  };

  // Handle empty string
  if (!normalized || normalized.trim().length === 0) {
    return [""];
  }

  const words = normalized.split(/\s+/);
  const hasAbbreviation = words.some(
    (w) => ABBREVIATIONS[w.toUpperCase() as keyof typeof ABBREVIATIONS]
  );

  if (hasAbbreviation) {
    // Try full expansion of all abbreviations (most likely first)
    const expanded = words
      .map((w) => {
        const upper = w.toUpperCase();
        return ABBREVIATIONS[upper as keyof typeof ABBREVIATIONS] || w;
      })
      .join(" ");
    addVariant(expanded);
    if (variants.length >= 5) return variants;

    // Try pattern-based expansions with full suffix expansion
    for (const { pattern, expand } of EXPANSION_PATTERNS) {
      const match = normalized.match(pattern);
      if (match && match[2]) {
        const suffix = match[2];
        // Expand any abbreviations in the suffix too
        const suffixWords = suffix.split(/\s+/);
        const expandedSuffix = suffixWords
          .map((w) => {
            const upper = w.toUpperCase();
            return ABBREVIATIONS[upper as keyof typeof ABBREVIATIONS] || w;
          })
          .join(" ");
        const patternExpanded = `${ABBREVIATIONS["IIT" as keyof typeof ABBREVIATIONS]} ${expandedSuffix}`;
        addVariant(patternExpanded);
        if (variants.length >= 5) return variants;
      }
    }

    // Try partial expansions (expand one at a time)
    for (let i = 0; i < words.length; i++) {
      const upper = words[i]!.toUpperCase();
      if (ABBREVIATIONS[upper as keyof typeof ABBREVIATIONS]) {
        const partial = [...words];
        partial[i] = ABBREVIATIONS[upper as keyof typeof ABBREVIATIONS];
        addVariant(partial.join(" "));
        if (variants.length >= 5) return variants;
      }
    }
  } else {
    // If no abbreviations found, return original
    addVariant(normalized);
  }

  return variants.slice(0, 5);
}

/**
 * Check if a text contains any known abbreviations
 */
export function hasAbbreviations(text: string): boolean {
  const words = text.split(/\s+/);
  return words.some(
    (w) => ABBREVIATIONS[w.toUpperCase() as keyof typeof ABBREVIATIONS]
  );
}

/**
 * Get the full form of an abbreviation, or undefined if not found
 */
export function getFullForm(abbreviation: string): string | undefined {
  return ABBREVIATIONS[abbreviation.toUpperCase() as keyof typeof ABBREVIATIONS];
}

/**
 * Get the abbreviation of a full form, or undefined if not found
 * Case-insensitive lookup
 */
export function getAbbreviation(fullForm: string): string | undefined {
  return FULL_TO_ABBR[fullForm.toLowerCase()];
}
