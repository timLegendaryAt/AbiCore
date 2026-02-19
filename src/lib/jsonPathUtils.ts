// Utility functions for extracting JSON paths and auto-suggesting SSOT field matches

export interface ExtractedPath {
  path: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
}

/**
 * Recursively extract all paths from a JSON object with their values
 * Handles markdown-wrapped JSON strings from AI outputs
 */
export function extractJsonPaths(obj: any, prefix = ''): ExtractedPath[] {
  const paths: ExtractedPath[] = [];

  // If the value is a string, try to parse it as JSON (handles AI outputs wrapped in markdown)
  let current = obj;
  if (typeof current === 'string') {
    try {
      let jsonStr = current.trim();
      // Strip markdown code blocks if present (handles full wrap)
      const codeBlockMatch = jsonStr.match(/^```(?:json)?\s*([\s\S]*?)```$/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1].trim();
      } else {
        // Also handle trailing ``` without leading (AI sometimes does this)
        jsonStr = jsonStr.replace(/```\s*$/, '').trim();
      }
      current = JSON.parse(jsonStr);
    } catch {
      // If parsing fails, treat it as a simple string value
      if (prefix) {
        return [{ path: prefix, value: current, type: 'string' }];
      }
      return [];
    }
  }

  if (current === null) {
    if (prefix) {
      paths.push({ path: prefix, value: null, type: 'null' });
    }
    return paths;
  }

  if (Array.isArray(current)) {
    if (prefix) {
      paths.push({ path: prefix, value: current, type: 'array' });
    }
    // Optionally extract first element's paths if it's an object
    if (current.length > 0 && typeof current[0] === 'object' && current[0] !== null) {
      paths.push(...extractJsonPaths(current[0], prefix ? `${prefix}[0]` : '[0]'));
    }
    return paths;
  }

  if (typeof current === 'object') {
    for (const key of Object.keys(current)) {
      const newPath = prefix ? `${prefix}.${key}` : key;
      const value = current[key];

      if (value === null) {
        paths.push({ path: newPath, value: null, type: 'null' });
      } else if (Array.isArray(value)) {
        paths.push({ path: newPath, value, type: 'array' });
        // Extract first element's paths for array of objects
        if (value.length > 0 && typeof value[0] === 'object' && value[0] !== null) {
          paths.push(...extractJsonPaths(value[0], `${newPath}[0]`));
        }
      } else if (typeof value === 'object') {
        paths.push({ path: newPath, value, type: 'object' });
        // Recurse into nested objects
        paths.push(...extractJsonPaths(value, newPath));
      } else if (typeof value === 'string') {
        // Try to parse string as JSON (handles AI outputs wrapped in markdown)
        let parsed: any = null;
        try {
          let jsonStr = value.trim();
          // Strip markdown code blocks if present (handles full wrap)
          const codeBlockMatch = jsonStr.match(/^```(?:json)?\s*([\s\S]*?)```$/);
          if (codeBlockMatch) {
            jsonStr = codeBlockMatch[1].trim();
          } else {
            // Also handle trailing ``` without leading (AI sometimes does this)
            jsonStr = jsonStr.replace(/```\s*$/, '').trim();
          }
          // Only attempt parse if it looks like JSON
          if (jsonStr.startsWith('{') || jsonStr.startsWith('[')) {
            parsed = JSON.parse(jsonStr);
          }
        } catch {
          // Not valid JSON, treat as plain string
        }
        
        if (parsed !== null && typeof parsed === 'object') {
          // Recurse into the parsed JSON, using current path as prefix
          paths.push(...extractJsonPaths(parsed, newPath));
        } else {
          // Plain string value
          paths.push({ path: newPath, value, type: 'string' });
        }
      } else {
        // number or boolean
        const valueType = typeof value as 'number' | 'boolean';
        paths.push({ path: newPath, value, type: valueType });
      }
    }
  }

  return paths;
}

interface DomainDefinition {
  domain: string;
  display_name: string;
}

interface FieldDefinition {
  domain: string;
  field_key: string;
  display_name: string;
  level: string;
}

interface SuggestedTarget {
  domain?: string;
  fieldKey?: string;
}

// Common field suffixes used in SSOT schema - ordered by specificity (longest first)
const FIELD_SUFFIXES = [
  '_score_description',
  '_score_reasoning',
  '_score_name',
  '_research_data',
  '_bullet_points',
  '_description',
  '_reasoning',
  '_summary',
  '_score',
  '_name',
];

/**
 * Extract the final key from a JSON path
 * e.g., "output.innovation_type_score" -> "innovation_type_score"
 */
function extractPathKey(jsonPath: string): string {
  return jsonPath.split('.').pop()?.toLowerCase().replace(/\[0\]$/, '') || '';
}

/**
 * Auto-suggest a target SSOT domain/field based on the JSON path key name
 * Uses suffix-based matching and fuzzy matching to find the best domain and field match
 */
export function suggestTargetField(
  jsonPath: string,
  domains: DomainDefinition[],
  fieldDefs: FieldDefinition[],
  usedFieldKeys: string[] = []
): SuggestedTarget {
  const key = extractPathKey(jsonPath);
  
  // Skip if the key is too generic
  if (['data', 'result', 'output', 'value', 'item', 'items'].includes(key)) {
    return {};
  }

  // Filter out already-used fields
  const availableFields = fieldDefs.filter(f => !usedFieldKeys.includes(f.field_key));

  // 1. Try exact field_key match first
  const exactMatch = availableFields.find(f => f.field_key.toLowerCase() === key);
  if (exactMatch) {
    return { domain: exactMatch.domain, fieldKey: exactMatch.field_key };
  }

  // 2. Suffix pattern matching - most reliable for SSOT fields
  const suffix = FIELD_SUFFIXES.find(s => key.endsWith(s));
  if (suffix) {
    const prefix = key.slice(0, -suffix.length);
    
    // Find fields with same suffix
    const suffixMatches = availableFields.filter(f => 
      f.field_key.toLowerCase().endsWith(suffix)
    );
    
    // Prioritize exact prefix + suffix match (e.g., innovation_type_score -> innovation_type_score)
    const exactPrefixMatch = suffixMatches.find(f => 
      f.field_key.toLowerCase() === key
    );
    if (exactPrefixMatch) {
      return { domain: exactPrefixMatch.domain, fieldKey: exactPrefixMatch.field_key };
    }
    
    // Try prefix matching - the prefix should be contained in the field key or vice versa
    const prefixMatch = suffixMatches.find(f => {
      const fieldPrefix = f.field_key.toLowerCase().slice(0, -suffix.length);
      return fieldPrefix === prefix || 
             fieldPrefix.includes(prefix) || 
             prefix.includes(fieldPrefix);
    });
    if (prefixMatch) {
      return { domain: prefixMatch.domain, fieldKey: prefixMatch.field_key };
    }
    
    // Don't fallback to first suffix match - require meaningful prefix similarity
  }

  // 3. Try partial match - key contains field name or vice versa
  for (const field of availableFields) {
    const fieldKeyLower = field.field_key.toLowerCase();
    if (key.includes(fieldKeyLower) || fieldKeyLower.includes(key)) {
      return { domain: field.domain, fieldKey: field.field_key };
    }
  }

  // 4. Try domain-based matching (e.g., "leadership_score" -> Leadership domain)
  for (const domain of domains) {
    const domainLower = domain.domain.toLowerCase();
    if (key.includes(domainLower)) {
      // Key contains domain name - find a matching field in that domain
      const domainFields = availableFields.filter(f => f.domain === domain.domain);
      
      // Check for common field patterns
      if (key.includes('score')) {
        const scoreField = domainFields.find(f => 
          f.field_key.includes('score') || f.field_key.includes('rating')
        );
        if (scoreField) {
          return { domain: domain.domain, fieldKey: scoreField.field_key };
        }
      }
      
      if (key.includes('description') || key.includes('reasoning')) {
        const descField = domainFields.find(f => 
          f.field_key.includes('description') || f.field_key.includes('reasoning')
        );
        if (descField) {
          return { domain: domain.domain, fieldKey: descField.field_key };
        }
      }

      // Return domain without specific field if no exact match
      return { domain: domain.domain };
    }
  }

  // 5. Try matching common patterns to domains
  const domainPatterns: Record<string, string[]> = {
    leadership: ['ceo', 'founder', 'executive', 'team', 'management', 'leader'],
    strategy: ['vision', 'mission', 'goals', 'strategic', 'roadmap'],
    product: ['product', 'feature', 'roadmap', 'mvp', 'tech', 'technology', 'innovation'],
    operations: ['operations', 'process', 'efficiency', 'systems'],
    market: ['market', 'competition', 'competitor', 'industry', 'tam', 'sam'],
    revenue: ['revenue', 'sales', 'arr', 'mrr', 'pricing', 'business_model'],
    customer: ['customer', 'user', 'retention', 'churn', 'nps', 'satisfaction'],
    people: ['culture', 'hiring', 'talent', 'employee', 'hr', 'team_size'],
    finance: ['finance', 'funding', 'burn', 'runway', 'cash', 'investors'],
  };

  for (const [domainKey, patterns] of Object.entries(domainPatterns)) {
    if (patterns.some(p => key.includes(p))) {
      const matchedDomain = domains.find(d => d.domain === domainKey);
      if (matchedDomain) {
        return { domain: matchedDomain.domain };
      }
    }
  }

  return {};
}

/**
 * Format a value for display in the UI
 */
export function formatValuePreview(value: any, maxLength = 40): string {
  if (value === null) return 'null';
  if (value === undefined) return '—';
  
  if (typeof value === 'string') {
    return value.length > maxLength ? value.substring(0, maxLength) + '...' : value;
  }
  
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  
  if (Array.isArray(value)) {
    return `[${value.length} items]`;
  }
  
  if (typeof value === 'object') {
    const keys = Object.keys(value);
    return `{${keys.slice(0, 3).join(', ')}${keys.length > 3 ? '...' : ''}}`;
  }
  
  return String(value);
}

/**
 * Convert a JSON path to a human-readable display name
 * e.g., "output.market_growth_score" → "market growth score"
 */
export function formatPathAsDisplayName(path: string): string {
  // Get the last segment of the path (after the last dot)
  const lastSegment = path.split('.').pop() || path;
  
  // Remove array notation if present
  const cleanSegment = lastSegment.replace(/\[\d+\]$/, '');
  
  // Replace underscores with spaces
  return cleanSegment.replace(/_/g, ' ');
}
