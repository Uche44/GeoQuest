// ABIs and configurations for Celo smart contracts

// Default addresses (can be changed in the Dev Simulator drawer or env)
export const DEFAULT_TRAIL_CONTRACT = process.env.NEXT_PUBLIC_TRAIL_CONTRACT_ADDRESS || "0xB01E1B427d9579a0dE70C4EA661e7672D450e428"; // Live Celo Sepolia address
export const DEFAULT_STAMP_CONTRACT = process.env.NEXT_PUBLIC_STAMP_CONTRACT_ADDRESS || "0x92f8007d36c751D6707eef7f74E5Fb0c61669E9d";

export const GEOQUEST_TRAIL_ABI = [
  {
    "inputs": [
      { "internalType": "uint256", "name": "trailId", "type": "uint256" },
      { "internalType": "uint256", "name": "rewardAmount", "type": "uint256" },
      { "internalType": "bytes32", "name": "nonce", "type": "bytes32" },
      { "internalType": "bytes", "name": "signature", "type": "bytes" }
    ],
    "name": "claimReward",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "rewardToken", "type": "address" },
      { "internalType": "uint256", "name": "rewardPerPlayer", "type": "uint256" }
    ],
    "name": "createTrail",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "trailId", "type": "uint256" },
      { "internalType": "uint256", "name": "amount", "type": "uint256" }
    ],
    "name": "fundTrail",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "uint256", "name": "trailId", "type": "uint256" },
      { "internalType": "bool", "name": "active", "type": "bool" }
    ],
    "name": "setTrailActive",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address", "name": "", "type": "address" },
      { "internalType": "uint256", "name": "", "type": "uint256" }
    ],
    "name": "hasCompletedTrail",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "name": "trails",
    "outputs": [
      { "internalType": "uint256", "name": "id", "type": "uint256" },
      { "internalType": "address", "name": "merchant", "type": "address" },
      { "internalType": "address", "name": "rewardToken", "type": "address" },
      { "internalType": "uint256", "name": "rewardPerPlayer", "type": "uint256" },
      { "internalType": "uint256", "name": "totalBudget", "type": "uint256" },
      { "internalType": "uint256", "name": "remainingBudget", "type": "uint256" },
      { "internalType": "bool", "name": "active", "type": "bool" }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "bytes32", "name": "", "type": "bytes32" }],
    "name": "usedNonces",
    "outputs": [{ "internalType": "bool", "name": "", "type": "bool" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "nextTrailId",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "backendSigner",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "stampContract",
    "outputs": [{ "internalType": "address", "name": "", "type": "address" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;

export const GEOQUEST_STAMP_ABI = [
  {
    "inputs": [
      { "internalType": "address", "name": "account", "type": "address" },
      { "internalType": "uint256", "name": "id", "type": "uint256" }
    ],
    "name": "balanceOf",
    "outputs": [{ "internalType": "uint256", "name": "", "type": "uint256" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      { "internalType": "address[]", "name": "accounts", "type": "address[]" },
      { "internalType": "uint256[]", "name": "ids", "type": "uint256[]" }
    ],
    "name": "balanceOfBatch",
    "outputs": [{ "internalType": "uint256[]", "name": "", "type": "uint256[]" }],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{ "internalType": "uint256", "name": "id", "type": "uint256" }],
    "name": "uri",
    "outputs": [{ "internalType": "string", "name": "", "type": "string" }],
    "stateMutability": "view",
    "type": "function"
  }
] as const;
