'use client';

import React, { useState, useEffect } from 'react';
import { OverviewDashboard } from '@/components/OverviewDashboard';
import { Button, Card, CardContent } from '@/components/ui';
import { getTodayInPoland } from '@/lib/date-utils';
import Link from 'next/link';

export default function OverviewPage() {
  const [selectedDate, setSelectedDate] = useState<string>('');
  const [loading, setLoading] = useState(true);

  // Initialize with today's date using Poland timezone
  useEffect(() => {
    const today = getTodayInPoland();
    setSelectedDate(today);
    setLoading(false);
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

  return (
    <div className="min-h-screen bg-base-100">
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-4xl font-bold text-primary mb-2">
              Przegląd Pubu
            </h1>
            <p className="text-base-content/70">
              Zobacz dostępność wszystkich sal i stolików w jednym miejscu
            </p>
          </div>
          
          <div className="flex space-x-3">
            <Link href="/">
              <Button variant="secondary">
                Nowa Rezerwacja
              </Button>
            </Link>
            <Link href="/reservations">
              <Button variant="accent">
                Zarządzaj Rezerwacjami
              </Button>
            </Link>
          </div>
        </div>

        {/* Overview Dashboard */}
        <OverviewDashboard
          selectedDate={selectedDate}
          onDateChange={setSelectedDate}
        />
      </div>
    </div>
  );
} 