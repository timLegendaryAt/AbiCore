import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Framework, FrameworkFormData } from "@/types/framework";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { FrameworkCard } from "@/components/frameworks/FrameworkCard";
import { FrameworkCategoryFilter } from "@/components/frameworks/FrameworkCategoryFilter";
import { FrameworkEditor } from "@/components/frameworks/FrameworkEditor";
import { toast } from "sonner";
import { Plus, Search } from "lucide-react";
import { useWorkflowStore } from "@/store/workflowStore";

const Frameworks = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'editor'>('list');
  const [editingFramework, setEditingFramework] = useState<Framework | undefined>(undefined);
  const [deletingFramework, setDeletingFramework] = useState<Framework | undefined>(undefined);
  const [lifecycleMode, setLifecycleMode] = useState(false);
  
  const queryClient = useQueryClient();
  const { loadWorkflows } = useWorkflowStore();

  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: loadWorkflows
  });

  const { data: frameworks = [], isLoading, error } = useQuery({
    queryKey: ["frameworks"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("frameworks")
        .select("*")
        .order("created_at", { ascending: false });
      
      if (error) throw error;
      return data as Framework[];
    }
  });

  const createMutation = useMutation({
    mutationFn: async (formData: FrameworkFormData) => {
      const { data, error } = await supabase
        .from("frameworks")
        .insert({
          name: formData.name,
          description: formData.description || null,
          type: formData.type,
          category: formData.category,
          workflow_association: formData.workflow_association || null,
          schema: formData.type === 'document' 
            ? formData.schema 
            : JSON.parse(formData.schema),
          language: formData.language || null,
          score: formData.score || null,
          is_template: formData.is_template
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frameworks"] });
      toast.success("Framework created successfully");
      setViewMode('list');
      setEditingFramework(undefined);
      setLifecycleMode(false);
    },
    onError: () => {
      toast.error("Failed to create framework");
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, formData }: { id: string; formData: FrameworkFormData }) => {
      const { data, error } = await supabase
        .from("frameworks")
        .update({
          name: formData.name,
          description: formData.description || null,
          type: formData.type,
          category: formData.category,
          workflow_association: formData.workflow_association || null,
          schema: formData.type === 'document'
            ? formData.schema
            : JSON.parse(formData.schema),
          language: formData.language || null,
          score: formData.score || null,
          is_template: formData.is_template
        })
        .eq("id", id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frameworks"] });
      toast.success("Framework updated successfully");
      setViewMode('list');
      setEditingFramework(undefined);
      setLifecycleMode(false);
    },
    onError: () => {
      toast.error("Failed to update framework");
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("frameworks")
        .delete()
        .eq("id", id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["frameworks"] });
      toast.success("Framework deleted successfully");
      setDeletingFramework(undefined);
    },
    onError: () => {
      toast.error("Failed to delete framework");
    }
  });

  const handleCreateNew = () => {
    setEditingFramework(undefined);
    setLifecycleMode(activeCategory === "lifecycles");
    setViewMode('editor');
  };

  const handleEdit = (framework: Framework) => {
    setEditingFramework(framework);
    setLifecycleMode(framework.category === "lifecycle");
    setViewMode('editor');
  };

  const handleEditorCancel = () => {
    setViewMode('list');
    setEditingFramework(undefined);
    setLifecycleMode(false);
  };

  const handleEditorSubmit = (formData: FrameworkFormData) => {
    if (editingFramework) {
      updateMutation.mutate({ id: editingFramework.id, formData });
    } else {
      createMutation.mutate(formData);
    }
  };

  const handleDuplicate = (framework: Framework) => {
    const duplicateData: FrameworkFormData = {
      name: `${framework.name} (Copy)`,
      description: framework.description || "",
      type: framework.type,
      category: framework.category || "general",
      workflow_association: framework.workflow_association || "",
      schema: framework.type === 'document'
        ? (typeof framework.schema === 'string' ? framework.schema : JSON.stringify(framework.schema))
        : JSON.stringify(framework.schema, null, 2),
      language: framework.language || "",
      score: framework.score || "",
      is_template: false
    };
    createMutation.mutate(duplicateData);
  };

  const handleDelete = (framework: Framework) => {
    setDeletingFramework(framework);
  };

  const filteredFrameworks = useMemo(() => {
    let filtered = frameworks;

    // Category filter
    if (activeCategory === "workflow") {
      if (selectedWorkflowId) {
        filtered = filtered.filter(f => f.workflow_association === selectedWorkflowId);
      } else {
        filtered = filtered.filter(f => f.category === "workflow");
      }
  } else if (activeCategory === "scoring") {
      filtered = filtered.filter(f => f.category?.toLowerCase() === "scoring");
    } else if (activeCategory === "general") {
      filtered = filtered.filter(f => f.category === "general");
    } else if (activeCategory === "lifecycles") {
      filtered = filtered.filter(f => f.category === "lifecycle");
    } else if (activeCategory !== "all") {
      // Custom category filter
      filtered = filtered.filter(f => f.category === activeCategory);
    }

    // Search filter
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      filtered = filtered.filter(f => 
        f.name.toLowerCase().includes(term) || 
        f.description?.toLowerCase().includes(term)
      );
    }

    return filtered;
  }, [frameworks, activeCategory, selectedWorkflowId, searchTerm]);

  const categoryCounts = useMemo(() => ({
    all: frameworks.length,
    workflow: frameworks.filter(f => f.category === "workflow").length,
    scoring: frameworks.filter(f => f.category?.toLowerCase() === "scoring").length,
    general: frameworks.filter(f => f.category === "general").length,
    lifecycles: frameworks.filter(f => f.category === "lifecycle").length
  }), [frameworks]);

  // Extract custom categories (not system categories)
  const customCategories = useMemo(() => {
    const systemCategories = ['general', 'workflow', 'lifecycle', 'scoring'];
    const categoryMap: Record<string, number> = {};
    
    frameworks.forEach(f => {
      if (f.category && !systemCategories.includes(f.category.toLowerCase())) {
        categoryMap[f.category] = (categoryMap[f.category] || 0) + 1;
      }
    });
    
    return Object.entries(categoryMap)
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => a.category.localeCompare(b.category));
  }, [frameworks]);

  const workflowCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    workflows.forEach(workflow => {
      counts[workflow.id] = frameworks.filter(
        f => f.workflow_association === workflow.id
      ).length;
    });
    return counts;
  }, [frameworks, workflows]);

  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    if (category !== "workflow") {
      setSelectedWorkflowId(null);
    }
  };

  // Render editor view
  if (viewMode === 'editor') {
    return (
      <FrameworkEditor
        framework={editingFramework}
        workflows={workflows}
        lifecycleMode={lifecycleMode}
        onSubmit={handleEditorSubmit}
        onCancel={handleEditorCancel}
      />
    );
  }

  // Error state
  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive">Failed to load frameworks</p>
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["frameworks"] })}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="flex flex-col h-full w-full bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-8 space-y-4">
          {/* Search bar */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search frameworks..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 h-12"
            />
          </div>

          {/* Category tabs + Create button */}
          <div className="flex items-center justify-between gap-4">
            <FrameworkCategoryFilter
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              selectedWorkflowId={selectedWorkflowId}
              onWorkflowSelect={setSelectedWorkflowId}
              workflows={workflows}
              workflowCounts={workflowCounts}
              customCategories={customCategories}
              counts={categoryCounts}
            />
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              {activeCategory === "lifecycles" ? "Add Lifecycle" : "Create Framework"}
            </Button>
          </div>

          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-64" />
              ))}
            </div>
          ) : filteredFrameworks.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <p className="text-muted-foreground">
                {searchTerm || activeCategory !== "all"
                  ? "No frameworks found matching your filters"
                  : "No frameworks yet. Create your first framework!"}
              </p>
              {!searchTerm && activeCategory === "all" && (
                <Button onClick={handleCreateNew} variant="outline">
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Framework
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredFrameworks.map((framework) => (
                <FrameworkCard
                  key={framework.id}
                  framework={framework}
                  onEdit={handleEdit}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}

          <AlertDialog open={!!deletingFramework} onOpenChange={() => setDeletingFramework(undefined)}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete Framework</AlertDialogTitle>
                <AlertDialogDescription>
                  Are you sure you want to delete "{deletingFramework?.name}"? This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => deletingFramework && deleteMutation.mutate(deletingFramework.id)}
                >
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
};

export default Frameworks;
