"use client";

import { Heart, Zap } from "lucide-react";
import { getSafetyColor, getSafetyLabel, formatDistance, formatTime } from "@/lib/utils";

interface Route {
  route_type: string;
  total_distance_km: number;
  total_duration_min: number;
  average_safety_score: number;
}

interface RouteCardProps {
  route: Route;
  isSelected: boolean;
  onSelect: () => void;
}

const routeConfig: Record<string, { icon: React.ReactNode; label: string; description: string }> = {
  safest: {
    icon: <Heart className="w-5 h-5" />,
    label: "Safest Route",
    description: "Avoids high-risk zones",
  },
  fastest: {
    icon: <Zap className="w-5 h-5" />,
    label: "Fastest Route",
    description: "Shortest travel time",
  },
};

export default function RouteCard({ route, isSelected, onSelect }: RouteCardProps) {
  const config = routeConfig[route.route_type] || routeConfig.fastest;
  const score = Math.round(route.average_safety_score);
  const safetyLabel = getSafetyLabel(score);

  const scoreColor =
    score >= 67 ? "text-green-400" : score >= 34 ? "text-yellow-400" : "text-red-400";
  const scoreBg =
    score >= 67 ? "bg-green-500/15" : score >= 34 ? "bg-yellow-500/15" : "bg-red-500/15";
  const badgeBorder =
    score >= 67
      ? "border-green-500/30"
      : score >= 34
      ? "border-yellow-500/30"
      : "border-red-500/30";

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left p-4 rounded-xl transition-all duration-200 ${
        isSelected
          ? "bg-gradient-to-br from-green-500/10 to-emerald-600/10 border-2 border-green-500 shadow-lg shadow-green-500/10"
          : "bg-slate-800/50 border border-slate-700 hover:border-slate-500"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${isSelected ? "bg-green-500/20 text-green-400" : "bg-slate-700/50 text-gray-400"}`}>
            {config.icon}
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">{config.label}</h3>
            <p className="text-gray-500 text-xs">{config.description}</p>
          </div>
        </div>
        <div className={`text-2xl font-bold ${scoreColor}`}>{score}</div>
      </div>

      {/* Safety Badge */}
      <div className="mb-3">
        <span
          className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-semibold ${scoreBg} ${scoreColor} border ${badgeBorder}`}
        >
          {safetyLabel}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-2">
        <div className="bg-slate-700/30 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Distance</p>
          <p className="text-white font-semibold text-sm">{formatDistance(route.total_distance_km)}</p>
        </div>
        <div className="bg-slate-700/30 rounded-lg px-3 py-2">
          <p className="text-gray-500 text-xs">Duration</p>
          <p className="text-white font-semibold text-sm">{formatTime(route.total_duration_min)}</p>
        </div>
      </div>

      {isSelected && (
        <div className="mt-3 pt-2 border-t border-slate-700/50">
          <span className="text-green-400 font-semibold text-xs">✓ Selected Route</span>
        </div>
      )}
    </button>
  );
}
