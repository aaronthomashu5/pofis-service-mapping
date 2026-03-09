import React, { useState, useEffect, useMemo } from 'react';
import { machineService } from '../services/machineService';
import type { Machine, ServiceStatus, InspectionReport } from '../types';
import { InspectionForm, ServiceReportPrompt } from './ServiceWorkflowModals';
import { ClipboardListIcon } from './icons/ClipboardListIcon';
import { CubeIcon } from './icons/CubeIcon';
import { WrenchIcon } from './icons/WrenchIcon';
import { FlagIcon } from './icons/FlagIcon';
import { useEmailSettings } from '../hooks/useQueries';
import { handleDownloadServiceReport, handleSendServiceReportEmail } from '../lib/reportActions';

const COLUMNS: ServiceStatus[] = [
    'Pending Inspection',
    'Inspected',
    'Parts Requested',
    'Under Service',
    'Completed'
];

interface Props { onRequestParts?: (ctx: any) => void }; 

const WorkflowView: React.FC<Props> = ({ onRequestParts }) => {
    const [machines, setMachines] = useState<Machine[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [draggedMachineId, setDraggedMachineId] = useState<string | null>(null);
    const [now, setNow] = useState(Date.now());
    const { data: emailSettings } = useEmailSettings();

    // Modals
    const [inspectingMachineId, setInspectingMachineId] = useState<string | null>(null);
    const [completedMachine, setCompletedMachine] = useState<Machine | null>(null);

    // Refresh timer
    useEffect(() => {
        const interval = setInterval(() => setNow(Date.now()), 60000);
        return () => clearInterval(interval);
    }, []);

    const loadData = async () => {
        try {
            // Optimized: Only fetch active machines, no history needed
            const response = await machineService.getActiveMachines(false);
            // Extract machines array from response
            const data = response.machines;
            // Sort by priorityIndex if available, otherwise by date
            const sorted = data.sort((a, b) => (a.priorityIndex || 0) - (b.priorityIndex || 0));
            setMachines(sorted);
        } catch (error) {
            console.error("Failed to load workflow", error);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    // --- DRAG AND DROP ---

    const handleDragStart = (e: React.DragEvent, machineId: string) => {
        setDraggedMachineId(machineId);
        e.dataTransfer.effectAllowed = 'move';
        // Set a transparent drag image or custom one if needed
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
    };

    const handleDrop = async (e: React.DragEvent, targetStatus: ServiceStatus) => {
        e.preventDefault();
        if (!draggedMachineId) return;

        const machine = machines.find(m => m.id === draggedMachineId);
        if (!machine) return;

        // If dropping on the column background (not on a card), append to end
        if (machine.serviceStatus === targetStatus) {
            // Same column, no reorder if dropped on background (effectively "cancel" or "move to end"?)
            // Let's assume "move to end" if dropped on empty space
            // But we need to be careful not to trigger this when dropping on a card (handled by handleCardDrop)
            // We can check e.target to see if it's the column container
            // But let's just return for now to avoid accidental reorders
            setDraggedMachineId(null);
            return;
        }

        // Logic for specific transitions
        if (targetStatus === 'Inspected' && !machine.inspectionReport) {
            setInspectingMachineId(machine.id);
            setDraggedMachineId(null);
            return;
        }

        if (targetStatus === 'Parts Requested' && !machine.materialRequest) {
            if (onRequestParts) {
                 onRequestParts({ machineId: machine.id, model: machine.model, make: machine.make, partNumber: machine.partNumber, serialNumber: machine.serialNumber });
            }
            setDraggedMachineId(null);
            return;
        }

        // Direct update for other statuses
        if (targetStatus === 'Under Service') {
            const technician = window.prompt("Enter technician name taking up the job:");
            if (!technician || technician.trim() === '') {
                setDraggedMachineId(null);
                return; // Cancel drop if no technician is entered
            }
            setIsLoading(true);
            try {
                await machineService.updateStatus(draggedMachineId, targetStatus, `Technician assigned: ${technician.trim()}`);
                const targetColumnMachines = machines.filter(m => (m.serviceStatus || 'Pending Inspection') === targetStatus);
                const basePriority = getBasePriority(targetStatus);
                const newPriority = basePriority + targetColumnMachines.length;
                await machineService.updateMachinePriority(draggedMachineId, newPriority);
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
                setDraggedMachineId(null);
                await loadData();
            }
            return;
        }

        if (targetStatus === 'Completed') {
            const accept = window.confirm("Mark this service as Completed?");
            if (!accept) {
                setDraggedMachineId(null);
                return;
            }
            setIsLoading(true);
            try {
                await machineService.updateStatus(draggedMachineId, targetStatus, 'Service marked as complete');
                const targetColumnMachines = machines.filter(m => (m.serviceStatus || 'Pending Inspection') === targetStatus);
                const basePriority = getBasePriority(targetStatus);
                const newPriority = basePriority + targetColumnMachines.length;
                await machineService.updateMachinePriority(draggedMachineId, newPriority);
                const machine = machines.find(m => m.id === draggedMachineId);
                if (machine) {
                    setCompletedMachine({ ...machine, serviceStatus: 'Completed' });
                }
            } catch (e) {
                console.error(e);
            } finally {
                setIsLoading(false);
                setDraggedMachineId(null);
                await loadData();
            }
            return;
        }

        setIsLoading(true);
        try {
            await machineService.updateStatus(draggedMachineId, targetStatus);
            // Also update priority to be at the end of the new column
            const targetColumnMachines = machines.filter(m => (m.serviceStatus || 'Pending Inspection') === targetStatus);
            const basePriority = getBasePriority(targetStatus);
            const newPriority = basePriority + targetColumnMachines.length;
            await machineService.updateMachinePriority(draggedMachineId, newPriority);
            
            await loadData();
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
            setDraggedMachineId(null);
        }
    };

    const handleCardDrop = async (e: React.DragEvent, targetMachineId: string) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent column drop
        if (!draggedMachineId || draggedMachineId === targetMachineId) return;

        const sourceMachine = machines.find(m => m.id === draggedMachineId);
        const targetMachine = machines.find(m => m.id === targetMachineId);
        
        if (!sourceMachine || !targetMachine) return;

        const targetStatus = targetMachine.serviceStatus || 'Pending Inspection';

        // If moving to a different status via card drop
        if ((sourceMachine.serviceStatus || 'Pending Inspection') !== targetStatus) {
             // Handle status change first, then reorder?
             // For simplicity, just treat it as a status change to the end (handled by column drop)
             // Or we can try to insert it at the specific position, but that's complex with the modals.
             // Let's just delegate to handleDrop for status changes.
             handleDrop(e, targetStatus);
             return;
        }

        // Reordering within same status
        const statusMachines = getColumnMachines(targetStatus); // Already sorted by priority
        const sourceIndex = statusMachines.findIndex(m => m.id === draggedMachineId);
        const targetIndex = statusMachines.findIndex(m => m.id === targetMachineId);

        if (sourceIndex === -1 || targetIndex === -1) return;

        const newOrder = [...statusMachines];
        const [moved] = newOrder.splice(sourceIndex, 1);
        newOrder.splice(targetIndex, 0, moved);

        const basePriority = getBasePriority(targetStatus);
        const updates = newOrder.map((m, index) => ({
            id: m.id,
            priority: basePriority + index
        }));

        setIsLoading(true);
        try {
            await machineService.updateWorkflowOrder(updates);
            await loadData();
        } catch (err) {
            console.error(err);
        } finally {
            setIsLoading(false);
            setDraggedMachineId(null);
        }
    };

    const getBasePriority = (status: ServiceStatus) => {
        const index = COLUMNS.indexOf(status);
        return (index + 1) * 1000;
    };

    // --- MODAL HANDLERS ---

    const handleInspectSubmit = async (data: Omit<InspectionReport, 'timestamp'>) => {
        if (!inspectingMachineId) return;
        setIsLoading(true);
        await machineService.saveInspection(inspectingMachineId, data);
        setInspectingMachineId(null);
        await loadData();
    };

    // --- RENDER ---

    const getColumnMachines = (status: ServiceStatus) => {
        return machines.filter(m => (m.serviceStatus || 'Pending Inspection') === status);
    };

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Pending Inspection': return 'border-yellow-200 bg-yellow-50';
            case 'Inspected': return 'border-blue-200 bg-blue-50';
            case 'Parts Requested': return 'border-purple-200 bg-purple-50';
            case 'Under Service': return 'border-orange-200 bg-orange-50';
            case 'Completed': return 'border-green-200 bg-green-50';
            default: return 'border-gray-200 bg-gray-50';
        }
    };

    if (isLoading && machines.length === 0) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="h-[calc(100vh-12rem)] overflow-x-auto pb-4">
            <div className="flex gap-4 min-w-max h-full">
                {COLUMNS.map(status => (
                    <div 
                        key={status}
                        className={`w-80 flex-shrink-0 flex flex-col rounded-xl border ${getStatusColor(status)} backdrop-blur-sm transition-colors duration-300`}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, status)}
                    >
                        {/* Column Header */}
                        <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-white/50 rounded-t-xl">
                            <h3 className="font-bold text-gray-900 text-sm uppercase tracking-wider">{status}</h3>
                            <span className="bg-gray-200 text-gray-700 text-xs px-2 py-1 rounded-full font-mono">
                                {getColumnMachines(status).length}
                            </span>
                        </div>

                        {/* Cards Container */}
                        <div className="flex-1 p-3 overflow-y-auto space-y-3 custom-scrollbar">
                            {getColumnMachines(status).map(machine => (
                                <div
                                    key={machine.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, machine.id)}
                                    onDragOver={(e) => e.preventDefault()}
                                    onDrop={(e) => handleCardDrop(e, machine.id)}
                                    className={`
                                        bg-white p-4 rounded-lg shadow-sm border border-gray-200 cursor-grab active:cursor-grabbing hover:border-black/50 transition-all group relative
                                        ${draggedMachineId === machine.id ? 'opacity-50 scale-95' : 'opacity-100'}
                                    `}
                                >
                                    {/* Status Indicator Dot */}
                                    <div className={`absolute top-4 right-4 w-2 h-2 rounded-full ${
                                        machine.inspectionReport?.isAlive === 'Dead' ? 'bg-red-500' : 'bg-green-500'
                                    } ${!machine.inspectionReport ? 'hidden' : ''}`}></div>

                                    <div className="mb-2">
                                        <h4 className="font-bold text-gray-900 text-sm truncate">{machine.make} {machine.model}</h4>
                                        <p className="text-xs text-gray-500 truncate">{machine.client}</p>
                                    </div>

                                    <div className="flex justify-between items-end mt-3">
                                        <span className="text-[10px] uppercase font-bold text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                                            {machine.serialNumber || 'No S/N'}
                                        </span>
                                        
                                        {machine.lastStatusUpdate && (
                                            <span className="text-xs text-gray-500 font-mono">
                                                {machineService.getWorkingDurationFormatted(machine.lastStatusUpdate, now)}
                                            </span>
                                        )}
                                    </div>

                                    {/* Mini Indicators */}
                                    <div className="mt-3 flex items-center justify-between border-t border-gray-100 pt-2">
                                        <div className="flex gap-2">
                                            {machine.inspectionReport && (
                                                <div className="text-blue-600" title="Inspected">
                                                    <ClipboardListIcon />
                                                </div>
                                            )}
                                            {machine.materialRequest && (
                                                <div className="text-yellow-600" title="Parts Requested">
                                                    <CubeIcon />
                                                </div>
                                            )}
                                            {(!machine.materialRequest && machine.serviceStatus === 'Inspected') && (
                                                <button 
                                                     onClick={() => onRequestParts && onRequestParts({ machineId: machine.id, model: machine.model, make: machine.make, partNumber: machine.partNumber, serialNumber: machine.serialNumber })} 
                                                     className="text-gray-400 hover:text-yellow-600 transition" 
                                                     title="Request Parts"
                                                >
                                                     <CubeIcon />
                                                </button>
                                            )}
                                        </div>

                                        {status === 'Completed' && (
                                            <div className="flex gap-1 text-[10px]">
                                                <button 
                                                    onClick={() => handleDownloadServiceReport(machine)}
                                                    className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-1.5 py-1 rounded border border-gray-300 transition flex items-center gap-1"
                                                    title="Download Service Report"
                                                >
                                                    📄 PDF
                                                </button>
                                                <button 
                                                    onClick={() => handleSendServiceReportEmail(machine, emailSettings)}
                                                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 px-1.5 py-1 rounded border border-blue-200 transition flex items-center gap-1"
                                                    title="Email Service Report"
                                                >
                                                    ✉️ Email
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                            {getColumnMachines(status).length === 0 && (
                                <div className="h-24 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-gray-400 text-xs">
                                    Drop here
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>

            {/* Modals */}
            {inspectingMachineId && (
                <InspectionForm 
                    onClose={() => setInspectingMachineId(null)} 
                    onSubmit={handleInspectSubmit} 
                />
            )}

            {completedMachine && (
                <ServiceReportPrompt
                    machineMake={completedMachine.make}
                    machineModel={completedMachine.model}
                    onDownload={() => {
                        handleDownloadServiceReport(completedMachine);
                        setCompletedMachine(null);
                    }}
                    onEmail={() => {
                        handleSendServiceReportEmail(completedMachine, emailSettings);
                        setCompletedMachine(null);
                    }}
                    onClose={() => setCompletedMachine(null)}
                />
            )}
        </div>
    );
};

export default WorkflowView;
