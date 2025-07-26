import { NextResponse } from 'next/server';
import { autoCompleteExpiredReservations } from '@/lib/services';

export async function POST() {
  try {
    const completedCount = await autoCompleteExpiredReservations();
    
    return NextResponse.json({
      success: true,
      completedCount,
      message: `Auto-completed ${completedCount} expired reservations`
    });
  } catch (error) {
    console.error('Error auto-completing expired reservations:', error);
    return NextResponse.json(
      { error: 'Nie udało się automatycznie zakończyć wygasłych rezerwacji' },
      { status: 500 }
    );
  }
} 