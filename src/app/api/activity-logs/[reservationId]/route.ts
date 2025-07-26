import { NextResponse } from 'next/server';
import { getActivityLogsByReservationId } from '@/lib/services';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ reservationId: string }> }
) {
  try {
    const { reservationId } = await params;
    const activityLogs = await getActivityLogsByReservationId(reservationId);
    return NextResponse.json(activityLogs);
  } catch (error) {
    console.error('Error fetching activity logs for reservation:', error);
    return NextResponse.json(
      { error: 'Nie udało się pobrać logów aktywności dla rezerwacji' },
      { status: 500 }
    );
  }
} 