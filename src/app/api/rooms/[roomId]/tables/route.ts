import { NextResponse } from 'next/server';
import { getTablesByRoom } from '@/lib/services';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ roomId: string }> }
) {
  try {
    const { roomId } = await params;
    const tables = await getTablesByRoom(roomId);
    return NextResponse.json(tables);
  } catch (error) {
    console.error('Error fetching tables:', error);
    return NextResponse.json(
      { error: 'Nie udało się pobrać stolików' },
      { status: 500 }
    );
  }
} 