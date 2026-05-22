import Database from "better-sqlite3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));

const DB_PATH = join(__dirname, "geoquest.db");
const SCHEMA_PATH = join(__dirname, "schema.sql");

// Initialize DB and run schema on startup
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// Run schema file to create tables if they don't exist
const schema = readFileSync(SCHEMA_PATH, "utf-8");
db.exec(schema);

export default db;
