// Database entity types for Restaurant Booking System

export interface Room {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Table {
  id: string;
  room_id: string;
  table_number: string;
  max_capacity: number;
  shape: 'square' | 'circle' | 'rectangle';
  position_x?: number;
  position_y?: number;
  size_scale?: number;
  width_ratio?: number;
  height_ratio?: number;
  orientation?: 'horizontal' | 'vertical';
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface Employee {
  id: string;
  first_name: string;
  last_name: string;
  display_name: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateEmployeeInput {
  first_name: string;
  last_name: string;
  display_name: string;
  is_active?: boolean;
}

export interface UpdateEmployeeInput {
  first_name?: string;
  last_name?: string;
  display_name?: string;
  is_active?: boolean;
}

export interface Reservation {
  id: string;
  table_id: string;
  guest_name: string;
  guest_phone?: string;
  party_size: number;
  reservation_date: Date | string; // Can be Date from DB or string from API
  reservation_time: string; // Time as string (HH:MM format)
  duration_hours: number;
  notes?: string;
  status: 'active' | 'cancelled' | 'completed';
  created_by?: string;
  created_at: Date;
  updated_at: Date;
}

// Extended types with joined data
export interface TableWithRoom extends Table {
  room: Room;
}

export interface ReservationWithTable extends Reservation {
  table: Table;
}

export interface ReservationWithTableAndRoom extends Reservation {
  table: TableWithRoom;
}

// Input types for creating/updating entities
export interface CreateRoomInput {
  name: string;
  description?: string;
  is_active?: boolean;
}

export interface UpdateRoomInput {
  name?: string;
  description?: string;
  is_active?: boolean;
}

export interface CreateTableInput {
  room_id: string;
  table_number: string;
  max_capacity: number;
  shape?: 'square' | 'circle' | 'rectangle';
  position_x?: number;
  position_y?: number;
  size_scale?: number;
  width_ratio?: number;
  height_ratio?: number;
  orientation?: 'horizontal' | 'vertical';
  is_active?: boolean;
}

export interface UpdateTableInput {
  room_id?: string;
  table_number?: string;
  max_capacity?: number;
  shape?: 'square' | 'circle' | 'rectangle';
  position_x?: number;
  position_y?: number;
  size_scale?: number;
  width_ratio?: number;
  height_ratio?: number;
  orientation?: 'horizontal' | 'vertical';
  is_active?: boolean;
}

export interface CreateReservationInput {
  table_id: string;
  guest_name: string;
  guest_phone?: string;
  party_size: number;
  reservation_date: Date | string;
  reservation_time: string;
  duration_hours?: number;
  notes?: string;
  created_by?: string;
}

export interface UpdateReservationInput {
  table_id?: string;
  guest_name?: string;
  guest_phone?: string;
  party_size?: number;
  reservation_date?: Date | string;
  reservation_time?: string;
  duration_hours?: number;
  notes?: string;
  status?: 'active' | 'cancelled' | 'completed';
  complete_now?: boolean; // Signal to calculate actual duration for indefinite reservations
}

// Filter and query types
export interface ReservationFilters {
  room_id?: string;
  table_id?: string;
  reservation_date?: Date | string;
  reservation_date_from?: Date | string;
  reservation_date_to?: Date | string;
  reservation_time?: string;
  guest_name?: string;
  guest_phone?: string;
  status?: 'active' | 'cancelled' | 'completed' | 'all';
  created_by?: string;
}

export interface TableAvailabilityQuery {
  room_id?: string;
  reservation_date: Date | string;
  reservation_time: string;
  duration_hours?: number;
  party_size?: number;
}

// Response types
export interface TableAvailability {
  table: TableWithRoom;
  is_available: boolean;
  conflicting_reservations?: Reservation[];
}

export interface RoomAvailability {
  room: Room;
  tables: TableAvailability[];
  available_tables: number;
  total_tables: number;
}

// Time slot types for the UI
export interface TimeSlot {
  time: string; // HH:MM format
  label: string; // Display label like "6:00 PM"
  is_available: boolean;
}

export interface AvailableTimeSlots {
  date: Date;
  slots: TimeSlot[];
}

// Dashboard/Overview types
export interface ReservationSummary {
  total_reservations: number;
  active_reservations: number;
  cancelled_reservations: number;
  completed_reservations: number;
  total_guests: number;
}

export interface DailyOccupancy {
  date: Date;
  total_tables: number;
  reserved_tables: number;
  occupancy_rate: number; // Percentage
  peak_hour: string;
  peak_hour_reservations: number;
}

// Error types
export interface DatabaseError {
  code: string;
  message: string;
  detail?: string;
}

export interface ValidationError {
  field: string;
  message: string;
} 

// Activity Log types
export interface ReservationActivityLog {
  id: string;
  reservation_id: string;
  action_type: 'updated' | 'cancelled';
  performed_at: Date;
  field_changes?: Record<string, { old: any; new: any }>;
  reservation_snapshot: Record<string, any>;
  notes?: string;
  ip_address?: string;
  user_agent?: string;
}

export interface ActivityLogWithReservation extends ReservationActivityLog {
  reservation?: Reservation;
  table_number?: string;
  room_name?: string;
}

export interface CreateActivityLogInput {
  reservation_id: string;
  action_type: 'updated' | 'cancelled';
  field_changes?: Record<string, { old: any; new: any }>;
  reservation_snapshot?: Record<string, any>;
  notes?: string;
  ip_address?: string;
  user_agent?: string;
}

export interface ActivityLogFilters {
  reservation_id?: string;
  action_type?: 'updated' | 'cancelled';
  performed_at_from?: Date | string;
  performed_at_to?: Date | string;
  guest_name?: string; // Search in reservation snapshot
  table_id?: string;
  room_id?: string;
  search_term?: string; // General search across multiple fields
}

export interface ActivityLogSummary {
  total_activities: number;
  activities_by_type: {
    updated: number;
    cancelled: number;
  };
  activities_by_user: Array<{
    user: string;
    count: number;
  }>;
  recent_activities: ActivityLogWithReservation[];
}

// Extended reservation types to include activity history
export interface ReservationWithActivity extends ReservationWithTableAndRoom {
  activity_logs?: ReservationActivityLog[];
  last_activity?: ReservationActivityLog;
} 