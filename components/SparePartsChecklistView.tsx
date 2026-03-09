import React, { useState, useEffect } from 'react';
import { machineService } from '../services/machineService';
import type { PartCatalogEntry } from '../types';

interface SparePartsContext {
    machineId: string;
    model: string;
    make?: string;
    partNumber?: string;
    serialNumber?: string;
}

interface Props {
    context: SparePartsContext | null;
    onBack: () => void;
}

export const SparePartsChecklistView: React.FC<Props> = ({ context, onBack }) => {
    const [availableParts, setAvailableParts] = useState<PartCatalogEntry[]>([]);
    const [selectedParts, setSelectedParts] = useState<string[]>([]);
    const [notes, setNotes] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (context?.model) {
            loadParts(context.model, context.make);
        }
    }, [context]);

    const loadParts = async (model: string, make?: string) => {
        setLoading(true);
        try {
            const data = await machineService.getPartsForMachine(model, make);
            setAvailableParts(data || []);
        } catch (error) {
            console.error('Failed to load parts:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleTogglePart = (partNumber: string) => {
        setSelectedParts(prev => 
            prev.includes(partNumber) 
                ? prev.filter(p => p !== partNumber)
                : [...prev, partNumber]
        );
    };

    const handleSubmit = async () => {
        if (!context?.machineId) return;
        setSubmitting(true);
        try {
            const requestedItems = selectedParts.map(pn => {
                const part = availableParts.find(p => p.partNumber === pn);
                return part ? `${part.partName} (${part.partNumber})` : pn;
            });
            const requestString = `Requested Parts:\n${requestedItems.join('\n')}\n\nNotes:\n${notes}`;
            
            await machineService.saveMaterialRequest(context.machineId, requestString);
            await machineService.updateStatus(context.machineId, 'Parts Requested', 'Requested specific parts.');
            onBack();
        } catch (error) {
            console.error('Failed to submit parts request:', error);
            alert('Failed to submit request.');
        } finally {
            setSubmitting(false);
        }
    };

    if (!context) {
        return (
            <div className="p-6 max-w-7xl mx-auto text-center">
                <p className="mb-4 text-gray-600">Go to Service Queue to select a machine for parts.</p>
                <button onClick={onBack} className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700">Go Back</button>
            </div>
        );
    }

    const filteredParts = availableParts.filter(p => 
        p.partNumber.toLowerCase().includes(searchTerm.toLowerCase()) || 
        p.partName.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="p-6 max-w-7xl mx-auto">
            <div className="mb-6 flex justify-between items-center">
                <h1 className="text-2xl font-bold text-gray-800">Parts Request</h1>
                <button onClick={onBack} className="text-gray-600 hover:text-gray-900 font-medium">← Back</button>
            </div>

            <div className="bg-white p-4 rounded-lg shadow mb-6 space-y-2 text-sm">
                <h2 className="font-semibold text-gray-700 mb-2 border-b pb-2">Machine Info</h2>
                <div className="grid grid-cols-2 gap-4">
                    <div><span className="text-gray-500">Make:</span> {context.make || '-'}</div>
                    <div><span className="text-gray-500">Model:</span> {context.model}</div>
                    <div><span className="text-gray-500">S/N:</span> {context.serialNumber || '-'}</div>
                    <div><span className="text-gray-500">P/N:</span> {context.partNumber || '-'}</div>
                </div>
            </div>

            <div className="mb-4">
                <input 
                    type="text" 
                    placeholder="Search parts by name or number..." 
                    className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                />
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
                {loading ? (
                    <div className="p-4 text-center text-gray-500">Loading parts...</div>
                ) : (
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 w-10"></th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Part Number</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Part Name</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {filteredParts.map((part) => (
                                <tr key={part.partNumber} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleTogglePart(part.partNumber)}>
                                    <td className="px-6 py-4 whitespace-nowrap">
                                        <input 
                                            type="checkbox" 
                                            checked={selectedParts.includes(part.partNumber)}
                                            onChange={() => handleTogglePart(part.partNumber)}
                                            className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                                            onClick={e => e.stopPropagation()}
                                        />
                                    </td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{part.partNumber}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{part.partName}</td>
                                </tr>
                            ))}
                            {filteredParts.length === 0 && (
                                <tr>
                                    <td colSpan={3} className="px-6 py-4 text-center text-sm text-gray-500">No parts found matching your criteria.</td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                )}
            </div>

            <div className="bg-white p-4 rounded-lg shadow mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">Notes</label>
                <textarea 
                    className="w-full p-2 border border-gray-300 rounded focus:ring-blue-500 focus:border-blue-500"
                    rows={4}
                    placeholder="Add any additional notes for this material request..."
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                />
            </div>

            <div className="flex justify-end">
                <button 
                    onClick={handleSubmit} 
                    disabled={submitting || selectedParts.length === 0}
                    className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
                >
                    {submitting ? 'Submitting...' : 'Submit Parts Request'}
                </button>
            </div>
        </div>
    );
};
