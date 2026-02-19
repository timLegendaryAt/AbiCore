import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Input } from '@/components/ui/input';
import { ChevronDown, ChevronRight, Database, Clock, FileJson, Building, FileText, Search } from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';

interface Submission {
  id: string;
  company_id: string;
  raw_data: Record<string, any>;
  status: string;
  source_type: string;
  submitted_at: string;
  processed_at: string | null;
  error_message: string | null;
  metadata: Record<string, any> | null;
}

interface SubmissionDataViewerProps {
  submissions: Submission[];
  loading: boolean;
}

const getStatusBadge = (status: string) => {
  const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    pending: 'secondary',
    processing: 'default',
    completed: 'default',
    failed: 'destructive',
  };
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

// Helper function to count meaningful fields in raw_data
const getFieldCount = (rawData: Record<string, any>) => {
  const intakeFieldsCount = rawData.intake_fields 
    ? Object.keys(rawData.intake_fields).length 
    : 0;
  
  const intakeSubmissionsCount = Array.isArray(rawData.intake_submissions)
    ? rawData.intake_submissions.length
    : 0;
  
  const topLevelCount = Object.keys(rawData).filter(
    k => k !== 'intake_fields' && k !== 'intake_submissions'
  ).length;
  
  const intakeCount = intakeFieldsCount || intakeSubmissionsCount;
  
  return {
    total: topLevelCount + intakeCount,
    topLevel: topLevelCount,
    intake: intakeCount,
  };
};

// Component for expandable long text values
const ExpandableValue = ({ value, fieldName }: { value: string; fieldName: string }) => {
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
    return <ExpandableValue value={value} fieldName={fieldName || 'field'} />;
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
    ([key]) => key !== 'intake_fields' && key !== 'intake_submissions'
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
      <ScrollArea className={`rounded-md border bg-muted/50`} style={{ maxHeight: expanded ? maxHeight : '150px' }}>
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

export function SubmissionDataViewer({ submissions, loading }: SubmissionDataViewerProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Database className="h-5 w-5 animate-pulse mr-2" />
        Loading submissions...
      </div>
    );
  }

  if (submissions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <FileJson className="h-10 w-10 text-muted-foreground mb-3" />
        <p className="text-muted-foreground">No data submissions yet</p>
        <p className="text-xs text-muted-foreground mt-1">
          Data will appear here when ingested via API or manual entry
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {submissions.map((submission) => (
        <Card key={submission.id} className="overflow-hidden">
          <CardHeader
            className="py-3 px-4 cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => setExpandedId(expandedId === submission.id ? null : submission.id)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Button variant="ghost" size="icon" className="h-6 w-6">
                  {expandedId === submission.id ? (
                    <ChevronDown className="h-4 w-4" />
                  ) : (
                    <ChevronRight className="h-4 w-4" />
                  )}
                </Button>
                <div>
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Clock className="h-3 w-3 text-muted-foreground" />
                    {format(new Date(submission.submitted_at), 'MMM d, yyyy h:mm a')}
                  </CardTitle>
                <div className="flex items-center gap-2 mt-1">
                    {getStatusBadge(submission.status)}
                    <span className="text-xs text-muted-foreground">
                      via {submission.source_type}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {(() => {
                        const counts = getFieldCount(submission.raw_data);
                        if (counts.intake > 0) {
                          return `• ${counts.intake} intake fields + ${counts.topLevel} company fields`;
                        }
                        return `• ${counts.total} fields`;
                      })()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </CardHeader>

          {expandedId === submission.id && (
            <CardContent className="pt-0 px-4 pb-4">
              <div className="space-y-4">
                {/* Company Info Section */}
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-2 block flex items-center gap-2">
                    <Building className="h-3 w-3" /> Company Information
                  </label>
                  <CompanyInfoSection rawData={submission.raw_data} />
                </div>
                
                <Separator />
                
                {/* Intake Fields Table */}
                {submission.raw_data.intake_fields && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground mb-2 block flex items-center gap-2">
                      <FileText className="h-3 w-3" /> Intake Responses ({Object.keys(submission.raw_data.intake_fields).length} fields)
                    </label>
                    <IntakeFieldsTable intakeFields={submission.raw_data.intake_fields} />
                  </div>
                )}
                
                {/* Error message if any */}
                {submission.error_message && (
                  <div className="p-3 bg-destructive/10 rounded-md border border-destructive/20">
                    <label className="text-xs font-medium text-destructive mb-1 block">
                      Error
                    </label>
                    <p className="text-sm text-destructive">{submission.error_message}</p>
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
                    <JsonViewer data={submission.raw_data} maxHeight="400px" />
                    
                    {submission.metadata && Object.keys(submission.metadata).length > 0 && (
                      <div className="mt-3">
                        <label className="text-xs font-medium text-muted-foreground mb-1 block">
                          Metadata
                        </label>
                        <JsonViewer data={submission.metadata} maxHeight="150px" />
                      </div>
                    )}
                  </CollapsibleContent>
                </Collapsible>

                <div className="flex gap-4 text-xs text-muted-foreground pt-2 border-t">
                  <span>ID: {submission.id.slice(0, 8)}...</span>
                  {submission.processed_at && (
                    <span>
                      Processed: {format(new Date(submission.processed_at), 'MMM d, yyyy h:mm a')}
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      ))}
    </div>
  );
}
