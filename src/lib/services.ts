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
import type { PoolClient } from "pg";
import { createServiceLogger, timeOperation, logError } from "./logger";
import { normalizeTimeFormat } from "./api-client";
// Import client-safe date utilities
import { 
  normalizeDateForDb, 
  extractDateString, 
  formatDateForDisplay, 
  createDateObject 
} from "./date-utils";

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
  const logger = createServiceLogger('employees', 'create');
  
  try {
    logger.debug({ 
      first_name: data.first_name,
      last_name: data.last_name,
      display_name: data.display_name
    }, 'Creating new employee');

    // Check if display name is unique
    const existingDisplayName = await queryOne<{ id: string }>(
      "SELECT id FROM employees WHERE display_name = $1",
      [data.display_name]
    );

    if (existingDisplayName) {
      logger.warn({ display_name: data.display_name }, 'Attempted to create employee with duplicate display name');
      throw new Error('Nazwa wyświetlana już istnieje');
    }

    const newEmployee = await queryOne<Employee>(
      `INSERT INTO employees (first_name, last_name, display_name, is_active)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        data.first_name.trim(),
        data.last_name.trim(),
        data.display_name.trim(),
        data.is_active ?? true,
      ]
    );

    if (!newEmployee) {
      throw new Error('Nie udało się utworzyć pracownika');
    }

    logger.info({ 
      employee_id: newEmployee.id,
      display_name: newEmployee.display_name 
    }, 'Employee created successfully');

    return {
      id: newEmployee.id,
      first_name: newEmployee.first_name,
      last_name: newEmployee.last_name,
      display_name: newEmployee.display_name,
      is_active: newEmployee.is_active,
      created_at: newEmployee.created_at,
      updated_at: newEmployee.updated_at,
    };
  } catch (error) {
    logError(logger, error as Error, { 
      context: 'create_employee_failed',
      input_data: { 
        first_name: data.first_name,
        last_name: data.last_name,
        display_name: data.display_name
      }
    });
    throw error;
  }
}

export async function updateEmployee(id: string, data: UpdateEmployeeInput): Promise<Employee> {
  const logger = createServiceLogger('employees', 'update');
  
  try {
    logger.debug({ 
      employee_id: id,
      update_fields: Object.keys(data)
    }, 'Updating employee');

    // Check if display name is unique (if being updated)
    if (data.display_name?.trim()) {
      const existingDisplayName = await queryOne<{ id: string }>(
        "SELECT id FROM employees WHERE display_name = $1 AND id != $2",
        [data.display_name, id]
      );

      if (existingDisplayName) {
        logger.warn({ 
          employee_id: id,
          display_name: data.display_name 
        }, 'Attempted to update employee with duplicate display name');
        throw new Error('Nazwa wyświetlana już istnieje');
      }
    }

    // Build dynamic update query
    const updateFields: string[] = [];
    const updateValues: any[] = [];
    let paramCount = 1;

    if (data.first_name !== undefined) {
      updateFields.push(`first_name = $${paramCount++}`);
      updateValues.push(data.first_name?.trim() || null);
    }

    if (data.last_name !== undefined) {
      updateFields.push(`last_name = $${paramCount++}`);
      updateValues.push(data.last_name?.trim() || null);
    }

    if (data.display_name !== undefined) {
      updateFields.push(`display_name = $${paramCount++}`);
      updateValues.push(data.display_name?.trim() || null);
    }

    if (data.is_active !== undefined) {
      updateFields.push(`is_active = $${paramCount++}`);
      updateValues.push(data.is_active);
    }

    if (updateFields.length === 0) {
      logger.warn({ employee_id: id }, 'No fields to update');
      throw new Error('Brak pól do aktualizacji');
    }

    // Add WHERE clause parameter
    updateValues.push(id);

    const updatedEmployee = await queryOne<Employee>(
      `UPDATE employees 
       SET ${updateFields.join(', ')}
       WHERE id = $${paramCount}
       RETURNING *`,
      updateValues
    );

    if (!updatedEmployee) {
      logger.warn({ employee_id: id }, 'Employee not found for update');
      throw new Error('Nie znaleziono pracownika');
    }

    logger.info({ 
      employee_id: id,
      updated_fields: Object.keys(data)
    }, 'Employee updated successfully');

    return updatedEmployee;
  } catch (error) {
    logError(logger, error as Error, { 
      context: 'update_employee_failed',
      employee_id: id,
      update_data: data
    });
    throw error;
  }
}

export async function deleteEmployee(id: string): Promise<boolean> {
  // Check if employee exists
  const existingEmployee = await getEmployeeById(id);
  if (!existingEmployee) {
    return false;
  }

  // Check if employee is used in any reservations (active, completed, or cancelled)
  const reservationsCount = await query<{ count: number }>(
    "SELECT COUNT(*) as count FROM reservations WHERE employee_id = $1",
    [id]
  );

  if (reservationsCount[0]?.count > 0) {
    throw new Error(
      `Nie można usunąć pracownika "${existingEmployee.display_name}", ponieważ ma przypisane ${reservationsCount[0].count} rezerwacji. Dezaktywuj pracownika zamiast go usuwać.`
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

// Enhanced reservation creation with race condition protection
export async function createReservation(
  data: CreateReservationInput,
  options: { maxRetries?: number } = {}
): Promise<Reservation> {
  const { maxRetries = 3 } = options;
  const logger = createServiceLogger('reservation', 'create');
  
  return timeOperation(logger, 'create_reservation_with_race_protection', async () => {
    logger.debug({
      table_id: data.table_id,
      guest_name: data.guest_name,
      guest_phone: data.guest_phone,
      party_size: data.party_size,
      reservation_date: data.reservation_date,
      reservation_time: data.reservation_time,
      duration_hours: data.duration_hours || 2,
      employee_id: data.employee_id,
      max_retries: maxRetries
    }, 'Creating new reservation with race condition protection');

    // Normalize date to ensure proper storage without timezone conversion
    const normalizedDate = normalizeDateForDb(data.reservation_date);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Note: We rely on database constraint to handle conflicts atomically
        // Redundant availability checks have been removed to eliminate race conditions
        // The database trigger 'prevent_reservation_overlap' ensures data integrity

        // Use database transaction for atomic reservation creation
        const result = await transaction(async (client: PoolClient) => {
          // Insert the reservation - database constraint will prevent conflicts
          const reservation = await client.query(
            `
            INSERT INTO reservations (
              table_id, guest_name, guest_phone, party_size, 
              reservation_date, reservation_time, duration_hours, notes, employee_id
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
          `,
            [
              data.table_id,
              data.guest_name,
              data.guest_phone,
              data.party_size,
              normalizedDate,
              data.reservation_time,
              data.duration_hours || 2,
              data.notes,
              data.employee_id,
            ]
          );

          if (!reservation.rows[0]) {
            throw new Error("Failed to create reservation");
          }

          return reservation.rows[0] as Reservation;
        });

        if (!result) {
          throw new Error("Failed to create reservation");
        }

        logger.info({
          reservation_id: result.id,
          table_id: result.table_id,
          guest_name: result.guest_name,
          reservation_date: result.reservation_date,
          reservation_time: result.reservation_time,
          attempt,
          success: true
        }, 'Reservation created successfully');

        return result;

      } catch (error: any) {
        const isConstraintViolation = error.message && (
          error.message.includes('conflicts with existing reservation') ||
          error.message.includes('Reservation conflicts') ||
          error.code === '23514' || // Check constraint violation
          error.constraint?.includes('overlap') ||
          error.message === "RACE_CONDITION_DETECTED"
        );

        if (isConstraintViolation) {
          logger.warn({
            table_id: data.table_id,
            date: normalizedDate,
            time: data.reservation_time,
            attempt,
            max_retries: maxRetries,
            error_message: error.message,
            error_code: error.code
          }, 'Reservation conflict detected');

          if (attempt < maxRetries) {
            // Brief delay before retry to reduce contention
            await new Promise(resolve => setTimeout(resolve, 100 * attempt));
            logger.debug({ attempt, next_attempt: attempt + 1 }, 'Retrying reservation creation');
            continue;
          } else {
            // Final attempt failed - provide user-friendly error
            logger.error({
              table_id: data.table_id,
              date: normalizedDate,
              time: data.reservation_time,
              final_attempt: attempt
            }, 'Reservation creation failed after all retries');

            throw new Error("TABLE_UNAVAILABLE");
          }
        } else {
          // Non-constraint violation error - don't retry
          logger.error({
            table_id: data.table_id,
            error_message: error.message,
            error_code: error.code,
            attempt
          }, 'Reservation creation failed with non-conflict error');
          
          throw error;
        }
      }
    }

    // This should never be reached, but TypeScript requires it
    throw new Error("Unexpected error in reservation creation");
  });
}

export async function updateReservation(
  id: string,
  data: UpdateReservationInput & { complete_now?: boolean }
): Promise<Reservation> {
  const logger = createServiceLogger('reservation', 'update');
  
  return timeOperation(logger, 'update_reservation_with_activity_log', async () => {
    // Get the current reservation for activity logging (outside transaction for validation)
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
        
        // Parse reservation date safely using standardized utility
        const resDateString = extractDateString(currentReservation.reservation_date);
        
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

    // Calculate field changes before transaction for activity logging
    const fieldChanges = calculateFieldChanges(currentReservation, data);
    
    // Filter out status changes from "active" to "completed" 
    // We want to log edits but not completion status changes
    const filteredChanges = { ...fieldChanges };
    
    // Check if this is a completion operation (active → completed)
    const isCompletion = filteredChanges.status && 
        filteredChanges.status.old === 'active' && 
        filteredChanges.status.new === 'completed';
    
    if (isCompletion) {
      // Remove status change for completion
      delete filteredChanges.status;
      
      // Also remove duration_hours change for completion 
      // (it's automatically calculated, not a user edit)
      if (filteredChanges.duration_hours) {
        delete filteredChanges.duration_hours;
      }
    }

    // 🔒 ATOMIC TRANSACTION: Update reservation and create activity log together
    return await transaction(async (client) => {
      logger.debug({ reservation_id: id, changes: Object.keys(filteredChanges) }, 'Starting atomic reservation update');
      
      // Build update query
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
        values.push(normalizeDateForDb(data.reservation_date));
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

      // Step 1: Update the reservation
      values.push(id);
      const updateResult = await client.query(
        `
        UPDATE reservations 
        SET ${fields.join(", ")}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $${paramIndex}
        RETURNING *
      `,
        values
      );

      if (!updateResult.rows || updateResult.rows.length === 0) {
        throw new Error("Reservation not found");
      }

      const result = updateResult.rows[0] as Reservation;
      logger.debug({ reservation_id: id }, 'Reservation updated successfully');

      // Step 2: Create activity log (only if there are actual changes after filtering)
      if (Object.keys(filteredChanges).length > 0) {
        const activityLog = await createActivityLogWithClient(client, {
          reservation_id: id,
          action_type: data.status === 'cancelled' ? 'cancelled' : 'updated',
          field_changes: filteredChanges,
          reservation_snapshot: {
            id: result.id,
            table_id: result.table_id,
            guest_name: result.guest_name,
            guest_phone: result.guest_phone,
            party_size: result.party_size,
            reservation_date: extractDateString(result.reservation_date),
            reservation_time: result.reservation_time,
            duration_hours: result.duration_hours,
            notes: result.notes,
            status: result.status,
            employee_id: result.employee_id
          }
        });
        
        logger.info({ 
          reservation_id: id, 
          activity_log_id: activityLog?.id,
          changes_count: Object.keys(filteredChanges).length
        }, 'Activity log created successfully');
      } else {
        logger.debug({ reservation_id: id }, 'No activity log created - only completion status change');
      }

      return result;
    });
  });
}

// Helper function to calculate field changes for activity logging
function calculateFieldChanges(
  currentReservation: ReservationWithTableAndRoom,
  updateData: UpdateReservationInput
): Record<string, { old: any; new: any }> {
  const changes: Record<string, { old: any; new: any }> = {};
  
  // Use standardized date utility function

  // Helper function to normalize duration_hours for comparison
  const normalizeDuration = (duration: number): number => {
    // Convert to number and handle special case of -1 (indefinite)
    const num = Number(duration);
    // For indefinite reservations, always use -1 (not -1.0)
    if (num === -1 || num === -1.0) {
      return -1;
    }
    // Round to 1 decimal place to avoid floating point precision issues
    return Math.round(num * 10) / 10;
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
    const newDate = extractDateString(updateData.reservation_date);
    const currentDate = extractDateString(currentReservation.reservation_date);
    
    if (newDate !== currentDate) {
      changes.reservation_date = {
        old: currentDate,
        new: newDate
      };
    }
  }

  if (updateData.reservation_time !== undefined) {
    const normalizedNew = normalizeTimeFormat(updateData.reservation_time);
    const normalizedCurrent = normalizeTimeFormat(currentReservation.reservation_time);
    
    if (normalizedNew !== normalizedCurrent) {
      changes.reservation_time = {
        old: normalizedCurrent,
        new: normalizedNew
      };
    }
  }

  if (updateData.duration_hours !== undefined) {
    const normalizedNew = normalizeDuration(updateData.duration_hours);
    const normalizedCurrent = normalizeDuration(currentReservation.duration_hours);
    
    if (normalizedNew !== normalizedCurrent) {
      changes.duration_hours = {
        old: normalizedCurrent,
        new: normalizedNew
      };
    }
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

  // Map flat SQL result to nested object structure
  return {
    id: row.id,
    table_id: row.table_id,
    guest_name: row.guest_name,
    guest_phone: row.guest_phone,
    party_size: row.party_size,
    reservation_date: extractDateString(row.reservation_date),
    reservation_time: row.reservation_time,
    duration_hours: row.duration_hours,
    notes: row.notes,
    status: row.status,
    employee_id: row.employee_id,
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
    values.push(normalizeDateForDb(filters.reservation_date));
  }
  if (filters.reservation_date_from) {
    whereConditions.push(`r.reservation_date >= $${paramIndex++}`);
    values.push(normalizeDateForDb(filters.reservation_date_from));
  }
  if (filters.reservation_date_to) {
    whereConditions.push(`r.reservation_date <= $${paramIndex++}`);
    values.push(normalizeDateForDb(filters.reservation_date_to));
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
  if (filters.employee_id) {
    whereConditions.push(`r.employee_id = $${paramIndex++}`);
    values.push(filters.employee_id);
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
    ORDER BY r.reservation_date ASC, r.reservation_time ASC, rm.name, t.table_number
  `,
    values
  );

  // Helper function to format date safely without timezone issues
  const formatDateSafely = (date: Date | string): string => {
    if (!date) return '';
    try {
      if (typeof date === 'string') {
        // If it's already a string, extract just the date part
        return date.split('T')[0];
      }
      // For Date objects, use local date components to avoid timezone issues
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };

  // Map flat SQL results to nested object structure
  return rows.map((row) => ({
    id: row.id,
    table_id: row.table_id,
    guest_name: row.guest_name,
    guest_phone: row.guest_phone,
    party_size: row.party_size,
    reservation_date: extractDateString(row.reservation_date),
    reservation_time: row.reservation_time,
    duration_hours: row.duration_hours,
    notes: row.notes,
    status: row.status,
    employee_id: row.employee_id,
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

export async function deleteReservation(id: string): Promise<boolean> {
  const logger = createServiceLogger('reservation', 'delete');
  
  return timeOperation(logger, 'delete_reservation_with_activity_log', async () => {
    // Get the current reservation for activity logging (outside transaction for validation)
    const currentReservation = await getReservationById(id);
    if (!currentReservation) {
      logger.warn({ reservation_id: id }, 'Reservation not found for deletion');
      return false;
    }

    // 🔒 ATOMIC TRANSACTION: Update reservation status and create activity log together
    return await transaction(async (client) => {
      logger.debug({ reservation_id: id }, 'Starting atomic reservation deletion');
      
      // Step 1: Update reservation status to cancelled
      const result = await client.query(
        "UPDATE reservations SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id",
        [id]
      );
      
      const success = result.rows.length > 0;
      
      if (!success) {
        logger.warn({ reservation_id: id }, 'Reservation not found or already deleted');
        return false;
      }
      
      // Step 2: Create activity log for the cancellation
      const activityLog = await createActivityLogWithClient(client, {
        reservation_id: id,
        action_type: 'cancelled',
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
          reservation_date: extractDateString(currentReservation.reservation_date),
          reservation_time: currentReservation.reservation_time,
          duration_hours: currentReservation.duration_hours,
          notes: currentReservation.notes,
          status: 'cancelled', // New status
          employee_id: currentReservation.employee_id
        }
      });
      
      logger.info({ 
        reservation_id: id, 
        activity_log_id: activityLog?.id,
        guest_name: currentReservation.guest_name
      }, 'Reservation cancelled and activity log created successfully');
      
      return true;
    });
  });
}

// Table Availability Services - Uses same proven logic as FloorPlan component
export async function checkTableAvailability(
  tableId: string,
  date: string,
  time: string,
  durationHours: number = 2,
  excludeReservationId?: string
): Promise<boolean> {
  // Get all reservations for this table with cross-day support
  const result = await getReservationsWithCrossDay(date, 'all');
  const allReservations = [...result.sameDay, ...result.previousDay];
  
  // Filter for this specific table and exclude the reservation being edited
  const tableReservations = allReservations.filter(
    (r) => r.table_id === tableId && 
           (r.status === "active" || r.status === "completed") &&
           (!excludeReservationId || r.id !== excludeReservationId)
  );

  // Proper interval overlap checking for new reservation duration
  const hasConflict = tableReservations.some((r) => {
    const reservationDate = extractDateString(r.reservation_date);

    // Calculate new reservation start and end times
    const [newHours, newMinutes] = time.split(':').map(Number);
    const newStartTime = new Date(date + 'T00:00:00');
    newStartTime.setHours(newHours, newMinutes, 0, 0);
    
    let newEndTime: Date;
    if (durationHours === -1) {
      // Indefinite reservations block until 6 AM next day
      newEndTime = new Date(newStartTime);
      newEndTime.setDate(newEndTime.getDate() + 1);
      newEndTime.setHours(6, 0, 0, 0);
    } else {
      newEndTime = new Date(newStartTime.getTime() + durationHours * 60 * 60 * 1000);
    }

    // Calculate existing reservation start and end times
    const [resHours, resMinutes] = r.reservation_time.split(':').map(Number);
    const resStartTime = new Date(reservationDate + 'T00:00:00');
    resStartTime.setHours(resHours, resMinutes, 0, 0);
    
    let resEndTime: Date;
    if (Number(r.duration_hours) === -1) {
      // Indefinite reservations block until 6 AM next day
      resEndTime = new Date(resStartTime);
      resEndTime.setDate(resEndTime.getDate() + 1);
      resEndTime.setHours(6, 0, 0, 0);
    } else {
      resEndTime = new Date(resStartTime.getTime() + Number(r.duration_hours) * 60 * 60 * 1000);
    }

    // Check for interval overlap: two intervals overlap if start1 < end2 AND start2 < end1
    const overlaps = newStartTime < resEndTime && resStartTime < newEndTime;
    
    return overlaps;
  });

  return !hasConflict;
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
  const formatDateSafely = (date: Date | string): string => {
    if (!date) return '';
    try {
      if (typeof date === 'string') {
        // If it's already a string, extract just the date part
        return date.split('T')[0];
      }
      // For Date objects, use local date components to avoid timezone issues
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    } catch {
      return '';
    }
  };

  // Map flat SQL results to nested object structure
  return rows.map((row) => ({
    id: row.id,
    table_id: row.table_id,
    guest_name: row.guest_name,
    guest_phone: row.guest_phone,
    party_size: row.party_size,
    reservation_date: extractDateString(row.reservation_date),
    reservation_time: row.reservation_time,
    duration_hours: row.duration_hours,
    notes: row.notes,
    status: row.status,
    employee_id: row.employee_id,
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
  // Start from 12:00 (noon) to 23:45, then 00:00 to 02:00 with 15-minute intervals
  for (let hour = 12; hour < 24; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      slots.push(`${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
    }
  }
  // Add early morning slots (00:00 to 02:00) with 15-minute intervals
  for (let hour = 0; hour <= 2; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      if (hour === 2 && minute > 0) break; // Stop at 02:00
      slots.push(`${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`);
    }
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
): Promise<ReservationActivityLog | null> {
  const result = await queryOne<ReservationActivityLog>(
    `
    SELECT log_reservation_activity(
      $1, $2, $3, $4, $5, $6, $7
    ) as id
  `,
    [
      data.reservation_id,
      data.action_type,
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

// Transaction-aware version of createActivityLog for use within database transactions
export async function createActivityLogWithClient(
  client: PoolClient,
  data: CreateActivityLogInput
): Promise<ReservationActivityLog | null> {
  const result = await client.query(
    `
    SELECT log_reservation_activity(
      $1, $2, $3, $4, $5, $6, $7
    ) as id
  `,
    [
      data.reservation_id,
      data.action_type,
      data.field_changes ? JSON.stringify(data.field_changes) : null,
      data.reservation_snapshot ? JSON.stringify(data.reservation_snapshot) : null,
      data.notes,
      data.ip_address,
      data.user_agent,
    ]
  );

  if (!result.rows || result.rows.length === 0) {
    throw new Error("Failed to create activity log");
  }

  // Get the created log entry using the same client
  const createdLogResult = await client.query(
    `
    SELECT id, reservation_id, action_type, performed_at, field_changes, 
           reservation_snapshot, notes, ip_address, user_agent
    FROM reservation_activity_logs 
    WHERE id = $1
  `,
    [result.rows[0].id]
  );
  
  if (!createdLogResult.rows || createdLogResult.rows.length === 0) {
    throw new Error("Failed to retrieve created activity log");
  }
  
  return createdLogResult.rows[0] as ReservationActivityLog;
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

  // Get recent activities
  const recentActivities = await getActivityLogs({}, 10, 0);

  return {
    total_activities: parseInt(summaryResult.total_activities),
    activities_by_type: {
      updated: parseInt(summaryResult.updated),
      cancelled: parseInt(summaryResult.cancelled),
    },
    activities_by_user: [], // No longer tracking by user
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

/**
 * Get reservations for a specific date, including active reservations from the previous day
 * that extend past midnight. This is crucial for proper availability checking and display.
 */
export async function getReservationsWithCrossDay(
  date: string,
  statusFilter: 'active' | 'completed' | 'cancelled' | 'all' = 'active'
): Promise<{
  sameDay: ReservationWithTableAndRoom[];
  previousDay: ReservationWithTableAndRoom[];
  all: ReservationWithTableAndRoom[];
}> {
  const logger = createServiceLogger('reservations', 'get_reservations_cross_day');

  try {
    logger.debug({ date, statusFilter }, 'Getting reservations with cross-day logic');

    // Calculate previous day
    const currentDate = new Date(date + 'T12:00:00');
    const previousDate = new Date(currentDate);
    previousDate.setDate(previousDate.getDate() - 1);
    const previousDateString = previousDate.toISOString().split('T')[0];

    let statusCondition = '';
    if (statusFilter !== 'all') {
      statusCondition = `AND r.status = '${statusFilter}'`;
    }

    const sqlQuery = `
      SELECT 
        r.*,
        t.table_number,
        t.max_capacity,
        t.shape,
        t.position_x,
        t.position_y,
        t.size_scale,
        t.width_ratio,
        t.height_ratio,
        t.orientation,
        t.room_id,
        rm.name as room_name,
        rm.description as room_description,
        rm.is_active as room_is_active
      FROM reservations r
      JOIN tables t ON r.table_id = t.id
      JOIN rooms rm ON t.room_id = rm.id
      WHERE (
        -- Same day reservations
        (r.reservation_date = $1 ${statusCondition})
        OR
        -- Previous day reservations that might extend past midnight
        (r.reservation_date = $2 ${statusCondition} AND (
          -- Indefinite reservations from previous day
          r.duration_hours = -1
          OR
          -- Regular reservations that cross midnight
          (r.duration_hours > 0 AND 
           EXTRACT(HOUR FROM r.reservation_time::time) + r.duration_hours > 24)
        ))
      )
      ORDER BY r.reservation_date DESC, r.reservation_time DESC
    `;

    const reservations = await query<any>(sqlQuery, [date, previousDateString]);

    const sameDay: ReservationWithTableAndRoom[] = [];
    const previousDay: ReservationWithTableAndRoom[] = [];

    // Helper function to safely format dates without timezone issues
    const formatDateSafely = (date: Date | string): string => {
      if (!date) return '';
      try {
        if (typeof date === 'string') {
          // If it's already a string, extract just the date part
          return date.split('T')[0];
        }
        // For Date objects, use local date components to avoid timezone issues
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const day = date.getDate().toString().padStart(2, '0');
        return `${year}-${month}-${day}`;
      } catch {
        return '';
      }
    };

    // Process and categorize reservations
    for (const row of reservations) {
      const reservation: ReservationWithTableAndRoom = {
        id: row.id,
        table_id: row.table_id,
        guest_name: row.guest_name,
        guest_phone: row.guest_phone,
        party_size: row.party_size,
        reservation_date: extractDateString(row.reservation_date),
        reservation_time: row.reservation_time,
        duration_hours: Number(row.duration_hours),
        notes: row.notes,
        status: row.status,
        employee_id: row.employee_id,
        created_at: row.created_at,
        updated_at: row.updated_at,
        table: {
          id: row.table_id,
          room_id: row.room_id,
          table_number: row.table_number,
          max_capacity: row.max_capacity,
          shape: row.shape,
          position_x: row.position_x,
          position_y: row.position_y,
          size_scale: row.size_scale,
          width_ratio: row.width_ratio,
          height_ratio: row.height_ratio,
          orientation: row.orientation,
          is_active: true,
          created_at: row.created_at,
          updated_at: row.updated_at,
          room: {
            id: row.room_id,
            name: row.room_name,
            description: row.room_description,
            is_active: row.room_is_active,
            created_at: row.created_at,
            updated_at: row.updated_at
          }
        }
      };

      // Categorize by original reservation date
      if (reservation.reservation_date === date) {
        sameDay.push(reservation);
      } else {
        // Check if previous day reservation is actually still active on the target date
        const isStillActiveOnTargetDate = isReservationActiveOnDate(reservation, date);
        if (isStillActiveOnTargetDate) {
          previousDay.push(reservation);
        }
      }
    }

    const all = [...sameDay, ...previousDay];

    logger.info({
      date,
      sameDayCount: sameDay.length,
      previousDayCount: previousDay.length,
      totalCount: all.length
    }, 'Retrieved reservations with cross-day logic');

    return { sameDay, previousDay, all };

  } catch (error) {
    logError(logger, error as Error, { 
      context: 'get_reservations_cross_day_failed',
      date,
      statusFilter
    });
    throw error;
  }
}

/**
 * Check if a reservation is still active on a specific date
 * (handles cross-midnight scenarios)
 */
function isReservationActiveOnDate(reservation: ReservationWithTableAndRoom, targetDate: string): boolean {
  const resDate = new Date(reservation.reservation_date + 'T00:00:00');
  const targetDateObj = new Date(targetDate + 'T00:00:00');
  
  // Only check reservations from the day before
  const daysDiff = Math.floor((targetDateObj.getTime() - resDate.getTime()) / (1000 * 60 * 60 * 24));
  if (daysDiff !== 1) return false;

  // Handle indefinite reservations
  if (Number(reservation.duration_hours) === -1) {
    const [hours] = reservation.reservation_time.split(':').map(Number);
    const resStartTime = new Date(resDate);
    resStartTime.setHours(hours, 0, 0, 0);
    
    // Indefinite reservations block until 6 AM next day maximum
    const maxBlockTime = new Date(resStartTime);
    maxBlockTime.setDate(maxBlockTime.getDate() + 1);
    maxBlockTime.setHours(6, 0, 0, 0);
    
    return targetDateObj < maxBlockTime;
  }

  // Handle regular reservations that cross midnight
  const [hours, minutes] = reservation.reservation_time.split(':').map(Number);
  const resStartTime = new Date(resDate);
  resStartTime.setHours(hours, minutes, 0, 0);
  
  const resEndTime = new Date(resStartTime);
  resEndTime.setTime(resEndTime.getTime() + Number(reservation.duration_hours) * 60 * 60 * 1000);
  
  // Check if reservation extends into the target date
  return resEndTime > targetDateObj;
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
          status: 'completed'
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
        const reservationDateString = extractDateString(reservation.reservation_date);
        
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
          duration_hours: actualDuration
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