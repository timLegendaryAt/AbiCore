import { useEffect, useState } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { Database } from '@/integrations/supabase/types';

type CompanyDomain = Database['public']['Enums']['company_domain'];

interface DomainDefinition {
  domain: CompanyDomain;
  display_name: string;
  sort_order: number | null;
}

interface FieldDefinition {
  id: string;
  domain: CompanyDomain;
  field_key: string;
  display_name: string;
  field_type: string;
  sort_order: number | null;
  level: string | null;
}

interface MasterDataMappingConfigProps {
  nodeId: string;
  currentMapping: { domain: string; field_key: string } | null;
  onMappingChange: (mapping: { domain: string; field_key: string } | null) => void;
}

export function MasterDataMappingConfig({
  nodeId,
  currentMapping,
  onMappingChange,
}: MasterDataMappingConfigProps) {
  const [domains, setDomains] = useState<DomainDefinition[]>([]);
  const [fields, setFields] = useState<FieldDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDomain, setSelectedDomain] = useState<string>(currentMapping?.domain || '');
  const [selectedField, setSelectedField] = useState<string>(currentMapping?.field_key || '');

  // Fetch domains on mount
  useEffect(() => {
    const fetchDomains = async () => {
      const { data, error } = await supabase
        .from('company_domain_definitions')
        .select('domain, display_name, sort_order')
        .order('sort_order', { ascending: true });

      if (!error && data) {
        setDomains(data);
      }
      setLoading(false);
    };

    fetchDomains();
  }, []);

  // Fetch fields when domain changes
  useEffect(() => {
    if (!selectedDomain) {
      setFields([]);
      return;
    }

    const fetchFields = async () => {
      const { data, error } = await supabase
        .from('company_field_definitions')
        .select('id, domain, field_key, display_name, field_type, sort_order, level')
        .eq('domain', selectedDomain as CompanyDomain)
        .eq('level', 'L4') // Only show L4 (input) fields for workflow mapping
        .order('sort_order', { ascending: true });

      if (!error && data) {
        setFields(data);
      }
    };

    fetchFields();
  }, [selectedDomain]);

  const handleDomainChange = (domain: string) => {
    setSelectedDomain(domain);
    setSelectedField(''); // Reset field when domain changes
    onMappingChange(null); // Clear mapping until field is selected
  };

  const handleFieldChange = (fieldKey: string) => {
    setSelectedField(fieldKey);
    if (selectedDomain && fieldKey) {
      onMappingChange({ domain: selectedDomain, field_key: fieldKey });
    }
  };

  const selectedFieldDef = fields.find(f => f.field_key === selectedField);
  const selectedDomainDef = domains.find(d => d.domain === selectedDomain);

  if (loading) {
    return (
      <div className="animate-pulse">
        <div className="h-4 bg-muted rounded w-24 mb-2" />
        <div className="h-8 bg-muted rounded w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Domain Selector */}
      <div className="space-y-1.5">
        <Label htmlFor={`domain-${nodeId}`} className="text-xs font-medium">
          Domain
        </Label>
        <Select value={selectedDomain} onValueChange={handleDomainChange}>
          <SelectTrigger id={`domain-${nodeId}`} className="h-8 text-sm">
            <SelectValue placeholder="Select domain..." />
          </SelectTrigger>
          <SelectContent>
            {domains.map((domain) => (
              <SelectItem key={domain.domain} value={domain.domain}>
                {domain.display_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Field Selector - only show when domain is selected */}
      {selectedDomain && (
        <div className="space-y-1.5">
          <Label htmlFor={`field-${nodeId}`} className="text-xs font-medium">
            Field
          </Label>
          <Select value={selectedField} onValueChange={handleFieldChange}>
            <SelectTrigger id={`field-${nodeId}`} className="h-8 text-sm">
              <SelectValue placeholder="Select field..." />
            </SelectTrigger>
            <SelectContent>
              {fields.length === 0 ? (
                <div className="px-2 py-1.5 text-xs text-muted-foreground">
                  No fields defined for this domain
                </div>
              ) : (
                fields.map((field) => (
                  <SelectItem key={field.field_key} value={field.field_key}>
                    {field.display_name}
                  </SelectItem>
                ))
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Info display when both are selected */}
      {selectedDomainDef && selectedFieldDef && (
        <div className="pt-2 border-t border-border">
          <p className="text-xs text-emerald-600 dark:text-emerald-400">
            📝 Field type: <code className="bg-emerald-500/20 px-1 py-0.5 rounded">{selectedFieldDef.field_type}</code>
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Stores to: <strong>{selectedDomainDef.display_name} → {selectedFieldDef.display_name}</strong>
          </p>
        </div>
      )}
    </div>
  );
}
