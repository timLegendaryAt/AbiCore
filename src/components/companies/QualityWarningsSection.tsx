import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Database } from 'lucide-react';
import { format } from 'date-fns';

interface LowQualityField {
  field: string;
  score: number;
  reasoning: string;
  flagged_at: string;
}

interface QualityWarningsSectionProps {
  companyId: string;
}

export function QualityWarningsSection({ companyId }: QualityWarningsSectionProps) {
  const [warnings, setWarnings] = useState<LowQualityField[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWarnings = async () => {
      setLoading(true);
      
      // Fetch all node data for this company and extract low_quality_fields
      const { data, error } = await supabase
        .from('company_node_data')
        .select('node_label, data')
        .eq('company_id', companyId);

      if (!error && data) {
        const allWarnings: LowQualityField[] = [];
        
        data.forEach(row => {
          const nodeData = row.data as Record<string, any> | null;
          if (nodeData?.low_quality_fields && Array.isArray(nodeData.low_quality_fields)) {
            nodeData.low_quality_fields.forEach((field: LowQualityField) => {
              allWarnings.push(field);
            });
          }
        });

        // Sort by most recent
        allWarnings.sort((a, b) => 
          new Date(b.flagged_at).getTime() - new Date(a.flagged_at).getTime()
        );

        setWarnings(allWarnings);
      }

      setLoading(false);
    };

    if (companyId) {
      fetchWarnings();
    }
  }, [companyId]);

  if (loading || warnings.length === 0) {
    return null;
  }

  return (
    <Alert variant="destructive" className="mb-4">
      <AlertTriangle className="h-4 w-4" />
      <AlertTitle className="flex items-center gap-2">
        Data Quality Warnings
        <Badge variant="destructive" className="ml-2">
          {warnings.length} issue{warnings.length !== 1 ? 's' : ''}
        </Badge>
      </AlertTitle>
      <AlertDescription className="mt-2">
        <div className="space-y-2">
          {warnings.slice(0, 5).map((warning, index) => (
            <div 
              key={`${warning.field}-${index}`}
              className="flex items-start gap-2 text-sm"
            >
              <Database className="w-4 h-4 mt-0.5 shrink-0" />
              <div>
                <span className="font-medium">{warning.field}</span>
                <span className="text-muted-foreground ml-2">
                  ({warning.score}% quality)
                </span>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                  {warning.reasoning}
                </p>
                <span className="text-xs text-muted-foreground">
                  Flagged {format(new Date(warning.flagged_at), 'MMM d, yyyy')}
                </span>
              </div>
            </div>
          ))}
          {warnings.length > 5 && (
            <p className="text-xs text-muted-foreground mt-2">
              +{warnings.length - 5} more issues
            </p>
          )}
        </div>
      </AlertDescription>
    </Alert>
  );
}
