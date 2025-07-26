import { NextResponse } from 'next/server';
import { getEmployeeById, updateEmployee, deleteEmployee } from '@/lib/services';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const employee = await getEmployeeById(id);
    if (!employee) {
      return NextResponse.json(
        { error: 'Nie znaleziono pracownika' },
        { status: 404 }
      );
    }
    return NextResponse.json(employee);
  } catch (error) {
    console.error('Error fetching employee:', error);
    return NextResponse.json(
      { error: 'Nie udało się pobrać pracownika' },
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
    const body = await request.json();
    const employee = await updateEmployee(id, body);
    return NextResponse.json(employee);
  } catch (error) {
    console.error('Error updating employee:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nie udało się zaktualizować pracownika' },
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
    const success = await deleteEmployee(id);
    if (!success) {
      return NextResponse.json(
        { error: 'Nie znaleziono pracownika' },
        { status: 404 }
      );
    }
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting employee:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nie udało się usunąć pracownika' },
      { status: 500 }
    );
  }
} 