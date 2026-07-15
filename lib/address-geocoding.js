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

/**
 * Classify an address string as "Apartment", "Unit", or null.
 *
 * Apartment/apt takes precedence over generic unit detection to avoid
 * "Apartment 2, 11 …" being classified as Unit.
 *
 * Returns one of: "Apartment", "Unit", null
 *   null = no unit/apartment designator detected (treat as House)
 */
export function classifyUnitDesignator(address) {
  const a = String(address || "").trim();
  if (!a) return null;

  // Apartment/Apt must be checked BEFORE generic unit detection
  if (/^apt\s*(?:[a-z]?\d+[a-z]?|[a-z])\b/i.test(a)) return "Apartment";
  if (/^apartment\s+(?:[a-z]?\d+[a-z]?|[a-z])\b/i.test(a)) return "Apartment";

  // Remaining unit designators: Unit, Flat, or leading number-slash pattern
  if (/^(?:unit|flat)\s*(?:[a-z]?\d+[a-z]?|[a-z])\b/i.test(a)) return "Unit";
  if (/^[a-z0-9-]+\s*\//i.test(a)) return "Unit";

  return null;
}
