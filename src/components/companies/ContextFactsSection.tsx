import { Badge } from '@/components/ui/badge';
import { 
  Tag, 
  AlertCircle, 
  Layers, 
  CheckCircle2, 
  Globe, 
  Download, 
  Sparkles,
  MapPin,
  Calendar,
  Users,
  Building,
  Rocket,
  CreditCard,
  DollarSign,
  Target,
  Shield,
  Sun,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

// Inline type to avoid import complexity from company-master
export type FactCategory = 'attribute' | 'constraint' | 'segment';

// Context fact item type (matches DB structure)
export interface ContextFactItem {
  id: string;
  company_id: string;
  fact_key: string;
  display_name: string;
  fact_value: unknown;
  fact_type: string;
  category: FactCategory;
  source_type: string;
  source_reference: unknown;
  is_verified: boolean;
  verified_by: string | null;
  verified_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

// Category display metadata
const FACT_CATEGORY_CONFIG: Record<FactCategory, {
  label: string;
  icon: string;
  color: string;
}> = {
  attribute: {
    label: 'Attribute',
    icon: 'Tag',
    color: 'blue',
  },
  constraint: {
    label: 'Constraint',
    icon: 'AlertCircle',
    color: 'amber',
  },
  segment: {
    label: 'Segment',
    icon: 'Layers',
    color: 'purple',
  },
};

// Icon mapping for context facts
const IconMap: Record<string, React.ComponentType<{ className?: string }>> = {
  MapPin,
  Globe,
  Calendar,
  Users,
  Building,
  Rocket,
  CreditCard,
  DollarSign,
  Target,
  Shield,
  CheckCircle: CheckCircle2,
  Sun,
  AlertTriangle,
  Tag,
  Layers,
  AlertCircle,
};

interface ContextFactsSectionProps {
  facts: ContextFactItem[];
  className?: string;
}

export function ContextFactsSection({ facts, className }: ContextFactsSectionProps) {
  if (facts.length === 0) {
    return null;
  }

  // Group facts by category
  const byCategory = facts.reduce((acc, fact) => {
    const cat = fact.category || 'attribute';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(fact);
    return acc;
  }, {} as Record<FactCategory, ContextFactItem[]>);

  // Render source badge
  const renderSourceBadge = (sourceType: string) => {
    switch (sourceType) {
      case 'generated':
        return (
          <Badge variant="secondary" className="text-xs gap-1 h-5">
            <Sparkles className="h-2.5 w-2.5" />
            AI
          </Badge>
        );
      case 'imported':
        return (
          <Badge variant="outline" className="text-xs gap-1 h-5 border-blue-500/50 text-blue-600">
            <Download className="h-2.5 w-2.5" />
            Imported
          </Badge>
        );
      case 'api':
        return (
          <Badge variant="outline" className="text-xs gap-1 h-5 border-green-500/50 text-green-600">
            <Globe className="h-2.5 w-2.5" />
            API
          </Badge>
        );
      default:
        return null;
    }
  };

  // Render fact value based on type
  const renderValue = (fact: ContextFactItem) => {
    const value = fact.fact_value;
    const type = fact.fact_type || 'text';

    if (value === null || value === undefined) {
      return <span className="text-muted-foreground">—</span>;
    }

    switch (type) {
      case 'boolean':
        return (
          <Badge variant={value ? 'default' : 'secondary'} className="text-xs">
            {value ? 'Yes' : 'No'}
          </Badge>
        );

      case 'array':
        if (Array.isArray(value)) {
          return (
            <div className="flex flex-wrap gap-1">
              {value.slice(0, 3).map((item, i) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {String(item)}
                </Badge>
              ))}
              {value.length > 3 && (
                <Badge variant="outline" className="text-xs">
                  +{value.length - 3}
                </Badge>
              )}
            </div>
          );
        }
        return String(value);

      case 'number':
        return (
          <span className="font-mono text-sm">
            {typeof value === 'number' ? value.toLocaleString() : String(value)}
          </span>
        );

      default:
        return <span className="text-sm">{String(value)}</span>;
    }
  };

  // Get category icon
  const getCategoryIcon = (category: FactCategory) => {
    const config = FACT_CATEGORY_CONFIG[category];
    const IconComponent = IconMap[config.icon] || Tag;
    return IconComponent;
  };

  return (
    <div className={cn('rounded-lg border border-dashed bg-muted/30 p-3', className)}>
      <div className="flex items-center gap-2 mb-2">
        <Layers className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Context
        </span>
      </div>
      
      <div className="space-y-2">
        {(Object.keys(byCategory) as FactCategory[]).map(category => {
          const categoryFacts = byCategory[category];
          if (!categoryFacts || categoryFacts.length === 0) return null;
          
          const CategoryIcon = getCategoryIcon(category);
          const config = FACT_CATEGORY_CONFIG[category];

          return (
            <div key={category} className="space-y-1">
              {categoryFacts.map(fact => (
                <div
                  key={fact.id}
                  className="flex items-center justify-between gap-3 py-1 px-2 rounded hover:bg-muted/50 group"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <CategoryIcon className={cn(
                      'h-3.5 w-3.5 flex-shrink-0',
                      config.color === 'blue' && 'text-blue-500',
                      config.color === 'amber' && 'text-amber-500',
                      config.color === 'purple' && 'text-purple-500'
                    )} />
                    <span className="text-sm text-muted-foreground truncate">
                      {fact.display_name}:
                    </span>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {renderValue(fact)}
                    {fact.is_verified && (
                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    )}
                    {renderSourceBadge(fact.source_type)}
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
