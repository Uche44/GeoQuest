import hre from "hardhat";

async function main() {
  console.log("🚀 Starting GeoQuest Smart Contracts Deployment...");

  // Get deployer account info
  const [deployer] = await hre.ethers.getSigners();
  console.log(`👤 Deployer wallet address: ${deployer.address}`);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`💰 Deployer wallet balance: ${hre.ethers.formatEther(balance)} CELO`);

  // 1. Deploy GeoQuestStamp Contract
  console.log("\n📦 Deploying GeoQuestStamp NFT Contract...");
  const baseUri = "https://geoquest.xyz/api/stamps/{id}.json";
  
  const GeoQuestStamp = await hre.ethers.getContractFactory("GeoQuestStamp");
  const stamp = await GeoQuestStamp.deploy(baseUri);
  await stamp.waitForDeployment();
  const stampAddress = await stamp.getAddress();
  console.log(`✅ GeoQuestStamp deployed to: ${stampAddress}`);

  // 2. Deploy GeoQuestTrail Contract
  console.log("\n📦 Deploying GeoQuestTrail Contract...");
  
  // Use the standard backend signer from .env or stub if not defined
  // Address matching stub key (0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80) is 0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
  const backendSignerAddress = process.env.BACKEND_SIGNER_ADDRESS || "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
  console.log(`🔑 Configuring Backend Signer address: ${backendSignerAddress}`);

  const GeoQuestTrail = await hre.ethers.getContractFactory("GeoQuestTrail");
  const trail = await GeoQuestTrail.deploy(backendSignerAddress, stampAddress);
  await trail.waitForDeployment();
  const trailAddress = await trail.getAddress();
  console.log(`✅ GeoQuestTrail deployed to: ${trailAddress}`);

  // 3. Configure Stamp Minter Permission
  console.log("\n🔧 Whitelisting GeoQuestTrail as minter in GeoQuestStamp...");
  const minterTx = await stamp.setMinter(trailAddress, true);
  await minterTx.wait();
  console.log("✅ Whitelisted GeoQuestTrail as minter successfully.");

  // 4. Whitelist Stablecoin Tokens on Testnet (Celo Sepolia / Alfajores)
  console.log("\n🔧 Whitelisting stablecoins on GeoQuestTrail...");
  
  // Celo Sepolia Stablecoin addresses
  const stablecoins = [
    { name: "USDm", address: "0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80" },
    { name: "USDC", address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E" },
    { name: "USDT", address: "0xd077A400968890Eacc75cdc901F0356c943e4fDb" }
  ];

  for (const stable of stablecoins) {
    console.log(`   Whitelisting ${stable.name} at ${stable.address}...`);
    const tx = await trail.setTokenWhitelist(stable.address, true);
    await tx.wait();
    console.log(`   ✓ Whitelisted ${stable.name}`);
  }

  console.log("\n🎉 GeoQuest Smart Contracts Deployed & Configured Successfully!");
  console.log("-----------------------------------------------------------------");
  console.log(`GeoQuestStamp: ${stampAddress}`);
  console.log(`GeoQuestTrail: ${trailAddress}`);
  console.log("-----------------------------------------------------------------");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:", error);
    process.exit(1);
  });
