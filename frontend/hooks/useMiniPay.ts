import { useEffect, useState, useCallback } from "react";
import { createWalletClient, custom } from "viem";
import { celoSepolia } from "viem/chains";
import { getAllBalances, TokenBalance } from "../lib/stablecoins";

// Extend the window interface for MiniPay
declare global {
  interface Window {
    ethereum?: any;
  }
}

export function useMiniPay() {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number>(11142220); // Default to Celo Sepolia
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshBalances = useCallback(async (currentAddress = address, currentChainId = chainId) => {
    if (!currentAddress) return;
    try {
      const tokenBalances = await getAllBalances(currentAddress, currentChainId);
      setBalances(tokenBalances);
    } catch (err: any) {
      console.error("Error refreshing balances:", err);
      setError(err?.message || "Failed to load stablecoin balances");
    }
  }, [address, chainId]);

  const init = useCallback(async () => {
    setError(null);
    if (typeof window === "undefined" || !window.ethereum) {
      setIsLoading(false);
      return;
    }

    try {
      const mp = window.ethereum.isMiniPay === true;
      setIsMiniPay(mp);

      // We auto-connect in MiniPay. Outside MiniPay, we can let user request connection
      // but we still try to get existing connected accounts.
      const client = createWalletClient({
        transport: custom(window.ethereum),
      });

      // Request accounts. In MiniPay, this resolves instantly without zero-click.
      const accounts = await client.getAddresses();
      
      let walletChainId = 11142220; // Default Celo Sepolia
      try {
        walletChainId = await window.ethereum.request({ method: "eth_chainId" }).then((hex: string) => parseInt(hex, 16));
      } catch (chainErr) {
        console.warn("Could not retrieve chainId, defaulting to Celo Sepolia", chainErr);
      }

      setChainId(walletChainId);

      if (accounts && accounts.length > 0) {
        const activeAddr = accounts[0];
        setAddress(activeAddr);
        await refreshBalances(activeAddr, walletChainId);
      } else if (mp) {
        // If in MiniPay, try eth_requestAccounts to auto-connect
        const reqAccounts = await window.ethereum.request({ method: "eth_requestAccounts" });
        if (reqAccounts && reqAccounts.length > 0) {
          const activeAddr = reqAccounts[0];
          setAddress(activeAddr);
          await refreshBalances(activeAddr, walletChainId);
        }
      }
    } catch (err: any) {
      console.error("MiniPay wallet initialization error:", err);
      setError(err?.message || "Failed to connect wallet");
    } finally {
      setIsLoading(false);
    }
  }, [refreshBalances]);

  const connectWalletOutsideMiniPay = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      alert("No Ethereum provider detected. Please install a compatible wallet or use Opera MiniPay.");
      return;
    }
    setIsLoading(true);
    try {
      const reqAccounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      let walletChainId = 11142220;
      try {
        walletChainId = await window.ethereum.request({ method: "eth_chainId" }).then((hex: string) => parseInt(hex, 16));
      } catch (e) {}
      
      setChainId(walletChainId);
      if (reqAccounts && reqAccounts.length > 0) {
        const activeAddr = reqAccounts[0];
        setAddress(activeAddr);
        await refreshBalances(activeAddr, walletChainId);
      }
    } catch (err: any) {
      console.error("Manual connect error:", err);
      setError(err?.message || "User rejected connection");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    init();

    // Listen for account or chain changes
    if (typeof window !== "undefined" && window.ethereum) {
      const handleAccountsChanged = (accounts: string[]) => {
        if (accounts.length > 0) {
          const newAddr = accounts[0] as `0x${string}`;
          setAddress(newAddr);
          refreshBalances(newAddr, chainId);
        } else {
          setAddress(null);
          setBalances([]);
        }
      };

      const handleChainChanged = (hexChainId: string) => {
        const newChainId = parseInt(hexChainId, 16);
        setChainId(newChainId);
        if (address) {
          refreshBalances(address, newChainId);
        }
      };

      window.ethereum.on("accountsChanged", handleAccountsChanged);
      window.ethereum.on("chainChanged", handleChainChanged);

      return () => {
        if (window.ethereum.removeListener) {
          window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
          window.ethereum.removeListener("chainChanged", handleChainChanged);
        }
      };
    }
  }, [init, refreshBalances, chainId, address]);

  return {
    address,
    chainId,
    balances,
    isMiniPay,
    isLoading,
    error,
    refreshBalances,
    connectWalletOutsideMiniPay
  };
}
