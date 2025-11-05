import { 
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from './config';
import type { Customer } from './types';

/**
 * Batch customer loading - Get multiple customers by IDs using parallel queries
 * This solves the N+1 query problem by fetching all customers in parallel
 */
export async function getCustomersBatch(ids: string[]): Promise<Record<string, Customer>> {
  if (ids.length === 0) return {};

  const customerMap: Record<string, Customer> = {};
  
  // Remove duplicates
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  
  if (uniqueIds.length === 0) return {};

  // Fetch all customers in parallel using Promise.all
  try {
    const customerPromises = uniqueIds.map(async (id) => {
      try {
        const docRef = doc(db, 'customers', id);
        const snapshot = await getDoc(docRef);
        if (snapshot.exists()) {
          return { id: snapshot.id, ...snapshot.data() } as Customer;
        }
        return null;
      } catch (error) {
        console.warn(`Failed to load customer ${id}:`, error);
        return null;
      }
    });

    const customers = await Promise.all(customerPromises);
    
    customers.forEach((customer) => {
      if (customer) {
        customerMap[customer.id] = customer;
      }
    });
  } catch (error) {
    console.error('Batch customer loading error:', error);
  }

  return customerMap;
}

/**
 * Get a single customer by ID (re-export from db.ts for convenience)
 */
export async function getCustomer(id: string): Promise<Customer | null> {
  try {
    const docRef = doc(db, 'customers', id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as Customer;
  } catch (error) {
    console.error(`Error loading customer ${id}:`, error);
    return null;
  }
}

/**
 * Extract unique customer IDs from an array of objects that have customerId
 */
export function extractCustomerIds<T extends { customerId?: string }>(
  items: T[]
): string[] {
  const ids = new Set<string>();
  items.forEach((item) => {
    if (item.customerId) {
      ids.add(item.customerId);
    }
  });
  return Array.from(ids);
}

