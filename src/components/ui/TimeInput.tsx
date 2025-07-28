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
  // Initialize with a default pub operating time (12:00)
  const [hours, setHours] = useState<string>(() => {
    const now = new Date();
    const currentHour = now.getHours();
    
    // If current time is within pub hours (12:00-02:00), use current time + 2 hours
    // Otherwise default to 12:00
    if ((currentHour >= 12 && currentHour <= 23) || (currentHour >= 0 && currentHour <= 2)) {
      let futureHour = (currentHour + 2) % 24;
      // If the calculated hour is outside pub hours, default to 12:00
      if (futureHour < 12 && futureHour > 2) {
        futureHour = 12;
      }
      return futureHour.toString().padStart(2, "0");
    }
    return "12"; // Default to 12:00 if outside pub hours
  });

  const [minutes, setMinutes] = useState<string>("00");

  // Helper function to check if time is within pub operating hours (12:00-02:00)
  const isValidPubTime = (hour: number): boolean => {
    return (hour >= 12 && hour <= 23) || (hour >= 0 && hour <= 2);
  };

  // Helper function to get next valid hour when incrementing
  const getNextValidHour = (currentHour: number): number => {
    const nextHour = (currentHour + 1) % 24;
    if (isValidPubTime(nextHour)) {
      return nextHour;
    }
    // If we're at 02:XX, jump to 12:XX
    if (currentHour === 2) {
      return 12;
    }
    // If we're at 23:XX, jump to 00:XX
    if (currentHour === 23) {
      return 0;
    }
    return currentHour; // Shouldn't happen with valid inputs
  };

  // Helper function to get previous valid hour when decrementing
  const getPrevValidHour = (currentHour: number): number => {
    const prevHour = currentHour === 0 ? 23 : currentHour - 1;
    if (isValidPubTime(prevHour)) {
      return prevHour;
    }
    // If we're at 12:XX, jump to 02:XX
    if (currentHour === 12) {
      return 2;
    }
    return currentHour; // Shouldn't happen with valid inputs
  };

  // Parse the value prop into hours and minutes
  useEffect(() => {
    if (value) {
      const [h, m] = value.split(":");
      const hourNum = parseInt(h || "12");
      // Only set if it's a valid pub time, otherwise default to 12:00
      if (isValidPubTime(hourNum)) {
        setHours(h || "12");
        setMinutes(m || "00");
      } else {
        setHours("12");
        setMinutes("00");
      }
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

  const handleHoursChange = (direction: 'increment' | 'decrement') => {
    const currentHour = parseInt(hours);
    let newHour: number;
    
    if (direction === 'increment') {
      newHour = getNextValidHour(currentHour);
    } else {
      newHour = getPrevValidHour(currentHour);
    }
    
    const formattedHours = newHour.toString().padStart(2, "0");
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
    const numVal = parseInt(val);
    // Only allow valid pub operating hours
    if (val === "" || (numVal >= 0 && numVal <= 23 && isValidPubTime(numVal))) {
      setHours(val);
    }
  };

  const handleMinutesInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    // Only allow 15-minute intervals (0, 15, 30, 45)
    const numVal = parseInt(val);
    if (val === "" || (numVal >= 0 && numVal <= 59 && numVal % 15 === 0)) {
      setMinutes(val);
    }
  };

  const handleHoursBlur = () => {
    const numHours = parseInt(hours) || 12;
    // Ensure the hour is valid, otherwise default to 12
    let validHour = numHours;
    if (!isValidPubTime(numHours)) {
      validHour = 12;
    }
    const formattedHours = validHour.toString().padStart(2, "0");
    setHours(formattedHours);
    // Update parent after formatting
    const timeString = `${formattedHours}:${minutes.padStart(2, "0")}`;
    onChange(timeString);
  };

  const handleMinutesBlur = () => {
    const numMinutes = parseInt(minutes) || 0;
    // Round to nearest 15-minute interval
    const roundedMinutes = Math.round(numMinutes / 15) * 15;
    const validMinutes = Math.min(45, Math.max(0, roundedMinutes)); // Ensure 0-45 range
    const formattedMinutes = validMinutes.toString().padStart(2, "0");
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
            onClick={() => handleHoursChange('increment')}
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
            onClick={() => handleHoursChange('decrement')}
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
