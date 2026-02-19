import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Loader2, CheckCircle2, Wand2, Eye, EyeOff } from 'lucide-react';
import { Submission } from '@/lib/submissionUtils';

interface AddSubmissionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  companyName: string;
  workflows: { id: string; name: string }[];
  onSuccess: () => void;
  existingSubmission?: Submission; // If provided, switches to edit mode
}

// Default field names for tab-separated data
const DEFAULT_FIELDS = [
  'first_name',
  'last_name',
  'id',
  'email',
  'company_name',
  'company_description',
  'vision_mission',
  'state',
  'industry',
  'problem_statement',
  'solution',
  'additional_info'
];

// Intelligently parse any input to JSON
const parseToJson = (input: string, fieldNames: string[]): { data: any; format: string } | null => {
  const trimmed = input.trim();
  
  if (!trimmed) return null;

  // 1. Try parsing as JSON first
  try {
    const parsed = JSON.parse(trimmed);
    return { data: parsed, format: 'json' };
  } catch {
    // Not valid JSON, continue to other formats
  }

  // 2. Check for tab-separated values (single row with tabs)
  if (trimmed.includes('\t')) {
    const values = trimmed.split('\t').map(v => v.trim());
    const result: Record<string, string> = {};
    
    values.forEach((value, index) => {
      const fieldName = fieldNames[index] || `field_${index + 1}`;
      if (value) {
        result[fieldName] = value;
      }
    });
    
    return { data: result, format: 'tab-separated' };
  }

  // 3. Check for key:value or key=value pairs (one per line)
  const lines = trimmed.split('\n').filter(l => l.trim());
  const keyValuePattern = /^([^:=]+)[=:](.+)$/;
  const kvMatches = lines.filter(l => keyValuePattern.test(l.trim()));
  
  if (kvMatches.length > 0 && kvMatches.length >= lines.length * 0.5) {
    const result: Record<string, string> = {};
    lines.forEach(line => {
      const match = line.trim().match(keyValuePattern);
      if (match) {
        const key = match[1].trim().toLowerCase().replace(/\s+/g, '_');
        const value = match[2].trim();
        result[key] = value;
      }
    });
    return { data: result, format: 'key-value' };
  }

  // 4. Check for comma-separated values
  if (trimmed.includes(',') && !trimmed.includes('\n')) {
    const values = trimmed.split(',').map(v => v.trim());
    const result: Record<string, string> = {};
    
    values.forEach((value, index) => {
      const fieldName = fieldNames[index] || `field_${index + 1}`;
      if (value) {
        result[fieldName] = value;
      }
    });
    
    return { data: result, format: 'comma-separated' };
  }

  // 5. Multi-line text - treat as content with line breaks
  if (lines.length > 1) {
    return { 
      data: { 
        content: trimmed,
        lines: lines 
      }, 
      format: 'multi-line' 
    };
  }

  // 6. Single text value - wrap in object
  return { 
    data: { content: trimmed }, 
    format: 'text' 
  };
};

export function AddSubmissionDialog({
  open,
  onOpenChange,
  companyId,
  companyName,
  workflows,
  onSuccess,
  existingSubmission,
}: AddSubmissionDialogProps) {
  const [rawInput, setRawInput] = useState('');
  const [parsedData, setParsedData] = useState<any>(null);
  const [detectedFormat, setDetectedFormat] = useState<string | null>(null);
  const [selectedWorkflow, setSelectedWorkflow] = useState<string>('all');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [customFields, setCustomFields] = useState(DEFAULT_FIELDS.join(', '));
  const { toast } = useToast();

  const isEditMode = !!existingSubmission;
  const dialogTitle = isEditMode ? 'Edit Initial Submission' : 'Add Initial Submission';
  const dialogDescription = isEditMode 
    ? `Update the submission data for ${companyName}. Changes will trigger workflow re-processing.`
    : `Submit data for ${companyName}. Paste any format - JSON, tab-separated, key-value pairs, or plain text - and it will be automatically converted.`;

  // Pre-populate form when editing
  useEffect(() => {
    if (existingSubmission && open) {
      const jsonStr = JSON.stringify(existingSubmission.raw_data, null, 2);
      setRawInput(jsonStr);
      setParsedData(existingSubmission.raw_data);
      setDetectedFormat('json');
      setShowPreview(true);
    }
  }, [existingSubmission, open]);

  // Parse input whenever it changes
  useEffect(() => {
    if (!rawInput.trim()) {
      setParsedData(null);
      setDetectedFormat(null);
      return;
    }

    const fieldNames = customFields.split(',').map(f => f.trim()).filter(Boolean);
    const result = parseToJson(rawInput, fieldNames.length > 0 ? fieldNames : DEFAULT_FIELDS);
    
    if (result) {
      setParsedData(result.data);
      setDetectedFormat(result.format);
    } else {
      setParsedData(null);
      setDetectedFormat(null);
    }
  }, [rawInput, customFields]);

  const handleSubmit = async () => {
    if (!parsedData) {
      toast({
        title: 'No data to submit',
        description: 'Please enter some data',
        variant: 'destructive',
      });
      return;
    }

    setIsSubmitting(true);

    try {
      let submissionId: string;

      if (isEditMode && existingSubmission) {
        // UPDATE existing submission
        const { error: updateError } = await supabase
          .from('company_data_submissions')
          .update({
            raw_data: parsedData,
            status: 'processing',
            metadata: { 
              ...existingSubmission.metadata,
              last_edited_at: new Date().toISOString(),
              edited_via: 'ui',
              detected_format: detectedFormat,
            },
          })
          .eq('id', existingSubmission.id);

        if (updateError) throw updateError;
        submissionId = existingSubmission.id;
      } else {
        // INSERT new submission
        const { data: submission, error: insertError } = await supabase
          .from('company_data_submissions')
          .insert({
            company_id: companyId,
            raw_data: parsedData,
            source_type: 'manual',
            status: 'processing',
            metadata: { 
              submitted_via: 'ui',
              detected_format: detectedFormat,
              workflow_filter: selectedWorkflow === 'all' ? null : selectedWorkflow
            },
          })
          .select()
          .single();

        if (insertError) throw insertError;
        submissionId = submission.id;
      }

      // Call the run-company-workflows edge function
      const { data: functionData, error: functionError } = await supabase.functions.invoke(
        'run-company-workflows',
        {
          body: {
            company_id: companyId,
            submission_id: submissionId,
            workflow_id: selectedWorkflow === 'all' ? null : selectedWorkflow,
            force: isEditMode, // Force re-run all workflows when editing
          },
        }
      );

      if (functionError) {
        // Update submission to failed
        await supabase
          .from('company_data_submissions')
          .update({ 
            status: 'failed',
            error_message: functionError.message 
          })
          .eq('id', submissionId);

        throw functionError;
      }

      const actionWord = isEditMode ? 'updated' : 'submitted';
      toast({
        title: `Data ${actionWord} successfully`,
        description: `Processed ${functionData?.workflows_processed || 0} workflow(s) in ${functionData?.execution_time_ms || 0}ms`,
      });

      // Reset form and close dialog
      setRawInput('');
      setParsedData(null);
      setDetectedFormat(null);
      setSelectedWorkflow('all');
      setShowPreview(false);
      onOpenChange(false);
      onSuccess();
    } catch (error: any) {
      console.error('Error submitting data:', error);
      const actionWord = isEditMode ? 'update' : 'submission';
      toast({
        title: `${isEditMode ? 'Update' : 'Submission'} failed`,
        description: error.message || `Failed to ${actionWord} data`,
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      setRawInput('');
      setParsedData(null);
      setDetectedFormat(null);
      setSelectedWorkflow('all');
      setShowPreview(false);
      onOpenChange(false);
    }
  };

  const getFormatLabel = (format: string | null) => {
    switch (format) {
      case 'json': return 'JSON';
      case 'tab-separated': return 'Tab-separated';
      case 'key-value': return 'Key-value pairs';
      case 'comma-separated': return 'Comma-separated';
      case 'multi-line': return 'Multi-line text';
      case 'text': return 'Plain text';
      default: return 'Unknown';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{dialogTitle}</DialogTitle>
          <DialogDescription>
            {dialogDescription}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Workflow Selector */}
          <div className="space-y-2">
            <Label htmlFor="workflow">Target Workflow (optional)</Label>
            <Select value={selectedWorkflow} onValueChange={setSelectedWorkflow}>
              <SelectTrigger>
                <SelectValue placeholder="All workflows with Company Ingest" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All workflows with Company Ingest</SelectItem>
                {workflows.map((workflow) => (
                  <SelectItem key={workflow.id} value={workflow.id}>
                    {workflow.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Field Names (for tab/comma separated) */}
          <div className="space-y-2">
            <Label htmlFor="field-names">
              Field Names <span className="text-muted-foreground text-xs">(for tab/comma-separated data)</span>
            </Label>
            <Input
              id="field-names"
              value={customFields}
              onChange={(e) => setCustomFields(e.target.value)}
              placeholder="field1, field2, field3..."
              className="text-sm"
              disabled={isSubmitting}
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated list of field names. Used when pasting tab or comma-separated values.
            </p>
          </div>

          {/* Raw Input */}
          <div className="space-y-2">
            <Label htmlFor="raw-input" className="flex items-center gap-2">
              <Wand2 className="h-4 w-4" />
              Paste Your Data
              {detectedFormat && (
                <span className="ml-2 text-xs font-normal text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Detected: {getFormatLabel(detectedFormat)}
                </span>
              )}
            </Label>
            <Textarea
              id="raw-input"
              value={rawInput}
              onChange={(e) => setRawInput(e.target.value)}
              placeholder={`Paste data in any format:

• JSON: {"name": "value", ...}
• Tab-separated: value1    value2    value3
• Key-value: name: John, email: john@example.com
• Or just plain text`}
              className="text-sm min-h-[180px] resize-y"
              disabled={isSubmitting}
            />
          </div>

          {/* Preview Toggle & JSON Preview */}
          {parsedData && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label className="text-sm">Parsed Result</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPreview(!showPreview)}
                  className="h-7 text-xs"
                >
                  {showPreview ? (
                    <>
                      <EyeOff className="h-3 w-3 mr-1" />
                      Hide Preview
                    </>
                  ) : (
                    <>
                      <Eye className="h-3 w-3 mr-1" />
                      Show Preview
                    </>
                  )}
                </Button>
              </div>
              
              {showPreview && (
                <pre className="p-3 bg-muted rounded-lg text-xs font-mono overflow-x-auto max-h-[200px] overflow-y-auto">
                  {JSON.stringify(parsedData, null, 2)}
                </pre>
              )}
              
              {!showPreview && (
                <div className="p-3 bg-muted rounded-lg text-xs text-muted-foreground">
                  {Object.keys(parsedData).length} field(s) detected. Click "Show Preview" to see the parsed JSON.
                </div>
              )}
            </div>
          )}

          {/* Supported Formats */}
          <div className="p-3 bg-muted/50 rounded-lg border">
            <Label className="text-xs font-medium">Supported Formats</Label>
            <div className="grid grid-cols-2 gap-2 mt-2 text-xs text-muted-foreground">
              <div>• <strong>JSON:</strong> {`{"key": "value"}`}</div>
              <div>• <strong>Tab-separated:</strong> val1 [TAB] val2</div>
              <div>• <strong>Key-value:</strong> name: John</div>
              <div>• <strong>Comma-separated:</strong> val1, val2, val3</div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || !parsedData}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : isEditMode ? (
              'Save Changes'
            ) : (
              'Submit Data'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
