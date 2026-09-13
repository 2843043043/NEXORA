/**
 * outbreak.js
 * ------------------------------------------------------------------
 * Turns individual diagnoses into a community-level early-warning
 * signal: if several farmers in the same rough area report the same
 * disease within a short window, nearby farmers get an alert.
 *
 * Privacy: we never store exact GPS — coordinates are rounded to a
 * ~5km grid cell before anything is saved, so no individual farmer's
 * precise location is ever recorded.
 * ------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');

const OUTBREAK_PATH = path.join(__dirname, '..', 'data', 'outbreak.json');
const WINDOW_DAYS = 14;
const GRID_SIZE = 0.05; // ~5km grid cells

function readReports() {
  if (!fs.existsSync(OUTBREAK_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(OUTBREAK_PATH, 'utf8'));
  } catch (e) {
    return [];
  }
}

function writeReports(reports) {
  fs.mkdirSync(path.dirname(OUTBREAK_PATH), { recursive: true });
  fs.writeFileSync(OUTBREAK_PATH, JSON.stringify(reports, null, 2));
}

function gridCell(lat, lng) {
  return `${Math.round(lat / GRID_SIZE)}_${Math.round(lng / GRID_SIZE)}`;
}

/** Pull a short, comparable disease name out of the AI's Hindi diagnosis text. */
function extractDiseaseKeyword(diagnosisText) {
  const line = (diagnosisText || '').split('\n').find((l) => l.includes('Rog:'));
  if (!line) return null;
  // Prefer the English name in parentheses if present — groups submissions
  // more reliably than free-form Hindi phrasing.
  const paren = line.match(/\(([^)]+)\)/);
  const raw = paren ? paren[1] : line.split('Rog:')[1];
  return raw ? raw.trim().toLowerCase().replace(/[^a-z0-9\u0900-\u097F\s]/g, '') : null;
}

/**
 * Record this diagnosis for outbreak tracking, and return the current
 * risk level for this disease in this area.
 */
function recordAndCheckOutbreak({ lat, lng, diagnosisText }) {
  const keyword = extractDiseaseKeyword(diagnosisText);
  if (typeof lat !== 'number' || typeof lng !== 'number' || !keyword) {
    return { tracked: false, count: 0, risk: 'NONE' };
  }

  const cell = gridCell(lat, lng);
  const now = Date.now();
  const cutoff = now - WINDOW_DAYS * 24 * 60 * 60 * 1000;

  let reports = readReports().filter((r) => r.timestamp >= cutoff); // drop old entries as we go
  reports.push({ cell, keyword, timestamp: now });
  writeReports(reports);

  const count = reports.filter((r) => r.cell === cell && r.keyword === keyword).length;

  let risk = 'LOW';
  if (count >= 6) risk = 'HIGH';
  else if (count >= 3) risk = 'MEDIUM';

  return { tracked: true, count, risk, keyword };
}

module.exports = { recordAndCheckOutbreak, extractDiseaseKeyword };
