'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navigation() {
  const pathname = usePathname();

  const navItems = [
    {
      href: '/',
      label: 'Nowa Rezerwacja',
      icon: (
        <svg 
          className="w-6 h-6" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M12 4v16m8-8H4" 
          />
        </svg>
      )
    },
    {
      href: '/reservations',
      label: 'Rezerwacje',
      icon: (
        <svg 
          className="w-6 h-6" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            strokeWidth={2} 
            d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" 
          />
        </svg>
      )
    },
    {
      href: '/overview',
      label: 'Przegląd',
      icon: (
        <svg 
          className="w-6 h-6" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          {/* Outer building outline */}
          <path d="M4 4h16v16H4V4z" />
          
          {/* Interior walls creating rooms */}
          <path d="M4 10h6" />
          <path d="M4 16h6" />
          <path d="M10 4v6" />
          <path d="M16 10v10" />
          <path d="M10 16h6" />
          
          {/* Door openings */}
          <path d="M12 10h4" strokeWidth={1} />
          <path d="M10 12v2" strokeWidth={1} />
          
          {/* Small architectural detail (like entrance) */}
          <rect x="2" y="6" width="2" height="4" fill="currentColor" />
        </svg>
      )
    }
  ];

  const rightNavItems = [
    {
      href: '/activity',
      label: 'Aktywność',
      icon: (
        <svg 
          className="w-6 h-6" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" 
          />
        </svg>
      )
    },
    {
      href: '/configuration',
      label: 'Konfiguracja',
      icon: (
        <svg 
          className="w-6 h-6" 
          fill="none" 
          stroke="currentColor" 
          viewBox="0 0 24 24"
          strokeWidth={2}
        >
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" 
          />
          <path 
            strokeLinecap="round" 
            strokeLinejoin="round" 
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" 
          />
        </svg>
      )
    }
  ];

  return (
    <>
      {/* Left navigation */}
      <nav className="fixed top-4 left-4 z-50 flex space-x-3">
        {navItems.map((item) => {
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`
                relative flex items-center justify-center w-12 h-12 rounded-lg
                transition-all duration-50 ease-in-out
                ${isActive 
                  ? 'bg-primary text-primary-content shadow-lg scale-110' 
                  : 'bg-base-200 text-base-content hover:bg-base-300 hover:scale-102 shadow-md'
                }
              `}
            >
              {item.icon}
            </Link>
          );
        })}
      </nav>

      {/* Right navigation */}
      <nav className="fixed top-4 right-4 z-50 flex space-x-3">
        {rightNavItems.map((item) => {
          const isActive = pathname === item.href;
          
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`
                relative flex items-center justify-center w-12 h-12 rounded-lg
                transition-all duration-100 ease-in-out
                ${isActive 
                  ? 'bg-primary text-primary-content shadow-lg scale-110' 
                  : 'bg-base-200 text-base-content hover:bg-base-300 hover:scale-102 shadow-md'
                }
              `}
            >
              {item.icon}
            </Link>
          );
        })}
      </nav>
    </>
  );
} 