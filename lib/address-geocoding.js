/**
 * Remove a unit designator before street-address geocoding.
 * Nominatim commonly resolves the parent street address but not Australian
 * unit prefixes such as "Unit 1, 11 ..." or "1/11 ...".
 */
export function streetAddressForGeocoding(address) {
  const original = String(address || "").trim();
  const stripped = original
    .replace(/^(?:unit|apt|apartment|flat)\s*(?:[a-z]?\d+[a-z]?|[a-z])\s*(?:,\s*|\/\s*|\s+(?=\d))/i, "")
    .replace(/^[a-z0-9-]+\s*\/\s*(?=\d)/i, "")
    .trim();
  return stripped || original;
}

export function hasUnitDesignator(address) {
  return /^(?:unit|apt|apartment|flat)\s*(?:[a-z]?\d+[a-z]?|[a-z])\b|^[a-z0-9-]+\s*\//i
    .test(String(address || "").trim());
}
