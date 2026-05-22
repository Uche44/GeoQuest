import express from "express";
import db from "../db.js";

const router = express.Router();

/**
 * GET /api/users/:address
 * Returns a player's profile including XP, level, streak, and completed trails.
 */
router.get("/:address", (req, res) => {
  const address = req.params.address.toLowerCase();

  if (!/^0x[0-9a-fA-F]{40}$/.test(req.params.address)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  // Upsert — create a basic user record if it doesn't exist yet
  db.prepare(
    `INSERT OR IGNORE INTO users (wallet_address) VALUES (?)`
  ).run(address);

  const user = db.prepare(`SELECT * FROM users WHERE wallet_address = ?`).get(address);

  const completedTrails = db
    .prepare(
      `
      SELECT tc.trail_id, tc.completed_at, tc.tx_hash,
             t.title, t.category, t.reward_amount, t.reward_token
      FROM trail_completions tc
      JOIN trails t ON tc.trail_id = t.id
      WHERE tc.user_address = ?
      ORDER BY tc.completed_at DESC
    `
    )
    .all(address);

  res.json({ user: { ...user, completed_trails: completedTrails } });
});

/**
 * GET /api/users/leaderboard
 * Returns the top 50 players by XP.
 */
router.get("/leaderboard/top", (req, res) => {
  const { limit = 50 } = req.query;

  const leaders = db
    .prepare(
      `
      SELECT wallet_address, username, xp, level, streak_days,
             (SELECT COUNT(*) FROM trail_completions tc WHERE tc.user_address = u.wallet_address) as trails_completed
      FROM users u
      ORDER BY xp DESC
      LIMIT ?
    `
    )
    .all(Math.min(parseInt(limit), 100));

  res.json({ leaderboard: leaders });
});

export default router;
