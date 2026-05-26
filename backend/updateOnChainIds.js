import "dotenv/config";
import { ethers } from "ethers";
import db from "./db.js";
import fs from "fs";
import path from "path";

// Celo Sepolia Configs
const RPC_URL = "https://forno-celo-sepolia.celo-testnet.org";
const TRAIL_CONTRACT_ADDRESS = "0xB01E1B427d9579a0dE70C4EA661e7672D450e428";
const USDm_ADDRESS = "0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80";

// ABI for GeoQuestTrail contract
const TRAIL_ABI = [
  "function createTrail(address rewardToken, uint256 rewardPerPlayer) external returns (uint256)",
  "function setTrailActive(uint256 trailId, bool active) external",
  "function fundTrail(uint256 trailId, uint256 amount) external",
  "function trails(uint256) external view returns (uint256 id, address merchant, address rewardToken, uint256 rewardPerPlayer, uint256 totalBudget, uint256 remainingBudget, bool active)",
  "event TrailCreated(uint256 indexed trailId, address indexed merchant, address indexed rewardToken, uint256 rewardPerPlayer)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)"
];

async function main() {
  // Load PRIVATE_KEY from root .env or backend .env
  let privateKey = process.env.PRIVATE_KEY;
  if (!privateKey) {
    // Try reading root .env manually
    try {
      const rootEnvPath = path.join(process.cwd(), "..", ".env");
      if (fs.existsSync(rootEnvPath)) {
        const rootEnv = fs.readFileSync(rootEnvPath, "utf8");
        const match = rootEnv.match(/PRIVATE_KEY=(.+)/);
        if (match) privateKey = match[1].trim();
      }
    } catch (e) {}
  }

  if (!privateKey) {
    // Try reading root .env directly (if running from root CWD)
    try {
      const rootEnvPath = path.join(process.cwd(), ".env");
      if (fs.existsSync(rootEnvPath)) {
        const rootEnv = fs.readFileSync(rootEnvPath, "utf8");
        const match = rootEnv.match(/PRIVATE_KEY=(.+)/);
        if (match) privateKey = match[1].trim();
      }
    } catch (e) {}
  }

  if (!privateKey) {
    console.error("❌ Error: PRIVATE_KEY not found in environment or .env files.");
    process.exit(1);
  }

  console.log("Connecting to Celo Sepolia network...");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(privateKey, provider);
  console.log(`👤 Executor wallet address: ${wallet.address}`);

  const celoBalance = await provider.getBalance(wallet.address);
  console.log(`💰 CELO balance: ${ethers.formatEther(celoBalance)} CELO`);

  const usdmContract = new ethers.Contract(USDm_ADDRESS, ERC20_ABI, wallet);
  const usdmBalance = await usdmContract.balanceOf(wallet.address);
  console.log(`💰 USDm balance: ${ethers.formatUnits(usdmBalance, 18)} USDm`);

  const trailContract = new ethers.Contract(TRAIL_CONTRACT_ADDRESS, TRAIL_ABI, wallet);

  // Fetch inactive or unlinked trails from DB
  const dbTrails = db.prepare(`SELECT * FROM trails`).all();
  console.log(`\nFound ${dbTrails.length} trails in database.`);

  for (const trail of dbTrails) {
    console.log(`\nProcessing Trail #${trail.id}: "${trail.title}"`);

    let onChainId = trail.on_chain_trail_id;

    if (onChainId !== null && onChainId !== undefined) {
      console.log(`   Already linked to on-chain ID: ${onChainId}`);
    } else {
      console.log("   Registering trail on-chain...");
      const rewardWei = ethers.parseUnits(trail.reward_amount.toString(), 18);
      
      try {
        const tx = await trailContract.createTrail(USDm_ADDRESS, rewardWei);
        console.log(`   Transaction sent. Hash: ${tx.hash}`);
        console.log("   Waiting for confirmation...");
        const receipt = await tx.wait();
        
        // Find TrailCreated event
        let eventFound = false;
        for (const log of receipt.logs) {
          try {
            const parsedLog = trailContract.interface.parseLog(log);
            if (parsedLog && parsedLog.name === "TrailCreated") {
              onChainId = Number(parsedLog.args.trailId);
              eventFound = true;
              break;
            }
          } catch (e) {}
        }

        if (eventFound) {
          console.log(`   ✅ Registered successfully! On-Chain ID: ${onChainId}`);
          db.prepare(`UPDATE trails SET on_chain_trail_id = ? WHERE id = ?`).run(onChainId, trail.id);
          console.log(`   Database updated with on_chain_trail_id = ${onChainId}`);
        } else {
          throw new Error("TrailCreated event not found in receipt logs.");
        }
      } catch (err) {
        console.error(`   ❌ Registration failed:`, err.message);
        continue;
      }
    }

    // Check if active on-chain
    try {
      const onChainTrail = await trailContract.trails(onChainId);
      const isActiveOnChain = onChainTrail.active;
      console.log(`   On-chain active status: ${isActiveOnChain}`);

      if (!isActiveOnChain) {
        console.log("   Activating trail on-chain...");
        const tx = await trailContract.setTrailActive(onChainId, true);
        console.log(`   Transaction sent. Hash: ${tx.hash}`);
        await tx.wait();
        console.log("   ✅ Activated on-chain successfully!");
      }
    } catch (err) {
      console.error(`   ❌ Activation check/update failed:`, err.message);
    }

    // Try to fund the trail if wallet has USDm balance
    const remainingBudgetWei = ethers.parseUnits(trail.remaining_budget.toString(), 18);
    if (usdmBalance > 0n) {
      try {
        const onChainTrail = await trailContract.trails(onChainId);
        const onChainRemaining = onChainTrail.remainingBudget;
        console.log(`   On-chain remaining budget: ${ethers.formatUnits(onChainRemaining, 18)} USDm`);

        if (onChainRemaining === 0n) {
          const fundAmount = remainingBudgetWei < usdmBalance ? remainingBudgetWei : usdmBalance;
          if (fundAmount > 0n) {
            console.log(`   Funding trail with ${ethers.formatUnits(fundAmount, 18)} USDm...`);
            
            console.log("   Approving token transfer...");
            const approveTx = await usdmContract.approve(TRAIL_CONTRACT_ADDRESS, fundAmount);
            await approveTx.wait();
            
            console.log("   Depositing funds into escrow...");
            const fundTx = await trailContract.fundTrail(onChainId, fundAmount);
            await fundTx.wait();
            
            console.log("   ✅ Funded successfully!");
            // Update SQLite DB budget values just in case
            db.prepare(`UPDATE trails SET remaining_budget = remaining_budget + ? WHERE id = ?`)
              .run(Number(ethers.formatUnits(fundAmount, 18)), trail.id);
          }
        }
      } catch (err) {
        console.error("   ❌ Funding failed:", err.message);
      }
    } else {
      console.log("   ⚠️ Skipping funding: deployer wallet has 0.0 USDm balance.");
    }
  }

  console.log("\n🎉 Database trails successfully linked & activated on-chain!");
}

main().catch(console.error);
