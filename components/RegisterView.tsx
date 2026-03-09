
import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { Machine, EmailSettings } from '../types';
import { machineService } from '../services/machineService';
import { pdfGenerator } from '../services/pdfGenerator';
import { PlusIcon } from './icons/PlusIcon';
import { XIcon } from './icons/XIcon';
import { ChevronLeftIcon } from './icons/ChevronLeftIcon';
import { CameraIcon } from './icons/CameraIcon';
import QRCode from 'qrcode';

// --- TYPE DEFINITIONS ---
interface MachineType {
  id: string;
  make: string;
  model: string;
  qty: string;
}

interface MachineDetail {
  serialNumber: string;
  clientAssetNumber: string;
  photo?: string;
  warrantyStatus: 'Under Warranty' | 'Out of Warranty';
  invoicePhoto?: string;
}

// --- HELPER COMPONENTS ---

const AutocompleteInput = ({ value, placeholder, suggestions, onSelect, onFocusCustom, addNewLabel = "Add new" }: { value: string, placeholder: string, suggestions: string[], onSelect: (val: string) => void, onFocusCustom?: () => void, addNewLabel?: string }) => {
    const [isFocused, setIsFocused] = useState(false);
    
    // Derived state for suggestions
    const uniqueSuggestions = useMemo(() => {
        // Use a Map to do a case-insensitive deduplication, keeping the first occurrence
        const seen = new Map<string, string>();
        suggestions.forEach(s => {
            if (s && typeof s === 'string') {
                const lower = s.toLowerCase().trim();
                // Ensure no single-character or blank garbage is shown unnecessarily
                if (lower.length > 0 && !seen.has(lower)) {
                    seen.set(lower, s.trim());
                }
            }
        });
        return Array.from(seen.values()).sort();
    }, [suggestions]);

    const filteredSuggestions = useMemo(() => {
        if (!value) return uniqueSuggestions;
        return uniqueSuggestions.filter(suggestion =>
            suggestion.toLowerCase().includes(value.toLowerCase())
        );
    }, [value, uniqueSuggestions]);

    const handleSelect = (suggestion: string) => {
        onSelect(suggestion);
        setIsFocused(false);
    };

    const handleBlur = () => {
        setTimeout(() => {
            setIsFocused(false);
        }, 200);
    };

    const showAddNew = value && !uniqueSuggestions.some(s => s.toLowerCase() === value.toLowerCase());

    return (
        <div className="relative">
            <input
                type="text"
                value={value}
                onChange={(e) => onSelect(e.target.value)}
                onFocus={() => { setIsFocused(true); if (onFocusCustom) onFocusCustom(); }}
                onBlur={handleBlur}
                placeholder={placeholder}
                className="w-full bg-white border border-gray-300 rounded-md shadow-sm py-2 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black focus:border-black transition"
            />
            {isFocused && (
                <ul className="absolute z-50 w-full bg-white border border-gray-300 rounded-md mt-1 max-h-40 overflow-y-auto shadow-xl">
                    {filteredSuggestions.map((suggestion, index) => (
                        <li
                            key={index}
                            onMouseDown={(e) => { e.preventDefault(); handleSelect(suggestion); }}
                            className="px-3 py-2 text-gray-900 hover:bg-gray-100 cursor-pointer"
                        >
                            {suggestion}
                        </li>
                    ))}
                    {showAddNew && (
                        <li
                            onMouseDown={(e) => { e.preventDefault(); handleSelect(value); }}
                            className="px-3 py-2 text-blue-600 hover:bg-blue-50 cursor-pointer font-medium border-t border-gray-100"
                        >
                            + {addNewLabel} "{value}"
                        </li>
                    )}
                </ul>
            )}
        </div>
    );
};

const QrCodeDisplay = ({ machine }: { machine: Machine }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const qrData = useMemo(() => JSON.stringify({
        serialNumber: machine.serialNumber,
        clientAssetNumber: machine.clientAssetNumber,
        timestamp: Date.now()
    }), [machine.serialNumber, machine.clientAssetNumber]);

    useEffect(() => {
        if (canvasRef.current) {
            try {
                QRCode.toCanvas(canvasRef.current, qrData, { width: 128 }, (error: any) => {
                    if (error) console.error("QR Code generation error:", error);
                });
            } catch (e) {
                console.error("QRCode library error", e);
            }
        }
    }, [qrData]);

    return <canvas ref={canvasRef} className="rounded-md" />;
};

const FullScreenSignaturePad = ({ onSubmit, onCancel }: { onSubmit: (data: string) => void, onCancel: () => void }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);

    // Initialize canvas to full screen dimensions
    useEffect(() => {
        const handleResize = () => {
            const canvas = canvasRef.current;
            if (!canvas) return;

            // Force full screen dimensions
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;

            const ctx = canvas.getContext('2d');
            if (ctx) {
                ctx.lineJoin = 'round';
                ctx.lineCap = 'round';
                ctx.strokeStyle = '#000000'; // Black ink
                ctx.lineWidth = 4;
                // Fill with white background to ensure non-transparent save
                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
            }
        };

        handleResize(); // Initial setup
        window.addEventListener('resize', handleResize);

        // Prevent body scrolling while signing
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('resize', handleResize);
            document.body.style.overflow = '';
        };
    }, []);

    const getPos = (e: React.MouseEvent | React.TouchEvent) => {
        const canvas = canvasRef.current;
        if (!canvas) return { x: 0, y: 0 };
        const rect = canvas.getBoundingClientRect();
        
        let clientX = 0;
        let clientY = 0;

        if ('touches' in e && e.touches.length > 0) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else if ('clientX' in e) {
            clientX = (e as React.MouseEvent).clientX;
            clientY = (e as React.MouseEvent).clientY;
        }

        return {
            x: clientX - rect.left,
            y: clientY - rect.top
        };
    };

    const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
        setIsDrawing(true);
        const ctx = canvasRef.current?.getContext('2d');
        const pos = getPos(e);
        ctx?.beginPath();
        ctx?.moveTo(pos.x, pos.y);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing) return;
        const ctx = canvasRef.current?.getContext('2d');
        const pos = getPos(e);
        ctx?.lineTo(pos.x, pos.y);
        ctx?.stroke();
    };

    const stopDrawing = () => {
        setIsDrawing(false);
    };

    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.beginPath();
        }
    };

    const handleSubmit = () => {
        if (canvasRef.current) {
            onSubmit(canvasRef.current.toDataURL());
        }
    };

    return (
        <div className="fixed inset-0 z-[100] bg-white touch-none">
            <canvas
                ref={canvasRef}
                className="block w-full h-full cursor-crosshair touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={stopDrawing}
            />

            {/* Cancel Button (Top Right) */}
            <div className="absolute top-6 right-6">
                <button 
                    onClick={onCancel} 
                    className="bg-gray-100/90 text-gray-600 p-3 rounded-full shadow-lg border border-gray-200 hover:bg-red-100 hover:text-red-500 transition-colors"
                    aria-label="Cancel Signature"
                >
                    <XIcon />
                </button>
            </div>

            {/* Hint (Top Left) */}
            <div className="absolute top-6 left-6 pointer-events-none opacity-50">
                <p className="text-sm font-bold text-gray-500 uppercase tracking-widest">Sign Here</p>
            </div>

            {/* Controls (Bottom) */}
            <div className="absolute bottom-8 left-6 right-6 flex gap-4">
                <button 
                    onClick={clear} 
                    className="flex-1 bg-white/90 border border-gray-300 text-gray-700 font-bold py-4 rounded-xl shadow-lg backdrop-blur-sm active:bg-gray-100 transition uppercase tracking-wider"
                >
                    Clear
                </button>
                <button 
                    onClick={handleSubmit} 
                    className="flex-[2] bg-green-600/90 text-white font-bold py-4 rounded-xl shadow-lg backdrop-blur-sm active:bg-green-700 transition uppercase tracking-wider"
                >
                    Submit
                </button>
            </div>
        </div>
    );
};

// --- MAIN COMPONENT ---
const RegisterView: React.FC = () => {
    // --- CAMERA & FILE STATE ---
    const [isCameraActive, setIsCameraActive] = useState(false);
    const [cameraCallback, setCameraCallback] = useState<((data: string) => void) | null>(null);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    // --- STATE MANAGEMENT ---
    const [stage, setStage] = useState(1);
    const [client, setClient] = useState('');
    const [clientEmail, setClientEmail] = useState(''); // New Email Field
    const [contactPerson, setContactPerson] = useState('');
    const [contactNumber, setContactNumber] = useState('');
    
    // Stage 1 & 2 Data
    const [machineTypes, setMachineTypes] = useState<MachineType[]>([{ id: Date.now().toString(), make: '', model: '', qty: '1' }]);
    const [machineDetails, setMachineDetails] = useState<Record<string, MachineDetail[]>>({});
    
    // Stage 3 Data
    const [sitePhotos, setSitePhotos] = useState<string[]>([]);

    // Stage 4 Data
    const [signature, setSignature] = useState<string>('');
    const [isSigning, setIsSigning] = useState(false);

    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const [submissionStatus, setSubmissionStatus] = useState('');
    const [registeredMachines, setRegisteredMachines] = useState<Machine[]>([]);
    const [generatedMailtoLink, setGeneratedMailtoLink] = useState<string>('');
    
    const [knownData, setKnownData] = useState<{ makes: string[], models: Record<string, string[]> }>({ makes: [], models: {} });
    const [knownClients, setKnownClients] = useState<any[]>([]);
    const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
    const [allModels, setAllModels] = useState<string[]>([]);

    useEffect(() => {
        const fetchKnownData = async () => {
            try {
                const [makesModels, clients, settings] = await Promise.all([  
                    machineService.getKnownMakesAndModels(),
                    machineService.getAllClients(),
                    machineService.getEmailSettings()
                ]);
                
                setAllModels(Object.values(makesModels.models).flat());
                setKnownData(makesModels); 
                setKnownClients(clients);
                setEmailSettings(settings);
            } catch (e) {
                console.error("Failed to load init data", e);
            }
        };
        fetchKnownData();
    }, []);
    
    // --- HANDLERS ---
    
    const handleClientSelect = (clientName: string) => {
        setClient(clientName);
        const match = knownClients.find(c => c.client === clientName);
        if (match) {
            if (!clientEmail) setClientEmail(match.email || '');
            if (!contactPerson) setContactPerson(match.contactPerson || '');
            if (!contactNumber) setContactNumber(match.contactNumber || '');
        }
    };

    const handleEmailSelect = (email: string) => {
        setClientEmail(email);
        const match = knownClients.find(c => c.email === email);
        if (match) {
            if (!client) setClient(match.client || '');
            if (!contactPerson) setContactPerson(match.contactPerson || '');
            if (!contactNumber) setContactNumber(match.contactNumber || '');
        }
    };

    const handlePersonSelect = (person: string) => {
        setContactPerson(person);
        const match = knownClients.find(c => c.contactPerson === person);
        if (match) {
            if (!client) setClient(match.client || '');
            if (!clientEmail) setClientEmail(match.email || '');
            if (!contactNumber) setContactNumber(match.contactNumber || '');
        }
    };

    const handleNumberSelect = (num: string) => {
        setContactNumber(num);
        const match = knownClients.find(c => c.contactNumber === num);
        if (match) {
            if (!client) setClient(match.client || '');
            if (!clientEmail) setClientEmail(match.email || '');
            if (!contactPerson) setContactPerson(match.contactPerson || '');
        }
    };

    const handleAddNewClient = async (name: string) => {
        setClient(name);
        setClientEmail('');
        setContactPerson('');
        setContactNumber('');
        // Optionally save to DB immediately or wait for full form submit
        // For better UX, we just set the state. We will save to catalog on final submit.
    };

    const handleMachineTypeChange = async (id: string, field: keyof Omit<MachineType, 'id'>, value: string) => {
        setMachineTypes(prev => prev.map(mt => mt.id === id ? { ...mt, [field]: value } : mt));
    };

    const addMachineType = () => {
        setMachineTypes(prev => [...prev, { id: Date.now().toString(), make: '', model: '', qty: '1' }]);
    };

    const removeMachineType = (id: string) => {
        setMachineTypes(prev => prev.filter(mt => mt.id !== id));
    };

    const handleDetailChange = (typeId: string, index: number, field: keyof MachineDetail, value: any) => {
        setMachineDetails(prev => {
            const newDetailsForType = [...(prev[typeId] || [])];
            newDetailsForType[index] = { ...newDetailsForType[index], [field]: value };
            return { ...prev, [typeId]: newDetailsForType };
        });
    };

    // --- PHOTO CAPTURE & UPLOAD ---

    const initiatePhotoCapture = (callback: (data: string) => void) => {
        setCameraCallback(() => callback);
        setIsCameraActive(true);
        startCameraStream();
    };

    const startCameraStream = async () => {
        setError('');
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } } 
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
        } catch (err) {
            console.error("Camera access error:", err);
            setError("Camera not accessible (Media Device Unavailable). Please use the 'Upload' option.");
            setIsCameraActive(false);
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }
        setIsCameraActive(false);
        setCameraCallback(null);
    };

    const capturePhoto = () => {
        if (!videoRef.current || !cameraCallback) return;
        try {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const ctx = canvas.getContext('2d');
            if (!ctx) throw new Error("Could not get canvas context");
            ctx.drawImage(videoRef.current, 0, 0);
            const base64Data = canvas.toDataURL('image/jpeg', 0.8);
            cameraCallback(base64Data);
            stopCamera();
        } catch (err) {
            console.error("Capture Error:", err);
            setError("Error capturing image.");
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (data: string) => void) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                if (reader.result) {
                    callback(reader.result as string);
                }
            };
            reader.readAsDataURL(file);
        }
    };

    const triggerFileUpload = (callback: (data: string) => void) => {
        if (fileInputRef.current) {
            // Cleanest way: assign onchange handler
            fileInputRef.current.onchange = (e: Event) => {
                 const target = e.target as HTMLInputElement;
                 handleFileUpload({ target } as any, callback);
                 // Reset value to allow re-upload of same file
                 target.value = '';
            };
            fileInputRef.current.click();
        } else {
            console.error("File input ref not attached");
        }
    };

    // --- NAVIGATION LOGIC ---
    
    const goToStage2 = () => {
        setError('');
        
        // Detailed Validation for Global Fields
        const missingGlobalFields = [];
        if (!client.trim()) missingGlobalFields.push('Client Name');
        if (!contactPerson.trim()) missingGlobalFields.push('Contact Person');
        if (!contactNumber.trim()) missingGlobalFields.push('Contact Number');
        
        if (missingGlobalFields.length > 0) {
            setError(`Please fill in: ${missingGlobalFields.join(', ')}`);
            window.scrollTo(0, document.body.scrollHeight);
            return;
        }

        // Detailed Validation for Machine Types
        const invalidRows = machineTypes.reduce((acc, mt, idx) => {
            if (!mt.make.trim() || !mt.model.trim() || !mt.qty || parseInt(mt.qty) <= 0) {
                acc.push(idx + 1);
            }
            return acc;
        }, [] as number[]);

        if (invalidRows.length > 0) {
            setError(`Please correct the Machine Details in row(s): ${invalidRows.join(', ')}. All fields are required and Qty must be > 0.`);
            window.scrollTo(0, document.body.scrollHeight);
            return;
        }

        try {
            const newDetails: Record<string, MachineDetail[]> = {};
            machineTypes.forEach(type => {
                const qty = parseInt(type.qty, 10) || 0;
                const existingDetails = machineDetails[type.id] || [];
                
                // Preserve existing details or create new ones
                const detailArray = Array.from({ length: qty }, (_, i) => existingDetails[i] || { 
                    serialNumber: '', 
                    clientAssetNumber: '', 
                    photo: undefined,
                    warrantyStatus: 'Out of Warranty',
                    invoicePhoto: undefined 
                });
                newDetails[type.id] = detailArray;
            });
            setMachineDetails(newDetails);
            setStage(2);
            window.scrollTo(0, 0); // Scroll to top for new section
        } catch (e) {
            console.error(e);
            setError("An unexpected error occurred while processing machine details. Please try again.");
        }
    };

    const goToStage3 = () => {
        // Validate Stage 2
        for (const type of machineTypes) {
            const detailsForType = machineDetails[type.id] || [];
            for (const detail of detailsForType) {
                if (!detail.serialNumber && !detail.clientAssetNumber) {
                    setError(`Machine ${type.make} ${type.model} requires at least a Serial Number or Asset Number.`);
                    window.scrollTo(0, document.body.scrollHeight);
                    return;
                }
                if (detail.warrantyStatus === 'Under Warranty' && !detail.invoicePhoto) {
                     setError(`Machine ${type.make} ${type.model} is Under Warranty but missing Invoice Photo.`);
                     window.scrollTo(0, document.body.scrollHeight);
                     return;
                }
            }
        }
        setError('');
        setStage(3);
        window.scrollTo(0, 0);
    };

    const goToStage4 = () => {
        if (sitePhotos.length === 0) {
            setError('Please capture at least one site photo (e.g., machine lot, context).');
             window.scrollTo(0, document.body.scrollHeight);
            return;
        }
        setError('');
        setStage(4);
        window.scrollTo(0, 0);
    };

    const handleSubmit = async (signatureOverride?: string) => {
        const finalSignature = signatureOverride || signature;
        if (!finalSignature || finalSignature.length < 50) { 
            setError('Please provide a customer signature.');
            return;
        }

        setError('');
        setIsLoading(true);
        const batchId = `BATCH-${Date.now()}`;

        const allMachinesToRegister: Omit<Machine, 'id' | 'history'>[] = [];
        for (const type of machineTypes) {
            const detailsForType = machineDetails[type.id] || [];
            for (const detail of detailsForType) {
                allMachinesToRegister.push({
                    make: type.make,
                    model: type.model,
                    client: client,
                    clientEmail: clientEmail, // Add Email
                    contactPerson: contactPerson,
                    contactNumber: contactNumber,
                    serialNumber: detail.serialNumber,
                    clientAssetNumber: detail.clientAssetNumber,
                    photo: detail.photo,
                    partNumber: '',
                    warrantyStatus: detail.warrantyStatus,
                    invoicePhoto: detail.invoicePhoto,
                    sitePhotos: sitePhotos,
                    customerSignature: finalSignature,
                    batchId: batchId
                });
            }
        }

        try {
            const successfullyRegistered = [];
            
            // Save new catalog entries first
            const uniqueMakes = Array.from(new Set(allMachinesToRegister.map(m => m.make)));
            const uniqueModels = Array.from(new Set(allMachinesToRegister.map(m => m.model)));
            
            await Promise.all([
                machineService.addClient({ 
                    client: client, 
                    email: clientEmail, 
                    contactPerson: contactPerson, 
                    contactNumber: contactNumber 
                }),
                ...uniqueMakes.map(make => machineService.addMake(make)),
                machineService.saveModelsCatalog(uniqueModels)
            ]);

            for (let i = 0; i < allMachinesToRegister.length; i++) {
                setSubmissionStatus(`Registering machine ${i + 1} of ${allMachinesToRegister.length}...`);
                const registeredMachine = await machineService.addMachine(allMachinesToRegister[i]);
                console.log("Returned machine from service:", registeredMachine); // does it have clientEmail?
                successfullyRegistered.push(registeredMachine);
            }
            setRegisteredMachines(successfullyRegistered);
            // Reset Form Data
            setClient('');
            setClientEmail('');
            setContactPerson('');
            setContactNumber('');
            setMachineTypes([{ id: Date.now().toString(), make: '', model: '', qty: '1' }]);
            setMachineDetails({});
            setSitePhotos([]);
            setSignature('');
            setStage(1);
            window.scrollTo(0, 0);
        } catch (err) {
            console.error(err);
            setError('An error occurred during registration. Please try again.');
        } finally {
            setIsLoading(false);
            setSubmissionStatus('');
        }
    };
    
    // --- OUTPUT LOGIC ---

    const handleDownloadReceipt = async () => {
        try {
            const doc = await pdfGenerator.generateReceiptDoc(registeredMachines);
            // Use client name from first machine for filename
            const clientName = registeredMachines[0]?.client || 'Client';
            doc.save(`Service_Receipt_${clientName.replace(/\s+/g, '_')}.pdf`);
        } catch (e) {
            console.error(e);
            setError("Error generating Receipt PDF.");
        }
    };

    const handleDownloadQrs = async () => {
        try {
            const doc = await pdfGenerator.generateQrDoc(registeredMachines);
            const clientName = registeredMachines[0]?.client || 'Client';
            doc.save(`Machine_QR_Codes_${clientName.replace(/\s+/g, '_')}.pdf`);
        } catch (e) {
            console.error(e);
            setError("Error generating QR PDF.");
        }
    };
    const [debugInfo, setDebugInfo] = useState<string>('');

    const handleShareEmail = async () => {
        if (!emailSettings || registeredMachines.length === 0) {
            console.error("Missing email settings or registered machines");
            return;
        }

        // DEBUG: log what email we have
        const debugEmail = registeredMachines[0].clientEmail;
        console.log("clientEmail value:", debugEmail);
        console.log("Full machine object:", registeredMachines[0]);

        const machinesList = registeredMachines.map(m => `- ${m.make} ${m.model} (S/N: ${m.serialNumber}, Asset: ${m.clientAssetNumber || 'N/A'})`).join('\n');
        
        const mailBody = `${emailSettings.bodyIntro}\n\nMachines Received:\n${machinesList}\n\n${emailSettings.signature}`;

        try {
            const doc = await pdfGenerator.generateReceiptDoc(registeredMachines);
            const blob = doc.output('blob');
            const file = new File([blob], 'Service_Receipt.pdf', { type: 'application/pdf' });
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: emailSettings.subject,
                    text: mailBody,
                });
            } else {
                doc.save('Service_Receipt.pdf');
                
                const to = registeredMachines[0].clientEmail;
                const subject = encodeURIComponent(emailSettings.subject);
                const cc = encodeURIComponent(emailSettings.cc || '');
                const body = encodeURIComponent(mailBody);
                
                let mailtoLink = `mailto:${to}?subject=${subject}`;
                if (cc) mailtoLink += `&cc=${cc}`;
                mailtoLink += `&body=${body}`;
                
                // Show debug info on page
                setGeneratedMailtoLink(mailtoLink);
                setDebugInfo(`TO: "${to}" | clientEmail field: "${debugEmail}" | Link starts: ${mailtoLink.substring(0, 80)}...`);

                window.location.href = mailtoLink;
            }
        } catch (e) {
            console.error(e);
            alert("Could not share directly. Downloading PDF instead.");
            handleDownloadReceipt();
        }
    };

    const handleShareWhatsapp = async () => {
        try {
            const doc = await pdfGenerator.generateReceiptDoc(registeredMachines);
            const blob = doc.output('blob');
            const file = new File([blob], 'Service_Receipt.pdf', { type: 'application/pdf' });
            
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({
                    files: [file],
                    title: 'Machine Registration Receipt',
                    text: 'Here is the service receipt for the machines.'
                });
            } else {
                alert("Sharing files is not supported on this browser/device. Downloading PDF instead.");
                handleDownloadReceipt();
            }
        } catch (e) {
            console.error(e);
            alert("Could not share. Try downloading.");
        }
    };

    const totalMachines = useMemo(() => machineTypes.reduce((sum, mt) => sum + (parseInt(mt.qty, 10) || 0), 0), [machineTypes]);

    // --- RENDER LOGIC ---

    // SUCCESS VIEW
    if (registeredMachines.length > 0) {
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200">
                    <h2 className="text-2xl font-bold text-green-600 mb-4">Machine Received</h2>
                    
                    {/* EMAIL PREVIEW SECTION */}
                    {emailSettings && (
                        <div className="bg-gray-50 text-black p-6 rounded-lg shadow-inner mb-6 border border-gray-200">
                            <h3 className="text-gray-500 text-xs uppercase font-bold mb-2 border-b border-gray-200 pb-1">Email Preview</h3>
                            
                            <div className="font-serif text-gray-900 leading-relaxed" style={{ fontFamily: '"Times New Roman", Times, serif', fontSize: '14px' }}>
                                <div className="mb-2"><span className="font-bold text-gray-700">To:</span> {registeredMachines[0].clientEmail || '[Customer Email]'}</div>
                                <div className="mb-4"><span className="font-bold text-gray-700">Subject:</span> {emailSettings.subject}</div>
                                
                                <p className="whitespace-pre-wrap mb-4">{emailSettings.bodyIntro}</p>
                                
                                <p className="mb-2 font-bold">Machines:</p>
                                <ul className="list-disc pl-5 mb-4">
                                    {registeredMachines.map(m => (
                                        <li key={m.id}>{m.make} {m.model} (S/N: {m.serialNumber || 'N/A'})</li>
                                    ))}
                                </ul>

                                <p className="whitespace-pre-wrap">{emailSettings.signature}</p>
                            </div>
                        </div>
                    )}
                    
                    {error && <p className="text-red-600 text-sm mb-4">{error}</p>}

                    <div className="flex flex-col gap-4 mb-6">
                        <button onClick={handleShareEmail} className="w-full bg-blue-600 text-white font-bold py-4 px-4 rounded-md hover:bg-blue-700 transition duration-300 shadow-lg flex items-center justify-center gap-2">
                             <span className="text-xl">✉️</span> Send Receipt Email
                        </button>
                        
                        {generatedMailtoLink && (
                            <div className="bg-gray-100 p-3 rounded text-xs break-all border border-gray-300">
                                <p className="font-bold text-gray-700 mb-1">Generated Link:</p>
                                <a href={generatedMailtoLink} className="text-blue-600 hover:underline">{decodeURIComponent(generatedMailtoLink)}</a>
                            </div>
                        )}
                        {debugInfo && (
                            <div className="bg-yellow-50 border border-yellow-300 p-3 rounded text-xs text-yellow-900 break-all">
                                <p className="font-bold mb-1">🐛 Debug Info:</p>
                                <p>{debugInfo}</p>
                                <p className="mt-2 font-bold">Full mailto link:</p>
                                <p className="break-all">{generatedMailtoLink}</p>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <button onClick={handleDownloadReceipt} className="flex-1 bg-white border border-gray-300 text-gray-900 font-bold py-3 px-4 rounded-md hover:bg-gray-50 transition duration-300 flex items-center justify-center gap-2">
                                📄 Download Receipt
                            </button>
                            <button onClick={handleDownloadQrs} className="flex-1 bg-black text-white font-bold py-3 px-4 rounded-md hover:bg-gray-800 transition duration-300 flex items-center justify-center gap-2">
                                🏁 Download QR Codes
                            </button>
                        </div>
                        
                         <button onClick={() => setRegisteredMachines([])} className="w-full bg-gray-100 text-gray-900 font-bold py-3 px-4 rounded-md hover:bg-gray-200 transition duration-300 mt-2">
                            New Registration
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    // STAGE 4: AGREEMENT & SIGNATURE
    if (stage === 4) {
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200">
                    <div className="flex items-center gap-4 mb-4 border-b border-gray-200 pb-2">
                        <button onClick={() => setStage(3)} className="p-2 rounded-full hover:bg-gray-100 transition text-gray-600" disabled={isLoading}><ChevronLeftIcon /></button>
                        <h2 className="text-2xl font-bold text-black">Step 4: Agreement</h2>
                    </div>
                    
                    <div className="bg-gray-50 p-6 rounded-lg mb-8 border border-gray-200">
                        <p className="text-gray-700 font-medium mb-3 text-lg border-b border-gray-200 pb-2">Declaration of Acceptance</p>
                        <p className="text-gray-700 leading-relaxed text-base">
                            I, <span className="font-bold text-gray-900 text-lg">{contactPerson}</span>, 
                            representing <span className="font-bold text-gray-900 text-lg">{client}</span>, 
                            hereby acknowledge the handover and registration of <span className="font-bold text-gray-900">{totalMachines}</span> machine(s) as detailed in the previous steps.
                        </p>
                        <p className="text-gray-500 mt-4 text-sm">
                            By signing below, I confirm that the machine details and site inspection evidence provided are accurate and I accept the equipment in its current condition.
                        </p>
                    </div>

                    {error && <p className="text-red-600 text-sm mb-4 p-3 bg-red-50 border border-red-200 rounded">{error}</p>}
                    
                    {isLoading ? (
                         <div className="w-full py-6 flex flex-col items-center justify-center bg-gray-50 rounded-lg">
                            <div className="w-8 h-8 border-4 border-black border-t-transparent rounded-full animate-spin mb-3"></div>
                            <p className="text-black font-bold animate-pulse">{submissionStatus || 'Processing Registration...'}</p>
                         </div>
                    ) : (
                        <button 
                            onClick={() => setIsSigning(true)}
                            className="w-full bg-black text-white font-bold py-5 px-6 rounded-lg hover:bg-gray-800 transition duration-300 shadow-lg text-lg tracking-wide uppercase flex items-center justify-center gap-3"
                        >
                            <span>I Agree & Sign</span>
                            <span className="text-2xl">✍️</span>
                        </button>
                    )}
                </div>

                {isSigning && (
                    <FullScreenSignaturePad 
                        onSubmit={(data) => {
                            setSignature(data);
                            setIsSigning(false);
                            handleSubmit(data);
                        }} 
                        onCancel={() => setIsSigning(false)} 
                    />
                )}
            </div>
        );
    }

    // STAGE 3: SITE EVIDENCE
    if (stage === 3) {
        return (
             <div className="space-y-8 animate-fade-in">
                <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200">
                     <div className="flex items-center gap-4 mb-4 border-b border-gray-200 pb-2">
                        <button onClick={() => setStage(2)} className="p-2 rounded-full hover:bg-gray-100 transition text-gray-600"><ChevronLeftIcon /></button>
                        <h2 className="text-2xl font-bold text-black">Step 3: Site Inspection Evidence</h2>
                    </div>

                    <div className="bg-yellow-50 border border-yellow-200 p-4 rounded mb-6 text-sm text-yellow-800">
                        <p className="font-bold mb-1">Requirements:</p>
                        <ul className="list-disc pl-5 space-y-1 opacity-80">
                            <li>Capture clear photos of the machines in their current location.</li>
                            <li>Ensure Serial Numbers and Asset Numbers are visible in context if possible.</li>
                            <li>Photograph any existing damages or marks.</li>
                            <li>Take a wide shot showing the machine whereabouts at the client site.</li>
                        </ul>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 mb-6">
                        {sitePhotos.map((photo, idx) => (
                            <div key={idx} className="relative aspect-square group">
                                <img src={photo} className="w-full h-full object-cover rounded border border-gray-300" />
                                <button 
                                    onClick={() => setSitePhotos(prev => prev.filter((_, i) => i !== idx))}
                                    className="absolute top-1 right-1 bg-red-600 text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition"
                                >
                                    <XIcon />
                                </button>
                            </div>
                        ))}
                        <div className="aspect-square bg-gray-50 rounded border-2 border-dashed border-gray-300 flex flex-col gap-2 items-center justify-center p-4">
                             <button onClick={() => initiatePhotoCapture(data => setSitePhotos(prev => [...prev, data]))} className="flex flex-col items-center text-gray-600 hover:text-black">
                                <CameraIcon /> <span className="text-xs mt-1">Camera</span>
                             </button>
                             <div className="h-px w-10 bg-gray-300 my-1"></div>
                             <button onClick={() => triggerFileUpload(data => setSitePhotos(prev => [...prev, data]))} className="text-xs text-gray-500 hover:text-gray-900 underline">
                                Upload
                             </button>
                        </div>
                    </div>

                    {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
                    <button onClick={goToStage4} className="w-full bg-black text-white font-bold py-3 px-4 rounded-md hover:bg-gray-800 transition">
                        Next: Agreement
                    </button>
                </div>
                <input type="file" ref={fileInputRef} accept="image/*" className="hidden" />
                {isCameraActive && (
                    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4 animate-fade-in">
                        <div className="relative w-full max-w-2xl bg-white rounded-2xl overflow-hidden shadow-2xl border border-gray-200">
                            <div className="p-4 flex justify-between items-center bg-gray-50 border-b border-gray-200">
                                <h3 className="font-bold text-gray-900 uppercase tracking-wider text-sm">Capture Photo</h3>
                                <button onClick={stopCamera} className="p-2 text-gray-500 hover:text-gray-900 transition"><XIcon /></button>
                            </div>
                            
                            <div className="relative aspect-video bg-black flex items-center justify-center">
                                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
                            </div>

                            <div className="p-6 bg-gray-50 flex flex-col items-center gap-4">
                                <div className="flex gap-4 w-full">
                                    <button onClick={stopCamera} className="flex-1 py-3 px-4 bg-white border border-gray-300 hover:bg-gray-100 text-gray-900 font-bold rounded-lg transition">Cancel</button>
                                    <button 
                                        onClick={capturePhoto} 
                                        className="flex-[2] py-3 px-8 bg-black text-white font-bold rounded-lg hover:bg-gray-800 transition flex items-center justify-center gap-2 shadow-lg"
                                    >
                                        <CameraIcon /> Capture
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // STAGE 2: DETAILS
    if (stage === 2) {
        return (
            <div className="space-y-8 animate-fade-in">
                <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200">
                    <div className="flex items-center gap-4 mb-4 border-b border-gray-200 pb-2">
                         <button onClick={() => setStage(1)} className="p-2 rounded-full hover:bg-gray-100 transition text-gray-600">
                            <ChevronLeftIcon />
                        </button>
                        <h2 className="text-2xl font-bold text-black">Step 2: Machine Details</h2>
                    </div>
                   
                    <div className="space-y-6">
                        {machineTypes.map(type => (
                            <div key={type.id} className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                                <h3 className="font-bold text-lg text-gray-800 mb-3">{type.make} {type.model} ({type.qty} units)</h3>
                                <div className="space-y-4">
                                    {machineDetails[type.id]?.map((detail, index) => (
                                        <div key={index} className="grid grid-cols-1 gap-4 border-t border-gray-200 pt-3 first:border-t-0">
                                            <div className="text-gray-500 font-bold text-xs uppercase">Unit #{index + 1}</div>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <input type="text" placeholder="Serial Number" value={detail.serialNumber} onChange={e => handleDetailChange(type.id, index, 'serialNumber', e.target.value)} className="bg-white border border-gray-300 rounded-md py-2 px-3 text-gray-900 focus:ring-1 focus:ring-black" />
                                                <input type="text" placeholder="Asset Number" value={detail.clientAssetNumber} onChange={e => handleDetailChange(type.id, index, 'clientAssetNumber', e.target.value)} className="bg-white border border-gray-300 rounded-md py-2 px-3 text-gray-900 focus:ring-1 focus:ring-black" />
                                            </div>

                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <select 
                                                    value={detail.warrantyStatus} 
                                                    onChange={e => handleDetailChange(type.id, index, 'warrantyStatus', e.target.value)}
                                                    className="bg-white border border-gray-300 rounded-md py-2 px-3 text-gray-900 focus:ring-1 focus:ring-black"
                                                >
                                                    <option value="Out of Warranty">Out of Warranty</option>
                                                    <option value="Under Warranty">Under Warranty</option>
                                                </select>

                                                {detail.warrantyStatus === 'Under Warranty' && (
                                                    <div className="flex items-center gap-2">
                                                        {detail.invoicePhoto ? (
                                                            <div className="flex items-center gap-2 bg-green-50 px-3 py-2 rounded border border-green-200 text-green-800 text-sm w-full">
                                                                <span>Invoice Attached</span>
                                                                <button onClick={() => handleDetailChange(type.id, index, 'invoicePhoto', undefined)} className="ml-auto text-red-500"><XIcon /></button>
                                                            </div>
                                                        ) : (
                                                            <div className="flex gap-2 w-full">
                                                                <button onClick={() => initiatePhotoCapture(data => handleDetailChange(type.id, index, 'invoicePhoto', data))} className="flex-1 flex items-center justify-center gap-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 px-2 rounded text-xs transition">
                                                                    <CameraIcon /> Inv. Photo
                                                                </button>
                                                                <button onClick={() => triggerFileUpload(data => handleDetailChange(type.id, index, 'invoicePhoto', data))} className="flex-1 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 px-2 rounded text-xs transition">
                                                                    Upload Inv.
                                                                </button>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex justify-end pt-2">
                                                {detail.photo ? (
                                                     <div className="relative group">
                                                        <img src={detail.photo} className="h-16 w-24 object-cover rounded border border-gray-300" />
                                                        <button onClick={() => handleDetailChange(type.id, index, 'photo', undefined)} className="absolute -top-2 -right-2 bg-red-600 rounded-full p-1 text-white shadow"><XIcon /></button>
                                                    </div>
                                                ) : (
                                                    <div className="flex gap-2">
                                                        <button onClick={() => initiatePhotoCapture(data => handleDetailChange(type.id, index, 'photo', data))} className="flex items-center gap-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 px-3 rounded transition">
                                                            <CameraIcon /> Camera
                                                        </button>
                                                        <button onClick={() => triggerFileUpload(data => handleDetailChange(type.id, index, 'photo', data))} className="flex items-center gap-2 text-sm bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 py-2 px-3 rounded transition">
                                                            Upload
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                     <div className="mt-6">
                        {error && <p className="text-red-600 text-sm mb-4">{error}</p>}
                        <button onClick={goToStage3} className="w-full bg-black text-white font-bold py-3 px-4 rounded-md hover:bg-gray-800 transition duration-300">
                            Next: Site Evidence
                        </button>
                    </div>
                </div>
                 <input type="file" ref={fileInputRef} accept="image/*" className="hidden" />
                 {isCameraActive && (
                    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/95 p-4 animate-fade-in">
                        <div className="relative w-full max-w-2xl bg-white rounded-2xl overflow-hidden shadow-2xl border border-gray-200">
                            <div className="p-4 flex justify-between items-center bg-gray-50 border-b border-gray-200">
                                <h3 className="font-bold text-gray-900 uppercase tracking-wider text-sm">Capture Photo</h3>
                                <button onClick={stopCamera} className="p-2 text-gray-500 hover:text-gray-900 transition"><XIcon /></button>
                            </div>
                            
                            <div className="relative aspect-video bg-black flex items-center justify-center">
                                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />
                            </div>

                            <div className="p-6 bg-gray-50 flex flex-col items-center gap-4">
                                <div className="flex gap-4 w-full">
                                    <button onClick={stopCamera} className="flex-1 py-3 px-4 bg-white border border-gray-300 hover:bg-gray-100 text-gray-900 font-bold rounded-lg transition">Cancel</button>
                                    <button 
                                        onClick={capturePhoto} 
                                        className="flex-[2] py-3 px-8 bg-black text-white font-bold rounded-lg hover:bg-gray-800 transition flex items-center justify-center gap-2 shadow-lg"
                                    >
                                        <CameraIcon /> Capture
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        );
    }
    
    // Default to Stage 1 (Initial)
    return (
        <div className="space-y-8">
            <div className="bg-white p-6 rounded-lg shadow-xl border border-gray-200">
                <h2 className="text-2xl font-bold text-black mb-4 border-b border-gray-200 pb-2">Step 1: Client & Machine Types</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <AutocompleteInput 
                        value={client} 
                        placeholder="Client Name *" 
                        suggestions={knownClients.map(c => c.client)} 
                        onSelect={handleClientSelect}
                        addNewLabel="Add new Client"
                    />
                    <AutocompleteInput 
                        value={clientEmail} 
                        placeholder="Client Email" 
                        suggestions={knownClients.map(c => c.email)} 
                        onSelect={handleEmailSelect}
                        addNewLabel="Add new Email"
                    />
                </div>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                    <AutocompleteInput 
                        value={contactPerson} 
                        placeholder="Contact Person *" 
                        suggestions={knownClients.map(c => c.contactPerson)} 
                        onSelect={handlePersonSelect}
                        addNewLabel="Add new Contact"
                    />
                    <AutocompleteInput 
                        value={contactNumber} 
                        placeholder="Contact Number *" 
                        suggestions={knownClients.map(c => c.contactNumber)} 
                        onSelect={handleNumberSelect}
                        addNewLabel="Add new Number"
                    />
                </div>

                <div className="space-y-4">
                    {machineTypes.map((type, index) => (
                        <div key={type.id} className="grid grid-cols-1 sm:grid-cols-7 gap-2 items-center bg-gray-50 p-3 rounded-md border border-gray-200">
                            <div className="sm:col-span-3">
                                <AutocompleteInput 
                                    value={type.make} 
                                    placeholder="Make *" 
                                    suggestions={knownData.makes} 
                                    onSelect={(make) => handleMachineTypeChange(type.id, 'make', make)}
                                    addNewLabel="Add new Make"
                                />
                            </div>
                            <div className="sm:col-span-3">
                                <AutocompleteInput 
                                    value={type.model} 
                                    placeholder="Model *" 
                                    suggestions={type.make && knownData.models[type.make] ? knownData.models[type.make] : allModels} 
                                    onSelect={(model) => handleMachineTypeChange(type.id, 'model', model)}
                                    addNewLabel="Add new Model"
                                />
                            </div>
                            <div className="flex gap-2 items-center">
                                <input type="number" placeholder="Qty" value={type.qty} onChange={e => handleMachineTypeChange(type.id, 'qty', e.target.value)} className="w-full bg-white border border-gray-300 rounded-md py-2 px-3 text-gray-900 focus:outline-none focus:ring-2 focus:ring-black" min="1" />
                                {machineTypes.length > 1 && (
                                    <button onClick={() => removeMachineType(type.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-full transition"><XIcon /></button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>

                <button onClick={addMachineType} className="flex items-center gap-2 mt-4 text-gray-700 font-semibold hover:text-black transition">
                    <PlusIcon /> Add Another Machine Model
                </button>

                <div className="mt-8">
                    {error && (
                        <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded-md mb-4 flex items-center gap-2 animate-pulse">
                            <XIcon />
                            <p className="text-sm font-medium">{error}</p>
                        </div>
                    )}
                    <button onClick={goToStage2} className="w-full bg-black text-white font-bold py-4 px-4 rounded-md hover:bg-gray-800 transition duration-300 shadow-lg">
                        Next: Add Machine Details ({totalMachines} {totalMachines === 1 ? 'Machine' : 'Machines'})
                    </button>
                </div>
            </div>
        </div>
    );
};

export default RegisterView;
