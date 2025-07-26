import { useEffect, useRef } from 'react';
import { useToast } from '@/components/ui';
import { completeReservation } from '@/lib/api-client';

interface ActiveReservation {
  id: string;
  guest_name: string;
  table_number: string;
  room_name: string;
  reservation_time: string;
  duration_hours: number;
}

interface UseReservationMonitorProps {
  reservations: ActiveReservation[];
  onReservationCompleted?: () => void;
}

export function useReservationMonitor({ 
  reservations, 
  onReservationCompleted 
}: UseReservationMonitorProps) {
  const { addToast } = useToast();
  const notifiedReservations = useRef<Set<string>>(new Set());
  const autoCompletionInterval = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Check for auto-completion every minute
    autoCompletionInterval.current = setInterval(async () => {
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
            
            if (onReservationCompleted) {
              onReservationCompleted();
            }
          }
        }
      } catch (error) {
        console.error('Error checking for auto-completion:', error);
      }
    }, 60000); // Check every minute

    return () => {
      if (autoCompletionInterval.current) {
        clearInterval(autoCompletionInterval.current);
      }
    };
  }, [addToast, onReservationCompleted]);

  useEffect(() => {
    const now = new Date();
    
    // Check each active indefinite reservation
    reservations.forEach((reservation) => {
      if (Number(reservation.duration_hours) !== -1) return; // Only indefinite reservations
      if (notifiedReservations.current.has(reservation.id)) return; // Already notified
      
      // Parse reservation start time
      const [hours, minutes] = reservation.reservation_time.split(':').map(Number);
      const reservationStart = new Date();
      reservationStart.setHours(hours, minutes, 0, 0);
      
      // Check if 4 hours have passed since reservation start
      const fourHoursAfterStart = new Date(reservationStart.getTime() + 4 * 60 * 60 * 1000);
      
      if (now >= fourHoursAfterStart) {
        // Mark as notified to prevent duplicate notifications
        notifiedReservations.current.add(reservation.id);
        
        // Show toast notification
        addToast({
          type: 'reservation',
          title: 'Czy rezerwacja trwa nadal?',
          message: `Stolik ${reservation.table_number} (${reservation.room_name}) - ${reservation.guest_name}. Rezerwacja rozpoczęta o ${reservation.reservation_time}.`,
          persistent: true, // Don't auto-dismiss
          dismissible: true, // Allow manual dismissal
          actions: [
            {
              label: 'Zakończ rezerwację',
              onClick: async () => {
                try {
                  await completeReservation(reservation.id, 'System Monitor');
                  addToast({
                    type: 'success',
                    title: 'Rezerwacja zakończona',
                    message: `Rezerwacja dla ${reservation.guest_name} została zakończona.`,
                    dismissible: true,
                  });
                  
                  if (onReservationCompleted) {
                    onReservationCompleted();
                  }
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
                // Just dismiss the toast - reservation continues
              },
              variant: 'secondary',
            },
          ],
        });
      }
    });
  }, [reservations, addToast, onReservationCompleted]);

  // Clean up notified reservations that are no longer active
  useEffect(() => {
    const activeIds = new Set(reservations.map(r => r.id));
    const notifiedIds = Array.from(notifiedReservations.current);
    
    notifiedIds.forEach(id => {
      if (!activeIds.has(id)) {
        notifiedReservations.current.delete(id);
      }
    });
  }, [reservations]);
} 