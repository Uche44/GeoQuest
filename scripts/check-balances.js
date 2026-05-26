import hre from "hardhat";

async function main() {
  const deployerAddress = "0xa3642d87791e168E1E466DD42C49D44E6884Bf7C";
  const USDmAddress = "0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80";

  console.log(`Checking stablecoin balances for deployer: ${deployerAddress}...`);

  const [deployer] = await hre.ethers.getSigners();

  // Get native CELO balance
  const celoBalance = await hre.ethers.provider.getBalance(deployerAddress);
  console.log(`CELO Balance: ${hre.ethers.formatEther(celoBalance)} CELO`);

  // Get USDm balance
  const erc20Abi = [
    "function balanceOf(address account) external view returns (uint256)",
    "function decimals() external view returns (uint8)"
  ];
  
  const usdmContract = new hre.ethers.Contract(USDmAddress, erc20Abi, deployer);
  try {
    const decimals = await usdmContract.decimals();
    const usdmBalance = await usdmContract.balanceOf(deployerAddress);
    console.log(`USDm Balance: ${hre.ethers.formatUnits(usdmBalance, decimals)} USDm`);
  } catch (err) {
    console.error("Error fetching USDm balance:", err.message);
  }
}

main().catch(console.error);
