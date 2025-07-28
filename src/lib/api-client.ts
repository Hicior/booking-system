import {
  Room,
  Table,
  Reservation,
  Employee,
  CreateReservationInput,
  UpdateReservationInput,
  ReservationFilters,
  ReservationWithTableAndRoom,
} from './types';

class ApiClient {
  private baseUrl = "/api";

  private async request<T>(
    endpoint: string,
    options?: RequestInit
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
      ...options,
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: "Nieznany błąd" }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Employee services
  async getEmployees(): Promise<Employee[]> {
    return this.request<Employee[]>("/employees");
  }

  // Room services
  async getRooms(): Promise<Room[]> {
    return this.request<Room[]>("/rooms");
  }

  async getTablesByRoom(roomId: string): Promise<Table[]> {
    return this.request<Table[]>(`/rooms/${roomId}/tables`);
  }

  async getAllTablesWithRooms(): Promise<Table[]> {
    return this.request<Table[]>("/tables");
  }

  async updateTablePosition(
    tableId: string,
    position_x: number,
    position_y: number
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/tables/${tableId}`, {
      method: "PUT",
      body: JSON.stringify({ position_x, position_y }),
    });
  }

  async updateTableProperties(
    tableId: string,
    shape: string,
    max_capacity: number,
    size_scale?: number,
    width_ratio?: number,
    height_ratio?: number,
    orientation?: "horizontal" | "vertical"
  ): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/tables/${tableId}`, {
      method: "PUT",
      body: JSON.stringify({
        shape,
        max_capacity,
        size_scale,
        width_ratio,
        height_ratio,
        orientation,
      }),
    });
  }

  // Reservation services
  async getReservations(
    filters: ReservationFilters = {}
  ): Promise<ReservationWithTableAndRoom[]> {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        if (value instanceof Date) {
          params.append(key, value.toISOString().split("T")[0]);
        } else {
          params.append(key, value.toString());
        }
      }
    });

    const queryString = params.toString();
    const endpoint = queryString ? `/reservations?${queryString}` : "/reservations";
    
    return this.request<ReservationWithTableAndRoom[]>(endpoint);
  }

  async createReservation(data: CreateReservationInput): Promise<Reservation> {
    return this.request<Reservation>("/reservations", {
      method: "POST",
      body: JSON.stringify(data),
    });
  }

  async updateReservation(
    id: string,
    data: UpdateReservationInput
  ): Promise<Reservation> {
    return this.request<Reservation>(`/reservations/${id}`, {
      method: "PUT",
      body: JSON.stringify(data),
    });
  }

  async deleteReservation(id: string): Promise<{ success: boolean }> {
    return this.request<{ success: boolean }>(`/reservations/${id}`, {
      method: "DELETE",
    });
  }

  async completeReservation(id: string): Promise<Reservation> {
    return this.request<Reservation>(`/reservations/${id}`, {
      method: "PUT",
      body: JSON.stringify({ 
        status: "completed", 
        complete_now: true
      }),
    });
  }

  async autoCompleteExpiredReservations(): Promise<{ success: boolean; completedCount: number; message: string }> {
    return this.request<{ success: boolean; completedCount: number; message: string }>(`/reservations/auto-complete`, {
      method: "POST",
    });
  }

  async checkTableAvailability(
    tableId: string,
    date: string,
    time: string,
    durationHours: number = 2,
    excludeReservationId?: string
  ): Promise<boolean> {
    const params = new URLSearchParams({
      tableId,
      date,
      time,
      durationHours: durationHours.toString(),
    });

    if (excludeReservationId) {
      params.append("excludeReservationId", excludeReservationId);
    }

    const response = await this.request<{ isAvailable: boolean }>(
      `/availability?${params.toString()}`
    );
    return response.isAvailable;
  }
}

const apiClient = new ApiClient();

// Export individual functions for convenience
export const getEmployees = () => apiClient.getEmployees();
export const getRooms = () => apiClient.getRooms();
export const getTablesByRoom = (roomId: string) =>
  apiClient.getTablesByRoom(roomId);
export const getAllTablesWithRooms = () => apiClient.getAllTablesWithRooms();
export const updateTablePosition = (
  tableId: string,
  position_x: number,
  position_y: number
) => apiClient.updateTablePosition(tableId, position_x, position_y);
export const updateTableProperties = (
  tableId: string,
  shape: string,
  max_capacity: number,
  size_scale?: number,
  width_ratio?: number,
  height_ratio?: number,
  orientation?: "horizontal" | "vertical"
) =>
  apiClient.updateTableProperties(
    tableId,
    shape,
    max_capacity,
    size_scale,
    width_ratio,
    height_ratio,
    orientation
  );

export const getReservations = (filters?: ReservationFilters) =>
  apiClient.getReservations(filters);
export const createReservation = (data: CreateReservationInput) =>
  apiClient.createReservation(data);
export const updateReservation = (id: string, data: UpdateReservationInput) =>
  apiClient.updateReservation(id, data);
export const deleteReservation = (id: string) =>
  apiClient.deleteReservation(id);
export const completeReservation = (id: string) =>
  apiClient.completeReservation(id);
export const autoCompleteExpiredReservations = () =>
  apiClient.autoCompleteExpiredReservations();
export const checkTableAvailability = (
  tableId: string,
  date: string,
  time: string,
  durationHours: number = 2,
  excludeReservationId?: string
) =>
  apiClient.checkTableAvailability(
    tableId,
    date,
    time,
    durationHours,
    excludeReservationId
  );

// Utility functions
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
  const [hours, minutes] = time.split(':');
  const hour = parseInt(hours);
  return `${hour.toString().padStart(2, '0')}:${minutes}`;
}

// Helper function to normalize time format (remove seconds if present)
// Converts "06:30:00" to "06:30" or keeps "06:30" as is
export function normalizeTimeFormat(time: string): string {
  if (!time) return time;
  return time.split(':').slice(0, 2).join(':');
}
