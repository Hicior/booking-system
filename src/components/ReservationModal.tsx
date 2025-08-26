import React, { useState, useEffect } from "react";
import { Modal, Button, Input, Textarea, Select } from "./ui";
import { Table, CreateReservationInput, Reservation, Employee } from "@/lib/types";
import {
  createReservation,
  updateReservation,
  generateTimeSlots,
  formatTimeForDisplay,
  getEmployees,
  checkTableAvailability,
  normalizeTimeFormat,
} from "@/lib/api-client";

interface ReservationModalProps {
  isOpen: boolean;
  onClose: () => void;
  table: Table | null;
  selectedDate: string;
  selectedTime: string;
  onReservationCreated: () => void;
  existingReservation?: Reservation | null;
}

export function ReservationModal({
  isOpen,
  onClose,
  table,
  selectedDate,
  selectedTime,
  onReservationCreated,
  existingReservation,
}: ReservationModalProps) {
  // Form state
  const [formData, setFormData] = useState({
    created_by: "",
    guest_name: "",
    guest_phone: "",
    party_size: 1,
    reservation_date: selectedDate,
    reservation_time: selectedTime,
    duration_hours: 2,
    notes: "",
  });

  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loadingEmployees, setLoadingEmployees] = useState(false);
  
  // Availability checking state
  const [checkingAvailability, setCheckingAvailability] = useState(false);
  const [isAvailable, setIsAvailable] = useState<boolean | null>(null);
  const [lastCheckedTime, setLastCheckedTime] = useState<string>("");
  const [lastCheckedDuration, setLastCheckedDuration] = useState<number>(0);

  // Load employees
  useEffect(() => {
    const loadEmployees = async () => {
      setLoadingEmployees(true);
      try {
        const employeeData = await getEmployees();
        setEmployees(employeeData);
      } catch (error) {
        console.error("Error loading employees:", error);
      } finally {
        setLoadingEmployees(false);
      }
    };

    if (isOpen) {
      loadEmployees();
    }
  }, [isOpen]);



  // Helper function to safely convert date to string format without timezone issues
  const formatDateForInput = (date: Date | string): string => {
    if (typeof date === 'string') {
      // If it's already a string, assume it's in YYYY-MM-DD format
      return date.split('T')[0]; // Handle both YYYY-MM-DD and YYYY-MM-DDTHH:mm:ss formats
    }
    
    // If it's a Date object, format it safely to avoid timezone issues
    if (date instanceof Date) {
      const year = date.getFullYear();
      const month = (date.getMonth() + 1).toString().padStart(2, '0');
      const day = date.getDate().toString().padStart(2, '0');
      return `${year}-${month}-${day}`;
    }
    
    // Fallback for any other case
    return '';
  };

  // Helper function to calculate end time properly handling midnight crossover
  const calculateEndTime = (startTime: string, durationHours: number): string => {
    if (durationHours === -1) return "czas nieokreślony";
    
    const [hours, minutes] = startTime.split(':').map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);
    
    const endDate = new Date(startDate.getTime() + (durationHours * 60 * 60 * 1000));
    
    return formatTimeForDisplay(endDate.toTimeString().slice(0, 5));
  };

  // Initialize form data
  useEffect(() => {
    if (existingReservation) {
      setFormData({
        created_by: existingReservation.created_by || "",
        guest_name: existingReservation.guest_name,
        guest_phone: existingReservation.guest_phone || "",
        party_size: existingReservation.party_size,
        reservation_date: formatDateForInput(existingReservation.reservation_date),
        reservation_time: normalizeTimeFormat(existingReservation.reservation_time),
        duration_hours: Number(existingReservation.duration_hours), // Ensure it's a number
        notes: existingReservation.notes || "",
      });
    } else {
      setFormData({
        created_by: "",
        guest_name: "",
        guest_phone: "",
        party_size: 1,
        reservation_date: selectedDate,
        reservation_time: selectedTime,
        duration_hours: 2,
        notes: "",
      });
    }
    setErrors({});
    setIsAvailable(null);
    setLastCheckedTime("");
    setLastCheckedDuration(0);
  }, [existingReservation, selectedDate, selectedTime, isOpen]);

  // Check availability when time or duration changes
  useEffect(() => {
    const checkAvailability = async () => {
      if (!table || !formData.reservation_time || !formData.reservation_date) return;
      
      // Don't check if we just checked the same values
      if (
        lastCheckedTime === formData.reservation_time && 
        lastCheckedDuration === formData.duration_hours
      ) {
        return;
      }

      setCheckingAvailability(true);
      try {
        // Exclude current reservation when editing
        const excludeReservationId = existingReservation?.id;
        
        const available = await checkTableAvailability(
          table.id,
          formData.reservation_date,
          formData.reservation_time,
          formData.duration_hours,
          excludeReservationId
        );
        
        setIsAvailable(available);
        setLastCheckedTime(formData.reservation_time);
        setLastCheckedDuration(formData.duration_hours);
        
        // Clear any previous availability errors
        if (available && errors.availability) {
          setErrors(prev => {
            const newErrors = { ...prev };
            delete newErrors.availability;
            return newErrors;
          });
        }
      } catch (error) {
        console.error("Error checking availability:", error);
        setIsAvailable(null);
      } finally {
        setCheckingAvailability(false);
      }
    };

    // Debounce the availability check
    const timeoutId = setTimeout(checkAvailability, 500);
    return () => clearTimeout(timeoutId);
  }, [table, formData.reservation_time, formData.duration_hours, formData.reservation_date, existingReservation?.id, lastCheckedTime, lastCheckedDuration, errors.availability]);

  const validateForm = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.created_by.trim()) {
      newErrors.created_by = "Wybór pracownika jest wymagany";
    }

    if (!formData.guest_name.trim()) {
      newErrors.guest_name = "Imię i nazwisko gościa jest wymagane";
    }

    // Phone number is now optional, but validate format if provided
    if (
      formData.guest_phone.trim() &&
      !/^\+?[\d\s\-\(\)]+$/.test(formData.guest_phone)
    ) {
      newErrors.guest_phone = "Nieprawidłowy format numeru telefonu";
    }

    if (!formData.reservation_date) {
      newErrors.reservation_date = "Data rezerwacji jest wymagana";
    } else {
      // Compare dates as strings to avoid timezone issues
      const today = new Date().toISOString().split('T')[0];
      
      if (formData.reservation_date < today) {
        newErrors.reservation_date = "Data rezerwacji nie może być w przeszłości";
      }
    }

    if (formData.party_size < 1) {
      newErrors.party_size = "Liczba osób musi wynosić co najmniej 1";
    } else if (table && formData.party_size > table.max_capacity) {
      newErrors.party_size = `Maksymalna pojemność tego stolika to ${table.max_capacity} osób. Proszę wybrać inny stolik lub podzielić rezerwację.`;
    }

    if (!formData.reservation_time) {
      newErrors.reservation_time = "Godzina rezerwacji jest wymagana";
    }

    // Check availability
    if (isAvailable === false) {
      newErrors.availability = "Stolik jest już zarezerwowany w wybranym czasie. Proszę wybrać inną godzinę lub czas trwania.";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm() || !table) return;

    setLoading(true);
    
    // Clear any previous errors
    setErrors(prev => {
      const newErrors = { ...prev };
      delete newErrors.submit;
      delete newErrors.availability;
      return newErrors;
    });
    
    try {
      const reservationData: CreateReservationInput = {
        table_id: table.id,
        guest_name: formData.guest_name.trim(),
        guest_phone: formData.guest_phone.trim(),
        party_size: formData.party_size,
        reservation_date: formData.reservation_date,
        reservation_time: formData.reservation_time,
        duration_hours: formData.duration_hours,
        notes: formData.notes.trim() || undefined,
        created_by: formData.created_by.trim(),
      };

      if (existingReservation) {
        await updateReservation(existingReservation.id, reservationData);
      } else {
        await createReservation(reservationData);
      }

      onReservationCreated();
      onClose();
    } catch (error) {
      console.error("Error saving reservation:", error);
      
      // Enhanced error handling with specific race condition detection
      let errorMessage = "Nie udało się zapisać rezerwacji";
      let shouldRefreshAvailability = false;
      
      if (error instanceof Error) {
        switch (error.message) {
          case "TABLE_UNAVAILABLE":
            errorMessage = "⚠️ Ten stolik został właśnie zarezerwowany przez inną osobę. Proszę wybrać inną godzinę lub sprawdzić dostępność ponownie.";
            shouldRefreshAvailability = true;
            break;
          case "RACE_CONDITION_DETECTED":
            errorMessage = "🔄 Stolik był sprawdzany przez inną osobę. Spróbuj ponownie za chwilę.";
            shouldRefreshAvailability = true;
            break;
          default:
            if (error.message.includes("conflicts with existing reservation") ||
                error.message.includes("Reservation conflicts")) {
              errorMessage = "❌ Konflikt rezerwacji: Ten stolik jest już zarezerwowany w wybranym czasie. Proszę wybrać inną godzinę.";
              shouldRefreshAvailability = true;
            } else if (error.message.includes("Cannot complete a reservation")) {
              errorMessage = "Nie można zakończyć rezerwacji, która jeszcze się nie rozpoczęła.";
            } else {
              errorMessage = error.message;
            }
            break;
        }
      }
      
      setErrors({
        submit: errorMessage,
      });
      
      // Refresh availability check if there was a race condition
      if (shouldRefreshAvailability) {
        // Reset availability state to trigger a fresh check
        setIsAvailable(null);
        setLastCheckedTime("");
        setLastCheckedDuration(0);
        
        // Trigger immediate availability recheck
        setTimeout(async () => {
          if (table && formData.reservation_time && formData.reservation_date) {
            setCheckingAvailability(true);
            try {
              const available = await checkTableAvailability(
                table.id,
                formData.reservation_date,
                formData.reservation_time,
                formData.duration_hours,
                existingReservation?.id
              );
              
              setIsAvailable(available);
              setLastCheckedTime(formData.reservation_time);
              setLastCheckedDuration(formData.duration_hours);
              
              if (!available) {
                setErrors(prev => ({
                  ...prev,
                  availability: "Stolik nie jest już dostępny w wybranym czasie. Proszę wybrać inną godzinę."
                }));
              }
            } catch (checkError) {
              console.error("Error rechecking availability:", checkError);
              setIsAvailable(null);
            } finally {
              setCheckingAvailability(false);
            }
          }
        }, 500);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field: string, value: string | number) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => ({ ...prev, [field]: "" }));
    }
    
    // Reset availability checking when date, time, or duration changes
    if (field === "reservation_date" || field === "reservation_time" || field === "duration_hours") {
      setIsAvailable(null);
      setLastCheckedTime("");
      setLastCheckedDuration(0);
    }
  };

  const timeSlots = generateTimeSlots();
  const timeOptions = timeSlots.map((time) => ({
    value: time,
    label: formatTimeForDisplay(time),
  }));

  const partySizeOptions = Array.from(
    { length: Math.min(20, (table?.max_capacity || 10) + 5) },
    (_, i) => ({
      value: i + 1,
      label: `${i + 1} ${i === 0 ? "osoba" : i < 4 ? "osoby" : "osób"}`,
    })
  );

  const durationOptions = [
    { value: 1, label: "1 godzina" },
    { value: 2, label: "2 godziny" },
    { value: 3, label: "3 godziny" },
    { value: 4, label: "4 godziny" },
    { value: 5, label: "5 godzin" },
    { value: 6, label: "6 godzin" },
    { value: 7, label: "7 godzin" },
    { value: 8, label: "8 godzin" },
    { value: -1, label: "Czas nieokreślony" },
  ];

  const employeeOptions = [
    { value: "", label: "Wybierz pracownika..." },
    ...employees.map((employee) => ({
      value: employee.display_name,
      label: employee.display_name,
    })),
  ];

  if (!table) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={`${existingReservation ? "Edytuj" : "Nowa"} rezerwacje - Stolik ${
        table.table_number
      }`}
      size="lg">
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Table Info */}
        <div className="bg-base-200 p-4 rounded-lg">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-base-content">Stolik:</span>
              <span className="ml-2">{table.table_number}</span>
            </div>
            <div>
              <span className="font-medium text-base-content">Pojemność:</span>
              <span className="ml-2">{table.max_capacity} osób</span>
            </div>
            <div>
              <span className="font-medium text-base-content">Data:</span>
              <span className="ml-2">
                {formData.reservation_date ? new Date(formData.reservation_date + 'T12:00:00').toLocaleDateString("pl", {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                }) : "Nie wybrano"}
              </span>
            </div>
            <div>
              <span className="font-medium text-base-content">Kształt:</span>
              <span className="ml-2 capitalize">
                {table.shape === "square" ? "kwadratowy" : 
                 table.shape === "circle" ? "okrągły" : 
                 table.shape === "rectangle" ? "prostokątny" : table.shape}
              </span>
            </div>
          </div>
        </div>

        {/* Employee Selection */}
        <div className="space-y-4">
          <h4 className="text-lg font-medium text-base-content">
            Pracownik
          </h4>

          <Select
            label="Pracownik przyjmujący rezerwację *"
            value={formData.created_by}
            onChange={(e) => handleInputChange("created_by", e.target.value)}
            options={employeeOptions}
            error={errors.created_by}
            disabled={loadingEmployees || !!existingReservation}
            fullWidth
          />
        </div>

        {/* Guest Information */}
        <div className="space-y-4">
          <h4 className="text-lg font-medium text-base-content">
            Informacje o gościu
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Imię i nazwisko gościa *"
              value={formData.guest_name}
              onChange={(e) => handleInputChange("guest_name", e.target.value)}
              error={errors.guest_name}
              placeholder="Wprowadź pełne imię i nazwisko gościa"
              fullWidth
            />

            <Input
              label="Numer telefonu"
              type="tel"
              value={formData.guest_phone}
              onChange={(e) => handleInputChange("guest_phone", e.target.value)}
              error={errors.guest_phone}
              placeholder="000 000 000"
              fullWidth
            />
          </div>
        </div>

        {/* Reservation Details */}
        <div className="space-y-4">
          <h4 className="text-lg font-medium text-base-content">
            Szczegóły rezerwacji
          </h4>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <Input
              label="Data rezerwacji *"
              type="date"
              value={formData.reservation_date}
              onChange={(e) => handleInputChange("reservation_date", e.target.value)}
              error={errors.reservation_date}
              min={new Date().toISOString().split('T')[0]}
              fullWidth
            />

            <Select
              label="Liczba osób *"
              value={formData.party_size}
              onChange={(e) =>
                handleInputChange("party_size", parseInt(e.target.value))
              }
              options={partySizeOptions}
              error={errors.party_size}
              fullWidth
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Select
                label="Godzina *"
                value={formData.reservation_time}
                onChange={(e) =>
                  handleInputChange("reservation_time", e.target.value)
                }
                options={[{ value: "", label: "Wybierz godzinę..." }, ...timeOptions]}
                error={errors.reservation_time}
                fullWidth
              />
              
              {/* Availability indicator */}
              {formData.reservation_time && formData.reservation_date && (
                <div className="mt-1 flex items-center space-x-2">
                  {checkingAvailability ? (
                    <>
                      <div className="w-3 h-3 border border-base-300 border-t-primary rounded-full animate-spin"></div>
                      <span className="text-xs text-base-content/70">Sprawdzanie dostępności...</span>
                    </>
                  ) : isAvailable === true ? (
                    <>
                      <div className="w-3 h-3 bg-success rounded-full"></div>
                      <span className="text-xs text-success">Dostępny</span>
                    </>
                  ) : isAvailable === false ? (
                    <>
                      <div className="w-3 h-3 bg-error rounded-full"></div>
                      <span className="text-xs text-error">Niedostępny</span>
                    </>
                  ) : null}
                </div>
              )}
            </div>

            <Select
              label="Czas trwania"
              value={formData.duration_hours}
              onChange={(e) =>
                handleInputChange("duration_hours", parseInt(e.target.value))
              }
              options={durationOptions}
              fullWidth
            />
          </div>
        </div>

        {/* Special Notes */}
        <Textarea
          label="Uwagi specjalne"
          value={formData.notes}
          onChange={(e) => handleInputChange("notes", e.target.value)}
          placeholder="Wszelkie specjalne prośby, ograniczenia dietetyczne lub uwagi..."
          rows={3}
          fullWidth
        />

        {/* Availability Warning */}
        {isAvailable === false && formData.reservation_time && formData.reservation_date && (
          <div className="bg-error/10 border border-error text-error p-4 rounded-lg">
            <div className="flex items-start space-x-2">
              <svg
                className="w-5 h-5 mt-0.5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="font-medium">
                  Konflikt rezerwacji!
                </p>
                <p className="text-sm mt-1">
                  Ten stolik jest już zarezerwowany w wybranym czasie ({new Date(formData.reservation_date + 'T12:00:00').toLocaleDateString("pl")} {formatTimeForDisplay(formData.reservation_time)} - {calculateEndTime(formData.reservation_time, formData.duration_hours)}).
                  Proszę wybrać inną datę{Number(formData.duration_hours) !== -1 ? ", godzinę lub skrócić czas trwania" : " lub godzinę"}.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Capacity Warning */}
        {table && formData.party_size > table.max_capacity && (
          <div className="bg-warning/10 border border-warning text-warning-content p-4 rounded-lg">
            <div className="flex items-start space-x-2">
              <svg
                className="w-5 h-5 mt-0.5 flex-shrink-0"
                fill="currentColor"
                viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                <p className="font-medium">
                  Liczba osób przekracza pojemność stolika!
                </p>
                <p className="text-sm mt-1">
                  Ten stolik może pomieścić maksymalnie {table.max_capacity} osób.
                  Rozważ wybór większego stolika lub podzielenie rezerwacji.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error Message */}
        {errors.submit && (
          <div className="bg-error/10 border border-error text-error p-4 rounded-lg">
            {errors.submit}
          </div>
        )}

        {/* Availability Error */}
        {errors.availability && (
          <div className="bg-error/10 border border-error text-error p-4 rounded-lg">
            {errors.availability}
          </div>
        )}

        {/* Actions */}
        <div className="flex justify-end space-x-3 pt-6 border-t border-base-300">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}>
            Anuluj
          </Button>

          <Button
            type="submit"
            loading={loading}
            disabled={
              loading || 
              checkingAvailability || 
              isAvailable === false ||
              (table && formData.party_size > table.max_capacity)
            }>
            {loading
              ? "Zapisywanie..."
              : existingReservation
              ? "Zaktualizuj rezerwację"
              : "Utwórz rezerwację"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
