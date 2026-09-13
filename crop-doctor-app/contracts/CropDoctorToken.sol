// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * CropDoctorToken — the on-chain "Crop Health Passport"
 * ------------------------------------------------------------------
 * Reference contract for the Web3 layer of Crop Doctor AI.
 *
 * NOT deployed for the hackathon demo (the backend simulates this with
 * a local hash-chained ledger in backend/lib/ledger.js so the whole
 * project runs with zero blockchain setup). This file shows judges the
 * production design: what the local ledger would become once it moves
 * on-chain.
 *
 * WHY blockchain here (not just a database): the value isn't the
 * points — it's a verifiable, tamper-proof timeline per crop case
 * (diagnosis → treatment → follow-up → recovery). That timeline is
 * what makes this useful beyond the app itself:
 *   - Crop insurance: proof a disease was reported and treated on time
 *   - Agri-credit/lending: verified farming diligence history
 *   - Subsidy schemes: genuine, unfalsifiable crop-distress record
 * A row in a normal database could be edited after the fact by whoever
 * runs the server — that would make it worthless as evidence. Two
 * responsibilities follow from this:
 *   1. ERC20-style KisanToken rewards for farmers who submit verified
 *      crop-health data (keeps engagement going through the journey).
 *   2. An immutable log of every diagnosis AND follow-up (image hash +
 *      summary + stage + caseId), so the full journey is auditable.
 *
 * To try it: paste into Remix (remix.ethereum.org), compile with
 * 0.8.20, and deploy to a testnet (e.g. Polygon Amoy) using an
 * injected wallet.
 * ------------------------------------------------------------------
 */
contract CropDoctorToken {
    string public constant name = "KisanToken";
    string public constant symbol = "KSN";
    uint8 public constant decimals = 0;

    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;

    struct DiagnosisRecord {
        address farmer;
        bytes32 imageHash;       // keccak256 of the submitted photo, not the photo itself
        string diagnosisSummary; // short text summary returned by the AI
        string stage;            // "diagnosis" | "followup" — position in the crop health journey
        bytes32 caseId;          // links a diagnosis to all of its follow-ups (one "passport entry" thread)
        uint256 timestamp;
    }

    DiagnosisRecord[] public records;

    event DiagnosisLogged(uint256 indexed recordId, address indexed farmer, bytes32 imageHash, string stage);
    event TokensRewarded(address indexed farmer, uint256 amount);

    modifier onlyOwner() {
        require(msg.sender == owner, "not authorised");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * Called by the backend (as a trusted relayer) once the AI has
     * produced a diagnosis or follow-up verdict for a farmer's
     * submission. Logs the record on-chain as one entry in the
     * farmer's Crop Health Passport, and mints KisanToken as a reward.
     */
    function logDiagnosis(
        address farmer,
        bytes32 imageHash,
        string calldata diagnosisSummary,
        string calldata stage,
        bytes32 caseId,
        uint256 rewardAmount
    ) external onlyOwner returns (uint256 recordId) {
        records.push(DiagnosisRecord(farmer, imageHash, diagnosisSummary, stage, caseId, block.timestamp));
        recordId = records.length - 1;
        emit DiagnosisLogged(recordId, farmer, imageHash, stage);

        balanceOf[farmer] += rewardAmount;
        totalSupply += rewardAmount;
        emit TokensRewarded(farmer, rewardAmount);
    }

    /** Returns every passport entry for a given case (diagnosis + all follow-ups), in order. */
    function getRecordsForCase(bytes32 caseId) external view returns (DiagnosisRecord[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < records.length; i++) {
            if (records[i].caseId == caseId) count++;
        }
        DiagnosisRecord[] memory result = new DiagnosisRecord[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < records.length; i++) {
            if (records[i].caseId == caseId) {
                result[j] = records[i];
                j++;
            }
        }
        return result;
    }

    function recordCount() external view returns (uint256) {
        return records.length;
    }

    function getRecord(uint256 recordId) external view returns (DiagnosisRecord memory) {
        return records[recordId];
    }
}
