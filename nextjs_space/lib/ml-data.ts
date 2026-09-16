import fs from 'fs';
import path from 'path';

let policeStationsCache: any = null;
let heatmapsCache: { [key: string]: any } = {};
let cityConfigCache: any = null;
let sampleRoutesCache: { [key: string]: any } = {};

function loadJsonFile(filename: string) {
  try {
    const filePath = path.join(process.cwd(), 'public/data', filename);
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error loading ${filename}:`, error);
    return null;
  }
}

export function getPoliceStations() {
  if (!policeStationsCache) {
    policeStationsCache = loadJsonFile('police_stations.json');
  }
  return policeStationsCache;
}

export function getHeatmapData(city: string) {
  const cityLower = city.toLowerCase();
  if (!heatmapsCache[cityLower]) {
    heatmapsCache[cityLower] = loadJsonFile(`${cityLower}_heatmap.json`);
  }
  return heatmapsCache[cityLower];
}

export function getCityConfig() {
  if (!cityConfigCache) {
    cityConfigCache = loadJsonFile('city_config.json');
  }
  return cityConfigCache;
}

export function getSampleRoutes(city: string) {
  const cityLower = city.toLowerCase();
  if (!sampleRoutesCache[cityLower]) {
    sampleRoutesCache[cityLower] = loadJsonFile(`${cityLower}_sample_routes.json`);
  }
  return sampleRoutesCache[cityLower];
}

export function getNearestPoliceStations(
  lat: number,
  lon: number,
  city: string,
  count: number = 3
) {
  const stations = getPoliceStations();
  const cityStations = stations?.[city.toLowerCase()] || [];

  // Calculate distances
  const withDistances = cityStations.map((station: any) => {
    const dLat = ((station.lat - lat) * Math.PI) / 180;
    const dLon = ((station.lon - lon) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat * Math.PI) / 180) *
        Math.cos((station.lat * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const distance = 6371 * c;
    return { ...station, distance_km: parseFloat(distance.toFixed(3)) };
  });

  return withDistances.sort((a: any, b: any) => a.distance_km - b.distance_km).slice(0, count);
}