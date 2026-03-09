
import React, { useEffect, useState } from 'react';
import { machineService } from '../services/machineService';
import type { Machine, ServiceThresholds, EmailSettings } from '../types';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie, Legend, LineChart, Line, CartesianGrid } from 'recharts';
import * as XLSX from 'xlsx';
import type { QueueFilter } from '../App';

interface DashboardProps {
    isDarkMode: boolean;
    toggleDarkMode: () => void;
    onNavigateToQueue: (filter: QueueFilter) => void;
}

const DashboardView: React.FC<DashboardProps> = ({ isDarkMode, toggleDarkMode, onNavigateToQueue }) => {
    const [machines, setMachines] = useState<Machine[]>([]);
    const [thresholds, setThresholds] = useState<ServiceThresholds>({ inspectionHours: 3, materialRequestHours: 24, serviceHours: 4 });
    const [emailSettings, setEmailSettings] = useState<EmailSettings>({ cc: '', subject: '', bodyIntro: '', signature: '' });
    
    const [isLoading, setIsLoading] = useState(true);
    const [editMode, setEditMode] = useState(false);
    const [emailEditMode, setEmailEditMode] = useState(false);

    const [makesList, setMakesList] = useState<string[]>([]);
    const [selectedPartsMake, setSelectedPartsMake] = useState<string>('');
    const [newMakeName, setNewMakeName] = useState<string>('');
    
    const [tempThresholds, setTempThresholds] = useState<ServiceThresholds>({...thresholds});
    const [tempEmailSettings, setTempEmailSettings] = useState<EmailSettings>({...emailSettings});

    const [importStatus, setImportStatus] = useState<string>('');

    useEffect(() => {
        const loadData = async () => {
            try {
                // Load machines first — this is critical for graphs
                const m = await machineService.getAllMachines(false);
                setMachines(m);
            } catch (err) {
                console.error('Failed to load machines:', err);
            }

            // Load non-critical settings independently so they don't block graphs
            try {
                const t = await machineService.getThresholds();
                setThresholds(t);
                setTempThresholds(t);
            } catch (err) { console.warn('Thresholds load failed:', err); }

            try {
                const e = await machineService.getEmailSettings();
                setEmailSettings(e);
                setTempEmailSettings(e);
            } catch (err) { console.warn('Email settings load failed:', err); }

            try {
                const makesModels = await machineService.getKnownMakesAndModels();
                setMakesList(Array.from(makesModels.makes));
            } catch (err) { console.warn('Makes/Models load failed:', err); }

            setIsLoading(false);
        };
        loadData();
    }, []);

    const handleSaveThresholds = async () => {
        await machineService.saveThresholds(tempThresholds);
        setThresholds(tempThresholds);
        setEditMode(false);
    };

    const handleSaveEmailSettings = async () => {
        await machineService.saveEmailSettings(tempEmailSettings);
        setEmailSettings(tempEmailSettings);
        setEmailEditMode(false);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImportStatus('Reading file...');

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                setImportStatus(`Processing ${data.length} rows...`);

                const clients: any[] = [];
                const makes: string[] = [];
                const models: Record<string, string[]> = {};

                data.forEach((row: any) => {
                    // Expected Columns: Client Name, Contact Person, Contact Number, Email, Make, Model
                    const clientName = row['Client Name'];
                    const contactPerson = row['Contact Person'];
                    const contactNumber = row['Contact Number'];
                    const email = row['Email'];
                    const make = row['Make'];
                    const model = row['Model'];

                    if (clientName) {
                        clients.push({
                            client: clientName,
                            contactPerson: contactPerson || '',
                            contactNumber: contactNumber || '',
                            email: email || ''
                        });
                    }

                    if (make) {
                        makes.push(make);
                        if (model) {
                            if (!models[make]) models[make] = [];
                            models[make].push(model);
                        }
                    }
                });

                await machineService.saveImportedData(clients, makes, models);
                setImportStatus(`Successfully imported ${clients.length} clients and updated makes/models.`);
                
                // Clear status after 3 seconds
                setTimeout(() => setImportStatus(''), 5000);

            } catch (error) {
                console.error("Import Error", error);
                setImportStatus('Error importing file. Please check format.');
            }
        };
        reader.readAsBinaryString(file);
    };

    const handlePartsUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setImportStatus('Reading Parts file...');

        const reader = new FileReader();
        reader.onload = async (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary' });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws, { header: 1 }); // Read as array of arrays

                setImportStatus(`Processing ${data.length} rows...`);

                const partsToSave: { partNumber: string, partName: string, make?: string, machines: string[] }[] = [];

                const machineModelsSet = new Set<string>();
                for (let i = 1; i < data.length; i++) {
                    const row = data[i] as any[];
                    if (!row || row.length < 2) continue;
                    for (let j = 2; j < row.length; j++) {
                        const cellValue = String(row[j] || '').trim();
                        if (cellValue) {
                           machineModelsSet.add(cellValue);
                        }
                    }
                }
                const machineModelsList = Array.from(machineModelsSet);
                await machineService.saveImportedData([], [selectedPartsMake], { [selectedPartsMake]: machineModelsList });

                for (let i = 1; i < data.length; i++) {
                    const row = data[i] as any[];
                    if (!row || row.length < 2) continue;

                    const partNumber = String(row[0] || '').trim();
                    const partName = String(row[1] || '').trim();

                    if (!partNumber) continue;

                    const compatibleMachines: string[] = [];
                    
                    for (let j = 2; j < row.length; j++) {
                        const cellValue = String(row[j] || '').trim();
                        if (cellValue) {
                            compatibleMachines.push(cellValue);
                        }
                    }

                    partsToSave.push({
                        partNumber,
                        partName,
                        make: selectedPartsMake || undefined,
                        machines: compatibleMachines
                    });
                }

                await machineService.savePartsCatalog(partsToSave);
                setImportStatus(`Successfully imported ${partsToSave.length} parts.`);
                
                setTimeout(() => setImportStatus(''), 5000);

            } catch (error) {
                console.error("Parts Import Error", error);
                setImportStatus('Error importing parts file. Please check format.');
            }
        };
        reader.readAsBinaryString(file);
    };

    // --- ANALYTICS ---

    const statusCounts = machines.reduce((acc, m) => {
        const s = m.serviceStatus || 'Pending Inspection';
        acc[s] = (acc[s] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);

    const statusData = [
        { name: 'Inspection', value: (statusCounts['Pending Inspection'] || 0) + (statusCounts['Inspected'] || 0), filterId: 'status-inspection' },
        { name: 'Parts', value: statusCounts['Parts Requested'] || 0, filterId: 'status-parts' },
        { name: 'Service', value: statusCounts['Under Service'] || 0, filterId: 'status-service' },
        { name: 'Completed', value: statusCounts['Completed'] || 0, filterId: 'status-completed' },
    ];

    const COLORS = ['#06b6d4', '#8b5cf6', '#f97316', '#10b981']; // Cyan, Purple, Orange, Green

    // Calculate Flags
    let flaggedCount = 0;
    const now = Date.now();
    machines.forEach(m => {
        if (!m.lastStatusUpdate || m.serviceStatus === 'Completed') return;
        
        const workingMins = machineService.getWorkingMinutes(m.lastStatusUpdate, now);
        const workingHours = workingMins / 60;
        let limit = 0;

        if (m.serviceStatus === 'Pending Inspection') limit = thresholds.inspectionHours;
        else if (m.serviceStatus === 'Parts Requested') limit = thresholds.materialRequestHours;
        else if (m.serviceStatus === 'Under Service') limit = thresholds.serviceHours;

        if (limit > 0 && workingHours > limit) {
            flaggedCount++;
        }
    });

    // Time Distribution
    const timeBuckets = [
        { name: '< 1h', count: 0, filterId: 'time-1h' },
        { name: '1-4h', count: 0, filterId: 'time-4h' },
        { name: '4-24h', count: 0, filterId: 'time-24h' },
        { name: '> 24h', count: 0, filterId: 'time-over24h' },
    ];

    machines.forEach(m => {
        if (!m.lastStatusUpdate || m.serviceStatus === 'Completed') return;
        const workingMins = machineService.getWorkingMinutes(m.lastStatusUpdate, now);
        const h = workingMins / 60;
        if (h < 1) timeBuckets[0].count++;
        else if (h < 4) timeBuckets[1].count++;
        else if (h < 24) timeBuckets[2].count++;
        else timeBuckets[3].count++;
    });

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
          return (
            <div className={`p-3 border rounded shadow-md ${isDarkMode ? 'bg-gray-800 border-gray-700 text-white' : 'bg-white border-gray-200 text-gray-900'}`}>
              <p className="font-semibold">{`${label}`}</p>
              <p className="text-sm">{`Count: ${payload[0].value} machine(s)`}</p>
              <p className="text-xs text-blue-500 mt-1 cursor-pointer">Click to view machines</p>
            </div>
          );
        }
        return null;
    };

    // --- ANALYTICS: KEY PERFORMANCE INDICATORS ---
    
    // 1. Average Completion Time
    const completedMachines = machines.filter(m => m.serviceStatus === 'Completed');
    let totalCompletionTimeMs = 0;
    let completionCount = 0;

    completedMachines.forEach(m => {
        // Try to find start time from logs or batch ID
        let startTime = 0;
        if (m.serviceLogs && m.serviceLogs.length > 0) {
            const sortedLogs = [...m.serviceLogs].sort((a, b) => a.timestamp - b.timestamp);
            startTime = sortedLogs[0].timestamp;
        } else if (m.batchId && m.batchId.startsWith('BATCH-')) {
            startTime = parseInt(m.batchId.split('-')[1]);
        }

        if (startTime > 0 && m.lastStatusUpdate && m.lastStatusUpdate > startTime) {
            totalCompletionTimeMs += (m.lastStatusUpdate - startTime);
            completionCount++;
        }
    });
    
    const avgCompletionDays = completionCount > 0 
        ? (totalCompletionTimeMs / completionCount / (1000 * 60 * 60 * 24)).toFixed(1) 
        : '0';

    // 2. Stage Bottlenecks
    const stageWaitTimes: Record<string, { totalMs: number; count: number }> = {
        'Pending Inspection': { totalMs: 0, count: 0 }, // Time spent waiting for inspection
        'Parts Requested': { totalMs: 0, count: 0 },    // Time spent waiting for parts
        'Under Service': { totalMs: 0, count: 0 }       // Time spent being fixed
    };

    machines.forEach(m => {
        if (!m.serviceLogs || m.serviceLogs.length < 2) return;
        const sortedLogs = [...m.serviceLogs].sort((a, b) => a.timestamp - b.timestamp);
        
        for (let i = 0; i < sortedLogs.length - 1; i++) {
            const currentLog = sortedLogs[i];
            const nextLog = sortedLogs[i+1];
            
            // Calculate working time or absolute time? Management usually cares about absolute turnaround time.
            const duration = nextLog.timestamp - currentLog.timestamp;
            
            // If the machine was in status X, add duration to X's wait time
            if (stageWaitTimes[currentLog.status]) {
                stageWaitTimes[currentLog.status].totalMs += duration;
                stageWaitTimes[currentLog.status].count++;
            }
        }
    });

    const bottleneckData = [
        { name: 'Insp. Wait', time: stageWaitTimes['Pending Inspection'].count > 0 ? parseFloat((stageWaitTimes['Pending Inspection'].totalMs / stageWaitTimes['Pending Inspection'].count / (1000 * 60 * 60)).toFixed(1)) : 0 },
        { name: 'Parts Wait', time: stageWaitTimes['Parts Requested'].count > 0 ? parseFloat((stageWaitTimes['Parts Requested'].totalMs / stageWaitTimes['Parts Requested'].count / (1000 * 60 * 60)).toFixed(1)) : 0 },
        { name: 'Service', time: stageWaitTimes['Under Service'].count > 0 ? parseFloat((stageWaitTimes['Under Service'].totalMs / stageWaitTimes['Under Service'].count / (1000 * 60 * 60)).toFixed(1)) : 0 },
    ];

    // 3. Activity Volume (Last 7 Days)
    const volumeData: any[] = [];
    for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        const dateLabel = d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        
        // Count registered (approx via logs or batch)
        let registered = 0;
        let completed = 0;
        
        const startOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime();
        const endOfDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime();

        machines.forEach(m => {
            // Check Registration
            let regTime = 0;
            if (m.batchId && m.batchId.startsWith('BATCH-')) regTime = parseInt(m.batchId.split('-')[1]);
            else if (m.serviceLogs && m.serviceLogs.length > 0) regTime = m.serviceLogs[0].timestamp;
            
            if (regTime >= startOfDay && regTime <= endOfDay) registered++;

            // Check Completion
            if (m.serviceStatus === 'Completed' && m.lastStatusUpdate) {
                if (m.lastStatusUpdate >= startOfDay && m.lastStatusUpdate <= endOfDay) completed++;
            }
        });

        volumeData.push({ date: dateLabel, Registered: registered, Completed: completed });
    }

    // 4. Monthly Completions (Last 6 months)
    const monthlyData: any[] = [];
    for (let i = 5; i >= 0; i--) {
        const today = new Date();
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
        const monthLabel = d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
        
        const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
        const endOfMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();

        let completed = 0;
        machines.forEach(m => {
            if (m.serviceStatus === 'Completed' && m.lastStatusUpdate) {
                if (m.lastStatusUpdate >= startOfMonth && m.lastStatusUpdate <= endOfMonth) completed++;
            }
        });
        monthlyData.push({ name: monthLabel, Completed: completed });
    }

    // 5. Batch/Warehouse Status
    const batches: Record<string, { total: number, completed: number, active: number, timestamp: number }> = {};
    machines.forEach(m => {
        const batchId = m.batchId || 'Unbatched';
        if (!batches[batchId]) batches[batchId] = { total: 0, completed: 0, active: 0, timestamp: 0 };
        
        batches[batchId].total++;
        if (m.serviceStatus === 'Completed') batches[batchId].completed++;
        else batches[batchId].active++;

        // Try to get timestamp from batch ID
        if (batches[batchId].timestamp === 0 && batchId.startsWith('BATCH-')) {
            batches[batchId].timestamp = parseInt(batchId.split('-')[1]);
        }
    });

    const batchList = Object.entries(batches)
        .map(([id, stats]) => ({ id, ...stats }))
        .sort((a, b) => b.timestamp - a.timestamp); // Sort by newest first

    if (isLoading) return <div className="text-center p-10 text-gray-600 dark:text-gray-400">Loading Dashboard...</div>;

    if (machines.length === 0) {
         return (
            <div className="space-y-6 animate-fade-in pb-20">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                         <h3 className="text-gray-500 dark:text-gray-400 text-sm font-bold uppercase">Total Machines</h3>
                         <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2">0</p>
                    </div>
                </div>
                <div className="p-12 text-center bg-white dark:bg-gray-800 rounded-lg shadow border border-gray-200 dark:border-gray-700">
                    <p className="text-xl text-gray-500 dark:text-gray-400">No machine data found. Register some machines to see analytics.</p>
                </div>
            </div>
         );
    }

    return (
        <div className="space-y-6 animate-fade-in pb-20">
            {/* Header Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div 
                    onClick={() => onNavigateToQueue('all')}
                    className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-xl transition-shadow"
                >
                    <h3 className="text-gray-500 dark:text-gray-400 text-sm font-bold uppercase">Total Machines</h3>
                    <p className="text-4xl font-bold text-gray-900 dark:text-white mt-2">{machines.length}</p>
                </div>
                <div 
                    onClick={() => onNavigateToQueue('active')}
                    className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 cursor-pointer hover:shadow-xl transition-shadow"
                >
                    <h3 className="text-gray-500 dark:text-gray-400 text-sm font-bold uppercase">Active In Queue</h3>
                    <p className="text-4xl font-bold text-black dark:text-white mt-2">
                        {machines.filter(m => m.serviceStatus !== 'Completed').length}
                    </p>
                </div>
                <div 
                    onClick={() => onNavigateToQueue('flagged')}
                    className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 relative overflow-hidden cursor-pointer hover:shadow-xl transition-shadow group"
                >
                    <div className="absolute -right-6 -top-6 w-24 h-24 bg-red-100 dark:bg-red-900/20 rounded-full blur-xl group-hover:bg-red-200 dark:group-hover:bg-red-900/40 transition-colors"></div>
                    <h3 className="text-gray-500 dark:text-gray-400 text-sm font-bold uppercase relative z-10">Flags Raised</h3>
                    <p className="text-4xl font-bold text-red-600 dark:text-red-500 mt-2 relative z-10">{flaggedCount}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 relative z-10">Exceeding time limits</p>
                </div>
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Status Distribution */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 flex flex-col items-center">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 self-start w-full border-b border-gray-200 dark:border-gray-700 pb-2">Queue Status Distribution</h3>
                    <div className="w-full h-64">
                        <ResponsiveContainer width="100%" height="100%">
                             <PieChart>
                                <Pie
                                    data={statusData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={90}
                                    paddingAngle={5}
                                    dataKey="value"
                                    onClick={(data) => {
                                        if (data && data.payload && data.payload.filterId) {
                                            onNavigateToQueue(data.payload.filterId as QueueFilter);
                                        }
                                    }}
                                    className="cursor-pointer"
                                    stroke="none"
                                >
                                    {statusData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} className="hover:opacity-80 transition-opacity" />
                                    ))}
                                </Pie>
                                <Tooltip content={<CustomTooltip />} />
                                <Legend wrapperStyle={{ color: isDarkMode ? '#9ca3af' : '#374151' }} />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Time Buckets */}
                <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">Time Spent in Current Stage</h3>
                    <div className="w-full h-64">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={timeBuckets} onClick={(data) => {
                                if (data && data.activePayload && data.activePayload.length > 0 && data.activePayload[0].payload.filterId) {
                                    onNavigateToQueue(data.activePayload[0].payload.filterId as QueueFilter);
                                }
                            }}>
                                <XAxis dataKey="name" stroke={isDarkMode ? '#9ca3af' : '#6b7280'} fontSize={12} />
                                <YAxis stroke={isDarkMode ? '#9ca3af' : '#6b7280'} fontSize={12} allowDecimals={false} />
                                <Tooltip content={<CustomTooltip />} cursor={{fill: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}} />
                                <Bar 
                                    dataKey="count" 
                                    fill={isDarkMode ? '#60a5fa' : '#3b82f6'} 
                                    radius={[4, 4, 0, 0]} 
                                    barSize={40} 
                                    className="cursor-pointer"
                                />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Management Reports Section */}
            <div className="pt-6 border-t border-gray-200 dark:border-gray-700">
                <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">Management Information System (MIS) Reports</h2>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
                    {/* KPI Cards */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                        <h3 className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">Avg. Resolution Time</h3>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">{avgCompletionDays} <span className="text-sm font-normal text-gray-500">days</span></p>
                        <p className="text-xs text-gray-500 mt-1">From receipt to completion</p>
                    </div>
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                        <h3 className="text-gray-500 dark:text-gray-400 text-xs font-bold uppercase">Completion Rate (7d)</h3>
                        <p className="text-3xl font-bold text-gray-900 dark:text-white mt-2">
                            {volumeData.reduce((acc, d) => acc + d.Registered, 0) > 0 
                                ? Math.round((volumeData.reduce((acc, d) => acc + d.Completed, 0) / volumeData.reduce((acc, d) => acc + d.Registered, 0)) * 100) 
                                : 0}%
                        </p>
                        <p className="text-xs text-gray-500 mt-1">Registered vs Completed</p>
                    </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Stage Bottlenecks Chart */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">Stage Bottlenecks (Avg Hours)</h3>
                        <div className="w-full h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={bottleneckData} layout="vertical" margin={{ left: 20 }}>
                                    <XAxis type="number" stroke={isDarkMode ? '#9ca3af' : '#6b7280'} fontSize={12} />
                                    <YAxis dataKey="name" type="category" stroke={isDarkMode ? '#9ca3af' : '#6b7280'} fontSize={12} width={80} />
                                    <Tooltip cursor={{fill: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}} contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#fff', borderColor: isDarkMode ? '#374151' : '#e5e7eb', color: isDarkMode ? '#fff' : '#111827' }} />
                                    <Bar dataKey="time" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={20} name="Avg. Hours" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Volume Trend Chart */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">7-Day Activity Volume</h3>
                        <div className="w-full h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={volumeData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke={isDarkMode ? '#374151' : '#e5e7eb'} vertical={false} />
                                    <XAxis dataKey="date" stroke={isDarkMode ? '#9ca3af' : '#6b7280'} fontSize={12} tickLine={false} axisLine={false} dy={10} />
                                    <YAxis stroke={isDarkMode ? '#9ca3af' : '#6b7280'} fontSize={12} allowDecimals={false} tickLine={false} axisLine={false} />
                                    <Tooltip contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#fff', borderColor: isDarkMode ? '#374151' : '#e5e7eb', color: isDarkMode ? '#fff' : '#111827' }} />
                                    <Legend wrapperStyle={{ paddingTop: '10px' }} />
                                    <Line type="monotone" dataKey="Registered" stroke="#8b5cf6" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="New Jobs" />
                                    <Line type="monotone" dataKey="Completed" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} name="Completed" />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Monthly Trend Chart */}
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-6 border-b border-gray-200 dark:border-gray-700 pb-2">Monthly Completions Trend</h3>
                         <div className="w-full h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={monthlyData}>
                                    <XAxis dataKey="name" stroke={isDarkMode ? '#9ca3af' : '#6b7280'} fontSize={12} />
                                    <YAxis stroke={isDarkMode ? '#9ca3af' : '#6b7280'} fontSize={12} allowDecimals={false} />
                                    <Tooltip cursor={{fill: isDarkMode ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.05)'}} contentStyle={{ backgroundColor: isDarkMode ? '#1f2937' : '#fff', borderColor: isDarkMode ? '#374151' : '#e5e7eb', color: isDarkMode ? '#fff' : '#111827' }} />
                                    <Bar dataKey="Completed" fill="#10b981" radius={[4, 4, 0, 0]} barSize={30} name="Completed Units" />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                </div>

                {/* Warehouse Inventory Status Table */}
                <div className="mt-6 bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">Batch Inventory Status (Warehouse)</h3>
                    <div className="overflow-x-auto max-h-96">
                        <table className="w-full text-left border-collapse">
                            <thead className="sticky top-0 bg-white dark:bg-gray-800 z-10">
                                <tr className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase border-b border-gray-200 dark:border-gray-700">
                                    <th className="py-3 px-4">Batch ID / Group</th>
                                    <th className="py-3 px-4 text-center">Total Units</th>
                                    <th className="py-3 px-4 text-center text-green-600 dark:text-green-500">Completed</th>
                                    <th className="py-3 px-4 text-center text-blue-600 dark:text-blue-500">Active (In Warehouse)</th>
                                    <th className="py-3 px-4 w-1/3">Progress</th>
                                </tr>
                            </thead>
                            <tbody>
                                {batchList.length > 0 ? (
                                    batchList.map((batch, idx) => (
                                        <tr key={idx} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition">
                                            <td className="py-3 px-4 font-mono text-sm text-gray-700 dark:text-gray-300">
                                                <div className="flex flex-col">
                                                    <span className="font-bold">{batch.id === 'Unbatched' ? 'Individual Registrations' : batch.id}</span>
                                                    <span className="text-xs text-gray-400">
                                                        {batch.timestamp ? new Date(batch.timestamp).toLocaleDateString() : 'Various Dates'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="py-3 px-4 text-center font-bold text-gray-900 dark:text-white">{batch.total}</td>
                                            <td className="py-3 px-4 text-center text-green-600 font-medium">{batch.completed}</td>
                                            <td className="py-3 px-4 text-center text-blue-600 font-medium">{batch.active}</td>
                                            <td className="py-3 px-4">
                                                {batch.active === 0 ? (
                                                    <span className="bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300 text-xs px-2 py-1 rounded-full border border-green-200 dark:border-green-800">100% Complete</span>
                                                ) : (
                                                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                                                        <div 
                                                            className="bg-blue-600 h-2.5 rounded-full transition-all duration-500" 
                                                            style={{ width: `${Math.max(5, (batch.completed / batch.total) * 100)}%` }}
                                                        ></div>
                                                    </div>
                                                )}
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">No batches recorded yet.</td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Service Threshold Settings */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">Flag Threshold Configuration</h3>
                    {!editMode ? (
                        <button 
                            onClick={() => setEditMode(true)} 
                            className="text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-1 rounded text-gray-700 dark:text-gray-200 transition"
                        >
                            Edit Limits
                        </button>
                    ) : (
                         <div className="flex gap-2">
                            <button onClick={() => setEditMode(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-2">Cancel</button>
                            <button 
                                onClick={handleSaveThresholds} 
                                className="text-sm bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 px-3 py-1 rounded text-white dark:text-black transition"
                            >
                                Save Changes
                            </button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Inspection Time Limit (Hours)</label>
                        <input 
                            type="number" 
                            disabled={!editMode}
                            value={tempThresholds.inspectionHours}
                            onChange={(e) => setTempThresholds({...tempThresholds, inspectionHours: parseFloat(e.target.value)})}
                            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-2 text-gray-900 dark:text-white disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Flag if inspection takes longer than this.</p>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Material Request Limit (Hours)</label>
                        <input 
                            type="number" 
                            disabled={!editMode}
                            value={tempThresholds.materialRequestHours}
                            onChange={(e) => setTempThresholds({...tempThresholds, materialRequestHours: parseFloat(e.target.value)})}
                            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-2 text-gray-900 dark:text-white disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500"
                        />
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Flag if parts arrival/processing exceeds this.</p>
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Service Time Limit (Hours)</label>
                        <input 
                            type="number" 
                            disabled={!editMode}
                            value={tempThresholds.serviceHours}
                            onChange={(e) => setTempThresholds({...tempThresholds, serviceHours: parseFloat(e.target.value)})}
                            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-2 text-gray-900 dark:text-white disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500"
                        />
                         <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Flag if repair/service duration exceeds this.</p>
                    </div>
                </div>
            </div>

            {/* Email Template Settings */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">Registration Email Template</h3>
                    {!emailEditMode ? (
                        <button 
                            onClick={() => setEmailEditMode(true)} 
                            className="text-sm bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 px-3 py-1 rounded text-gray-700 dark:text-gray-200 transition"
                        >
                            Edit Template
                        </button>
                    ) : (
                         <div className="flex gap-2">
                            <button onClick={() => setEmailEditMode(false)} className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white px-2">Cancel</button>
                            <button 
                                onClick={handleSaveEmailSettings} 
                                className="text-sm bg-black dark:bg-white hover:bg-gray-800 dark:hover:bg-gray-200 px-3 py-1 rounded text-white dark:text-black transition"
                            >
                                Save Changes
                            </button>
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-1 gap-6">
                    <div>
                        <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Subject Line</label>
                        <input 
                            type="text" 
                            disabled={!emailEditMode}
                            value={tempEmailSettings.subject}
                            onChange={(e) => setTempEmailSettings({...tempEmailSettings, subject: e.target.value})}
                            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-2 text-gray-900 dark:text-white disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">CC Addresses (Comma separated)</label>
                        <input 
                            type="text" 
                            disabled={!emailEditMode}
                            value={tempEmailSettings.cc}
                            onChange={(e) => setTempEmailSettings({...tempEmailSettings, cc: e.target.value})}
                            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-2 text-gray-900 dark:text-white disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Body Introduction</label>
                        <textarea 
                            disabled={!emailEditMode}
                            value={tempEmailSettings.bodyIntro}
                            onChange={(e) => setTempEmailSettings({...tempEmailSettings, bodyIntro: e.target.value})}
                            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-2 text-gray-900 dark:text-white h-20 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500"
                        />
                    </div>
                    <div>
                        <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">Signature</label>
                        <textarea 
                            disabled={!emailEditMode}
                            value={tempEmailSettings.signature}
                            onChange={(e) => setTempEmailSettings({...tempEmailSettings, signature: e.target.value})}
                            className="w-full bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-2 text-gray-900 dark:text-white h-32 disabled:bg-gray-50 dark:disabled:bg-gray-800 disabled:text-gray-500 dark:disabled:text-gray-500 font-mono text-sm"
                        />
                    </div>
                </div>
            </div>
            {/* Appearance Settings */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">Appearance Settings</h3>
                </div>
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-medium text-gray-900 dark:text-white">Night Mode</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">Switch between light and dark themes.</p>
                    </div>
                    <button 
                        onClick={toggleDarkMode}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-black dark:focus:ring-white focus:ring-offset-2 ${isDarkMode ? 'bg-black dark:bg-white' : 'bg-gray-200 dark:bg-gray-600'}`}
                    >
                        <span className="sr-only">Enable dark mode</span>
                        <span
                            className={`inline-block h-4 w-4 transform rounded-full bg-white dark:bg-black transition-transform ${isDarkMode ? 'translate-x-6' : 'translate-x-1'}`}
                        />
                    </button>
                </div>
            </div>

            {/* Data Management */}
            <div className="bg-white dark:bg-gray-800 p-6 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
                <div className="flex justify-between items-center mb-4 border-b border-gray-200 dark:border-gray-700 pb-2">
                    <h3 className="text-lg font-bold text-gray-800 dark:text-white">Data Management</h3>
                </div>
                <div className="space-y-4">
                    <div>
                        <p className="font-medium text-gray-900 dark:text-white mb-2">Bulk Import Data</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Upload an Excel file (.xlsx) to add Clients, Contact Persons, and Machine Makes/Models.
                            <br/>
                            <strong>Required Columns:</strong> Client Name, Contact Person, Contact Number, Email, Make, Model
                        </p>
                        
                        <div className="flex items-center gap-4">
                            <label className="cursor-pointer bg-black dark:bg-white text-white dark:text-black px-4 py-2 rounded font-bold hover:bg-gray-800 dark:hover:bg-gray-200 transition">
                                <span>Upload Excel</span>
                                <input type="file" accept=".xlsx, .xls" className="hidden" onChange={handleFileUpload} />
                            </label>
                            {importStatus && (
                                <span className={`text-sm font-medium ${importStatus.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>
                                    {importStatus}
                                </span>
                            )}
                        </div>
                    </div>
                    <div>
                        <p className="font-medium text-gray-900 dark:text-white mb-2">Bulk Import Parts Catalog</p>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
                            Upload a CSV/Excel file with parts and machine compatibility.
                            <br/>
                            <strong>Format:</strong> Part Number, Part Name, Machine 1, Machine 2... (Mark 'x' or any value in machine columns)
                        </p>
                        
                        <div className="flex flex-col gap-4">
                            <div className="flex items-center gap-2">
                                <select 
                                    className="border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    value={selectedPartsMake}
                                    onChange={(e) => setSelectedPartsMake(e.target.value)}
                                >
                                    <option value="" disabled>Select Make</option>
                                    {makesList.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                                <input 
                                    type="text" 
                                    placeholder="New Make..." 
                                    className="border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                                    value={newMakeName}
                                    onChange={(e) => setNewMakeName(e.target.value)}
                                />
                                <button 
                                    className="bg-green-600 text-white px-4 py-2 rounded font-bold hover:bg-green-700 transition"
                                    onClick={async () => {
                                        if (!newMakeName.trim()) return;
                                        await machineService.addMake(newMakeName.trim());
                                        setMakesList(prev => [...prev, newMakeName.trim()]);
                                        setSelectedPartsMake(newMakeName.trim());
                                        setNewMakeName('');
                                    }}
                                >
                                    Add Make
                                </button>
                            </div>
                            <div className="flex items-center gap-4">
                                <label className={`cursor-pointer px-4 py-2 rounded font-bold transition ${selectedPartsMake ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-gray-400 text-gray-200 cursor-not-allowed'}`}>
                                    <span>Upload Parts CSV</span>
                                    <input 
                                        type="file" 
                                        accept=".csv, .xlsx, .xls" 
                                        className="hidden" 
                                        onChange={handlePartsUpload}
                                        disabled={!selectedPartsMake}
                                    />
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default DashboardView;
