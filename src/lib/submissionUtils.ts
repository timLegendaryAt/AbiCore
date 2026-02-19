export interface Submission {
  id: string;
  company_id: string;
  raw_data: Record<string, any>;
  status: string;
  source_type: string;
  submitted_at: string;
  processed_at: string | null;
  error_message: string | null;
  metadata: Record<string, any> | null;
}

/**
 * Determines if a submission contains real company data (not a workflow trigger)
 */
export const isRealSubmission = (submission: Submission): boolean => {
  // Not a trigger record
  if (submission.raw_data._trigger) return false;
  
  // Has intake_fields = real data
  if (submission.raw_data.intake_fields) return true;
  
  // Synced from platform = real data
  if (['abivc_sync', 'abi_sync'].includes(submission.source_type)) return true;
  
  // API source with substantial data
  if (submission.source_type === 'api' && Object.keys(submission.raw_data).length > 2) {
    return true;
  }
  
  // Manual with substantial data (more than just metadata fields)
  if (submission.source_type === 'manual' && Object.keys(submission.raw_data).length > 2) {
    return true;
  }
  
  return false;
};

/**
 * Finds the initial submission (the primary real data submission for a company)
 * Priority: abivc_sync/abi_sync > api > manual with real data
 */
export const findInitialSubmission = (submissions: Submission[]): Submission | null => {
  // Priority 1: abivc_sync or abi_sync source (synced from platform)
  const synced = submissions.find(s => 
    ['abivc_sync', 'abi_sync'].includes(s.source_type) &&
    !s.raw_data._trigger
  );
  if (synced) return synced;
  
  // Priority 2: API source with real data
  const apiSource = submissions.find(s =>
    s.source_type === 'api' &&
    !s.raw_data._trigger &&
    (s.raw_data.intake_fields || Object.keys(s.raw_data).length > 2)
  );
  if (apiSource) return apiSource;
  
  // Priority 3: Manual submission with real data (not a trigger)
  const manual = submissions.find(s =>
    s.source_type === 'manual' &&
    !s.raw_data._trigger &&
    (s.raw_data.intake_fields || Object.keys(s.raw_data).length > 2)
  );
  if (manual) return manual;
  
  return null;
};

/**
 * Gets a user-friendly display name for a source type
 */
export const getSourceDisplayName = (sourceType: string): string => {
  switch (sourceType) {
    case 'abivc_sync': return 'AbiVC';
    case 'abi_sync': return 'Abi';
    case 'api': return 'API';
    case 'manual': return 'Manual Entry';
    default: return sourceType;
  }
};

/**
 * Counts meaningful fields in raw_data
 */
export const getFieldCount = (rawData: Record<string, any>) => {
  const intakeFieldsCount = rawData.intake_fields 
    ? Object.keys(rawData.intake_fields).length 
    : 0;
  
  const intakeSubmissionsCount = Array.isArray(rawData.intake_submissions)
    ? rawData.intake_submissions.length
    : 0;
  
  const topLevelCount = Object.keys(rawData).filter(
    k => k !== 'intake_fields' && k !== 'intake_submissions' && k !== '_trigger'
  ).length;
  
  const intakeCount = intakeFieldsCount || intakeSubmissionsCount;
  
  return {
    total: topLevelCount + intakeCount,
    topLevel: topLevelCount,
    intake: intakeCount,
  };
};
