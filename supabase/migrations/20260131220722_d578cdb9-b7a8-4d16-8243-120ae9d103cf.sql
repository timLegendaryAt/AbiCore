-- Insert L1 domain summary fields for all scored domains
-- These fields hold the aggregated domain-level score and metadata for each L1 datapoint

INSERT INTO company_field_definitions (
  domain, field_key, display_name, description, field_type, level, 
  parent_field_id, is_scored, sort_order
) VALUES
-- Leadership
('leadership', 'domain_score', 'Score', 'Domain health score (0-100)', 'number', 'L1', NULL, false, -4),
('leadership', 'domain_score_description', 'Score Description', 'Brief label for the score level', 'text', 'L1', NULL, false, -3),
('leadership', 'domain_score_reasoning', 'Score Reasoning', 'Explanation of the score calculation', 'text', 'L1', NULL, false, -2),
('leadership', 'domain_description', 'Domain Description', 'Summary of company status in this domain', 'text', 'L1', NULL, false, -1),

-- Strategy
('strategy', 'domain_score', 'Score', 'Domain health score (0-100)', 'number', 'L1', NULL, false, -4),
('strategy', 'domain_score_description', 'Score Description', 'Brief label for the score level', 'text', 'L1', NULL, false, -3),
('strategy', 'domain_score_reasoning', 'Score Reasoning', 'Explanation of the score calculation', 'text', 'L1', NULL, false, -2),
('strategy', 'domain_description', 'Domain Description', 'Summary of company status in this domain', 'text', 'L1', NULL, false, -1),

-- Product
('product', 'domain_score', 'Score', 'Domain health score (0-100)', 'number', 'L1', NULL, false, -4),
('product', 'domain_score_description', 'Score Description', 'Brief label for the score level', 'text', 'L1', NULL, false, -3),
('product', 'domain_score_reasoning', 'Score Reasoning', 'Explanation of the score calculation', 'text', 'L1', NULL, false, -2),
('product', 'domain_description', 'Domain Description', 'Summary of company status in this domain', 'text', 'L1', NULL, false, -1),

-- Operations
('operations', 'domain_score', 'Score', 'Domain health score (0-100)', 'number', 'L1', NULL, false, -4),
('operations', 'domain_score_description', 'Score Description', 'Brief label for the score level', 'text', 'L1', NULL, false, -3),
('operations', 'domain_score_reasoning', 'Score Reasoning', 'Explanation of the score calculation', 'text', 'L1', NULL, false, -2),
('operations', 'domain_description', 'Domain Description', 'Summary of company status in this domain', 'text', 'L1', NULL, false, -1),

-- Market
('market', 'domain_score', 'Score', 'Domain health score (0-100)', 'number', 'L1', NULL, false, -4),
('market', 'domain_score_description', 'Score Description', 'Brief label for the score level', 'text', 'L1', NULL, false, -3),
('market', 'domain_score_reasoning', 'Score Reasoning', 'Explanation of the score calculation', 'text', 'L1', NULL, false, -2),
('market', 'domain_description', 'Domain Description', 'Summary of company status in this domain', 'text', 'L1', NULL, false, -1),

-- Revenue
('revenue', 'domain_score', 'Score', 'Domain health score (0-100)', 'number', 'L1', NULL, false, -4),
('revenue', 'domain_score_description', 'Score Description', 'Brief label for the score level', 'text', 'L1', NULL, false, -3),
('revenue', 'domain_score_reasoning', 'Score Reasoning', 'Explanation of the score calculation', 'text', 'L1', NULL, false, -2),
('revenue', 'domain_description', 'Domain Description', 'Summary of company status in this domain', 'text', 'L1', NULL, false, -1),

-- Customer
('customer', 'domain_score', 'Score', 'Domain health score (0-100)', 'number', 'L1', NULL, false, -4),
('customer', 'domain_score_description', 'Score Description', 'Brief label for the score level', 'text', 'L1', NULL, false, -3),
('customer', 'domain_score_reasoning', 'Score Reasoning', 'Explanation of the score calculation', 'text', 'L1', NULL, false, -2),
('customer', 'domain_description', 'Domain Description', 'Summary of company status in this domain', 'text', 'L1', NULL, false, -1),

-- People
('people', 'domain_score', 'Score', 'Domain health score (0-100)', 'number', 'L1', NULL, false, -4),
('people', 'domain_score_description', 'Score Description', 'Brief label for the score level', 'text', 'L1', NULL, false, -3),
('people', 'domain_score_reasoning', 'Score Reasoning', 'Explanation of the score calculation', 'text', 'L1', NULL, false, -2),
('people', 'domain_description', 'Domain Description', 'Summary of company status in this domain', 'text', 'L1', NULL, false, -1),

-- Finance
('finance', 'domain_score', 'Score', 'Domain health score (0-100)', 'number', 'L1', NULL, false, -4),
('finance', 'domain_score_description', 'Score Description', 'Brief label for the score level', 'text', 'L1', NULL, false, -3),
('finance', 'domain_score_reasoning', 'Score Reasoning', 'Explanation of the score calculation', 'text', 'L1', NULL, false, -2),
('finance', 'domain_description', 'Domain Description', 'Summary of company status in this domain', 'text', 'L1', NULL, false, -1);