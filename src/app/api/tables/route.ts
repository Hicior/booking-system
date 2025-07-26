import { NextResponse } from 'next/server';
import { getAllTablesWithRooms } from '@/lib/services';

export async function GET() {
  try {
    const tables = await getAllTablesWithRooms();
    return NextResponse.json(tables);
  } catch (error) {
    console.error('Error fetching all tables:', error);
    return NextResponse.json(
      { error: 'Nie udało się pobrać stolików' },
      { status: 500 }
    );
  }
} 