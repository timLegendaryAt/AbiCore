export interface Integration {
  id: string;
  name: string;
  description: string;
  category: 'communication' | 'crm' | 'data' | 'productivity' | 'payments' | 'automation';
  profile: 'main' | 'abi' | 'abivc';
  connected: boolean;
  color: string;
  initials: string;
  created_at?: string;
  updated_at?: string;
}
