'use client';

import { useEffect, useRef } from 'react';
import { useToast } from '@/components/ui/Toast';
import { getReservations, completeReservation } from '@/lib/api-client';

// Global state to track notified reservations
const globalNotifiedReservations = new Set<string>();
// Global state to track toast IDs for 4-hour notifications (reservation ID -> toast ID)
// This ensures that when indefinite reservations are auto-completed after 6 hours,
// the 4-hour warning toasts are properly dismissed
const globalReservationToasts = new Map<string, string>();

export function GlobalReservationMonitor() {
  const { addToast, removeToast } = useToast();
  const monitorInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const checkReservations = async () => {
      try {
        // Get today's active reservations
        const today = new Date().toISOString().split('T')[0];
        const reservations = await getReservations({
          reservation_date: today,
          status: 'active'
        });

        const now = new Date();

        // Check each active indefinite reservation
        reservations.forEach((reservation) => {
          if (Number(reservation.duration_hours) !== -1) return; // Only indefinite reservations
          if (globalNotifiedReservations.has(reservation.id)) return; // Already notified
          
          // Parse reservation start time
          const [hours, minutes] = reservation.reservation_time.split(':').map(Number);
          const reservationStart = new Date();
          reservationStart.setHours(hours, minutes, 0, 0);
          
          // Check if 4 hours have passed since reservation start
          const fourHoursAfterStart = new Date(reservationStart.getTime() + 4 * 60 * 60 * 1000);
          
          if (now >= fourHoursAfterStart) {
            // Mark as notified to prevent duplicate notifications
            globalNotifiedReservations.add(reservation.id);
            
            // Show toast notification and store the toast ID
            const toastId = addToast({
              type: 'reservation',
              title: 'Czy rezerwacja trwa nadal?',
              message: `Stolik ${reservation.table.table_number} (${reservation.table.room.name}) - ${reservation.guest_name}. Rezerwacja rozpoczęta o ${reservation.reservation_time}.`,
              persistent: true, // Don't auto-dismiss
              dismissible: true, // Allow manual dismissal
              actions: [
                {
                  label: 'Zakończ rezerwację',
                  onClick: async () => {
                    try {
                      await completeReservation(reservation.id);
                      addToast({
                        type: 'success',
                        title: 'Rezerwacja zakończona',
                        message: `Rezerwacja dla ${reservation.guest_name} została zakończona.`,
                        dismissible: true,
                      });
                      
                      // Remove from global notified set and toast tracking since reservation is completed
                      globalNotifiedReservations.delete(reservation.id);
                      globalReservationToasts.delete(reservation.id);
                    } catch (error) {
                      addToast({
                        type: 'error',
                        title: 'Błąd',
                        message: 'Nie udało się zakończyć rezerwacji.',
                        dismissible: true,
                      });
                    }
                  },
                  variant: 'success',
                },
                {
                  label: 'Trwa nadal',
                  onClick: () => {
                    // Remove toast tracking when manually dismissed
                    globalReservationToasts.delete(reservation.id);
                  },
                  variant: 'secondary',
                },
              ],
            });
            
            // Store the toast ID for this reservation
            globalReservationToasts.set(reservation.id, toastId);
          }
        });

        // Clean up notified reservations that are no longer active
        const activeIds = new Set(reservations.map(r => r.id));
        const notifiedIds = Array.from(globalNotifiedReservations);
        
        notifiedIds.forEach(id => {
          if (!activeIds.has(id)) {
            globalNotifiedReservations.delete(id);
            
            // Also dismiss the toast if it exists
            const toastId = globalReservationToasts.get(id);
            if (toastId) {
              removeToast(toastId);
              globalReservationToasts.delete(id);
            }
          }
        });

      } catch (error) {
        console.error('Error checking reservations:', error);
      }
    };

    const checkAutoCompletion = async () => {
      try {
        const response = await fetch('/api/reservations/auto-complete', {
          method: 'POST',
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.completedCount > 0) {
            addToast({
              type: 'info',
              title: 'Automatyczne zakończenie',
              message: `Automatycznie zakończono ${data.completedCount} rezerwacji po 6 godzinach.`,
              dismissible: true,
            });
          }
        }
      } catch (error) {
        console.error('Error checking for auto-completion:', error);
      }
    };

    // Initial check
    checkReservations();
    checkAutoCompletion();

    // Set up interval to check every 2 minutes
    monitorInterval.current = setInterval(() => {
      checkReservations();
      checkAutoCompletion();
    }, 120000); // 2 minutes

    return () => {
      if (monitorInterval.current) {
        clearInterval(monitorInterval.current);
      }
    };
  }, [addToast]);

  // This component doesn't render anything
  return null;
} 