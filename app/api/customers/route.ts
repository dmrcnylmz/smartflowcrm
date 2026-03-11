import { NextRequest, NextResponse } from 'next/server';
import { getAllCustomers, createCustomer, updateCustomer, addActivityLog, Timestamp } from '@/lib/firebase/admin-db';
import { handleApiError, requireFields, errorResponse, createApiError } from '@/lib/utils/error-handler';
import { requireStrictAuth } from '@/lib/utils/require-strict-auth';
import { cacheHeaders } from '@/lib/utils/cache-headers';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireStrictAuth(request);
    if (auth.error) return auth.error;

    const customers = await getAllCustomers(auth.tenantId);
    return NextResponse.json(customers, {
      headers: cacheHeaders('SHORT'),
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Customers GET');
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireStrictAuth(request);
    if (auth.error) return auth.error;

    const body = await request.json();

    const validation = requireFields(body, ['name', 'phone']);
    if (validation) return errorResponse(validation);

    const customerRef = await createCustomer(auth.tenantId, {
      name: body.name,
      phone: body.phone,
      email: body.email || '',
      notes: body.notes || '',
    });

    return NextResponse.json({ success: true, customerId: customerRef.id }, { status: 201 });
  } catch (error: unknown) {
    return handleApiError(error, 'Customers POST');
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireStrictAuth(request);
    if (auth.error) return auth.error;

    const body = await request.json();

    const validation = requireFields(body, ['customerId']);
    if (validation) return errorResponse(validation);

    // Build update object with only provided fields
    const updateData: Record<string, unknown> = {
      updatedAt: Timestamp.now(),
    };

    if (body.name !== undefined) updateData.name = body.name;
    if (body.email !== undefined) updateData.email = body.email;
    if (body.phone !== undefined) updateData.phone = body.phone;
    if (body.company !== undefined) updateData.company = body.company;
    if (body.notes !== undefined) updateData.notes = body.notes;
    if (body.tags !== undefined) updateData.tags = body.tags;
    if (body.status !== undefined) updateData.status = body.status;

    // Only updatedAt means no actual fields were provided
    if (Object.keys(updateData).length <= 1) {
      return errorResponse(createApiError(
        'VALIDATION_ERROR',
        'En az bir güncellenecek alan gerekli',
      ));
    }

    await updateCustomer(auth.tenantId, body.customerId, updateData);

    // Log activity
    await addActivityLog(auth.tenantId, {
      type: 'customer_updated',
      description: `Müşteri güncellendi: ${body.customerId}`,
      customerId: body.customerId,
      changes: Object.keys(updateData).filter(k => k !== 'updatedAt'),
      updatedBy: auth.uid || 'unknown',
    });

    return NextResponse.json({
      success: true,
      customerId: body.customerId,
      updatedFields: Object.keys(updateData).filter(k => k !== 'updatedAt'),
    });
  } catch (error: unknown) {
    return handleApiError(error, 'Customers PATCH');
  }
}

// =============================================
// DELETE: Soft-delete a customer (marks as deleted)
// =============================================

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireStrictAuth(request);
    if (auth.error) return auth.error;

    const { searchParams } = new URL(request.url);
    const customerId = searchParams.get('id');

    if (!customerId) {
      return errorResponse(createApiError('VALIDATION_ERROR', 'Müşteri ID gerekli'));
    }

    const { initAdmin } = await import('@/lib/auth/firebase-admin');
    const { getFirestore, FieldValue } = await import('firebase-admin/firestore');
    const app = initAdmin();
    const db = getFirestore(app);

    const customerRef = db.collection('tenants').doc(auth.tenantId)
      .collection('customers').doc(customerId);
    const customerDoc = await customerRef.get();

    if (!customerDoc.exists) {
      return errorResponse(createApiError('NOT_FOUND', 'Müşteri bulunamadı'));
    }

    // Soft-delete: mark as deleted rather than removing data
    await customerRef.update({
      status: 'deleted',
      deletedAt: FieldValue.serverTimestamp(),
      deletedBy: auth.uid,
    });

    await addActivityLog(auth.tenantId, {
      type: 'customer_deleted',
      description: `Müşteri silindi: ${customerDoc.data()?.name || customerId}`,
      customerId,
      updatedBy: auth.uid || 'unknown',
    });

    return NextResponse.json({ success: true, customerId });
  } catch (error: unknown) {
    return handleApiError(error, 'Customers DELETE');
  }
}
