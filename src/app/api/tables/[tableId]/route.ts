import { NextResponse } from 'next/server';
import { updateTablePosition, updateTableProperties } from '@/lib/services';

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ tableId: string }> }
) {
  try {
    const { tableId } = await params;
    const body = await request.json();
    
    // Check if this is a position update request
    if ('position_x' in body && 'position_y' in body) {
      const { position_x, position_y } = body;

      // Validate input
      if (typeof position_x !== 'number' || typeof position_y !== 'number') {
        return NextResponse.json(
          { error: 'Nieprawidłowe wartości pozycji' },
          { status: 400 }
        );
      }

      await updateTablePosition(tableId, position_x, position_y);
      
      return NextResponse.json({ 
        success: true,
        message: 'Pozycja stolika została pomyślnie zaktualizowana' 
      });
    }
    
    // Check if this is a properties update request
    if ('shape' in body && 'max_capacity' in body) {
      const { shape, max_capacity, size_scale, width_ratio, height_ratio, orientation } = body;

      // Validate input
      if (typeof shape !== 'string' || typeof max_capacity !== 'number') {
        return NextResponse.json(
          { error: 'Nieprawidłowe wartości kształtu lub pojemności' },
          { status: 400 }
        );
      }

      // Validate size properties if provided
      if (size_scale !== undefined && (typeof size_scale !== 'number' || size_scale <= 0 || size_scale > 3.0)) {
        return NextResponse.json(
          { error: 'Nieprawidłowa skala rozmiaru. Musi być liczbą między 0 a 3.0' },
          { status: 400 }
        );
      }

      if (width_ratio !== undefined && (typeof width_ratio !== 'number' || width_ratio <= 0 || width_ratio > 3.0)) {
        return NextResponse.json(
          { error: 'Nieprawidłowy stosunek szerokości. Musi być liczbą między 0 a 3.0' },
          { status: 400 }
        );
      }

      if (height_ratio !== undefined && (typeof height_ratio !== 'number' || height_ratio <= 0 || height_ratio > 3.0)) {
        return NextResponse.json(
          { error: 'Nieprawidłowy stosunek wysokości. Musi być liczbą między 0 a 3.0' },
          { status: 400 }
        );
      }

      if (orientation !== undefined && !['horizontal', 'vertical'].includes(orientation)) {
        return NextResponse.json(
          { error: 'Nieprawidłowa orientacja. Musi być "horizontal" lub "vertical"' },
          { status: 400 }
        );
      }

      await updateTableProperties(tableId, shape, max_capacity, size_scale, width_ratio, height_ratio, orientation);
      
      return NextResponse.json({ 
        success: true,
        message: 'Właściwości stolika zostały pomyślnie zaktualizowane' 
      });
    }
    
    return NextResponse.json(
      { error: 'Nieprawidłowe dane żądania' },
      { status: 400 }
    );
  } catch (error) {
    console.error('Error updating table:', error);
    return NextResponse.json(
      { error: 'Nie udało się zaktualizować stolika' },
      { status: 500 }
    );
  }
} 