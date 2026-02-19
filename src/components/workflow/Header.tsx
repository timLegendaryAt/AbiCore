import { Zap, ChevronDown, Settings, Plus } from 'lucide-react';
import { saveCurrentWorkflow } from '@/hooks/useSaveOnEvent';
import { useWorkflowStore } from '@/store/workflowStore';
import { Button } from '@/components/ui/button';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
  NavigationMenu,
  NavigationMenuContent,
  NavigationMenuItem,
  NavigationMenuLink,
  NavigationMenuList,
  NavigationMenuTrigger,
} from '@/components/ui/navigation-menu';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { useEffect, useState } from 'react';
import { Workflow, WorkflowSettings, defaultWorkflowSettings, DataAttributionType } from '@/types/workflow';
import { supabase } from '@/integrations/supabase/client';
import { WorkflowMenuItem } from './WorkflowMenuItem';
import { ScrollArea } from '@/components/ui/scroll-area';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

export function Header() {
  const {
    workflow, 
    loadWorkflow, 
    loadWorkflows, 
    toggleWorkflowExpanded,
    getWorkflowHierarchy,
    indentWorkflow,
    outdentWorkflow,
    moveWorkflowUp,
    moveWorkflowDown
  } = useWorkflowStore();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [appName, setAppName] = useState('ABI//CORE');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const { currentLayer, setCurrentLayer } = useWorkflowStore();
  
  const [isSettingsDialogOpen, setIsSettingsDialogOpen] = useState(false);
  const [workflowToEdit, setWorkflowToEdit] = useState<Workflow | null>(null);
  const [editName, setEditName] = useState('');
  const [editSettings, setEditSettings] = useState<WorkflowSettings>(defaultWorkflowSettings);
  const [editParentId, setEditParentId] = useState<string | null>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const isFrameworksView = location.pathname === '/frameworks';
  const isDatasetsView = location.pathname === '/datasets';
  const isCompaniesView = location.pathname === '/companies';
  const isAdminView = location.pathname === '/admin';

  const fetchWorkflows = async () => {
    const data = await loadWorkflows();
    setWorkflows(data);
  };

  useEffect(() => {
    fetchWorkflows();

    const fetchBranding = async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .maybeSingle();

      if (data && !error) {
        if (data.app_name) setAppName(data.app_name);
        setLogoUrl(data.logo_url);
      }
    };
    fetchBranding();

    // Listen for workflow save events to refresh the list
    const handleWorkflowSaved = () => {
      fetchWorkflows();
    };
    window.addEventListener('workflowSaved', handleWorkflowSaved);

    return () => {
      window.removeEventListener('workflowSaved', handleWorkflowSaved);
    };
  }, []);

  const handleWorkflowSelect = async (selectedWorkflow: Workflow) => {
    const result = await saveCurrentWorkflow();
    if (!result.success) {
      toast.error(`Cannot switch: ${result.error || 'Save failed'}`);
      return; // Block navigation - user stays on current workflow
    }
    loadWorkflow(selectedWorkflow);
  };

  const handleCreateNewCanvas = () => {
    const newWorkflow: Workflow = {
      id: 'temp-' + Date.now(),
      name: 'Untitled Canvas',
      nodes: [],
      edges: [],
      variables: [],
      version: 1,
      unsavedChanges: true,
    };
    loadWorkflow(newWorkflow);
    localStorage.removeItem('currentWorkflowId');
    toast.success('New canvas created');
  };

  const openSettingsDialog = (wf: Workflow, e: React.MouseEvent) => {
    e.stopPropagation();
    setWorkflowToEdit(wf);
    setEditName(wf.name);
    setEditSettings(wf.settings || defaultWorkflowSettings);
    setEditParentId(wf.parent_id || null);
    setIsSettingsDialogOpen(true);
  };

  // Check if a workflow is a descendant of another (to prevent circular nesting)
  const isDescendant = (workflowId: string, potentialAncestorId: string | undefined): boolean => {
    if (!potentialAncestorId) return false;
    let currentId: string | null | undefined = workflowId;
    const visited = new Set<string>();
    while (currentId) {
      if (visited.has(currentId)) break; // Prevent infinite loops
      visited.add(currentId);
      const current = workflows.find(w => w.id === currentId);
      if (!current) break;
      if (current.parent_id === potentialAncestorId) return true;
      currentId = current.parent_id;
    }
    return false;
  };

  // Get a display path like "Parent Workflow > Child Workflow"
  const getWorkflowPath = (wf: Workflow): string => {
    const path: string[] = [wf.name];
    let current = wf;
    while (current.parent_id) {
      const parent = workflows.find(w => w.id === current.parent_id);
      if (parent) {
        path.unshift(parent.name);
        current = parent;
      } else break;
    }
    return path.join(' › ');
  };

  // Get available parent options (excluding self and descendants)
  const getAvailableParents = (): Workflow[] => {
    if (!workflowToEdit) return [];
    return workflows.filter(w => {
      // Can't nest under itself
      if (w.id === workflowToEdit.id) return false;
      // Can't nest under a descendant (would create circular reference)
      if (isDescendant(w.id, workflowToEdit.id)) return false;
      return true;
    });
  };

  const handleToggleExpand = (workflowId: string) => {
    // Optimistic update
    const optimisticWorkflows = workflows.map(w => 
      w.id === workflowId 
        ? { ...w, is_expanded: !w.is_expanded }
        : w
    );
    setWorkflows(optimisticWorkflows);
    
    // Background save
    toggleWorkflowExpanded(workflowId)
      .catch((error) => {
        console.error('Failed to toggle workflow:', error);
        fetchWorkflows(); // Revert on error
        toast.error('Failed to update workflow');
      });
  };

  const handleMoveUp = (workflow: Workflow) => {
    const siblings = workflows
      .filter(w => (w.parent_id || null) === (workflow.parent_id || null))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    const currentIndex = siblings.findIndex(w => w.id === workflow.id);
    if (currentIndex <= 0) return;
    
    const previousSibling = siblings[currentIndex - 1];
    
    // Optimistic update - use index-based sort orders to ensure uniqueness
    const optimisticWorkflows = workflows.map(w => {
      if (w.id === workflow.id) {
        return { ...w, sort_order: currentIndex - 1 };
      }
      if (w.id === previousSibling.id) {
        return { ...w, sort_order: currentIndex };
      }
      return w;
    });
    
    setWorkflows(optimisticWorkflows);
    
    // Background save
    moveWorkflowUp(workflow.id)
      .catch((error) => {
        console.error('Failed to move workflow:', error);
        fetchWorkflows(); // Revert on error
        toast.error('Failed to move workflow');
      });
  };

  const handleMoveDown = (workflow: Workflow) => {
    const siblings = workflows
      .filter(w => (w.parent_id || null) === (workflow.parent_id || null))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    const currentIndex = siblings.findIndex(w => w.id === workflow.id);
    if (currentIndex >= siblings.length - 1) return;
    
    const nextSibling = siblings[currentIndex + 1];
    
    // Optimistic update - use index-based sort orders to ensure uniqueness
    const optimisticWorkflows = workflows.map(w => {
      if (w.id === workflow.id) {
        return { ...w, sort_order: currentIndex + 1 };
      }
      if (w.id === nextSibling.id) {
        return { ...w, sort_order: currentIndex };
      }
      return w;
    });
    
    setWorkflows(optimisticWorkflows);
    
    // Background save
    moveWorkflowDown(workflow.id)
      .catch((error) => {
        console.error('Failed to move workflow:', error);
        fetchWorkflows(); // Revert on error
        toast.error('Failed to move workflow');
      });
  };

  const handleIndent = (workflow: Workflow) => {
    const siblings = workflows
      .filter(w => (w.parent_id || null) === (workflow.parent_id || null))
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    
    const currentIndex = siblings.findIndex(w => w.id === workflow.id);
    if (currentIndex <= 0) return;
    
    const newParent = siblings[currentIndex - 1];
    const newParentChildren = workflows.filter(w => w.parent_id === newParent.id);
    
    // Optimistic update - change parent and append to end
    const optimisticWorkflows = workflows.map(w => 
      w.id === workflow.id 
        ? { ...w, parent_id: newParent.id, sort_order: newParentChildren.length }
        : w
    );
    
    setWorkflows(optimisticWorkflows);
    
    // Background save
    indentWorkflow(workflow.id)
      .catch((error) => {
        console.error('Failed to indent workflow:', error);
        fetchWorkflows(); // Revert on error
        toast.error('Failed to indent workflow');
      });
  };

  const handleOutdent = (workflow: Workflow) => {
    if (!workflow.parent_id) return;
    
    const parent = workflows.find(w => w.id === workflow.parent_id);
    if (!parent) return;
    
    const newParentId = parent.parent_id || null;
    const newSortOrder = (parent.sort_order || 0) + 1;
    
    // Optimistic update - change to grandparent, position after current parent
    const optimisticWorkflows = workflows.map(w => 
      w.id === workflow.id 
        ? { ...w, parent_id: newParentId, sort_order: newSortOrder }
        : w
    );
    
    setWorkflows(optimisticWorkflows);
    
    // Background save
    outdentWorkflow(workflow.id)
      .catch((error) => {
        console.error('Failed to outdent workflow:', error);
        fetchWorkflows(); // Revert on error
        toast.error('Failed to outdent workflow');
      });
  };

  const canMoveUp = (workflow: Workflow): boolean => {
    const siblings = workflows.filter(w => (w.parent_id || null) === (workflow.parent_id || null));
    siblings.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const currentIndex = siblings.findIndex(w => w.id === workflow.id);
    return currentIndex > 0;
  };

  const canMoveDown = (workflow: Workflow): boolean => {
    const siblings = workflows.filter(w => (w.parent_id || null) === (workflow.parent_id || null));
    siblings.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const currentIndex = siblings.findIndex(w => w.id === workflow.id);
    return currentIndex < siblings.length - 1;
  };

  const canIndent = (workflow: Workflow): boolean => {
    const siblings = workflows.filter(w => (w.parent_id || null) === (workflow.parent_id || null));
    siblings.sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
    const currentIndex = siblings.findIndex(w => w.id === workflow.id);
    return currentIndex > 0;
  };

  const canOutdent = (workflow: Workflow): boolean => {
    return !!workflow.parent_id;
  };

  const handleSaveSettings = async () => {
    if (!workflowToEdit || !editName.trim()) {
      toast.error('Please enter a valid name');
      return;
    }

    try {
      // Calculate new sort_order if parent changed
      let newSortOrder = workflowToEdit.sort_order || 0;
      if (editParentId !== (workflowToEdit.parent_id || null)) {
        // Moving to new parent - append to end of new parent's children
        const newSiblings = workflows.filter(w => (w.parent_id || null) === editParentId);
        newSortOrder = newSiblings.length;
      }

      // Cast to Json-compatible type for Supabase
      const settingsJson = { data_attribution: editSettings.data_attribution };
      const { error } = await supabase
        .from('workflows')
        .update({ 
          name: editName.trim(),
          settings: settingsJson,
          parent_id: editParentId,
          sort_order: newSortOrder
        })
        .eq('id', workflowToEdit.id);

      if (error) throw error;

      if (workflow.id === workflowToEdit.id) {
        loadWorkflow({ 
          ...workflow, 
          name: editName.trim(),
          settings: editSettings,
          parent_id: editParentId
        });
      }

      await fetchWorkflows();
      toast.success('Workflow settings saved');
      setIsSettingsDialogOpen(false);
      setWorkflowToEdit(null);
      setEditName('');
      setEditSettings(defaultWorkflowSettings);
      setEditParentId(null);
    } catch (error) {
      console.error('Error saving workflow settings:', error);
      toast.error('Failed to save settings');
    }
  };

  return (
    <header className="h-14 border-b border-border bg-card flex items-center px-4 justify-between z-50">
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2">
          {logoUrl ? (
            <img src={logoUrl} alt="Logo" className="w-8 h-8 rounded-lg object-contain" />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
              <Zap className="w-5 h-5 text-primary-foreground" />
            </div>
          )}
          <h1 className="text-lg font-semibold text-foreground">{appName}</h1>
        </div>
        
        <div className="flex items-center gap-2 text-sm">
          <NavigationMenu>
            <NavigationMenuList>
              <NavigationMenuItem>
                <NavigationMenuTrigger className="text-sm text-muted-foreground hover:text-primary h-auto py-1 px-2 bg-transparent data-[state=open]:bg-transparent">
                  {isFrameworksView ? 'Frameworks' : isDatasetsView ? 'Datasets' : isCompaniesView ? 'Companies' : isAdminView ? 'Settings' : 'Workflow Builder'}
                </NavigationMenuTrigger>
                <NavigationMenuContent className="z-[100] bg-popover">
                  <ul className="w-48 p-2">
                    <li>
                      <NavigationMenuLink asChild>
                        <a
                          href="/"
                          onClick={(e) => {
                            e.preventDefault();
                            navigate('/');
                          }}
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-foreground"
                        >
                          <div className="text-sm font-medium">Workflow Builder</div>
                        </a>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <a
                          href="/frameworks"
                          onClick={(e) => {
                            e.preventDefault();
                            navigate('/frameworks');
                          }}
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-foreground"
                        >
                          <div className="text-sm font-medium">Frameworks</div>
                        </a>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <a
                          href="/datasets"
                          onClick={(e) => {
                            e.preventDefault();
                            navigate('/datasets');
                          }}
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-foreground"
                        >
                          <div className="text-sm font-medium">Datasets</div>
                        </a>
                      </NavigationMenuLink>
                    </li>
                    <li>
                      <NavigationMenuLink asChild>
                        <a
                          href="/companies"
                          onClick={(e) => {
                            e.preventDefault();
                            navigate('/companies');
                          }}
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-foreground"
                        >
                          <div className="text-sm font-medium">Companies</div>
                        </a>
                      </NavigationMenuLink>
                    </li>
                    <Separator className="my-2" />
                    <li>
                      <NavigationMenuLink asChild>
                        <a
                          href="/admin"
                          onClick={(e) => {
                            e.preventDefault();
                            navigate('/admin');
                          }}
                          className="block select-none rounded-md p-3 leading-none no-underline outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground text-foreground"
                        >
                          <div className="text-sm font-medium flex items-center gap-2">
                            <Settings className="w-4 h-4" />
                            Settings
                          </div>
                        </a>
                      </NavigationMenuLink>
                    </li>
                  </ul>
                </NavigationMenuContent>
              </NavigationMenuItem>
            </NavigationMenuList>
          </NavigationMenu>
          {!isFrameworksView && !isDatasetsView && !isCompaniesView && !isAdminView && (
            <>
              <span className="text-muted-foreground">›</span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-1 h-auto py-0 px-2">
                    <span>{workflow.name}</span>
                    <ChevronDown className="w-3 h-3" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-80">
                  <ScrollArea className="h-[400px]">
                    {workflows.length > 0 ? (
                      getWorkflowHierarchy(workflows).map((item) => (
                        <WorkflowMenuItem
                          key={item.workflow.id}
                          item={item}
                          currentWorkflowId={workflow.id}
                          onSelect={handleWorkflowSelect}
                          onToggleExpand={handleToggleExpand}
                          onOpenSettings={openSettingsDialog}
                          onMoveUp={handleMoveUp}
                          onMoveDown={handleMoveDown}
                          onIndent={handleIndent}
                          onOutdent={handleOutdent}
                          canMoveUp={canMoveUp}
                          canMoveDown={canMoveDown}
                          canIndent={canIndent}
                          canOutdent={canOutdent}
                        />
                      ))
                    ) : (
                      <DropdownMenuItem disabled>No saved workflows</DropdownMenuItem>
                    )}
                  </ScrollArea>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleCreateNewCanvas}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Canvas
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>
      </div>

      {!isFrameworksView && !isDatasetsView && !isCompaniesView && !isAdminView && (
        <div className="flex items-center gap-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="sm" className="gap-2">
              <div className="w-2 h-2 rounded-full bg-primary"></div>
              <span className="text-sm text-foreground">
                Layer: {currentLayer.charAt(0).toUpperCase() + currentLayer.slice(1)}
              </span>
              <ChevronDown className="w-4 h-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem 
              onClick={() => setCurrentLayer('framework')}
              className={currentLayer === 'framework' ? 'border-2 border-primary' : ''}
            >
              Framework
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setCurrentLayer('improvement')} 
              className={currentLayer === 'improvement' ? 'border-2 border-primary' : ''}
            >
              Improvement
            </DropdownMenuItem>
            <DropdownMenuItem 
              onClick={() => setCurrentLayer('performance')}
              className={currentLayer === 'performance' ? 'border-2 border-primary' : ''}
            >
              Performance
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      )}

      <Dialog open={isSettingsDialogOpen} onOpenChange={setIsSettingsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Workflow Settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-2">
              <Label htmlFor="workflow-name">Workflow Name</Label>
              <Input
                id="workflow-name"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Enter workflow name"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSaveSettings();
                  }
                }}
              />
            </div>

            <div className="space-y-2">
              <Label>Nested Under</Label>
              <Select
                value={editParentId || "none"}
                onValueChange={(value) => setEditParentId(value === "none" ? null : value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select parent workflow" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None (Top Level)</SelectItem>
                  {getAvailableParents().map(w => (
                    <SelectItem key={w.id} value={w.id}>
                      {getWorkflowPath(w)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-sm text-muted-foreground">
                Choose which workflow this should be nested under
              </p>
            </div>
            
            <Separator />
            
            <div className="space-y-3">
              <Label>Data Attribution</Label>
              <p className="text-sm text-muted-foreground">
                Define how nodes on this canvas relate to company data
              </p>
              <RadioGroup
                value={editSettings.data_attribution}
                onValueChange={(value: DataAttributionType) => 
                  setEditSettings(prev => ({ ...prev, data_attribution: value }))
                }
                className="space-y-3"
              >
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="company_data" id="company_data" className="mt-1" />
                  <div className="space-y-1">
                    <Label htmlFor="company_data" className="font-medium cursor-pointer">
                      Company Data
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Nodes directly process company information
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="company_related_data" id="company_related_data" className="mt-1" />
                  <div className="space-y-1">
                    <Label htmlFor="company_related_data" className="font-medium cursor-pointer">
                      Company Related Data
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Nodes work with related context
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3">
                  <RadioGroupItem value="unrelated_data" id="unrelated_data" className="mt-1" />
                  <div className="space-y-1">
                    <Label htmlFor="unrelated_data" className="font-medium cursor-pointer">
                      Unrelated Data
                    </Label>
                    <p className="text-sm text-muted-foreground">
                      Nodes are independent of companies
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSettingsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveSettings}>
              Save Settings
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </header>
  );
}
