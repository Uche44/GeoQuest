import "dotenv/config";
import express from "express";
import cors from "cors";

import trailRoutes from "./routes/trails.js";
import claimRoutes from "./routes/claim.js";
import userRoutes from "./routes/users.js";
import merchantRoutes from "./routes/merchants.js";

const app = express();
const PORT = process.env.PORT || 3001;

// ─── Middleware ─────────────────────────────────────────────────────────────
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    // Allow localhost dev origins
    if (origin.includes("localhost") || origin.includes("127.0.0.1")) return callback(null, true);
    // Allow Cloudflare tunnels
    if (origin.endsWith(".trycloudflare.com")) return callback(null, true);
    // Allow ngrok tunnels
    if (origin.endsWith(".ngrok-free.app") || origin.endsWith(".ngrok.io")) return callback(null, true);
    return callback(null, true); // Allow all for hackathon / dev purposes
  },
  credentials: true,
}));
app.use(express.json());

// ─── Cloudflare Tunnel Interstitial Bypass ───────────────────────────────────
// Cloudflare shows a browser check page on first visit — this header skips it.
app.use((_req, res, next) => {
  res.setHeader("cf-cache-status", "BYPASS");
  next();
});

// ─── Request Logger ─────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.originalUrl}`);
  next();
});

// ─── Routes ─────────────────────────────────────────────────────────────────
app.use("/api/trails", trailRoutes);
app.use("/api/claim", claimRoutes);
app.use("/api/users", userRoutes);
app.use("/api/merchants", merchantRoutes);

// ─── Health Check ────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─── 404 Handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ─── Global Error Handler ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
});

// ─── Start ───────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🌍 GeoQuest Backend running at http://localhost:${PORT}`);
  console.log(`📡 Health check: http://localhost:${PORT}/api/health\n`);
});
