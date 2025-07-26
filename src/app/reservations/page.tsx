'use client';

import React, { useState, useEffect } from 'react';
import { ReservationsList } from '@/components/ReservationsList';
import { Button } from '@/components/ui';
import { Room } from '@/lib/types';
import { getRooms } from '@/lib/api-client';
import Link from 'next/link';

export default function ReservationsPage() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  // Initialize with today's date
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
  }, []);

  // Load rooms
  useEffect(() => {
    const loadRooms = async () => {
      try {
        const roomsData = await getRooms();
        setRooms(roomsData);
      } catch (err) {
        setError('Nie udało się załadować sal');
        console.error('Error loading rooms:', err);
      } finally {
        setLoading(false);
      }
    };

    loadRooms();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
          <p className="text-base-content/70">Ładowanie...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <div className="text-center">
          <div className="text-error text-lg font-medium mb-2">Błąd</div>
          <p className="text-base-content/70 mb-4">{error}</p>
          <Button onClick={() => window.location.reload()}>
            Odśwież stronę
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-primary mb-2">
              Zarządzanie Rezerwacjami
            </h1>
            <p className="text-base-content/70">
              Przeglądaj, edytuj i zarządzaj wszystkimi rezerwacjami Pubu Mentzen
            </p>
          </div>
          
          <Link href="/">
            <Button variant="primary">
              ← Nowa Rezerwacja
            </Button>
          </Link>
        </div>

        {/* Main Content */}
        <ReservationsList
          rooms={rooms}
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
      </div>
    </div>
  );
} 