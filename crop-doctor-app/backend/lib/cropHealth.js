/**
 * cropHealth.js
 * ------------------------------------------------------------------
 * Turns the AI's Hindi diagnosis text into a structured "AI Crop
 * Health Report":
 *
 *   - overall Health Score        (0-100)
 *   - Disease Risk                (Low / Medium / High + %)
 *   - Pest Risk                   (Low / Medium / High + %)
 *   - Water Stress                (Low / Medium / High)
 *   - Suggested Action            (one practical next step)
 *
 * The AI is asked (see SYSTEM_PROMPT in server.js) to include a small
 * block of structured lines at the end of every diagnosis. This module
 * parses those lines out with regexes, and falls back to a keyword
 * heuristic for any field the AI (or an older demo sample) forgets to
 * include — the report should never come back empty.
 * ------------------------------------------------------------------
 */

const RISK_LEVELS = ['Low', 'Medium', 'High'];

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

/** "Disease Risk: High (72%)" -> { level: 'High', pct: 72 } */
function parseRiskLine(text, label) {
  if (!text) return null;
  const re = new RegExp(`${label}:\\s*(Low|Medium|High)\\s*\\(?(\\d{1,3})?%?\\)?`, 'i');
  const m = text.match(re);
  if (!m) return null;
  const level = m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
  const pct = m[2] ? clamp(parseInt(m[2], 10), 0, 100) : null;
  return { level, pct };
}

function extractHealthScore(text) {
  if (!text) return null;
  const m = text.match(/Health Score:\s*(\d{1,3})/i);
  if (!m) return null;
  return clamp(parseInt(m[1], 10), 0, 100);
}

function extractSuggestedAction(text) {
  if (!text) return null;
  const m = text.match(/Suggested Action:\s*(.+)/i);
  return m ? m[1].trim().replace(/\*+$/, '') : null;
}

/** "📊 Confidence: 54%" -> 54. Falls back to null if the AI didn't state one. */
function extractConfidence(text) {
  if (!text) return null;
  const m = text.match(/Confidence:\s*(\d{1,3})%/i);
  return m ? clamp(parseInt(m[1], 10), 0, 100) : null;
}

/** Below this, the farmer is offered a human expert instead of trusting the AI alone. */
const LOW_CONFIDENCE_THRESHOLD = 60;

/** Heuristic keyword scan used whenever the AI/mock text is missing a field. */
function heuristics(diagnosisText) {
  const lower = (diagnosisText || '').toLowerCase();
  const confMatch = (diagnosisText || '').match(/Confidence:\s*(\d{1,3})%/i);
  const confidence = confMatch ? parseInt(confMatch[1], 10) : 60;

  const healthyHints = /swasth|theek hai|normal dikh|koi dikkat nahi/;
  const isHealthy = healthyHints.test(lower);

  const pestHints = /keede|keeda|aphid|chusne wale|larva|sundhi/;
  const waterHints = /sinchai|paani kam|sookha|murjha|wilting|nami kam/;
  const worseHints = /phaila|bigad|gambhir|zyada|severe/;

  const diseaseLevel = isHealthy ? 'Low' : worseHints.test(lower) ? 'High' : 'Medium';
  const pestLevel = pestHints.test(lower) ? (worseHints.test(lower) ? 'High' : 'Medium') : 'Low';
  const waterLevel = waterHints.test(lower) ? 'Medium' : 'Low';

  const healthScore = isHealthy
    ? 88
    : clamp(Math.round((worseHints.test(lower) ? 40 : 60) - (confidence - 60) * 0.2), 15, 80);

  return {
    healthScore,
    diseaseRisk: { level: diseaseLevel, pct: diseaseLevel === 'High' ? 75 : diseaseLevel === 'Medium' ? 45 : 15 },
    pestRisk: { level: pestLevel, pct: pestLevel === 'High' ? 70 : pestLevel === 'Medium' ? 40 : 10 },
    waterStress: { level: waterLevel },
    suggestedAction: isHealthy
      ? 'Abhi kuch turant karne ki zaroorat nahi — roz apni fasal check karte rahein.'
      : 'Prabhavit patte turant hata dein aur upar diye treatment plan ko follow karein.',
    confidence,
  };
}

/**
 * Builds the full structured report from a diagnosis text, preferring
 * whatever the AI explicitly stated and filling any gaps heuristically.
 */
function extractHealthMetrics(diagnosisText) {
  const fallback = heuristics(diagnosisText);

  const healthScore = extractHealthScore(diagnosisText) ?? fallback.healthScore;
  const diseaseRisk = parseRiskLine(diagnosisText, 'Disease Risk') ?? fallback.diseaseRisk;
  const pestRisk = parseRiskLine(diagnosisText, 'Pest Risk') ?? fallback.pestRisk;
  const waterStress = parseRiskLine(diagnosisText, 'Water Stress') ?? fallback.waterStress;
  const suggestedAction = extractSuggestedAction(diagnosisText) ?? fallback.suggestedAction;
  const confidence = extractConfidence(diagnosisText) ?? fallback.confidence ?? 60;
  const needsExpertEscalation = confidence < LOW_CONFIDENCE_THRESHOLD;

  return { healthScore, diseaseRisk, pestRisk, waterStress, suggestedAction, confidence, needsExpertEscalation };
}

/** Maps a 0-100 score to a farmer-friendly Hindi label, color and emoji for the UI. */
function describeHealthScore(score) {
  if (score >= 80) return { label: 'Bahut Swasth', emoji: '🟢', color: '#2E8B57' };
  if (score >= 60) return { label: 'Theek-Thaak', emoji: '🟡', color: '#8FA83E' };
  if (score >= 35) return { label: 'Dhyan Dein', emoji: '🟠', color: '#E0A03D' };
  return { label: 'Gambhir', emoji: '🔴', color: '#C1443C' };
}

/** Maps a risk level (Low/Medium/High) to a color for badges/bars. */
function riskColor(level) {
  return { Low: '#2E8B57', Medium: '#E0A03D', High: '#C1443C' }[level] || '#8FA83E';
}

/**
 * Nudges a previous health report toward a new state after a follow-up
 * verdict (IMPROVING / STABLE / WORSE) — used when the follow-up
 * AI reply doesn't re-state the full structured block.
 */
function nudgeMetricsForVerdict(prevMetrics, verdict) {
  const prev = prevMetrics || heuristics('');
  const scoreDelta = { IMPROVING: 15, STABLE: 0, WORSE: -20 }[verdict] ?? 0;
  const healthScore = clamp(Math.round((prev.healthScore ?? 55) + scoreDelta), 5, 97);

  const stepRisk = (risk, dir) => {
    const idx = RISK_LEVELS.indexOf(risk?.level || 'Medium');
    const nextIdx = clamp(idx + dir, 0, RISK_LEVELS.length - 1);
    const level = RISK_LEVELS[nextIdx];
    const pct = level === 'High' ? 75 : level === 'Medium' ? 45 : 15;
    return { level, pct };
  };
  const dir = verdict === 'IMPROVING' ? -1 : verdict === 'WORSE' ? 1 : 0;

  // A WORSE verdict erodes how much we'd trust the AI's read on its own; a clear
  // IMPROVING trend nudges confidence back up.
  const confidenceDelta = { IMPROVING: 8, STABLE: 0, WORSE: -15 }[verdict] ?? 0;
  const confidence = clamp(Math.round((prev.confidence ?? 60) + confidenceDelta), 5, 97);

  return {
    healthScore,
    diseaseRisk: stepRisk(prev.diseaseRisk, dir),
    pestRisk: stepRisk(prev.pestRisk, dir),
    waterStress: { level: RISK_LEVELS[clamp(RISK_LEVELS.indexOf(prev.waterStress?.level || 'Low') + dir, 0, 2)] },
    suggestedAction: verdict === 'IMPROVING'
      ? 'Achha chal raha hai — isi treatment ko jaari rakhein aur 5-7 din baad dobara check karein.'
      : verdict === 'WORSE'
        ? 'Turant apne nazdiki Krishi Vigyan Kendra (KVK) ya agri-expert se sampark karein.'
        : 'Dawa ki matra thodi badha kar treatment jaari rakhein, phir dobara photo bhejein.',
    confidence,
    needsExpertEscalation: confidence < LOW_CONFIDENCE_THRESHOLD,
  };
}

module.exports = {
  extractHealthMetrics,
  describeHealthScore,
  riskColor,
  nudgeMetricsForVerdict,
  LOW_CONFIDENCE_THRESHOLD,
};
