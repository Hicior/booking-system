import { NextResponse } from 'next/server';
import { getReservations, createReservation } from '@/lib/services';
import { CreateReservationInput } from '@/lib/types';
import { createRequestLogger, timeOperation, logError } from '@/lib/logger';

export async function GET(request: Request) {
  const logger = createRequestLogger(request);
  const { searchParams } = new URL(request.url);
  
  const filters = {
    reservation_date: searchParams.get('reservation_date') || undefined,
    room_id: searchParams.get('room_id') || undefined,
    status: searchParams.get('status') || undefined,
    guest_name: searchParams.get('guest_name') || undefined,
    guest_phone: searchParams.get('guest_phone') || undefined,
    created_by: searchParams.get('created_by') || undefined,
  };

  // Remove undefined values
  const cleanFilters = Object.fromEntries(
    Object.entries(filters).filter(([_, value]) => value !== undefined)
  );
  
  return timeOperation(logger, 'get_reservations', async () => {
    logger.debug({ filters: cleanFilters }, 'Fetching reservations with filters');

    const reservations = await getReservations(cleanFilters);
    
    logger.info({ 
      filter_count: Object.keys(cleanFilters).length,
      result_count: reservations.length 
    }, 'Reservations fetched successfully');
    
    return NextResponse.json(reservations);
  }).catch((error) => {
    logError(logger, error, { 
      context: 'get_reservations_failed',
      filters: cleanFilters
    });
    
    return NextResponse.json(
      { error: 'Nie udało się pobrać rezerwacji' },
      { status: 500 }
    );
  });
}

export async function POST(request: Request) {
  const logger = createRequestLogger(request);
  
  return timeOperation(logger, 'create_reservation', async () => {
    const body: CreateReservationInput = await request.json();
    
    logger.debug({ 
      guest_name: body.guest_name,
      guest_phone: body.guest_phone,
      reservation_date: body.reservation_date,
      table_id: body.table_id,
      party_size: body.party_size
    }, 'Creating new reservation');

    const reservation = await createReservation(body);
    
    logger.info({ 
      reservation_id: reservation.id,
      guest_name: reservation.guest_name,
      table_id: reservation.table_id 
    }, 'Reservation created successfully');
    
    return NextResponse.json(reservation, { status: 201 });
  }).catch((error) => {
    logError(logger, error, { 
      context: 'create_reservation_failed',
      request_body: request.body ? 'present' : 'missing'
    });
    
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nie udało się utworzyć rezerwacji' },
      { status: 500 }
    );
  });
} 