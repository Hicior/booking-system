import { NextResponse } from 'next/server';
import { getRooms } from '@/lib/services';

export async function GET() {
  try {
    const rooms = await getRooms();
    return NextResponse.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    return NextResponse.json(
      { error: 'Nie udało się pobrać sal' },
      { status: 500 }
    );
  }
} 