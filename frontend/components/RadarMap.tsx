"use client";

import React, { useMemo } from "react";

type Stop = {
  id: number;
  title: string;
  latitude: number;
  longitude: number;
  geofence_radius_m: number;
};

type RadarMapProps = {
  playerLat: number;
  playerLng: number;
  stops: Stop[];
  activeStopId?: number | null;
  onSelectStop?: (stop: Stop) => void;
};

export default function RadarMap({
  playerLat,
  playerLng,
  stops,
  activeStopId,
  onSelectStop,
}: RadarMapProps) {
  // Haversine formula to get distance and bearing
  const stopsRelative = useMemo(() => {
    const R = 6371000; // Earth radius in meters
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    return stops.map((stop) => {
      const lat1 = toRad(playerLat);
      const lon1 = toRad(playerLng);
      const lat2 = toRad(stop.latitude);
      const lon2 = toRad(stop.longitude);

      const dLat = lat2 - lat1;
      const dLon = lon2 - lon1;

      // Distance in meters
      const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      const distance = R * c;

      // Bearing/angle in radians
      const y = Math.sin(dLon) * Math.cos(lat2);
      const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
      const bearing = Math.atan2(y, x);

      return {
        ...stop,
        distance,
        bearing,
      };
    });
  }, [playerLat, playerLng, stops]);

  // Determine scale (max distance to show on radar)
  const maxDistance = useMemo(() => {
    if (stopsRelative.length === 0) return 500; // default 500m
    const distances = stopsRelative.map((s) => s.distance);
    const maxDist = Math.max(...distances, 150); // min 150m for good zoom
    return Math.min(maxDist * 1.2, 2000); // cap view at 2km, add padding
  }, [stopsRelative]);

  // Map stop to coordinates on our SVG (-100 to 100)
  const mappedStops = useMemo(() => {
    return stopsRelative.map((stop) => {
      // Convert polar (distance, bearing) to Cartesian (x, y)
      // Bearing starts from north (0 rad) and goes clockwise
      const r = (stop.distance / maxDistance) * 90; // scale to fit inside 90px radius
      const x = r * Math.sin(stop.bearing);
      const y = -r * Math.cos(stop.bearing); // negative because SVG y goes down

      return {
        ...stop,
        x,
        y,
        inRange: stop.distance <= stop.geofence_radius_m,
      };
    });
  }, [stopsRelative, maxDistance]);

  return (
    <div className="relative w-full aspect-square bg-[#0d0d0b] border border-[rgba(245,242,235,0.15)] rounded-2xl overflow-hidden flex flex-col items-center justify-center p-4">
      {/* Radar scanning animation layer */}
      <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_center,rgba(45,106,79,0.15)_0%,transparent_70%)] animate-pulse" />
      
      {/* Interactive SVG Radar Grid */}
      <svg
        viewBox="-110 -110 220 220"
        className="w-full h-full max-w-[320px] max-h-[320px]"
      >
        {/* Grid lines */}
        <circle cx="0" cy="0" r="30" fill="none" stroke="rgba(245,242,235,0.06)" strokeWidth="1" strokeDasharray="2,2" />
        <circle cx="0" cy="0" r="60" fill="none" stroke="rgba(245,242,235,0.06)" strokeWidth="1" strokeDasharray="2,2" />
        <circle cx="0" cy="0" r="90" fill="none" stroke="rgba(245,242,235,0.08)" strokeWidth="1" />
        
        {/* Crosshair lines */}
        <line x1="-100" y1="0" x2="100" y2="0" stroke="rgba(245,242,235,0.06)" strokeWidth="0.8" />
        <line x1="0" y1="-100" x2="0" y2="100" stroke="rgba(245,242,235,0.06)" strokeWidth="0.8" />
        
        {/* Radial sweep indicator line */}
        <line
          x1="0"
          y1="0"
          x2="0"
          y2="-90"
          stroke="rgba(45,106,79,0.3)"
          strokeWidth="1.5"
          className="origin-center"
          style={{
            transform: "rotate(0deg)",
            animation: "spin 6s linear infinite",
            transformOrigin: "0px 0px"
          }}
        />

        {/* Distance labels */}
        <text x="3" y="-93" className="fill-[#6b6b5e] text-[6px] font-mono leading-none">
          {Math.round(maxDistance)}m
        </text>
        <text x="3" y="-63" className="fill-[#6b6b5e] text-[5px] font-mono leading-none">
          {Math.round(maxDistance * 0.66)}m
        </text>
        <text x="3" y="-33" className="fill-[#6b6b5e] text-[5px] font-mono leading-none">
          {Math.round(maxDistance * 0.33)}m
        </text>

        {/* Render Geofence circles for each stop */}
        {mappedStops.map((stop) => {
          // Scale geofence radius to SVG coordinate space
          const svgRadius = (stop.geofence_radius_m / maxDistance) * 90;
          return (
            <circle
              key={`fence-${stop.id}`}
              cx={stop.x}
              cy={stop.y}
              r={svgRadius}
              fill={stop.inRange ? "rgba(45,106,79,0.1)" : "rgba(231,111,81,0.04)"}
              stroke={stop.inRange ? "rgba(45,106,79,0.25)" : "rgba(231,111,81,0.15)"}
              strokeWidth="0.8"
              strokeDasharray={stop.inRange ? "none" : "2,2"}
            />
          );
        })}

        {/* Stop pins */}
        {mappedStops.map((stop) => {
          const isActive = activeStopId === stop.id;
          const pinColor = stop.inRange ? "#2d6a4f" : isActive ? "#e9c46a" : "#e76f51";
          
          return (
            <g
              key={`pin-${stop.id}`}
              className="cursor-pointer transition-transform duration-200 hover:scale-125"
              onClick={() => onSelectStop && onSelectStop(stop)}
            >
              {/* Outer pulsing ring if active or in range */}
              {(isActive || stop.inRange) && (
                <circle
                  cx={stop.x}
                  cy={stop.y}
                  r={isActive ? 8 : 6}
                  fill="none"
                  stroke={pinColor}
                  strokeWidth="1.2"
                  className="animate-ping origin-center"
                  style={{ animationDuration: stop.inRange ? "1.5s" : "2.5s" }}
                />
              )}
              {/* Pin Base Circle */}
              <circle
                cx={stop.x}
                cy={stop.y}
                r={isActive ? 5 : 4}
                fill={pinColor}
                stroke="#0d0d0b"
                strokeWidth="1.2"
              />
              {/* Small core dot */}
              <circle
                cx={stop.x}
                cy={stop.y}
                r="1.5"
                fill="#ffffff"
              />
              {/* Title label floating above pin (only when active) */}
              {isActive && (
                <g>
                  <rect
                    x={stop.x - 25}
                    y={stop.y - 14}
                    width="50"
                    height="8"
                    rx="1.5"
                    fill="#0d0d0b"
                    stroke="rgba(245,242,235,0.2)"
                    strokeWidth="0.5"
                  />
                  <text
                    x={stop.x}
                    y={stop.y - 8.5}
                    textAnchor="middle"
                    className="fill-[#f5f2eb] text-[4.5px] font-sans font-bold uppercase tracking-wider"
                  >
                    {stop.title.length > 12 ? `${stop.title.substring(0, 10)}...` : stop.title}
                  </text>
                </g>
              )}
            </g>
          );
        })}

        {/* Center player pin */}
        <g>
          {/* Pulsing radar locator */}
          <circle
            cx="0"
            cy="0"
            r="8"
            fill="none"
            stroke="#2d6a4f"
            strokeWidth="0.8"
            className="animate-pulse"
          />
          {/* Player dot */}
          <circle
            cx="0"
            cy="0"
            r="3.5"
            fill="#2d6a4f"
            stroke="#f5f2eb"
            strokeWidth="1.5"
          />
          {/* Direction indicator (facing North by default) */}
          <polygon
            points="0,-8 -3.5,-3 3.5,-3"
            fill="#2d6a4f"
          />
        </g>
      </svg>

      {/* Radar scanning spin keyframes */}
      <style jsx global>{`
        @keyframes spin {
          100% {
            transform: rotate(360deg);
          }
        }
      `}</style>

      {/* Latency and GPS telemetry feed */}
      <div className="absolute bottom-2 left-3 right-3 flex justify-between items-center text-[8px] font-mono text-muted uppercase tracking-wider">
        <span>LOC: {playerLat.toFixed(6)}, {playerLng.toFixed(6)}</span>
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-[#2d6a4f] animate-ping" />
          GPS ACTIVE
        </span>
      </div>
    </div>
  );
}
