import { useMemo, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  Users,
  Target,
  Package,
  Settings,
  TrendingUp,
  DollarSign,
  Heart,
  UserCheck,
  Wallet,
  Database,
  CheckCircle2,
  Sparkles,
  Download,
  Globe,
  ExternalLink,
  History,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  CompanyDomain,
  DOMAIN_ICONS,
  ALL_DOMAINS,
  SSOTLevel,
} from '@/types/company-master';
import { FieldHistoryDialog } from './FieldHistoryDialog';
import { ScoreBadge } from './ScoreBadge';
import { ContextFactsSection } from './ContextFactsSection';
import { DomainSummaryCard } from './DomainSummaryCard';
import { cn } from '@/lib/utils';

// Icon mapping
const IconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Users,
  Target,
  Package,
  Settings,
  TrendingUp,
  DollarSign,
  Heart,
  UserCheck,
  Wallet,
};

interface MasterDataField {
  id: string;
  company_id: string;
  domain: CompanyDomain;
  field_key: string;
  field_value: unknown;
  field_type: string | null;
  confidence_score: number | null;
  source_type: string;
  source_reference: unknown;
  is_verified: boolean | null;
  verified_by: string | null;
  verified_at: string | null;
  version: number;
  created_at: string | null;
  updated_at: string | null;
}

interface DomainDef {
  domain: CompanyDomain;
  display_name: string;
  description: string | null;
  icon_name: string | null;
  sort_order: number | null;
  color: string | null;
}

interface FieldDef {
  id: string;
  domain: CompanyDomain;
  field_key: string;
  display_name: string;
  field_type: string;
  sort_order: number | null;
  level: SSOTLevel | null;
  parent_field_id: string | null;
  is_scored: boolean | null;
}

interface DomainScore {
  domain: CompanyDomain;
  score: number | null;
  confidence: number | null;
}

// Flexible type for context facts from database
interface ContextFactItem {
  id: string;
  company_id: string;
  fact_key: string;
  display_name: string;
  fact_value: unknown;
  fact_type: string;
  category: 'attribute' | 'constraint' | 'segment';
  source_type: string;
  source_reference: unknown;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

interface ContextFactsByDomain {
  [domain: string]: ContextFactItem[];
}

interface MasterDataViewerProps {
  masterData: MasterDataField[];
  domainDefinitions: DomainDef[];
  fieldDefinitions: FieldDef[];
  domainScores?: DomainScore[];
  contextFacts?: ContextFactsByDomain;
}

export function MasterDataViewer({
  masterData,
  domainDefinitions,
  fieldDefinitions,
  domainScores = [],
  contextFacts = {},
}: MasterDataViewerProps) {
  // State for history dialog
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedField, setSelectedField] = useState<MasterDataField | null>(null);
  const [selectedDisplayName, setSelectedDisplayName] = useState('');
  const [selectedDomainName, setSelectedDomainName] = useState('');
  
  // Expanded state for L2 and L3 collapsibles
  const [expandedL2, setExpandedL2] = useState<Set<string>>(new Set());
  const [expandedL3, setExpandedL3] = useState<Set<string>>(new Set());

  // Create lookup for existing data
  const dataLookup = useMemo(() => {
    const lookup: Record<string, MasterDataField> = {};
    masterData.forEach(field => {
      const key = `${field.domain}:${field.field_key}`;
      lookup[key] = field;
    });
    return lookup;
  }, [masterData]);

  // Create lookup for domain scores
  const domainScoreLookup = useMemo(() => {
    const lookup: Record<CompanyDomain, DomainScore> = {} as Record<CompanyDomain, DomainScore>;
    domainScores.forEach(score => {
      lookup[score.domain] = score;
    });
    return lookup;
  }, [domainScores]);

  // Extract L1 summary data for each domain
  const getL1SummaryData = (domain: CompanyDomain) => {
    const getL1Value = (fieldKey: string): unknown => {
      const data = dataLookup[`${domain}:${fieldKey}`];
      return data?.field_value ?? null;
    };

    return {
      score: getL1Value('domain_score') as number | null,
      scoreDescription: getL1Value('domain_score_description') as string | null,
      scoreReasoning: getL1Value('domain_score_reasoning') as string | null,
      domainDescription: getL1Value('domain_description') as string | null,
    };
  };

  // Build hierarchy: L2 -> L3 -> L4
  const buildHierarchy = useMemo(() => {
    const result: Record<CompanyDomain, {
      l2Fields: FieldDef[];
      l3ByL2: Record<string, FieldDef[]>;
      l4ByL3: Record<string, FieldDef[]>;
      orphanL4: FieldDef[]; // L4 fields without parents (like Overview)
    }> = {} as Record<CompanyDomain, {
      l2Fields: FieldDef[];
      l3ByL2: Record<string, FieldDef[]>;
      l4ByL3: Record<string, FieldDef[]>;
      orphanL4: FieldDef[];
    }>;

    ALL_DOMAINS.forEach(domain => {
      const domainFields = fieldDefinitions.filter(f => f.domain === domain);
      result[domain] = {
        l2Fields: domainFields.filter(f => f.level === 'L2').sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
        l3ByL2: {},
        l4ByL3: {},
        orphanL4: domainFields.filter(f => f.level === 'L4' && !f.parent_field_id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)),
      };

      // Group L3 by L2 parent
      domainFields.filter(f => f.level === 'L3').forEach(l3 => {
        const parentId = l3.parent_field_id;
        if (parentId) {
          if (!result[domain].l3ByL2[parentId]) result[domain].l3ByL2[parentId] = [];
          result[domain].l3ByL2[parentId].push(l3);
        }
      });

      // Sort L3 within each L2
      Object.keys(result[domain].l3ByL2).forEach(l2Id => {
        result[domain].l3ByL2[l2Id].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      });

      // Group L4 by L3 parent
      domainFields.filter(f => f.level === 'L4' && f.parent_field_id).forEach(l4 => {
        const parentId = l4.parent_field_id!;
        if (!result[domain].l4ByL3[parentId]) result[domain].l4ByL3[parentId] = [];
        result[domain].l4ByL3[parentId].push(l4);
      });

      // Sort L4 within each L3
      Object.keys(result[domain].l4ByL3).forEach(l3Id => {
        result[domain].l4ByL3[l3Id].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
      });
    });

    return result;
  }, [fieldDefinitions]);

  // Get all domains sorted by definition order
  const allDomainsSorted = useMemo(() => {
    return [...domainDefinitions].sort((a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0)
    );
  }, [domainDefinitions]);

  // Calculate populated count for a domain
  const getPopulatedCount = (domain: CompanyDomain) => {
    const domainFields = fieldDefinitions.filter(f => f.domain === domain && f.level === 'L4');
    let populated = 0;
    domainFields.forEach(f => {
      const key = `${domain}:${f.field_key}`;
      if (dataLookup[key]) populated++;
    });
    return { populated, total: domainFields.length };
  };

  // Domains with any data default to expanded
  const defaultExpanded = useMemo(() => {
    return allDomainsSorted
      .filter(d => {
        const hierarchy = buildHierarchy[d.domain];
        const hasL4Data = hierarchy.orphanL4.some(f => dataLookup[`${d.domain}:${f.field_key}`]);
        const hasL2 = hierarchy.l2Fields.length > 0;
        return hasL4Data || hasL2;
      })
      .map(d => d.domain);
  }, [allDomainsSorted, buildHierarchy, dataLookup]);

  // Open history dialog for a field
  const openFieldHistory = (field: MasterDataField, domainDef: DomainDef) => {
    const fieldDef = fieldDefinitions.find(f => f.domain === field.domain && f.field_key === field.field_key);
    setSelectedField(field);
    setSelectedDisplayName(fieldDef?.display_name || formatFieldKey(field.field_key));
    setSelectedDomainName(domainDef.display_name);
    setHistoryDialogOpen(true);
  };

  // Format field key for display (convert snake_case to Title Case)
  const formatFieldKey = (key: string): string => {
    return key
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Render field value based on type
  const renderValue = (field: MasterDataField) => {
    const value = field.field_value;
    const type = field.field_type || 'text';

    if (value === null || value === undefined) {
      return <span className="text-muted-foreground italic">No value</span>;
    }

    switch (type) {
      case 'number':
        return (
          <span className="font-mono">
            {typeof value === 'number' ? value.toLocaleString() : String(value)}
          </span>
        );

      case 'date':
        try {
          const dateStr = String(value);
          return format(new Date(dateStr), 'MMM d, yyyy');
        } catch {
          return String(value);
        }

      case 'boolean':
        return (
          <Badge variant={value ? 'default' : 'secondary'}>
            {value ? 'Yes' : 'No'}
          </Badge>
        );

      case 'url':
        return (
          <a
            href={String(value)}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary hover:underline inline-flex items-center gap-1"
          >
            {String(value).replace(/^https?:\/\//, '').substring(0, 40)}
            {String(value).length > 40 && '...'}
            <ExternalLink className="h-3 w-3" />
          </a>
        );

      case 'array':
        if (Array.isArray(value)) {
          return (
            <div className="flex flex-wrap gap-1">
              {value.map((item, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {String(item)}
                </Badge>
              ))}
            </div>
          );
        }
        return String(value);

      case 'object':
        return (
          <pre className="text-xs bg-muted p-2 rounded max-h-24 overflow-auto">
            {JSON.stringify(value, null, 2)}
          </pre>
        );

      default:
        // Text or unknown
        const strValue = String(value);
        if (strValue.length > 200) {
          return (
            <div className="text-sm max-h-24 overflow-auto">
              {strValue}
            </div>
          );
        }
        return <span className="text-sm">{strValue}</span>;
    }
  };

  // Source badge
  const renderSourceBadge = (sourceType: string) => {
    switch (sourceType) {
      case 'generated':
        return (
          <Badge variant="secondary" className="text-xs gap-1">
            <Sparkles className="h-3 w-3" />
            AI
          </Badge>
        );
      case 'imported':
        return (
          <Badge variant="outline" className="text-xs gap-1 border-blue-500/50 text-blue-600">
            <Download className="h-3 w-3" />
            Imported
          </Badge>
        );
      case 'api':
        return (
          <Badge variant="outline" className="text-xs gap-1 border-green-500/50 text-green-600">
            <Globe className="h-3 w-3" />
            API
          </Badge>
        );
      case 'manual':
      default:
        return (
          <Badge variant="outline" className="text-xs">
            Manual
          </Badge>
        );
    }
  };

  // Render L4 field row
  const renderL4Field = (fieldDef: FieldDef, domain: CompanyDomain, domainDef: DomainDef) => {
    const dataKey = `${domain}:${fieldDef.field_key}`;
    const existingData = dataLookup[dataKey];

    return (
      <div
        key={fieldDef.id}
        className="flex items-start gap-4 py-2 px-3 rounded hover:bg-muted/50 group"
      >
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">
            {fieldDef.display_name}
          </div>
          <div className="mt-0.5">
            {existingData ? renderValue(existingData) : (
              <span className="text-muted-foreground text-sm">—</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {existingData && renderSourceBadge(existingData.source_type)}
          {existingData && (
            <div className="flex items-center gap-1">
              {existingData.is_verified && (
                <CheckCircle2 className="h-4 w-4 text-green-600" />
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 gap-1 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => openFieldHistory(existingData, domainDef)}
              >
                <History className="h-3 w-3" />
                v{existingData.version}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  };

  // Toggle L2 expansion
  const toggleL2 = (id: string) => {
    setExpandedL2(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Toggle L3 expansion
  const toggleL3 = (id: string) => {
    setExpandedL3(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // If no domains defined, show empty state
  if (allDomainsSorted.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Database className="h-12 w-12 text-muted-foreground mb-4" />
        <h3 className="font-medium text-lg">No domains defined</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm">
          Domain definitions are required to display the master data schema.
        </p>
      </div>
    );
  }

  return (
    <>
      <Accordion type="multiple" defaultValue={defaultExpanded} className="space-y-2">
        {allDomainsSorted.map(domainDef => {
          const hierarchy = buildHierarchy[domainDef.domain];
          const { populated, total } = getPopulatedCount(domainDef.domain);
          const domainScore = domainScoreLookup[domainDef.domain];
          const iconName = domainDef.icon_name || DOMAIN_ICONS[domainDef.domain];
          const IconComponent = IconMap[iconName] || Database;
          const hasHierarchy = hierarchy.l2Fields.length > 0;
          const l1Summary = getL1SummaryData(domainDef.domain);
          // Use L1 score if available, otherwise fall back to domain_scores table
          const displayScore = l1Summary.score ?? domainScore?.score ?? null;

          return (
            <AccordionItem
              key={domainDef.domain}
              value={domainDef.domain}
              className="border rounded-lg px-4"
            >
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center justify-between w-full pr-2">
                  <div className="flex items-center gap-3">
                    <IconComponent className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{domainDef.display_name}</span>
                    <Badge
                      variant={populated > 0 ? 'default' : 'outline'}
                      className="text-xs font-normal"
                    >
                      {populated}/{total}
                    </Badge>
                  </div>
                  {displayScore !== null && (
                    <ScoreBadge
                      score={displayScore}
                      confidence={domainScore?.confidence}
                    />
                  )}
                </div>
              </AccordionTrigger>
              <AccordionContent className="pb-4 space-y-4">
                {/* L1 Domain Summary Section */}
                <DomainSummaryCard
                  score={l1Summary.score}
                  scoreDescription={l1Summary.scoreDescription}
                  scoreReasoning={l1Summary.scoreReasoning}
                  domainDescription={l1Summary.domainDescription}
                />

                {/* L1C Domain Context Section */}
                {contextFacts[domainDef.domain] && contextFacts[domainDef.domain].length > 0 && (
                  <ContextFactsSection facts={contextFacts[domainDef.domain]} />
                )}
                
                {hasHierarchy ? (
                  // Hierarchical display: L2 → L3 → L4
                  <div className="space-y-2">
                    {hierarchy.l2Fields.map(l2 => {
                      const l2Data = dataLookup[`${domainDef.domain}:${l2.field_key}`];
                      const l3Fields = hierarchy.l3ByL2[l2.id] || [];
                      const isL2Expanded = expandedL2.has(l2.id);

                      return (
                        <Collapsible
                          key={l2.id}
                          open={isL2Expanded}
                          onOpenChange={() => toggleL2(l2.id)}
                        >
                          <CollapsibleTrigger className="flex items-center gap-2 py-2 px-2 w-full hover:bg-muted/50 rounded-md transition-colors">
                            <ChevronRight
                              className={cn(
                                'h-4 w-4 text-muted-foreground transition-transform',
                                isL2Expanded && 'rotate-90'
                              )}
                            />
                            <span className="font-medium text-sm">{l2.display_name}</span>
                            {l2.is_scored && l2Data && (
                              <ScoreBadge
                                score={(l2Data.field_value as any)?.score ?? null}
                                className="ml-auto"
                              />
                            )}
                          </CollapsibleTrigger>
                          <CollapsibleContent className="pl-6 pt-1 space-y-1">
                            {l3Fields.length > 0 ? (
                              l3Fields.map(l3 => {
                                const l3Data = dataLookup[`${domainDef.domain}:${l3.field_key}`];
                                const l4Fields = hierarchy.l4ByL3[l3.id] || [];
                                const isL3Expanded = expandedL3.has(l3.id);

                                return (
                                  <Collapsible
                                    key={l3.id}
                                    open={isL3Expanded}
                                    onOpenChange={() => toggleL3(l3.id)}
                                  >
                                    <CollapsibleTrigger className="flex items-center gap-2 py-1.5 px-2 w-full hover:bg-muted/30 rounded transition-colors">
                                      <ChevronRight
                                        className={cn(
                                          'h-3.5 w-3.5 text-muted-foreground transition-transform',
                                          isL3Expanded && 'rotate-90'
                                        )}
                                      />
                                      <span className="text-sm text-muted-foreground">{l3.display_name}</span>
                                      {l3.is_scored && l3Data && (
                                        <ScoreBadge
                                          score={(l3Data.field_value as any)?.score ?? null}
                                          className="ml-auto"
                                        />
                                      )}
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pl-6 pt-1 border-l border-border ml-2">
                                      {/* Render L3 value directly if it has data */}
                                      {l3Data && (
                                        <div className="py-2 px-3">
                                          {renderValue(l3Data)}
                                          <div className="flex items-center gap-2 mt-1">
                                            {renderSourceBadge(l3Data.source_type)}
                                            <Button
                                              variant="ghost"
                                              size="sm"
                                              className="h-6 px-2 gap-1 text-xs"
                                              onClick={() => openFieldHistory(l3Data, domainDef)}
                                            >
                                              <History className="h-3 w-3" />
                                              v{l3Data.version}
                                            </Button>
                                          </div>
                                        </div>
                                      )}
                                      {/* Render L4 children if they exist */}
                                      {l4Fields.length > 0 && (
                                        <div className={l3Data ? "mt-2 space-y-1 border-t border-border pt-2" : "space-y-1"}>
                                          {l4Fields.map(l4 =>
                                            renderL4Field(l4, domainDef.domain, domainDef)
                                          )}
                                        </div>
                                      )}
                                      {/* Show empty state only if no data AND no children */}
                                      {!l3Data && l4Fields.length === 0 && (
                                        <p className="text-xs text-muted-foreground py-2 px-3">
                                          No data available
                                        </p>
                                      )}
                                    </CollapsibleContent>
                                  </Collapsible>
                                );
                              })
                            ) : (
                              <p className="text-xs text-muted-foreground py-2 px-3">
                                No driver fields defined
                              </p>
                            )}
                          </CollapsibleContent>
                        </Collapsible>
                      );
                    })}
                  </div>
                ) : hierarchy.orphanL4.length > 0 ? (
                  // Flat display for domains without hierarchy (like Overview)
                  <div className="space-y-1">
                    {hierarchy.orphanL4.map(l4 =>
                      renderL4Field(l4, domainDef.domain, domainDef)
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground py-2">
                    No fields defined for this domain
                  </p>
                )}
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>

      {/* Field History Dialog */}
      <FieldHistoryDialog
        open={historyDialogOpen}
        onOpenChange={setHistoryDialogOpen}
        field={selectedField ? {
          id: selectedField.id,
          domain: selectedField.domain,
          field_key: selectedField.field_key,
          field_value: selectedField.field_value,
          is_verified: selectedField.is_verified,
          version: selectedField.version,
        } : null}
        displayName={selectedDisplayName}
        domainDisplayName={selectedDomainName}
      />
    </>
  );
}
