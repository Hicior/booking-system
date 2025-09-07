-- Database schema for Restaurant Booking System
-- Created based on requirements in README.md

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Employees table (for tracking who creates reservations)
CREATE TABLE employees (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    display_name VARCHAR(200) NOT NULL UNIQUE,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Rooms table (Sala barowa, Sala duża, etc.)
CREATE TABLE rooms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tables in each room (A1, A2, B1, etc.)
CREATE TABLE tables (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    room_id UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
    table_number VARCHAR(10) NOT NULL, -- A1, A2, B1, etc.
    max_capacity INTEGER NOT NULL,
    shape VARCHAR(20) DEFAULT 'square', -- square, circle, rectangle
    position_x FLOAT, -- For layout positioning
    position_y FLOAT, -- For layout positioning
    size_scale FLOAT DEFAULT 1.0, -- Overall size scaling factor
    width_ratio FLOAT DEFAULT 1.0, -- Width proportion for rectangles
    height_ratio FLOAT DEFAULT 1.0, -- Height proportion for rectangles
    orientation VARCHAR(10) DEFAULT 'horizontal', -- Rectangle orientation: 'horizontal' or 'vertical'
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    UNIQUE(room_id, table_number),
    CONSTRAINT valid_size_scale CHECK (size_scale > 0 AND size_scale <= 3.0),
    CONSTRAINT valid_width_ratio CHECK (width_ratio > 0 AND width_ratio <= 3.0),
    CONSTRAINT valid_height_ratio CHECK (height_ratio > 0 AND height_ratio <= 3.0),
    CONSTRAINT valid_orientation CHECK (orientation IN ('horizontal', 'vertical'))
);

-- Reservations table
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    table_id UUID NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    guest_name VARCHAR(255) NOT NULL,
    guest_phone VARCHAR(20),
    party_size INTEGER NOT NULL,
    reservation_date DATE NOT NULL,
    reservation_time TIME NOT NULL,
    duration_hours NUMERIC DEFAULT 2.0, -- Default 2 hours, supports decimal hours (e.g., 2.5h)
    notes TEXT,
    status VARCHAR(20) DEFAULT 'active', -- active, cancelled, completed
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL, -- Employee who made the reservation
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    CONSTRAINT valid_party_size CHECK (party_size > 0),
    CONSTRAINT valid_status CHECK (status IN ('active', 'cancelled', 'completed'))
);

-- Reservation Activity Logs table (for tracking changes)
CREATE TABLE reservation_activity_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    reservation_id UUID NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
    action_type VARCHAR(20) NOT NULL, -- 'updated', 'cancelled'
    performed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    field_changes JSONB, -- JSON object containing old/new values
    reservation_snapshot JSONB NOT NULL, -- Full reservation data snapshot
    notes TEXT,
    ip_address INET,
    user_agent TEXT,
    
    CONSTRAINT valid_action_type CHECK (action_type IN ('updated', 'cancelled'))
);

-- Indexes for better performance
CREATE INDEX idx_reservations_date ON reservations(reservation_date);
CREATE INDEX idx_reservations_table_date ON reservations(table_id, reservation_date);
CREATE INDEX idx_reservations_guest_name ON reservations(guest_name);
CREATE INDEX idx_reservations_guest_phone ON reservations(guest_phone);
CREATE INDEX idx_reservations_employee_id ON reservations(employee_id);
CREATE INDEX idx_tables_room ON tables(room_id);

-- Additional indexes for employees
CREATE INDEX idx_employees_active ON employees(is_active);
CREATE INDEX idx_employees_display_name ON employees(display_name);

-- Activity logs indexes for performance
CREATE INDEX idx_activity_logs_action_type ON reservation_activity_logs(action_type);
CREATE INDEX idx_activity_logs_changes ON reservation_activity_logs USING gin(field_changes);
CREATE INDEX idx_activity_logs_date_range ON reservation_activity_logs(performed_at DESC);
CREATE INDEX idx_activity_logs_performed_at ON reservation_activity_logs(performed_at);
CREATE INDEX idx_activity_logs_reservation_date ON reservation_activity_logs(reservation_id, performed_at DESC);
CREATE INDEX idx_activity_logs_reservation_id ON reservation_activity_logs(reservation_id);
CREATE INDEX idx_activity_logs_snapshot ON reservation_activity_logs USING gin(reservation_snapshot);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to check for overlapping reservations (handles indefinite duration -1)
CREATE OR REPLACE FUNCTION check_reservation_overlap()
RETURNS TRIGGER AS $$
DECLARE
    overlap_count INTEGER;
BEGIN
    -- Check for overlapping reservations on the same table and date
    SELECT COUNT(*) INTO overlap_count
    FROM reservations
    WHERE table_id = NEW.table_id
        AND reservation_date = NEW.reservation_date
        AND status = 'active'
        AND id != COALESCE(NEW.id, uuid_generate_v4()) -- Exclude current record for updates
        AND (
            CASE 
                -- If new reservation is indefinite (-1)
                WHEN NEW.duration_hours = -1 THEN (
                    -- Conflict with other indefinite reservations
                    duration_hours = -1
                    OR
                    -- Conflict with finite reservations that end after our start time
                    (reservation_time + (duration_hours || ' hours')::INTERVAL) > NEW.reservation_time
                )
                -- If new reservation has finite duration
                ELSE (
                    -- Conflict with indefinite reservations that start at or before our end time
                    (duration_hours = -1 AND reservation_time <= (NEW.reservation_time + (NEW.duration_hours || ' hours')::INTERVAL))
                    OR
                                              -- Regular time overlap check for finite durations with midnight crossover handling
                          (
                              duration_hours > 0
                              AND (
                                  -- Comprehensive midnight crossover handling
                                  CASE 
                                      -- Case 1: Neither reservation crosses midnight
                                      WHEN (reservation_time + (duration_hours || ' hours')::INTERVAL)::time >= reservation_time
                                           AND (NEW.reservation_time + (NEW.duration_hours || ' hours')::INTERVAL)::time >= NEW.reservation_time
                                      THEN (
                                          NEW.reservation_time < (reservation_time + (duration_hours || ' hours')::INTERVAL)::time
                                          AND (NEW.reservation_time + (NEW.duration_hours || ' hours')::INTERVAL)::time > reservation_time
                                      )
                                      -- Case 2: Existing reservation crosses midnight, new doesn't
                                      WHEN (reservation_time + (duration_hours || ' hours')::INTERVAL)::time < reservation_time
                                           AND (NEW.reservation_time + (NEW.duration_hours || ' hours')::INTERVAL)::time >= NEW.reservation_time
                                      THEN (
                                          NEW.reservation_time >= reservation_time
                                          OR (NEW.reservation_time + (NEW.duration_hours || ' hours')::INTERVAL)::time > reservation_time
                                          OR (NEW.reservation_time + (NEW.duration_hours || ' hours')::INTERVAL)::time <= (reservation_time + (duration_hours || ' hours')::INTERVAL)::time
                                      )
                                      -- Case 3: New reservation crosses midnight, existing doesn't  
                                      WHEN (reservation_time + (duration_hours || ' hours')::INTERVAL)::time >= reservation_time
                                           AND (NEW.reservation_time + (NEW.duration_hours || ' hours')::INTERVAL)::time < NEW.reservation_time
                                      THEN (
                                          (NEW.reservation_time + (NEW.duration_hours || ' hours')::INTERVAL)::time > reservation_time
                                          OR NEW.reservation_time < (reservation_time + (duration_hours || ' hours')::INTERVAL)::time
                                      )
                                      -- Case 4: Both reservations cross midnight
                                      ELSE (
                                          true -- Always conflict when both cross midnight
                                      )
                                  END
                              )
                          )
                )
            END
        );
    
    IF overlap_count > 0 THEN
        RAISE EXCEPTION 'Reservation conflicts with existing reservation on the same table and time';
    END IF;
    
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Function to log reservation activity
CREATE OR REPLACE FUNCTION log_reservation_activity(
    p_reservation_id UUID,
    p_action_type VARCHAR(20),
    p_field_changes JSONB DEFAULT NULL,
    p_reservation_snapshot JSONB DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_ip_address INET DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    log_id UUID;
    current_reservation_data JSONB;
BEGIN
    -- If no snapshot provided, get current reservation data
    IF p_reservation_snapshot IS NULL THEN
        SELECT row_to_json(r.*) INTO current_reservation_data
        FROM reservations r
        WHERE r.id = p_reservation_id;
        
        IF current_reservation_data IS NULL THEN
            RAISE EXCEPTION 'Reservation not found: %', p_reservation_id;
        END IF;
    ELSE
        current_reservation_data := p_reservation_snapshot;
    END IF;
    
    -- Insert activity log
    INSERT INTO reservation_activity_logs (
        reservation_id,
        action_type,
        field_changes,
        reservation_snapshot,
        notes,
        ip_address,
        user_agent
    ) VALUES (
        p_reservation_id,
        p_action_type,
        p_field_changes,
        current_reservation_data,
        p_notes,
        p_ip_address,
        p_user_agent
    ) RETURNING id INTO log_id;
    
    RETURN log_id;
END;
$$ language 'plpgsql';

-- Function to cleanup old activity logs
CREATE OR REPLACE FUNCTION cleanup_old_activity_logs(months_to_keep INTEGER DEFAULT 12)
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
    cutoff_date TIMESTAMP WITH TIME ZONE;
BEGIN
    cutoff_date := CURRENT_TIMESTAMP - (months_to_keep || ' months')::INTERVAL;
    
    DELETE FROM reservation_activity_logs
    WHERE performed_at < cutoff_date;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    
    RETURN deleted_count;
END;
$$ language 'plpgsql';

-- Function to format duration for display
CREATE OR REPLACE FUNCTION format_duration_display(duration_hours NUMERIC)
RETURNS TEXT AS $$
BEGIN
    CASE 
        WHEN duration_hours = -1 THEN 
            RETURN 'nieokreślony'::TEXT;
        WHEN duration_hours IS NULL THEN 
            RETURN 'nieznany'::TEXT;
        ELSE 
            RETURN duration_hours::TEXT || 'h';
    END CASE;
END;
$$ language 'plpgsql';

-- Triggers to automatically update updated_at
CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rooms_updated_at BEFORE UPDATE ON rooms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tables_updated_at BEFORE UPDATE ON tables
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reservations_updated_at BEFORE UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Trigger to prevent overlapping reservations
CREATE TRIGGER prevent_reservation_overlap 
    BEFORE INSERT OR UPDATE ON reservations
    FOR EACH ROW EXECUTE FUNCTION check_reservation_overlap();