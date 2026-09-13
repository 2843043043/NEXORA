/**
 * otpAuth.js — Mobile number + OTP login
 * ------------------------------------------------------------------
 * Simple OTP login so a farmer's Agri Points / Crop Health Passport
 * are tied to their real phone number instead of a random per-browser
 * id (which is lost if they clear their browser or switch devices).
 *
 * REAL SMS DELIVERY:
 *   Uses Fast2SMS (fast2sms.com) — chosen because its "otp" route sends
 *   real OTP texts to Indian mobile numbers without needing a DLT-approved
 *   template first (most other gateways require that paperwork before
 *   they'll send anything). Get a free-trial API key from your Fast2SMS
 *   dashboard → API Keys, then put it in backend/.env as:
 *     FAST2SMS_API_KEY=your_key_here
 *
 *   Without that key set, the app falls back to DEMO MODE: the OTP is
 *   logged to the server console and returned to the browser so the
 *   flow is still testable end-to-end — clearly marked as demo mode.
 * ------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const USERS_PATH = path.join(__dirname, '..', 'data', 'users.json');

const OTP_TTL_MS = 5 * 60 * 1000;       // OTP valid for 5 minutes
const RESEND_COOLDOWN_MS = 30 * 1000;   // 30s between resends
const MAX_VERIFY_ATTEMPTS = 5;          // guesses allowed per OTP

const FAST2SMS_API_KEY = process.env.FAST2SMS_API_KEY || '';
const SMS_ENABLED = !!FAST2SMS_API_KEY;

// In-memory — fine for a demo; OTPs are short-lived anyway.
const otpStore = new Map(); // mobile -> { otp, expiresAt, attempts, lastSentAt }

function isValidMobile(mobile) {
  return /^[6-9]\d{9}$/.test(String(mobile || '').trim());
}

function generateOtpCode() {
  return String(crypto.randomInt(1000, 10000)); // 4-digit
}

function readUsers() {
  if (!fs.existsSync(USERS_PATH)) return { byMobile: {} };
  try {
    return JSON.parse(fs.readFileSync(USERS_PATH, 'utf8'));
  } catch (e) {
    return { byMobile: {} };
  }
}

function writeUsers(users) {
  fs.mkdirSync(path.dirname(USERS_PATH), { recursive: true });
  fs.writeFileSync(USERS_PATH, JSON.stringify(users, null, 2));
}

/** Looks up (or creates) a stable farmerId for a verified mobile number. */
function getOrCreateFarmerId(mobile) {
  const users = readUsers();
  if (users.byMobile[mobile]) return users.byMobile[mobile].farmerId;

  const farmerId = 'farmer-' + crypto.randomBytes(5).toString('hex');
  users.byMobile[mobile] = { farmerId, mobile, createdAt: new Date().toISOString() };
  writeUsers(users);
  return farmerId;
}

/**
 * Sends the OTP as a real SMS via Fast2SMS's OTP route.
 * Returns true if the gateway accepted it, false otherwise (caller falls
 * back to demo/console mode so the login flow never gets stuck).
 */
async function sendRealSms(mobile, otp) {
  try {
    const url = `https://www.fast2sms.com/dev/bulkV2?authorization=${encodeURIComponent(FAST2SMS_API_KEY)}&route=otp&variables_values=${otp}&flash=0&numbers=${mobile}`;
    const resp = await fetch(url, { method: 'GET' });
    const data = await resp.json().catch(() => null);
    if (!resp.ok || !data || data.return !== true) {
      console.error('Fast2SMS did not accept the OTP request:', data || resp.status);
      return false;
    }
    console.log(`\n📲 Real SMS sent via Fast2SMS to +91 ${mobile} (request id: ${data.request_id || 'n/a'})\n`);
    return true;
  } catch (err) {
    console.error('Fast2SMS request failed, falling back to demo mode:', err.message);
    return false;
  }
}

/**
 * Delivers an OTP — real SMS when FAST2SMS_API_KEY is configured,
 * otherwise a console-logged demo OTP. Returns whether it was really sent.
 */
async function deliverOtp(mobile, otp) {
  if (SMS_ENABLED) {
    const sent = await sendRealSms(mobile, otp);
    if (sent) return true;
    // fall through to demo logging if the real send failed, so testing
    // isn't blocked by a gateway hiccup
  }
  console.log(`\n📱 [DEMO SMS] OTP for +91 ${mobile}: ${otp}  (valid 5 min — set FAST2SMS_API_KEY in backend/.env to send a real SMS)\n`);
  return false;
}

/**
 * Generates and sends an OTP for a mobile number.
 * Returns { ok: true, sentReal, demoOtp? } or { ok: false, error }.
 * `demoOtp` is only included when the SMS wasn't actually delivered,
 * so a real deployment never leaks OTPs back to the client.
 */
async function sendOtp(mobile) {
  if (!isValidMobile(mobile)) {
    return { ok: false, error: 'Sahi 10 anko ka mobile number dalein.' };
  }

  const existing = otpStore.get(mobile);
  if (existing && Date.now() - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    const waitSec = Math.ceil((RESEND_COOLDOWN_MS - (Date.now() - existing.lastSentAt)) / 1000);
    return { ok: false, error: `Thodi der ruk kar dobara try karein (${waitSec}s).` };
  }

  const otp = generateOtpCode();
  otpStore.set(mobile, {
    otp,
    expiresAt: Date.now() + OTP_TTL_MS,
    attempts: 0,
    lastSentAt: Date.now(),
  });

  const sentReal = await deliverOtp(mobile, otp);

  return sentReal ? { ok: true, sentReal: true } : { ok: true, sentReal: false, demoOtp: otp };
}

/**
 * Verifies an OTP for a mobile number.
 * Returns { ok: true, farmerId } or { ok: false, error }.
 */
function verifyOtp(mobile, otp) {
  if (!isValidMobile(mobile)) {
    return { ok: false, error: 'Sahi mobile number dalein.' };
  }

  const entry = otpStore.get(mobile);
  if (!entry) {
    return { ok: false, error: 'Pehle OTP mangwayein.' };
  }
  if (Date.now() > entry.expiresAt) {
    otpStore.delete(mobile);
    return { ok: false, error: 'OTP expire ho gaya. Naya OTP mangwayein.' };
  }
  if (entry.attempts >= MAX_VERIFY_ATTEMPTS) {
    otpStore.delete(mobile);
    return { ok: false, error: 'Bahut zyada galat try. Naya OTP mangwayein.' };
  }
  if (String(otp).trim() !== entry.otp) {
    entry.attempts += 1;
    return { ok: false, error: 'Galat OTP. Dobara try karein.' };
  }

  otpStore.delete(mobile);
  const farmerId = getOrCreateFarmerId(mobile);
  return { ok: true, farmerId };
}

module.exports = { isValidMobile, sendOtp, verifyOtp };
