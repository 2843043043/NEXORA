/**
 * cases.js
 * ------------------------------------------------------------------
 * Tracks each "crop case" from first diagnosis through follow-up
 * checks, so the app can compare a farmer's before/after photos and
 * tell them if the plant is improving, stable, or getting worse.
 *
 * Photos are saved to disk (backend/data/case-photos/) ONLY so a
 * later follow-up can be compared against the original — this is a
 * demo-scale simplification. In production these would live in
 * short-lived object storage with an expiry, not committed anywhere.
 * ------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CASES_PATH = path.join(__dirname, '..', 'data', 'cases.json');
const PHOTOS_DIR = path.join(__dirname, '..', 'data', 'case-photos');

function readCases() {
  if (!fs.existsSync(CASES_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(CASES_PATH, 'utf8'));
  } catch (e) {
    return {};
  }
}
function writeCases(cases) {
  fs.mkdirSync(path.dirname(CASES_PATH), { recursive: true });
  fs.writeFileSync(CASES_PATH, JSON.stringify(cases, null, 2));
}
function savePhoto(imageBase64, mediaType) {
  if (!imageBase64) return null;
  fs.mkdirSync(PHOTOS_DIR, { recursive: true });
  const ext = (mediaType || 'image/jpeg').split('/')[1] || 'jpg';
  const fileName = `${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
  fs.writeFileSync(path.join(PHOTOS_DIR, fileName), Buffer.from(imageBase64, 'base64'));
  return fileName;
}
function loadPhotoBase64(fileName) {
  if (!fileName) return null;
  const p = path.join(PHOTOS_DIR, fileName);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p).toString('base64');
}

/** Create a new case for a first-time diagnosis. */
function createCase({ farmerId, imageBase64, mediaType, diagnosisText, healthMetrics }) {
  const cases = readCases();
  const caseId = 'case_' + crypto.randomBytes(6).toString('hex');
  const photoFile = savePhoto(imageBase64, mediaType);

  cases[caseId] = {
    caseId,
    farmerId,
    createdAt: new Date().toISOString(),
    originalPhoto: photoFile,
    originalMediaType: mediaType || 'image/jpeg',
    initialDiagnosis: diagnosisText,
    healthMetrics: healthMetrics || null,
    status: 'NEW',
    followups: [],
  };
  writeCases(cases);
  return cases[caseId];
}

/** Attach a follow-up result to an existing case. */
function addFollowup({ caseId, verdict, aiText, imageBase64, mediaType, healthMetrics }) {
  const cases = readCases();
  const c = cases[caseId];
  if (!c) return null;

  const photoFile = savePhoto(imageBase64, mediaType);
  c.followups.push({
    at: new Date().toISOString(),
    verdict, // IMPROVING | STABLE | WORSE
    aiText,
    photo: photoFile,
    healthMetrics: healthMetrics || null,
  });
  c.status = verdict;
  if (healthMetrics) c.healthMetrics = healthMetrics;
  writeCases(cases);
  return c;
}

function getCase(caseId) {
  const cases = readCases();
  return cases[caseId] || null;
}

function listCasesForFarmer(farmerId) {
  const cases = readCases();
  return Object.values(cases)
    .filter((c) => c.farmerId === farmerId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
}

module.exports = { createCase, addFollowup, getCase, listCasesForFarmer, loadPhotoBase64 };
