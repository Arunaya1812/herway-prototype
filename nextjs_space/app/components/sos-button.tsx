"use client";

import { useState, useEffect } from "react";
import { AlertTriangle, Phone, PhoneCall } from "lucide-react";

/**
 * CONFIGURABLE EMERGENCY NUMBER
 * Change this to your local emergency number.
 * India: 181 (national), 100 (police), 1091 (women helpline)
 */
const EMERGENCY_DIAL_NUMBER = "181";

interface SOSButtonProps {
  selectedRoute: any;
  fallbackLocation?: { lat: number; lon: number } | null;
}

export default function SOSButton({ selectedRoute, fallbackLocation }: SOSButtonProps) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [userLocation, setUserLocation] = useState<{ lat: number; lon: number } | null>(null);
  const [gpsAvailable, setGpsAvailable] = useState(true);

  useEffect(() => {
    if (typeof navigator !== "undefined" && navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
          setGpsAvailable(true);
        },
        () => {
          setGpsAvailable(false);
          // Fallback: use start location if provided, else Delhi default
          if (fallbackLocation) {
            setUserLocation(fallbackLocation);
          } else {
            setUserLocation({ lat: 28.6139, lon: 77.2090 });
          }
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    }
  }, [fallbackLocation]);

  // Keep updating with live GPS when available
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setUserLocation({ lat: pos.coords.latitude, lon: pos.coords.longitude });
        setGpsAvailable(true);
      },
      () => { /* ignore watch errors, we already have a fallback */ },
      { enableHighAccuracy: true, maximumAge: 15000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const triggerSOS = async () => {
    setLoading(true);
    setMessage("");
    const location = userLocation || fallbackLocation || { lat: 28.6139, lon: 77.2090 };
    try {
      const response = await fetch("/api/emergency/sos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latitude: location.lat, longitude: location.lon, selectedRoute }),
      });
      if (response.ok) {
        const data = await response.json();
        setMessage(`✓ Alert sent to ${data.contactsNotified} emergency contacts`);
        setTimeout(() => setShowConfirm(false), 4000);
      } else {
        const data = await response.json();
        setMessage(data.error || "Failed to send alert");
      }
    } catch {
      setMessage("Network error. Call 181 directly.");
    } finally {
      setLoading(false);
    }
  };

  const openDialer = () => {
    window.location.href = `tel:${EMERGENCY_DIAL_NUMBER}`;
  };

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="fixed bottom-6 right-6 bg-red-500 hover:bg-red-600 text-white p-4 rounded-full shadow-2xl shadow-red-500/30 transition-transform duration-200 hover:scale-110 active:scale-95 flex items-center justify-center w-16 h-16 z-[9998]"
        aria-label="SOS Emergency"
      >
        <AlertTriangle className="w-7 h-7" />
      </button>

      {showConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 z-[9999]">
          <div className="bg-slate-800 border border-slate-700 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-md p-6 sm:p-8 safe-bottom">
            <div className="mb-5 text-center">
              <div className="bg-red-500/20 p-3 rounded-full inline-flex mb-3">
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
              <h2 className="text-xl font-bold text-white mb-1">Emergency SOS</h2>
              <p className="text-gray-400 text-sm">Alert contacts & nearby police stations</p>
              {userLocation && (
                <p className="text-gray-500 text-xs mt-1">{userLocation.lat.toFixed(4)}, {userLocation.lon.toFixed(4)}</p>
              )}
            </div>
            {message && (
              <div className={`mb-4 p-3 rounded-lg text-sm ${message.startsWith("\u2713") ? "bg-green-500/20 text-green-300 border border-green-500/30" : "bg-red-500/20 text-red-300 border border-red-500/30"}`}>
                {message}
              </div>
            )}
            <div className="space-y-3">
              <button onClick={triggerSOS} disabled={loading}
                className="w-full py-3.5 bg-red-500 hover:bg-red-600 text-white font-bold rounded-xl transition disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.98] touch-manipulation">
                <Phone className="w-5 h-5" />
                {loading ? "Sending Alert..." : "SEND SOS ALERT"}
              </button>
              <button onClick={openDialer}
                className="w-full py-3.5 bg-orange-500 hover:bg-orange-600 text-white font-bold rounded-xl transition flex items-center justify-center gap-2 active:scale-[0.98] touch-manipulation">
                <PhoneCall className="w-5 h-5" />
                Call {EMERGENCY_DIAL_NUMBER}
              </button>
              <button onClick={() => { setShowConfirm(false); setMessage(""); }} disabled={loading}
                className="w-full py-3 bg-slate-700 hover:bg-slate-600 text-gray-300 font-semibold rounded-xl transition disabled:opacity-50 touch-manipulation">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}