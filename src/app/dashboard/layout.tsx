import React from 'react';
import GeofenceAlertManager from '@/components/GeofenceAlertManager';

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <GeofenceAlertManager />
      {children}
    </>
  );
}
