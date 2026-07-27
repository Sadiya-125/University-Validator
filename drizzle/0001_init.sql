-- University Validator: Initial Database Schema
-- Drizzle Migration: Creates all tables, enums, and indexes

-- =====================================================================
-- EXTENSIONS
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS btree_gin;

-- =====================================================================
-- ENUMS
-- =====================================================================

CREATE TYPE institution_type AS ENUM (
  'public_university',
  'deemed_university',
  'private_university',
  'central_university',
  'state_university',
  'institute_of_national_importance',
  'engineering_college',
  'medical_college',
  'pharmacy_college',
  'nursing_college',
  'teacher_training',
  'architecture_college',
  'law_college',
  'school',
  'college',
  'other'
);

CREATE TYPE verdict AS ENUM (
  'Genuine',
  'Likely Genuine',
  'Unknown',
  'Unverified',
  'Fake',
  'New'
);

CREATE TYPE identity_source AS ENUM (
  'AICTE',
  'UGC',
  'AISHE',
  'NIRF',
  'NAAC',
  'NMC',
  'PCI',
  'NCTE',
  'COA',
  'INC',
  'BCI',
  'INI',
  'CBSE',
  'CISCE',
  'NIOS',
  'WIKIDATA',
  'NAD',
  'WEBSITE',
  'MANUAL'
);

CREATE TYPE contact_kind AS ENUM (
  'email',
  'phone',
  'fax',
  'website'
);

CREATE TYPE link_platform AS ENUM (
  'official_website',
  'social_media',
  'wikidata',
  'wikipedia'
);

CREATE TYPE validation_run_state AS ENUM (
  'queued',
  'discovering',
  'verifying',
  'reasoning',
  'scoring',
  'completed',
  'failed',
  'cancelled',
  'archived'
);

CREATE TYPE step_status AS ENUM (
  'pending',
  'running',
  'succeeded',
  'failed',
  'skipped',
  'timeout'
);

CREATE TYPE evidence_kind AS ENUM (
  'institution_record',
  'contact_info',
  'affiliation_claim',
  'website_snapshot',
  'search_result',
  'llm_reasoning',
  'cross_reference',
  'authority_link',
  'other'
);

CREATE TYPE evidence_tier AS ENUM (
  'mirror',
  'api',
  'live'
);

CREATE TYPE source_code AS ENUM (
  'UGC',
  'UGC_FAKE',
  'AICTE',
  'AISHE',
  'NIRF',
  'NAAC',
  'NMC',
  'PCI',
  'NCTE',
  'COA',
  'INC',
  'BCI',
  'INI',
  'CBSE',
  'CISCE',
  'NIOS',
  'WIKIDATA',
  'NAD',
  'WEBSITE',
  'MANUAL'
);

CREATE TYPE snapshot_state AS ENUM (
  'running',
  'validating',
  'published',
  'rejected',
  'failed',
  'unchanged'
);

CREATE TYPE batch_state AS ENUM (
  'created',
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled'
);

CREATE TYPE provider_state AS ENUM (
  'closed',
  'open',
  'half_open'
);

-- =====================================================================
-- CANONICAL TABLES
-- =====================================================================

CREATE TABLE institutions (
  id SERIAL PRIMARY KEY,
  canonical_name VARCHAR(512) NOT NULL,
  normalized_name VARCHAR(512) NOT NULL,
  slug VARCHAR(256) NOT NULL UNIQUE,
  type institution_type NOT NULL DEFAULT 'other',
  state VARCHAR(128),
  district VARCHAR(128),
  pincode VARCHAR(10),
  address TEXT,
  lat REAL,
  lng REAL,
  website VARCHAR(512),
  parent_institution_id INTEGER,
  verdict verdict DEFAULT 'New',
  confidence REAL,
  policy_id INTEGER,
  first_validated_at TIMESTAMPTZ,
  last_validated_at TIMESTAMPTZ,
  valid_until TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE institution_identities (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  source identity_source NOT NULL,
  external_id VARCHAR(256) NOT NULL,
  name_as_source VARCHAR(512) NOT NULL,
  normalized_name VARCHAR(512) NOT NULL,
  match_score REAL,
  match_method VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (institution_id, source, external_id)
);

CREATE TABLE institution_contacts (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  kind contact_kind NOT NULL,
  value VARCHAR(512) NOT NULL,
  verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE institution_links (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  platform link_platform NOT NULL,
  url VARCHAR(512) NOT NULL,
  title VARCHAR(256),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- REGISTRY TABLES
-- =====================================================================

CREATE TABLE authorities (
  id SERIAL PRIMARY KEY,
  authority_code source_code NOT NULL UNIQUE,
  display_name VARCHAR(256) NOT NULL,
  description TEXT,
  website VARCHAR(512),
  data_url VARCHAR(512),
  rank INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE registry_snapshots (
  id SERIAL PRIMARY KEY,
  authority_code source_code NOT NULL,
  state snapshot_state NOT NULL,
  row_count INTEGER DEFAULT 0,
  published_count INTEGER DEFAULT 0,
  validation_report JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE registry_entries (
  id SERIAL PRIMARY KEY,
  authority_code source_code NOT NULL,
  snapshot_id INTEGER NOT NULL REFERENCES registry_snapshots(id) ON DELETE CASCADE,
  external_id VARCHAR(256) NOT NULL,
  canonical_name VARCHAR(512),
  normalized_name VARCHAR(512),
  type institution_type,
  status VARCHAR(50),
  attributes JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- EVIDENCE TABLES
-- =====================================================================

CREATE TABLE validation_runs (
  id SERIAL PRIMARY KEY,
  institution_id INTEGER NOT NULL REFERENCES institutions(id) ON DELETE CASCADE,
  state validation_run_state NOT NULL DEFAULT 'queued',
  verdict verdict,
  confidence REAL,
  cost_usd REAL DEFAULT 0,
  tokens_used INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE run_steps (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  step_type VARCHAR(50) NOT NULL,
  status step_status NOT NULL,
  input JSONB,
  output JSONB,
  error_message TEXT,
  duration_ms INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE evidence (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  kind evidence_kind NOT NULL,
  source_code source_code,
  tier evidence_tier NOT NULL,
  quality_score REAL,
  weight_applied REAL DEFAULT 1.0,
  content_hash VARCHAR(64),
  content TEXT NOT NULL,
  blob_key VARCHAR(512),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE llm_calls (
  id SERIAL PRIMARY KEY,
  run_id INTEGER NOT NULL REFERENCES validation_runs(id) ON DELETE CASCADE,
  provider VARCHAR(50) NOT NULL,
  model VARCHAR(128) NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  cost_usd REAL,
  latency_ms INTEGER,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- EMBEDDINGS TABLES
-- =====================================================================

CREATE TABLE embedding_spaces (
  id SERIAL PRIMARY KEY,
  model_name VARCHAR(128) NOT NULL UNIQUE,
  dimensions INTEGER NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- POLICY TABLES
-- =====================================================================

CREATE TABLE scoring_policies (
  id SERIAL PRIMARY KEY,
  name VARCHAR(128) NOT NULL,
  institution_type institution_type NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  weights JSONB NOT NULL,
  description TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (name, version)
);

CREATE TABLE feature_flags (
  id SERIAL PRIMARY KEY,
  key VARCHAR(128) NOT NULL UNIQUE,
  value INTEGER NOT NULL DEFAULT 0,
  description TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- OPERATIONS TABLES
-- =====================================================================

CREATE TABLE batches (
  id SERIAL PRIMARY KEY,
  state batch_state NOT NULL DEFAULT 'created',
  total_count INTEGER NOT NULL,
  completed_count INTEGER DEFAULT 0,
  failed_count INTEGER DEFAULT 0,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE batch_items (
  id SERIAL PRIMARY KEY,
  batch_id INTEGER NOT NULL REFERENCES batches(id) ON DELETE CASCADE,
  run_id INTEGER REFERENCES validation_runs(id) ON DELETE SET NULL,
  error_message TEXT,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE dead_letters (
  id SERIAL PRIMARY KEY,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NOT NULL,
  error_message TEXT NOT NULL,
  attempt_count INTEGER DEFAULT 1,
  next_retry_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE provider_health (
  id SERIAL PRIMARY KEY,
  provider VARCHAR(50) NOT NULL UNIQUE,
  state provider_state NOT NULL DEFAULT 'closed',
  failure_count INTEGER DEFAULT 0,
  last_failure_at TIMESTAMPTZ,
  last_success_at TIMESTAMPTZ,
  p50_ms REAL,
  p95_ms REAL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE metrics_hourly (
  id SERIAL PRIMARY KEY,
  hour TIMESTAMPTZ NOT NULL,
  tier evidence_tier NOT NULL,
  verdict verdict NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE audit_log (
  id SERIAL PRIMARY KEY,
  table_name VARCHAR(128) NOT NULL,
  row_id INTEGER NOT NULL,
  action VARCHAR(10) NOT NULL,
  before_value JSONB,
  after_value JSONB,
  user_id INTEGER,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =====================================================================
-- INDEXES
-- =====================================================================

CREATE INDEX idx_1 ON institutions (normalized_name);
CREATE INDEX idx_2 ON institutions (verdict, valid_until);
CREATE INDEX idx_3 ON institutions (type);
CREATE INDEX idx_4 ON institutions (state);

CREATE INDEX idx_5 ON institution_identities (institution_id);
CREATE INDEX idx_6 ON institution_identities (source);
CREATE INDEX idx_7 ON institution_identities (external_id);
CREATE INDEX idx_8 ON institution_identities (normalized_name);

CREATE INDEX idx_9 ON institution_contacts (institution_id);
CREATE INDEX idx_10 ON institution_contacts (kind);

CREATE INDEX idx_11 ON institution_links (institution_id);
CREATE INDEX idx_12 ON institution_links (platform);

CREATE INDEX idx_13 ON registry_entries (authority_code, snapshot_id);
CREATE INDEX idx_14 ON registry_entries (external_id);

CREATE INDEX idx_15 ON validation_runs (institution_id, started_at DESC);
CREATE INDEX idx_16 ON validation_runs (state);
CREATE INDEX idx_17 ON validation_runs (verdict);

CREATE INDEX idx_18 ON run_steps (run_id);
CREATE INDEX idx_19 ON run_steps (status);

CREATE INDEX idx_20 ON evidence (run_id, kind);
CREATE INDEX idx_21 ON evidence (tier);
CREATE INDEX idx_22 ON evidence (source_code);

CREATE INDEX idx_23 ON llm_calls (run_id);
CREATE INDEX idx_24 ON llm_calls (provider);

CREATE INDEX idx_25 ON scoring_policies (institution_type, is_active);
CREATE INDEX idx_26 ON feature_flags (key);

CREATE INDEX idx_27 ON batches (state);
CREATE INDEX idx_28 ON batch_items (batch_id);
CREATE INDEX idx_29 ON dead_letters (event_type, created_at);
CREATE INDEX idx_30 ON provider_health (provider);
CREATE INDEX idx_31 ON metrics_hourly (hour, tier, verdict);
CREATE INDEX idx_32 ON audit_log (table_name, row_id);
