/**
 * Land Size Service
 * =================
 * Provides median/mean land sizes at LGA level from Vicmap parcel data.
 * Used by valuation engine to factor in local land size characteristics.
 */
import { createRequire } from "module";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Lazy loaded land size data ──
// Tier 1: Suburb-level from comparable_sales (most accurate where available)
let _suburbSalesData = null;
// Tier 2: Residential proxy dataset: Lot/Plan parcels 100-3000m² (LGA level)
let _residentialData = null;
// Tier 3: V2 dataset: all active parcels >= 100m² (backward compat, includes commercial)
let _landSizeData = null;

function loadLandSizeData() {
  if (_landSizeData) return _landSizeData;
  try {
    const p = path.resolve(__dirname, "../data/vicmap/lga_land_size.json");
    _landSizeData = JSON.parse(fs.readFileSync(p, "utf-8"));
    return _landSizeData;
  } catch (e) {
    console.warn("[landSizeService] Could not load LGA land size data:", e.message);
    return null;
  }
}

function loadSuburbSalesData() {
  if (_suburbSalesData) return _suburbSalesData;
  try {
    const p = path.resolve(__dirname, "../data/vicmap/suburb_land_size_from_sales.json");
    _suburbSalesData = JSON.parse(fs.readFileSync(p, "utf-8"));
    return _suburbSalesData;
  } catch (e) {
    return null;
  }
}

function loadResidentialLandSizeData() {
  if (_residentialData) return _residentialData;
  try {
    const p = path.resolve(__dirname, "../data/vicmap/lga_land_size_residential.json");
    _residentialData = JSON.parse(fs.readFileSync(p, "utf-8"));
    return _residentialData;
  } catch (e) {
    console.warn("[landSizeService] Could not load residential land size data:", e.message);
    return null;
  }
}

// ── Suburb → LGA mapping (from DB/locations data) ──
// This is a companion lookup; the main mapping is in the valuation pipeline
// which already infers suburb. We map suburb → LGA, then LGA → land stats.

// Load suburb-to-LGA mapping from the DB-suburb_metrics data
// (derived from school_locations table via our content data queries)
const SUBURB_LGA_MAP = {
  // Inner Melbourne
  "Melbourne": "Melbourne", "Carlton": "Melbourne", "Carlton North": "Melbourne",
  "Docklands": "Melbourne", "East Melbourne": "Melbourne", "Flemington": "Melbourne",
  "Kensington": "Melbourne", "North Melbourne": "Melbourne", "Parkville": "Melbourne",
  "Southbank": "Melbourne", "West Melbourne": "Melbourne",

  // Inner East
  "Kew": "Boroondara", "Kew East": "Boroondara", "Balwyn": "Boroondara",
  "Balwyn North": "Boroondara", "Camberwell": "Boroondara", "Canterbury": "Boroondara",
  "Hawthorn": "Boroondara", "Hawthorn East": "Boroondara", "Surrey Hills": "Boroondara",
  "Ashburton": "Boroondara", "Glen Iris": "Boroondara", "Deepdene": "Boroondara",

  // Inner South
  "Brighton": "Bayside", "Brighton East": "Bayside", "Hampton": "Bayside",
  "Sandringham": "Bayside", "Beaumaris": "Bayside", "Black Rock": "Bayside",
  "Highett": "Bayside",

  // North-East
  "Heidelberg": "Banyule", "Heidelberg Heights": "Banyule", "Heidelberg West": "Banyule",
  "Rosanna": "Banyule", "Viewbank": "Banyule", "Eaglemont": "Banyule",
  "Ivanhoe": "Banyule", "Ivanhoe East": "Banyule", "MacLeod": "Banyule",
  "Watsonia": "Banyule", "Yallambie": "Banyule", "Bundoora": "Darebin",
  "Greensborough": "Banyule", "Montmorency": "Banyule",

  // North
  "Preston": "Darebin", "Reservoir": "Darebin", "Thornbury": "Darebin",
  "Northcote": "Darebin", "Fairfield": "Darebin", "Alphington": "Darebin",

  // West
  "Footscray": "Maribyrnong", "Yarraville": "Maribyrnong", "Seddon": "Maribyrnong",
  "Kingsville": "Maribyrnong", "West Footscray": "Maribyrnong", "Braybrook": "Maribyrnong",
  "Maidstone": "Maribyrnong",

  // Inner North-West
  "Brunswick": "Merri-bek", "Brunswick West": "Merri-bek", "Brunswick East": "Merri-bek",
  "Coburg": "Merri-bek", "Coburg North": "Merri-bek", "Fawkner": "Merri-bek",
  "Glenroy": "Merri-bek", "Pascoe Vale": "Merri-bek", "Hadfield": "Merri-bek",
  "Oaklands Junction": "Merri-bek",

  // North West
  "Essendon": "Moonee Valley", "Essendon West": "Moonee Valley",
  "Moonee Ponds": "Moonee Valley", "Ascot Vale": "Moonee Valley",
  "Avondale Heights": "Moonee Valley", "Keilor East": "Moonee Valley",
  "Niddrie": "Moonee Valley", "Strathmore": "Moonee Valley",
  "Aberfeldie": "Moonee Valley",

  // Inner SE
  "Richmond": "Yarra", "Collingwood": "Yarra", "Fitzroy": "Yarra",
  "Fitzroy North": "Yarra", "Clifton Hill": "Yarra", "Abbotsford": "Yarra",
  "Burnley": "Yarra", "Cremorne": "Yarra",

  // Inner South-East
  "St Kilda": "Port Phillip", "St Kilda East": "Port Phillip",
  "St Kilda West": "Port Phillip", "South Melbourne": "Port Phillip",
  "Albert Park": "Port Phillip", "Middle Park": "Port Phillip",
  "Port Melbourne": "Port Phillip", "Balaclava": "Port Phillip",
  "Elwood": "Port Phillip", "Ripponlea": "Port Phillip",
  "Windsor": "Stonnington", "Prahran": "Stonnington", "South Yarra": "Stonnington",
  "Toorak": "Stonnington", "Armadale": "Stonnington", "Malvern": "Stonnington",
  "Malvern East": "Stonnington", "Glen Iris": "Stonnington",

  // SE
  "Caulfield": "Glen Eira", "Caulfield North": "Glen Eira", "Caulfield South": "Glen Eira",
  "Carnegie": "Glen Eira", "Murrumbeena": "Glen Eira", "Elsternwick": "Glen Eira",
  "Gardenvale": "Glen Eira", "Ormond": "Glen Eira", "McKinnon": "Glen Eira",
  "Bentleigh": "Glen Eira", "Bentleigh East": "Glen Eira",

  // East
  "Box Hill": "Whitehorse", "Box Hill North": "Whitehorse", "Box Hill South": "Whitehorse",
  "Blackburn": "Whitehorse", "Blackburn North": "Whitehorse", "Blackburn South": "Whitehorse",
  "Burwood": "Whitehorse", "Burwood East": "Whitehorse",
  "Mitcham": "Whitehorse", "Nunawading": "Whitehorse", "Vermont": "Whitehorse",
  "Forest Hill": "Whitehorse",

  // SE growth
  "Clayton": "Monash", "Clayton South": "Monash", "Mount Waverley": "Monash",
  "Glen Waverley": "Monash", "Wheelers Hill": "Monash", "Mulgrave": "Monash",
  "Notting Hill": "Monash", "Chadstone": "Monash", "Hughesdale": "Monash",
  "Huntingdale": "Monash", "Oakleigh": "Monash", "Oakleigh East": "Monash",
  "Oakleigh South": "Monash", "Ashwood": "Monash", "Syndal": "Monash",

  // South
  "Moorabbin": "Kingston", "Moorabbin Airport": "Kingston",
  "Cheltenham": "Kingston", "Highett": "Kingston",
  "Mentone": "Kingston", "Parkdale": "Kingston", "Mordialloc": "Kingston",
  "Aspendale": "Kingston", "Aspendale Gardens": "Kingston",
  "Edithvale": "Kingston", "Chelsea": "Kingston",
  "Bonbeach": "Kingston", "Carrum": "Kingston",
  "Dingley Village": "Kingston", "Braeside": "Kingston",
  "Heatherton": "Kingston",
  "Clarinda": "Kingston", "Clayton South": "Kingston",

  // Outer SE
  "Dandenong": "Greater Dandenong", "Dandenong North": "Greater Dandenong",
  "Dandenong South": "Greater Dandenong", "Noble Park": "Greater Dandenong",
  "Noble Park North": "Greater Dandenong", "Springvale": "Greater Dandenong",
  "Springvale South": "Greater Dandenong", "Keysborough": "Greater Dandenong",
  "Bangholme": "Greater Dandenong",

  "Frankston": "Frankston", "Frankston North": "Frankston", "Frankston South": "Frankston",
  "Seaford": "Frankston", "Carrum Downs": "Frankston", "Langwarrin": "Frankston",
  "Karingal": "Frankston",

  // Outer East
  "Ringwood": "Maroondah", "Ringwood North": "Maroondah", "Ringwood East": "Maroondah",
  "Croydon": "Maroondah", "Croydon North": "Maroondah", "Croydon South": "Maroondah",
  "Heathmont": "Maroondah", "Bayswater": "Knox", "Bayswater North": "Knox",
  "Boronia": "Knox", "Ferntree Gully": "Knox", "Knoxfield": "Knox",
  "Scoresby": "Knox", "Wantirna": "Knox", "Wantirna South": "Knox",
  "Rowville": "Knox", "Lysterfield": "Knox", "Sassafras": "Knox",
  "Tremont": "Knox", "The Basin": "Knox",

  // NE
  "Doncaster": "Manningham", "Doncaster East": "Manningham", "Donvale": "Manningham",
  "Templestowe": "Manningham", "Templestowe Lower": "Manningham",
  "Bulleen": "Manningham", "Warrandyte": "Manningham",
  "Warrandyte South": "Manningham", "Wonga Park": "Manningham",
  "Park Orchards": "Manningham",

  // Yarra Ranges
  "Lilydale": "Yarra Ranges", "Chirnside Park": "Yarra Ranges",
  "Mount Evelyn": "Yarra Ranges", "Kilsyth": "Yarra Ranges",
  "Mooroolbark": "Yarra Ranges", "Coldstream": "Yarra Ranges",
  "Gruyere": "Yarra Ranges", "Seville": "Yarra Ranges",
  "Wandin": "Yarra Ranges", "Wandin East": "Yarra Ranges",
  "Wandin North": "Yarra Ranges", "Silvan": "Yarra Ranges",
  "Monbulk": "Yarra Ranges", "Olinda": "Yarra Ranges",
  "Mount Dandenong": "Yarra Ranges", "Ferny Creek": "Yarra Ranges",
  "Upwey": "Yarra Ranges", "Belgrave": "Yarra Ranges",
  "Belgrave Heights": "Yarra Ranges", "Belgrave South": "Yarra Ranges",
  "Tecoma": "Yarra Ranges", "Menzies Creek": "Yarra Ranges",
  "Emerald": "Yarra Ranges", "Cockatoo": "Yarra Ranges",
  "Gembrook": "Yarra Ranges",

  // Northern growth
  "Epping": "Whittlesea", "Wollert": "Whittlesea", "Mill Park": "Whittlesea",
  "South Morang": "Whittlesea", "Mernda": "Whittlesea", "Doreen": "Whittlesea",
  "Thomastown": "Whittlesea", "Lalor": "Whittlesea", "Bundoora": "Whittlesea",
  "Kingsbury": "Whittlesea", "Briar Hill": "Nillumbik",
  "Diamond Creek": "Nillumbik", "Eltham": "Nillumbik",
  "Eltham North": "Nillumbik", "Hurstbridge": "Nillumbik",

  "Broadmeadows": "Hume", "Craigieburn": "Hume", "Roxburgh Park": "Hume",
  "Meadow Heights": "Hume", "Gladstone Park": "Hume", "Tullamarine": "Hume",
  "Campbellfield": "Hume", "Coolaroo": "Hume", "Dallas": "Hume",
  "Attwood": "Hume", "Westmeadows": "Hume",
  "Jacana": "Hume", "Glenroy": "Hume",

  // Western growth
  "Werribee": "Wyndham", "Hoppers Crossing": "Wyndham", "Tarneit": "Wyndham",
  "Point Cook": "Wyndham", "Williams Landing": "Wyndham",
  "Laverton": "Wyndham", "Werribee South": "Wyndham", "Wyndham Vale": "Wyndham",
  "Truganina": "Wyndham", "Manor Lakes": "Wyndham",

  "Sunshine": "Brimbank", "Sunshine North": "Brimbank", "Sunshine West": "Brimbank",
  "St Albans": "Brimbank", "Deer Park": "Brimbank", "Derrimut": "Brimbank",
  "Ardeer": "Brimbank", "Albanvale": "Brimbank", "Albion": "Brimbank",
  "Cairnlea": "Brimbank", "Caroline Springs": "Brimbank",
  "Burnside": "Brimbank", "Burnside Heights": "Brimbank",

  "Melton": "Melton", "Melton West": "Melton", "Melton South": "Melton",
  "Kurunjang": "Melton", "Toolern Vale": "Melton", "Brookfield": "Melton",
  "Eynesbury": "Melton",

  // South-East growth
  "Cranbourne": "Casey", "Cranbourne North": "Casey", "Cranbourne South": "Casey",
  "Cranbourne East": "Casey", "Cranbourne West": "Casey",
  "Narre Warren": "Casey", "Narre Warren North": "Casey", "Narre Warren South": "Casey",
  "Berwick": "Casey", "Endeavour Hills": "Casey",
  "Hallam": "Casey", "Hampton Park": "Casey",
  "Lynbrook": "Casey", "Lyndhurst": "Casey",

  "Pakenham": "Cardinia", "Pakenham North": "Cardinia", "Pakenham South": "Cardinia",
  "Officer": "Cardinia", "Officer South": "Cardinia",
  "Beaconsfield": "Cardinia", "Upper Beaconsfield": "Cardinia",
  "Emerald": "Cardinia", "Koo Wee Rup": "Cardinia",
  "Cockatoo": "Cardinia", "Bunyip": "Cardinia",
  "Garfield": "Cardinia", "Tynong": "Cardinia",

  // South
  "Altona": "Hobsons Bay", "Altona Meadows": "Hobsons Bay",
  "Altona North": "Hobsons Bay", "Williamstown": "Hobsons Bay",
  "Williamstown North": "Hobsons Bay", "Newport": "Hobsons Bay",
  "Seaholme": "Hobsons Bay", "Laverton": "Hobsons Bay",
  "Brooklyn": "Hobsons Bay",
  "Seabrook": "Hobsons Bay",
  "Point Cook": "Wyndham",

  // Peninsula
  "Mornington": "Mornington Peninsula",
  "Mount Martha": "Mornington Peninsula",
  "Dromana": "Mornington Peninsula",
  "Rosebud": "Mornington Peninsula",
  "Rye": "Mornington Peninsula",
  "Sorrento": "Mornington Peninsula",
  "Portsea": "Mornington Peninsula",
  "Blairgowrie": "Mornington Peninsula",
  "Safety Beach": "Mornington Peninsula",
  "McCrae": "Mornington Peninsula",
  "Arthurs Seat": "Mornington Peninsula",
  "Red Hill": "Mornington Peninsula",
  "Merricks": "Mornington Peninsula",
  "Hastings": "Mornington Peninsula",
  "Tyabb": "Mornington Peninsula",

  // East Gippsland
  "Lakes Entrance": "East Gippsland",
  "Bairnsdale": "East Gippsland",
  "Paynesville": "East Gippsland",
  "Metung": "East Gippsland",

  // Bass Coast
  "Phillip Island": "Bass Coast",
  "San Remo": "Bass Coast",
  "Wonthaggi": "Bass Coast",
  "Inverloch": "Bass Coast",
  "Kongwak": "Bass Coast",
  // etc.
};

/**
 * Get median land size (m²) for a suburb
 * @param {string} suburbName
 * @returns {Object|null} { lga_name, median_area_m2, mean_area_m2, q25_area_m2, q75_area_m2, parcel_count } or null
 */
/**
 * Get median land size (m²) for a suburb
 * Uses residential proxy dataset by default (Lot/Plan parcels only)
 * Falls back to V2 (all active parcels) if residential data not available
 * 
 * @param {string} suburbName 
 * @param {string} [useDataset] - 'residential' (default) or 'all'
 * @returns {Object|null}
 */
export function getLandSizeForSuburb(suburbName, useDataset = 'residential') {
  if (!suburbName) return null;

  // ── Tier 1: Suburb-level from comparable_sales ──
  // Most accurate when 3+ sales with land_size_sqm exist for this suburb
  const salesData = loadSuburbSalesData();
  if (salesData && salesData[suburbName]) {
    const s = salesData[suburbName];
    // Only use if we have enough samples (3+) and median is reasonable
    // Reject if min < 200sqm and count <= 20 — strongly suggests Unit/Townhouse
    // entries diluted the sample (e.g. Oakleigh: 8 records, min=63sqm → median=409 is wrong).
    // High-count samples (>20) are accepted regardless since they're likely representative.
    if (s.median && s.median > 50 && (s.count || 0) >= 3 && !(s.min && s.min < 200 && (s.count || 0) <= 20)) {
      return {
        source: 'comparable_sales',
        suburb: suburbName,
        median_area_m2: s.median,
        q25_area_m2: s.q25,
        q75_area_m2: s.q75,
        min_area_m2: s.min,
        max_area_m2: s.max,
        parcel_count: s.count,
        dataset: 'comparable_sales_suburb',
      };
    }
  }

  // ── Tier 2: LGA residential proxy ──
  const lgaName = SUBURB_LGA_MAP[suburbName];
  if (!lgaName) return null;

  if (useDataset === 'residential') {
    const resData = loadResidentialLandSizeData();
    if (resData && resData[lgaName] && resData[lgaName].median_area_m2) {
      const s = resData[lgaName];
      return {
        lga_name: lgaName,
        median_area_m2: s.median_area_m2,
        mean_area_m2: s.mean_area_m2,
        q25_area_m2: s.q25_area_m2,
        q75_area_m2: s.q75_area_m2,
        parcel_count: s.parcel_count,
        dataset: 'residential_proxy',
      };
    }
  }

  // ── Tier 3: Fallback to V2 all-parcel data ──
  const data = loadLandSizeData();
  if (!data) return null;
  const lgaStats = data[lgaName];
  if (!lgaStats || !lgaStats.median_area_m2) return null;

  return {
    lga_name: lgaName,
    median_area_m2: lgaStats.median_area_m2,
    mean_area_m2: lgaStats.mean_area_m2,
    q25_area_m2: lgaStats.q25_area_m2,
    q75_area_m2: lgaStats.q75_area_m2,
    p10_area_m2: lgaStats.p10_area_m2,
    p90_area_m2: lgaStats.p90_area_m2,
    parcel_count: lgaStats.parcel_count,
    dataset: 'all_parcels',
  };
}

/**
 * Get land size factor adjustment for valuation
 * Returns relative factor based on how subject land size compares to LGA median
 * @param {string} suburbName
 * @param {number} subjectLandSize  Subject's land size in m²
 * @returns {Object|null} { factor, lga_median, ratio, description }
 */
/**
 * Get land size factor adjustment for valuation
 * Uses residential proxy dataset by default for better accuracy
 * 
 * @param {string} suburbName
 * @param {number} subjectLandSize  Subject's land size in m²
 * @param {string} [propertyType] - 'House'/'Townhouse' uses residential proxy;
 *                                   'Apartment'/'Unit' returns null (no adjustment)
 * @returns {Object|null}
 */
export function getLandSizeFactor(suburbName, subjectLandSize, propertyType) {
  if (!suburbName || !subjectLandSize || subjectLandSize <= 0) return null;

  // Skip land size factor for apartments/units — strata lots don't have
  // meaningful land size for valuation purposes
  const aptTypes = ['Apartment', 'Unit', 'Flat', 'Studio', 'Penthouse'];
  if (propertyType && aptTypes.includes(propertyType)) {
    return {
      factor: 0,
      skip: true,
      reason: "Land size factor not applied for " + propertyType,
    };
  }

  const stats = getLandSizeForSuburb(suburbName, 'residential');
  if (!stats) return null;

  const lgaMedian = stats.median_area_m2;

  // Use logarithmic adjustment:
  // Land size ratio vs LGA median → factor
  // Double median → +8%, Half median → -8%
  const ratio = subjectLandSize / lgaMedian;
  const rawFactor = Math.log(ratio) * 0.12;
  const factor = Math.max(-0.25, Math.min(0.25, rawFactor));

  // Categorize
  let category = "typical";
  if (ratio < 0.5) category = "small";
  else if (ratio < 0.75) category = "below_typical";
  else if (ratio <= 1.25) category = "typical";
  else if (ratio <= 2.0) category = "above_typical";
  else category = "large";

  const descriptions = {
    "small": "Land size significantly below LGA median",
    "below_typical": "Land size below LGA median",
    "typical": "Land size typical for this LGA",
    "above_typical": "Land size above LGA median",
    "large": "Land size significantly above LGA median",
  };

  return {
    factor: Math.round(factor * 10000) / 10000,
    lga_median: lgaMedian,
    lga_name: stats.lga_name,
    subject_land_size: subjectLandSize,
    ratio: Math.round(ratio * 100) / 100,
    category,
    description: descriptions[category] || "Typical land size",
    detail: `${subjectLandSize} m² vs ${lgaMedian} m² ${stats.lga_name} median (ratio ${ratio.toFixed(2)})`,
  };
}

/**
 * Get LGA-level land size stats for mapping/display
 * @returns {Object} LGA keyed stats object
 */
export function getAllLandSizeStats() {
  return loadLandSizeData();
}

/**
 * Check whether the subject's land size comes from a trusted address-level source.
 * Only user_input, title_record, listing_confirmed, or vicmap_parcel are acceptable
 * as authoritative sources for triggering large-lot mode.
 * @param {Object} subject - Subject property with landSize and landSizeSource
 * @returns {boolean}
 */
export function isAddressLevelLandSource(subject) {
  if (!subject || !subject.landSizeSource) return false;
  const trusted = ["user_input", "title_record", "listing_confirmed", "vicmap_parcel", "contract_of_sale", "survey_plan", "council_record"];
  return trusted.includes(subject.landSizeSource);
}

/**
 * Get P90 land size for a suburb (from LGA-level residential data)
 * @param {string} suburbName
 * @returns {number|null} P90 land size in m², or null
 */
export function getLandSizeP90(suburbName) {
  if (!suburbName) return null;
  const lgaName = SUBURB_LGA_MAP[suburbName];
  if (!lgaName) return null;
  const resData = loadResidentialLandSizeData();
  if (resData && resData[lgaName] && resData[lgaName].p90_area_m2) {
    return resData[lgaName].p90_area_m2;
  }
  // Fallback: V2 all-parcel data
  const data = loadLandSizeData();
  if (data && data[lgaName] && data[lgaName].p90_area_m2) {
    return data[lgaName].p90_area_m2;
  }
  return null;
}

/**
 * Get median land size for a suburb (convenience wrapper)
 * @param {string} suburbName
 * @returns {number|null}
 */
export function getLandSizeMedian(suburbName) {
  const stats = getLandSizeForSuburb(suburbName, 'residential');
  return stats ? stats.median_area_m2 : null;
}
