
import React, { useState } from 'react';
import { machineService } from '../services/machineService';
import { XIcon } from './icons/XIcon';
import type { InspectionReport } from '../types';

interface ModalProps {
    title: string;
    onClose: () => void;
    children: React.ReactNode;
}

const Modal: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-fade-in">
        <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-full max-w-lg overflow-y-auto max-h-[90vh]">
            <div className="flex justify-between items-center p-4 border-b border-gray-200 bg-white sticky top-0">
                <h3 className="text-xl font-bold text-black">{title}</h3>
                <button onClick={onClose} className="text-gray-500 hover:text-black"><XIcon /></button>
            </div>
            <div className="p-6">
                {children}
            </div>
        </div>
    </div>
);

interface InspectionFormProps {
    onClose: () => void;
    onSubmit: (data: Omit<InspectionReport, 'timestamp'>) => void;
}

export const InspectionForm: React.FC<InspectionFormProps> = ({ onClose, onSubmit }) => {
    const [formData, setFormData] = useState({
        isAlive: 'Alive' as 'Alive' | 'Dead',
        errorCodes: '',
        observations: '',
        diodeTest: '',
        continuityTest: ''
    });

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onSubmit(formData);
    };

    return (
        <Modal title="Machine Inspection" onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Status (Dead/Alive)</label>
                    <div className="flex gap-4">
                        {['Alive', 'Dead'].map(status => (
                            <label key={status} className={`flex-1 cursor-pointer border rounded-md p-3 flex items-center justify-center gap-2 transition ${formData.isAlive === status ? 'bg-cyan-50 border-cyan-500 text-cyan-700' : 'bg-gray-100 border-gray-300 text-gray-700'}`}>
                                <input 
                                    type="radio" 
                                    name="isAlive" 
                                    value={status} 
                                    checked={formData.isAlive === status} 
                                    onChange={e => setFormData({...formData, isAlive: e.target.value as any})}
                                    className="hidden" 
                                />
                                <span className="font-bold">{status}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Error Codes</label>
                    <input 
                        type="text" 
                        value={formData.errorCodes} 
                        onChange={e => setFormData({...formData, errorCodes: e.target.value})}
                        className="w-full bg-white border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-black focus:border-transparent outline-none" 
                        placeholder="e.g., E-401, P-22"
                    />
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Initial Observations</label>
                    <textarea 
                        required
                        value={formData.observations}
                        onChange={e => setFormData({...formData, observations: e.target.value})}
                        className="w-full bg-white border border-gray-300 rounded-md p-2 text-gray-900 h-24 focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                        placeholder="Describe damage, leaks, marks, etc..."
                    ></textarea>
                </div>

                <div className="grid grid-cols-2 gap-4">
                    <div>
                         <label className="block text-sm font-medium text-gray-500 mb-1">Diode Test</label>
                        <input 
                            type="text" 
                            value={formData.diodeTest} 
                            onChange={e => setFormData({...formData, diodeTest: e.target.value})}
                            className="w-full bg-white border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-black focus:border-transparent outline-none" 
                            placeholder="Value / Result"
                        />
                    </div>
                    <div>
                         <label className="block text-sm font-medium text-gray-500 mb-1">Continuity Test</label>
                        <input 
                            type="text" 
                            value={formData.continuityTest} 
                            onChange={e => setFormData({...formData, continuityTest: e.target.value})}
                            className="w-full bg-white border border-gray-300 rounded-md p-2 text-gray-900 focus:ring-2 focus:ring-black focus:border-transparent outline-none" 
                            placeholder="Pass / Fail"
                        />
                    </div>
                </div>

                <button type="submit" className="w-full bg-black text-white font-bold py-3 rounded-md hover:bg-gray-800 transition mt-4">
                    Submit Inspection
                </button>
            </form>
        </Modal>
    );
};

interface PartsRequestFormProps {
    machineModel: string;
    onClose: () => void;
    onSubmit: (parts: string) => void;
}

export const PartsRequestForm: React.FC<PartsRequestFormProps> = ({ machineModel, onClose, onSubmit }) => {
    const [parts, setParts] = useState('');
    const [catalogParts, setCatalogParts] = useState<{ partNumber: string, partName: string }[]>([]);
    const [selectedParts, setSelectedParts] = useState<string[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [allCatalogParts, setAllCatalogParts] = useState<{ partNumber: string, partName: string, make?: string, compatibleMachines: string[] }[]>([]);
    const [showAddPart, setShowAddPart] = useState(false);
    const [newPart, setNewPart] = useState({ number: '', name: '', make: '' });

    // Load parts for this machine on mount
    React.useEffect(() => {
        const loadParts = async () => {
            try {
                const machineSpecific = await machineService.getPartsForMachine(machineModel);
                setCatalogParts(machineSpecific);
                
                const all = await machineService.getAllParts();
                setAllCatalogParts(all);
            } catch (e) {
                console.error("Error loading parts", e);
            }
        };
        loadParts();
    }, [machineModel]);

    const handleTogglePart = (partStr: string) => {
        if (selectedParts.includes(partStr)) {
            setSelectedParts(prev => prev.filter(p => p !== partStr));
        } else {
            setSelectedParts(prev => [...prev, partStr]);
        }
    };

    const handleAddPartToCatalog = async () => {
        if (!newPart.number || !newPart.name) return;
        try {
            await machineService.addPartToCatalog(newPart.number, newPart.name, newPart.make, [machineModel]);
            // Refresh
            const machineSpecific = await machineService.getPartsForMachine(machineModel);
            setCatalogParts(machineSpecific);
            setNewPart({ number: '', name: '', make: '' });
            setShowAddPart(false);
            // Auto select
            handleTogglePart(`${newPart.number} - ${newPart.name}${newPart.make ? ` (${newPart.make})` : ''}`);
        } catch (e) {
            console.error("Error adding part", e);
            alert("Failed to add part");
        }
    };

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        // Combine selected parts and manual text
        const selectedText = selectedParts.join('\n');
        const finalText = selectedText + (parts ? '\n' + parts : '');
        onSubmit(finalText);
    };

    // Filter parts based on search
    const filteredCatalog = catalogParts.filter(p => 
        p.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.partName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    // Check if search term matches any known part in the ENTIRE catalog (not just this machine)
    const globalMatches = searchTerm.length > 2 ? allCatalogParts.filter(p => 
        !catalogParts.find(cp => cp.partNumber === p.partNumber) && // Not already in machine list
        (p.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.partName.toLowerCase().includes(searchTerm.toLowerCase()))
    ) : [];

    return (
        <Modal title={`Material Request: ${machineModel}`} onClose={onClose}>
            <form onSubmit={handleSubmit} className="space-y-4">
                 <div className="bg-yellow-50 border border-yellow-200 p-3 rounded text-sm text-yellow-800 mb-2">
                    Select parts from catalog or enter manually.
                </div>

                {/* Catalog Selection */}
                <div className="border border-gray-200 rounded-md p-3 bg-gray-50">
                    <label className="block text-sm font-bold text-gray-700 mb-2">Catalog Search</label>
                    <input 
                        type="text" 
                        placeholder="Search part number or name..." 
                        value={searchTerm}
                        onChange={e => setSearchTerm(e.target.value)}
                        className="w-full border border-gray-300 rounded p-2 text-sm mb-2"
                    />
                    
                    <div className="max-h-40 overflow-y-auto space-y-1 bg-white border border-gray-200 rounded p-2">
                        {filteredCatalog.map(p => {
                            const val = `${p.partNumber} - ${p.partName}${p.make ? ` (${p.make})` : ''}`;
                            return (
                                <label key={p.partNumber} className="flex items-center gap-2 p-1 hover:bg-gray-100 rounded cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        checked={selectedParts.includes(val)}
                                        onChange={() => handleTogglePart(val)}
                                        className="rounded text-blue-600"
                                    />
                                    <span className="text-sm">{val}</span>
                                </label>
                            );
                        })}
                        
                        {filteredCatalog.length === 0 && <p className="text-xs text-gray-500 p-1">No machine-specific parts found matching search.</p>}
                    </div>

                    {/* Global Search Results (Add to Machine) */}
                    {globalMatches.length > 0 && (
                        <div className="mt-2">
                            <p className="text-xs font-bold text-gray-500 mb-1">Other Catalog Parts (Click to Add to Machine)</p>
                            <div className="max-h-32 overflow-y-auto space-y-1 bg-white border border-gray-200 rounded p-2">
                                {globalMatches.map(p => (
                                    <button
                                        key={p.partNumber}
                                        type="button"
                                        onClick={async () => {
                                            await machineService.updatePartCompatibility(p.partNumber, machineModel);
                                            // Refresh local list
                                            const machineSpecific = await machineService.getPartsForMachine(machineModel);
                                            setCatalogParts(machineSpecific);
                                            setSearchTerm(''); // Clear search to show list
                                        }}
                                        className="w-full text-left text-xs p-1 hover:bg-blue-50 text-blue-600 flex items-center gap-1"
                                    >
                                        <span>+</span> {p.partNumber} - {p.partName}{p.make ? ` (${p.make})` : ''}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Add New Part */}
                    <div className="mt-2 pt-2 border-t border-gray-200">
                        {!showAddPart ? (
                            <button 
                                type="button"
                                onClick={() => setShowAddPart(true)}
                                className="text-xs text-blue-600 font-bold hover:underline"
                            >
                                + Add New Part to Catalog
                            </button>
                        ) : (
                            <div className="bg-white p-2 rounded border border-gray-200 space-y-2">
                                <input 
                                    type="text" 
                                    placeholder="Part Number" 
                                    value={newPart.number}
                                    onChange={e => setNewPart({...newPart, number: e.target.value})}
                                    className="w-full border border-gray-300 rounded p-1 text-xs"
                                />
                                <input 
                                    type="text" 
                                    placeholder="Part Name" 
                                    value={newPart.name}
                                    onChange={e => setNewPart({...newPart, name: e.target.value})}
                                    className="w-full border border-gray-300 rounded p-1 text-xs"
                                />
                                <input 
                                    type="text" 
                                    placeholder="Make (Optional)" 
                                    value={newPart.make}
                                    onChange={e => setNewPart({...newPart, make: e.target.value})}
                                    className="w-full border border-gray-300 rounded p-1 text-xs"
                                />
                                <div className="flex justify-end gap-2">
                                    <button 
                                        type="button" 
                                        onClick={() => setShowAddPart(false)}
                                        className="text-xs text-gray-500"
                                    >
                                        Cancel
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={handleAddPartToCatalog}
                                        className="text-xs bg-blue-600 text-white px-2 py-1 rounded"
                                    >
                                        Add & Select
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Additional Notes / Manual Entry</label>
                    <textarea 
                        value={parts}
                        onChange={e => setParts(e.target.value)}
                        className="w-full bg-white border border-gray-300 rounded-md p-2 text-gray-900 h-24 focus:ring-2 focus:ring-black focus:border-transparent outline-none"
                        placeholder="List additional parts or quantities..."
                    ></textarea>
                </div>
                <button type="submit" className="w-full bg-blue-600 text-white font-bold py-3 rounded-md hover:bg-blue-700 transition">
                    Raise Material Request
                </button>
            </form>
        </Modal>
    );
};

export interface ServiceReportPromptProps {
    machineMake: string;
    machineModel: string;
    onDownload: () => void;
    onEmail: () => void;
    onClose: () => void;
}

export const ServiceReportPrompt: React.FC<ServiceReportPromptProps> = ({ machineMake, machineModel, onDownload, onEmail, onClose }) => {
    return (
        <Modal title="Service Completed Successfully" onClose={onClose}>
            <div className="text-center p-4">
                <div className="text-5xl mb-4">✅</div>
                <h3 className="text-xl font-bold mb-2">Service Completed</h3>
                <p className="text-gray-600 mb-6">
                    The service for <strong>{machineMake} {machineModel}</strong> has been marked as completed. Would you like to generate the Service Report now?
                </p>
                <div className="flex flex-col gap-3">
                    <button 
                        onClick={onDownload}
                        className="w-full bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-800 font-bold py-3 rounded-md transition flex items-center justify-center gap-2"
                    >
                        📄 Download PDF Report
                    </button>
                    <button 
                        onClick={onEmail}
                        className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-md transition flex items-center justify-center gap-2"
                    >
                        ✉️ Email Report to Client
                    </button>
                    <button 
                        onClick={onClose}
                        className="w-full mt-2 text-gray-500 hover:text-gray-700 hover:underline py-2"
                    >
                        Skip for now
                    </button>
                </div>
            </div>
        </Modal>
    );
};
