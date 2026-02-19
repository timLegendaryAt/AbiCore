import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AITool } from '@/types/ai-agent';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AIToolDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tool?: AITool;
  onSave: () => void;
}

export function AIToolDialog({ open, onOpenChange, tool, onSave }: AIToolDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [parameters, setParameters] = useState('{}');
  const [isSaving, setIsSaving] = useState(false);
  const [jsonError, setJsonError] = useState('');

  useEffect(() => {
    if (tool) {
      setName(tool.name);
      setDescription(tool.description);
      setParameters(JSON.stringify(tool.parameters, null, 2));
    } else {
      setName('');
      setDescription('');
      setParameters('{\n  "type": "object",\n  "properties": {}\n}');
    }
    setJsonError('');
  }, [tool, open]);

  const validateJson = (value: string) => {
    try {
      JSON.parse(value);
      setJsonError('');
      return true;
    } catch (e) {
      setJsonError('Invalid JSON syntax');
      return false;
    }
  };

  const handleParametersChange = (value: string) => {
    setParameters(value);
    validateJson(value);
  };

  const handleSave = async () => {
    if (!name.trim() || !description.trim()) {
      toast.error('Please fill in all required fields');
      return;
    }

    if (!validateJson(parameters)) {
      toast.error('Please fix JSON syntax errors');
      return;
    }

    setIsSaving(true);

    try {
      const parsedParameters = JSON.parse(parameters);

      if (tool) {
        // Update existing tool
        const { error } = await supabase
          .from('ai_tools')
          .update({
            name,
            description,
            parameters: parsedParameters,
          })
          .eq('id', tool.id);

        if (error) throw error;
        toast.success('Tool updated successfully');
      } else {
        // Create new tool
        const { error } = await supabase
          .from('ai_tools')
          .insert({
            name,
            description,
            parameters: parsedParameters,
          });

        if (error) throw error;
        toast.success('Tool created successfully');
      }

      onSave();
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error saving tool:', error);
      if (error.code === '23505') {
        toast.error('A tool with this name already exists');
      } else {
        toast.error('Failed to save tool');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tool ? 'Edit Tool' : 'Create New Tool'}</DialogTitle>
          <DialogDescription>
            {tool ? 'Update tool configuration' : 'Define a new tool that AI agents can use'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tool-name">Tool Name</Label>
            <Input
              id="tool-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., search_database"
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Use snake_case for function names (e.g., analyze_workflow)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="tool-description">Description</Label>
            <Textarea
              id="tool-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe what this tool does and when it should be used"
              rows={3}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tool-parameters">Parameters Schema (JSON)</Label>
            <Textarea
              id="tool-parameters"
              value={parameters}
              onChange={(e) => handleParametersChange(e.target.value)}
              placeholder='{"type": "object", "properties": {...}}'
              rows={12}
              className="font-mono text-sm"
            />
            {jsonError && (
              <p className="text-xs text-destructive">{jsonError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Define the tool's parameters using JSON Schema format
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving || !!jsonError}>
              {isSaving ? 'Saving...' : tool ? 'Save Changes' : 'Create Tool'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
