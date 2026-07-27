-- Migration: Change registry_entries.type from enum to VARCHAR
-- Reason: Support raw type values from all sources (AICTE, AISHE, etc.)

-- Step 1: Alter the column type from institution_type enum to VARCHAR using USING clause
ALTER TABLE registry_entries
ALTER COLUMN type TYPE VARCHAR(256) USING type::text;

-- Step 2: Create index on type column for efficient filtering (if not exists)
DO $$ BEGIN
  CREATE INDEX idx_registry_entries_type ON registry_entries(type);
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;
