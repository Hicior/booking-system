import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardTitle, CardContent, Button, Select, DateSelector } from "./ui";
import { FloorPlan } from "./FloorPlan";
import { ReservationModal } from "./ReservationModal";
import { Room, Table, Reservation } from "@/lib/types";
import {
  getRooms,
  getAllTablesWithRooms,
  getReservations,
  generateTimeSlots,
  formatTimeForDisplay,
} from "@/lib/api-client";
import { useReservationMonitor } from "@/hooks/useReservationMonitor";

interface OverviewDashboardProps {
  selectedDate: string;
  onDateChange: (date: string) => void;
}

export function OverviewDashboard({
  selectedDate,
  onDateChange,
}: OverviewDashboardProps) {
  // Data state
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allTables, setAllTables] = useState<Table[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");

  // Time selection state
  const [selectedTime, setSelectedTime] = useState<string>("");

  // Show completed reservations toggle state
  const [showCompleted, setShowCompleted] = useState<boolean>(false);

  // Modal state
  const [reservationModal, setReservationModal] = useState({
    isOpen: false,
    table: null as Table | null,
    existingReservation: null as Reservation | null,
  });

  // Load initial data
  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const [roomsData, tablesData] = await Promise.all([
          getRooms(),
          getAllTablesWithRooms(),
        ]);
        setRooms(roomsData);
        setAllTables(tablesData);
      } catch (error) {
        console.error("Error loading data:", error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, []);

  // Load reservations when date or showCompleted toggle changes
  useEffect(() => {
    const loadReservations = async () => {
      if (!selectedDate) return;

      try {
        if (showCompleted) {
          // Load both active and completed reservations
          const [activeReservations, completedReservations] = await Promise.all([
            getReservations({
              reservation_date: selectedDate,
              status: "active",
            }),
            getReservations({
              reservation_date: selectedDate,
              status: "completed",
            })
          ]);
          
          // Combine both arrays
          const allReservations = [...activeReservations, ...completedReservations];
          setReservations(allReservations);
        } else {
          // Load only active reservations
          const reservationsData = await getReservations({
            reservation_date: selectedDate,
            status: "active",
          });
          setReservations(reservationsData);
        }
      } catch (error) {
        console.error("Error loading reservations:", error);
      }
    };

    loadReservations();
  }, [selectedDate, showCompleted]);

  // Get tables for a specific room
  const getRoomTables = (roomId: string) => {
    return allTables.filter((table) => table.room_id === roomId);
  };

  // Get reservations for a specific table at selected time
  const getTableReservations = (tableId: string) => {
    let tableReservations = reservations.filter((r) => r.table_id === tableId);

    if (selectedTime) {
      tableReservations = tableReservations.filter((r) => {
        // Indefinite reservations (-1) block from their start time onwards
        if (Number(r.duration_hours) === -1) {
          const resStartTime = new Date(`1970-01-01 ${r.reservation_time}`);
          const selectedDateTime = new Date(`1970-01-01 ${selectedTime}`);
          
          // Block if selected time is at or after the indefinite reservation start time
          return selectedDateTime >= resStartTime;
        }

        const resTime = r.reservation_time;
        const resStartTime = new Date(`1970-01-01 ${resTime}`);
        const resEndTime = new Date(`1970-01-01 ${resTime}`);
        const durationHours = Number(r.duration_hours);
        resEndTime.setHours(resEndTime.getHours() + durationHours);

        let selectedDateTime = new Date(`1970-01-01 ${selectedTime}`);

        // Handle midnight crossover: if selected time appears to be before reservation start time,
        // but we're dealing with a late-night scenario, add a day to the selected time
        if (
          selectedDateTime < resStartTime &&
          resEndTime.getDate() > resStartTime.getDate()
        ) {
          selectedDateTime = new Date(`1970-01-02 ${selectedTime}`);
        }

        return (
          selectedDateTime >= resStartTime && selectedDateTime < resEndTime
        );
      });
    }

    return tableReservations;
  };

  // Check if table is available at selected time
  const isTableAvailable = (tableId: string) => {
    const tableReservations = getTableReservations(tableId);
    return tableReservations.length === 0;
  };

  const timeSlots = generateTimeSlots();

  const handleTableClick = (table: Table) => {
    setReservationModal({
      isOpen: true,
      table,
      existingReservation: null,
    });
  };

  const handleCloseReservationModal = () => {
    setReservationModal({
      isOpen: false,
      table: null,
      existingReservation: null,
    });
  };

  const handleReservationCreated = () => {
    // Reload reservations for the current date
    if (selectedDate) {
      if (showCompleted) {
        // Load both active and completed reservations
        Promise.all([
          getReservations({
            reservation_date: selectedDate,
            status: "active",
          }),
          getReservations({
            reservation_date: selectedDate,
            status: "completed",
          })
        ]).then(([activeReservations, completedReservations]) => {
          const allReservations = [...activeReservations, ...completedReservations];
          setReservations(allReservations);
        }).catch(console.error);
      } else {
        // Load only active reservations
        getReservations({
          reservation_date: selectedDate,
          status: "active",
        })
          .then(setReservations)
          .catch(console.error);
      }
    }
  };

  // Transform reservations for monitoring hook
  const activeReservationsForMonitoring = reservations
    .filter(r => r.status === 'active' && Number(r.duration_hours) === -1)
    .map(r => {
      const table = allTables.find(t => t.id === r.table_id);
      const room = rooms.find(room => room.id === table?.room_id);
      
      return {
        id: r.id,
        guest_name: r.guest_name,
        table_number: table?.table_number || 'Unknown',
        room_name: room?.name || 'Unknown',
        reservation_time: r.reservation_time,
        duration_hours: r.duration_hours,
      };
    });

  // Use reservation monitoring hook
  useReservationMonitor({
    reservations: activeReservationsForMonitoring,
    onReservationCompleted: handleReservationCreated,
  });

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-base-content/70">Ładowanie przeglądu...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-end mb-3">
        <div className="text-sm text-base-content/70">
          {selectedDate && (
            <span>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString("pl", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              {selectedTime && ` o ${formatTimeForDisplay(selectedTime)}`}
            </span>
          )}
        </div>
      </div>

      {/* Date and Time Filter */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Filtry daty i godziny</CardTitle>
            <div className="flex items-center space-x-3">
              <span className="text-sm font-medium text-base-content">
                Pokaż zakończone rezerwacje
              </span>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={showCompleted}
                  onChange={(e) => setShowCompleted(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-base-300 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
              </label>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <DateSelector
              selectedDate={selectedDate}
              onDateChange={onDateChange}
              label="Przegląd dla daty"
            />
            
            <div className="space-y-4">
              <Select
                label="Filtruj według godziny"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                options={[
                  { value: "", label: "Wszystkie godziny" },
                  ...timeSlots.map((time) => ({
                    value: time,
                    label: formatTimeForDisplay(time),
                  })),
                ]}
                fullWidth
              />

              <Button
                variant="secondary"
                onClick={() => setSelectedTime("")}
                disabled={!selectedTime}
                fullWidth
              >
                Wyczyść filtr godziny
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comprehensive Floor Plan */}
      <FloorPlan
        rooms={rooms}
        allTables={allTables}
        reservations={reservations}
        selectedDate={selectedDate}
        selectedTime={selectedTime}
        onTableClick={handleTableClick}
      />

      {/* Reservation Modal */}
      <ReservationModal
        isOpen={reservationModal.isOpen}
        onClose={handleCloseReservationModal}
        table={reservationModal.table}
        selectedDate={selectedDate}
        selectedTime={selectedTime || "12:00"}
        onReservationCreated={handleReservationCreated}
        existingReservation={reservationModal.existingReservation}
      />
    </div>
  );
}
