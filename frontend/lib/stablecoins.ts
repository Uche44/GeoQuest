import { createPublicClient, http, fallback, erc20Abi, formatUnits } from "viem";
import { celo, celoSepolia } from "viem/chains";

// Stablecoin addresses for Celo Mainnet and Celo Sepolia Testnet
export const STABLES_CONFIG = {
  // Celo Sepolia Testnet (Chain ID: 11142220)
  sepolia: [
    { symbol: "USDm", address: "0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80" as `0x${string}`, decimals: 18, feeCurrency: "0xEF4d55D6dE8e8d73232827Cd1e9b2F2dBb45bC80" as `0x${string}` },
    { symbol: "USDC", address: "0x01C5C0122039549AD1493B8220cABEdD739BC44E" as `0x${string}`, decimals: 6, feeCurrency: "0x01C5C0122039549AD1493B8220cABEdD739BC44E" as `0x${string}` }, // Note: Sepolia often uses standard address or adapter
    { symbol: "USDT", address: "0xd077A400968890Eacc75cdc901F0356c943e4fDb" as `0x${string}`, decimals: 6, feeCurrency: "0xd077A400968890Eacc75cdc901F0356c943e4fDb" as `0x${string}` }
  ],
  // Celo Mainnet (Chain ID: 42220)
  mainnet: [
    { symbol: "USDm", address: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}`, decimals: 18, feeCurrency: "0x765DE816845861e75A25fCA122bb6898B8B1282a" as `0x${string}` },
    { symbol: "USDC", address: "0xcebA9300f2b948710d2653dD7B07f33A8B32118C" as `0x${string}`, decimals: 6, feeCurrency: "0x2F25deB3848C207fc8E0c34035B3Ba7fC157602B" as `0x${string}` }, // USDC adapter
    { symbol: "USDT", address: "0x48065fbBE25f71C9282ddf5e1cD6D6A887483D5e" as `0x${string}`, decimals: 6, feeCurrency: "0x0e2a3e05bc9a16f5292a6170456a710cb89c6f72" as `0x${string}` } // USDT adapter
  ]
};

export type StableToken = {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  feeCurrency: `0x${string}`;
};

export type TokenBalance = StableToken & {
  balance: bigint;
  human: string;
};

/**
 * Returns the list of stablecoins based on chain ID (default to Sepolia for development).
 */
export function getStablesForChain(chainId: number): StableToken[] {
  if (chainId === 42220) {
    return STABLES_CONFIG.mainnet;
  }
  return STABLES_CONFIG.sepolia;
}

/**
 * Returns the public client for a given chain.
 */
export function getPublicClient(chainId: number) {
  const isCeloMainnet = chainId === 42220;
  const chain = isCeloMainnet ? celo : celoSepolia;

  if (isCeloMainnet) {
    return createPublicClient({
      chain,
      transport: fallback([
        http("https://forno.celo.org"),
        http("https://rpc.ankr.com/celo"),
      ])
    });
  } else {
    // Celo Alfajores / Sepolia testnet
    return createPublicClient({
      chain,
      transport: fallback([
        http("https://alfajores-forno.celo-testnet.org"),
        http("https://celo-alfajores.drpc.org"),
      ])
    });
  }
}

/**
 * Fetches balances for all supported stablecoins.
 */
export async function getAllBalances(
  userAddress: `0x${string}`,
  chainId: number
): Promise<TokenBalance[]> {
  const stables = getStablesForChain(chainId);
  const client = getPublicClient(chainId);

  const balances = await Promise.all(
    stables.map(async (token) => {
      try {
        const raw = await client.readContract({
          address: token.address,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [userAddress],
        });
        return {
          ...token,
          balance: raw,
          human: formatUnits(raw, token.decimals),
        };
      } catch (err) {
        console.error(`Error reading balance for ${token.symbol}:`, err);
        return {
          ...token,
          balance: 0n,
          human: "0.00",
        };
      }
    })
  );

  return balances;
}

/**
 * Selects the user's preferred stablecoin (highest balance) or returns null if all balances are 0.
 */
export async function getPreferredStablecoin(
  userAddress: `0x${string}`,
  chainId: number
): Promise<TokenBalance | null> {
  const balances = await getAllBalances(userAddress, chainId);
  const withFunds = balances.filter((b) => b.balance > 0n);
  
  if (withFunds.length === 0) {
    return null;
  }
  
  // Sort by highest balance in terms of USD value (human readable amount)
  withFunds.sort((a, b) => Number(b.human) - Number(a.human));
  return withFunds[0];
}

/**
 * Redirects to the MiniPay Add Cash / Deposit deeplink.
 */
export function redirectToDeposit() {
  if (typeof window !== "undefined") {
    window.location.href = "https://link.minipay.xyz/add_cash?tokens=USDm,USDC,USDT";
  }
}
