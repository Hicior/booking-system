import { NextResponse } from 'next/server';
import { getReservationById, updateReservation, deleteReservation } from '@/lib/services';
import { UpdateReservationInput } from '@/lib/types';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const reservation = await getReservationById(id);
    if (!reservation) {
      return NextResponse.json(
        { error: 'Nie znaleziono rezerwacji' },
        { status: 404 }
      );
    }
    return NextResponse.json(reservation);
  } catch (error) {
    console.error('Error fetching reservation:', error);
    return NextResponse.json(
      { error: 'Nie udało się pobrać rezerwacji' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body: UpdateReservationInput = await request.json();
    
    const reservation = await updateReservation(id, body);
    return NextResponse.json(reservation);
  } catch (error) {
    console.error('Error updating reservation:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nie udało się zaktualizować rezerwacji' },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    const success = await deleteReservation(id);
    if (!success) {
      return NextResponse.json(
        { error: 'Nie znaleziono rezerwacji' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting reservation:', error);
    return NextResponse.json(
      { error: 'Nie udało się usunąć rezerwacji' },
      { status: 500 }
    );
  }
} 