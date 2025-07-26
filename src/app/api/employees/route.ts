import { NextResponse } from 'next/server';
import { getEmployees, getAllEmployees, createEmployee } from '@/lib/services';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const includeInactive = searchParams.get('include_inactive') === 'true';
    
    const employees = includeInactive ? await getAllEmployees() : await getEmployees();
    return NextResponse.json(employees);
  } catch (error) {
    console.error('Error fetching employees:', error);
    return NextResponse.json(
      { error: 'Nie udało się pobrać listy pracowników' },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employee = await createEmployee(body);
    return NextResponse.json(employee, { status: 201 });
  } catch (error) {
    console.error('Error creating employee:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Nie udało się utworzyć pracownika' },
      { status: 500 }
    );
  }
} 