import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { machineService } from '../services/machineService';
import type { Machine, ServiceStatus, InspectionReport } from '../types';

// Query Keys
export const queryKeys = {
  machines: ['machines'] as const,
  activeMachines: ['machines', 'active'] as const,
  machine: (id: string) => ['machines', id] as const,
  makes: ['catalog', 'makes'] as const,
  models: ['catalog', 'models'] as const,
  clients: ['catalog', 'clients'] as const,
  thresholds: ['settings', 'thresholds'] as const,
  emailSettings: ['settings', 'email'] as const,
};

// Hooks for catalog data (frequently accessed, rarely changes)
export const useMakes = () => {
  return useQuery({
    queryKey: queryKeys.makes,
    queryFn: () => machineService.getAllMakes(),
    staleTime: 15 * 60 * 1000, // 15 minutes for catalog data
  });
};

export const useModels = () => {
  return useQuery({
    queryKey: queryKeys.models,
    queryFn: () => machineService.getAllModels(),
    staleTime: 15 * 60 * 1000,
  });
};

export const useClients = () => {
  return useQuery({
    queryKey: queryKeys.clients,
    queryFn: () => machineService.getAllClients(),
    staleTime: 10 * 60 * 1000,
  });
};

// Hooks for machine data
export const useAllMachines = (withHistory = false, limit?: number) => {
  return useQuery({
    queryKey: [...queryKeys.machines, { withHistory, limit }],
    queryFn: () => machineService.getAllMachines(withHistory, limit),
    staleTime: 2 * 60 * 1000, // 2 minutes for machine data
  });
};

export const useActiveMachines = (withHistory = false, page?: number, pageSize?: number) => {
  return useQuery({
    queryKey: [...queryKeys.activeMachines, { withHistory, page, pageSize }],
    queryFn: () => machineService.getActiveMachines(withHistory, page, pageSize),
    staleTime: 3 * 60 * 1000, // 3 minutes for active machines (increased from 1 minute)
  });
};

export const useMachine = (id: string) => {
  return useQuery({
    queryKey: queryKeys.machine(id),
    queryFn: () => machineService.searchMachines(id).then(machines => machines[0]),
    enabled: !!id,
  });
};

// Settings hooks
export const useThresholds = () => {
  return useQuery({
    queryKey: queryKeys.thresholds,
    queryFn: () => machineService.getThresholds(),
    staleTime: 30 * 60 * 1000, // 30 minutes for settings
  });
};

export const useEmailSettings = () => {
  return useQuery({
    queryKey: queryKeys.emailSettings,
    queryFn: () => machineService.getEmailSettings(),
    staleTime: 30 * 60 * 1000,
  });
};

// Mutations
export const useUpdateMachineStatus = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ machineId, status, note }: { machineId: string; status: ServiceStatus; note?: string }) =>
      machineService.updateStatus(machineId, status, note),
    onSuccess: () => {
      // Invalidate and refetch
      queryClient.invalidateQueries({ queryKey: queryKeys.machines });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeMachines });
    },
  });
};

export const useSaveInspection = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ machineId, report }: { machineId: string; report: Omit<InspectionReport, 'timestamp'> }) =>
      machineService.saveInspection(machineId, report),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeMachines });
    },
  });
};

export const useSaveMaterialRequest = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: ({ machineId, parts }: { machineId: string; parts: string }) =>
      machineService.saveMaterialRequest(machineId, parts),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeMachines });
    },
  });
};

export const useDeleteMachine = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (machineId: string) => machineService.deleteMachine(machineId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeMachines });
    },
  });
};

export const useSaveThresholds = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: machineService.saveThresholds,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.thresholds });
    },
  });
};

export const useSaveEmailSettings = () => {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: machineService.saveEmailSettings,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.emailSettings });
    },
  });
};
