import {
  Room,
  Table,
  Reservation,
  Employee,
  CreateEmployeeInput,
  UpdateEmployeeInput,
  TableWithRoom,
  ReservationWithTableAndRoom,
  CreateReservationInput,
  UpdateReservationInput,
  ReservationFilters,
  TableAvailability,
  RoomAvailability,
  ReservationActivityLog,
  ActivityLogWithReservation,
  CreateActivityLogInput,
  ActivityLogFilters,
  ActivityLogSummary,
  ReservationWithActivity,
} from "./types";
import { query, queryOne, transaction } from "./database";
import { createServiceLogger, timeOperation, logError } from "./logger";

// Employee Services
export async function getEmployees(): Promise<Employee[]> {
  return await query<Employee>(
    "SELECT * FROM employees WHERE is_active = true ORDER BY display_name"
  );
}

export async function getAllEmployees(): Promise<Employee[]> {
  return await query<Employee>(
    "SELECT * FROM employees ORDER BY is_active DESC, display_name"
  );
}

export async function getEmployeeById(id: string): Promise<Employee | null> {
  const employees = await query<Employee>(
    "SELECT * FROM employees WHERE id = $1",
    [id]
  );
  return employees[0] || null;
}

export async function createEmployee(data: CreateEmployeeInput): Promise<Employee> {
  const logger = createServiceLogger('employee', 'create');
  
  return timeOperation(logger, 'create_employee', async () => {
    logger.debug({
      first_name: data.first_name,
      last_name: data.last_name,
      display_name: data.display_name,
      employee_code: data.employee_code,
      is_active: data.is_active
    }, 'Creating new employee');

    // Validate required fields
    if (!data.first_name?.trim()) {
      throw new Error("Imię jest wymagane");
    }
    if (!data.last_name?.trim()) {
      throw new Error("Nazwisko jest wymagane");
    }
    if (!data.display_name?.trim()) {
      throw new Error("Nazwa wyświetlana jest wymagana");
    }

    // Check if display name is unique
    const existingByDisplayName = await query<Employee>(
      "SELECT id FROM employees WHERE LOWER(display_name) = LOWER($1)",
      [data.display_name]
    );
    if (existingByDisplayName.length > 0) {
      logger.warn({ display_name: data.display_name }, 'Attempted to create employee with duplicate display name');
      throw new Error("Nazwa wyświetlana musi być unikalna");
    }

    // Check if employee code is unique (if provided)
    if (data.employee_code?.trim()) {
      const existingByCode = await query<Employee>(
        "SELECT id FROM employees WHERE employee_code = $1",
        [data.employee_code]
      );
      if (existingByCode.length > 0) {
        logger.warn({ employee_code: data.employee_code }, 'Attempted to create employee with duplicate code');
        throw new Error("Kod pracownika musi być unikalny");
      }
    }

    const employees = await query<Employee>(
      `INSERT INTO employees (first_name, last_name, display_name, employee_code, is_active)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        data.first_name.trim(),
        data.last_name.trim(),
        data.display_name.trim(),
        data.employee_code?.trim() || null,
        data.is_active !== false, // Default to true if not specified
      ]
    );

    if (employees.length === 0) {
      throw new Error("Nie udało się utworzyć pracownika");
    }

    const newEmployee = employees[0];
    logger.info({
      employee_id: newEmployee.id,
      display_name: newEmployee.display_name,
      employee_code: newEmployee.employee_code
    }, 'Employee created successfully');

    return newEmployee;
  });
}

export async function updateEmployee(id: string, data: UpdateEmployeeInput): Promise<Employee> {
  // Check if employee exists
  const existingEmployee = await getEmployeeById(id);
  if (!existingEmployee) {
    throw new Error("Nie znaleziono pracownika");
  }

  // Validate required fields if provided
  if (data.first_name !== undefined && !data.first_name?.trim()) {
    throw new Error("Imię nie może być puste");
  }
  if (data.last_name !== undefined && !data.last_name?.trim()) {
    throw new Error("Nazwisko nie może być puste");
  }
  if (data.display_name !== undefined && !data.display_name?.trim()) {
    throw new Error("Nazwa wyświetlana nie może być pusta");
  }

  // Check if display name is unique (excluding current employee)
  if (data.display_name?.trim()) {
    const existingByDisplayName = await query<Employee>(
      "SELECT id FROM employees WHERE LOWER(display_name) = LOWER($1) AND id != $2",
      [data.display_name, id]
    );
    if (existingByDisplayName.length > 0) {
      throw new Error("Nazwa wyświetlana musi być unikalna");
    }
  }

  // Check if employee code is unique (if provided and different from current)
  if (data.employee_code?.trim()) {
    const existingByCode = await query<Employee>(
      "SELECT id FROM employees WHERE employee_code = $1 AND id != $2",
      [data.employee_code, id]
    );
    if (existingByCode.length > 0) {
      throw new Error("Kod pracownika musi być unikalny");
    }
  }

  // Build update query dynamically
  const updateFields: string[] = [];
  const updateValues: any[] = [];
  let paramCount = 1;

  if (data.first_name !== undefined) {
    updateFields.push(`first_name = $${paramCount++}`);
    updateValues.push(data.first_name.trim());
  }
  if (data.last_name !== undefined) {
    updateFields.push(`last_name = $${paramCount++}`);
    updateValues.push(data.last_name.trim());
  }
  if (data.display_name !== undefined) {
    updateFields.push(`display_name = $${paramCount++}`);
    updateValues.push(data.display_name.trim());
  }
  if (data.employee_code !== undefined) {
    updateFields.push(`employee_code = $${paramCount++}`);
    updateValues.push(data.employee_code?.trim() || null);
  }
  if (data.is_active !== undefined) {
    updateFields.push(`is_active = $${paramCount++}`);
    updateValues.push(data.is_active);
  }

  if (updateFields.length === 0) {
    return existingEmployee; // No changes to make
  }

  updateFields.push(`updated_at = CURRENT_TIMESTAMP`);
  updateValues.push(id);

  const employees = await query<Employee>(
    `UPDATE employees SET ${updateFields.join(", ")} WHERE id = $${paramCount} RETURNING *`,
    updateValues
  );

  if (employees.length === 0) {
    throw new Error("Nie udało się zaktualizować pracownika");
  }

  return employees[0];
}

export async function deleteEmployee(id: string): Promise<boolean> {
  // Check if employee exists
  const existingEmployee = await getEmployeeById(id);
  if (!existingEmployee) {
    return false;
  }

  // Check if employee is used in any reservations (active, completed, or cancelled)
  const reservationsCount = await query<{ count: number }>(
    "SELECT COUNT(*) as count FROM reservations WHERE created_by = $1",
    [existingEmployee.display_name]
  );

  if (reservationsCount[0]?.count > 0) {
    throw new Error(
      `Nie można usunąć pracownika "${existingEmployee.display_name}", ponieważ ma przypisane ${reservationsCount[0].count} rezerwacji. Dezaktywuj pracownika zamiast go usuwać.`
    );
  }

  // Check if employee is referenced in activity logs
  const activityLogsCount = await query<{ count: number }>(
    "SELECT COUNT(*) as count FROM reservation_activity_logs WHERE performed_by = $1",
    [existingEmployee.display_name]
  );

  if (activityLogsCount[0]?.count > 0) {
    throw new Error(
      `Nie można usunąć pracownika "${existingEmployee.display_name}", ponieważ ma ${activityLogsCount[0].count} wpisów w logach aktywności. Dezaktywuj pracownika zamiast go usuwać.`
    );
  }

  // If no dependencies, proceed with deletion
  await query(
    "DELETE FROM employees WHERE id = $1",
    [id]
  );

  return true;
}

// Room Services
export async function getRooms(): Promise<Room[]> {
  return await query<Room>(
    "SELECT * FROM rooms WHERE is_active = true ORDER BY name"
  );
}

export async function getRoomById(id: string): Promise<Room | null> {
  return await queryOne<Room>(
    "SELECT * FROM rooms WHERE id = $1 AND is_active = true",
    [id]
  );
}

// Table Services
export async function getTablesByRoom(roomId: string): Promise<Table[]> {
  return await query<Table>(
    "SELECT * FROM tables WHERE room_id = $1 AND is_active = true ORDER BY table_number",
    [roomId]
  );
}

export async function getTableById(id: string): Promise<TableWithRoom | null> {
  return await queryOne<TableWithRoom>(
    `
    SELECT t.*, r.name as room_name, r.description as room_description,
           r.is_active as room_is_active, r.created_at as room_created_at,
           r.updated_at as room_updated_at
    FROM tables t
    JOIN rooms r ON t.room_id = r.id
    WHERE t.id = $1 AND t.is_active = true
  `,
    [id]
  );
}

export async function updateTablePosition(
  id: string,
  position_x: number,
  position_y: number
): Promise<Table> {
  const result = await queryOne<Table>(
    `
    UPDATE tables 
    SET position_x = $1, position_y = $2, updated_at = CURRENT_TIMESTAMP
    WHERE id = $3 AND is_active = true
    RETURNING *
  `,
    [position_x, position_y, id]
  );

  if (!result) {
    throw new Error("Table not found or update failed");
  }

  return result;
}

export async function updateTableProperties(
  id: string,
  shape: string,
  max_capacity: number,
  size_scale?: number,
  width_ratio?: number,
  height_ratio?: number,
  orientation?: "horizontal" | "vertical"
): Promise<Table> {
  // Validate shape
  const validShapes = ["square", "circle", "rectangle"];
  if (!validShapes.includes(shape)) {
    throw new Error(
      "Invalid table shape. Must be one of: square, circle, rectangle"
    );
  }

  // Validate capacity
  if (max_capacity < 1 || max_capacity > 20) {
    throw new Error("Invalid capacity. Must be between 1 and 20");
  }

  // Validate size properties
  if (size_scale !== undefined && (size_scale <= 0 || size_scale > 3.0)) {
    throw new Error("Invalid size scale. Must be between 0 and 3.0");
  }

  if (width_ratio !== undefined && (width_ratio <= 0 || width_ratio > 3.0)) {
    throw new Error("Invalid width ratio. Must be between 0 and 3.0");
  }

  if (height_ratio !== undefined && (height_ratio <= 0 || height_ratio > 3.0)) {
    throw new Error("Invalid height ratio. Must be between 0 and 3.0");
  }

  if (
    orientation !== undefined &&
    !["horizontal", "vertical"].includes(orientation)
  ) {
    throw new Error('Invalid orientation. Must be "horizontal" or "vertical"');
  }

  // Build dynamic query based on provided parameters
  const fields = [
    "shape = $1",
    "max_capacity = $2",
    "updated_at = CURRENT_TIMESTAMP",
  ];
  const values = [shape, max_capacity];
  let paramIndex = 3;

  if (size_scale !== undefined) {
    fields.push(`size_scale = $${paramIndex++}`);
    values.push(size_scale);
  }

  if (width_ratio !== undefined) {
    fields.push(`width_ratio = $${paramIndex++}`);
    values.push(width_ratio);
  }

  if (height_ratio !== undefined) {
    fields.push(`height_ratio = $${paramIndex++}`);
    values.push(height_ratio);
  }

  if (orientation !== undefined) {
    fields.push(`orientation = $${paramIndex++}`);
    values.push(orientation);
  }

  values.push(id); // table id

  const result = await queryOne<Table>(
    `
    UPDATE tables 
    SET ${fields.join(", ")}
    WHERE id = $${paramIndex} AND is_active = true
    RETURNING *
  `,
    values
  );

  if (!result) {
    throw new Error("Table not found or update failed");
  }

  return result;
}

export async function getAllTablesWithRooms(): Promise<Table[]> {
  return await query<Table>(`
    SELECT t.*
    FROM tables t
    JOIN rooms r ON t.room_id = r.id
    WHERE t.is_active = true AND r.is_active = true
    ORDER BY r.name, t.table_number
  `);
}

// Reservation Services
export async function createReservation(
  data: CreateReservationInput
): Promise<Reservation> {
  const logger = createServiceLogger('reservation', 'create');
  
  return timeOperation(logger, 'create_reservation', async () => {
    logger.debug({
      table_id: data.table_id,
      guest_name: data.guest_name,
      guest_phone: data.guest_phone,
      party_size: data.party_size,
      reservation_date: data.reservation_date,
      reservation_time: data.reservation_time,
      duration_hours: data.duration_hours || 2,
      created_by: data.created_by
    }, 'Creating new reservation');

    const result = await queryOne<Reservation>(
      `
      INSERT INTO reservations (
        table_id, guest_name, guest_phone, party_size, 
        reservation_date, reservation_time, duration_hours, notes, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *
    `,
      [
        data.table_id,
        data.guest_name,
        data.guest_phone,
        data.party_size,
        data.reservation_date,
        data.reservation_time,
        data.duration_hours || 2,
        data.notes,
        data.created_by,
      ]
    );

    if (!result) {
      throw new Error("Failed to create reservation");
    }

    logger.info({
      reservation_id: result.id,
      table_id: result.table_id,
      guest_name: result.guest_name,
      reservation_date: result.reservation_date,
      reservation_time: result.reservation_time
    }, 'Reservation created successfully');

    return result;
  });
}

export async function updateReservation(
  id: string,
  data: UpdateReservationInput & { complete_now?: boolean }
): Promise<Reservation> {
  // Get the current reservation for activity logging
  const currentReservation = await getReservationById(id);
  if (!currentReservation) {
    throw new Error("Reservation not found");
  }

  // If completing an indefinite reservation, calculate actual duration
  if (data.complete_now && data.status === 'completed') {
    // Only calculate if it's an indefinite reservation
    if (Number(currentReservation.duration_hours) === -1) {
      const now = new Date();
      const [startHours, startMinutes] = currentReservation.reservation_time.split(':').map(Number);
      
      // Parse reservation date safely - handle both string and Date inputs
      const resDateString = typeof currentReservation.reservation_date === 'string' 
        ? currentReservation.reservation_date 
        : currentReservation.reservation_date.toISOString().split('T')[0];
      
      // Create start time using the reservation date
      const startTime = new Date(resDateString + 'T00:00:00');
      startTime.setHours(startHours, startMinutes, 0, 0);
      
      // Calculate duration in milliseconds
      const durationMs = now.getTime() - startTime.getTime();
      
      // Ensure positive duration (reservation must have started)
      if (durationMs <= 0) {
        throw new Error("Cannot complete a reservation that hasn't started yet");
      }
      
      // Convert to decimal hours (e.g., 2h 30min = 2.5h)
      const actualDuration = durationMs / (1000 * 60 * 60);
      
      // Update duration_hours with the calculated value
      data.duration_hours = Math.max(0.1, Math.round(actualDuration * 10) / 10); // Round to 1 decimal place, minimum 6 minutes (0.1h)
    }
  }

  const fields = [];
  const values = [];
  let paramIndex = 1;

  if (data.table_id !== undefined) {
    fields.push(`table_id = $${paramIndex++}`);
    values.push(data.table_id);
  }
  if (data.guest_name !== undefined) {
    fields.push(`guest_name = $${paramIndex++}`);
    values.push(data.guest_name);
  }
  if (data.guest_phone !== undefined) {
    fields.push(`guest_phone = $${paramIndex++}`);
    values.push(data.guest_phone);
  }
  if (data.party_size !== undefined) {
    fields.push(`party_size = $${paramIndex++}`);
    values.push(data.party_size);
  }
  if (data.reservation_date !== undefined) {
    fields.push(`reservation_date = $${paramIndex++}`);
    values.push(data.reservation_date);
  }
  if (data.reservation_time !== undefined) {
    fields.push(`reservation_time = $${paramIndex++}`);
    values.push(data.reservation_time);
  }
  if (data.duration_hours !== undefined) {
    fields.push(`duration_hours = $${paramIndex++}`);
    values.push(data.duration_hours);
  }
  if (data.notes !== undefined) {
    fields.push(`notes = $${paramIndex++}`);
    values.push(data.notes);
  }
  if (data.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(data.status);
  }

  if (fields.length === 0) {
    throw new Error("No fields to update");
  }

  values.push(id);
  const result = await queryOne<Reservation>(
    `
    UPDATE reservations 
    SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
    WHERE id = $${paramIndex}
    RETURNING *
  `,
    values
  );

  if (!result) {
    throw new Error("Reservation not found");
  }

  // Create activity log for the update
  try {
    const fieldChanges = calculateFieldChanges(currentReservation, data);
    
    // Only create activity log if there are actual changes (excluding performed_by and complete_now)
    if (Object.keys(fieldChanges).length > 0) {
      await createActivityLog({
        reservation_id: id,
        action_type: data.status === 'cancelled' ? 'cancelled' : 'updated',
        performed_by: data.performed_by,
        field_changes: fieldChanges,
        reservation_snapshot: {
          id: result.id,
          table_id: result.table_id,
          guest_name: result.guest_name,
          guest_phone: result.guest_phone,
          party_size: result.party_size,
          reservation_date: typeof result.reservation_date === 'string' 
            ? result.reservation_date 
            : result.reservation_date.toISOString().split('T')[0],
          reservation_time: result.reservation_time,
          duration_hours: result.duration_hours,
          notes: result.notes,
          status: result.status,
          created_by: result.created_by
        }
      });
    }
  } catch (activityLogError) {
    // Log the error but don't fail the reservation update
    console.error('Failed to create activity log:', activityLogError);
  }

  return result;
}

// Helper function to calculate field changes for activity logging
function calculateFieldChanges(
  currentReservation: ReservationWithTableAndRoom,
  updateData: UpdateReservationInput
): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {};
  
  // Helper function to format date consistently
  const formatDate = (date: Date | string): string => {
    if (typeof date === 'string') {
      return date.split('T')[0]; // Handle both YYYY-MM-DD and YYYY-MM-DDTHH:mm:ss formats
    }
    return date.toISOString().split('T')[0];
  };

  // Check each field that can be updated
  if (updateData.table_id !== undefined && updateData.table_id !== currentReservation.table_id) {
    changes.table_id = {
      old: currentReservation.table_id,
      new: updateData.table_id
    };
  }

  if (updateData.guest_name !== undefined && updateData.guest_name !== currentReservation.guest_name) {
    changes.guest_name = {
      old: currentReservation.guest_name,
      new: updateData.guest_name
    };
  }

  if (updateData.guest_phone !== undefined && updateData.guest_phone !== (currentReservation.guest_phone || '')) {
    changes.guest_phone = {
      old: currentReservation.guest_phone || '',
      new: updateData.guest_phone
    };
  }

  if (updateData.party_size !== undefined && updateData.party_size !== currentReservation.party_size) {
    changes.party_size = {
      old: currentReservation.party_size,
      new: updateData.party_size
    };
  }

  if (updateData.reservation_date !== undefined) {
    const newDate = typeof updateData.reservation_date === 'string' 
      ? updateData.reservation_date.split('T')[0]
      : updateData.reservation_date.toISOString().split('T')[0];
    const currentDate = formatDate(currentReservation.reservation_date);
    
    if (newDate !== currentDate) {
      changes.reservation_date = {
        old: currentDate,
        new: newDate
      };
    }
  }

  if (updateData.reservation_time !== undefined && updateData.reservation_time !== currentReservation.reservation_time) {
    changes.reservation_time = {
      old: currentReservation.reservation_time,
      new: updateData.reservation_time
    };
  }

  if (updateData.duration_hours !== undefined && updateData.duration_hours !== currentReservation.duration_hours) {
    changes.duration_hours = {
      old: currentReservation.duration_hours,
      new: updateData.duration_hours
    };
  }

  if (updateData.notes !== undefined && updateData.notes !== (currentReservation.notes || '')) {
    changes.notes = {
      old: currentReservation.notes || '',
      new: updateData.notes
    };
  }

  if (updateData.status !== undefined && updateData.status !== currentReservation.status) {
    changes.status = {
      old: currentReservation.status,
      new: updateData.status
    };
  }

  return changes;
}

export async function getReservationById(
  id: string
): Promise<ReservationWithTableAndRoom | null> {
  const row = await queryOne<any>(
    `
    SELECT r.*,
           t.id as table_id, t.table_number, t.max_capacity, t.shape, 
           t.position_x, t.position_y, t.is_active as table_is_active,
           t.created_at as table_created_at, t.updated_at as table_updated_at,
           t.room_id as table_room_id,
           rm.id as room_id, rm.name as room_name, rm.description as room_description,
           rm.is_active as room_is_active, rm.created_at as room_created_at,
           rm.updated_at as room_updated_at
    FROM reservations r
    JOIN tables t ON r.table_id = t.id
    JOIN rooms rm ON t.room_id = rm.id
    WHERE r.id = $1
  `,
    [id]
  );

  if (!row) return null;

  // Helper function to format date safely without timezone issues
  const formatDateSafely = (date: Date): string => {
    if (!date) return '';
    // Extract year, month, day directly from the Date object to avoid timezone conversion
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Map flat SQL result to nested object structure
  return {
    id: row.id,
    table_id: row.table_id,
    guest_name: row.guest_name,
    guest_phone: row.guest_phone,
    party_size: row.party_size,
    reservation_date: formatDateSafely(row.reservation_date),
    reservation_time: row.reservation_time,
    duration_hours: row.duration_hours,
    notes: row.notes,
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    table: {
      id: row.table_id,
      room_id: row.table_room_id,
      table_number: row.table_number,
      max_capacity: row.max_capacity,
      shape: row.shape,
      position_x: row.position_x,
      position_y: row.position_y,
      is_active: row.table_is_active,
      created_at: row.table_created_at,
      updated_at: row.table_updated_at,
      room: {
        id: row.room_id,
        name: row.room_name,
        description: row.room_description,
        is_active: row.room_is_active,
        created_at: row.room_created_at,
        updated_at: row.room_updated_at,
      },
    },
  };
}

export async function getReservations(
  filters: ReservationFilters = {}
): Promise<ReservationWithTableAndRoom[]> {
  let whereConditions = ["r.status = 'active'"];
  const values = [];
  let paramIndex = 1;

  if (filters.room_id) {
    whereConditions.push(`rm.id = $${paramIndex++}`);
    values.push(filters.room_id);
  }
  if (filters.table_id) {
    whereConditions.push(`r.table_id = $${paramIndex++}`);
    values.push(filters.table_id);
  }
  if (filters.reservation_date) {
    whereConditions.push(`r.reservation_date = $${paramIndex++}`);
    values.push(filters.reservation_date);
  }
  if (filters.reservation_time) {
    whereConditions.push(`r.reservation_time = $${paramIndex++}`);
    values.push(filters.reservation_time);
  }
  if (filters.guest_name) {
    whereConditions.push(`r.guest_name ILIKE $${paramIndex++}`);
    values.push(`%${filters.guest_name}%`);
  }
  if (filters.guest_phone) {
    whereConditions.push(`r.guest_phone ILIKE $${paramIndex++}`);
    values.push(`%${filters.guest_phone}%`);
  }
  if (filters.created_by) {
    whereConditions.push(`r.created_by = $${paramIndex++}`);
    values.push(filters.created_by);
  }
  if (filters.status) {
    if (filters.status === 'all') {
      // Remove the default status filter to get all reservations
      whereConditions = whereConditions.filter(
        (condition) => !condition.includes("r.status = 'active'")
      );
    } else {
      // Remove the default status filter if a specific status is requested
      whereConditions = whereConditions.filter(
        (condition) => !condition.includes("r.status = 'active'")
      );
      whereConditions.push(`r.status = $${paramIndex++}`);
      values.push(filters.status);
    }
  }

  const rows = await query<any>(
    `
    SELECT r.*,
           t.id as table_id, t.table_number, t.max_capacity, t.shape, 
           t.position_x, t.position_y, t.is_active as table_is_active,
           t.created_at as table_created_at, t.updated_at as table_updated_at,
           t.room_id as table_room_id,
           rm.id as room_id, rm.name as room_name, rm.description as room_description,
           rm.is_active as room_is_active, rm.created_at as room_created_at,
           rm.updated_at as room_updated_at
    FROM reservations r
    JOIN tables t ON r.table_id = t.id
    JOIN rooms rm ON t.room_id = rm.id
    WHERE ${whereConditions.join(" AND ")}
    ORDER BY r.reservation_date DESC, r.reservation_time ASC, rm.name, t.table_number
  `,
    values
  );

  // Helper function to format date safely without timezone issues
  const formatDateSafely = (date: Date): string => {
    if (!date) return '';
    // Extract year, month, day directly from the Date object to avoid timezone conversion
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Map flat SQL results to nested object structure
  return rows.map((row) => ({
    id: row.id,
    table_id: row.table_id,
    guest_name: row.guest_name,
    guest_phone: row.guest_phone,
    party_size: row.party_size,
    reservation_date: formatDateSafely(row.reservation_date),
    reservation_time: row.reservation_time,
    duration_hours: row.duration_hours,
    notes: row.notes,
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    table: {
      id: row.table_id,
      room_id: row.table_room_id,
      table_number: row.table_number,
      max_capacity: row.max_capacity,
      shape: row.shape,
      position_x: row.position_x,
      position_y: row.position_y,
      is_active: row.table_is_active,
      created_at: row.table_created_at,
      updated_at: row.table_updated_at,
      room: {
        id: row.room_id,
        name: row.room_name,
        description: row.room_description,
        is_active: row.room_is_active,
        created_at: row.room_created_at,
        updated_at: row.room_updated_at,
      },
    },
  }));
}

export async function deleteReservation(id: string, performed_by?: string): Promise<boolean> {
  // Get the current reservation for activity logging
  const currentReservation = await getReservationById(id);
  if (!currentReservation) {
    return false;
  }

  const result = await query(
    "UPDATE reservations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id",
    [id]
  );
  
  const success = result.length > 0;
  
  // Create activity log for the cancellation
  if (success) {
    try {
      await createActivityLog({
        reservation_id: id,
        action_type: 'cancelled',
        performed_by: performed_by,
        field_changes: {
          status: {
            old: currentReservation.status,
            new: 'cancelled'
          }
        },
        reservation_snapshot: {
          id: currentReservation.id,
          table_id: currentReservation.table_id,
          guest_name: currentReservation.guest_name,
          guest_phone: currentReservation.guest_phone,
          party_size: currentReservation.party_size,
          reservation_date: typeof currentReservation.reservation_date === 'string' 
            ? currentReservation.reservation_date 
            : currentReservation.reservation_date.toISOString().split('T')[0],
          reservation_time: currentReservation.reservation_time,
          duration_hours: currentReservation.duration_hours,
          notes: currentReservation.notes,
          status: 'cancelled', // New status
          created_by: currentReservation.created_by
        }
      });
    } catch (activityLogError) {
      // Log the error but don't fail the reservation cancellation
      console.error('Failed to create activity log for cancellation:', activityLogError);
    }
  }
  
  return success;
}

// Table Availability Services
export async function checkTableAvailability(
  tableId: string,
  date: string,
  time: string,
  durationHours: number = 2,
  excludeReservationId?: string
): Promise<boolean> {
  // For indefinite duration (-1), check conflicts with existing reservations
  if (durationHours === -1) {
    let whereCondition = `
      table_id = $1 
      AND reservation_date = $2 
      AND status = 'active'
      AND (
        -- Conflict with other indefinite reservations
        duration_hours = -1
        OR
        -- Conflict with finite reservations that end after our start time (with midnight crossover handling)
        (
          duration_hours > 0
          AND (
            -- Case 1: Existing reservation doesn't cross midnight
            CASE 
              WHEN (reservation_time + (duration_hours || ' hours')::interval)::time >= reservation_time
              THEN (reservation_time + (duration_hours || ' hours')::interval)::time > $3::time
              -- Case 2: Existing reservation crosses midnight - always conflicts with indefinite
              ELSE true
            END
          )
        )
      )
    `;

    const values = [tableId, date, time];

    if (excludeReservationId) {
      whereCondition += ` AND id != $4`;
      values.push(excludeReservationId);
    }

    const conflicts = await query(
      `SELECT id FROM reservations WHERE ${whereCondition}`,
      values
    );

    return conflicts.length === 0;
  }

  // Regular duration checking with special handling for existing indefinite reservations
  let whereCondition = `
    table_id = $1 
    AND reservation_date = $2 
    AND status = 'active'
    AND (
      -- Indefinite reservations block from their start time onwards
      (duration_hours = -1 AND reservation_time <= $3::time)
      OR
      -- Regular time overlap check for finite durations with midnight crossover handling
      (
        duration_hours > 0
        AND (
          -- Comprehensive midnight crossover handling
          CASE 
            -- Case 1: Neither reservation crosses midnight
            WHEN (reservation_time + (duration_hours || ' hours')::interval)::time >= reservation_time
                 AND ($3::time + ($4 || ' hours')::interval)::time >= $3::time
            THEN (
              $3::time < (reservation_time + (duration_hours || ' hours')::interval)::time
              AND ($3::time + ($4 || ' hours')::interval)::time > reservation_time
            )
            -- Case 2: Existing reservation crosses midnight, new doesn't
            WHEN (reservation_time + (duration_hours || ' hours')::interval)::time < reservation_time
                 AND ($3::time + ($4 || ' hours')::interval)::time >= $3::time
            THEN (
              $3::time >= reservation_time
              OR ($3::time + ($4 || ' hours')::interval)::time > reservation_time
              OR ($3::time + ($4 || ' hours')::interval)::time <= (reservation_time + (duration_hours || ' hours')::interval)::time
            )
            -- Case 3: New reservation crosses midnight, existing doesn't  
            WHEN (reservation_time + (duration_hours || ' hours')::interval)::time >= reservation_time
                 AND ($3::time + ($4 || ' hours')::interval)::time < $3::time
            THEN (
              ($3::time + ($4 || ' hours')::interval)::time > reservation_time
              OR $3::time < (reservation_time + (duration_hours || ' hours')::interval)::time
            )
            -- Case 4: Both reservations cross midnight
            ELSE (
              true -- Always conflict when both cross midnight
            )
          END
        )
      )
    )
  `;

  const values = [tableId, date, time, durationHours];

  if (excludeReservationId) {
    whereCondition += ` AND id != $5`;
    values.push(excludeReservationId);
  }

  const conflicts = await query(
    `
    SELECT id FROM reservations 
    WHERE ${whereCondition}
  `,
    values
  );

  return conflicts.length === 0;
}

export async function getRoomAvailability(
  roomId: string,
  date: string,
  time: string,
  durationHours: number = 2
): Promise<RoomAvailability | null> {
  const room = await getRoomById(roomId);
  if (!room) return null;

  const tables = await getTablesByRoom(roomId);
  const tableAvailabilities: TableAvailability[] = [];

  for (const table of tables) {
    const isAvailable = await checkTableAvailability(
      table.id,
      date,
      time,
      durationHours
    );
    const conflictingReservations = isAvailable
      ? []
      : await query<Reservation>(
          `
      SELECT * FROM reservations 
      WHERE table_id = $1 
        AND reservation_date = $2 
        AND status = 'active'
        AND (
          $3::time < (reservation_time + (duration_hours || ' hours')::interval)
          AND 
          ($3::time + ($4 || ' hours')::interval) > reservation_time
        )
    `,
          [table.id, date, time, durationHours]
        );

    tableAvailabilities.push({
      table: { ...table, room },
      is_available: isAvailable,
      conflicting_reservations: conflictingReservations,
    });
  }

  return {
    room,
    tables: tableAvailabilities,
    available_tables: tableAvailabilities.filter((ta) => ta.is_available)
      .length,
    total_tables: tables.length,
  };
}

// Search Services
export async function searchReservations(
  searchTerm: string
): Promise<ReservationWithTableAndRoom[]> {
  const rows = await query<any>(
    `
    SELECT r.*,
           t.id as table_id, t.table_number, t.max_capacity, t.shape, 
           t.position_x, t.position_y, t.is_active as table_is_active,
           t.created_at as table_created_at, t.updated_at as table_updated_at,
           t.room_id as table_room_id,
           rm.id as room_id, rm.name as room_name, rm.description as room_description,
           rm.is_active as room_is_active, rm.created_at as room_created_at,
           rm.updated_at as room_updated_at
    FROM reservations r
    JOIN tables t ON r.table_id = t.id
    JOIN rooms rm ON t.room_id = rm.id
    WHERE (r.guest_name ILIKE $1 OR r.guest_phone ILIKE $1)
      AND r.status = 'active'
    ORDER BY r.reservation_date DESC, r.reservation_time ASC
  `,
    [`%${searchTerm}%`]
  );

  // Helper function to format date safely without timezone issues
  const formatDateSafely = (date: Date): string => {
    if (!date) return '';
    // Extract year, month, day directly from the Date object to avoid timezone conversion
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  // Map flat SQL results to nested object structure
  return rows.map((row) => ({
    id: row.id,
    table_id: row.table_id,
    guest_name: row.guest_name,
    guest_phone: row.guest_phone,
    party_size: row.party_size,
    reservation_date: formatDateSafely(row.reservation_date),
    reservation_time: row.reservation_time,
    duration_hours: row.duration_hours,
    notes: row.notes,
    status: row.status,
    created_by: row.created_by,
    created_at: row.created_at,
    updated_at: row.updated_at,
    table: {
      id: row.table_id,
      room_id: row.table_room_id,
      table_number: row.table_number,
      max_capacity: row.max_capacity,
      shape: row.shape,
      position_x: row.position_x,
      position_y: row.position_y,
      is_active: row.table_is_active,
      created_at: row.table_created_at,
      updated_at: row.table_updated_at,
      room: {
        id: row.room_id,
        name: row.room_name,
        description: row.room_description,
        is_active: row.room_is_active,
        created_at: row.room_created_at,
        updated_at: row.room_updated_at,
      },
    },
  }));
}

// Time slot utilities
export function generateTimeSlots(): string[] {
  const slots = [];
  for (let hour = 12; hour < 24; hour++) {
    slots.push(`${hour.toString().padStart(2, "0")}:00`);
    slots.push(`${hour.toString().padStart(2, "0")}:30`);
  }
  // Add 00:00, 00:30, 01:00, 01:30, 02:00 for late night
  for (let hour = 0; hour <= 2; hour++) {
    slots.push(`${hour.toString().padStart(2, "0")}:00`);
    if (hour < 2) slots.push(`${hour.toString().padStart(2, "0")}:30`);
  }
  return slots;
}

export function formatTimeForDisplay(time: string): string {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours}:${minutes.toString().padStart(2, "0")}`;
}

// Activity Log Services
export async function createActivityLog(
  data: CreateActivityLogInput
): Promise<ReservationActivityLog> {
  const result = await queryOne<ReservationActivityLog>(
    `
    SELECT log_reservation_activity(
      $1, $2, $3, $4, $5, $6, $7, $8
    ) as id
  `,
    [
      data.reservation_id,
      data.action_type,
      data.performed_by,
      data.field_changes ? JSON.stringify(data.field_changes) : null,
      data.reservation_snapshot ? JSON.stringify(data.reservation_snapshot) : null,
      data.notes,
      data.ip_address,
      data.user_agent,
    ]
  );

  if (!result) {
    throw new Error("Failed to create activity log");
  }

  // Get the created log entry
  const createdLog = await getActivityLogById(result.id);
  if (!createdLog) {
    throw new Error("Failed to retrieve created activity log");
  }
  
  return createdLog;
}

export async function getActivityLogById(
  id: string
): Promise<ReservationActivityLog | null> {
  return await queryOne<ReservationActivityLog>(
    `
    SELECT * FROM reservation_activity_logs
    WHERE id = $1
  `,
    [id]
  );
}

export async function getActivityLogs(
  filters: ActivityLogFilters = {},
  limit: number = 100,
  offset: number = 0
): Promise<ActivityLogWithReservation[]> {
  let whereConditions = ["1=1"];
  const values = [];
  let paramIndex = 1;

  if (filters.reservation_id) {
    whereConditions.push(`ral.reservation_id = $${paramIndex++}`);
    values.push(filters.reservation_id);
  }
  
  if (filters.action_type) {
    whereConditions.push(`ral.action_type = $${paramIndex++}`);
    values.push(filters.action_type);
  }
  
  if (filters.performed_by) {
    whereConditions.push(`ral.performed_by ILIKE $${paramIndex++}`);
    values.push(`%${filters.performed_by}%`);
  }
  
  if (filters.performed_at_from) {
    whereConditions.push(`ral.performed_at >= $${paramIndex++}`);
    values.push(filters.performed_at_from);
  }
  
  if (filters.performed_at_to) {
    whereConditions.push(`ral.performed_at <= $${paramIndex++}`);
    values.push(filters.performed_at_to);
  }
  
  if (filters.table_id) {
    whereConditions.push(`t.id = $${paramIndex++}`);
    values.push(filters.table_id);
  }
  
  if (filters.room_id) {
    whereConditions.push(`rm.id = $${paramIndex++}`);
    values.push(filters.room_id);
  }
  
  if (filters.guest_name) {
    whereConditions.push(`ral.reservation_snapshot->>'guest_name' ILIKE $${paramIndex++}`);
    values.push(`%${filters.guest_name}%`);
  }
  
  if (filters.search_term) {
    whereConditions.push(`(
      ral.reservation_snapshot->>'guest_name' ILIKE $${paramIndex} OR
      ral.reservation_snapshot->>'guest_phone' ILIKE $${paramIndex} OR
      ral.performed_by ILIKE $${paramIndex} OR
      t.table_number ILIKE $${paramIndex} OR
      rm.name ILIKE $${paramIndex}
    )`);
    values.push(`%${filters.search_term}%`);
    paramIndex++;
  }

  values.push(limit, offset);

  const rows = await query<any>(
    `
    SELECT 
      ral.*,
      r.guest_name as current_guest_name,
      r.status as current_status,
      t.table_number,
      rm.name as room_name
    FROM reservation_activity_logs ral
    LEFT JOIN reservations r ON ral.reservation_id = r.id
    LEFT JOIN tables t ON r.table_id = t.id
    LEFT JOIN rooms rm ON t.room_id = rm.id
    WHERE ${whereConditions.join(" AND ")}
    ORDER BY ral.performed_at DESC
    LIMIT $${paramIndex++} OFFSET $${paramIndex++}
  `,
    values
  );

  return rows.map((row) => ({
    id: row.id,
    reservation_id: row.reservation_id,
    action_type: row.action_type,
    performed_by: row.performed_by,
    performed_at: row.performed_at,
    field_changes: row.field_changes,
    reservation_snapshot: row.reservation_snapshot,
    notes: row.notes,
    ip_address: row.ip_address,
    user_agent: row.user_agent,
    table_number: row.table_number,
    room_name: row.room_name,
  }));
}

export async function getActivityLogsByReservationId(
  reservationId: string
): Promise<ReservationActivityLog[]> {
  return await query<ReservationActivityLog>(
    `
    SELECT * FROM reservation_activity_logs
    WHERE reservation_id = $1
    ORDER BY performed_at DESC
  `,
    [reservationId]
  );
}

export async function getActivityLogSummary(
  days: number = 30
): Promise<ActivityLogSummary> {
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Get total activities and breakdown by type
  const summaryResult = await queryOne<any>(
    `
    SELECT 
      COUNT(*) as total_activities,
      COUNT(CASE WHEN action_type = 'updated' THEN 1 END) as updated,
      COUNT(CASE WHEN action_type = 'cancelled' THEN 1 END) as cancelled
    FROM reservation_activity_logs
    WHERE performed_at >= $1
  `,
    [cutoffDate]
  );

  // Get activities by user
  const userActivities = await query<{ user: string; count: number }>(
    `
    SELECT 
      COALESCE(performed_by, 'Unknown') as user,
      COUNT(*) as count
    FROM reservation_activity_logs
    WHERE performed_at >= $1
    GROUP BY performed_by
    ORDER BY count DESC
    LIMIT 10
  `,
    [cutoffDate]
  );

  // Get recent activities
  const recentActivities = await getActivityLogs({}, 10, 0);

  return {
    total_activities: parseInt(summaryResult.total_activities),
    activities_by_type: {
      updated: parseInt(summaryResult.updated),
      cancelled: parseInt(summaryResult.cancelled),
    },
    activities_by_user: userActivities,
    recent_activities: recentActivities,
  };
}

export async function cleanupOldActivityLogs(
  monthsToKeep: number = 3
): Promise<number> {
  const result = await queryOne<{ count: number }>(
    `SELECT cleanup_old_activity_logs($1) as count`,
    [monthsToKeep]
  );
  return result?.count || 0;
}

export async function searchActivityLogs(
  searchTerm: string,
  limit: number = 50
): Promise<ActivityLogWithReservation[]> {
  return await getActivityLogs(
    { search_term: searchTerm },
    limit,
    0
  );
}

export async function autoCompleteExpiredReservations(): Promise<number> {
  const logger = createServiceLogger('reservations', 'auto_complete_expired');
  
  return timeOperation(logger, 'auto_complete_expired_reservations', async () => {
    let completedCount = 0;

    // 1. Handle regular reservations with specific durations that have ended
    const regularExpiredQuery = `
      SELECT r.* FROM reservations r
      WHERE r.duration_hours > 0 
        AND r.status = 'active'
        AND (
          -- Calculate the actual end time and check if it has passed
          (r.reservation_date::date + r.reservation_time::time + (r.duration_hours || ' hours')::interval) < NOW()
        )
    `;

    const regularExpiredReservations = await query<Reservation>(regularExpiredQuery);
    logger.debug({ count: regularExpiredReservations.length }, 'Found regular expired reservations');

    for (const reservation of regularExpiredReservations) {
      try {
        await updateReservation(reservation.id, {
          status: 'completed',
          performed_by: 'System - Auto Completion'
        });
        completedCount++;
        
        logger.info({
          reservation_id: reservation.id,
          guest_name: reservation.guest_name,
          reservation_date: reservation.reservation_date,
          reservation_time: reservation.reservation_time,
          duration_hours: reservation.duration_hours
        }, 'Auto-completed regular expired reservation');
      } catch (error) {
        logger.error({
          reservation_id: reservation.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to auto-complete regular reservation');
      }
    }

    // 2. Handle indefinite reservations that have been running for more than 6 hours
    const indefiniteExpiredQuery = `
      SELECT r.* FROM reservations r
      WHERE r.duration_hours = -1 
        AND r.status = 'active'
        AND (
          -- Calculate if 6 hours have passed since the reservation start time
          (r.reservation_date::date + r.reservation_time::time + interval '6 hours') < NOW()
        )
    `;

    const indefiniteExpiredReservations = await query<Reservation>(indefiniteExpiredQuery);
    logger.debug({ count: indefiniteExpiredReservations.length }, 'Found indefinite expired reservations');

    for (const reservation of indefiniteExpiredReservations) {
      try {
        // Calculate actual duration for indefinite reservations
        // Parse the reservation date and time to create the start datetime
        const reservationDateString = typeof reservation.reservation_date === 'string' 
          ? reservation.reservation_date.split('T')[0] 
          : reservation.reservation_date.toISOString().split('T')[0];
        
        const [hours, minutes] = reservation.reservation_time.split(':').map(Number);
        const startTime = new Date(reservationDateString + 'T00:00:00');
        startTime.setHours(hours, minutes, 0, 0);
        
        const now = new Date();
        const elapsedMs = now.getTime() - startTime.getTime();
        const elapsedHours = elapsedMs / (1000 * 60 * 60);
        
        // Cap at 6 hours for auto-completion, minimum 0.1 hours
        const actualDuration = Math.max(0.1, Math.min(6, Math.round(elapsedHours * 10) / 10));

        await updateReservation(reservation.id, {
          status: 'completed',
          duration_hours: actualDuration,
          performed_by: 'System - Auto Completion'
        });
        completedCount++;
        
        logger.info({
          reservation_id: reservation.id,
          guest_name: reservation.guest_name,
          reservation_date: reservation.reservation_date,
          reservation_time: reservation.reservation_time,
          calculated_duration: actualDuration
        }, 'Auto-completed indefinite expired reservation');
      } catch (error) {
        logger.error({
          reservation_id: reservation.id,
          error: error instanceof Error ? error.message : 'Unknown error'
        }, 'Failed to auto-complete indefinite reservation');
      }
    }

    logger.info({ completed_count: completedCount }, 'Auto-completion process finished');
    return completedCount;
  });
}