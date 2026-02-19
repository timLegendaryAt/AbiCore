import { Plus, Trash2 } from 'lucide-react';
import { useWorkflowStore } from '@/store/workflowStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useState } from 'react';

export function VariablesPanel() {
  const { workflow, addVariable, updateVariable, deleteVariable } = useWorkflowStore();
  const [showAddForm, setShowAddForm] = useState(false);
  const [newVariable, setNewVariable] = useState({
    name: '',
    type: 'string' as 'string' | 'number' | 'boolean' | 'json',
    default: '',
  });

  const handleAddVariable = () => {
    if (!newVariable.name) return;
    addVariable({
      ...newVariable,
      default: newVariable.default || undefined,
    });
    setNewVariable({ name: '', type: 'string', default: '' });
    setShowAddForm(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Variables</h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setShowAddForm(!showAddForm)}
        >
          <Plus className="w-4 h-4 mr-1" />
          Add
        </Button>
      </div>

      {showAddForm && (
        <div className="mb-4 p-4 border border-border rounded-lg bg-card space-y-3">
          <div>
            <Label htmlFor="new-var-name">Name</Label>
            <Input
              id="new-var-name"
              value={newVariable.name}
              onChange={(e) => setNewVariable({ ...newVariable, name: e.target.value })}
              placeholder="Variable name"
            />
          </div>

          <div>
            <Label htmlFor="new-var-type">Type</Label>
            <Select
              value={newVariable.type}
              onValueChange={(value: any) => setNewVariable({ ...newVariable, type: value })}
            >
              <SelectTrigger id="new-var-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="string">String</SelectItem>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="boolean">Boolean</SelectItem>
                <SelectItem value="json">JSON</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="new-var-default">Default</Label>
            <Input
              id="new-var-default"
              value={newVariable.default}
              onChange={(e) => setNewVariable({ ...newVariable, default: e.target.value })}
              placeholder="Default value"
            />
          </div>

          <div className="flex gap-2">
            <Button onClick={handleAddVariable} size="sm">
              Add Variable
            </Button>
            <Button onClick={() => setShowAddForm(false)} size="sm" variant="outline">
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {workflow.variables.length === 0 && !showAddForm && (
          <p className="text-sm text-muted-foreground text-center py-8">
            No variables defined yet. Click Add to create one.
          </p>
        )}

        {workflow.variables.map((variable) => (
          <div
            key={variable.name}
            className="p-3 border border-border rounded-lg bg-card"
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex-1">
                <div className="font-medium text-sm text-foreground">{variable.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5">
                  Type: {variable.type}
                  {variable.default && ` • Default: ${variable.default}`}
                </div>
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => deleteVariable(variable.name)}
                className="h-6 w-6 p-0"
              >
                <Trash2 className="w-3 h-3" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
