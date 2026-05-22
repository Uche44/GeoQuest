import express from "express";
import { ethers } from "ethers";
import db from "../db.js";

const router = express.Router();

/**
 * POST /api/claim
 * Called after a player has completed all stops in a trail.
 * Validates completion state, then generates a backend-signed payload
 * that the frontend can submit to the GeoQuestTrail smart contract.
 *
 * Body:
 *   user_address — player's wallet address
 *   trail_id     — the trail being claimed
 *
 * NOTE: In Stage 3, this will use the real deployed contract's trail ID.
 * For now, it uses a mock on-chain trail ID and stub signer key from .env.
 */
router.post("/", async (req, res) => {
  const { user_address, trail_id } = req.body;

  if (!user_address || !trail_id) {
    return res.status(400).json({ error: "user_address and trail_id are required" });
  }

  if (!/^0x[0-9a-fA-F]{40}$/.test(user_address)) {
    return res.status(400).json({ error: "Invalid wallet address format" });
  }

  const normalizedAddress = user_address.toLowerCase();
  const trailIdInt = parseInt(trail_id);

  // Fetch trail from DB
  const trail = db.prepare(`SELECT * FROM trails WHERE id = ?`).get(trailIdInt);
  if (!trail) {
    return res.status(404).json({ error: "Trail not found" });
  }

  if (!trail.active) {
    return res.status(400).json({ error: "Trail is not active" });
  }

  if (trail.remaining_budget <= 0) {
    return res.status(400).json({ error: "Trail reward pool is empty" });
  }

  // Confirm the player hasn't already claimed
  const alreadyClaimed = db
    .prepare(`SELECT id FROM trail_completions WHERE user_address = ? AND trail_id = ?`)
    .get(normalizedAddress, trailIdInt);

  if (alreadyClaimed) {
    return res.status(409).json({ error: "Reward already claimed for this trail" });
  }

  // Verify all stops are completed
  const totalStops = db
    .prepare(`SELECT COUNT(*) as c FROM stops WHERE trail_id = ?`)
    .get(trailIdInt).c;

  const completedStops = db
    .prepare(
      `SELECT COUNT(*) as c FROM stop_completions WHERE user_address = ? AND trail_id = ?`
    )
    .get(normalizedAddress, trailIdInt).c;

  if (completedStops < totalStops) {
    return res.status(400).json({
      error: "Not all stops completed",
      completed: completedStops,
      required: totalStops,
    });
  }

  // Generate a unique nonce
  const nonce = ethers.hexlify(ethers.randomBytes(32));

  // Convert reward amount to 18-decimal wei (assuming USDm / ERC-20 with 18 decimals)
  const rewardAmountWei = ethers.parseUnits(trail.reward_amount.toString(), 18).toString();

  // The on-chain trail ID. In Stage 3, this maps to the deployed smart contract's trail ID.
  // For now we use the DB trail ID as a stand-in.
  const onChainTrailId = trail.on_chain_trail_id ?? trailIdInt;

  // Sign the claim payload with the backend signer key
  let signature;
  try {
    const signerKey = process.env.BACKEND_SIGNER_PRIVATE_KEY;
    if (!signerKey) {
      throw new Error("BACKEND_SIGNER_PRIVATE_KEY not set in environment");
    }
    const signer = new ethers.Wallet(signerKey);

    // Must match exactly what GeoQuestTrail.sol's claimReward() verifies:
    // keccak256(abi.encodePacked(player, trailId, rewardAmount, nonce))
    const messageHash = ethers.solidityPackedKeccak256(
      ["address", "uint256", "uint256", "bytes32"],
      [user_address, onChainTrailId, rewardAmountWei, nonce]
    );
    signature = await signer.signMessage(ethers.getBytes(messageHash));
  } catch (err) {
    console.error("Signing error:", err.message);
    return res.status(500).json({ error: "Failed to generate claim signature" });
  }

  // Record trail completion in DB
  db.prepare(
    `INSERT INTO trail_completions (user_address, trail_id) VALUES (?, ?)`
  ).run(normalizedAddress, trailIdInt);

  // Deduct reward from remaining budget
  db.prepare(
    `UPDATE trails SET remaining_budget = remaining_budget - ? WHERE id = ?`
  ).run(trail.reward_amount, trailIdInt);

  res.json({
    success: true,
    claim_payload: {
      trail_id: onChainTrailId,
      reward_amount_wei: rewardAmountWei,
      nonce,
      signature,
    },
    message: "Submit claim_payload to the GeoQuestTrail smart contract to receive your reward.",
  });
});

export default router;
