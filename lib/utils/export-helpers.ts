/**
 * Export helpers with lazy-loaded heavy dependencies (xlsx ~470KB, jspdf ~300KB).
 * CSV export loads instantly; Excel and PDF are loaded on-demand.
 */

export interface ExportData {
  headers: string[];
  rows: (string | number)[][];
}

/**
 * Export data to CSV (no heavy deps — always available)
 */
export function exportToCSV(data: ExportData, filename: string): void {
  const csvRows = [data.headers, ...data.rows];
  const csvContent = csvRows.map(row =>
    row.map(cell => {
      const cellStr = String(cell);
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
 * Export data to Excel (lazy-loads xlsx ~470KB on first use)
 */
export async function exportToExcel(data: ExportData, filename: string): Promise<void> {
  const XLSX = await import('xlsx');
  const worksheet = XLSX.utils.aoa_to_sheet([data.headers, ...data.rows]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');
  XLSX.writeFile(workbook, `${filename}.xlsx`);
}

/**
 * Export data to PDF (lazy-loads jspdf + autotable ~300KB on first use)
 */
export async function exportToPDF(data: ExportData, filename: string, title?: string): Promise<void> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);

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

// ── Domain-specific data transformers ──
// These take raw Firestore data and return ExportData {headers, rows}

interface WithTimestamp {
  toDate?: () => Date;
}

/** Safely convert Firestore timestamps to locale string */
function formatTimestamp(value: unknown): string {
  if (!value) return '-';
  const tsVal = value as WithTimestamp;
  const date = tsVal.toDate ? tsVal.toDate() : new Date(value as string | number);
  return date.toLocaleString('tr-TR');
}

/**
 * Transform calls data for export
 */
export function exportCalls(
  calls: Array<Record<string, unknown>>,
  customers: Record<string, Record<string, unknown>>
): ExportData {
  const headers = ['Tarih', 'Müşteri', 'Telefon', 'Yön', 'Intent', 'Durum', 'Süre (sn)', 'Özet'];
  const rows = calls.map(call => {
    const customer = call.customerId ? customers[call.customerId as string] : null;
    const statusMap: Record<string, string> = { answered: 'Yanıtlandı', missed: 'Kaçırıldı' };
    return [
      formatTimestamp(call.timestamp || call.createdAt),
      (customer?.name || call.customerName || 'Bilinmeyen') as string,
      (customer?.phone || call.customerPhone || '-') as string,
      call.direction === 'inbound' ? 'Gelen' : 'Giden',
      (call.intent || '-') as string,
      statusMap[call.status as string] || String(call.status),
      (call.durationSec ?? call.duration ?? 0) as number,
      (call.summary || '-') as string,
    ];
  });
  return { headers, rows };
}

/**
 * Transform appointments data for export
 */
export function exportAppointments(
  appointments: Array<Record<string, unknown>>,
  customers: Record<string, Record<string, unknown>>
): ExportData {
  const headers = ['Tarih & Saat', 'Müşteri', 'Telefon', 'Süre (dk)', 'Durum', 'Notlar'];
  const statusMap: Record<string, string> = { scheduled: 'Planlandı', completed: 'Tamamlandı', cancelled: 'İptal', confirmed: 'Onaylandı' };
  const rows = appointments.map(apt => {
    const customer = customers[apt.customerId as string];
    return [
      formatTimestamp(apt.dateTime),
      (customer?.name || 'Bilinmeyen') as string,
      (customer?.phone || '-') as string,
      (apt.durationMin || 30) as number,
      statusMap[apt.status as string] || String(apt.status),
      (apt.notes || '-') as string,
    ];
  });
  return { headers, rows };
}

/**
 * Transform complaints data for export
 */
export function exportComplaints(
  complaints: Array<Record<string, unknown>>,
  customers: Record<string, Record<string, unknown>>
): ExportData {
  const headers = ['Tarih', 'Müşteri', 'Telefon', 'Kategori', 'Açıklama', 'Durum', 'Notlar'];
  const statusMap: Record<string, string> = { open: 'Açık', investigating: 'İşlemde', resolved: 'Çözüldü', closed: 'Kapatıldı' };
  const rows = complaints.map(complaint => {
    const customer = customers[complaint.customerId as string];
    return [
      formatTimestamp(complaint.createdAt),
      (customer?.name || 'Bilinmeyen') as string,
      (customer?.phone || '-') as string,
      (complaint.category || '-') as string,
      (complaint.description || '-') as string,
      statusMap[complaint.status as string] || String(complaint.status),
      (complaint.notes || '-') as string,
    ];
  });
  return { headers, rows };
}

/**
 * Transform customers data for export
 */
export function exportCustomers(customers: Array<Record<string, unknown>>): ExportData {
  const headers = ['İsim', 'Telefon', 'E-posta', 'Notlar', 'Oluşturulma'];
  const rows = customers.map(customer => [
    (customer.name || '-') as string,
    (customer.phone || '-') as string,
    (customer.email || '-') as string,
    (customer.notes || '-') as string,
    formatTimestamp(customer.createdAt),
  ]);
  return { headers, rows };
}
