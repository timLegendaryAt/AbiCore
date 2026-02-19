INSERT INTO company_field_definitions (domain, field_key, display_name, field_type, level, is_scored, sort_order, default_value)
VALUES
  ('finance', 'round', 'Round', 'text', 'L1C', false, 1, NULL),
  ('finance', 'vehicle', 'Vehicle', 'text', 'L1C', false, 2, NULL),
  ('finance', 'raise_amount', 'Raise Amount', 'text', 'L1C', false, 3, NULL),
  ('finance', 'target_valuation', 'Target Valuation', 'text', 'L1C', false, 4, NULL),
  ('finance', 'amount_raised', 'Amount Raised', 'text', 'L1C', false, 5, NULL),
  ('finance', 'current_burn_rate_per_month', 'Current Burn Rate / Month', 'text', 'L1C', false, 6, NULL),
  ('finance', 'current_runway_months', 'Current Runway (Months)', 'text', 'L1C', false, 7, NULL),
  ('finance', 'projected_burn_rate_post_raise_per_month', 'Projected Burn Rate Post-Raise / Month', 'text', 'L1C', false, 8, NULL),
  ('finance', 'post_raise_runway_months', 'Post-Raise Runway (Months)', 'text', 'L1C', false, 9, NULL),
  ('finance', 'current_runway_descriptor', 'Current Runway Descriptor', 'text', 'L1C', false, 10, NULL),
  ('finance', 'incorporation_location', 'Incorporation Location', 'text', 'L1C', false, 11, NULL);