'use client';

import React, { useState, useEffect, useRef } from 'react';
import { DatePicker, QuickDateSelector } from '@/components/ui';
import { FloorPlan } from '@/components/FloorPlan';
import { ReservationModal } from '@/components/ReservationModal';
import { Card, CardHeader, CardTitle, CardContent, Button } from '@/components/ui';
import { Room, Table, Reservation } from '@/lib/types';
import { getRooms, getAllTablesWithRooms, getReservations } from '@/lib/api-client';
import Link from 'next/link';

export default function Home() {
  // State management
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [selectedTime, setSelectedTime] = useState<string>('');
  const [currentView, setCurrentView] = useState<'datetime' | 'floorplan'>('datetime');
  
  // Data state
  const [rooms, setRooms] = useState<Room[]>([]);
  const [allTables, setAllTables] = useState<Table[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>('');

  // Modal state
  const [reservationModal, setReservationModal] = useState({
    isOpen: false,
    table: null as Table | null,
    existingReservation: null as Reservation | null
  });

  // Ref for scrolling to floorplan section
  const floorPlanRef = useRef<HTMLDivElement>(null);

  // Initialize date to today
  useEffect(() => {
    const today = new Date().toISOString().split('T')[0];
    setSelectedDate(today);
  }, []);

  // Load rooms and tables on component mount
  useEffect(() => {
    const loadData = async () => {
      try {
        const [roomsData, tablesData] = await Promise.all([
          getRooms(),
          getAllTablesWithRooms()
        ]);
        
        setRooms(roomsData);
        setAllTables(tablesData);
      } catch (err) {
        setError('Nie udało się załadować danych Pubu');
        console.error('Error loading data:', err);
      }
    };

    loadData();
  }, []);

  // Load reservations when date changes
  useEffect(() => {
    const loadReservations = async () => {
      if (!selectedDate) return;
      
      try {
        const reservationsData = await getReservations({
          reservation_date: selectedDate,
          status: 'active'
        });
        setReservations(reservationsData);
      } catch (err) {
        console.error('Error loading reservations:', err);
      }
    };

    loadReservations();
  }, [selectedDate]);

  // Scroll to FloorPlan when view changes to 'floorplan'
  useEffect(() => {
    if (currentView === 'floorplan' && floorPlanRef.current) {
      // Small delay to ensure the component is rendered
      setTimeout(() => {
        floorPlanRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start'
        });
      }, 100);
    }
  }, [currentView]);

  // Navigation handlers
  const handleDateTimeNext = () => {
    if (selectedDate && selectedTime) {
      setCurrentView('floorplan');
      setError('');
    } else {
      setError('Proszę wybrać datę i godzinę');
    }
  };

  const handleTableClick = (table: Table) => {
    setReservationModal({
      isOpen: true,
      table,
      existingReservation: null
    });
  };

  const handleCloseReservationModal = () => {
    setReservationModal({
      isOpen: false,
      table: null,
      existingReservation: null
    });
  };

  const handleReservationCreated = () => {
    // Reload reservations for the current date
    if (selectedDate) {
      getReservations({
        reservation_date: selectedDate,
        status: 'active'
      }).then(setReservations).catch(console.error);
    }
  };

  const handleBack = () => {
    setCurrentView('datetime');
  };

  const handleReset = () => {
    setCurrentView('datetime');
    setError('');
  };

  if (error && currentView === 'datetime') {
    return (
      <div className="min-h-screen bg-base-100 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="text-center p-6">
            <div className="text-error text-lg font-medium mb-2">Błąd</div>
            <p className="text-base-content/70 mb-4">{error}</p>
            <Button onClick={() => window.location.reload()}>
              Odśwież stronę
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-base-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-primary mb-2">
            System Rezerwacji - Pub Mentzen
          </h1>
          <p className="text-base-content/70 mb-4">
            Panel Pracownika - Zarządzanie rezerwacjami stolików
          </p>
          <div className="flex justify-center space-x-4">
            <Link href="/reservations">
              <Button variant="secondary">
                Zarządzaj rezerwacjami
              </Button>
            </Link>
            <Link href="/overview">
              <Button variant="accent">
                Przegląd Pubu
              </Button>
            </Link>
          </div>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center justify-center mb-8">
          <div className="flex items-center space-x-4">
            <div className={`flex items-center space-x-2 ${
              currentView === 'datetime' ? 'text-primary' : 
              selectedDate && selectedTime ? 'text-success' : 'text-base-content/50'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                currentView === 'datetime' ? 'border-primary bg-primary text-primary-content' :
                selectedDate && selectedTime ? 'border-success bg-success text-success-content' : 
                'border-base-300 text-base-content/50'
              }`}>
                1
              </div>
              <span className="font-medium">Data i godzina</span>
            </div>
            
            <div className="w-8 h-px bg-base-300"></div>
            
            <div className={`flex items-center space-x-2 ${
              currentView === 'floorplan' ? 'text-primary' : 'text-base-content/50'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 ${
                currentView === 'floorplan' ? 'border-primary bg-primary text-primary-content' : 
                'border-base-300 text-base-content/50'
              }`}>
                2
              </div>
              <span className="font-medium">Wybór stolika</span>
            </div>
          </div>
        </div>

        {/* Navigation buttons */}
        {currentView !== 'datetime' && (
          <div className="flex justify-between items-center mb-6">
            <Button variant="secondary" onClick={handleBack}>
              ← Wstecz
            </Button>
            <div className="text-sm text-base-content/70">
              {selectedDate && (
                <span>
                  {new Date(selectedDate + 'T12:00:00').toLocaleDateString('pl', { 
                    weekday: 'long', 
                    year: 'numeric', 
                    month: 'long', 
                    day: 'numeric' 
                  })}
                  {selectedTime && ` o ${selectedTime}`}
                </span>
              )}
            </div>
            <Button variant="accent" onClick={handleReset}>
              Zacznij od nowa
            </Button>
          </div>
        )}

        {/* Main content */}
        <div className="space-y-6">
          {/* Date & Time Selection */}
          {currentView === 'datetime' && (
            <Card padding="lg">
              <CardHeader>
                <CardTitle>Kiedy chciałbyś dokonać rezerwacji?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-6">
                <QuickDateSelector onSelect={setSelectedDate} />
                
                <DatePicker
                  selectedDate={selectedDate}
                  selectedTime={selectedTime}
                  onDateChange={setSelectedDate}
                  onTimeChange={setSelectedTime}
                  label="Wybierz niestandardową datę i godzinę"
                />

                {error && (
                  <div className="text-error text-sm bg-error/10 p-3 rounded-lg">
                    {error}
                  </div>
                )}

                <div className="flex justify-center pt-4">
                  <Button 
                    size="lg" 
                    onClick={handleDateTimeNext}
                    disabled={!selectedDate || !selectedTime}
                  >
                    Przejdź do wyboru stolika →
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Comprehensive Floor Plan */}
          {currentView === 'floorplan' && (
            <div ref={floorPlanRef}>
              <FloorPlan
                rooms={rooms}
                allTables={allTables}
                reservations={reservations}
                selectedDate={selectedDate}
                selectedTime={selectedTime}
                onTableClick={handleTableClick}
              />
            </div>
          )}

          {/* Loading states */}
          {loading && (
            <Card>
              <CardContent className="flex items-center justify-center py-12">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-2"></div>
                  <p className="text-base-content/70">Ładowanie...</p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Reservation Modal */}
        <ReservationModal
          isOpen={reservationModal.isOpen}
          onClose={handleCloseReservationModal}
          table={reservationModal.table}
          selectedDate={selectedDate}
          selectedTime={selectedTime}
          onReservationCreated={handleReservationCreated}
          existingReservation={reservationModal.existingReservation}
        />
      </div>
    </div>
  );
}
