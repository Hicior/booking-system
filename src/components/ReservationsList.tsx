import React, { useState, useEffect } from "react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Button,
  Input,
  Select,
} from "./ui";
// Removed inline day quick picker; range controls only
import { ReservationModal } from "./ReservationModal";
import { Room, ReservationWithTableAndRoom, Table, Employee } from "@/lib/types";
import {
  getReservations,
  deleteReservation,
  completeReservation,
  formatTimeForDisplay,
  getEmployees,
  autoCompleteExpiredReservations,
} from "@/lib/api-client";
import { getTodayInPoland } from "@/lib/date-utils";


interface ReservationsListProps {
  rooms: Room[];
  selectedDate?: string;
  onDateChange?: (date: string) => void;
}

export function ReservationsList({
  rooms,
  selectedDate,
  onDateChange,
}: ReservationsListProps) {
  const [reservations, setReservations] = useState<
    ReservationWithTableAndRoom[]
  >([]);
  const [filteredReservations, setFilteredReservations] = useState<
    ReservationWithTableAndRoom[]
  >([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>("");
  const [employees, setEmployees] = useState<Employee[]>([]);

  // Date range state
  const [rangeMode, setRangeMode] = useState<"single" | "range">("single");
  const [rangeStart, setRangeStart] = useState<string>(selectedDate || getTodayInPoland());
  const [rangeEnd, setRangeEnd] = useState<string>(selectedDate || getTodayInPoland());

  // Filter and search state
  const [filters, setFilters] = useState({
    status: "all", // Show all statuses by default
    room_id: "",
    time: "",
    employee: "",
    search: "",
  });

  // Modal state
  const [editModal, setEditModal] = useState({
    isOpen: false,
    reservation: null as ReservationWithTableAndRoom | null,
  });

  // Tooltip state
  const [tooltipReservation, setTooltipReservation] = useState<string | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

  // Load employees
  useEffect(() => {
    const loadEmployees = async () => {
      try {
        const employeeData = await getEmployees();
        setEmployees(employeeData);
      } catch (err) {
        console.error("Error loading employees:", err);
      }
    };

    loadEmployees();
  }, []);

  // Sync internal range state when parent selectedDate changes
  useEffect(() => {
    if (selectedDate) {
      setRangeMode('single');
      setRangeStart(selectedDate);
      setRangeEnd(selectedDate);
    }
  }, [selectedDate]);

  // Load reservations function
  const loadReservations = async () => {
    if (!selectedDate && rangeMode === "single") return;

    setLoading(true);
    try {
      // First, auto-complete any expired reservations
      try {
        await autoCompleteExpiredReservations();
      } catch (autoCompleteError) {
        console.warn('Auto-completion failed:', autoCompleteError);
        // Continue with loading even if auto-completion fails
      }

      // Helper to sort consistently by date asc, time asc within status groups
      const sortReservations = (data: ReservationWithTableAndRoom[]) => {
        const statusOrder = { active: 0, completed: 1, cancelled: 2 } as const;
        return data.sort((a, b) => {
          if (a.status !== b.status) {
            return (
              statusOrder[a.status as keyof typeof statusOrder] -
              statusOrder[b.status as keyof typeof statusOrder]
            );
          }
          // Compare by date (YYYY-MM-DD strings)
          if (a.reservation_date !== b.reservation_date) {
            return a.reservation_date.toString().localeCompare(b.reservation_date.toString());
          }
          // Then by time ascending
          return a.reservation_time.localeCompare(b.reservation_time);
        });
      };

      let reservationData: ReservationWithTableAndRoom[] = [];

      if (rangeMode === "single") {
        // Single day behaviour (backwards compatible)
        if (filters.status === "all") {
          const [activeData, completedData, cancelledData] = await Promise.all([
            getReservations({ reservation_date: selectedDate, status: "active" }),
            getReservations({ reservation_date: selectedDate, status: "completed" }),
            getReservations({ reservation_date: selectedDate, status: "cancelled" })
          ]);
          reservationData = [...activeData, ...completedData, ...cancelledData];
        } else {
          reservationData = await getReservations({
            reservation_date: selectedDate,
            status: filters.status as "active" | "completed" | "cancelled",
          });
        }
      } else {
        // Range mode: use server-side date range filtering in a single request
        if (!rangeStart || !rangeEnd) {
          setReservations([]);
          return;
        }

        // Normalize ordering
        const start = new Date(rangeStart + "T12:00:00");
        const end = new Date(rangeEnd + "T12:00:00");
        const from = start <= end ? rangeStart : rangeEnd;
        const to = start <= end ? rangeEnd : rangeStart;

        reservationData = await getReservations({
          reservation_date_from: from,
          reservation_date_to: to,
          status: filters.status as "active" | "completed" | "cancelled" | "all",
          room_id: filters.room_id || undefined,
          employee_id: filters.employee || undefined,
        } as any);
      }

      const sortedData = sortReservations(reservationData);
      
      setReservations(sortedData);
    } catch (err) {
      setError("Nie udało się załadować rezerwacji");
      console.error("Error loading reservations:", err);
    } finally {
      setLoading(false);
    }
  };

  // Load reservations effect
  useEffect(() => {
    loadReservations();
  }, [selectedDate, filters.status, rangeMode, rangeStart, rangeEnd]);

  // Apply filters and search
  useEffect(() => {
    let filtered = [...reservations];

    // Room filter
    if (filters.room_id) {
      filtered = filtered.filter((r) => r.table.room_id === filters.room_id);
    }

    // Time filter - show reservations active during the selected time
    if (filters.time) {
      filtered = filtered.filter((r) => {
        // Indefinite reservations are always active regardless of time filter
        if (Number(r.duration_hours) === -1) {
          return true;
        }

        const [startHours, startMinutes] = r.reservation_time
          .split(":")
          .map(Number);
        const startTimeInMinutes = startHours * 60 + startMinutes;
        const endTimeInMinutes = startTimeInMinutes + r.duration_hours * 60;

        const [filterHours, filterMinutes] = filters.time
          .split(":")
          .map(Number);
        const filterTimeInMinutes = filterHours * 60 + filterMinutes;

        // Check if filter time falls within the reservation period (inclusive)
        return (
          filterTimeInMinutes >= startTimeInMinutes &&
          filterTimeInMinutes <= endTimeInMinutes
        );
      });
    }

    // Employee filter
    if (filters.employee) {
      filtered = filtered.filter((r) => r.employee_id === filters.employee);
    }

    // Search filter
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.guest_name.toLowerCase().includes(searchTerm) ||
          (r.guest_phone && r.guest_phone.toLowerCase().includes(searchTerm)) ||
          r.table.table_number.toLowerCase().includes(searchTerm)
      );
    }

    // Sort by status (active first, then completed, then cancelled) then by time (newest first)
    filtered.sort((a, b) => {
      const statusOrder = { active: 0, completed: 1, cancelled: 2 };
      if (a.status !== b.status) {
        return statusOrder[a.status as keyof typeof statusOrder] - statusOrder[b.status as keyof typeof statusOrder];
      }
      // Sort by time in descending order (newest/latest first)
      return b.reservation_time.localeCompare(a.reservation_time);
    });

    setFilteredReservations(filtered);
  }, [reservations, filters.room_id, filters.time, filters.employee, filters.search]);

  const handleSearch = async (searchTerm: string) => {
    if (searchTerm.trim() === "") {
      setFilters((prev) => ({ ...prev, search: "" }));
      return;
    }

    setFilters((prev) => ({ ...prev, search: searchTerm }));
  };

  const handleEditReservation = (reservation: ReservationWithTableAndRoom) => {
    setEditModal({
      isOpen: true,
      reservation,
    });
  };

  const handleDeleteReservation = async (
    reservationId: string,
    isPastDate: boolean = false
  ) => {
    const action = "anulować";
    const confirmMessage = "Czy na pewno chcesz anulować tę rezerwację?";

    if (!confirm(confirmMessage)) return;

    try {
      const result = await deleteReservation(reservationId);
      if (result.success) {
        // If we cancelled a reservation and are currently showing only active,
        // switch to show all so the user can see the cancelled reservation
        if (filters.status === "active") {
          setFilters(prev => ({ ...prev, status: "all" }));
        }
        
        // Reload reservations to get updated data from server
        await loadReservations();
      }
    } catch (err) {
      console.error(`Error ${action}ing reservation:`, err);
      alert(`Nie udało się ${action} rezerwacji`);
    }
  };

  const handleCompleteReservation = async (reservationId: string) => {
    if (!confirm("Czy na pewno chcesz oznaczyć tę rezerwację jako zakończoną?")) return;

    try {
      const updatedReservation = await completeReservation(reservationId);
      // Update the reservation in the list instead of removing it
      setReservations((prev) => 
        prev.map((r) => r.id === reservationId ? { ...r, ...updatedReservation } : r)
      );
    } catch (err) {
      console.error("Error completing reservation:", err);
      alert("Nie udało się oznaczyć rezerwacji jako zakończonej");
    }
  };

  const handleCloseEditModal = () => {
    setEditModal({
      isOpen: false,
      reservation: null,
    });
  };

  const handleReservationUpdated = () => {
    // Reload reservations
    if (selectedDate) {
      Promise.all([
        getReservations({
          reservation_date: selectedDate,
          status: "active",
        }),
        getReservations({
          reservation_date: selectedDate,
          status: "completed",
        })
      ])
        .then(([activeData, completedData]) => {
          const combinedData = [...activeData, ...completedData].sort((a, b) => {
            if (a.status !== b.status) {
              return a.status === 'active' ? -1 : 1;
            }
            return a.reservation_time.localeCompare(b.reservation_time);
          });
          setReservations(combinedData);
        })
        .catch(console.error);
    }
  };



  // Helper function to check if reservation has started
  const hasReservationStarted = (reservation: ReservationWithTableAndRoom) => {
    if (!selectedDate) return false;
    
    const now = new Date();
    const [resHours, resMinutes] = reservation.reservation_time.split(':').map(Number);
    
    // Create reservation start time
    const reservationStart = new Date(reservation.reservation_date);
    reservationStart.setHours(resHours, resMinutes, 0, 0);
    
    return now >= reservationStart;
  };

  // Helper function to check if "Zakończ" button should be shown
  const shouldShowCompleteButton = (reservation: ReservationWithTableAndRoom) => {
    return (
      Number(reservation.duration_hours) === -1 && // Indefinite reservation
      reservation.status === 'active' && // Active status
      hasReservationStarted(reservation) // Has started
    );
  };

  // Helper function to format duration
  const formatDuration = (hours: number) => {
    if (Number.isInteger(hours)) {
      return `${hours}h`;
    }
    
    const fullHours = Math.floor(hours);
    const minutes = Math.round((hours - fullHours) * 60);
    
    if (fullHours === 0) {
      return `${minutes}min`;
    } else if (minutes === 0) {
      return `${fullHours}h`;
    } else {
      return `${fullHours}h ${minutes}min`;
    }
  };

  const getStatusColor = (reservation: ReservationWithTableAndRoom) => {
    // Cancelled reservations have a distinct error style
    if (reservation.status === 'cancelled') {
      return "text-error/70 bg-error/5 opacity-75";
    }
    
    // Completed reservations have a distinct style
    if (reservation.status === 'completed') {
      return "text-success/70 bg-success/5";
    }
    
    // Active reservations use normal styling
    return "text-base-content";
  };

  const generateTimeSlots = () => {
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
  };

  const formatCreationTime = (createdAt: Date | string) => {
    // Handle both Date objects and string dates from API
    const date = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
    return date.toLocaleTimeString("pl", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const today = getTodayInPoland();

  // Check if the selected date is in the past
  const isSelectedDateInPast = (rangeMode === "single")
    ? (selectedDate ? selectedDate < today : false)
    : (rangeEnd ? rangeEnd < today : false);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-base-content">
          Zarządzanie Rezerwacjami
        </h2>
        <div className="text-sm text-base-content/70">
          {rangeMode === "single" && selectedDate && (
            <span>
              {new Date(selectedDate + 'T12:00:00').toLocaleDateString("pl", {
                weekday: "long",
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
          {rangeMode === "range" && rangeStart && rangeEnd && (
            <span>
              {new Date(rangeStart + 'T12:00:00').toLocaleDateString("pl", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
              {" — "}
              {new Date(rangeEnd + 'T12:00:00').toLocaleDateString("pl", {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </span>
          )}
        </div>
      </div>



      {/* Filters and Search */}
      <Card>
        <CardHeader>
          <CardTitle>Filtruj i wyszukaj</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <Input
              type="date"
              value={selectedDate || today}
              onChange={(e) => {
                const d = e.target.value;
                // Switch back to single-day mode and sync range
                setRangeMode('single');
                setRangeStart(d);
                setRangeEnd(d);
                onDateChange?.(d);
              }}
              label="Data"
              fullWidth
            />

            <Select
              label="Status"
              value={filters.status}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, status: e.target.value }))
              }
              options={[
                { value: "all", label: "Wszystkie statusy" },
                { value: "active", label: "Aktywne" },
                { value: "completed", label: "Zakończone" },
                { value: "cancelled", label: "Anulowane" },
              ]}
              fullWidth
            />

            <Select
              label="Sala"
              value={filters.room_id}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, room_id: e.target.value }))
              }
              options={[
                { value: "", label: "Wszystkie sale" },
                ...rooms.map((room) => ({ value: room.id, label: room.name })),
              ]}
              fullWidth
            />

            <Select
              label="Godzina"
              value={filters.time}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, time: e.target.value }))
              }
              options={[
                { value: "", label: "Wszystkie godziny" },
                ...generateTimeSlots().map((time) => ({
                  value: time,
                  label: formatTimeForDisplay(time),
                })),
              ]}
              fullWidth
            />

            <Select
              label="Pracownik"
              value={filters.employee}
              onChange={(e) =>
                setFilters((prev) => ({ ...prev, employee: e.target.value }))
              }
              options={[
                { value: "", label: "Wszyscy pracownicy" },
                ...employees.map((employee) => ({ 
                  value: employee.id, 
                  label: employee.display_name 
                })),
              ]}
              fullWidth
            />


          </div>
          {/* Advanced date selection (date range only) */}
          <div className="mt-3">
            <details className="group">
              <summary className="cursor-pointer text-sm text-base-content/70 hover:text-base-content flex items-center gap-2" onClick={() => setRangeMode('range')}>
                📅 Zaawansowane wybieranie dat
              </summary>
              <div className="mt-3">
                <div className="border border-base-300 rounded-[var(--radius-box)] p-3 bg-base-100">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm font-medium text-base-content">Zakres dat</div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <Input
                      type="date"
                      label="Od"
                      value={rangeStart}
                      onChange={(e) => { setRangeMode('range'); setRangeStart(e.target.value); }}
                      fullWidth
                    />
                    <Input
                      type="date"
                      label="Do"
                      value={rangeEnd}
                      onChange={(e) => { setRangeMode('range'); setRangeEnd(e.target.value); }}
                      fullWidth
                    />
                  </div>
                  <div className="flex flex-wrap gap-2 mt-3">
                    <Button size="sm" variant="secondary" onClick={() => {
                      const t = today;
                      setRangeStart(t);
                      setRangeEnd(t);
                      setRangeMode('range');
                    }}>Dziś</Button>
                    <Button size="sm" variant="secondary" onClick={() => {
                      // Last 7 days up to today
                      const endDate = new Date(today + 'T12:00:00');
                      const startDate = new Date(endDate);
                      startDate.setDate(endDate.getDate() - 6);
                      const start = `${startDate.getFullYear()}-${(startDate.getMonth()+1).toString().padStart(2,'0')}-${startDate.getDate().toString().padStart(2,'0')}`;
                      const end = `${endDate.getFullYear()}-${(endDate.getMonth()+1).toString().padStart(2,'0')}-${endDate.getDate().toString().padStart(2,'0')}`;
                      setRangeStart(start);
                      setRangeEnd(end);
                      setRangeMode('range');
                    }}>7 dni</Button>
                    <Button size="sm" variant="secondary" onClick={() => {
                      // Current month from first day to today
                      const now = new Date(today + 'T12:00:00');
                      const first = new Date(now.getFullYear(), now.getMonth(), 1);
                      const start = `${first.getFullYear()}-${(first.getMonth()+1).toString().padStart(2,'0')}-${first.getDate().toString().padStart(2,'0')}`;
                      const end = `${now.getFullYear()}-${(now.getMonth()+1).toString().padStart(2,'0')}-${now.getDate().toString().padStart(2,'0')}`;
                      setRangeStart(start);
                      setRangeEnd(end);
                      setRangeMode('range');
                    }}>Miesiąc</Button>
                    
                  </div>
                </div>
              </div>
            </details>
          </div>
        </CardContent>
      </Card>

      {/* Reservations List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <span>Rezerwacje ({filteredReservations.length})</span>
              <div className="min-w-[350px]">
                <Input
                  value={filters.search}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Szukaj po nazwisku, telefonie,nr stolika..."
                  fullWidth
                  className="placeholder:text-base"
                />
              </div>
            </div>
            <div className="text-sm font-normal text-base-content/70">
              Łączna liczba gości:{" "}
              {filteredReservations.reduce((sum, r) => sum + r.party_size, 0)}
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : error ? (
            <div className="text-center py-8 text-error">{error}</div>
          ) : filteredReservations.length === 0 ? (
            <div className="text-center py-8 text-base-content/50">
              {selectedDate
                ? "Nie znaleziono rezerwacji spełniających wybrane kryteria"
                : "Proszę wybrać datę, aby zobaczyć rezerwacje"}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-base-300">
                    <th className="text-left py-3 px-2">Utworzono</th>
                    <th className="text-left py-3 px-2">Data</th>
                    <th className="text-left py-3 px-2">Godzina</th>
                    <th className="text-left py-3 px-2">Pracownik</th>
                    <th className="text-left py-3 px-2">Gość</th>
                    <th className="text-left py-3 px-2">Telefon</th>
                    <th className="text-left py-3 px-2">Osoby</th>
                    <th className="text-left py-3 px-2">Stolik</th>
                    <th className="text-left py-3 px-2">Sala</th>
                    <th className="text-left py-3 px-2">Czas trwania</th>
                    <th className="text-left py-3 px-2">Uwagi</th>
                    <th className="text-left py-3 px-2">Akcje</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredReservations.map((reservation) => (
                    <tr
                      key={reservation.id}
                      className={`border-b border-base-300 hover:bg-base-200 ${getStatusColor(
                        reservation
                      )}`}>
                      <td className="py-3 px-2 text-xs text-base-content/70">
                        {formatCreationTime(reservation.created_at)}
                      </td>
                      <td className="py-3 px-2 text-xs text-base-content/90">
                        {new Date(reservation.reservation_date + 'T12:00:00').toLocaleDateString('pl')}
                      </td>
                      <td className="py-3 px-2 font-medium">
                        {formatTimeForDisplay(reservation.reservation_time)}
                      </td>
                      <td className="py-3 px-2">{reservation.employee_id ? 
                        employees.find(emp => emp.id === reservation.employee_id)?.display_name || reservation.employee_id 
                        : "-"}</td>
                      <td className="py-3 px-2">
                        {reservation.guest_name}
                      </td>
                      <td className="py-3 px-2">
                        {reservation.guest_phone || "-"}
                      </td>
                      <td className="py-3 px-2">{reservation.party_size}</td>
                      <td className="py-3 px-2 font-medium">
                        {reservation.table.table_number}
                      </td>
                      <td className="py-3 px-2">
                        {rooms.find((r) => r.id === reservation.table.room_id)
                          ?.name || "Nieznana"}
                      </td>
                      <td className="py-3 px-2">
                        {Number(reservation.duration_hours) === -1 
                          ? "nieokreślony" 
                          : formatDuration(reservation.duration_hours)
                        }
                      </td>
                      <td className="py-3 px-2">
                        {reservation.notes && reservation.notes.trim() ? (
                          <span
                            className="text-success cursor-pointer text-lg hover:scale-110 transition-transform inline-block"
                            onMouseEnter={(e) => {
                              const rect = e.currentTarget.getBoundingClientRect();
                              setTooltipPosition({
                                x: rect.left + rect.width / 2,
                                y: rect.top - 10
                              });
                              setTooltipReservation(reservation.id);
                            }}
                            onMouseLeave={() => setTooltipReservation(null)}>
                            ✅
                          </span>
                        ) : (
                          <span className="text-error text-lg">❌</span>
                        )}
                      </td>
                      <td className="py-3 px-2">
                        <div className="flex space-x-2">
                          {reservation.status !== 'cancelled' ? (
                            <>
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => handleEditReservation(reservation)}>
                                Edytuj
                              </Button>
                              {shouldShowCompleteButton(reservation) && (
                                <Button
                                  size="sm"
                                  variant="success"
                                  onClick={() => handleCompleteReservation(reservation.id)}>
                                  Zakończ
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="error"
                                onClick={() =>
                                  handleDeleteReservation(
                                    reservation.id,
                                    isSelectedDateInPast
                                  )
                                }>
                                Anuluj
                              </Button>
                            </>
                          ) : (
                            <span className="text-base-content/50 text-sm px-3 py-2">
                              Brak dostępnych akcji
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tooltip */}
      {tooltipReservation && (
        <div
          className="fixed z-50 p-3 bg-base-100 border border-base-300 rounded-lg shadow-xl text-sm max-w-xs pointer-events-none"
          style={{
            left: `${tooltipPosition.x}px`,
            top: `${tooltipPosition.y}px`,
            transform: 'translate(-50%, -100%)',
          }}>
          <div className="text-base-content">
            {filteredReservations.find(r => r.id === tooltipReservation)?.notes}
          </div>
          <div className="absolute left-1/2 top-full w-0 h-0 border-l-4 border-r-4 border-t-4 border-transparent border-t-base-300 transform -translate-x-1/2"></div>
        </div>
      )}

      {/* Quick Stats */}
      {filteredReservations.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card padding="sm">
            <div className="text-center">
              <div className="text-xl font-bold text-primary">
                {filteredReservations.length}
              </div>
              <div className="text-sm text-base-content/70">Rezerwacje</div>
            </div>
          </Card>

          <Card padding="sm">
            <div className="text-center">
              <div className="text-xl font-bold text-success">
                {filteredReservations.reduce((sum, r) => sum + r.party_size, 0)}
              </div>
              <div className="text-sm text-base-content/70">Łącznie gości</div>
            </div>
          </Card>

          <Card padding="sm">
            <div className="text-center">
              <div className="text-xl font-bold text-accent">
                {
                  new Set(filteredReservations.map((r) => r.table.table_number))
                    .size
                }
              </div>
              <div className="text-sm text-base-content/70">Wykorzystane stoliki</div>
            </div>
          </Card>

          <Card padding="sm">
            <div className="text-center">
              <div className="text-xl font-bold text-secondary">
                {
                  new Set(
                    filteredReservations.map(
                      (r) =>
                        rooms.find((room) => room.id === r.table.room_id)
                          ?.name || "Nieznana"
                    )
                  ).size
                }
              </div>
              <div className="text-sm text-base-content/70">Wykorzystane sale</div>
            </div>
          </Card>
        </div>
      )}

      {/* Edit Modal */}
      {editModal.reservation && (
        <ReservationModal
          isOpen={editModal.isOpen}
          onClose={handleCloseEditModal}
          table={editModal.reservation.table as Table}
          selectedDate={selectedDate || today}
          selectedTime={editModal.reservation.reservation_time}
          onReservationCreated={handleReservationUpdated}
          existingReservation={editModal.reservation}
        />
      )}
    </div>
  );
}
