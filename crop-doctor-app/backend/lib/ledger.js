/**
 * ledger.js — the "Crop Health Passport"
 * ------------------------------------------------------------------
 * A lightweight, dependency-free "hash-chained" ledger that stands in
 * for an on-chain data layer during the hackathon demo.
 *
 * WHY this needs to be tamper-evident (not just a database row):
 * this ledger becomes a farmer's verifiable crop-health history —
 * every diagnosis, treatment, and follow-up outcome, in one
 * append-only record. That history is the actual asset for:
 *   - crop insurance claims (proof a disease was reported early)
 *   - agri-loan / credit assessment (verified farming diligence)
 *   - subsidy eligibility (proof of genuine crop distress)
 * None of that works if the record can be quietly edited after the
 * fact — hence the hash chain: tampering with any old entry breaks
 * every hash after it, exactly like a real blockchain's guarantee.
 *
 * Each block/"passport entry" contains:
 *   - farmerId (anonymised phone hash, never the raw number)
 *   - stage: 'diagnosis' | 'followup' — where this sits in the journey
 *   - caseId — links diagnosis + all its follow-ups together
 *   - a hash of the submitted image (proof a photo was really sent,
 *     without storing the photo itself in the chain)
 *   - the AI diagnosis/verdict summary
 *   - a timestamp
 *   - the hash of the PREVIOUS block
 *
 * For the hackathon this is stored in a local JSON file
 * (backend/data/ledger.json) so the whole thing runs with zero setup.
 *
 * TO GO FULLY ON-CHAIN LATER:
 *   Swap `appendBlock()`'s file-write for a call to the CropDoctorToken
 *   smart contract in /contracts/CropDoctorToken.sol (e.g. via ethers.js
 *   on Polygon Amoy testnet). Each passport entry maps directly onto a
 *   `logDiagnosis(bytes32 imageHash, string summary, string stage)` call.
 * ------------------------------------------------------------------
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const LEDGER_PATH = path.join(__dirname, '..', 'data', 'ledger.json');
const TOKENS_PER_SUBMISSION = 2;

function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function readLedger() {
  if (!fs.existsSync(LEDGER_PATH)) {
    return { blocks: [], balances: {} };
  }
  try {
    return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
  } catch (e) {
    // Corrupt/empty file — start fresh rather than crash the demo.
    return { blocks: [], balances: {} };
  }
}

function writeLedger(ledger) {
  fs.mkdirSync(path.dirname(LEDGER_PATH), { recursive: true });
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2));
}

/** Turn a raw farmer identifier (phone/session id) into an anonymised id. */
function anonymiseFarmerId(rawId) {
  return 'farmer_' + sha256(String(rawId || 'anonymous')).slice(0, 12);
}

/**
 * Append a new passport entry (diagnosis OR follow-up) to the chain and
 * reward Agri Points. Returns the new block plus the farmer's updated balance.
 */
function appendBlock({ rawFarmerId, imageBase64, diagnosisSummary, stage = 'diagnosis', caseId = null }) {
  const ledger = readLedger();
  const farmerId = anonymiseFarmerId(rawFarmerId);

  const prevHash = ledger.blocks.length
    ? ledger.blocks[ledger.blocks.length - 1].blockHash
    : '0'.repeat(64); // genesis block points to all-zero hash

  const imageHash = imageBase64 ? sha256(imageBase64).slice(0, 32) : null;
  const timestamp = new Date().toISOString();

  const blockBody = {
    index: ledger.blocks.length,
    farmerId,
    stage,
    caseId,
    imageHash,
    diagnosisSummary: (diagnosisSummary || '').slice(0, 200),
    timestamp,
    prevHash,
  };

  const blockHash = sha256(JSON.stringify(blockBody));
  const block = { ...blockBody, blockHash };

  ledger.blocks.push(block);
  ledger.balances[farmerId] = (ledger.balances[farmerId] || 0) + TOKENS_PER_SUBMISSION;

  writeLedger(ledger);

  return {
    block,
    tokensAwarded: TOKENS_PER_SUBMISSION,
    totalTokens: ledger.balances[farmerId],
    chainLength: ledger.blocks.length,
  };
}

/** Verify the whole chain hasn't been tampered with (demo integrity check). */
function verifyChain() {
  const ledger = readLedger();
  let prevHash = '0'.repeat(64);
  for (const block of ledger.blocks) {
    const { blockHash, ...body } = block;
    if (body.prevHash !== prevHash) return false;
    const recomputed = sha256(JSON.stringify(body));
    if (recomputed !== blockHash) return false;
    prevHash = blockHash;
  }
  return true;
}

/** Full passport history for one farmer — diagnosis + every follow-up, in order. */
function getPassportForFarmer(rawFarmerId) {
  const farmerId = anonymiseFarmerId(rawFarmerId);
  const ledger = readLedger();
  return ledger.blocks.filter((b) => b.farmerId === farmerId);
}

function getLedgerSummary() {
  const ledger = readLedger();
  return {
    chainLength: ledger.blocks.length,
    balances: ledger.balances,
    valid: verifyChain(),
    recentBlocks: ledger.blocks.slice(-10).reverse(),
  };
}

module.exports = { appendBlock, getLedgerSummary, anonymiseFarmerId, verifyChain, getPassportForFarmer };
