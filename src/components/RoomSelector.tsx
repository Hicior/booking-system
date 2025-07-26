import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from './ui';
import { Room, RoomAvailability } from '@/lib/types';

interface RoomSelectorProps {
  rooms: Room[];
  selectedRoom?: string;
  onRoomSelect: (roomId: string) => void;
  roomAvailability?: Record<string, RoomAvailability>;
  showAvailability?: boolean;
}

export function RoomSelector({ 
  rooms, 
  selectedRoom, 
  onRoomSelect,
  roomAvailability,
  showAvailability = false
}: RoomSelectorProps) {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-bold text-base-content">Select Room</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {rooms.map((room) => {
          const availability = roomAvailability?.[room.id];
          const isSelected = selectedRoom === room.id;
          
          return (
            <Card
              key={room.id}
              clickable
              hoverable
              onClick={() => onRoomSelect(room.id)}
              className={`
                transition-all duration-200
                ${isSelected ? 'ring-2 ring-primary border-primary bg-primary/5' : ''}
              `}
            >
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  {room.name}
                  {isSelected && (
                    <svg className="w-5 h-5 text-primary" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                </CardTitle>
              </CardHeader>
              
              <CardContent>
                {room.description && (
                  <p className="text-base-content/70 text-sm mb-3">
                    {room.description}
                  </p>
                )}
                
                {showAvailability && availability && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-base-content/70">Available Tables:</span>
                      <span className={`font-medium ${
                        availability.available_tables > 0 ? 'text-success' : 'text-error'
                      }`}>
                        {availability.available_tables} / {availability.total_tables}
                      </span>
                    </div>
                    
                    <div className="w-full bg-base-300 rounded-full h-2">
                      <div 
                        className={`h-2 rounded-full transition-all duration-300 ${
                          availability.available_tables > 0 ? 'bg-success' : 'bg-error'
                        }`}
                        style={{ 
                          width: `${(availability.available_tables / availability.total_tables) * 100}%` 
                        }}
                      />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

interface RoomTabsProps {
  rooms: Room[];
  selectedRoom?: string;
  onRoomSelect: (roomId: string) => void;
}

export function RoomTabs({ rooms, selectedRoom, onRoomSelect }: RoomTabsProps) {
  return (
    <div className="border-b border-base-300">
      <nav className="flex space-x-8">
        {rooms.map((room) => {
          const isSelected = selectedRoom === room.id;
          
          return (
            <button
              key={room.id}
              onClick={() => onRoomSelect(room.id)}
              className={`
                py-2 px-1 border-b-2 font-medium text-sm transition-colors
                ${isSelected 
                  ? 'border-primary text-primary' 
                  : 'border-transparent text-base-content/70 hover:text-base-content hover:border-base-300'
                }
              `}
            >
              {room.name}
            </button>
          );
        })}
      </nav>
    </div>
  );
} 