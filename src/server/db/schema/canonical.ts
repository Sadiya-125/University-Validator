/**
 * Canonical schema: institutions and their identities.
 * Replaces both a flat alias table and a separate registry-link table.
 */

import {
  pgTable,
  pgEnum,
  text,
  integer,
  serial,
  varchar,
  timestamp,
  jsonb,
  real,
  index,
  unique,
} from "drizzle-orm/pg-core";

// =====================================================================
// ENUMS
// =====================================================================

export const institutionTypeEnum = pgEnum("institution_type", [
  "public_university",
  "deemed_university",
  "private_university",
  "central_university",
  "state_university",
  "institute_of_national_importance",
  "engineering_college",
  "medical_college",
  "pharmacy_college",
  "nursing_college",
  "teacher_training",
  "architecture_college",
  "law_college",
  "school",
  "college",
  "other",
]);

export const verdictEnum = pgEnum("verdict", [
  "Genuine",
  "Likely Genuine",
  "Unknown",
  "Unverified",
  "Fake",
  "New",
]);

export const identitySourceEnum = pgEnum("identity_source", [
  "AICTE",
  "UGC",
  "AISHE",
  "NIRF",
  "NAAC",
  "NMC",
  "PCI",
  "NCTE",
  "COA",
  "INC",
  "BCI",
  "INI",
  "CBSE",
  "CISCE",
  "NIOS",
  "WIKIDATA",
  "NAD",
  "WEBSITE",
  "MANUAL",
]);

export const contactKindEnum = pgEnum("contact_kind", [
  "email",
  "phone",
  "fax",
  "website",
]);

export const linkPlatformEnum = pgEnum("link_platform", [
  "official_website",
  "social_media",
  "wikidata",
  "wikipedia",
]);

// =====================================================================
// CANONICAL TABLES
// =====================================================================

/**
 * institutions — canonical entity (one row per real institution)
 */
export const institutions = pgTable(
  "institutions",
  {
    id: serial("id").primaryKey(),
    canonicalName: varchar("canonical_name", { length: 512 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 512 }).notNull(),
    slug: varchar("slug", { length: 256 }).notNull().unique(),
    type: institutionTypeEnum("type").notNull().default("other"),
    state: varchar("state", { length: 128 }),
    district: varchar("district", { length: 128 }),
    pincode: varchar("pincode", { length: 10 }),
    address: text("address"),
    lat: real("lat"),
    lng: real("lng"),
    website: varchar("website", { length: 512 }),
    parentInstitutionId: integer("parent_institution_id"),
    verdict: verdictEnum("verdict").default("New"),
    confidence: real("confidence"),
    policyId: integer("policy_id"),
    firstValidatedAt: timestamp("first_validated_at", { withTimezone: true }),
    lastValidatedAt: timestamp("last_validated_at", { withTimezone: true }),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_1").on(table.normalizedName),
    index("idx_2").on(table.verdict, table.validUntil),
    index("idx_3").on(table.type),
    index("idx_4").on(table.state),
  ]
);

/**
 * institution_identities — (institution, source, external_id) tuples
 */
export const institutionIdentities = pgTable(
  "institution_identities",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    source: identitySourceEnum("source").notNull(),
    externalId: varchar("external_id", { length: 256 }).notNull(),
    nameAsSource: varchar("name_as_source", { length: 512 }).notNull(),
    normalizedName: varchar("normalized_name", { length: 512 }).notNull(),
    matchScore: real("match_score"),
    matchMethod: varchar("match_method", { length: 50 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_5").on(table.institutionId),
    index("idx_6").on(table.source),
    index("idx_7").on(table.externalId),
    index("idx_8").on(table.normalizedName),
    unique("unique_institution_identity").on(
      table.institutionId,
      table.source,
      table.externalId
    ),
  ]
);

/**
 * institution_contacts — email, phone, fax, website
 */
export const institutionContacts = pgTable(
  "institution_contacts",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    kind: contactKindEnum("kind").notNull(),
    value: varchar("value", { length: 512 }).notNull(),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_9").on(table.institutionId),
    index("idx_10").on(table.kind),
  ]
);

/**
 * institution_links — official website, social media, wikidata, wikipedia
 */
export const institutionLinks = pgTable(
  "institution_links",
  {
    id: serial("id").primaryKey(),
    institutionId: integer("institution_id")
      .notNull()
      .references(() => institutions.id, { onDelete: "cascade" }),
    platform: linkPlatformEnum("platform").notNull(),
    url: varchar("url", { length: 512 }).notNull(),
    title: varchar("title", { length: 256 }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("idx_11").on(table.institutionId),
    index("idx_12").on(table.platform),
  ]
);
