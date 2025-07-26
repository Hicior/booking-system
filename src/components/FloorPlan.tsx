import React, { useState, useEffect, useRef } from "react";
import { TableComponent, TableLegend } from "./TableComponent";
import { Card, CardHeader, CardTitle, CardContent, Button } from "./ui";
import { Table, Reservation, Room } from "@/lib/types";
import { updateTablePosition, updateTableProperties } from "@/lib/api-client";

interface FloorPlanProps {
  rooms: Room[];
  allTables: Table[];
  reservations: Reservation[];
  selectedDate: string;
  selectedTime: string;
  onTableClick: (table: Table) => void;
}

interface DragState {
  isDragging: boolean;
  tableId: string | null;
  startX: number;
  startY: number;
  currentX: number;
  currentY: number;
}

export function FloorPlan({
  rooms,
  allTables,
  reservations,
  selectedDate,
  selectedTime,
  onTableClick,
}: FloorPlanProps) {
  const [tableAvailability, setTableAvailability] = useState<
    Record<string, boolean>
  >({});
  const [loading, setLoading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [dragState, setDragState] = useState<DragState>({
    isDragging: false,
    tableId: null,
    startX: 0,
    startY: 0,
    currentX: 0,
    currentY: 0,
  });
  const [tablePositions, setTablePositions] = useState<
    Record<string, { x: number; y: number }>
  >({});
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [editingProperties, setEditingProperties] = useState<{
    shape: string;
    max_capacity: number;
    size_scale: number;
    width_ratio: number;
    height_ratio: number;
    orientation: "horizontal" | "vertical";
  } | null>(null);
  const [hoverState, setHoverState] = useState<{
    tableId: string | null;
    position: { x: number; y: number };
    showTooltip: boolean;
  }>({
    tableId: null,
    position: { x: 0, y: 0 },
    showTooltip: false,
  });
  const containerRef = useRef<HTMLDivElement>(null);

  // Check availability for all tables
  useEffect(() => {
    const checkAvailability = () => {
      if (!selectedDate) return;

      setLoading(true);
      const availability: Record<string, boolean> = {};

      for (const table of allTables) {
        // If no specific time is selected (selectedTime is empty), show all tables as available
        if (!selectedTime) {
          availability[table.id] = true;
          continue;
        }

        // Get reservations for this table (include both active and completed when available)
        const tableReservations = reservations.filter(
          (r) => r.table_id === table.id && (r.status === "active" || r.status === "completed")
        );

        // Check if selected time falls within any reservation's time range
        const hasActiveReservation = tableReservations.some((r) => {
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

        availability[table.id] = !hasActiveReservation;
      }

      setTableAvailability(availability);
      setLoading(false);
    };

    checkAvailability();
  }, [allTables, selectedDate, selectedTime, reservations]);

  // Initialize table positions from room layout
  useEffect(() => {
    const { roomLayout } = getRoomLayout();
    const positions: Record<string, { x: number; y: number }> = {};

    rooms.forEach((room) => {
      const roomBounds = roomLayout[room.name];
      if (!roomBounds) return;

      const roomTables = getRoomTables(room.id);
      const roomPositions = getTablePositionsInRoom(
        room.name,
        roomTables,
        roomBounds
      );

      roomTables.forEach((table) => {
        // Use saved position from database if available, otherwise use default
        const savedX = table.position_x;
        const savedY = table.position_y;

        if (
          savedX !== null &&
          savedY !== null &&
          savedX !== undefined &&
          savedY !== undefined
        ) {
          // Use saved position from database
          positions[table.id] = {
            x: savedX,
            y: savedY,
          };
        } else {
          // Use default calculated position
          const defaultPos = roomPositions[table.table_number];
          if (defaultPos) {
            positions[table.id] = {
              x: defaultPos.x, // Already relative to room bounds
              y: defaultPos.y, // Already relative to room bounds
            };
          }
        }
      });
    });

    setTablePositions(positions);
  }, [rooms, allTables]);

  // Handle mouse events for dragging
  const handleMouseDown = (
    e: React.MouseEvent,
    tableId: string,
    roomBounds: any
  ) => {
    if (!isEditMode) return;

    e.preventDefault();
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDragState({
      isDragging: true,
      tableId,
      startX: e.clientX - rect.left,
      startY: e.clientY - rect.top,
      currentX: e.clientX - rect.left,
      currentY: e.clientY - rect.top,
    });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragState.isDragging || !dragState.tableId) return;

    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;

    const newX = e.clientX - rect.left;
    const newY = e.clientY - rect.top;

    setDragState((prev) => ({
      ...prev,
      currentX: newX,
      currentY: newY,
    }));

    // Update table position with room-specific constraints
    const deltaX = newX - dragState.startX;
    const deltaY = newY - dragState.startY;

    // Find which room this table belongs to for proper constraints
    const table = allTables.find((t) => t.id === dragState.tableId);
    const room = rooms.find((r) => r.id === table?.room_id);
    const { roomLayout } = getRoomLayout();
    const roomBounds = room ? roomLayout[room.name] : null;

    setTablePositions((prev) => {
      const currentPos = prev[dragState.tableId!] || { x: 50, y: 50 };
      const newPos = {
        x: currentPos.x + deltaX,
        y: currentPos.y + deltaY,
      };

      // Apply room-specific constraints
      if (roomBounds) {
        const margin = 2; // Minimal margin from room edges

        // Calculate actual table dimensions based on TableComponent logic with scale 0.6
        const scale = 0.6;
        const baseSize = 80 * scale; // 48px (increased for better visibility)

        // Find the current table to get its exact dimensions
        const table = allTables.find((t) => t.id === dragState.tableId);
        let tableWidth = baseSize;
        let tableHeight = baseSize;

        if (table) {
          // Use the same sizing logic as TableComponent
          const sizeScale = table.size_scale || 1.0;
          const scaledBaseSize = baseSize * sizeScale;
          const effectiveSize = scaledBaseSize;

          if (table.shape === "rectangle") {
            const widthRatio = table.width_ratio || 1.5;
            const heightRatio = table.height_ratio || 0.8;
            const orientation = table.orientation || "horizontal";

            // Apply orientation: horizontal uses ratios as-is, vertical swaps them
            const finalWidth =
              orientation === "horizontal" ? widthRatio : heightRatio;
            const finalHeight =
              orientation === "horizontal" ? heightRatio : widthRatio;

            tableWidth = effectiveSize * finalWidth;
            tableHeight = effectiveSize * finalHeight;
          } else {
            // circle or square
            tableWidth = effectiveSize;
            tableHeight = effectiveSize;
          }
        }

        const maxX = roomBounds.width - tableWidth - margin;
        const maxY = roomBounds.height - tableHeight - margin;

        newPos.x = Math.max(margin, Math.min(newPos.x, maxX));
        newPos.y = Math.max(margin, Math.min(newPos.y, maxY)); // Same minimal margin for all sides
      }

      return {
        ...prev,
        [dragState.tableId!]: newPos,
      };
    });

    setDragState((prev) => ({
      ...prev,
      startX: newX,
      startY: newY,
    }));
  };

  const handleMouseUp = () => {
    if (dragState.isDragging && dragState.tableId) {
      // Here you would save the new position to the database
      saveTablePosition(dragState.tableId, tablePositions[dragState.tableId]);
    }

    setDragState({
      isDragging: false,
      tableId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
    });
  };

  // Save table position to database
  const saveTablePosition = async (
    tableId: string,
    position: { x: number; y: number }
  ) => {
    try {
      await updateTablePosition(tableId, position.x, position.y);
      console.log(`✅ Zapisano pozycję stolika:`, position);
    } catch (error) {
      console.error("❌ Nie udało się zapisać pozycji stolika:", error);
      // Optionally show user feedback here
    }
  };

  // Handle table selection for property editing
  const handleTableSelection = (table: Table) => {
    if (isEditMode) {
      setSelectedTable(table);
      setEditingProperties({
        shape: table.shape || "square",
        max_capacity: table.max_capacity,
        size_scale: table.size_scale || 1.0,
        width_ratio: table.width_ratio || 1.5,
        height_ratio: table.height_ratio || 0.8,
        orientation: table.orientation || "horizontal",
      });
    } else {
      onTableClick(table);
    }
  };

  // Save table properties to database
  const saveTableProperties = async (
    tableId: string,
    shape: string,
    max_capacity: number,
    size_scale: number,
    width_ratio: number,
    height_ratio: number,
    orientation: "horizontal" | "vertical"
  ) => {
    try {
      await updateTableProperties(
        tableId,
        shape,
        max_capacity,
        size_scale,
        width_ratio,
        height_ratio,
        orientation
      );
      console.log(`✅ Zapisano właściwości stolika:`, {
        shape,
        max_capacity,
        size_scale,
        width_ratio,
        height_ratio,
        orientation,
      });

      // Update the table in the allTables array to reflect the changes
      // This is important for immediate visual feedback
      window.location.reload(); // Simple reload to refresh the data
    } catch (error) {
      console.error("❌ Nie udało się zapisać właściwości stolika:", error);
      // Optionally show user feedback here
    }
  };

  // Handle saving property changes
  const handleSaveProperties = () => {
    if (selectedTable && editingProperties) {
      saveTableProperties(
        selectedTable.id,
        editingProperties.shape,
        editingProperties.max_capacity,
        editingProperties.size_scale,
        editingProperties.width_ratio,
        editingProperties.height_ratio,
        editingProperties.orientation
      );
      setSelectedTable(null);
      setEditingProperties(null);
    }
  };

  // Handle canceling property edits
  const handleCancelEdit = () => {
    setSelectedTable(null);
    setEditingProperties(null);
  };

  // Handle hover events for tooltip
  const handleTableMouseEnter = (tableId: string, e: React.MouseEvent) => {
    if (isEditMode) return; // Don't show tooltip in edit mode

    setHoverState({
      tableId,
      position: {
        x: e.clientX,
        y: e.clientY,
      },
      showTooltip: true,
    });
  };

  const handleTableMouseLeave = () => {
    setHoverState({
      tableId: null,
      position: { x: 0, y: 0 },
      showTooltip: false,
    });
  };

  const handleTableMouseMove = (e: React.MouseEvent) => {
    if (!hoverState.showTooltip) return;

    setHoverState((prev) => ({
      ...prev,
      position: {
        x: e.clientX,
        y: e.clientY,
      },
    }));
  };

  // Get reservations for a specific table
  const getTableReservations = (tableId: string) => {
    return reservations.filter(
      (r) => r.table_id === tableId && (r.status === "active" || r.status === "completed")
    );
  };

  // Get today's reservations for a specific table
  const getTodayTableReservations = (tableId: string) => {
    if (!selectedDate) return [];

    return reservations.filter((r) => {
      if (r.table_id !== tableId || (r.status !== "active" && r.status !== "completed")) return false;

      // Compare dates safely without timezone issues
      const reservationDateString = typeof r.reservation_date === 'string' 
        ? r.reservation_date.split('T')[0]
        : r.reservation_date.toISOString().split('T')[0];

      return reservationDateString === selectedDate;
    });
  };

  // Calculate end time for a reservation
  const getReservationEndTime = (startTime: string, durationHours: number) => {
    if (Number(durationHours) === -1) {
      return "czas nieokreślony";
    }

    const [hours, minutes] = startTime.split(":").map(Number);
    const startDate = new Date();
    startDate.setHours(hours, minutes, 0, 0);

    const endDate = new Date(
      startDate.getTime() + durationHours * 60 * 60 * 1000
    );

    return `${endDate.getHours().toString().padStart(2, "0")}:${endDate
      .getMinutes()
      .toString()
      .padStart(2, "0")}`;
  };

  // Reservation Tooltip Component
  const ReservationTooltip = ({
    tableId,
    position,
  }: {
    tableId: string;
    position: { x: number; y: number };
  }) => {
    const table = allTables.find((t) => t.id === tableId);
    const todayReservations = getTodayTableReservations(tableId);

    if (!table || todayReservations.length === 0) return null;

    // Determine tooltip position (right side by default, left side if too close to right edge)
    const tooltipWidth = 300;
    const windowWidth = window.innerWidth;
    const shouldShowLeft = position.x + tooltipWidth > windowWidth - 50;

    // Estimate tooltip height for centering (base height + reservations)
    const estimatedTooltipHeight = 60 + (todayReservations.length * 80);
    
    // Ensure tooltip doesn't go off the top or bottom of the screen
    const windowHeight = window.innerHeight;
    let tooltipTop = position.y - (estimatedTooltipHeight / 2);
    
    if (tooltipTop < 10) {
      tooltipTop = 10;
    } else if (tooltipTop + estimatedTooltipHeight > windowHeight - 10) {
      tooltipTop = windowHeight - estimatedTooltipHeight - 10;
    }

    const tooltipStyle = {
      left: shouldShowLeft ? position.x - tooltipWidth - 10 : position.x + 10,
      top: tooltipTop,
    };

    return (
      <div
        className="fixed z-[9999] bg-base-100 border border-base-300 rounded-lg shadow-lg p-4 min-w-56"
        style={tooltipStyle}>
        <div className="space-y-3">
          <div className="space-y-3">
            <div className="text-sm font-medium text-base-content">
              Rezerwacje ({todayReservations.length}):
            </div>
            {todayReservations.map((reservation, index) => (
              <div
                key={reservation.id}
                className={`text-sm border-l-2 pl-3 relative ${
                  reservation.status === "completed" 
                    ? "border-success bg-success/10" 
                    : "border-primary"
                }`}>
                <div className="font-medium text-base-content">
                  {reservation.guest_name}
                </div>
                {reservation.status === "completed" && (
                  <div className="absolute -top-1 -right-1 w-4 h-4 bg-success rounded-full flex items-center justify-center">
                    <svg 
                      className="w-2.5 h-2.5 text-success-content" 
                      fill="currentColor" 
                      viewBox="0 0 20 20"
                    >
                      <path 
                        fillRule="evenodd" 
                        d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" 
                        clipRule="evenodd" 
                      />
                    </svg>
                  </div>
                )}
                {reservation.guest_phone && (
                  <div className="text-base-content/70">
                    📞 {reservation.guest_phone}
                  </div>
                )}
                <div className="text-base-content/70">
                  🕐 {reservation.reservation_time} -{" "}
                  {getReservationEndTime(
                    reservation.reservation_time,
                    reservation.duration_hours
                  )}
                </div>
                <div className="text-base-content/70">
                  👥 {reservation.party_size}{" "}
                  {reservation.party_size === 1 ? "osoba" : 
                   reservation.party_size < 5 ? "osoby" : "osób"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Get tables for a specific room
  const getRoomTables = (roomId: string) => {
    const roomTables = allTables.filter((table) => table.room_id === roomId);

    return roomTables;
  };

  // Calculate room layout based on dimensions from Rooms.md
  const getRoomLayout = () => {
    // Total restaurant dimensions: 16:10 ratio
    // Scale factor for display
    const baseScale = 60;
    const roomGap = 1; // 1px gap between rooms
    const totalWidth = 16 * baseScale + 4; // Add extra width for gaps
    const totalHeight = 10 * baseScale + 2; // Add extra height for gap

    // Room positions and dimensions based on the layout image
    // Top row: Sala duża (6:6), Sala barowa (6:6), Sala bilardowa (4:4)
    // Bottom row: Sala E (3:4), Sala D (3:4)

    const roomLayout: Record<
      string,
      { x: number; y: number; width: number; height: number }
    > = {
      "Sala duża": {
        x: 0,
        y: 0,
        width: 6 * baseScale,
        height: 6 * baseScale,
      },
      "Sala barowa": {
        x: 6 * baseScale + roomGap,
        y: 0,
        width: 6 * baseScale,
        height: 6 * baseScale,
      },
      "Sala bilardowa": {
        x: 12 * baseScale + roomGap * 2,
        y: 2 * baseScale,
        width: 4 * baseScale,
        height: 4 * baseScale,
      },
      "Sala E": {
        x: 0,
        y: 6 * baseScale + roomGap,
        width: 3 * baseScale,
        height: 4 * baseScale,
      },
      "Sala D": {
        x: 3 * baseScale + roomGap,
        y: 6 * baseScale + roomGap,
        width: 3 * baseScale,
        height: 4 * baseScale,
      },
    };

    return { roomLayout, totalWidth, totalHeight };
  };

  // Get table positions within each room
  const getTablePositionsInRoom = (
    roomName: string,
    roomTables: Table[],
    roomBounds: { x: number; y: number; width: number; height: number }
  ) => {
    const positions: Record<string, { x: number; y: number }> = {};

    // Table positions relative to room bounds based on target layout
    const relativePositions: Record<string, { x: number; y: number }> = {};

    switch (roomName) {
      case "Sala barowa":
        relativePositions["A1"] = { x: 0.65, y: 0.15 };
        relativePositions["A2"] = { x: 0.4, y: 0.45 };
        relativePositions["A3"] = { x: 0.75, y: 0.25 };
        relativePositions["A4"] = { x: 0.75, y: 0.45 };
        relativePositions["A5"] = { x: 0.75, y: 0.65 };
        relativePositions["A6"] = { x: 0.25, y: 0.65 };
        relativePositions["A7"] = { x: 0.45, y: 0.75 };
        relativePositions["A8"] = { x: 0.15, y: 0.85 };
        relativePositions["A9"] = { x: 0.15, y: 0.35 };
        break;

      case "Sala bilardowa":
        relativePositions["B1"] = { x: 0.6, y: 0.4 };
        relativePositions["B2"] = { x: 0.6, y: 0.7 };
        break;

      case "Sala duża":
        relativePositions["C1"] = { x: 0.4, y: 0.6 };
        relativePositions["C2"] = { x: 0.55, y: 0.35 };
        relativePositions["C3"] = { x: 0.4, y: 0.15 };
        relativePositions["C4"] = { x: 0.15, y: 0.35 };
        relativePositions["C5"] = { x: 0.2, y: 0.55 };
        relativePositions["C6"] = { x: 0.15, y: 0.25 };
        relativePositions["C7"] = { x: 0.25, y: 0.75 };
        relativePositions["C8"] = { x: 0.1, y: 0.85 };
        relativePositions["C9"] = { x: 0.1, y: 0.95 };
        relativePositions["C10"] = { x: 0.55, y: 0.85 };
        break;

      case "Sala E":
        relativePositions["E1"] = { x: 0.5, y: 0.25 };
        relativePositions["E2"] = { x: 0.5, y: 0.7 };
        break;

      case "Sala D":
        relativePositions["D1"] = { x: 0.6, y: 0.2 };
        relativePositions["D2"] = { x: 0.6, y: 0.8 };
        relativePositions["D3"] = { x: 0.35, y: 0.5 };
        break;
    }

    // Convert relative positions (0-1) to absolute positions within the room bounds
    roomTables.forEach((table) => {
      const relativePos = relativePositions[table.table_number];
      if (relativePos) {
        const calculatedPos = {
          x: relativePos.x * roomBounds.width,
          y: relativePos.y * roomBounds.height,
        };
        // Key by table_number so it can be looked up correctly
        positions[table.table_number] = calculatedPos;
      }
    });

    return positions;
  };

  const { roomLayout, totalWidth, totalHeight } = getRoomLayout();

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
            <p className="text-base-content/70">
              Sprawdzanie dostępności stolików...
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Calculate summary statistics
  const totalTables = allTables.length;
  const availableTables =
    Object.values(tableAvailability).filter(Boolean).length;
  const reservedTables = totalTables - availableTables;

  return (
    <div className="space-y-6 relative">
      <div className="flex items-center justify-between">
        <h3 className="text-2xl font-semibold text-base-content">
          Plan Pubu
        </h3>
        <div className="flex items-center space-x-6">
          <Button
            variant={isEditMode ? "primary" : "secondary"}
            size="sm"
            onClick={() => {
              setIsEditMode(!isEditMode);
              // Clear selection when exiting edit mode
              if (isEditMode) {
                setSelectedTable(null);
                setEditingProperties(null);
              }
            }}
            className="flex items-center space-x-2">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2">
              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3Z" />
            </svg>
            <span>{isEditMode ? "Zakończ edycję" : "Edytuj układ"}</span>
          </Button>
          <TableLegend />
        </div>
      </div>

      {isEditMode && (
        <Card padding="sm">
          <CardContent>
            <div className="text-sm text-blue-600 bg-blue-50 p-3 rounded-lg">
              <strong>Tryb edycji:</strong> Kliknij i przeciągnij stoliki, aby zmienić ich pozycję w salach. Kliknij na stoliki, aby edytować ich właściwości (kształt i pojemność). Zmiany są zapisywane automatycznie.
            </div>
          </CardContent>
        </Card>
      )}

      {/* Table Property Editor */}
      {isEditMode && selectedTable && editingProperties && (
        <Card padding="lg">
          <CardHeader>
            <CardTitle>Edytuj stolik: {selectedTable.table_number}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Shape Selector */}
              <div>
                <label className="block text-sm font-medium text-base-content mb-2">
                  Kształt stolika
                </label>
                <select
                  value={editingProperties.shape}
                  onChange={(e) =>
                    setEditingProperties((prev) =>
                      prev ? { ...prev, shape: e.target.value } : null
                    )
                  }
                  className="w-full px-3 py-2 border border-base-300 rounded-lg bg-base-100 text-base-content focus:outline-none focus:ring-2 focus:ring-primary">
                  <option value="square">Kwadratowy</option>
                  <option value="circle">Okrągły</option>
                  <option value="rectangle">Prostokątny</option>
                </select>
              </div>

              {/* Capacity Input */}
              <div>
                <label className="block text-sm font-medium text-base-content mb-2">
                  Maksymalna pojemność
                </label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={editingProperties.max_capacity}
                  onChange={(e) =>
                    setEditingProperties((prev) =>
                      prev
                        ? {
                            ...prev,
                            max_capacity: parseInt(e.target.value) || 1,
                          }
                        : null
                    )
                  }
                  className="w-full px-3 py-2 border border-base-300 rounded-lg bg-base-100 text-base-content focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              {/* Size Scale */}
              <div>
                <label className="block text-sm font-medium text-base-content mb-2">
                  Skala rozmiaru ({(editingProperties.size_scale * 100).toFixed(0)}
                  %)
                </label>
                <input
                  type="range"
                  min="0.5"
                  max="3.0"
                  step="0.1"
                  value={editingProperties.size_scale}
                  onChange={(e) =>
                    setEditingProperties((prev) =>
                      prev
                        ? { ...prev, size_scale: parseFloat(e.target.value) }
                        : null
                    )
                  }
                  className="w-full h-2 bg-base-200 rounded-lg appearance-none cursor-pointer"
                />
                <div className="flex justify-between text-xs text-base-content/60 mt-1">
                  <span>50%</span>
                  <span>100%</span>
                  <span>300%</span>
                </div>
              </div>

              {/* Rectangle Controls */}
              {editingProperties.shape === "rectangle" && (
                <>
                  {/* Orientation Toggle */}
                  <div>
                    <label className="block text-sm font-medium text-base-content mb-2">
                      Orientacja
                    </label>
                    <div className="flex space-x-2">
                      <button
                        type="button"
                        onClick={() =>
                          setEditingProperties((prev) =>
                            prev ? { ...prev, orientation: "horizontal" } : null
                          )
                        }
                        className={`px-3 py-2 text-sm rounded border transition-colors ${
                          editingProperties.orientation === "horizontal"
                            ? "bg-primary text-primary-content border-primary"
                            : "bg-base-100 text-base-content border-base-300 hover:bg-base-200"
                        }`}>
                        ⬛ Pozioma
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setEditingProperties((prev) =>
                            prev ? { ...prev, orientation: "vertical" } : null
                          )
                        }
                        className={`px-3 py-2 text-sm rounded border transition-colors ${
                          editingProperties.orientation === "vertical"
                            ? "bg-primary text-primary-content border-primary"
                            : "bg-base-100 text-base-content border-base-300 hover:bg-base-200"
                        }`}>
                        ⬜ Pionowa
                      </button>
                    </div>
                  </div>

                  {/* Rectangle Proportions */}
                  <div>
                    <label className="block text-sm font-medium text-base-content mb-2">
                      Proporcje prostokąta
                    </label>
                    <div className="space-y-2">
                      <div>
                        <label className="text-xs text-base-content/70">
                          Stosunek szerokości:{" "}
                          {editingProperties.width_ratio.toFixed(1)}x
                        </label>
                        <input
                          type="range"
                          min="0.5"
                          max="3.0"
                          step="0.1"
                          value={editingProperties.width_ratio}
                          onChange={(e) =>
                            setEditingProperties((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    width_ratio: parseFloat(e.target.value),
                                  }
                                : null
                            )
                          }
                          className="w-full h-2 bg-base-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-base-content/70">
                          Stosunek wysokości:{" "}
                          {editingProperties.height_ratio.toFixed(1)}x
                        </label>
                        <input
                          type="range"
                          min="0.5"
                          max="3.0"
                          step="0.1"
                          value={editingProperties.height_ratio}
                          onChange={(e) =>
                            setEditingProperties((prev) =>
                              prev
                                ? {
                                    ...prev,
                                    height_ratio: parseFloat(e.target.value),
                                  }
                                : null
                            )
                          }
                          className="w-full h-2 bg-base-200 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end space-x-3 mt-4">
              <Button variant="secondary" onClick={handleCancelEdit}>
                Anuluj
              </Button>
              <Button variant="primary" onClick={handleSaveProperties}>
                Zapisz zmiany
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card padding="lg">
        <div
          ref={containerRef}
          className="relative bg-base-50 border-2 border-dashed border-base-300 overflow-auto mx-auto"
          style={{
            width: `${totalWidth + 40}px`,
            height: `${totalHeight + 40}px`,
            maxWidth: "100%",
            cursor: dragState.isDragging ? "grabbing" : "default",
          }}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}>
          {/* Restaurant boundary */}
          <div
            className="absolute border-2 border-base-400 bg-base-100/50 rounded-lg"
            style={{
              left: "20px",
              top: "20px",
              width: `${totalWidth}px`,
              height: `${totalHeight}px`,
            }}>
            {/* Room boundaries and tables */}
            {rooms.map((room) => {
              const roomBounds = roomLayout[room.name];
              if (!roomBounds) return null;

              const roomTables = getRoomTables(room.id);

              return (
                <div key={room.id}>
                  {/* Room boundary */}
                  <div
                    className="absolute border border-base-300 bg-base-200/30 overflow-hidden"
                    style={{
                      left: `${roomBounds.x}px`,
                      top: `${roomBounds.y}px`,
                      width: `${roomBounds.width}px`,
                      height: `${roomBounds.height}px`,
                    }}>
                    {/* Room label */}
                    <div className="absolute top-1 left-1 text-xs font-medium text-base-content/70 bg-base-100/80 px-2 py-1 rounded z-10">
                      {room.name}
                    </div>

                    {/* Tables in this room - positioned relative to room boundary */}
                    {roomTables.map((table) => {
                      const tableReservations = getTableReservations(table.id);
                      const isAvailable = tableAvailability[table.id] ?? true;
                      const position = tablePositions[table.id] || {
                        x: 50,
                        y: 50,
                      };

                      return (
                        <div
                          key={table.id}
                          className={`absolute transition-all duration-150 ${
                            isEditMode
                              ? "cursor-move hover:scale-105 hover:z-20"
                              : "cursor-pointer"
                          } ${
                            dragState.isDragging &&
                            dragState.tableId === table.id
                              ? "z-30 scale-110"
                              : ""
                          } ${
                            selectedTable?.id === table.id
                              ? "ring-2 ring-primary ring-offset-2 z-20"
                              : ""
                          }`}
                          style={{
                            left: `${position.x}px`,
                            top: `${position.y}px`,
                          }}
                          onMouseDown={(e) =>
                            handleMouseDown(e, table.id, roomBounds)
                          }
                          onMouseEnter={(e) =>
                            handleTableMouseEnter(table.id, e)
                          }
                          onMouseLeave={handleTableMouseLeave}
                          onMouseMove={handleTableMouseMove}>
                          <TableComponent
                            table={{
                              ...table,
                              position_x: 0,
                              position_y: 0,
                            }}
                            isAvailable={isAvailable}
                            reservations={tableReservations}
                            onClick={() => handleTableSelection(table)}
                            scale={0.6}
                            showTitle={false}
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>

          {/* No tables message */}
          {allTables.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center">
              <p className="text-base-content/50 text-center">
                Nie znaleziono stolików
              </p>
            </div>
          )}

        </div>
      </Card>

      {/* Reservation Tooltip - positioned outside the scrollable container */}
      {hoverState.showTooltip && hoverState.tableId && (
        <ReservationTooltip
          tableId={hoverState.tableId}
          position={hoverState.position}
        />
      )}

      {/* Overall statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card padding="sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-base-content">
              {totalTables}
            </div>
            <div className="text-sm text-base-content/70">Łącznie stolików</div>
          </div>
        </Card>

        <Card padding="sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-success">
              {availableTables}
            </div>
            <div className="text-sm text-base-content/70">Dostępne</div>
          </div>
        </Card>

        <Card padding="sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-error">
              {reservedTables}
            </div>
            <div className="text-sm text-base-content/70">Zarezerwowane</div>
          </div>
        </Card>

        <Card padding="sm">
          <div className="text-center">
            <div className="text-2xl font-bold text-primary">
              {rooms.length}
            </div>
            <div className="text-sm text-base-content/70">Sale</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
