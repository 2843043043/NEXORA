require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');

const { appendBlock, getLedgerSummary, getPassportForFarmer } = require('./lib/ledger');
const { getMockDiagnosis, getMockFollowup } = require('./lib/mockDiagnosis');
const { getMockVideoReply } = require('./lib/videoChat');
const { findNearbyShops, getFallbackLinks } = require('./lib/nearbyShops');
const { getWeatherContext, getWeatherForecast } = require('./lib/weather');
const { recordAndCheckOutbreak } = require('./lib/outbreak');
const { createCase, addFollowup, getCase, listCasesForFarmer, loadPhotoBase64 } = require('./lib/cases');
const { extractHealthMetrics, describeHealthScore, nudgeMetricsForVerdict } = require('./lib/cropHealth');
const { sendOtp, verifyOtp } = require('./lib/otpAuth');

const app = express();
const PORT = process.env.PORT || 3000;

const HAS_KEY = !!process.env.ANTHROPIC_API_KEY;
const DEMO_MODE = !HAS_KEY;

if (DEMO_MODE) {
  console.log(
    '\n🟡 DEMO MODE: no ANTHROPIC_API_KEY found — using realistic sample diagnoses instead of calling the real AI.'
    + '\n   Isse bina kisi setup ke poora project chalega. Real AI ke liye backend/.env mein apni key daalein.\n'
  );
}

const anthropic = HAS_KEY ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }) : null;

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const LANGUAGES = {
  hi: 'Hindi (Devanagari script)',
  en: 'English',
  mr: 'Marathi (Devanagari script)',
  pa: 'Punjabi (Gurmukhi script)',
  ta: 'Tamil script',
  te: 'Telugu script',
  bn: 'Bengali script',
  gu: 'Gujarati script',
};
function langName(code) { return LANGUAGES[code] || LANGUAGES.hi; }

function buildSystemPrompt(langCode) {
  const L = langName(langCode);
  return `Tum "Crop Doctor AI" ho — lekin jawab dete waqt tum ek AI jaise bilkul mat lago. Tum ek asli, anubhavi krishi vigyan kendra (KVK) ke expert ho jo kisi apne gaanv ke kisan bhai/behen ko seedha WhatsApp par reply kar raha hai, jaise roz karta ho. Kisan photo aur/ya apni bhasha mein symptom bhejta hai. Tumhe SIRF ${L} mein, bahut simple, apnepan wali gaon-friendly bhasha mein jawab dena hai. Koi bhaari-bharkam jargon nahi.

BAHUT ZAROORI — likhne ka andaaz:
- Ek insaan ki tarah, seedhe seedhe, garmjoshi se baat karo — jaise "Namaste bhai, dekh liya maine photo..." ya "Achha, yeh dikkat hai...". Formal report ya dashboard jaisa mat likho.
- Koi bullet-headings, koi "🩺 Rog:", "📊 Confidence:", "🌿 Treatment Journey:" jaise labelled fields is hisse mein MAT lagao — yeh robotic lagta hai. Bas normal baatcheet ke 4-6 chhote vaakya likho, jaise koi expert bol raha ho.
- Is natural jawab mein cover karo: tumhe kya samasya dikh rahi hai, abhi turant kya karna hai, agle kuch dino ka plan aur dawa ka generic naam (exact brand/dosage kabhi mat batao — hamesha local KVK/dukaandaar se confirm karne ko kaho), aur 7 din baad dobara photo bhejne ko kaho.
- Kabhi-kabhi thoda insaan jaisi filler bhi theek hai (jaise "dekhiye", "waise", "aap tension mat lijiye") taaki bilkul robotic na lage — lekin overdo mat karo, seedha aur useful raho.
- Poora jawab 6-8 chhoti lines se zyada lamba na ho.

Is natural jawab ke turant baad, ek KHAALI LINE chhod kar, hamesha yeh 5 structured data lines bhi EXACTLY isi format mein, isi ANGREZI (English) labels ke saath alag se do — chahe upar wala jawab jis bhi bhasha mein ho, yeh niche wala block HAMESHA in exact English labels mein hi rahega (yeh kisan ko nahi dikhaayi jaayengi — sirf app ke andar "AI Crop Health Report" dashboard banane ke liye internally parse hongi, isliye wording/order/language bilkul mat badlo):

🌡️ Health Score: [0-100 ke beech ek number — 100 matlab paudha bilkul swasth, 0 matlab bahut zyada bimar]
🦠 Disease Risk: [Low ya Medium ya High] ([0-100 ke beech ek %])
🐛 Pest Risk: [Low ya Medium ya High] ([0-100 ke beech ek %])
💧 Water Stress: [Low ya Medium ya High]
🎯 Suggested Action: [sabse zaroori EK agla kadam, 1 chhoti line mein, ${L} mein]
📊 Confidence: [ek mota-mota % andaza, jaise "80%"]

Agar weather context diya gaya ho, to usse treatment timing mein use karo (jaise "kal baarish hai, spray postpone karein" ya "humidity zyada hai, fungal risk badh sakta hai") — lekin natural baatcheet mein hi, jaise koi insaan mausam ka zikr karta hai.

Agar photo clear nahi hai ya rog confirm nahi ho pa raha, to politely bolo aur kisan se aur jaankari maango. Kabhi bhi exact chemical dosage/quantity mat batao — hamesha local expert se confirm karne ko kaho.`;
}

function buildFollowupSystemPrompt(langCode) {
  const L = langName(langCode);
  return `Tum "Crop Doctor AI" ho. Kisan ne pehle ek patte ki photo bheji thi (uska diagnosis niche diya hai), aur ab 7 din baad ek NAYI photo bheji hai follow-up ke liye. Tumhe dono ki tulna (compare) karke batana hai ki paudha behtar ho raha hai, waisa hi hai, ya bigad raha hai.

SIRF ${L} mein, chhota jawab do, is format mein:

[VERDICT_LINE — bilkul yeh likho, teen mein se ek, hamesha ANGREZI mein: "VERDICT: IMPROVING" ya "VERDICT: STABLE" ya "VERDICT: WORSE"]
[Uske baad 3-4 line ka explanation aur agla kadam, farmer-friendly bhasha mein, ${L} mein]

Agar sudhaar dikhe to IMPROVING, halka ya koi badlaav na dikhe to STABLE, aur agar zyada phaila/bigda dikhe to WORSE likhna hai — aur WORSE ke case mein hamesha local Krishi Vigyan Kendra se turant sampark karne ki salah do.`;
}

function buildVideoChatSystemPrompt(langCode) {
  const L = langName(langCode);
  return `Tum "Crop Doctor AI" ho, aur abhi ek LIVE VIDEO CALL par ho ek kisan ke saath — bilkul jaise koi doctor video call par patient se baat karta hai. Yeh ek BOLCHAAL (spoken conversation) hai, likhne wala report NAHI.

Sakht niyam:
- SIRF ${L} mein bolo, bahut simple gaon-friendly bhasha.
- Chhote, natural bolne jaise vaakya bolo — jaise koi insaan seedha baat kar raha ho.
- KOI bullet points, emoji headers, ya "🩺 Rog:" jaisa report format MAT karo — yeh sirf bola jaayega (text-to-speech), likha hua report nahi.
- 2-3 chhoti lines se zyada mat bolo ek baar mein — jaise real conversation mein hota hai.
- Agar kisan ne photo bheji hai, usse dekh kar seedha comment karo, jaise "Haan, yeh dikh raha hai ki...".
- Agar zaroori jaankari kam hai (kaunsi fasal, kab se dikkat), to politely poochho — pura interrogation mat karo, ek time par ek hi sawaal.
- Kabhi exact dawa ki matra/dosage mat batao — hamesha KVK/local expert se confirm karne ko kaho, lekin isse conversation mein naturally kaho, list format mein nahi.
- Garmjoshi aur apnepan se baat karo, jaise ek meharbaan doctor apne mareez se baat karta hai.`;
}

async function callClaude({ systemPrompt, contentBlocks, maxTokens = 500 }) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: 'user', content: contentBlocks }],
  });
  return response.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
}

/** Same as callClaude, but for multi-turn conversations (used by the AI Video Call). */
async function callClaudeConversation({ systemPrompt, messages, maxTokens = 300 }) {
  const response = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages,
  });
  return response.content.filter((c) => c.type === 'text').map((c) => c.text).join('\n').trim();
}

/**
 * POST /api/diagnose
 * body: { text?, imageBase64?, mediaType?, farmerId?, lat?, lng? }
 */
app.post('/api/diagnose', async (req, res) => {
  try {
    const { text, imageBase64, mediaType, farmerId, lat, lng, language } = req.body || {};

    if (!text && !imageBase64) {
      return res.status(400).json({ error: 'Bhejein: kam se kam text ya photo.' });
    }

    // Weather context (best-effort — never blocks the flow if it fails)
    const weather = (typeof lat === 'number' && typeof lng === 'number')
      ? await getWeatherContext(lat, lng)
      : null;

    let diagnosis;
    if (HAS_KEY) {
      try {
        const contentBlocks = [];
        if (imageBase64) {
          contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } });
        }
        let userText = text || 'Is patte mein kya dikkat hai, dekh kar bataiye.';
        if (weather) userText += `\n\n[Weather context: ${weather.summary}]`;
        contentBlocks.push({ type: 'text', text: userText });

        diagnosis = await callClaude({ systemPrompt: buildSystemPrompt(language), contentBlocks });
      } catch (apiErr) {
        console.error('Anthropic API call failed, falling back to demo mode:', apiErr.message);
        diagnosis = getMockDiagnosis({ text });
      }
    } else {
      diagnosis = getMockDiagnosis({ text });
    }

    // ---- AI Crop Health Report: parse the structured block the AI appends,
    //      then strip it out of the chat-facing text (farmer sees plain Hindi;
    //      the structured numbers power the dedicated Health Score page). ----
    const healthMetrics = extractHealthMetrics(diagnosis);
    const chatDiagnosis = diagnosis.replace(/\n*🌡️ Health Score:[\s\S]*$/i, '').trim();

    // ---- Crop Health Passport: create a case so a follow-up can be linked later ----
    const cropCase = createCase({ farmerId: farmerId || req.ip, imageBase64, mediaType, diagnosisText: chatDiagnosis, healthMetrics });

    // ---- Web3 layer: log this passport entry, award Agri Points ----
    const ledgerResult = appendBlock({
      rawFarmerId: farmerId || req.ip,
      imageBase64,
      diagnosisSummary: chatDiagnosis,
      stage: 'diagnosis',
      caseId: cropCase.caseId,
    });

    // ---- Community outbreak tracking (best-effort, privacy-preserving) ----
    const outbreak = (typeof lat === 'number' && typeof lng === 'number')
      ? recordAndCheckOutbreak({ lat, lng, diagnosisText: chatDiagnosis })
      : { tracked: false, count: 0, risk: 'NONE' };

    res.json({
      diagnosis: chatDiagnosis,
      demoMode: !HAS_KEY,
      caseId: cropCase.caseId,
      weather,
      outbreak,
      confidence: healthMetrics.confidence,
      needsExpertEscalation: healthMetrics.needsExpertEscalation,
      healthReport: {
        ...healthMetrics,
        scoreInfo: describeHealthScore(healthMetrics.healthScore),
        caseId: cropCase.caseId,
        updatedAt: cropCase.createdAt,
      },
      ledger: {
        tokensAwarded: ledgerResult.tokensAwarded,
        totalTokens: ledgerResult.totalTokens,
        chainLength: ledgerResult.chainLength,
        blockHash: ledgerResult.block.blockHash,
      },
    });
  } catch (err) {
    console.error('diagnose error:', err);
    res.status(500).json({ error: 'AI se jawab nahi mila. Thodi der baad try karein.' });
  }
});

/**
 * POST /api/followup
 * body: { caseId, imageBase64, mediaType, farmerId }
 * Compares the new photo against the case's original photo.
 */
app.post('/api/followup', async (req, res) => {
  try {
    const { caseId, imageBase64, mediaType, farmerId, language } = req.body || {};
    if (!caseId || !imageBase64) {
      return res.status(400).json({ error: 'caseId aur nayi photo dono chahiye.' });
    }

    const cropCase = getCase(caseId);
    if (!cropCase) return res.status(404).json({ error: 'Yeh case nahi mila. Pehle ek naya diagnosis karein.' });

    let verdict, aiText;

    if (HAS_KEY) {
      try {
        const beforeBase64 = loadPhotoBase64(cropCase.originalPhoto);
        const contentBlocks = [];
        if (beforeBase64) {
          contentBlocks.push({ type: 'text', text: 'Pehli (BEFORE) photo:' });
          contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: cropCase.originalMediaType || 'image/jpeg', data: beforeBase64 } });
        }
        contentBlocks.push({ type: 'text', text: `Pichla diagnosis tha: ${cropCase.initialDiagnosis}\n\nAb yeh NAYI (AFTER) photo hai:` });
        contentBlocks.push({ type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } });

        const raw = await callClaude({ systemPrompt: buildFollowupSystemPrompt(language), contentBlocks, maxTokens: 350 });
        const match = raw.match(/VERDICT:\s*(IMPROVING|STABLE|WORSE)/i);
        verdict = match ? match[1].toUpperCase() : 'STABLE';
        aiText = raw.replace(/VERDICT:\s*(IMPROVING|STABLE|WORSE)\s*/i, '').trim();
      } catch (apiErr) {
        console.error('Follow-up API call failed, falling back to demo mode:', apiErr.message);
        const mock = getMockFollowup();
        verdict = mock.verdict;
        aiText = mock.aiText;
      }
    } else {
      const mock = getMockFollowup();
      verdict = mock.verdict;
      aiText = mock.aiText;
    }

    // ---- AI Crop Health Report: nudge the previous report toward the new verdict ----
    const nextHealthMetrics = nudgeMetricsForVerdict(cropCase.healthMetrics, verdict);

    const updatedCase = addFollowup({ caseId, verdict, aiText, imageBase64, mediaType, healthMetrics: nextHealthMetrics });

    const ledgerResult = appendBlock({
      rawFarmerId: farmerId || req.ip,
      imageBase64,
      diagnosisSummary: `${verdict}: ${aiText}`,
      stage: 'followup',
      caseId,
    });

    res.json({
      verdict,
      aiText,
      demoMode: !HAS_KEY,
      case: updatedCase,
      confidence: nextHealthMetrics.confidence,
      needsExpertEscalation: nextHealthMetrics.needsExpertEscalation,
      healthReport: {
        ...nextHealthMetrics,
        scoreInfo: describeHealthScore(nextHealthMetrics.healthScore),
        caseId,
        updatedAt: new Date().toISOString(),
      },
      ledger: {
        tokensAwarded: ledgerResult.tokensAwarded,
        totalTokens: ledgerResult.totalTokens,
        chainLength: ledgerResult.chainLength,
      },
    });
  } catch (err) {
    console.error('followup error:', err);
    res.status(500).json({ error: 'Follow-up analyse nahi ho paaya. Thodi der baad try karein.' });
  }
});

/** GET /api/cases/:farmerId — list a farmer's crop cases (for the follow-up picker). */
app.get('/api/cases/:farmerId', (req, res) => {
  try {
    const cases = listCasesForFarmer(req.params.farmerId);
    res.json({ cases });
  } catch (err) {
    res.status(500).json({ error: 'Cases load nahi ho paaye.' });
  }
});

/**
 * GET /api/health-report/:farmerId
 * Powers the dedicated "AI Crop Health Score" page — returns the
 * structured report (score + disease/pest risk + water stress +
 * suggested action) for the farmer's most recent crop case, so the
 * page works standalone (e.g. on refresh, or opened in a new tab)
 * without needing an active chat session.
 */
app.get('/api/health-report/:farmerId', (req, res) => {
  try {
    const cases = listCasesForFarmer(req.params.farmerId); // newest first
    const latest = cases[0];
    if (!latest) return res.json({ hasReport: false });

    const metrics = latest.healthMetrics || extractHealthMetrics(latest.initialDiagnosis);
    res.json({
      hasReport: true,
      caseId: latest.caseId,
      updatedAt: latest.followups?.length ? latest.followups[latest.followups.length - 1].at : latest.createdAt,
      diagnosisTitle: (latest.initialDiagnosis || '').split('\n')[0] || null,
      ...metrics,
      scoreInfo: describeHealthScore(metrics.healthScore),
    });
  } catch (err) {
    console.error('health-report error:', err);
    res.status(500).json({ error: 'Health report load nahi ho paaya.' });
  }
});

/** GET /api/passport/:farmerId — full Crop Health Passport history for a farmer. */
app.get('/api/passport/:farmerId', (req, res) => {
  try {
    res.json({ entries: getPassportForFarmer(req.params.farmerId) });
  } catch (err) {
    res.status(500).json({ error: 'Passport load nahi ho paaya.' });
  }
});

/**
 * POST /api/video-chat
 * body: { message: string, imageBase64?, mediaType?, history?: [{role,text}], farmerId?, isFirstTurn? }
 *
 * Powers the "AI Video Call" feature — a natural back-and-forth spoken
 * conversation (not the structured WhatsApp-style report from
 * /api/diagnose). The frontend keeps conversation history client-side
 * and resends it each turn (stateless backend, consistent with the
 * rest of the app).
 */
app.post('/api/video-chat', async (req, res) => {
  try {
    const { message, imageBase64, mediaType, history, farmerId, isFirstTurn, language } = req.body || {};

    let reply;
    if (HAS_KEY) {
      try {
        const pastTurns = (history || []).slice(-8).map((h) => ({
          role: h.role === 'ai' ? 'assistant' : 'user',
          content: h.text,
        }));

        const currentContent = [];
        if (imageBase64) {
          currentContent.push({ type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } });
        }
        currentContent.push({ type: 'text', text: message || 'Namaste' });

        const messages = [...pastTurns, { role: 'user', content: currentContent }];

        reply = await callClaudeConversation({ systemPrompt: buildVideoChatSystemPrompt(language), messages, maxTokens: 250 });
      } catch (apiErr) {
        console.error('video-chat API call failed, falling back to demo mode:', apiErr.message);
        reply = getMockVideoReply(message, isFirstTurn);
      }
    } else {
      reply = getMockVideoReply(message, isFirstTurn);
    }

    res.json({ reply, demoMode: !HAS_KEY });
  } catch (err) {
    console.error('video-chat error:', err);
    res.status(500).json({ error: 'Call mein kuch gadbad ho gayi. Dobara try karein.' });
  }
});

/**
 * POST /api/nearby-shops
 * body: { lat: number, lng: number }
 */
app.post('/api/nearby-shops', async (req, res) => {
  try {
    const { lat, lng } = req.body || {};
    if (typeof lat !== 'number' || typeof lng !== 'number') {
      return res.status(400).json({ error: 'Location (lat, lng) chahiye.' });
    }
    const result = await findNearbyShops(lat, lng);
    res.json(result);
  } catch (err) {
    console.error('nearby-shops error:', err);
    res.json({ shops: [], fallback: true, fallbackLinks: getFallbackLinks() });
  }
});


/** GET /api/weather?lat=...&lng=... — 7-day forecast with crop-protection alerts */
app.get('/api/weather', async (req, res) => {
  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return res.status(400).json({ error: 'Location coordinates required.' });
  const forecast = await getWeatherForecast(lat, lng);
  if (!forecast) return res.status(503).json({ error: 'Weather forecast abhi available nahi hai.' });
  res.json(forecast);
});

/** GET /api/ledger — inspect the mock on-chain ledger (for judges/demo). */
app.get('/api/ledger', (req, res) => {
  res.json(getLedgerSummary());
});

app.get('/api/health', (req, res) => res.json({ ok: true, demoMode: DEMO_MODE }));

/**
 * POST /api/auth/send-otp
 * body: { mobile: string } — 10-digit Indian mobile number.
 * Sends a real SMS via Fast2SMS when FAST2SMS_API_KEY is set in backend/.env.
 * Otherwise falls back to demo mode: the OTP is logged to the server console
 * and also returned as `demoOtp` so the login flow stays fully testable
 * without a real SMS gateway.
 */
app.post('/api/auth/send-otp', async (req, res) => {
  const { mobile } = req.body || {};
  const result = await sendOtp(mobile);
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, sentReal: result.sentReal, demoOtp: result.demoOtp });
});

/**
 * POST /api/auth/verify-otp
 * body: { mobile: string, otp: string }
 * On success, returns a stable farmerId tied to this mobile number so the
 * farmer's Agri Points / Crop Health Passport persist across devices.
 */
app.post('/api/auth/verify-otp', (req, res) => {
  const { mobile, otp } = req.body || {};
  const result = verifyOtp(mobile, otp);
  if (!result.ok) return res.status(400).json({ success: false, error: result.error });
  res.json({ success: true, farmerId: result.farmerId });
});

app.listen(PORT, () => {
  console.log(`\n🌿 Crop Doctor AI backend running: http://localhost:${PORT}\n`);
});
