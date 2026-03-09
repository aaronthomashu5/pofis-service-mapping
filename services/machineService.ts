
import { supabase } from '../lib/supabaseClient';
import type { Machine, MaintenanceRecord, ServiceStatus, InspectionReport, MaterialRequest, ServiceThresholds, EmailSettings, ClientReference } from '../types';

// Default Thresholds (Local state for now, could be DB table)
let activeThresholds: ServiceThresholds = {
    inspectionHours: 3,
    materialRequestHours: 24,
    serviceHours: 4
};

// Default Email Settings
let activeEmailSettings: EmailSettings = {
    cc: 'nisha@pofis.ae, sourav@pofis.ae, weldive@pofis.ae',
    subject: 'Machine Received: Successfully received your machine for service',
    bodyIntro: 'We have successfully received your machines for service. Thank you for your trust in our service.',
    signature: 'Service Team\nPerfect Oilfield & Industrial Supply LLC\nPhone: +971 50 123 4567\nEmail: service@pofis.ae'
};

// Helper to calculate working minutes
const calculateWorkingMinutesInternal = (startMs: number, endMs: number): number => {
    let current = new Date(startMs);
    const end = new Date(endMs);
    let workingMinutes = 0;

    // Safety break
    let loops = 0;
    while (current < end && loops < 500000) {
        loops++;
        const day = current.getDay();
        const hour = current.getHours();

        // Check if working day (Mon=1 ... Fri=5)
        // Check if working hour (9:00 to 17:59)
        if (day !== 0 && day !== 6 && hour >= 9 && hour < 18) {
             workingMinutes++;
        }
        
        current.setMinutes(current.getMinutes() + 1);
    }
    return workingMinutes;
};

// Helper to map DB result to Machine type
const mapDbToMachine = (dbMachine: any, history: MaintenanceRecord[] = []): Machine => ({
    id: dbMachine.id,
    serialNumber: dbMachine.serial_number,
    partNumber: dbMachine.part_number,
    make: dbMachine.make,
    model: dbMachine.model,
    client: dbMachine.client,
    clientEmail: dbMachine.client_email,
    clientAssetNumber: dbMachine.client_asset_number,
    contactPerson: dbMachine.contact_person,
    contactNumber: dbMachine.contact_number,
    photo: dbMachine.photo,
    warrantyStatus: dbMachine.warranty_status,
    invoicePhoto: dbMachine.invoice_photo,
    sitePhotos: dbMachine.site_photos,
    customerSignature: dbMachine.customer_signature,
    batchId: dbMachine.batch_id,
    serviceStatus: dbMachine.service_status,
    lastStatusUpdate: dbMachine.last_status_update,
    priorityIndex: dbMachine.priority_index,
    inspectionReport: dbMachine.inspection_report,
    materialRequest: dbMachine.material_request,
    serviceLogs: dbMachine.service_logs,
    history: history
});

// Helper to map Machine to DB columns
const mapMachineToDb = (machine: Partial<Machine>) => {
    const dbObj: any = {};
    if (machine.serialNumber !== undefined) dbObj.serial_number = machine.serialNumber;
    if (machine.partNumber !== undefined) dbObj.part_number = machine.partNumber;
    if (machine.make !== undefined) dbObj.make = machine.make;
    if (machine.model !== undefined) dbObj.model = machine.model;
    if (machine.client !== undefined) dbObj.client = machine.client;
    if (machine.clientEmail !== undefined) dbObj.client_email = machine.clientEmail;
    if (machine.clientAssetNumber !== undefined) dbObj.client_asset_number = machine.clientAssetNumber;
    if (machine.contactPerson !== undefined) dbObj.contact_person = machine.contactPerson;
    if (machine.contactNumber !== undefined) dbObj.contact_number = machine.contactNumber;
    if (machine.photo !== undefined) dbObj.photo = machine.photo;
    if (machine.warrantyStatus !== undefined) dbObj.warranty_status = machine.warrantyStatus;
    if (machine.invoicePhoto !== undefined) dbObj.invoice_photo = machine.invoicePhoto;
    if (machine.sitePhotos !== undefined) dbObj.site_photos = machine.sitePhotos;
    if (machine.customerSignature !== undefined) dbObj.customer_signature = machine.customerSignature;
    if (machine.batchId !== undefined) dbObj.batch_id = machine.batchId;
    if (machine.serviceStatus !== undefined) dbObj.service_status = machine.serviceStatus;
    if (machine.lastStatusUpdate !== undefined) dbObj.last_status_update = machine.lastStatusUpdate;
    if (machine.priorityIndex !== undefined) dbObj.priority_index = machine.priorityIndex;
    if (machine.inspectionReport !== undefined) dbObj.inspection_report = machine.inspectionReport;
    if (machine.materialRequest !== undefined) dbObj.material_request = machine.materialRequest;
    if (machine.serviceLogs !== undefined) dbObj.service_logs = machine.serviceLogs;
    return dbObj;
};

export const machineService = {
  searchMachines: async (query: string): Promise<Machine[]> => {
    // 1. Try exact ID match first (UUID)
    const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query);

    let queryBuilder = supabase
        .from('machines')
        .select(`
            *,
            maintenance_records (*)
        `)
        .limit(20); // Limit search results

    if (isUUID) {
        queryBuilder = queryBuilder.eq('id', query).limit(1);
    } else {
        queryBuilder = queryBuilder.or(`serial_number.eq."${query}",client_asset_number.eq."${query}",make.ilike."%${query}%",model.ilike."%${query}%",client.ilike."%${query}%"`);
    }

    const { data, error } = await queryBuilder;
    
    if (error || !data) return [];
    return data.map((m: any) => mapDbToMachine(m, m.maintenance_records || []));
  },

  deleteMachine: async (machineId: string): Promise<void> => {
      // Manually delete related records first to ensure deletion works even without CASCADE
      await supabase.from('maintenance_records').delete().eq('machine_id', machineId);
      
      const { error } = await supabase.from('machines').delete().eq('id', machineId);
      
      if (error) {
          console.error("Error deleting machine:", error);
          throw new Error(`Failed to delete machine: ${error.message}`);
      }
  },

  getUserProfile: async (): Promise<{ role: 'admin' | 'user' }> => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return { role: 'user' };

      const { data } = await supabase
          .from('user_profiles')
          .select('role')
          .eq('id', user.id)
          .single();
      
      return { role: data?.role || 'user' };
  },

  addMachine: async (newMachineData: Omit<Machine, 'id' | 'history'>): Promise<Machine> => {
    // 1. Insert Machine
    const dbMachine = mapMachineToDb({
        ...newMachineData,
        serviceStatus: 'Pending Inspection',
        lastStatusUpdate: Date.now(),
        // priorityIndex: // We need to fetch count or max priority to append
    });

    // Get current count for priority
    const { count } = await supabase.from('machines').select('*', { count: 'exact', head: true });
    dbMachine.priority_index = count || 0;

    const { data, error } = await supabase
        .from('machines')
        .insert(dbMachine)
        .select()
        .single();

    if (error) throw error;

    // Get current user for technician name
    const { data: { user } } = await supabase.auth.getUser();
    const technicianName = user?.user_metadata?.full_name || user?.email || 'System';

    // 2. Insert Initial History Record
    const initialHistory = {
        machine_id: data.id,
        date: new Date().toISOString().split('T')[0],
        technician: technicianName,
        description: 'Machine Registered',
        notes: 'Initial registration in the system.'
    };

    const { data: histData, error: histError } = await supabase
        .from('maintenance_records')
        .insert(initialHistory)
        .select()
        .single();
        
    if (histError) console.error("Error creating initial history", histError);

    return mapDbToMachine(data, histData ? [histData] : []);
  },

  getAllMachines: async (withHistory = false, limit?: number): Promise<Machine[]> => {
    // Optimized: Fetch machines with optional limit and pagination
    const selectQuery = withHistory ? '*, maintenance_records (*)' : '*';
    let query = supabase
        .from('machines')
        .select(selectQuery, { count: 'exact' })
        .order('created_at', { ascending: false });
    
    if (limit) {
      query = query.limit(limit);
    }

    const { data: machinesData, error } = await query;

    if (error) throw error;

    return machinesData.map((m: any) => mapDbToMachine(m, m.maintenance_records || []));
  },

  getActiveMachines: async (withHistory = false, page?: number, pageSize?: number): Promise<{ machines: Machine[], total: number, hasMore: boolean }> => {
      // Optimized: Only fetch machines that are NOT completed, with optional pagination
      const selectQuery = withHistory ? '*, maintenance_records (*)' : '*';
      
      // Get total count
      const { count } = await supabase
          .from('machines')
          .select('*', { count: 'exact', head: true })
          .not('service_status', 'is', null)
          .neq('service_status', 'Completed');
      
      let query = supabase
          .from('machines')
          .select(selectQuery)
          .not('service_status', 'is', null)
          .neq('service_status', 'Completed')
          .order('priority_index', { ascending: true, nullsFirst: false })
          .order('last_status_update', { ascending: false });
      
      // Apply pagination if specified
      if (page !== undefined && pageSize !== undefined) {
          const from = (page - 1) * pageSize;
          const to = from + pageSize - 1;
          query = query.range(from, to);
      }

      const { data: machinesData, error } = await query;

      if (error) throw error;
      
      const machines = machinesData.map((m: any) => mapDbToMachine(m, m.maintenance_records || []));
      const total = count || 0;
      const hasMore = page !== undefined && pageSize !== undefined 
          ? ((page * pageSize) < total) 
          : false;
      
      return { machines, total, hasMore };
  },

  getKnownMakesAndModels: async (): Promise<{ makes: string[], models: Record<string, string[]> }> => {
    // Helper to safely fetch catalog data
    const safeFetch = async (query: any) => {
        try {
            const res = await query;
            if (res.error) console.warn('Catalog fetch error:', res.error); 
            return res;
        } catch (err) {
            console.warn('Catalog fetch exception:', err);
            return { data: [], error: err };
        }
    };

    // Fetch from all relevant catalogs
    const [catalogRes, makesRes, partsRes, modelsRes] = await Promise.all([
        safeFetch(supabase.from('machine_catalog').select('make, model')),
        safeFetch(supabase.from('makes_catalog').select('name')),
        safeFetch(supabase.from('parts_catalog').select('make, compatible_machines')),
        safeFetch(supabase.from('models_catalog').select('name'))
    ]);

    const makes = new Set<string>();
    const modelsByMake: Record<string, Set<string>> = {};

    const addModel = (makeName: string, modelName: string) => {
        if (!makeName || !modelName) return;
        if (!modelsByMake[makeName]) modelsByMake[makeName] = new Set();
        modelsByMake[makeName].add(modelName);
    };

    // Process Machine Catalog
    if (!catalogRes.error && catalogRes.data) {
        catalogRes.data.forEach((item: any) => {
            const makeName = item.make?.trim();
            if (makeName) {
                makes.add(makeName);
                addModel(makeName, item.model?.trim());
            }
        });
    }

    // Process Makes Catalog
    if (!makesRes.error && makesRes.data) {
        makesRes.data.forEach((item: any) => {
            const makeName = item.name?.trim();
            if (makeName) {
                makes.add(makeName);
            }
        });
    }

    // Process Parts Catalog
    if (!partsRes.error && partsRes.data) {
        partsRes.data.forEach((item: any) => {
            const makeName = item.make?.trim() || 'Unknown';
            if (item.make?.trim()) {
                makes.add(item.make.trim());
            }
            if (Array.isArray(item.compatible_machines)) {
                item.compatible_machines.forEach((model: string) => {
                    const modelName = typeof model === 'string' ? model.trim() : '';
                    if (modelName) addModel(makeName, modelName);
                });
            }
        });
    }

    // Process Models Catalog
    if (!modelsRes.error && modelsRes.data) {
        modelsRes.data.forEach((item: any) => {
            const modelName = item.name?.trim();
            if (modelName) {
                addModel('Unknown', modelName);
            }
        });
    }

    // Convert Sets to Arrays, sort them alphabetically for better UI
    const finalModels: Record<string, string[]> = {};
    Object.keys(modelsByMake).forEach(k => {
        finalModels[k] = Array.from(modelsByMake[k]).sort();
    });

    return { 
        makes: Array.from(makes).sort(), 
        models: finalModels 
    };
  },

  addCatalogEntry: async (make: string, model: string = ''): Promise<void> => {
      // Check if exists first to avoid unique constraint error (though insert on conflict do nothing is better)
      const { error } = await supabase
          .from('machine_catalog')
          .upsert({ make, model }, { onConflict: 'make, model' });
      
      if (error) console.error("Error adding to catalog", error);
  },

  getKnownClients: async (): Promise<ClientReference[]> => {
      // OPTIMIZED: Only fetch from clients_catalog, not from machines table
      // This should be kept updated when new clients are added
      const clientsMap = new Map<string, ClientReference>();

      // Fetch from catalog (not from all machines)
      const { data, error } = await supabase
          .from('clients_catalog')
          .select('name, contact_person, contact_number, email');

      if (!error && data) {
          data.forEach((c: any) => {
              if (c.name) {
                  clientsMap.set(c.name, {
                      client: c.name,
                      contactPerson: c.contact_person || '',
                      contactNumber: c.contact_number || '',
                      email: c.email || ''
                  });
              }
          });
      }

      return Array.from(clientsMap.values());
  },

  saveImportedData: async (clients: ClientReference[], makes: string[], models: Record<string, string[]>) => {
      // Local storage saving disabled completely.
      console.log("Local storage cache bypassed.");
  },

  // --- MODELS CATALOG ---

  saveModelsCatalog: async (models: string[]): Promise<void> => {
      const payload = models.map(m => ({ name: m }));
      const { error } = await supabase
          .from('models_catalog')
          .upsert(payload, { onConflict: 'name' });
      if (error) throw error;
  },

  getAllModels: async (): Promise<string[]> => {
      const { data, error } = await supabase
          .from('models_catalog')
          .select('name');
      if (error) throw error;
      return data.map((d: any) => d.name);
  },

  // --- MAKES CATALOG ---
  getAllMakes: async (): Promise<string[]> => {
      const { data, error } = await supabase
          .from('makes_catalog')
          .select('name');
      if (error) throw error;
      return data.map((d: any) => d.name);
  },

  addMake: async (name: string): Promise<void> => {
      const { error } = await supabase
          .from('makes_catalog')
          .upsert({ name }, { onConflict: 'name' });
      if (error) throw error;
  },

  // --- CLIENTS CATALOG ---
  getAllClients: async (): Promise<ClientReference[]> => {
      const { data, error } = await supabase
          .from('clients_catalog')
          .select('name, email, contact_person, contact_number');
      if (error) throw error;
      return data.map((d: any) => ({
          client: d.name,
          email: d.email,
          contactPerson: d.contact_person,
          contactNumber: d.contact_number
      }));
  },

  addClient: async (client: ClientReference): Promise<void> => {
      const { error } = await supabase
          .from('clients_catalog')
          .upsert({
              name: client.client,
              email: client.email,
              contact_person: client.contactPerson,
              contact_number: client.contactNumber
          }, { onConflict: 'name' });
      if (error) throw error;
  },

  // --- PARTS CATALOG ---

  savePartsCatalog: async (parts: { partNumber: string, partName: string, make?: string, machines: string[] }[]): Promise<void> => {
      // Upsert parts
      // Since Supabase upsert works on unique constraint, we rely on part_number
      
      const partsPayload = parts.map(p => ({
          part_number: p.partNumber,
          part_name: p.partName,
          make: p.make,
          compatible_machines: p.machines
      }));

      // Batch upsert
      const { error } = await supabase
          .from('parts_catalog')
          .upsert(partsPayload, { onConflict: 'part_number' });

      if (error) throw error;
  },

  getPartsForMachine: async (machineModel: string, make?: string): Promise<{ partNumber: string, partName: string, make?: string }[]> => {
      // Fetch all parts and filter in memory or use JSONB query
      // JSONB query: compatible_machines @> '["Model"]'
      
      let query = supabase
          .from('parts_catalog')
          .select('part_number, part_name, make')
          .contains('compatible_machines', JSON.stringify([machineModel]));

      if (make) {
          query = query.eq('make', make);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data.map((p: any) => ({ partNumber: p.part_number, partName: p.part_name, make: p.make }));
  },

  getAllParts: async (): Promise<{ partNumber: string, partName: string, make?: string, compatibleMachines: string[] }[]> => {
      const { data, error } = await supabase
          .from('parts_catalog')
          .select('*');
      
      if (error) throw error;
      return data.map((p: any) => ({ 
          partNumber: p.part_number, 
          partName: p.part_name,
          make: p.make,
          compatibleMachines: p.compatible_machines 
      }));
  },

  addPartToCatalog: async (partNumber: string, partName: string, make?: string, machines: string[] = []): Promise<void> => {
      const { error } = await supabase
          .from('parts_catalog')
          .insert({
              part_number: partNumber,
              part_name: partName,
              make: make,
              compatible_machines: machines
          });
      
      if (error) throw error;
  },

  updatePartCompatibility: async (partNumber: string, newMachine: string): Promise<void> => {
      // 1. Get current machines
      const { data, error } = await supabase
          .from('parts_catalog')
          .select('compatible_machines')
          .eq('part_number', partNumber)
          .single();
      
      if (error) throw error;
      
      const currentMachines: string[] = data.compatible_machines || [];
      if (!currentMachines.includes(newMachine)) {
          const updated = [...currentMachines, newMachine];
          await supabase
              .from('parts_catalog')
              .update({ compatible_machines: updated })
              .eq('part_number', partNumber);
      }
  },

  // --- WORKFLOW METHODS ---

  updateStatus: async (machineId: string, status: ServiceStatus, note?: string): Promise<Machine> => {
      // Fetch current logs first
      const { data: currentMachine } = await supabase.from('machines').select('service_logs').eq('id', machineId).single();
      const currentLogs = currentMachine?.service_logs || [];
      
      const { data: { user } } = await supabase.auth.getUser();
      const technician = user?.user_metadata?.full_name || user?.email || 'System';

      const newLog = {
          status,
          timestamp: Date.now(),
          note,
          technician
      };

      const updates = {
          service_status: status,
          last_status_update: Date.now(),
          service_logs: [...currentLogs, newLog]
      };

      const { data, error } = await supabase
          .from('machines')
          .update(updates)
          .eq('id', machineId)
          .select()
          .single();

      if (error) throw error;
      return mapDbToMachine(data);
  },

  saveInspection: async (machineId: string, report: Omit<InspectionReport, 'timestamp'>): Promise<Machine> => {
      const inspection_report = { ...report, timestamp: Date.now() };
      
      // Update report
      await supabase
          .from('machines')
          .update({ inspection_report })
          .eq('id', machineId);

      // Update status
      return await machineService.updateStatus(machineId, 'Inspected', 'Initial Inspection Completed');
  },

  saveMaterialRequest: async (machineId: string, parts: string): Promise<Machine> => {
      const material_request = { parts, timestamp: Date.now() };
      
      await supabase
          .from('machines')
          .update({ material_request })
          .eq('id', machineId);

      return await machineService.updateStatus(machineId, 'Parts Requested', 'Parts Requested: ' + parts);
  },

  updateMachinePriority: async (machineId: string, newIndex: number, newStatus?: ServiceStatus): Promise<void> => {
      const updates: any = { priority_index: newIndex };
      if (newStatus) {
          updates.service_status = newStatus;
          updates.last_status_update = Date.now();
      }
      
      await supabase.from('machines').update(updates).eq('id', machineId);
  },

  updateWorkflowOrder: async (updates: { id: string, priority: number }[]): Promise<void> => {
      // Supabase doesn't support bulk update with different values easily in one query without RPC
      // We'll use Promise.all for now
      await Promise.all(updates.map(u => 
          supabase.from('machines').update({ priority_index: u.priority }).eq('id', u.id)
      ));
  },

  getWorkingMinutes: (startMs: number, endMs: number): number => {
      return calculateWorkingMinutesInternal(startMs, endMs);
  },

  getWorkingDurationFormatted: (startMs: number, endMs: number): string => {
      const mins = calculateWorkingMinutesInternal(startMs, endMs);
      const h = Math.floor(mins / 60);
      const m = mins % 60;
      return `${h}h ${m}m`;
  },

  // --- SETTINGS ---
  // Note: For a real app, these should be in a 'settings' table. 
  // Keeping in-memory/local storage for now as requested "frontend only" transition.
  
  getThresholds: async (): Promise<ServiceThresholds> => {
      return activeThresholds;
  },

  saveThresholds: async (newThresholds: ServiceThresholds): Promise<void> => {
      activeThresholds = newThresholds;
  },

  getEmailSettings: async (): Promise<EmailSettings> => {
      return activeEmailSettings;
  },

  saveEmailSettings: async (newSettings: EmailSettings): Promise<void> => {
      activeEmailSettings = newSettings;
  }
};

