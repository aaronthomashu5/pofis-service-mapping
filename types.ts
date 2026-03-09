
export interface MaintenanceRecord {
  id: string;
  date: string;
  technician: string;
  description: string;
  notes: string;
}

export type ServiceStatus = 'Pending Inspection' | 'Inspected' | 'Parts Requested' | 'Under Service' | 'Completed';

export interface InspectionReport {
  isAlive: 'Alive' | 'Dead';
  errorCodes: string;
  observations: string; // "Initial Observation"
  diodeTest: string;
  continuityTest: string;
  timestamp: number;
}

export interface MaterialRequest {
  parts: string; // Description of parts
  timestamp: number;
}

export interface ServiceLog {
  status: ServiceStatus;
  timestamp: number;
  note?: string;
}

export interface ServiceThresholds {
    inspectionHours: number;
    materialRequestHours: number;
    serviceHours: number;
}

export interface EmailSettings {
    cc: string;
    subject: string;
    bodyIntro: string;
    signature: string;
}

export interface ClientReference {
    client: string;
    contactPerson: string;
    contactNumber: string;
    email?: string;
}

export interface Machine {
  id: string;
  serialNumber: string;
  partNumber: string;
  make: string;
  model: string;
  client: string;
  clientEmail?: string; // Added field
  clientAssetNumber: string;
  contactPerson: string;
  contactNumber: string;
  photo?: string; // Base64 encoded image string
  history: MaintenanceRecord[];
  
  // Registration Fields
  warrantyStatus?: 'Under Warranty' | 'Out of Warranty';
  invoicePhoto?: string; // Base64
  sitePhotos?: string[]; // Array of Base64 strings (Lot evidence)
  customerSignature?: string; // Base64 signature
  batchId?: string; // ID to group machines registered together

  // Service Workflow Fields
  serviceStatus?: ServiceStatus;
  lastStatusUpdate?: number; // Timestamp
  priorityIndex?: number; // For manual ordering in Kanban
  inspectionReport?: InspectionReport;
  materialRequest?: MaterialRequest;
  serviceLogs?: ServiceLog[];
}

export interface PartCatalogEntry {
  id?: string;
  partNumber: string;
  partName: string;
  make?: string;
  compatibleMachines?: string[];
}
