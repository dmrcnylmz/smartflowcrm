import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
// @ts-ignore - jspdf-autotable types
import autoTable from 'jspdf-autotable';

export interface ExportData {
  headers: string[];
  rows: (string | number)[][];
}

/**
 * Export data to CSV
 */
export function exportToCSV(data: ExportData, filename: string) {
  const csvRows = [data.headers, ...data.rows];
  const csvContent = csvRows.map(row => 
    row.map(cell => {
      const cellStr = String(cell);
      // Escape quotes and wrap in quotes if contains comma or newline
      if (cellStr.includes(',') || cellStr.includes('\n') || cellStr.includes('"')) {
        return `"${cellStr.replace(/"/g, '""')}"`;
      }
      return cellStr;
    }).join(',')
  ).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

/**
 * Export data to Excel
 */
export function exportToExcel(data: ExportData, filename: string) {
  const worksheet = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Export data to PDF
 */
export function exportToPDF(data: ExportData, filename: string, title?: string) {
  const doc = new jsPDF();
  
  if (title) {
    doc.setFontSize(16);
    doc.text(title, 14, 15);
    doc.setFontSize(10);
  }

  autoTable(doc, {
    head: [data.headers],
    body: data.rows,
    startY: title ? 25 : 15,
    styles: { fontSize: 8 },
    headStyles: { fillColor: [59, 130, 246] },
  });

  doc.save(`${filename}.pdf`);
}

/**
 * Export calls data
 */
export function exportCalls(calls: any[], customers: Record<string, any>) {
  const headers = ['Tarih', 'Müşteri', 'Telefon', 'Yön', 'Intent', 'Durum', 'Süre (sn)', 'Özet'];
  const rows = calls.map(call => {
    const customer = call.customerId ? customers[call.customerId] : null;
    return [
      call.timestamp || call.createdAt ? new Date(call.timestamp?.toDate?.() || call.createdAt?.toDate?.() || call.timestamp || call.createdAt).toLocaleString('tr-TR') : '-',
      customer?.name || call.customerName || 'Bilinmeyen',
      customer?.phone || call.customerPhone || '-',
      call.direction === 'inbound' ? 'Gelen' : 'Giden',
      call.intent || '-',
      call.status === 'answered' ? 'Yanıtlandı' : call.status === 'missed' ? 'Kaçırıldı' : call.status,
      call.durationSec ?? call.duration ?? 0,
      call.summary || '-',
    ];
  });

  return { headers, rows };
}

/**
 * Export appointments data
 */
export function exportAppointments(appointments: any[], customers: Record<string, any>) {
  const headers = ['Tarih & Saat', 'Müşteri', 'Telefon', 'Süre (dk)', 'Durum', 'Notlar'];
  const rows = appointments.map(apt => {
    const customer = customers[apt.customerId];
    return [
      apt.dateTime ? new Date(apt.dateTime?.toDate?.() || apt.dateTime).toLocaleString('tr-TR') : '-',
      customer?.name || 'Bilinmeyen',
      customer?.phone || '-',
      apt.durationMin || 30,
      apt.status === 'scheduled' ? 'Planlandı' : apt.status === 'completed' ? 'Tamamlandı' : 'İptal',
      apt.notes || '-',
    ];
  });

  return { headers, rows };
}

/**
 * Export complaints data
 */
export function exportComplaints(complaints: any[], customers: Record<string, any>) {
  const headers = ['Tarih', 'Müşteri', 'Telefon', 'Kategori', 'Açıklama', 'Durum', 'Notlar'];
  const rows = complaints.map(complaint => {
    const customer = customers[complaint.customerId];
    return [
      complaint.createdAt ? new Date(complaint.createdAt?.toDate?.() || complaint.createdAt).toLocaleString('tr-TR') : '-',
      customer?.name || 'Bilinmeyen',
      customer?.phone || '-',
      complaint.category || '-',
      complaint.description || '-',
      complaint.status === 'open' ? 'Açık' : complaint.status === 'investigating' ? 'İşlemde' : complaint.status === 'resolved' ? 'Çözüldü' : 'Kapatıldı',
      complaint.notes || '-',
    ];
  });

  return { headers, rows };
}

/**
 * Export customers data
 */
export function exportCustomers(customers: any[]) {
  const headers = ['İsim', 'Telefon', 'E-posta', 'Notlar', 'Oluşturulma'];
  const rows = customers.map(customer => [
    customer.name || '-',
    customer.phone || '-',
    customer.email || '-',
    customer.notes || '-',
    customer.createdAt ? new Date(customer.createdAt?.toDate?.() || customer.createdAt).toLocaleString('tr-TR') : '-',
  ]);

  return { headers, rows };
}

