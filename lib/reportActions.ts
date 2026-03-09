import { pdfGenerator } from '../services/pdfGenerator';
import type { Machine, EmailSettings } from '../types';

export const handleDownloadServiceReport = async (machine: Machine) => {
    try {
        const doc = await pdfGenerator.generateServiceReportDoc(machine);
        doc.save(`Service_Report_${machine.serialNumber || machine.id}.pdf`);
    } catch (e) {
        console.error("Error downloading service report: ", e);
        alert("Could not generate Service Report PDF.");
    }
};

export const handleSendServiceReportEmail = async (machine: Machine, emailSettings: EmailSettings | null | undefined, setMailtoLink?: (link: string) => void) => {
    try {
        const doc = await pdfGenerator.generateServiceReportDoc(machine);
        const blob = doc.output('blob');
        const file = new File([blob], `Service_Report_${machine.serialNumber || machine.id}.pdf`, { type: 'application/pdf' });
        
        const subject = `Service Report - ${machine.make} ${machine.model} (S/N: ${machine.serialNumber || 'N/A'})`;
        const mailBody = `Dear ${machine.contactPerson || 'Client'},

We have completed the service for your machine. Please find the attached service report outlining the service details and initial inspection.

Service Details:
- Client Name: ${machine.client || 'N/A'}
- Contact Person: ${machine.contactPerson || 'N/A'}
- Contact Email: ${machine.clientEmail || 'N/A'}
- Contact Phone: ${machine.contactNumber || 'N/A'}
- Make: ${machine.make || 'N/A'}
- Model: ${machine.model || 'N/A'}
- Serial Number: ${machine.serialNumber || 'N/A'}

${emailSettings?.signature || 'Best regards,\nPOFIS Service Team'}`;

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({
                files: [file],
                title: subject,
                text: mailBody,
            });
        } else {
            // Fallback to Mailto
            doc.save(`Service_Report_${machine.serialNumber || machine.id}.pdf`);
            const to = machine.clientEmail || '';
            const encSubject = encodeURIComponent(subject);
            const body = encodeURIComponent(mailBody);
            const cc = encodeURIComponent(emailSettings?.cc || '');
            
            let mailtoLink = `mailto:${to}?subject=${encSubject}&body=${body}`;
            if (cc) mailtoLink += `&cc=${cc}`;
            
            if (setMailtoLink) {
                setMailtoLink(mailtoLink);
            }
            window.location.href = mailtoLink;
        }
    } catch (e) {
        console.error("Error sharing service report email directly: ", e);
        alert("Could not share directly. Downloading PDF instead.");
        handleDownloadServiceReport(machine);
    }
};