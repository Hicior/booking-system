import { NextResponse } from 'next/server';
import { cleanupOldActivityLogs } from '@/lib/services';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const monthsToKeep = body.monthsToKeep || 3;
    
    // Validate monthsToKeep
    if (monthsToKeep < 1 || monthsToKeep > 12) {
      return NextResponse.json(
        { error: 'Liczba miesięcy musi być między 1 a 12' },
        { status: 400 }
      );
    }

    const deletedCount = await cleanupOldActivityLogs(monthsToKeep);
    
    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Usunięto ${deletedCount} starych wpisów aktywności`
    });
  } catch (error) {
    console.error('Error cleaning up activity logs:', error);
    return NextResponse.json(
      { error: 'Nie udało się wyczyścić starych logów aktywności' },
      { status: 500 }
    );
  }
} 