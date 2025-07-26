"use client";

import React, { useState, useEffect } from "react";

interface TimeInputProps {
  value?: string;
  onChange: (time: string) => void;
  label?: string;
  error?: string;
  fullWidth?: boolean;
}

export function TimeInput({
  value = "",
  onChange,
  label,
  error,
  fullWidth = false,
}: TimeInputProps) {
  // Initialize with current time + 2 hours
  const [hours, setHours] = useState<string>(() => {
    const now = new Date();
    const futureHour = (now.getHours() + 2) % 24;
    return futureHour.toString().padStart(2, "0");
  });

  const [minutes, setMinutes] = useState<string>("00");

  // Parse the value prop into hours and minutes
  useEffect(() => {
    if (value) {
      const [h, m] = value.split(":");
      setHours(h || "12");
      setMinutes(m || "00");
    }
  }, [value]);

  // Initialize parent with formatted time on mount only
  useEffect(() => {
    if (!value) {
      const timeString = `${hours.padStart(2, "0")}:${minutes.padStart(
        2,
        "0"
      )}`;
      onChange(timeString);
    }
  }, []); // Empty dependency array - runs only once on mount

  const handleHoursChange = (newHours: number) => {
    // Ensure hours are in 0-23 range
    let validHours = newHours;
    if (validHours < 0) validHours = 23;
    if (validHours > 23) validHours = 0;
    const formattedHours = validHours.toString().padStart(2, "0");
    setHours(formattedHours);
    // Update parent immediately with new hours value
    const timeString = `${formattedHours}:${minutes.padStart(2, "0")}`;
    onChange(timeString);
  };

  const handleMinutesChange = (newMinutes: number) => {
    // Ensure minutes are in 0-59 range
    let validMinutes = newMinutes;
    if (validMinutes < 0) validMinutes = 45; // Go to previous 15-minute mark
    if (validMinutes > 59) validMinutes = 0;
    const formattedMinutes = validMinutes.toString().padStart(2, "0");
    setMinutes(formattedMinutes);
    // Update parent immediately with new minutes value
    const timeString = `${hours.padStart(2, "0")}:${formattedMinutes}`;
    onChange(timeString);
  };

  const handleHoursInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || (parseInt(val) >= 0 && parseInt(val) <= 23)) {
      setHours(val);
    }
  };

  const handleMinutesInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === "" || (parseInt(val) >= 0 && parseInt(val) <= 59)) {
      setMinutes(val);
    }
  };

  const handleHoursBlur = () => {
    const numHours = parseInt(hours) || 0;
    const formattedHours = Math.min(23, Math.max(0, numHours))
      .toString()
      .padStart(2, "0");
    setHours(formattedHours);
    // Update parent after formatting
    const timeString = `${formattedHours}:${minutes.padStart(2, "0")}`;
    onChange(timeString);
  };

  const handleMinutesBlur = () => {
    const numMinutes = parseInt(minutes) || 0;
    const formattedMinutes = Math.min(59, Math.max(0, numMinutes))
      .toString()
      .padStart(2, "0");
    setMinutes(formattedMinutes);
    // Update parent after formatting
    const timeString = `${hours.padStart(2, "0")}:${formattedMinutes}`;
    onChange(timeString);
  };

  return (
    <div className={`${fullWidth ? "w-full" : ""}`}>
      {label && (
        <label className="block text-sm font-medium text-base-content mb-1">
          {label}
        </label>
      )}

      <div className="flex items-center space-x-2">
        {/* Hours Section */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => handleHoursChange(parseInt(hours) + 1)}
            className="w-8 h-6 flex items-center justify-center bg-base-200 hover:bg-base-300 rounded text-xs font-bold transition-colors">
            ▲
          </button>
          <input
            type="text"
            value={hours}
            onChange={handleHoursInputChange}
            onBlur={handleHoursBlur}
            onFocus={(e) => e.target.select()}
            className={`
              w-12 h-8 text-center border border-base-300 rounded 
              bg-base-100 text-base-content text-sm font-mono
              focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
              ${error ? "border-error focus:ring-error focus:border-error" : ""}
            `}
            maxLength={2}
          />
          <button
            type="button"
            onClick={() => handleHoursChange(parseInt(hours) - 1)}
            className="w-8 h-6 flex items-center justify-center bg-base-200 hover:bg-base-300 rounded text-xs font-bold transition-colors">
            ▼
          </button>
        </div>

        <span className="text-lg font-bold text-base-content">:</span>

        {/* Minutes Section */}
        <div className="flex flex-col items-center">
          <button
            type="button"
            onClick={() => handleMinutesChange(parseInt(minutes) + 15)}
            className="w-8 h-6 flex items-center justify-center bg-base-200 hover:bg-base-300 rounded text-xs font-bold transition-colors">
            ▲
          </button>
          <input
            type="text"
            value={minutes}
            onChange={handleMinutesInputChange}
            onBlur={handleMinutesBlur}
            onFocus={(e) => e.target.select()}
            className={`
              w-12 h-8 text-center border border-base-300 rounded 
              bg-base-100 text-base-content text-sm font-mono
              focus:outline-none focus:ring-2 focus:ring-primary focus:border-primary
              ${error ? "border-error focus:ring-error focus:border-error" : ""}
            `}
            maxLength={2}
          />
          <button
            type="button"
            onClick={() => handleMinutesChange(parseInt(minutes) - 15)}
            className="w-8 h-6 flex items-center justify-center bg-base-200 hover:bg-base-300 rounded text-xs font-bold transition-colors">
            ▼
          </button>
        </div>
      </div>

      {error && <p className="mt-1 text-sm text-error">{error}</p>}
    </div>
  );
}
