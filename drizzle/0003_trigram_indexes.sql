-- Migration: Add GIN indexes for trigram similarity search
-- Enables efficient similarity() queries for name matching across institutions and registries

-- GIN index on institutions.normalized_name for trigram similarity
DO $$ BEGIN
  CREATE INDEX idx_institutions_normalized_name_gin ON institutions USING gin(normalized_name gin_trgm_ops);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- GIN index on institution_identities.normalized_name for trigram similarity
DO $$ BEGIN
  CREATE INDEX idx_institution_identities_normalized_name_gin ON institution_identities USING gin(normalized_name gin_trgm_ops);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- GIN index on registry_entries.canonical_name for trigram similarity
DO $$ BEGIN
  CREATE INDEX idx_registry_entries_canonical_name_gin ON registry_entries USING gin(canonical_name gin_trgm_ops);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- GIN index on registry_entries.normalized_name for trigram similarity
DO $$ BEGIN
  CREATE INDEX idx_registry_entries_normalized_name_gin ON registry_entries USING gin(normalized_name gin_trgm_ops);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
