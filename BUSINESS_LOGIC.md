# Reservation System

Application for managing reservations at a pub. Client calls the pub and employee creates a reservation.

## Reservation expected behaviour

### Reservation Status Types:
- active - Current active reservations
- completed - Finished reservations
- cancelled - Cancelled reservations

### Duration Types:
- Regular reservations: Specific duration (from 1 hour to 8 hours)
- Indefinite reservations: duration_hours = -1 (open-ended/unspecified duration)

### Time range of reservation:
- Time range restricted to pub operating hours (12:00-02:00)
- You can only make a reservation that is within the operating hours, in 15 minute intervals

### Manual Completion:
"Zakończ" button only appears when all of this is true:
    - Indefinite reservations (duration_hours = -1)
    - Active status
    - Reservations that have started
When "Zakończ" button is clicked: calculates actual elapsed time and completes the reservation

### Auto-Completion System:
Runs every minute and handles two scenarios:
  A. Regular Reservations:
    - Auto-completes when reservation time + duration has passed
    - Simply changes status to completed
  B. Indefinite Reservations:
    - Auto-completes after 6 hours of runtime
    - Calculates actual duration (capped at 6 hours)
    - Updates both status and duration

### Cross-Day Reservation Logic:
Handles reservations that span across midnight with specific business rules:

#### Regular Cross-Midnight Reservations:
- Reservations can extend past midnight (e.g., 22:00-02:00)
- Block tables on the next day until their actual end time
- Example: 26.08.2025 22:00-02:00 blocks table until 27.08.2025 02:00

#### Indefinite Cross-Day Reservations:
- Indefinite reservations from previous day block until maximum 06:00 AM next day
- Prevents indefinite reservations from blocking entire next day
- Example: 26.08.2025 18:00 (indefinite) blocks table until 27.08.2025 06:00

#### Availability Checking:
- Same-day conflicts: Standard overlap detection
- Previous-day conflicts: Checks if previous day reservations extend into target date/time
- Smart filtering: Only shows cross-day conflicts when there's actual time overlap
- Visual indicators: Cross-day reservations displayed distinctly in floor plan

#### Business Rules:
1. **Maximum Cross-Day Blocking**: Indefinite reservations never block beyond 06:00 AM next day
2. **Conflict Resolution**: Users cannot book tables during cross-day blocked periods
3. **Visual Clarity**: Previous day reservations shown with date badges (e.g., "z 2025-08-26")
4. **Smart Display**: Cross-day reservations only visible when they conflict with selected time

## Reservation Activity Log expected behaviour

Activity log should store only updates and cancellations of reservations that are made by user.
    - "action_type" field should be "updated" or "cancelled"
    - when reservation is auto-completed by the system, it should not be stored in the activity log