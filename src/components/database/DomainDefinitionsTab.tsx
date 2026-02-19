import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { triggerSchemaSync } from '@/lib/schemaSync';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { 
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, GripVertical, Palette } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Database } from '@/integrations/supabase/types';

type CompanyDomain = Database['public']['Enums']['company_domain'];

interface DomainDefinition {
  domain: CompanyDomain;
  display_name: string;
  description: string | null;
  icon_name: string | null;
  color: string | null;
  sort_order: number | null;
  retrieval_priority: number | null;
  context_keywords: string[] | null;
  typical_queries: string[] | null;
}

export function DomainDefinitionsTab() {
  const [domains, setDomains] = useState<DomainDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedDomain, setExpandedDomain] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchDomains();
  }, []);

  const fetchDomains = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('company_domain_definitions')
        .select('*')
        .order('sort_order');

      if (error) throw error;
      setDomains(data || []);
    } catch (error) {
      console.error('Error fetching domains:', error);
      toast({
        title: 'Error',
        description: 'Failed to load domain definitions',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (
    domain: CompanyDomain,
    field: keyof DomainDefinition,
    value: any
  ) => {
    try {
      const { error } = await supabase
        .from('company_domain_definitions')
        .update({ [field]: value })
        .eq('domain', domain);

      if (error) throw error;

      setDomains(prev =>
        prev.map(d =>
          d.domain === domain ? { ...d, [field]: value } : d
        )
      );

      toast({ title: 'Domain updated' });
      
      // Trigger schema sync (non-blocking)
      triggerSchemaSync('domain_updated', {
        type: 'domain',
        operation: 'update',
        key: domain,
      });
    } catch (error) {
      console.error('Error updating domain:', error);
      toast({
        title: 'Error',
        description: 'Failed to update domain',
        variant: 'destructive',
      });
    }
  };

  const handleArrayUpdate = async (
    domain: CompanyDomain,
    field: 'context_keywords' | 'typical_queries',
    value: string
  ) => {
    const arrayValue = value
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    await handleUpdate(domain, field, arrayValue);
  };

  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {[...Array(6)].map((_, i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader className="h-24" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-muted-foreground text-sm">
        Edit the 10 L1 domain definitions. Domains cannot be added or removed.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {domains.map((domain, index) => (
          <Card key={domain.domain} className="relative">
            <Collapsible
              open={expandedDomain === domain.domain}
              onOpenChange={(open) =>
                setExpandedDomain(open ? domain.domain : null)
              }
            >
              <CollapsibleTrigger asChild>
                <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
                  <div className="flex items-start gap-3">
                    <div
                      className="w-3 h-3 rounded-full mt-1.5 flex-shrink-0"
                      style={{ backgroundColor: domain.color || 'hsl(var(--muted))' }}
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-base">{domain.display_name}</CardTitle>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-xs">
                            #{index + 1}
                          </Badge>
                          <ChevronDown
                            className={cn(
                              'w-4 h-4 text-muted-foreground transition-transform',
                              expandedDomain === domain.domain && 'rotate-180'
                            )}
                          />
                        </div>
                      </div>
                      <CardDescription className="text-sm mt-1 truncate">
                        {domain.description || 'No description'}
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </CollapsibleTrigger>

              <CollapsibleContent>
                <CardContent className="pt-0 space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor={`${domain.domain}-name`}>Display Name</Label>
                    <Input
                      id={`${domain.domain}-name`}
                      defaultValue={domain.display_name}
                      onBlur={(e) =>
                        handleUpdate(domain.domain, 'display_name', e.target.value)
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${domain.domain}-desc`}>Description</Label>
                    <Textarea
                      id={`${domain.domain}-desc`}
                      defaultValue={domain.description || ''}
                      onBlur={(e) =>
                        handleUpdate(domain.domain, 'description', e.target.value || null)
                      }
                      rows={2}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor={`${domain.domain}-icon`}>Icon Name</Label>
                      <Input
                        id={`${domain.domain}-icon`}
                        defaultValue={domain.icon_name || ''}
                        onBlur={(e) =>
                          handleUpdate(domain.domain, 'icon_name', e.target.value || null)
                        }
                        placeholder="e.g., Users"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor={`${domain.domain}-color`}>Color</Label>
                      <div className="flex gap-2">
                        <Input
                          id={`${domain.domain}-color`}
                          defaultValue={domain.color || ''}
                          onBlur={(e) =>
                            handleUpdate(domain.domain, 'color', e.target.value || null)
                          }
                          placeholder="#6366f1"
                        />
                        {domain.color && (
                          <div
                            className="w-10 h-10 rounded border flex-shrink-0"
                            style={{ backgroundColor: domain.color }}
                          />
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label>Retrieval Priority</Label>
                      <span className="text-sm text-muted-foreground">
                        {domain.retrieval_priority || 50}
                      </span>
                    </div>
                    <Slider
                      value={[domain.retrieval_priority || 50]}
                      min={0}
                      max={100}
                      step={5}
                      onValueCommit={(v) =>
                        handleUpdate(domain.domain, 'retrieval_priority', v[0])
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${domain.domain}-keywords`}>
                      Context Keywords
                    </Label>
                    <Input
                      id={`${domain.domain}-keywords`}
                      defaultValue={domain.context_keywords?.join(', ') || ''}
                      onBlur={(e) =>
                        handleArrayUpdate(domain.domain, 'context_keywords', e.target.value)
                      }
                      placeholder="keyword1, keyword2, ..."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor={`${domain.domain}-queries`}>
                      Typical Queries
                    </Label>
                    <Textarea
                      id={`${domain.domain}-queries`}
                      defaultValue={domain.typical_queries?.join('\n') || ''}
                      onBlur={(e) => {
                        const queries = e.target.value
                          .split('\n')
                          .map(s => s.trim())
                          .filter(Boolean);
                        handleUpdate(domain.domain, 'typical_queries', queries);
                      }}
                      placeholder="One query per line"
                      rows={3}
                    />
                  </div>
                </CardContent>
              </CollapsibleContent>
            </Collapsible>
          </Card>
        ))}
      </div>
    </div>
  );
}
