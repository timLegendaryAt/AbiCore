import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatasetFormData, DatasetDependency } from "@/types/dataset";
import { useState, useEffect } from "react";
import { DependencySelector } from "@/components/workflow/DependencySelector";
import { Plus, X, GripVertical, Link, Plug } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Integration } from "@/types/integration";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  description: z.string(),
  category: z.enum(["general", "workflow"]),
  dependencies: z.array(z.object({
    nodeId: z.string(),
    nodeName: z.string(),
    nodeType: z.string(),
    workflowId: z.string(),
    workflowName: z.string(),
  })).min(1, "At least one dependency is required"),
});

interface SortableDependencyItemProps {
  dep: DatasetDependency;
  onRemove: (nodeId: string) => void;
}

const SortableDependencyItem = ({ dep, onRemove }: SortableDependencyItemProps) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: dep.nodeId });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center justify-between gap-2 p-2 bg-muted rounded-md"
    >
      <div
        {...attributes}
        {...listeners}
        className="cursor-grab active:cursor-grabbing p-1 hover:bg-muted-foreground/10 rounded"
      >
        <GripVertical className="h-4 w-4 text-muted-foreground" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium truncate">{dep.nodeName}</span>
          <Badge variant="secondary" className="shrink-0 text-xs">
            {dep.nodeType}
          </Badge>
          {dep.isIntegration && (
            <Badge variant="outline" className="shrink-0 text-xs">
              Integration
            </Badge>
          )}
        </div>
        {!dep.isIntegration && dep.workflowName && (
          <div className="text-xs text-muted-foreground truncate">
            {dep.workflowName}
          </div>
        )}
      </div>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => onRemove(dep.nodeId)}
        className="shrink-0"
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};

interface DatasetFormProps {
  initialData?: DatasetFormData;
  onSubmit: (data: DatasetFormData) => void;
  onCancel: () => void;
}

export const DatasetForm = ({ initialData, onSubmit, onCancel }: DatasetFormProps) => {
  const [showDependencySelector, setShowDependencySelector] = useState(false);
  const [showIntegrationSelector, setShowIntegrationSelector] = useState(false);
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  const form = useForm<DatasetFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: initialData || {
      name: "",
      description: "",
      category: "general",
      dependencies: [],
    },
  });

  const dependencies = form.watch("dependencies");

  useEffect(() => {
    const fetchIntegrations = async () => {
      const { data } = await supabase
        .from('integrations')
        .select('*')
        .order('name');
      if (data) setIntegrations(data as Integration[]);
    };
    fetchIntegrations();
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (over && active.id !== over.id) {
      const currentDeps = form.getValues("dependencies");
      const oldIndex = currentDeps.findIndex((d) => d.nodeId === active.id);
      const newIndex = currentDeps.findIndex((d) => d.nodeId === over.id);

      const reorderedDeps = arrayMove(currentDeps, oldIndex, newIndex);
      form.setValue("dependencies", reorderedDeps);
    }
  };

  const handleAddDependency = (nodeId: string, nodeName: string, nodeType: string, workflowId: string, workflowName: string) => {
    const newDep: DatasetDependency = {
      nodeId,
      nodeName,
      nodeType,
      workflowId,
      workflowName,
      isIntegration: nodeType === 'integration',
    };
    
    const currentDeps = form.getValues("dependencies");
    if (!currentDeps.find(d => d.nodeId === nodeId)) {
      form.setValue("dependencies", [...currentDeps, newDep]);
    }
  };

  const handleRemoveDependency = (nodeId: string) => {
    const currentDeps = form.getValues("dependencies");
    form.setValue("dependencies", currentDeps.filter(d => d.nodeId !== nodeId));
  };

  const handleAddIntegration = (integrationId: string) => {
    const integration = integrations.find(i => i.id === integrationId);
    if (!integration) return;
    
    const newDep: DatasetDependency = {
      nodeId: integrationId,
      nodeName: integration.name,
      nodeType: 'integration',
      workflowId: 'integrations',
      workflowName: 'Integrations',
      isIntegration: true,
    };
    
    const currentDeps = form.getValues("dependencies");
    if (!currentDeps.find(d => d.nodeId === integrationId)) {
      form.setValue("dependencies", [...currentDeps, newDep]);
    }
    setShowIntegrationSelector(false);
  };

  return (
    <>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="Dataset name" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="description"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Description (Optional)</FormLabel>
                <FormControl>
                  <Textarea 
                    placeholder="Describe this dataset..." 
                    className="resize-none" 
                    rows={3}
                    {...field} 
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="category"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Category</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="workflow">Workflow-Specific</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-sm text-muted-foreground">
                  General datasets are not tied to specific workflows
                </p>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="dependencies"
            render={() => (
              <FormItem>
                <FormLabel>Dependencies</FormLabel>
                <div className="space-y-2">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-full"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Component
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="w-[200px]">
                      <DropdownMenuItem onClick={() => setShowDependencySelector(true)}>
                        <Link className="h-4 w-4 mr-2" />
                        Dependency
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => setShowIntegrationSelector(true)}>
                        <Plug className="h-4 w-4 mr-2" />
                        Integration
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  {dependencies.length > 0 && (
                    <div className="border rounded-md p-3 space-y-2 max-h-[300px] overflow-y-auto">
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={handleDragEnd}
                      >
                        <SortableContext
                          items={dependencies.map(d => d.nodeId)}
                          strategy={verticalListSortingStrategy}
                        >
                          {dependencies.map((dep) => (
                            <SortableDependencyItem
                              key={dep.nodeId}
                              dep={dep}
                              onRemove={handleRemoveDependency}
                            />
                          ))}
                        </SortableContext>
                      </DndContext>
                    </div>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancel
            </Button>
            <Button type="submit">
              {initialData ? "Update" : "Create"} Dataset
            </Button>
          </div>
        </form>
      </Form>

      <DependencySelector
        open={showDependencySelector}
        onOpenChange={setShowDependencySelector}
        currentWorkflowId=""
        currentNodeId={undefined}
        onSelect={handleAddDependency}
        selectedIds={dependencies.map(d => d.nodeId)}
        title="Add Dependency to Dataset"
        description="Select nodes to include in this dataset"
      />

      <Dialog open={showIntegrationSelector} onOpenChange={setShowIntegrationSelector}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Select Integration</DialogTitle>
            <DialogDescription>
              Choose an integration to add as a data source
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 max-h-[400px] overflow-y-auto">
            {integrations.filter(i => i.connected).length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <p>No connected integrations available</p>
              </div>
            ) : (
              integrations
                .filter(i => i.connected)
                .map(integration => (
                  <Button
                    key={integration.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => handleAddIntegration(integration.id)}
                  >
                    <div 
                      className="w-8 h-8 rounded flex items-center justify-center text-white text-xs font-bold mr-3"
                      style={{ backgroundColor: integration.color }}
                    >
                      {integration.initials}
                    </div>
                    <div className="text-left">
                      <div className="font-medium">{integration.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {integration.description}
                      </div>
                    </div>
                  </Button>
                ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
