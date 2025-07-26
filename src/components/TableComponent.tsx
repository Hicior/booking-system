import React from "react";
import { Table, Reservation } from "@/lib/types";

interface TableComponentProps {
  table: Table;
  isAvailable: boolean;
  reservations?: Reservation[];
  onClick: (table: Table) => void;
  scale?: number;
  showTitle?: boolean;
}

export function TableComponent({
  table,
  isAvailable,
  reservations = [],
  onClick,
  scale = 1,
  showTitle = true,
}: TableComponentProps) {
  const getTableColor = () => {
    if (!isAvailable) {
      return "bg-error hover:bg-error/80 border-error text-error-content";
    }
    return "bg-success hover:bg-success/80 border-success text-success-content";
  };

  const getTableShape = () => {
    // Base size calculation with size_scale (increased for better visibility)
    const baseSize = 80 * scale;
    const sizeScale = table.size_scale || 1.0;
    const scaledBaseSize = baseSize * sizeScale;

    // Use consistent base size regardless of capacity
    const effectiveSize = scaledBaseSize;

    switch (table.shape) {
      case "circle":
        return {
          width: effectiveSize,
          height: effectiveSize,
          borderRadius: "50%",
        };
      case "rectangle":
        const widthRatio = table.width_ratio || 1.5;
        const heightRatio = table.height_ratio || 0.8;
        const orientation = table.orientation || "horizontal";

        // Apply orientation: horizontal uses ratios as-is, vertical swaps them
        const finalWidth =
          orientation === "horizontal" ? widthRatio : heightRatio;
        const finalHeight =
          orientation === "horizontal" ? heightRatio : widthRatio;

        return {
          width: effectiveSize * finalWidth,
          height: effectiveSize * finalHeight,
          borderRadius: "4px",
        };
      default: // square
        return {
          width: effectiveSize,
          height: effectiveSize,
          borderRadius: "4px",
        };
    }
  };

  const tableStyle = getTableShape();

  return (
    <div
      className={`
        absolute cursor-pointer transition-all duration-200 
        border-2 flex items-center justify-center
        shadow-md hover:shadow-lg transform hover:scale-105
        ${getTableColor()}
      `}
      style={{
        left: `${(table.position_x || 0) * scale}px`,
        top: `${(table.position_y || 0) * scale}px`,
        ...tableStyle,
      }}
      onClick={() => onClick(table)}
      title={
        showTitle
          ? `Stolik ${table.table_number} (${table.max_capacity} miejsc) - ${
              isAvailable ? "Dostępny" : "Zarezerwowany"
            }`
          : undefined
      }>
      <div className="text-center">
        <div className="font-bold text-xs">{table.table_number}</div>
        <div className="text-xs opacity-80">{table.max_capacity}</div>
      </div>

      {/* Reservation indicator */}
      {reservations.length > 0 && (
        <div className="absolute -top-1 -right-1 w-4 h-4 bg-warning rounded-full border border-white text-xs flex items-center justify-center">
          {reservations.length}
        </div>
      )}
    </div>
  );
}

interface TableLegendProps {
  className?: string;
}

export function TableLegend({ className = "" }: TableLegendProps) {
  return (
    <div className={`flex items-center space-x-4 text-sm ${className}`}>
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 bg-success rounded border border-success"></div>
        <span className="text-base-content">Dostępny</span>
      </div>
      <div className="flex items-center space-x-2">
        <div className="w-4 h-4 bg-error rounded border border-error"></div>
        <span className="text-base-content">Zarezerwowany</span>
      </div>
    </div>
  );
}

interface TableInfoTooltipProps {
  table: Table;
  reservations: Reservation[];
  isVisible: boolean;
  position: { x: number; y: number };
}

export function TableInfoTooltip({
  table,
  reservations,
  isVisible,
  position,
}: TableInfoTooltipProps) {
  if (!isVisible) return null;

  return (
    <div
      className="absolute z-50 bg-base-100 border border-base-300 rounded-lg shadow-lg p-3 max-w-xs"
      style={{
        left: position.x + 10,
        top: position.y - 10,
      }}>
      <div className="space-y-2">
        <div className="font-semibold text-base-content">
          Stolik {table.table_number}
        </div>
        <div className="text-sm text-base-content/70">
          Pojemność: {table.max_capacity} osób
        </div>
        <div className="text-sm text-base-content/70">
          Kształt: {table.shape === "square" ? "kwadratowy" : 
                   table.shape === "circle" ? "okrągły" : 
                   table.shape === "rectangle" ? "prostokątny" : table.shape}
        </div>
        {table.size_scale !== undefined && table.size_scale !== 1.0 && (
          <div className="text-sm text-base-content/70">
            Rozmiar: {(table.size_scale * 100).toFixed(0)}%
          </div>
        )}
        {table.shape === "rectangle" && (
          <div className="text-sm text-base-content/70">
            Orientacja: {table.orientation === "horizontal" ? "pozioma" : "pionowa"}
            {((table.width_ratio !== undefined && table.width_ratio !== 1.5) ||
              (table.height_ratio !== undefined &&
                table.height_ratio !== 0.8)) && (
              <span>
                {" "}
                • Proporcje: {(table.width_ratio || 1.5).toFixed(1)}:1 ×{" "}
                {(table.height_ratio || 0.8).toFixed(1)}:1
              </span>
            )}
          </div>
        )}

        {reservations.length > 0 && (
          <div className="border-t border-base-300 pt-2">
            <div className="text-sm font-medium text-base-content mb-1">
              Aktualne rezerwacje:
            </div>
            {reservations.slice(0, 3).map((reservation, index) => (
              <div
                key={reservation.id}
                className="text-xs text-base-content/60">
                {reservation.reservation_time} - {reservation.guest_name} (
                {reservation.party_size})
              </div>
            ))}
            {reservations.length > 3 && (
              <div className="text-xs text-base-content/60">
                +{reservations.length - 3} więcej...
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
