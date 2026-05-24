import { useEffect, useState, useCallback, useRef } from "react";
import { getAllBalances, TokenBalance } from "../lib/stablecoins";

// Extend the window interface for MiniPay
declare global {
  interface Window {
    ethereum?: any;
  }
}

/**
 * Wait for window.ethereum to be injected, with a timeout.
 * MiniPay injects the provider asynchronously after the WebView loads.
 */
function waitForEthereum(timeoutMs = 3000): Promise<any | null> {
  return new Promise((resolve) => {
    if (typeof window === "undefined") return resolve(null);
    if (window.ethereum) return resolve(window.ethereum);

    let elapsed = 0;
    const interval = 100;
    const timer = setInterval(() => {
      elapsed += interval;
      if (window.ethereum) {
        clearInterval(timer);
        resolve(window.ethereum);
      } else if (elapsed >= timeoutMs) {
        clearInterval(timer);
        resolve(null); // timed out — not in a wallet browser
      }
    }, interval);
  });
}

export function useMiniPay() {
  const [address, setAddress] = useState<`0x${string}` | null>(null);
  const [chainId, setChainId] = useState<number>(44787); // Default Celo Alfajores
  const [balances, setBalances] = useState<TokenBalance[]>([]);
  const [isMiniPay, setIsMiniPay] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const initializedRef = useRef(false);

  const refreshBalances = useCallback(
    async (currentAddress = address, currentChainId = chainId) => {
      if (!currentAddress) return;
      try {
        const tokenBalances = await getAllBalances(currentAddress, currentChainId);
        setBalances(tokenBalances);
      } catch (err: any) {
        console.warn("Balance fetch failed (non-critical):", err?.message);
      }
    },
    [address, chainId]
  );

  const init = useCallback(async () => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    setError(null);
    setIsLoading(true);

    // Wait for MiniPay to inject window.ethereum (up to 3 seconds)
    const provider = await waitForEthereum(3000);

    if (!provider) {
      console.log("No Ethereum provider found — running in browser without wallet.");
      setIsLoading(false);
      return;
    }

    try {
      // Detect MiniPay specifically
      const mp = provider.isMiniPay === true;
      setIsMiniPay(mp);
      console.log(`[GeoQuest] Wallet detected. isMiniPay=${mp}`);

      // Get chain
      let walletChainId = 44787;
      try {
        const hexChainId = await provider.request({ method: "eth_chainId" });
        walletChainId = parseInt(hexChainId, 16);
        console.log(`[GeoQuest] Chain ID: ${walletChainId}`);
      } catch {
        console.warn("Could not get chainId, defaulting to Alfajores (44787)");
      }
      setChainId(walletChainId);

      // Request accounts — in MiniPay this resolves INSTANTLY with no popup.
      // In MetaMask/desktop browsers this triggers the approval popup.
      const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
      console.log(`[GeoQuest] Accounts:`, accounts);

      if (accounts && accounts.length > 0) {
        const activeAddr = accounts[0] as `0x${string}`;
        setAddress(activeAddr);
        // Fetch balances in background — don't block rendering
        refreshBalances(activeAddr, walletChainId).catch(console.warn);
      }
    } catch (err: any) {
      console.error("[GeoQuest] Wallet init error:", err);
      setError(err?.message || "Failed to connect wallet");
    } finally {
      setIsLoading(false);
    }
  }, [refreshBalances]);

  // Manual connect — only used outside MiniPay (e.g. desktop MetaMask)
  const connectWalletOutsideMiniPay = useCallback(async () => {
    const provider = window.ethereum;
    if (!provider) {
      alert("No Ethereum wallet detected. Please use MiniPay or install MetaMask.");
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const accounts: string[] = await provider.request({ method: "eth_requestAccounts" });
      let walletChainId = 44787;
      try {
        const hex = await provider.request({ method: "eth_chainId" });
        walletChainId = parseInt(hex, 16);
      } catch {}
      setChainId(walletChainId);
      if (accounts?.length > 0) {
        const activeAddr = accounts[0] as `0x${string}`;
        setAddress(activeAddr);
        await refreshBalances(activeAddr, walletChainId);
      }
    } catch (err: any) {
      setError(err?.message || "User rejected connection");
    } finally {
      setIsLoading(false);
    }
  }, [refreshBalances]);

  useEffect(() => {
    init();
  }, [init]);

  // Subscribe to wallet events once provider is available
  useEffect(() => {
    const provider = window.ethereum;
    if (!provider) return;

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
    };

    provider.on?.("accountsChanged", handleAccountsChanged);
    provider.on?.("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [chainId, refreshBalances]);

  return {
    address,
    chainId,
    balances,
    isMiniPay,
    isLoading,
    error,
    refreshBalances,
    connectWalletOutsideMiniPay,
  };
}
