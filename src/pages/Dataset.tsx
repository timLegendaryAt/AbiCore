import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useWorkflowStore } from "@/store/workflowStore";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Plus, Search } from "lucide-react";
import { toast } from "sonner";
import type { Dataset, DatasetFormData } from "@/types/dataset";
import { DatasetCard } from "@/components/datasets/DatasetCard";
import { DatasetForm } from "@/components/datasets/DatasetForm";
import { DatasetCategoryFilter } from "@/components/datasets/DatasetCategoryFilter";
import { Skeleton } from "@/components/ui/skeleton";

const Dataset = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [editingDataset, setEditingDataset] = useState<Dataset | undefined>();
  const [deletingDataset, setDeletingDataset] = useState<Dataset | undefined>();
  const [activeCategory, setActiveCategory] = useState("all");
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);

  const queryClient = useQueryClient();
  const { loadWorkflows } = useWorkflowStore();

  // Fetch datasets
  const { data: datasets, isLoading, error } = useQuery({
    queryKey: ["datasets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("datasets")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data.map(d => ({
        ...d,
        dependencies: d.dependencies as any as Dataset['dependencies']
      })) as Dataset[];
    },
  });

  // Fetch workflows
  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: loadWorkflows,
  });

  // Create dataset mutation
  const createDataset = useMutation({
    mutationFn: async (newDataset: DatasetFormData) => {
      const { error } = await supabase.from("datasets").insert([
        {
          name: newDataset.name,
          description: newDataset.description || null,
          category: newDataset.category,
          dependencies: newDataset.dependencies as any,
        },
      ]);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      toast.success("Dataset created successfully");
      setIsDrawerOpen(false);
      setEditingDataset(undefined);
    },
    onError: (error) => {
      toast.error("Failed to create dataset: " + error.message);
    },
  });

  // Update dataset mutation
  const updateDataset = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: DatasetFormData }) => {
      const { error } = await supabase
        .from("datasets")
        .update({
          name: data.name,
          description: data.description || null,
          category: data.category,
          dependencies: data.dependencies as any,
        })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      toast.success("Dataset updated successfully");
      setIsDrawerOpen(false);
      setEditingDataset(undefined);
    },
    onError: (error) => {
      toast.error("Failed to update dataset: " + error.message);
    },
  });

  // Delete dataset mutation
  const deleteDataset = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("datasets").delete().eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["datasets"] });
      toast.success("Dataset deleted successfully");
      setDeletingDataset(undefined);
    },
    onError: (error) => {
      toast.error("Failed to delete dataset: " + error.message);
    },
  });

  // Handlers
  const handleCreateNew = () => {
    setEditingDataset(undefined);
    setIsDrawerOpen(true);
  };

  const handleEdit = (dataset: Dataset) => {
    setEditingDataset(dataset);
    setIsDrawerOpen(true);
  };

  const handleDuplicate = (dataset: Dataset) => {
    const duplicateData: DatasetFormData = {
      name: `${dataset.name} (Copy)`,
      description: dataset.description || "",
      category: dataset.category,
      dependencies: dataset.dependencies,
    };
    createDataset.mutate(duplicateData);
  };

  const handleDelete = (dataset: Dataset) => {
    setDeletingDataset(dataset);
  };

  const confirmDelete = () => {
    if (deletingDataset) {
      deleteDataset.mutate(deletingDataset.id);
    }
  };

  const handleSubmit = (data: DatasetFormData) => {
    if (editingDataset) {
      updateDataset.mutate({ id: editingDataset.id, data });
    } else {
      createDataset.mutate(data);
    }
  };

  // Category filtering
  const handleCategoryChange = (category: string) => {
    setActiveCategory(category);
    if (category !== "workflow") {
      setSelectedWorkflowId(null);
    }
  };

  // Calculate category counts
  const categoryCounts = useMemo(() => ({
    all: datasets?.length || 0,
    workflow: datasets?.filter(d => d.category === "workflow").length || 0,
    general: datasets?.filter(d => d.category === "general").length || 0,
  }), [datasets]);

  // Calculate workflow counts
  const workflowCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    workflows.forEach(workflow => {
      counts[workflow.id] = (datasets || []).filter(dataset =>
        dataset.dependencies.some(dep => dep.workflowId === workflow.id)
      ).length;
    });
    return counts;
  }, [datasets, workflows]);

  // Filter datasets
  const filteredDatasets = useMemo(() => {
    let filtered = datasets || [];

    // Category filter
    if (activeCategory === "workflow") {
      if (selectedWorkflowId) {
        // Show datasets containing ANY dependency from selected workflow
        filtered = filtered.filter(dataset =>
          dataset.dependencies.some(dep => dep.workflowId === selectedWorkflowId)
        );
      } else {
        // Show all workflow-category datasets
        filtered = filtered.filter(d => d.category === "workflow");
      }
    } else if (activeCategory === "general") {
      filtered = filtered.filter(d => d.category === "general");
    }
    // "all" shows everything

    // Search filter
    if (searchTerm) {
      const lowerSearch = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (dataset) =>
          dataset.name.toLowerCase().includes(lowerSearch) ||
          dataset.description?.toLowerCase().includes(lowerSearch)
      );
    }

    return filtered;
  }, [datasets, activeCategory, selectedWorkflowId, searchTerm]);

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-destructive">Failed to load datasets</p>
          <Button onClick={() => queryClient.invalidateQueries({ queryKey: ["datasets"] })}>
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-background">
      <div className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-8 space-y-4">
          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-3.5 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search datasets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-12 h-12"
            />
          </div>

          {/* Category Filter + Create Button */}
          <div className="flex items-center justify-between gap-4">
            <DatasetCategoryFilter
              activeCategory={activeCategory}
              onCategoryChange={handleCategoryChange}
              selectedWorkflowId={selectedWorkflowId}
              onWorkflowSelect={setSelectedWorkflowId}
              workflows={workflows}
              workflowCounts={workflowCounts}
              counts={categoryCounts}
            />
            <Button onClick={handleCreateNew}>
              <Plus className="h-4 w-4 mr-2" />
              Create Dataset
            </Button>
          </div>

          {/* Content */}
          {isLoading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[1, 2, 3].map((i) => (
                <Skeleton key={i} className="h-[250px]" />
              ))}
            </div>
          ) : filteredDatasets.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {searchTerm || activeCategory !== "all"
                  ? "No datasets found matching your filters"
                  : "No datasets yet. Create your first dataset!"}
              </p>
              {!searchTerm && activeCategory === "all" && (
                <Button onClick={handleCreateNew}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Your First Dataset
                </Button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredDatasets.map((dataset) => (
                <DatasetCard
                  key={dataset.id}
                  dataset={dataset}
                  onEdit={handleEdit}
                  onDuplicate={handleDuplicate}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Drawer */}
      <Sheet open={isDrawerOpen} onOpenChange={setIsDrawerOpen}>
        <SheetContent className="overflow-y-auto sm:max-w-[540px]">
          <SheetHeader>
            <SheetTitle>{editingDataset ? "Edit Dataset" : "Create Dataset"}</SheetTitle>
            <SheetDescription>
              {editingDataset
                ? "Update the dataset information and dependencies"
                : "Create a new dataset by bundling multiple dependencies"}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-6">
            <DatasetForm
              initialData={
                editingDataset
                  ? {
                      name: editingDataset.name,
                      description: editingDataset.description || "",
                      category: editingDataset.category,
                      dependencies: editingDataset.dependencies,
                    }
                  : undefined
              }
              onSubmit={handleSubmit}
              onCancel={() => {
                setIsDrawerOpen(false);
                setEditingDataset(undefined);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={!!deletingDataset} onOpenChange={() => setDeletingDataset(undefined)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Dataset</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deletingDataset?.name}"? This action cannot be
              undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default Dataset;
