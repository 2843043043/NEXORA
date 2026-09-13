/**
 * nearbyShops.js
 * ------------------------------------------------------------------
 * Finds real nearby crop/seed/pesticide shops using OpenStreetMap's
 * free Overpass API — NO API key, NO signup, NO billing needed.
 *
 * If nothing is found nearby (common in many villages — OSM shop data
 * is patchy in rural India), the caller should fall back to quick-
 * commerce links (Blinkit/Zepto/BigBasket) — see FALLBACK_LINKS below.
 * ------------------------------------------------------------------
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const SEARCH_RADIUS_M = 8000; // 8 km — wide enough for rural areas

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Quick-commerce fallback links — no API key needed, just deep search links. */
function getFallbackLinks(query = 'pesticide') {
  const q = encodeURIComponent(query);
  return [
    { name: 'Blinkit', url: `https://blinkit.com/s/?q=${q}` },
    { name: 'Zepto', url: `https://www.zeptonow.com/search?query=${q}` },
    { name: 'BigBasket', url: `https://www.bigbasket.com/ps/?q=${q}` },
  ];
}

/**
 * Query Overpass for agri/seed/garden shops within SEARCH_RADIUS_M of (lat, lng).
 * Returns { shops: [...], fallback: boolean, fallbackLinks: [...] }
 */
async function findNearbyShops(lat, lng) {
  const query = `
    [out:json][timeout:20];
    (
      node["shop"="agrarian"](around:${SEARCH_RADIUS_M},${lat},${lng});
      node["shop"="farm"](around:${SEARCH_RADIUS_M},${lat},${lng});
      node["shop"="garden_centre"](around:${SEARCH_RADIUS_M},${lat},${lng});
      way["shop"="agrarian"](around:${SEARCH_RADIUS_M},${lat},${lng});
    );
    out center 20;
  `;

  try {
    const resp = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: query,
    });

    if (!resp.ok) throw new Error('Overpass returned ' + resp.status);

    const data = await resp.json();
    const elements = data.elements || [];

    const shops = elements
      .map((el) => {
        const shopLat = el.lat ?? el.center?.lat;
        const shopLng = el.lon ?? el.center?.lon;
        if (shopLat == null || shopLng == null) return null;
        return {
          name: el.tags?.name || 'Krishi / Beej Bhandar',
          lat: shopLat,
          lng: shopLng,
          distanceKm: Math.round(haversineKm(lat, lng, shopLat, shopLng) * 10) / 10,
          mapsUrl: `https://www.google.com/maps/dir/?api=1&destination=${shopLat},${shopLng}`,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.distanceKm - b.distanceKm)
      .slice(0, 5);

    if (shops.length === 0) {
      return { shops: [], fallback: true, fallbackLinks: getFallbackLinks() };
    }
    return { shops, fallback: false, fallbackLinks: [] };
  } catch (err) {
    console.error('nearbyShops error (falling back to quick-commerce links):', err.message);
    return { shops: [], fallback: true, fallbackLinks: getFallbackLinks() };
  }
}

module.exports = { findNearbyShops, getFallbackLinks };
