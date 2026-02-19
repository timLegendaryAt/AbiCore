import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { useQuery } from "@tanstack/react-query";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Framework, FrameworkFormData, FrameworkType } from "@/types/framework";
import { Sparkles, Eye, EyeOff, ChevronDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface Workflow {
  id: string;
  name: string;
}

const formSchema = z.object({
  name: z.string().min(1, "Name is required").max(100, "Name must be less than 100 characters"),
  description: z.string(),
  type: z.enum(["rating_scale", "rubric", "criteria", "custom", "document"]),
  category: z.string(),
  workflow_association: z.string(),
  schema: z.string().min(1, "Schema or content is required"),
  language: z.string(),
  score: z.string(),
  is_template: z.boolean()
}).refine((data) => {
  // Only validate JSON for non-document types
  if (data.type === 'document') {
    return true;
  }
  try {
    JSON.parse(data.schema);
    return true;
  } catch {
    return false;
  }
}, {
  message: "Schema must be valid JSON for non-document types",
  path: ["schema"]
});

interface FrameworkFormProps {
  framework?: Framework;
  workflows: Workflow[];
  lifecycleMode?: boolean;
  onSubmit: (data: FrameworkFormData) => void;
  onCancel: () => void;
}

const COMPANY_STAGES = [
  'Ideation',
  'Pre-seed',
  'Early Stage',
  'Scaling Stage',
  'Mature Startup'
] as const;

const schemaTemplates = [
  {
    name: "Rating Scale (1-5)",
    value: JSON.stringify({ scale: { min: 1, max: 5, step: 1 } }, null, 2)
  },
  {
    name: "Rating Scale (1-10)",
    value: JSON.stringify({ scale: { min: 1, max: 10, step: 1 } }, null, 2)
  },
  {
    name: "Binary",
    value: JSON.stringify({ options: ["pass", "fail"] }, null, 2)
  },
  {
    name: "Multi-Criteria",
    value: JSON.stringify({ criteria: [{ name: "", weight: 1, scale: 5 }] }, null, 2)
  }
];

const parseTSV = (text: string): string[][] => {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote (two quotes in a row = literal quote)
        currentCell += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote mode
        inQuotes = !inQuotes;
      }
    } else if (char === '\t' && !inQuotes) {
      // Tab outside quotes = cell separator
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if (char === '\n' && !inQuotes) {
      // Newline outside quotes = row separator
      currentRow.push(currentCell.trim());
      if (currentRow.some(cell => cell)) { // Only add non-empty rows
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
    } else {
      // Regular character
      currentCell += char;
    }
  }
  
  // Handle last cell and row
  if (currentCell || currentRow.length) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(cell => cell)) {
      rows.push(currentRow);
    }
  }
  
  return rows;
};


export const FrameworkForm = ({ framework, workflows, lifecycleMode = false, onSubmit, onCancel }: FrameworkFormProps) => {
  const { toast } = useToast();
  const [showPreview, setShowPreview] = useState(false);
  const [showScaleScores, setShowScaleScores] = useState(false);
  const [scaleScores, setScaleScores] = useState<Record<string, number>>({});
  const [categoryOpen, setCategoryOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState("");

  // Fetch existing categories from database
  const { data: existingCategories = [] } = useQuery({
    queryKey: ['framework-categories'],
    queryFn: async () => {
      const { data } = await supabase
        .from('frameworks')
        .select('category')
        .not('category', 'is', null);
      const unique = [...new Set(data?.map(f => f.category).filter(Boolean))] as string[];
      // Filter out system categories that are shown as tabs
      const systemCategories = ['general', 'workflow', 'lifecycle'];
      return unique.filter(c => !systemCategories.includes(c.toLowerCase())).sort();
    }
  });
  
  // For lifecycle mode, use document type and lifecycle category
  const defaultType = lifecycleMode ? "document" : (framework?.type || "rating_scale");
  const defaultCategory = lifecycleMode ? "lifecycle" : (framework?.category || "general");
  
  const form = useForm<FrameworkFormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: framework?.name || "",
      description: framework?.description || "",
      type: defaultType,
      category: defaultCategory,
      workflow_association: framework?.workflow_association || "",
      schema: framework ? (typeof framework.schema === 'string' ? framework.schema : JSON.stringify(framework.schema, null, 2)) : (lifecycleMode ? "" : JSON.stringify({}, null, 2)),
      language: framework?.language || "",
      score: framework?.score || "",
      is_template: framework?.is_template || false
    }
  });

  const categoryValue = form.watch("category");
  const schemaValue = form.watch("schema");
  const typeValue = form.watch("type");

  // Load existing scale scores when editing a framework
  useEffect(() => {
    if (framework?.score) {
      try {
        const parsed = JSON.parse(framework.score);
        if (typeof parsed === 'object') {
          setScaleScores(parsed);
          setShowScaleScores(true);
        }
      } catch (e) {
        // Not JSON, ignore
      }
    }
  }, [framework]);

  const convertToJSON = (input: string): string | null => {
    // Remove leading/trailing whitespace
    const trimmed = input.trim();
    
    // Try parsing as JSON first (existing behavior)
    try {
      const parsed = JSON.parse(trimmed);
      return JSON.stringify(parsed, null, 2);
    } catch {
      // Not valid JSON, proceed with conversion
    }
    
    // Check for tab-separated values (spreadsheet paste)
    if (trimmed.includes('\t')) {
      const rows = parseTSV(trimmed);
      if (rows.length === 0) return null;
      
      // Detect rubric-style data (first row is sequential numbers)
      const firstRow = rows[0];
      const isRubricScale = firstRow.every((cell, index) => {
        const num = Number(cell);
        return !isNaN(num) && (index === 0 || num === Number(firstRow[index - 1]) + 1);
      });
      
      if (isRubricScale && rows.length >= 2) {
        // Rubric format: scale values as column keys
        const scale = firstRow;
        
        // Second row is category labels (optional)
        const hasCategories = rows.length >= 2 && rows[1].some(cell => 
          cell && isNaN(Number(cell))
        );
        
        if (hasCategories) {
          const categories = rows[1];
          
          // Remaining rows are descriptions (can be multi-line)
          const descriptions = rows.slice(2);
          
          // Build structured rubric data
          const rubricData = scale.map((scaleValue, index) => ({
            score: scaleValue,
            label: categories[index] || '',
            description: descriptions.map(row => row[index] || '').join('\n').trim(),
            pointValue: 100 // Default point value
          }));
          
          return JSON.stringify({
            type: 'rubric',
            scale: scale,
            criteria: rubricData
          }, null, 2);
        } else {
          // Just scale values without categories
          return JSON.stringify({
            type: 'scale',
            values: scale
          }, null, 2);
        }
      }
      
      // Standard spreadsheet detection (non-numeric first row)
      const hasTextHeaders = firstRow.some(cell => isNaN(Number(cell)) && cell);
      
      if (hasTextHeaders && rows.length > 1) {
        // Convert to array of objects
        const headers = firstRow;
        const data = rows.slice(1).map(row => {
          const obj: Record<string, string> = {};
          headers.forEach((header, i) => {
            obj[header] = row[i] || '';
          });
          return obj;
        });
        return JSON.stringify({ data }, null, 2);
      } else {
        // Convert to array of arrays (generic table)
        return JSON.stringify({ rows }, null, 2);
      }
    }
    
    // Check for comma-separated values
    if (trimmed.includes(',') && !trimmed.includes('\n')) {
      const values = trimmed.split(',').map(v => v.trim());
      return JSON.stringify({ items: values }, null, 2);
    }
    
    // Check for key-value pairs (colon-separated)
    if (trimmed.includes(':') && trimmed.includes('\n')) {
      const obj: Record<string, string> = {};
      const lines = trimmed.split('\n');
      let hasValidPairs = false;
      
      lines.forEach(line => {
        const colonIndex = line.indexOf(':');
        if (colonIndex > 0) {
          const key = line.substring(0, colonIndex).trim();
          const value = line.substring(colonIndex + 1).trim();
          if (key) {
            obj[key] = value;
            hasValidPairs = true;
          }
        }
      });
      
      if (hasValidPairs) {
        return JSON.stringify(obj, null, 2);
      }
    }
    
    // Check for newline-separated list
    if (trimmed.includes('\n')) {
      const items = trimmed.split('\n')
        .map(line => line.trim())
        .filter(line => line);
      
      if (items.length > 0) {
        return JSON.stringify({ items }, null, 2);
      }
    }
    
    // Single line text or simple value
    return JSON.stringify({ value: trimmed }, null, 2);
  };

  // Render document preview with section delimiter support
  const renderDocumentPreview = (content: string) => {
    // Split by --- delimiter (must be on its own line)
    const sections = content.split(/\n---\n/).map(s => s.trim()).filter(Boolean);
    
    if (sections.length <= 1) {
      // No sections, just show as plain text
      return <pre className="whitespace-pre-wrap text-sm">{content}</pre>;
    }
    
    return (
      <div className="space-y-4">
        {sections.map((section, index) => {
          // Check if section starts with a heading
          const lines = section.split('\n');
          const firstLine = lines[0];
          const isHeading = firstLine.startsWith('#');
          const title = isHeading ? firstLine.replace(/^#+\s*/, '') : null;
          const body = isHeading ? lines.slice(1).join('\n').trim() : section;
          
          return (
            <div key={index} className="border-l-2 border-primary/30 pl-4">
              {title && (
                <div className="font-medium text-sm mb-2">{title}</div>
              )}
              <pre className="whitespace-pre-wrap text-sm text-muted-foreground">
                {body}
              </pre>
            </div>
          );
        })}
      </div>
    );
  };

  const renderJSONPreview = (jsonString: string) => {
    try {
      const data = JSON.parse(jsonString);
      
      // Handle different JSON structures
      if (data.type === 'rubric' && data.criteria) {
        // Rubric-style display
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted">
                  <th className="border p-2 text-left font-medium">Score</th>
                  <th className="border p-2 text-left font-medium">Category</th>
                  <th className="border p-2 text-left font-medium">Points</th>
                  <th className="border p-2 text-left font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {data.criteria.map((criterion: any, index: number) => (
                  <tr key={index} className="border-b">
                    <td className="border p-2 font-medium">{criterion.score}</td>
                    <td className="border p-2">{criterion.label}</td>
                    <td className="border p-2 font-medium text-primary">
                      {criterion.pointValue || 100}
                    </td>
                    <td className="border p-2 text-muted-foreground">
                      {criterion.description}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      } else if (data.type === 'scale' && data.values) {
        // Simple scale display
        return (
          <div className="flex items-center gap-2">
            <span className="font-medium">Scale:</span>
            <div className="flex gap-1">
              {data.values.map((value: string, index: number) => (
                <div key={index} className="px-3 py-1 bg-muted rounded border">
                  {value}
                </div>
              ))}
            </div>
          </div>
        );
      } else if (Array.isArray(data)) {
        // Array of items
        return (
          <div className="space-y-2">
            {data.map((item, index) => (
              <div key={index} className="p-2 bg-muted rounded">
                {typeof item === 'object' ? (
                  <pre className="text-sm">{JSON.stringify(item, null, 2)}</pre>
                ) : (
                  <p className="text-sm">{String(item)}</p>
                )}
              </div>
            ))}
          </div>
        );
      } else if (data.data && Array.isArray(data.data)) {
        // Spreadsheet-style data with headers
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-muted">
                  {Object.keys(data.data[0] || {}).map((header) => (
                    <th key={header} className="border p-2 text-left font-medium">
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.data.map((row: any, index: number) => (
                  <tr key={index} className="border-b">
                    {Object.values(row).map((value: any, i: number) => (
                      <td key={i} className="border p-2">
                        {String(value)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      } else if (data.items && Array.isArray(data.items)) {
        // Simple list
        return (
          <ul className="list-disc list-inside space-y-1">
            {data.items.map((item: any, index: number) => (
              <li key={index} className="text-sm">{String(item)}</li>
            ))}
          </ul>
        );
      } else if (data.rows && Array.isArray(data.rows)) {
        // Array of arrays (rows without headers)
        return (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <tbody>
                {data.rows.map((row: any[], rowIndex: number) => (
                  <tr key={rowIndex} className="border-b">
                    {row.map((cell: any, cellIndex: number) => (
                      <td key={cellIndex} className="border p-2">
                        {String(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      } else if (data.scale) {
        // Rating scale
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="font-medium">Scale:</span>
              <span>{data.scale.min} to {data.scale.max}</span>
              {data.scale.step && <span>(Step: {data.scale.step})</span>}
            </div>
          </div>
        );
      } else {
        // Generic object - display as key-value pairs
        return (
          <div className="space-y-2">
            {Object.entries(data).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <span className="font-medium min-w-[120px]">{key}:</span>
                <span className="text-muted-foreground">
                  {typeof value === 'object' 
                    ? JSON.stringify(value, null, 2)
                    : String(value)
                  }
                </span>
              </div>
            ))}
          </div>
        );
      }
    } catch (error) {
      return (
        <div className="text-sm text-muted-foreground">
          Invalid JSON - cannot preview
        </div>
      );
    }
  };

  const prettifyJSON = () => {
    const schemaValue = form.getValues("schema");
    const converted = convertToJSON(schemaValue);
    
    if (converted) {
      form.setValue("schema", converted);
      toast({
        title: "Converted to JSON",
        description: "Your data has been formatted as JSON",
      });
    }
  };

  const handleSubmit = (data: FrameworkFormData) => {
    // Store scale scores in the score field as JSON (only for non-document types)
    if (data.type !== 'document' && Object.keys(scaleScores).length > 0) {
      data.score = JSON.stringify(scaleScores);
    }
    onSubmit(data);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input placeholder="Framework name" {...field} />
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
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea rows={3} placeholder="Describe this framework..." {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        {/* Hide type selector in lifecycle mode */}
        {!lifecycleMode && (
          <FormField
            control={form.control}
            name="type"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Framework Format</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select format" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value="document">Plain Text Document</SelectItem>
                    <SelectItem value="rubric">Structured Schema - Rubric</SelectItem>
                    <SelectItem value="rating_scale">Structured Schema - Rating Scale</SelectItem>
                    <SelectItem value="criteria">Structured Schema - Criteria</SelectItem>
                    <SelectItem value="custom">Structured Schema - Custom</SelectItem>
                  </SelectContent>
                </Select>
                <FormDescription>
                  Choose "Plain Text Document" for reference materials or "Structured Schema" for evaluation rubrics.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Hide category selector in lifecycle mode */}
        {!lifecycleMode && (
          <FormField
            control={form.control}
            name="category"
            render={({ field }) => {
              const allCategories = ['general', 'workflow', ...existingCategories];
              const isNewCategory = categorySearch && !allCategories.some(
                c => c.toLowerCase() === categorySearch.toLowerCase()
              );
              
              return (
                <FormItem className="flex flex-col">
                  <FormLabel>Category</FormLabel>
                  <Popover open={categoryOpen} onOpenChange={setCategoryOpen}>
                    <PopoverTrigger asChild>
                      <FormControl>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={categoryOpen}
                          className={cn(
                            "w-full justify-between font-normal",
                            !field.value && "text-muted-foreground"
                          )}
                        >
                          {field.value || "Select or add category..."}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </FormControl>
                    </PopoverTrigger>
                    <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                      <Command>
                        <CommandInput
                          placeholder="Search or add category..."
                          value={categorySearch}
                          onValueChange={setCategorySearch}
                        />
                        <CommandList>
                          <CommandEmpty className="py-2 px-3 text-sm text-muted-foreground">
                            {categorySearch ? (
                              <span>No matching category</span>
                            ) : (
                              <span>Type to search or add</span>
                            )}
                          </CommandEmpty>
                          <CommandGroup>
                            {allCategories.map((cat) => (
                              <CommandItem
                                key={cat}
                                value={cat}
                                onSelect={() => {
                                  field.onChange(cat);
                                  setCategorySearch("");
                                  setCategoryOpen(false);
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    field.value === cat ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                {cat}
                              </CommandItem>
                            ))}
                            {isNewCategory && (
                              <CommandItem
                                value={categorySearch}
                                onSelect={() => {
                                  field.onChange(categorySearch);
                                  setCategorySearch("");
                                  setCategoryOpen(false);
                                }}
                                className="text-primary"
                              >
                                <Plus className="mr-2 h-4 w-4" />
                                Add "{categorySearch}"
                              </CommandItem>
                            )}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  <FormDescription>
                    Select an existing category or type to add a new one
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              );
            }}
          />
        )}

        {/* Hide workflow association in lifecycle mode */}
        {!lifecycleMode && categoryValue === "workflow" && (
          <FormField
            control={form.control}
            name="workflow_association"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Workflow Association</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="Select workflow" />
                    </SelectTrigger>
                  </FormControl>
                <SelectContent>
                  {workflows.map((workflow) => (
                    <SelectItem key={workflow.id} value={workflow.id}>
                      {workflow.name}
                    </SelectItem>
                  ))}
                </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {(typeValue === 'document' || lifecycleMode) ? (
          <FormField
            control={form.control}
            name="schema"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{lifecycleMode ? "Content" : "Document Content"}</FormLabel>
                <FormDescription>
                  {lifecycleMode 
                    ? "Paste your lifecycle text content here. Use \"---\" on its own line to separate sections."
                    : "Enter your plain text document content here. Use \"---\" on its own line to separate sections. Optionally start each section with \"# Title\" for a heading."
                  }
                </FormDescription>
                <FormControl>
                  <Textarea 
                    rows={lifecycleMode ? 16 : 12} 
                    placeholder={lifecycleMode ? 'Paste your lifecycle content here...' : 'Enter your document text here...'} 
                    className="font-mono text-sm"
                    {...field} 
                  />
                </FormControl>
                {field.value && field.value.trim() && (
                  <Collapsible open={showPreview} onOpenChange={setShowPreview}>
                    <CollapsibleTrigger asChild>
                      <Button 
                        type="button" 
                        variant="ghost" 
                        size="sm" 
                        className="w-full justify-start"
                      >
                        {showPreview ? (
                          <EyeOff className="h-4 w-4 mr-2" />
                        ) : (
                          <Eye className="h-4 w-4 mr-2" />
                        )}
                        {showPreview ? "Hide Preview" : "Show Preview"}
                      </Button>
                    </CollapsibleTrigger>
                    <CollapsibleContent className="pt-2">
                      <div className="border rounded-lg p-4 bg-muted/30">
                        <div className="text-sm font-medium mb-3 text-muted-foreground">
                          Preview:
                        </div>
                        {renderDocumentPreview(field.value)}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                )}
                <FormMessage />
              </FormItem>
            )}
          />
        ) : (
          <FormField
            control={form.control}
            name="schema"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Schema</FormLabel>
                <FormDescription>
                  Paste JSON, text, or spreadsheet data. Click "Convert to JSON" to format.
                </FormDescription>
                <div className="space-y-2">
                  <Select onValueChange={(value) => form.setValue("schema", value)}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Use a template (optional)" />
                    </SelectTrigger>
                    <SelectContent>
                      {schemaTemplates.map((template) => (
                        <SelectItem key={template.name} value={template.value}>
                          <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4" />
                            {template.name}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormControl>
                    <Textarea 
                      rows={8} 
                      placeholder='Paste JSON, text list, or spreadsheet data here...' 
                      className="font-mono text-sm"
                      {...field} 
                    />
                  </FormControl>
                  <Button type="button" variant="outline" size="sm" onClick={prettifyJSON}>
                    <Sparkles className="h-4 w-4 mr-2" />
                    Convert to JSON
                  </Button>
                  
                  {field.value && field.value.trim() && (
                    <Collapsible open={showPreview} onOpenChange={setShowPreview}>
                      <CollapsibleTrigger asChild>
                        <Button 
                          type="button" 
                          variant="ghost" 
                          size="sm" 
                          className="w-full justify-start"
                        >
                          {showPreview ? (
                            <EyeOff className="h-4 w-4 mr-2" />
                          ) : (
                            <Eye className="h-4 w-4 mr-2" />
                          )}
                          {showPreview ? "Hide Preview" : "Show Preview"}
                        </Button>
                      </CollapsibleTrigger>
                      <CollapsibleContent className="pt-2">
                        <div className="border rounded-lg p-4 bg-muted/30">
                          <div className="text-sm font-medium mb-3 text-muted-foreground">
                            Preview:
                          </div>
                          {renderJSONPreview(field.value)}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  )}
                </div>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {/* Scale Scores Section - Hidden for document type and lifecycle mode */}
        {!lifecycleMode && typeValue !== 'document' && (
          <div className="space-y-2">
            <Collapsible open={showScaleScores} onOpenChange={setShowScaleScores}>
              <div className="flex items-center justify-between">
                <Label>Scale Scores (Optional)</Label>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" size="sm">
                    {showScaleScores ? "Hide" : "Show"} Scale Scores
                    <ChevronDown className={cn(
                      "ml-2 h-4 w-4 transition-transform",
                      showScaleScores && "rotate-180"
                    )} />
                  </Button>
                </CollapsibleTrigger>
              </div>
              
              <CollapsibleContent className="space-y-3 pt-3">
                <p className="text-sm text-muted-foreground">
                  Assign point values based on company lifecycle stage. These scores apply when evaluating companies at different stages against this framework.
                </p>
                
                <div className="space-y-2 border rounded-lg p-4 bg-muted/30">
                  {COMPANY_STAGES.map((stage, index) => (
                    <div key={index} className="flex items-center gap-3">
                      <Label className="min-w-[200px] font-normal">{stage}</Label>
                      <Input
                        type="number"
                        placeholder="100"
                        value={scaleScores[stage] || ''}
                        onChange={(e) => setScaleScores(prev => ({
                          ...prev,
                          [stage]: Number(e.target.value) || 100
                        }))}
                        className="w-32"
                      />
                      <span className="text-sm text-muted-foreground">points</span>
                    </div>
                  ))}
                </div>
                
                <Button 
                  type="button" 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    const defaultScores = COMPANY_STAGES.reduce((acc, stage) => ({
                      ...acc,
                      [stage]: 100
                    }), {});
                    setScaleScores(defaultScores);
                  }}
                >
                  Reset to Default (100)
                </Button>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}

        {/* Hide score and template toggle in lifecycle mode */}
        {!lifecycleMode && (
          <>
            <FormField
              control={form.control}
              name="score"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Score</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g., 1-10, A-F, Pass/Fail" {...field} />
                  </FormControl>
                  <FormDescription>Scoring system for this framework</FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="is_template"
              render={({ field }) => (
                <FormItem className="flex items-center justify-between rounded-lg border p-4">
                  <div className="space-y-0.5">
                    <FormLabel className="text-base">Is Template</FormLabel>
                    <FormDescription>
                      Mark this framework as a reusable template
                    </FormDescription>
                  </div>
                  <FormControl>
                    <Switch
                      checked={field.value}
                      onCheckedChange={field.onChange}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
          <Button type="submit">{lifecycleMode ? "Save Lifecycle" : "Save"}</Button>
        </div>
      </form>
    </Form>
  );
};
