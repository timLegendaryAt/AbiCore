import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { 
  ChevronDown, 
  ChevronRight, 
  Database, 
  Clock, 
  FileJson, 
  Building, 
  FileText, 
  Search,
  Edit,
  Plus,
  CheckCircle2
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { 
  Submission, 
  findInitialSubmission, 
  getSourceDisplayName, 
  getFieldCount 
} from '@/lib/submissionUtils';

interface InitialSubmissionViewerProps {
  submissions: Submission[];
  loading: boolean;
  companyId: string;
  companyName: string;
  onEdit: (submission: Submission) => void;
  onAdd: () => void;
}

const getStatusBadge = (status: string) => {
  const colors: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20',
    processing: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
    completed: 'bg-green-500/10 text-green-600 border-green-500/20',
    failed: 'bg-red-500/10 text-red-600 border-red-500/20',
  };
  return (
    <Badge variant="outline" className={colors[status] || ''}>
      {status}
    </Badge>
  );
};

// Component for expandable long text values
const ExpandableValue = ({ value }: { value: string }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div>
      <div className={cn("whitespace-pre-wrap text-xs", !isExpanded && "line-clamp-3")}>
        {value}
      </div>
      <Button 
        variant="link" 
        size="sm" 
        className="h-5 text-xs p-0 mt-1"
        onClick={(e) => {
          e.stopPropagation();
          setIsExpanded(!isExpanded);
        }}
      >
        {isExpanded ? 'Show less' : 'Show more'}
      </Button>
    </div>
  );
};

// Helper function to format field values for display
const formatFieldValue = (value: any, fieldName?: string): React.ReactNode => {
  if (value === null || value === undefined) {
    return <span className="text-muted-foreground italic">Not provided</span>;
  }
  
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) {
    return <span className="text-muted-foreground italic">Not provided</span>;
  }
  
  if (typeof value === 'object' && !Array.isArray(value)) {
    return (
      <div className="space-y-1">
        {Object.entries(value).map(([k, v]) => (
          <div key={k} className="text-xs">
            <span className="text-muted-foreground font-medium">{k}:</span>{' '}
            <span>{String(v)}</span>
          </div>
        ))}
      </div>
    );
  }
  
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-muted-foreground italic">Empty</span>;
    }
    return value.join(', ');
  }
  
  if (typeof value === 'string' && value.length > 150) {
    return <ExpandableValue value={value} />;
  }
  
  return String(value);
};

// Helper to check if a field has a meaningful value
const hasValue = (fieldData: any): boolean => {
  const value = fieldData?.value;
  if (value === null || value === undefined) return false;
  if (typeof value === 'string' && value.trim() === '') return false;
  if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) return false;
  if (Array.isArray(value) && value.length === 0) return false;
  return true;
};

// Table component for displaying intake fields
const IntakeFieldsTable = ({ intakeFields }: { intakeFields: Record<string, any> }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const entries = Object.entries(intakeFields);
  
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground italic">No intake fields</p>;
  }
  
  // Filter entries based on search term
  const filteredEntries = entries.filter(([fieldName, fieldData]) => {
    if (!searchTerm) return true;
    const searchLower = searchTerm.toLowerCase();
    const valueStr = typeof fieldData?.value === 'string' 
      ? fieldData.value.toLowerCase() 
      : JSON.stringify(fieldData?.value || '').toLowerCase();
    return fieldName.toLowerCase().includes(searchLower) || valueStr.includes(searchLower);
  });
  
  // Sort entries: fields with values first, then alphabetically
  const sortedEntries = [...filteredEntries].sort((a, b) => {
    const aHasValue = hasValue(a[1]);
    const bHasValue = hasValue(b[1]);
    if (aHasValue && !bHasValue) return -1;
    if (!aHasValue && bHasValue) return 1;
    return a[0].localeCompare(b[0]);
  });
  
  return (
    <div className="space-y-3">
      {/* Search input */}
      <div className="flex items-center gap-2">
        <Search className="h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search fields or values..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="h-8"
        />
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {sortedEntries.length} of {entries.length} fields
        </span>
      </div>
      
      {/* Table */}
      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[280px]">Field</TableHead>
              <TableHead className="w-[100px]">Type</TableHead>
              <TableHead className="w-[140px]">Stage</TableHead>
              <TableHead>Value</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedEntries.map(([fieldName, fieldData]) => (
              <TableRow key={fieldName}>
                <TableCell className="font-medium text-sm align-top">{fieldName}</TableCell>
                <TableCell className="align-top">
                  <Badge variant="outline" className="text-xs">
                    {fieldData?.type || 'unknown'}
                  </Badge>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground align-top">
                  {fieldData?.stage_name || '-'}
                </TableCell>
                <TableCell className="text-sm align-top">
                  {formatFieldValue(fieldData?.value, fieldName)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

// Component for displaying top-level company info
const CompanyInfoSection = ({ rawData }: { rawData: Record<string, any> }) => {
  const topLevelFields = Object.entries(rawData).filter(
    ([key]) => key !== 'intake_fields' && key !== 'intake_submissions' && key !== '_trigger'
  );
  
  if (topLevelFields.length === 0) {
    return null;
  }
  
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
      {topLevelFields.map(([key, value]) => (
        <div key={key} className="space-y-1">
          <label className="text-xs font-medium text-muted-foreground capitalize">
            {key.replace(/_/g, ' ')}
          </label>
          <p className="text-sm break-words">
            {value === null || value === undefined || value === '' 
              ? <span className="text-muted-foreground italic">Not provided</span>
              : typeof value === 'object' 
                ? JSON.stringify(value) 
                : String(value)}
          </p>
        </div>
      ))}
    </div>
  );
};

const JsonViewer = ({ data, maxHeight = '300px' }: { data: Record<string, any>; maxHeight?: string }) => {
  const [expanded, setExpanded] = useState(false);
  const jsonString = JSON.stringify(data, null, 2);
  const previewLength = 500;
  const needsTruncation = jsonString.length > previewLength;

  return (
    <div className="relative">
      <ScrollArea className="rounded-md border bg-muted/50" style={{ maxHeight: expanded ? maxHeight : '150px' }}>
        <pre className="p-3 text-xs font-mono whitespace-pre-wrap break-all">
          {expanded || !needsTruncation ? jsonString : `${jsonString.slice(0, previewLength)}...`}
        </pre>
      </ScrollArea>
      {needsTruncation && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-1 h-6 text-xs"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? (
            <>
              <ChevronDown className="h-3 w-3 mr-1" /> Show less
            </>
          ) : (
            <>
              <ChevronRight className="h-3 w-3 mr-1" /> Show more ({Object.keys(data).length} keys)
            </>
          )}
        </Button>
      )}
    </div>
  );
};

export function InitialSubmissionViewer({ 
  submissions, 
  loading, 
  companyId,
  companyName,
  onEdit,
  onAdd 
}: InitialSubmissionViewerProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Database className="h-5 w-5 animate-pulse mr-2" />
        Loading submissions...
      </div>
    );
  }

  const initialSubmission = findInitialSubmission(submissions);

  // No initial submission - show empty state with Add button
  if (!initialSubmission) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12">
          <FileJson className="h-12 w-12 text-muted-foreground mb-4" />
          <h3 className="text-lg font-medium mb-2">No Initial Submission</h3>
          <p className="text-sm text-muted-foreground text-center mb-6 max-w-md">
            No submission data has been received for {companyName} yet. 
            Add initial data to start processing workflows.
          </p>
          <Button onClick={onAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Add Initial Submission
          </Button>
        </CardContent>
      </Card>
    );
  }

  // Has initial submission - show the data with Edit button
  const fieldCounts = getFieldCount(initialSubmission.raw_data);

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              Initial Submission
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardTitle>
            <div className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="flex items-center gap-1">
                <Building className="h-3 w-3" />
                Source: {getSourceDisplayName(initialSubmission.source_type)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {format(new Date(initialSubmission.submitted_at), 'MMM d, yyyy h:mm a')}
              </span>
              {getStatusBadge(initialSubmission.status)}
            </div>
          </div>
          <Button variant="outline" onClick={() => onEdit(initialSubmission)}>
            <Edit className="h-4 w-4 mr-2" />
            Edit Submission
          </Button>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Company Info Section */}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-3 block flex items-center gap-2">
            <Building className="h-3 w-3" /> Company Information ({fieldCounts.topLevel} fields)
          </label>
          <CompanyInfoSection rawData={initialSubmission.raw_data} />
        </div>
        
        <Separator />
        
        {/* Intake Fields Table */}
        {initialSubmission.raw_data.intake_fields && (
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-3 block flex items-center gap-2">
              <FileText className="h-3 w-3" /> Intake Responses ({fieldCounts.intake} fields)
            </label>
            <IntakeFieldsTable intakeFields={initialSubmission.raw_data.intake_fields} />
          </div>
        )}
        
        {/* Error message if any */}
        {initialSubmission.error_message && (
          <div className="p-3 bg-destructive/10 rounded-md border border-destructive/20">
            <label className="text-xs font-medium text-destructive mb-1 block">
              Error
            </label>
            <p className="text-sm text-destructive">{initialSubmission.error_message}</p>
          </div>
        )}
        
        {/* Raw JSON toggle (for debugging) */}
        <Collapsible>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="text-xs h-7">
              <FileJson className="h-3 w-3 mr-1" /> View Raw JSON
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-2">
            <JsonViewer data={initialSubmission.raw_data} maxHeight="400px" />
            
            {initialSubmission.metadata && Object.keys(initialSubmission.metadata).length > 0 && (
              <div className="mt-3">
                <label className="text-xs font-medium text-muted-foreground mb-1 block">
                  Metadata
                </label>
                <JsonViewer data={initialSubmission.metadata} maxHeight="150px" />
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>

        <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t">
          <span>ID: {initialSubmission.id.slice(0, 8)}...</span>
          {initialSubmission.processed_at && (
            <span>
              Processed: {format(new Date(initialSubmission.processed_at), 'MMM d, yyyy h:mm a')}
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
