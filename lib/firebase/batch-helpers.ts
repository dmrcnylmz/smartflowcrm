import { collection, getDocs, query, where, documentId } from 'firebase/firestore';
import { db } from './config';
import type { Customer } from './types';

// Extract unique customer IDs from any array of objects with customerId
export function extractCustomerIds(items: Array<{ customerId?: string }>): string[] {
  const ids = items
    .map(item => item.customerId)
    .filter((id): id is string => !!id);
  return [...new Set(ids)];
}

// Batch fetch customers by IDs (Firestore limits 'in' to 30 items)
export async function getCustomersBatch(customerIds: string[]): Promise<Map<string, Customer>> {
  const customerMap = new Map<string, Customer>();
  if (customerIds.length === 0) return customerMap;

  // Firestore 'in' query limit is 30
  const chunks: string[][] = [];
  for (let i = 0; i < customerIds.length; i += 30) {
    chunks.push(customerIds.slice(i, i + 30));
  }

  for (const chunk of chunks) {
    const q = query(
      collection(db, 'customers'),
      where(documentId(), 'in', chunk)
    );
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(doc => {
      customerMap.set(doc.id, { id: doc.id, ...doc.data() } as Customer);
    });
  }

  return customerMap;
}

// Re-export getCustomer for convenience
export { getCustomer } from './db';
