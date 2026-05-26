"use client";

import React, { useEffect, useRef, useState } from "react";

type MarkerData = {
  id: number | string;
  title: string;
  latitude: number;
  longitude: number;
  isPlayer?: boolean;
  color?: string;
};

type LeafletMapProps = {
  centerLat: number;
  centerLng: number;
  markers: MarkerData[];
  zoom?: number;
  onMapClick?: (lat: number, lng: number) => void;
  interactive?: boolean;
};

export default function LeafletMap({
  centerLat,
  centerLng,
  markers,
  zoom = 15,
  onMapClick,
  interactive = false,
}: LeafletMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const leafletLoadedRef = useRef<boolean>(false);
  const mapMarkersRef = useRef<any[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);
  const clickMarkerRef = useRef<any>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Inject Leaflet CSS
    const cssId = "leaflet-cdn-css";
    if (!document.getElementById(cssId)) {
      const link = document.createElement("link");
      link.id = cssId;
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    // 2. Inject Leaflet JS
    const jsId = "leaflet-cdn-js";
    if (!document.getElementById(jsId)) {
      const script = document.createElement("script");
      script.id = jsId;
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      script.onload = () => {
        leafletLoadedRef.current = true;
        setIsLoaded(true);
      };
      document.body.appendChild(script);
    } else if ((window as any).L) {
      leafletLoadedRef.current = true;
      setIsLoaded(true);
    }
  }, []);

  // Initialize Map
  useEffect(() => {
    if (!isLoaded || !mapContainerRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    // If map already initialized, just update center
    if (mapRef.current) {
      mapRef.current.setView([centerLat, centerLng], mapRef.current.getZoom());
      return;
    }

    // Create Map
    const map = L.map(mapContainerRef.current).setView([centerLat, centerLng], zoom);
    mapRef.current = map;

    // Add Tile Layer (OpenStreetMap - completely keyless)
    L.tileLayer("https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      maxZoom: 20,
    }).addTo(map);

    // Map Click Handler for placing pins
    if (interactive && onMapClick) {
      map.on("click", (e: any) => {
        const { lat, lng } = e.latlng;
        onMapClick(lat, lng);

        // Update click marker pin visually
        if (clickMarkerRef.current) {
          clickMarkerRef.current.setLatLng([lat, lng]);
        } else {
          // Custom SVG icon for dynamic pin
          const pinIcon = L.divIcon({
            html: `
              <div style="position: relative; width: 24px; height: 24px; transform: translate(-50%, -100%);">
                <svg viewBox="0 0 24 24" fill="#e76f51" stroke="#0d0d0b" stroke-width="2" style="width: 24px; height: 24px;">
                  <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
                </svg>
              </div>
            `,
            className: "",
            iconSize: [24, 24],
            iconAnchor: [12, 24],
          });

          clickMarkerRef.current = L.marker([lat, lng], { icon: pinIcon }).addTo(map);
        }
      });
    }

    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        clickMarkerRef.current = null;
      }
    };
  }, [isLoaded, centerLat, centerLng, zoom, interactive, onMapClick]);

  // Update Markers
  useEffect(() => {
    if (!isLoaded || !mapRef.current) return;
    const L = (window as any).L;
    if (!L) return;

    // Clear old markers
    mapMarkersRef.current.forEach((m) => m.remove());
    mapMarkersRef.current = [];

    // Add new markers
    markers.forEach((markerData) => {
      const pinColor = markerData.color || (markerData.isPlayer ? "#2d6a4f" : "#e76f51");
      const pinHtml = `
        <div style="position: relative; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center;">
          <div style="position: absolute; width: 10px; height: 10px; border-radius: 50%; background-color: #ffffff; top: 7px; left: 7px; z-index: 10;"></div>
          <svg viewBox="0 0 24 24" fill="${pinColor}" stroke="#0d0d0b" stroke-width="1.8" style="width: 24px; height: 24px; filter: drop-shadow(0px 2px 3px rgba(0,0,0,0.3));">
            <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          </svg>
        </div>
      `;

      const customIcon = L.divIcon({
        html: pinHtml,
        className: "",
        iconSize: [24, 24],
        iconAnchor: [12, 24],
      });

      const mapMarker = L.marker([markerData.latitude, markerData.longitude], { icon: customIcon })
        .addTo(mapRef.current)
        .bindPopup(`<b>${markerData.title}</b>`);

      mapMarkersRef.current.push(mapMarker);
    });
  }, [isLoaded, markers]);

  return (
    <div className="w-full h-full relative rounded-2xl overflow-hidden border border-[rgba(13,13,11,0.08)] bg-[#f5f2eb]">
      <div ref={mapContainerRef} className="w-full h-full z-0" />
      {!isLoaded && (
        <div className="absolute inset-0 bg-white bg-opacity-80 flex items-center justify-center z-10">
          <div className="flex flex-col items-center gap-2">
            <div className="w-6 h-6 border-2 border-[#2d6a4f] border-t-transparent rounded-full animate-spin"></div>
            <span className="text-xs text-[#6b6b5e] font-mono">LOADING MAP ENGINE...</span>
          </div>
        </div>
      )}
    </div>
  );
}
