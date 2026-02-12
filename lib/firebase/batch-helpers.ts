import {
  doc,
  getDoc
} from 'firebase/firestore';
import { db } from './config';
import type { Customer } from './types';
import { demoDb } from './demo-data';

// Track if we're in demo mode
let useDemoMode = false;

/**
 * Batch customer loading - Get multiple customers by IDs using parallel queries
 * This solves the N+1 query problem by fetching all customers in parallel
 * Falls back to demo data on Firebase permission errors
 */
export async function getCustomersBatch(ids: string[]): Promise<Record<string, Customer>> {
  if (ids.length === 0) return {};

  const customerMap: Record<string, Customer> = {};

  // Remove duplicates
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

  if (uniqueIds.length === 0) return {};

  // If we're in demo mode, use demo data
  if (useDemoMode) {
    const demoCustomerMap = demoDb.getCustomerMap();
    uniqueIds.forEach(id => {
      if (demoCustomerMap[id]) {
        customerMap[id] = demoCustomerMap[id];
      }
    });
    return customerMap;
  }

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
      } catch (error: any) {
        // Check for permission error
        if (error?.message?.includes('permission') || error?.code === 'permission-denied') {
          console.warn('📋 Firebase permission error, switching to demo mode');
          useDemoMode = true;
          // Return demo customer if available
          const demoCustomer = demoDb.getCustomerMap()[id];
          return demoCustomer || null;
        }
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
  } catch (error: any) {
    console.error('Batch customer loading error:', error);
    // Fallback to demo data on any error
    if (error?.message?.includes('permission') || error?.code === 'permission-denied') {
      useDemoMode = true;
      return demoDb.getCustomerMap();
    }
  }

  return customerMap;
}

/**
 * Get a single customer by ID
 * Falls back to demo data on Firebase permission errors
 */
export async function getCustomer(id: string): Promise<Customer | null> {
  // If we're in demo mode, use demo data
  if (useDemoMode) {
    return demoDb.getCustomer(id);
  }

  try {
    const docRef = doc(db, 'customers', id);
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    return { id: snapshot.id, ...snapshot.data() } as Customer;
  } catch (error: any) {
    console.error(`Error loading customer ${id}:`, error);
    // Fallback to demo data
    if (error?.message?.includes('permission') || error?.code === 'permission-denied') {
      useDemoMode = true;
      return demoDb.getCustomer(id);
    }
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
