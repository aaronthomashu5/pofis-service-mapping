
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { machineService } from '../services/machineService';
import type { Machine, MaintenanceRecord } from '../types';
import { SearchIcon } from './icons/SearchIcon';
import { CameraIcon } from './icons/CameraIcon';
import { XIcon } from './icons/XIcon';
import { useEmailSettings } from '../hooks/useQueries';
import { handleDownloadServiceReport, handleSendServiceReportEmail } from '../lib/reportActions';

const DetailItem: React.FC<{ label: string; value: string | undefined }> = ({ label, value }) => (
    <div className="py-2">
        <p className="text-sm text-gray-500">{label}</p>
        <p className="font-semibold text-gray-900">{value || 'N/A'}</p>
    </div>
);

const HistoryCard: React.FC<{ record: MaintenanceRecord }> = ({ record }) => (
    <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
        <div className="flex justify-between items-center mb-2">
            <h4 className="font-bold text-black">{record.description}</h4>
            <span className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded-full">{record.date}</span>
        </div>
        <p className="text-sm text-gray-700 mb-2"><span className="font-semibold">Technician:</span> {record.technician}</p>
        <p className="text-sm text-gray-600 bg-white border border-gray-200 p-2 rounded-md">
            <span className="font-semibold text-gray-700">Notes:</span> {record.notes}
        </p>
    </div>
);


const LookupView: React.FC = () => {
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [foundMachines, setFoundMachines] = useState<Machine[]>([]);
    const [selectedMachine, setSelectedMachine] = useState<Machine | null>(null);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [isScanning, setIsScanning] = useState<boolean>(false);
    const [scannerError, setScannerError] = useState('');
    const [selectedPhoto, setSelectedPhoto] = useState<string | null>(null);  
    const { data: emailSettings } = useEmailSettings();

    const html5QrCodeRef = useRef<any>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const qrReaderId = "qr-reader";

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (typeof (window as any).Html5Qrcode === 'undefined') {
            setScannerError("QR Code scanner library not loaded. Please refresh the page.");
            return;
        }

        // Use a temporary instance for file scanning
        const html5QrCode = new (window as any).Html5Qrcode(qrReaderId + "-file");
        
        html5QrCode.scanFileV2(file, true)
            .then((decodedText: string) => {
                let searchTermToUse = decodedText;
                try {
                    const qrData = JSON.parse(decodedText as string);
                    if (qrData.serialNumber) searchTermToUse = qrData.serialNumber;
                    else if (qrData.clientAssetNumber) searchTermToUse = qrData.clientAssetNumber;
                } catch (e) {
                    // Not JSON
                }
                setSearchTerm(searchTermToUse as string);
                handleSearch(searchTermToUse as string);
            })
            .catch((err: any) => {
                console.error("File Scan Error", err);
                setScannerError("Failed to scan QR code from image.");
            });
            
        e.target.value = '';
    };

    const handleSearch = useCallback(async (query: string) => {
        if (!query.trim()) return;
        setIsLoading(true);
        setFoundMachines([]);
        setSelectedMachine(null);
        
        const machines = await machineService.searchMachines(query);
        setFoundMachines(machines);
        
        // If only one result, select it automatically
        if (machines.length === 1) {
            setSelectedMachine(machines[0]);
        }
        
        setIsLoading(false);
    }, []);

    useEffect(() => {
        const stopScanning = () => {
             if (html5QrCodeRef.current?.isScanning) {
                html5QrCodeRef.current.stop().catch(err => console.error("Failed to stop scanner:", err));
            }
        }

        if (isScanning) {
             if (typeof (window as any).Html5Qrcode === 'undefined') {
                setScannerError("QR Code scanner library not loaded. Please refresh the page.");
                return;
            }

            if (!html5QrCodeRef.current) {
                html5QrCodeRef.current = new (window as any).Html5Qrcode(qrReaderId);
            }
            const qrCodeSuccessCallback = (decodedText: string) => {
                let searchTermToUse = decodedText;
                try {
                    const qrData = JSON.parse(decodedText);
                    // Check serialNumber first
                    if (qrData.serialNumber && typeof qrData.serialNumber === 'string' && qrData.serialNumber.trim().length > 0) {
                        searchTermToUse = qrData.serialNumber;
                    } 
                    // Fallback to clientAssetNumber
                    else if (qrData.clientAssetNumber && typeof qrData.clientAssetNumber === 'string' && qrData.clientAssetNumber.trim().length > 0) {
                        searchTermToUse = qrData.clientAssetNumber;
                    }
                } catch (e) {
                    console.log("QR code is not JSON, using raw value:", decodedText);
                }
                
                setSearchTerm(searchTermToUse);
                handleSearch(searchTermToUse);
                setIsScanning(false);
            };
            const config = { fps: 10, qrbox: { width: 250, height: 250 } };
            
            html5QrCodeRef.current.start({ facingMode: { ideal: "environment" } }, config, qrCodeSuccessCallback, undefined)
              .catch(err => {
                let errorMessage = "Could not start scanner. Please check camera permissions.";
                setScannerError(errorMessage);
                console.error("QR Scanner Error:", err);
              });

        } else {
            stopScanning();
        }

        return () => {
            stopScanning();
        };
    }, [isScanning, handleSearch]);

    const handleFormSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        handleSearch(searchTerm);
    };

    return (
        <div className="space-y-8">
            <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200">
                <h2 className="text-2xl font-bold text-black mb-4">Find Machine Details</h2>
                <p className="text-gray-500 mb-4">Enter the Serial/Asset Number, Client Name, or Make/Model.</p>
                <form onSubmit={handleFormSubmit} className="flex gap-2">
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search..."
                        className="flex-grow bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition"
                    />
                    <button
                        type="button"
                        onClick={() => {
                          setScannerError('');
                          setIsScanning(prev => !prev);
                        }}
                        className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-bold py-2 px-4 rounded-md hover:bg-gray-200 transition duration-300 border border-gray-300"
                        aria-label={isScanning ? 'Close scanner' : 'Open scanner'}
                    >
                       <CameraIcon />
                       <span className="hidden sm:inline">{isScanning ? 'Close' : 'Scan QR'}</span>
                    </button>
                    <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center justify-center gap-2 bg-gray-100 text-gray-700 font-bold py-2 px-4 rounded-md hover:bg-gray-200 transition duration-300 border border-gray-300"
                        title="Upload QR Code Image"
                    >
                        {/* Simple Upload Icon */}
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                        <span className="hidden sm:inline">Upload QR</span>
                    </button>
                    <input 
                        type="file" 
                        ref={fileInputRef} 
                        onChange={handleFileUpload} 
                        accept="image/*" 
                        className="hidden" 
                    />
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="flex items-center justify-center gap-2 bg-black text-white font-bold py-2 px-4 rounded-md hover:bg-gray-800 transition duration-300 disabled:opacity-50"
                    >
                        {isLoading ? (
                            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                        ) : (
                            <SearchIcon />
                        )}
                        <span className="hidden sm:inline">Search</span>
                    </button>
                </form>
            </div>
            
            {isScanning && (
                <div className="bg-white p-4 rounded-lg shadow-xl animate-fade-in border border-gray-200">
                    <div id={qrReaderId} className="w-full max-w-sm mx-auto rounded-lg overflow-hidden border border-gray-300 shadow-inner bg-black"></div>
                    {scannerError && <p className="text-red-600 text-sm mt-4 text-center">{scannerError}</p>}
                </div>
            )}


            {isLoading && (
                 <div className="text-center py-8">
                    <div className="inline-block w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin" role="status">
                       <span className="sr-only">Loading...</span>
                    </div>
                    <p className="mt-2 text-gray-500">Searching machine database...</p>
                 </div>
            )}

            {!isLoading && foundMachines.length === 0 && searchTerm && (
                 <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-lg text-center">
                    <h3 className="font-bold">No Machines Found</h3>
                    <p>No machines matched your search for "{searchTerm}".</p>
                </div>
            )}

            {/* List of Results (if multiple) */}
            {!isLoading && foundMachines.length > 1 && !selectedMachine && (
                <div className="space-y-4 animate-fade-in">
                    <h3 className="text-xl font-bold text-gray-800">Found {foundMachines.length} matching machines:</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {foundMachines.map(machine => (
                            <div 
                                key={machine.id} 
                                onClick={() => setSelectedMachine(machine)}
                                className="bg-white hover:bg-gray-50 border border-gray-200 p-4 rounded-lg cursor-pointer transition shadow-md flex justify-between items-center group"
                            >
                                <div>
                                    <h4 className="font-bold text-black text-lg group-hover:text-gray-700">{machine.make} {machine.model}</h4>
                                    <p className="text-sm text-gray-600">S/N: {machine.serialNumber}</p>
                                    <p className="text-sm text-gray-500">Client: {machine.client}</p>
                                </div>
                                <div className="text-right">
                                    <span className={`inline-block px-2 py-1 rounded text-xs font-bold ${
                                        machine.serviceStatus === 'Completed' ? 'bg-green-100 text-green-800' : 
                                        machine.serviceStatus === 'Pending Inspection' ? 'bg-yellow-100 text-yellow-800' : 
                                        'bg-blue-100 text-blue-800'
                                    }`}>
                                        {machine.serviceStatus}
                                    </span>
                                    <div className="mt-2 text-gray-400 group-hover:text-black transition">
                                        View Details &rarr;
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
            
            {/* Selected Machine Details */}
            {selectedMachine && !isLoading && (
                <div className="space-y-8 animate-fade-in">
                    {foundMachines.length > 1 && (
                        <button 
                            onClick={() => setSelectedMachine(null)}
                            className="text-black hover:text-gray-600 flex items-center gap-2 mb-4 font-medium"
                        >
                            &larr; Back to Results
                        </button>
                    )}

                    <div className="bg-white p-6 rounded-lg shadow-xl relative overflow-hidden border border-gray-200">
                         <div className="flex flex-col md:flex-row gap-6">
                             <div className="flex-grow">
                                <h3 className="text-2xl font-bold text-black mb-4 border-b border-gray-200 pb-2">
                                    {selectedMachine.make} {selectedMachine.model}
                                </h3>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2">
                                    <DetailItem label="Serial Number" value={selectedMachine.serialNumber} />
                                    <DetailItem label="Client Asset Number" value={selectedMachine.clientAssetNumber} />
                                    <DetailItem label="Client" value={selectedMachine.client} />
                                    <DetailItem label="Contact Person" value={selectedMachine.contactPerson} />
                                    <DetailItem label="Contact Number" value={selectedMachine.contactNumber} />
                                    <div className="py-2">
                                        <p className="text-sm text-gray-500">Current Status</p>
                                        <p className={`font-semibold ${
                                            selectedMachine.serviceStatus === 'Completed' ? 'text-green-600' : 'text-yellow-600'
                                        }`}>{selectedMachine.serviceStatus}</p>
                                        {selectedMachine.serviceStatus === 'Completed' && (
                                            <div className="flex gap-2 mt-2">
                                                <button 
                                                    onClick={() => handleDownloadServiceReport(selectedMachine)}
                                                    className="bg-gray-100 hover:bg-gray-200 border border-gray-300 text-gray-700 text-xs font-bold py-1 px-2 rounded"
                                                >
                                                    📄 PDF Report
                                                </button>
                                                <button 
                                                    onClick={() => handleSendServiceReportEmail(selectedMachine, emailSettings)}
                                                    className="bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 text-xs font-bold py-1 px-2 rounded"
                                                >
                                                    ✉️ Email Report
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                             </div>
                             {selectedMachine.photo && (
                                 <div className="flex-shrink-0 flex flex-col items-center gap-2">
                                     <p className="text-xs text-gray-500 uppercase font-bold">Plate Identification</p>
                                     <img 
                                        src={selectedMachine.photo} 
                                        alt="Machine Plate" 
                                        className="w-full md:w-64 h-40 object-cover rounded-lg border-2 border-gray-300 shadow-lg cursor-zoom-in hover:border-black transition"
                                        onClick={() => setSelectedPhoto(selectedMachine.photo!)}
                                     />
                                     <button 
                                        onClick={() => setSelectedPhoto(selectedMachine.photo!)}
                                        className="text-xs text-black hover:underline"
                                     >
                                        View Full Resolution
                                     </button>
                                 </div>
                             )}
                         </div>
                    </div>

                     <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200">
                        <h3 className="text-2xl font-bold text-black mb-4 border-b border-gray-200 pb-2">
                            Maintenance History
                        </h3>
                        {selectedMachine.history.length > 0 ? (
                             <div className="space-y-4">
                                {selectedMachine.history.map(record => <HistoryCard key={record.id} record={record} />)}
                            </div>
                        ) : (
                            <p className="text-gray-500">No maintenance history available for this machine.</p>
                        )}
                    </div>
                </div>
            )}

            {/* Photo Modal */}
            {selectedPhoto && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/95 p-4 animate-fade-in" onClick={() => setSelectedPhoto(null)}>
                    <div className="relative max-w-5xl w-full h-full flex flex-col items-center justify-center" onClick={e => e.stopPropagation()}>
                        <button 
                            className="absolute top-0 right-0 p-4 text-white hover:text-gray-300 transition"
                            onClick={() => setSelectedPhoto(null)}
                        >
                            <XIcon />
                        </button>
                        <img src={selectedPhoto} className="max-w-full max-h-[85vh] object-contain rounded shadow-2xl border border-gray-700" alt="Full size machine photo" />
                        <p className="text-gray-400 mt-4 text-sm">Machine Identification Snapshot</p>
                    </div>
                </div>
            )}

        </div>
    );
};

export default LookupView;
