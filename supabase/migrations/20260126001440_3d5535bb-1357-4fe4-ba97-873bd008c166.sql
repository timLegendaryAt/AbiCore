-- ============================================
-- RAG OPTIMIZATION: Schema Enhancements + Search Indexes
-- ============================================

-- 1. Add RAG columns to field definitions
ALTER TABLE company_field_definitions 
ADD COLUMN IF NOT EXISTS semantic_description TEXT,
ADD COLUMN IF NOT EXISTS semantic_tags TEXT[],
ADD COLUMN IF NOT EXISTS importance_score INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS retrieval_context TEXT,
ADD COLUMN IF NOT EXISTS related_fields TEXT[];

-- 2. Add retrieval columns to domain definitions  
ALTER TABLE company_domain_definitions
ADD COLUMN IF NOT EXISTS retrieval_priority INTEGER DEFAULT 50,
ADD COLUMN IF NOT EXISTS context_keywords TEXT[],
ADD COLUMN IF NOT EXISTS typical_queries TEXT[];

-- 3. Enable pg_trgm extension for fuzzy text search
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 4. GIN index on field_value for JSONB queries
CREATE INDEX IF NOT EXISTS idx_master_data_value_gin 
ON company_master_data USING GIN (field_value jsonb_path_ops);

-- 5. Trigram index on field_key for fuzzy matching
CREATE INDEX IF NOT EXISTS idx_master_data_field_key_trgm 
ON company_master_data USING GIN (field_key gin_trgm_ops);

-- 6. Composite index for verified + high-confidence data retrieval
CREATE INDEX IF NOT EXISTS idx_master_data_verified_priority 
ON company_master_data (company_id, domain, is_verified DESC, confidence_score DESC NULLS LAST);

-- 7. History table index for efficient field timeline queries
CREATE INDEX IF NOT EXISTS idx_master_history_field_timeline
ON company_master_data_history (master_data_id, created_at DESC);

-- 8. Index for domain-based queries with importance scoring
CREATE INDEX IF NOT EXISTS idx_field_definitions_domain_importance
ON company_field_definitions (domain, importance_score DESC NULLS LAST);