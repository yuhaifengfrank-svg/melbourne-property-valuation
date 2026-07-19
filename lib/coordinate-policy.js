export const VICTORIA_COORDINATE_BOUNDS = Object.freeze({
  minLat: -39.3,
  maxLat: -33.9,
  minLon: 140.8,
  maxLon: 150.1,
});

export function isValidVictoriaCoordinatePair(lat, lon) {
  const latitude = Number(lat);
  const longitude = Number(lon);
  return Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= VICTORIA_COORDINATE_BOUNDS.minLat
    && latitude <= VICTORIA_COORDINATE_BOUNDS.maxLat
    && longitude >= VICTORIA_COORDINATE_BOUNDS.minLon
    && longitude <= VICTORIA_COORDINATE_BOUNDS.maxLon;
}

export function normalizeVictoriaCoordinates(lat, lon) {
  if (!isValidVictoriaCoordinatePair(lat, lon)) return { lat: null, lon: null };
  return { lat: Number(lat), lon: Number(lon) };
}
