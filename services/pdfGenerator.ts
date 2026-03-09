
import QRCode from 'qrcode';
import type { Machine } from '../types';

const getLogoBase64 = (): Promise<string> => {
    return new Promise((resolve, reject) => {
        fetch('/pofis-logo.jpeg')
            .then(res => res.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(reader.result as string);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            })
            .catch(reject);
    });
};

export const pdfGenerator = {
    generateReceiptDoc: async (machines: Machine[]) => {
        if (machines.length === 0) throw new Error("No machines provided");

        // Extract Client Info from the first machine (assuming batch consistency)
        const client = machines[0].client;
        const contactPerson = machines[0].contactPerson;
        const contactNumber = machines[0].contactNumber;
        const clientEmail = machines[0].clientEmail;

        if (typeof (window as any).jspdf === 'undefined') {
             throw new Error("jsPDF Library not loaded");
        }
        
        const jsPDF = (window as any).jspdf.jsPDF || (window as any).jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        
        // --- HEADER ---
        // Logo (Left)
        try {
            const logoData = await getLogoBase64();
            doc.addImage(logoData, 'JPEG', 10, 8, 18, 25);
        } catch (e) { console.error('Logo load error', e); }
        
        // Company Name (Right)
        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        
        // English Text
        doc.text("POFIS ELECTROMECHANICAL SERVICE - L.L.C - S.P.C", pageWidth - 10, 20, { align: 'right' });
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        doc.text("Service Receipt", pageWidth - 10, 28, { align: 'right' });

        // Line Separator
        doc.setDrawColor(0, 0, 0);
        doc.line(10, 35, pageWidth - 10, 35);

        // --- INFO SECTION ---
        doc.setFontSize(10);
        doc.text(`Date: ${new Date().toLocaleDateString()}`, 10, 45);
        doc.text(`Client: ${client || 'N/A'}`, 10, 50);
        doc.text(`Contact: ${contactPerson || 'N/A'} (${contactNumber || 'N/A'})`, 10, 55);
        doc.text(`Email: ${clientEmail || 'N/A'}`, 10, 60);

        // --- MACHINES LIST ---
        let yPos = 70;
        doc.setFont("helvetica", "bold");
        doc.text("Machine Details:", 10, yPos);
        yPos += 10;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        
        // Table Header
        doc.setFillColor(240, 240, 240);
        doc.rect(10, yPos - 5, pageWidth - 20, 8, 'F');
        doc.text("Make / Model", 12, yPos);
        doc.text("Serial No.", 80, yPos);
        doc.text("Asset No.", 130, yPos);
        doc.text("Warranty", 170, yPos);
        yPos += 10;

        for (const machine of machines) {
            if (yPos > 270) {
                doc.addPage();
                yPos = 20;
            }
            doc.text(`${machine.make} ${machine.model}`, 12, yPos);
            doc.text(`${machine.serialNumber || '-'}`, 80, yPos);
            doc.text(`${machine.clientAssetNumber || '-'}`, 130, yPos);
            doc.text(`${machine.warrantyStatus || '-'}`, 170, yPos);
            yPos += 8;
        }
        
        yPos += 10;

        // --- DECLARATION ---
        if (yPos > 250) {
            doc.addPage();
            yPos = 20;
        }
        
        doc.setFont("helvetica", "bold");
        doc.text("Declaration of Acceptance:", 10, yPos);
        yPos += 7;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        const declaration = `I, ${contactPerson}, representing ${client}, hereby acknowledge the handover and registration of ${machines.length} machine(s). I confirm that the machine details and site inspection evidence provided are accurate and I accept the equipment in its current condition.`;
        
        const splitText = doc.splitTextToSize(declaration, pageWidth - 20);
        doc.text(splitText, 10, yPos);
        yPos += (splitText.length * 5) + 10;

        // --- SIGNATURE ---
        if (yPos > 240) {
            doc.addPage();
            yPos = 20;
        }
        
        doc.text("Customer Signature:", 10, yPos);
        if (machines[0]?.customerSignature) {
            try {
                doc.addImage(machines[0].customerSignature, 'PNG', 10, yPos + 5, 60, 20);
            } catch(e) { console.error("Sig error", e); }
        }
        
        // --- IMAGES (New Pages) ---
        doc.addPage();
        doc.setFontSize(14);
        doc.text("Machine Images & Evidence", 10, 20);
        
        let imgY = 30;
        
        // Site Photos (from first machine, assuming shared site photos for batch)
        // Note: In RegisterView, sitePhotos were shared. In DB, they are stored per machine.
        // We'll take the first machine's site photos as representative if they exist.
        if (machines[0]?.sitePhotos && machines[0].sitePhotos.length > 0) {
             doc.setFontSize(10);
             doc.text("Site Photos:", 10, imgY);
             imgY += 5;
             
             let xPos = 10;
             machines[0].sitePhotos.forEach((photo: string, idx: number) => {
                 if (idx > 3) return; // Limit photos
                 try {
                    doc.addImage(photo, 'JPEG', xPos, imgY, 80, 60);
                    xPos += 90;
                    if (xPos > 150) {
                        xPos = 10;
                        imgY += 70;
                    }
                 } catch (e) { console.error("Site img error", e); }
             });
             if (xPos > 10) imgY += 70; // Adjust if row not full
        }
        
        // Individual Machine Photos
        for (const machine of machines) {
            if (imgY > 200) {
                doc.addPage();
                imgY = 20;
            }
            
            doc.setFontSize(10);
            doc.text(`Machine: ${machine.make} ${machine.model} (S/N: ${machine.serialNumber})`, 10, imgY);
            imgY += 5;
            
            if (machine.photo) {
                try {
                    doc.addImage(machine.photo, 'JPEG', 10, imgY, 60, 45);
                    doc.text("Machine Photo", 10, imgY + 50);
                } catch(e) {}
            }
            
            // Only show invoice thumbnail if NOT under warranty (since under warranty gets full page)
            if (machine.invoicePhoto && machine.warrantyStatus !== 'Under Warranty') {
                 try {
                    doc.addImage(machine.invoicePhoto, 'JPEG', 80, imgY, 60, 45);
                    doc.text("Invoice", 80, imgY + 50);
                } catch(e) {}
            }
            
            imgY += 60;
        }

        // Full Page Invoices for Under Warranty Machines
        for (const machine of machines) {
            if (machine.warrantyStatus === 'Under Warranty' && machine.invoicePhoto) {
                doc.addPage(); // Defaults to 'p' (portrait)
                
                doc.setFontSize(14);
                doc.text(`Invoice: ${machine.make} ${machine.model}`, 10, 15);
                doc.setFontSize(10);
                doc.text(`S/N: ${machine.serialNumber} | Asset: ${machine.clientAssetNumber || 'N/A'}`, 10, 22);
                
                try {
                    const pageWidth = doc.internal.pageSize.getWidth();
                    const pageHeight = doc.internal.pageSize.getHeight();
                    const margin = 10;
                    const availableWidth = pageWidth - (margin * 2);
                    const availableHeight = pageHeight - (margin * 2) - 25; // Header space
                    
                    doc.addImage(machine.invoicePhoto, 'JPEG', margin, 30, availableWidth, availableHeight);
                } catch (e) {
                    console.error("Full page invoice error", e);
                }
            }
        }

        return doc;
    },

    generateServiceReportDoc: async (machine: Machine) => {
        if (typeof (window as any).jspdf === 'undefined') {
             throw new Error("jsPDF Library not loaded");
        }
        
        const jsPDF = (window as any).jspdf.jsPDF || (window as any).jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const marginLeft = 10;
        
        // --- HEADER ---
        // Logo (Left)
        try {
            const logoData = await getLogoBase64();
            doc.addImage(logoData, 'JPEG', marginLeft, 8, 18, 25);
        } catch (e) { console.error('Logo load error', e); }

        doc.setTextColor(0, 0, 0);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("POFIS ELECTROMECHANICAL SERVICE - L.L.C - S.P.C", pageWidth - marginLeft, 20, { align: 'right' });
        doc.setFontSize(12);
        doc.setFont("helvetica", "bold");
        doc.text("Service Completion Report", pageWidth - marginLeft, 28, { align: 'right' });

        doc.setDrawColor(0, 0, 0);
        doc.line(marginLeft, 35, pageWidth - marginLeft, 35);

        let yPos = 45;

        // --- CLIENT & MACHINE INFO ---
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text("Client Information", marginLeft, yPos);
        doc.text("Machine Details", pageWidth / 2, yPos);
        yPos += 7;

        doc.setFontSize(9);
        doc.setFont("helvetica", "normal");
        
        doc.text(`Client: ${machine.client || 'N/A'}`, marginLeft, yPos);
        doc.text(`Make: ${machine.make}`, pageWidth / 2, yPos);
        yPos += 6;
        
        doc.text(`Contact: ${machine.contactPerson || 'N/A'}`, marginLeft, yPos);
        doc.text(`Model: ${machine.model}`, pageWidth / 2, yPos);
        yPos += 6;
        
        doc.text(`Email: ${machine.clientEmail || 'N/A'}`, marginLeft, yPos);
        doc.text(`Serial No.: ${machine.serialNumber || 'N/A'}`, pageWidth / 2, yPos);
        yPos += 6;
        
        doc.text(`Date: ${new Date().toLocaleDateString()}`, marginLeft, yPos);
        doc.text(`Asset No.: ${machine.clientAssetNumber || 'N/A'}`, pageWidth / 2, yPos);
        yPos += 15;

        doc.line(marginLeft, yPos - 5, pageWidth - marginLeft, yPos - 5);

        // --- INSPECTION DETAILS ---
        if (machine.inspectionReport) {
            if (yPos > 260) { doc.addPage(); yPos = 20; }
            doc.setFont("helvetica", "bold");
            doc.setFontSize(11);
            doc.text("Initial Inspection Details", marginLeft, yPos);
            yPos += 8;

            doc.setFont("helvetica", "normal");
            doc.setFontSize(9);
            const insp = machine.inspectionReport;
            doc.text(`Unit Status: ${insp.isAlive}`, marginLeft, yPos);
            doc.text(`Diode Test: ${insp.diodeTest || 'N/A'}`, pageWidth / 2, yPos);
            yPos += 6;
            doc.text(`Error Codes: ${insp.errorCodes || 'None'}`, marginLeft, yPos);
            doc.text(`Continuity Test: ${insp.continuityTest || 'N/A'}`, pageWidth / 2, yPos);
            yPos += 8;

            doc.setFont("helvetica", "bold");
            doc.text("Observations:", marginLeft, yPos);
            yPos += 5;
            doc.setFont("helvetica", "normal");
            const obsText = doc.splitTextToSize(insp.observations || 'N/A', pageWidth - (marginLeft * 2));
            doc.text(obsText, marginLeft, yPos);
            yPos += (obsText.length * 5) + 10;
            
            doc.line(marginLeft, yPos - 5, pageWidth - marginLeft, yPos - 5);
        }

        // --- PARTS REPLACED ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Parts & Materials Used", marginLeft, yPos);
        yPos += 8;
        
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        
        if (machine.materialRequest && machine.materialRequest.parts) {
            const partsText = doc.splitTextToSize(machine.materialRequest.parts, pageWidth - (marginLeft * 2));
            doc.text(partsText, marginLeft, yPos);
            yPos += (partsText.length * 5) + 3;
        } else {
            doc.text("No parts were requested or replaced during this service.", marginLeft, yPos);
            yPos += 8;
        }
        yPos += 5;
        doc.line(marginLeft, yPos - 5, pageWidth - marginLeft, yPos - 5);

        // --- SERVICE LOGS ---
        doc.setFont("helvetica", "bold");
        doc.setFontSize(11);
        doc.text("Service Notes", marginLeft, yPos);
        yPos += 8;

        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        
        if (machine.serviceLogs && machine.serviceLogs.length > 0) {
            // Find completion log or use all notes
            const notes = machine.serviceLogs
                .filter(log => log.note && log.note.trim() !== '')
                .map(log => `[${new Date(log.timestamp).toLocaleDateString()}] (${log.status}): ${log.note}`);

            if (notes.length > 0) {
                for (const note of notes) {
                    if (yPos > 270) { doc.addPage(); yPos = 20; }
                    const splitNote = doc.splitTextToSize(note, pageWidth - (marginLeft * 2));
                    doc.text(splitNote, marginLeft, yPos);
                    yPos += (splitNote.length * 5) + 2;
                }
            } else {
                doc.text("No additional service notes recorded.", marginLeft, yPos);
                yPos += 8;
            }
        } else {
            doc.text("No service logs available.", marginLeft, yPos);
            yPos += 8;
        }
        
        yPos += 15;
        if (yPos > 250) { doc.addPage(); yPos = 20; }

        // --- FOOTER SIGN-OFF ---
        doc.setFont("helvetica", "bold");
        doc.text("Service Completed By:", marginLeft, yPos);
        doc.text("POFIS Service Team", marginLeft, yPos + 15);
        
        // --- SUMMARY IMAGES ---
        if (machine.photo || (machine.inspectionReport && machine.inspectionReport.diagnosticImages && machine.inspectionReport.diagnosticImages.length > 0)) {
            doc.addPage();
            doc.setFontSize(12);
            doc.text("Reference Images", marginLeft, 20);
            let imgY = 30;

            if (machine.photo) {
                try {
                    doc.setFontSize(10);
                    doc.text("Machine Identification:", marginLeft, imgY);
                    doc.addImage(machine.photo, 'JPEG', marginLeft, imgY + 5, 60, 45);
                    imgY += 60;
                } catch(e) {}
            }

            if (machine.inspectionReport?.diagnosticImages && machine.inspectionReport.diagnosticImages.length > 0) {
                doc.text("Diagnostic Images:", marginLeft, imgY);
                imgY += 5;
                let xPos = marginLeft;
                for (const diagImg of machine.inspectionReport.diagnosticImages) {
                    if (imgY > 220) { doc.addPage(); imgY = 20; xPos = marginLeft; }
                    try {
                        doc.addImage(diagImg, 'JPEG', xPos, imgY, 60, 45);
                        xPos += 70;
                        if (xPos > 150) { xPos = marginLeft; imgY += 50; }
                    } catch (e) {}
                }
            }
        }

        return doc;
    },

    generateQrDoc: async (machines: Machine[]) => {
        if (typeof (window as any).jspdf === 'undefined') {
             throw new Error("jsPDF Library not loaded");
        }
        
        const jsPDF = (window as any).jspdf.jsPDF || (window as any).jspdf;
        const doc = new jsPDF();
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();

        for (let i = 0; i < machines.length; i++) {
            const machine = machines[i];
            if (i > 0) doc.addPage();

            // QR Code - Full Page
            try {
                const qrData = JSON.stringify({ serialNumber: machine.serialNumber, clientAssetNumber: machine.clientAssetNumber });
                const qrDataURL = await QRCode.toDataURL(qrData, { width: 512, margin: 1 });
                
                // Calculate size to fill page with some margin
                const margin = 20;
                const size = Math.min(pageWidth - (margin * 2), pageHeight - (margin * 2) - 40);
                const x = (pageWidth - size) / 2;
                const y = (pageHeight - size) / 2 - 20;

                doc.addImage(qrDataURL, 'PNG', x, y, size, size);
                
                // Label below QR
                doc.setFontSize(24);
                doc.setFont("helvetica", "bold");
                doc.text(`${machine.make} ${machine.model}`, pageWidth / 2, y + size + 15, { align: 'center' });
                
                doc.setFontSize(16);
                doc.setFont("helvetica", "normal");
                doc.text(`S/N: ${machine.serialNumber || 'N/A'}`, pageWidth / 2, y + size + 25, { align: 'center' });
                doc.text(`Asset: ${machine.clientAssetNumber || 'N/A'}`, pageWidth / 2, y + size + 35, { align: 'center' });

            } catch (e) {
                console.error("QR PDF Error", e);
                doc.text("Error generating QR Code", 10, 10);
            }
        }
        return doc;
    }
};
