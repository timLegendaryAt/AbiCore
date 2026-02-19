export interface Dataset {
  id: string;
  name: string;
  description: string | null;
  category: string;
  dependencies: DatasetDependency[];
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DatasetDependency {
  nodeId: string;
  nodeName: string;
  nodeType: string;
  workflowId: string;
  workflowName: string;
  isIntegration?: boolean;
}

export interface DatasetFormData {
  name: string;
  description: string;
  category: string;
  dependencies: DatasetDependency[];
}
