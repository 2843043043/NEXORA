/**
 * weather.js
 * ------------------------------------------------------------------
 * Adds weather context to AI advice — e.g. "rain expected tomorrow,
 * postpone spraying" or "high humidity, avoid overhead irrigation".
 *
 * Uses Open-Meteo (https://open-meteo.com) — completely free, NO API
 * key, NO signup. Perfect for a zero-setup hackathon demo.
 * ------------------------------------------------------------------
 */

const OPEN_METEO_URL = 'https://api.open-meteo.com/v1/forecast';

function buildCropAlerts(daily) {
  const probs = daily?.precipitation_probability_max || [];
  const dates = daily?.time || [];
  const alerts = [];
  probs.forEach((prob, i) => {
    if (Number(prob) >= 60) alerts.push({ date: dates[i], probability: Number(prob), severity: Number(prob) >= 80 ? 'HIGH' : 'MEDIUM' });
  });
  return alerts;
}

async function getWeatherForecast(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;
  try {
    const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max` +
      `&forecast_days=7&timezone=auto`;
    const resp = await fetch(url); if (!resp.ok) throw new Error('Open-Meteo returned ' + resp.status);
    const data = await resp.json();
    const alerts = buildCropAlerts(data.daily);
    return {
      current: { temperature: data.current?.temperature_2m, humidity: data.current?.relative_humidity_2m, precipitation: data.current?.precipitation },
      days: (data.daily?.time || []).map((date, i) => ({ date, max: data.daily.temperature_2m_max?.[i], min: data.daily.temperature_2m_min?.[i], rainChance: data.daily.precipitation_probability_max?.[i], rainMm: data.daily.precipitation_sum?.[i], weatherCode: data.daily.weather_code?.[i] })),
      alerts,
      primaryAlert: alerts[0] || null
    };
  } catch (err) { console.error('forecast fetch failed:', err.message); return null; }
}

/**
 * Fetch a short weather summary for (lat, lng) to feed into the AI prompt.
 * Returns null if weather can't be fetched (no internet, bad coords, etc.)
 * — the app must work fine without it.
 */
async function getWeatherContext(lat, lng) {
  if (typeof lat !== 'number' || typeof lng !== 'number') return null;

  try {
    const url = `${OPEN_METEO_URL}?latitude=${lat}&longitude=${lng}` +
      `&current=temperature_2m,relative_humidity_2m,precipitation` +
      `&daily=precipitation_probability_max,temperature_2m_max` +
      `&forecast_days=2&timezone=auto`;

    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Open-Meteo returned ' + resp.status);
    const data = await resp.json();

    const humidity = data.current?.relative_humidity_2m;
    const tempNow = data.current?.temperature_2m;
    const rainToday = data.daily?.precipitation_probability_max?.[0];
    const rainTomorrow = data.daily?.precipitation_probability_max?.[1];

    return {
      humidity,
      tempNow,
      rainTodayPct: rainToday,
      rainTomorrowPct: rainTomorrow,
      // A short natural-language line the AI prompt can use directly.
      summary: `Abhi tapmaan ${tempNow ?? '?'}°C, humidity ${humidity ?? '?'}%. `
        + `Baarish ki sambhavna: aaj ${rainToday ?? '?'}%, kal ${rainTomorrow ?? '?'}%.`,
    };
  } catch (err) {
    console.error('weather fetch failed (continuing without it):', err.message);
    return null;
  }
}

module.exports = { getWeatherContext, getWeatherForecast };
