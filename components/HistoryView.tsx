
import React, { useEffect, useState } from 'react';
import type { Machine, EmailSettings } from '../types';
import { machineService } from '../services/machineService';
import { pdfGenerator } from '../services/pdfGenerator';
import { ChevronDownIcon } from './icons/ChevronDownIcon';
import { ConfirmationModal } from './ConfirmationModal';  import { handleDownloadServiceReport, handleSendServiceReportEmail } from '../lib/reportActions';
interface BatchGroup {
    batchId: string;
    timestamp: number;
    client: string;
    contactPerson: string;
    machines: Machine[];
}

const HistoryView: React.FC = () => {
    const [batches, setBatches] = useState<BatchGroup[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [expandedBatchId, setExpandedBatchId] = useState<string | null>(null);
    const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
    const [generatedMailtoLink, setGeneratedMailtoLink] = useState<string>('');
    const [activeBatchId, setActiveBatchId] = useState<string | null>(null);

    const [isAdmin, setIsAdmin] = useState(false);

    // Confirmation Modal State
    const [confirmModal, setConfirmModal] = useState<{
        isOpen: boolean;
        title: string;
        message: string;
        onConfirm: () => void;
    }>({
        isOpen: false,
        title: '',
        message: '',
        onConfirm: () => {}
    });

    useEffect(() => {
        const fetchHistory = async () => {
            setIsLoading(true);
            try {
                // Optimized: Fetch all machines, no history needed for list
                const [allMachines, settings, userProfile] = await Promise.all([
                    machineService.getAllMachines(false),
                    machineService.getEmailSettings(),
                    machineService.getUserProfile()
                ]);
                
                setEmailSettings(settings);
                setIsAdmin(userProfile.role === 'admin');
                
                // Group by batchId
                const groups: Record<string, BatchGroup> = {};
                
                allMachines.forEach(machine => {
                    const bId = machine.batchId || 'UNKNOWN';
                    if (!groups[bId]) {
                        // Try to parse timestamp from BATCH-123123 format
                        let ts = 0;
                        if (bId.startsWith('BATCH-')) {
                            const part = bId.split('-')[1];
                            ts = parseInt(part, 10);
                        }
                        
                        groups[bId] = {
                            batchId: bId,
                            timestamp: ts || 0,
                            client: machine.client,
                            contactPerson: machine.contactPerson,
                            machines: []
                        };
                    }
                    groups[bId].machines.push(machine);
                });

                // Convert to array and sort by timestamp desc
                const sortedBatches = Object.values(groups).sort((a, b) => b.timestamp - a.timestamp);
                setBatches(sortedBatches);
            } catch (error) {
                console.error("Failed to load history", error);
            } finally {
                setIsLoading(false);
            }
        };

        fetchHistory();
    }, []);

    const closeConfirmModal = () => {
        setConfirmModal(prev => ({ ...prev, isOpen: false }));
    };

    const handleDeleteMachine = (machineId: string, batchId: string, e: React.MouseEvent) => {
        e.stopPropagation();
        console.log(`[HistoryView] Request to delete machine ${machineId} from batch ${batchId}`);
        
        setConfirmModal({
            isOpen: true,
            title: 'Delete Machine',
            message: 'Are you sure you want to delete this machine? This action cannot be undone.',
            onConfirm: async () => {
                try {
                    console.log(`[HistoryView] Calling machineService.deleteMachine(${machineId})`);
                    await machineService.deleteMachine(machineId);
                    console.log(`[HistoryView] Successfully deleted machine ${machineId}`);
                    
                    setBatches(prev => {
                        return prev.map(b => {
                            if (b.batchId === batchId) {
                                const newMachines = b.machines.filter(m => m.id !== machineId);
                                return { ...b, machines: newMachines };
                            }
                            return b;
                        }).filter(b => b.machines.length > 0);
                    });
                    closeConfirmModal();
                } catch (error) {
                    console.error("Failed to delete machine", error);
                    alert("Error deleting machine: " + (error instanceof Error ? error.message : String(error)));
                    closeConfirmModal();
                }
            }
        });
    };

    const handleDeleteBatch = (batch: BatchGroup, e: React.MouseEvent) => {
        e.stopPropagation();
        console.log(`[HistoryView] Request to delete batch ${batch.batchId}`);
        
        setConfirmModal({
            isOpen: true,
            title: 'Delete Batch',
            message: `Are you sure you want to delete this batch (${batch.batchId})? This action cannot be undone.`,
            onConfirm: async () => {
                try {
                    console.log(`[HistoryView] Deleting all machines in batch ${batch.batchId}`);
                    await Promise.all(batch.machines.map(m => machineService.deleteMachine(m.id)));
                    console.log(`[HistoryView] Successfully deleted batch ${batch.batchId}`);
                    setBatches(prev => prev.filter(b => b.batchId !== batch.batchId));
                    closeConfirmModal();
                } catch (error) {
                    console.error("Failed to delete batch", error);
                    alert("Error deleting batch: " + (error instanceof Error ? error.message : String(error)));
                    closeConfirmModal();
                }
            }
        });
    };

    const toggleExpand = (batchId: string) => {
        setExpandedBatchId(prev => prev === batchId ? null : batchId);
        // Clear link when collapsing/expanding
        if (activeBatchId && activeBatchId !== batchId) {
            setGeneratedMailtoLink('');
            setActiveBatchId(null);
        }
    };

    const formatDate = (ts: number) => {
        if (!ts) return 'Unknown Date';
        return new Date(ts).toLocaleString(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short'
        });
    };

    const handleDownloadReceipt = async (batch: BatchGroup, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const doc = await pdfGenerator.generateReceiptDoc(batch.machines);
            const clientName = batch.client || 'Client';
            doc.save(`Service_Receipt_${clientName.replace(/\s+/g, '_')}_${batch.batchId}.pdf`);
        } catch (error) {
            console.error("Error generating receipt", error);
            alert("Error generating receipt PDF");
        }
    };

    const handleDownloadQrs = async (batch: BatchGroup, e: React.MouseEvent) => {
        e.stopPropagation();
        try {
            const doc = await pdfGenerator.generateQrDoc(batch.machines);
            const clientName = batch.client || 'Client';
            doc.save(`Machine_QR_Codes_${clientName.replace(/\s+/g, '_')}_${batch.batchId}.pdf`);
        } catch (error) {
            console.error("Error generating QRs", error);
            alert("Error generating QR PDF");
        }
    };

    const handleShareEmail = async (batch: BatchGroup, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!emailSettings || batch.machines.length === 0) return;

        const machinesList = batch.machines.map(m => `- ${m.make} ${m.model} (S/N: ${m.serialNumber}, Asset: ${m.clientAssetNumber || 'N/A'})`).join('\n');
        
        const mailBody = `${emailSettings.bodyIntro}\n\nMachines Received:\n${machinesList}\n\n${emailSettings.signature}`;

        try {
            // We'll try to generate the PDF just to ensure it works, but for mailto we rely on the user attaching it
            // or we could trigger download here too
            
            const to = batch.machines[0].clientEmail || '';
            const subject = encodeURIComponent(emailSettings.subject);
            const body = encodeURIComponent(mailBody);
            const cc = encodeURIComponent(emailSettings.cc || '');
            
            let mailtoLink = `mailto:${to}?subject=${subject}`;
            if (cc) mailtoLink += `&cc=${cc}`;
            mailtoLink += `&body=${body}`;
            
            setGeneratedMailtoLink(mailtoLink);
            setActiveBatchId(batch.batchId);
            window.location.href = mailtoLink;
            
        } catch (e) {
            console.error(e);
            alert("Error preparing email");
        }
    };

    if (isLoading) {
        return (
            <div className="flex justify-center items-center h-64">
                <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (batches.length === 0) {
        return (
             <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-xl text-center border border-gray-200 dark:border-gray-700">
                <p className="text-gray-500 dark:text-gray-400">No registration history found.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-black dark:text-white">Registration History</h2>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                    Showing {batches.length} Batch{batches.length !== 1 ? 'es' : ''}
                </div>
            </div>
            
            <div className="space-y-4">
                {batches.map((batch) => (
                    <div key={batch.batchId} className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-md transition-shadow duration-300">
                        {/* Header Row */}
                        <div 
                            onClick={() => toggleExpand(batch.batchId)}
                            className="p-5 flex flex-col md:flex-row items-start md:items-center justify-between cursor-pointer bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 transition border-b border-transparent hover:border-gray-100 dark:hover:border-gray-600 gap-4"
                        >
                            <div className="flex-1 grid grid-cols-1 md:grid-cols-3 gap-4 w-full">
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider mb-1">Client</p>
                                    <h3 className="text-lg font-bold text-gray-900 dark:text-white">{batch.client || 'Unknown Client'}</h3>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider mb-1">Batch Info</p>
                                    <div className="flex flex-col">
                                        <span className="text-sm font-medium text-gray-900 dark:text-gray-200">{formatDate(batch.timestamp)}</span>
                                        <span className="text-xs text-gray-400 font-mono">{batch.batchId}</span>
                                    </div>
                                </div>
                                <div>
                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider mb-1">Summary</p>
                                    <div className="flex items-center gap-2">
                                        <span className="bg-black dark:bg-white text-white dark:text-black text-xs font-bold px-2 py-1 rounded-full">
                                            {batch.machines.length} Machine{batch.machines.length !== 1 ? 's' : ''}
                                        </span>
                                        <span className="text-sm text-gray-600 dark:text-gray-300">by {batch.contactPerson}</span>
                                    </div>
                                </div>
                            </div>
                            
                                    <div className="flex items-center gap-3 w-full md:w-auto justify-end">
                                {isAdmin && (
                                    <button 
                                        onClick={(e) => handleDeleteBatch(batch, e)}
                                        className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition"
                                        title="Delete Batch (Admin Only)"
                                    >
                                        🗑️
                                    </button>
                                )}
                                <div className={`p-2 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 transform transition-transform duration-300 ${expandedBatchId === batch.batchId ? 'rotate-180 bg-gray-200 dark:bg-gray-600 text-black dark:text-white' : ''}`}>
                                    <ChevronDownIcon />
                                </div>
                            </div>
                        </div>

                        {/* Expanded Details */}
                        {expandedBatchId === batch.batchId && (
                            <div className="bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700 p-4">
                                <div className="flex flex-col items-end gap-2 mb-4">
                                    <div className="flex gap-4 justify-end">
                                        <button 
                                            onClick={(e) => handleShareEmail(batch, e)}
                                            className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-3 rounded flex items-center gap-2 transition"
                                        >
                                            ✉️ Send Email
                                        </button>
                                        <button 
                                            onClick={(e) => handleDownloadReceipt(batch, e)}
                                            className="text-xs bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 font-bold py-2 px-3 rounded flex items-center gap-2 transition"
                                        >
                                            📄 Receipt PDF
                                        </button>
                                        <button 
                                            onClick={(e) => handleDownloadQrs(batch, e)}
                                            className="text-xs bg-black dark:bg-white text-white dark:text-black hover:bg-gray-800 dark:hover:bg-gray-200 font-bold py-2 px-3 rounded flex items-center gap-2 transition"
                                        >
                                            🏁 QR Codes PDF
                                        </button>
                                    </div>
                                    
                                    {activeBatchId === batch.batchId && generatedMailtoLink && (
                                        <div className="w-full bg-blue-50 dark:bg-blue-900/20 p-3 rounded text-xs break-all border border-blue-200 dark:border-blue-800">
                                            <p className="font-bold text-blue-800 dark:text-blue-300 mb-1">Generated Link:</p>
                                            <a href={generatedMailtoLink} className="text-blue-600 dark:text-blue-400 hover:underline">{decodeURIComponent(generatedMailtoLink)}</a>
                                        </div>
                                    )}
                                </div>

                                <div className="grid grid-cols-1 gap-3">
                                    {batch.machines.map((machine, idx) => (
                                        <div key={machine.id || idx} className="flex flex-col md:flex-row md:items-center justify-between p-4 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm hover:border-gray-300 dark:hover:border-gray-600 transition">
                                            <div className="flex items-center gap-4">
                                                <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded flex items-center justify-center text-xl border border-gray-200 dark:border-gray-600 overflow-hidden">
                                                    {machine.photo ? (
                                                        <img src={machine.photo} className="w-full h-full object-cover" alt="Machine" />
                                                    ) : (
                                                        <span>🚜</span>
                                                    )}
                                                </div>
                                                <div>
                                                    <div className="font-bold text-gray-900 dark:text-white">{machine.make} {machine.model}</div>
                                                    <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">S/N: {machine.serialNumber || 'N/A'}</div>
                                                </div>
                                            </div>
                                            
                                            <div className="mt-3 md:mt-0 flex items-center gap-6">
                                                {isAdmin && (
                                                    <button 
                                                        onClick={(e) => handleDeleteMachine(machine.id, batch.batchId, e)}
                                                        className="text-red-500 hover:text-red-700 p-2 rounded-full hover:bg-red-50 transition"
                                                        title="Delete Machine (Admin Only)"
                                                    >
                                                        🗑️
                                                    </button>
                                                )}
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Asset #</p>
                                                    <p className="text-sm text-gray-900 dark:text-gray-200 font-mono">{machine.clientAssetNumber || '-'}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Warranty</p>
                                                    <span className={`text-xs px-2 py-1 rounded font-medium ${machine.warrantyStatus === 'Under Warranty' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'}`}>
                                                        {machine.warrantyStatus}
                                                    </span>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase font-bold">Status & Report</p>
                                                    <div className="flex flex-col items-end gap-1 mt-1">
                                                        <span className={`text-xs px-2 py-1 rounded font-medium ${
                                                            machine.serviceStatus === 'Completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                            {machine.serviceStatus || 'Registered'}
                                                        </span>
                                                        {machine.serviceStatus === 'Completed' && (
                                                            <div className="flex gap-1 mt-1">
                                                                 <button 
                                                                    onClick={(e) => { e.stopPropagation(); handleDownloadServiceReport(machine); }}
                                                                    title="Download PDF Report"
                                                                    className="text-xs bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 px-2 py-1 rounded flex items-center transition"
                                                                 >
                                                                     📄 PDF
                                                                 </button>
                                                                 <button 
                                                                     onClick={(e) => { e.stopPropagation(); handleSendServiceReportEmail(machine, emailSettings, setGeneratedMailtoLink); setActiveBatchId(batch.batchId); }}
                                                                     title="Email Service Report"
                                                                     className="text-xs bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 px-2 py-1 rounded flex items-center transition"
                                                                 >
                                                                     ✉️ Email
                                                                 </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <ConfirmationModal
                isOpen={confirmModal.isOpen}
                title={confirmModal.title}
                message={confirmModal.message}
                onConfirm={confirmModal.onConfirm}
                onCancel={closeConfirmModal}
            />
        </div>
    );
};

export default HistoryView;
