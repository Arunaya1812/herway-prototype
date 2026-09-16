import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// Safety score color mapping
export function getSafetyColor(score: number): string {
  if (score < 33) return "text-red-500"; // Unsafe
  if (score < 67) return "text-yellow-500"; // Moderate
  return "text-green-500"; // Safe
}

export function getSafetyBgColor(score: number): string {
  if (score < 33) return "bg-red-500/10";
  if (score < 67) return "bg-yellow-500/10";
  return "bg-green-500/10";
}

export function getSafetyLabel(score: number): string {
  if (score < 33) return "High Risk";
  if (score < 67) return "Moderate";
  return "Safe";
}

// Distance and time formatting
export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)}m`;
  }
  return `${km.toFixed(1)}km`;
}

export function formatTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

// Haversine distance calculation
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}