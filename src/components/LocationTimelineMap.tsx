'use client';

import React from 'react';
import dynamic from 'next/dynamic';

interface LocationTimelineMapProps {
  deviceId: string;
  deviceName: string;
  currentLocation?: {
    latitude: number;
    longitude: number;
    accuracy?: number;
    timestamp?: string;
  };
  onRefreshParent?: () => void;
}

const DynamicLocationTimeline = dynamic(
  () => import('./LocationTimelineClient'),
  {
    ssr: false,
    loading: () => (
      <div className="w-full h-[520px] bg-slate-900/80 border border-slate-800 rounded-3xl flex flex-col items-center justify-center space-y-4">
        <div className="w-9 h-9 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        <span className="text-xs text-slate-400 font-medium">Loading interactive GPS map & timeline...</span>
      </div>
    ),
  }
);

export default function LocationTimelineMap(props: LocationTimelineMapProps) {
  return <DynamicLocationTimeline {...props} />;
}
