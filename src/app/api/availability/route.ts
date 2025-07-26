import { NextResponse } from 'next/server';
import { checkTableAvailability } from '@/lib/services';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const tableId = searchParams.get('tableId');
    const date = searchParams.get('date');
    const time = searchParams.get('time');
    const durationHours = parseInt(searchParams.get('durationHours') || '2');
    const excludeReservationId = searchParams.get('excludeReservationId') || undefined;

    if (!tableId || !date || !time) {
      return NextResponse.json(
        { error: 'Brakuje wymaganych parametrów: tableId, date, time' },
        { status: 400 }
      );
    }

    const isAvailable = await checkTableAvailability(
      tableId,
      date,
      time,
      durationHours,
      excludeReservationId
    );

    return NextResponse.json({ isAvailable });
  } catch (error) {
    console.error('Error checking availability:', error);
    return NextResponse.json(
      { error: 'Nie udało się sprawdzić dostępności' },
      { status: 500 }
    );
  }
} 