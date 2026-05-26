import { ethers } from "ethers";
import fs from "fs";
import path from "path";

async function main() {
  const envPath = path.join(process.cwd(), ".env");

  // Check if .env already exists
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, "utf8");
    if (content.includes("PRIVATE_KEY=")) {
      // Find existing private key and print its address
      const lines = content.split("\n");
      const keyLine = lines.find(l => l.startsWith("PRIVATE_KEY="));
      const key = keyLine.split("=")[1].trim();
      try {
        const wallet = new ethers.Wallet(key);
        console.log("👉 Existing .env file found!");
        console.log(`👤 Deployer wallet address: ${wallet.address}`);
        console.log("🔗 Claim testnet tokens at: https://faucet.celo.org/celo-sepolia");
        return;
      } catch (e) {
        console.log("⚠️ Found PRIVATE_KEY in .env but it seems invalid.");
      }
    }
  }

  // Generate a new wallet
  const wallet = ethers.Wallet.createRandom();
  console.log("✨ Generated a new deployer wallet for you!");
  console.log(`👤 Address: ${wallet.address}`);
  console.log(`🔑 Private Key: ${wallet.privateKey}`);
  
  // Write to .env
  fs.writeFileSync(envPath, `PRIVATE_KEY=${wallet.privateKey}\n`);
  console.log("\n✅ Saved PRIVATE_KEY to your root `.env` file successfully.");
  console.log("\n🚀 Next Steps:");
  console.log("1. Copy the address above: ", wallet.address);
  console.log("2. Open the faucet: https://faucet.celo.org/celo-sepolia");
  console.log("3. Paste the address and request testnet CELO.");
  console.log("4. Once funded, reply to let me know and we will run the deployment!");
}

main().catch(console.error);
