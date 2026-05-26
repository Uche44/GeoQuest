"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import dynamic from "next/dynamic";
import { 
  Compass, 
  MapPin, 
  Trophy, 
  User, 
  CheckCircle, 
  Clock, 
  Zap, 
  Coins, 
  AlertCircle,
  HelpCircle,
  QrCode,
  Lock,
  ChevronRight,
  Sparkles,
  Map as MapIcon,
  Sliders,
  X,
  Share2,
  ExternalLink,
  ChevronDown
} from "lucide-react";
import { createWalletClient, custom, parseUnits } from "viem";
import { celo, celoSepolia } from "viem/chains";
import { useMiniPay } from "../hooks/useMiniPay";
import { getPreferredStablecoin, redirectToDeposit, getPublicClient } from "../lib/stablecoins";
import { DEFAULT_TRAIL_CONTRACT, GEOQUEST_TRAIL_ABI } from "../lib/contracts";
import RadarMap from "../components/RadarMap";

const LeafletMap = dynamic(() => import("../components/LeafletMap"), { ssr: false });

// Default coordinates for Lagos Island
const LAGOS_COORDS = { lat: 6.4314, lng: 3.4144 };

type Stop = {
  id: number;
  trail_id: number;
  title: string;
  description: string;
  latitude: number;
  longitude: number;
  order_index: number;
  challenge_type: "qr" | "trivia" | "code";
  geofence_radius_m: number;
  xp_reward: number;
  // trivia options if applicable
  options?: string[];
  question?: string;
  challenge_payload?: string;
};

type Trail = {
  id: number;
  merchant_id: number;
  title: string;
  description: string;
  category: string;
  difficulty: "easy" | "medium" | "hard";
  reward_amount: number;
  reward_token: string;
  estimated_duration_mins: number;
  remaining_budget: number;
  merchant_name: string;
  merchant_lat: number;
  merchant_lng: number;
  merchant_logo: string;
  stop_count: number;
  distance_m: number;
  stops?: Stop[];
};

type LeaderboardUser = {
  wallet_address: string;
  username: string;
  xp: number;
  level: number;
  streak_days: number;
  trails_completed: number;
};

type UserProfile = {
  wallet_address: string;
  username: string;
  xp: number;
  level: number;
  streak_days: number;
  completed_trails: Array<{
    trail_id: number;
    completed_at: string;
    tx_hash: string;
    title: string;
    category: string;
    reward_amount: number;
    reward_token: string;
  }>;
};

export default function Home() {
  // Wallet Hook
  const { 
    address, 
    chainId, 
    balances, 
    isMiniPay, 
    isLoading: walletLoading, 
    error: walletError,
    refreshBalances,
    connectWalletOutsideMiniPay
  } = useMiniPay();

  // App Navigation & UI State
  const [activeTab, setActiveTab] = useState<"explore" | "quest" | "leaderboard" | "profile" | "merchant">("explore");
  const [apiBaseUrl, setApiBaseUrl] = useState(process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001");
  const [trailContractAddress, setTrailContractAddress] = useState(DEFAULT_TRAIL_CONTRACT);
  
  // Player GPS / Simulated Location
  const [useRealGps, setUseRealGps] = useState(true);
  const [playerLat, setPlayerLat] = useState(LAGOS_COORDS.lat);
  const [playerLng, setPlayerLng] = useState(LAGOS_COORDS.lng);

  // Active Quest State
  const [activeTrail, setActiveTrail] = useState<Trail | null>(null);
  const [activeStop, setActiveStop] = useState<Stop | null>(null);
  const [completedStopIds, setCompletedStopIds] = useState<number[]>([]);
  const [questClaimed, setQuestClaimed] = useState(false);
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimTxHash, setClaimTxHash] = useState<string | null>(null);

  // Challenge Solving State
  const [challengeAnswer, setChallengeAnswer] = useState("");
  const [challengeError, setChallengeError] = useState<string | null>(null);
  const [challengeSuccessMsg, setChallengeSuccessMsg] = useState<string | null>(null);
  const [verifyingStop, setVerifyingStop] = useState(false);

  // Explorer Data State
  const [trails, setTrails] = useState<Trail[]>([]);
  const [trailsLoading, setTrailsLoading] = useState(false);
  const [selectedTrail, setSelectedTrail] = useState<Trail | null>(null);

  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState<LeaderboardUser[]>([]);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);

  // Profile State
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);

  // ─── Merchant Center States ────────────────────────────────────────────────
  const [merchant, setMerchant] = useState<any>(null);
  const [merchantLoading, setMerchantLoading] = useState(false);
  const [isMerchantChecking, setIsMerchantChecking] = useState(false);
  
  // Merchant Registration Form
  const [mName, setMName] = useState("");
  const [mCategory, setMCategory] = useState("Art & Culture");
  const [mAddress, setMAddress] = useState("");
  const [mLat, setMLat] = useState<number | "">("");
  const [mLng, setMLng] = useState<number | "">("");

  // Trail Creation Form
  const [tTitle, setTTitle] = useState("");
  const [tDesc, setTDesc] = useState("");
  const [tCategory, setTCategory] = useState("Art & Culture");
  const [tDifficulty, setTDifficulty] = useState<"easy" | "medium" | "hard">("easy");
  const [tReward, setTReward] = useState("0.5");
  const [tDuration, setTDuration] = useState("60");
  
  // Stops Builder
  const [stopsList, setStopsList] = useState<any[]>([]);
  const [sTitle, setSTitle] = useState("");
  const [sDesc, setSDesc] = useState("");
  const [sLat, setSLat] = useState<number | "">("");
  const [sLng, setSLng] = useState<number | "">("");
  const [sChallengeType, setSChallengeType] = useState<"qr" | "trivia" | "code">("qr");
  const [sChallengePayload, setSChallengePayload] = useState("");
  const [sRadius, setSRadius] = useState("50");
  const [sXpReward, setSXpReward] = useState("100");

  // On-Chain Deploy Status
  const [deployStep, setDeployStep] = useState<"idle" | "creating_db" | "creating_onchain" | "approving" | "funding" | "activating" | "done" | "error">("idle");
  const [deployTxHash, setDeployTxHash] = useState<string | null>(null);
  const [deployErrorMsg, setDeployErrorMsg] = useState<string | null>(null);

  // Developer Sidebar / Drawer Drawer Open
  const [isDevDrawerOpen, setIsDevDrawerOpen] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  // ─── Logger Helper ────────────────────────────────────────────────────────
  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString();
    setDebugLogs(prev => [`[${time}] ${msg}`, ...prev.slice(0, 49)]);
  }, []);

  // Check if connected wallet address matches a merchant
  const checkMerchantStatus = useCallback(async (currentAddress: string) => {
    if (!currentAddress) {
      setMerchant(null);
      return;
    }
    setIsMerchantChecking(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/merchants/list`);
      if (res.ok) {
        const data = await res.json();
        const found = data.merchants?.find((m: any) => m.wallet_address.toLowerCase() === currentAddress.toLowerCase());
        if (found) {
          setMerchant(found);
          addLog(`Merchant profile found: "${found.business_name}"`);
        } else {
          setMerchant(null);
        }
      }
    } catch (e: any) {
      console.warn("Failed to check merchant status:", e);
    } finally {
      setIsMerchantChecking(false);
    }
  }, [apiBaseUrl, addLog]);

  useEffect(() => {
    if (address) {
      checkMerchantStatus(address);
    } else {
      setMerchant(null);
    }
  }, [address, checkMerchantStatus]);

  // ─── GPS Proximity / Geofencing ────────────────────────────────────────────
  // Haversine distance helper on client side
  const getDistanceMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371000;
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  // Real GPS updates
  useEffect(() => {
    if (!useRealGps) return;
    
    if (typeof window === "undefined" || !navigator.geolocation) {
      addLog("Geolocation not supported by this device");
      setUseRealGps(false);
      return;
    }

    addLog("Starting active GPS tracking");
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setPlayerLat(pos.coords.latitude);
        setPlayerLng(pos.coords.longitude);
      },
      (err) => {
        addLog(`GPS Error: ${err.message}`);
        setUseRealGps(false);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      addLog("Stopped GPS tracking");
    };
  }, [useRealGps, addLog]);

  // ─── API Requests ──────────────────────────────────────────────────────────
  // Fetch nearby trails
  const fetchNearbyTrails = useCallback(async () => {
    setTrailsLoading(true);
    try {
      addLog(`Fetching trails near ${playerLat.toFixed(5)}, ${playerLng.toFixed(5)}`);
      const res = await fetch(`${apiBaseUrl}/api/trails/nearby?lat=${playerLat}&lng=${playerLng}&radius_km=15`);
      if (!res.ok) throw new Error("Failed to fetch trails");
      const data = await res.json();
      setTrails(data.trails || []);
      addLog(`Loaded ${data.trails?.length || 0} trails`);
    } catch (err: any) {
      console.error(err);
      addLog(`Fetch trails failed: ${err.message}`);
    } finally {
      setTrailsLoading(false);
    }
  }, [playerLat, playerLng, apiBaseUrl, addLog]);

  // Fetch full trail details with stops
  const startTrailQuest = async (trail: Trail) => {
    try {
      addLog(`Starting quest: "${trail.title}"`);
      const res = await fetch(`${apiBaseUrl}/api/trails/${trail.id}`);
      if (!res.ok) throw new Error("Failed to load trail stops");
      const data = await res.json();
      
      // Parse stops' challenge payloads if they are trivia
      const stopsWithTrivia = data.trail.stops.map((stop: any) => {
        if (stop.challenge_type === "trivia") {
          try {
            const payload = JSON.parse(stop.challenge_payload || "{}");
            return {
              ...stop,
              question: payload.question,
              options: payload.options,
            };
          } catch {
            return stop;
          }
        }
        return stop;
      });

      const updatedTrail = { ...data.trail, stops: stopsWithTrivia };
      setActiveTrail(updatedTrail);
      setQuestClaimed(false);
      setClaimTxHash(null);
      
      // Clear completions
      setCompletedStopIds([]);
      setChallengeAnswer("");
      setChallengeError(null);
      setChallengeSuccessMsg(null);

      // Set first stop as active
      if (stopsWithTrivia.length > 0) {
        setActiveStop(stopsWithTrivia[0]);
      }
      
      // Navigate to Active Quest tab
      setActiveTab("quest");
      addLog(`Active Quest loaded with ${stopsWithTrivia.length} stops.`);
    } catch (err: any) {
      addLog(`Start quest failed: ${err.message}`);
    }
  };

  // Trigger MiniPay native QR Scanner
  const handleScanQr = async () => {
    if (typeof window === "undefined" || !window.ethereum) {
      addLog("QR Scanner: No wallet detected");
      alert("No wallet provider detected.");
      return;
    }
    try {
      addLog("Launching native MiniPay QR scanner...");
      const result = await window.ethereum.request({
        method: "minipay_scanQrCode",
        params: [],
      });
      if (result) {
        addLog(`QR Scan Success: "${result}"`);
        setChallengeAnswer(result);
      } else {
        addLog("QR Scan cancelled or returned empty");
      }
    } catch (err: any) {
      console.error("MiniPay QR scan error:", err);
      addLog(`QR Scan failed: ${err.message}`);
      alert(`QR Scan failed: ${err.message}`);
    }
  };

  // Verify Stop Presence & Challenge
  const handleVerifyStop = async () => {
    if (!address) {
      setChallengeError("Please connect your wallet first.");
      return;
    }
    if (!activeStop || !activeTrail) return;
    if (!challengeAnswer.trim()) {
      setChallengeError("Please enter your challenge answer or scan code.");
      return;
    }

    setVerifyingStop(true);
    setChallengeError(null);
    setChallengeSuccessMsg(null);

    const bodyPayload = {
      user_address: address,
      stop_id: activeStop.id,
      latitude: playerLat,
      longitude: playerLng,
      challenge_answer: challengeAnswer.trim()
    };

    try {
      addLog(`Verifying stop ${activeStop.id} presence/answer...`);
      const res = await fetch(`${apiBaseUrl}/api/trails/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(bodyPayload)
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Verification failed");
      }

      addLog(`Stop Verified! Earned ${data.xp_earned} XP.`);
      setChallengeSuccessMsg(`Success! You earned +${data.xp_earned} XP.`);
      setCompletedStopIds(prev => [...prev, activeStop.id]);
      setChallengeAnswer("");

      // Find next stop if available
      const nextIndex = activeTrail.stops!.findIndex(s => s.id === activeStop.id) + 1;
      if (nextIndex < activeTrail.stops!.length) {
        setActiveStop(activeTrail.stops![nextIndex]);
      } else {
        addLog("All stops completed! Ready to claim reward.");
        setActiveStop(null);
      }
    } catch (err: any) {
      console.error(err);
      setChallengeError(err.message || "Failed to verify stop. Check if you are within range.");
      addLog(`Verification failed: ${err.message}`);
    } finally {
      setVerifyingStop(false);
    }
  };

  // Claim Trail Payout On-chain
  const handleClaimReward = async () => {
    if (!address || !activeTrail) return;
    
    // Check fee currency and balances
    setClaimLoading(true);
    addLog(`Initiating claim for Trail #${activeTrail.id}`);

    try {
      // 1. Get preferred stablecoin (CIP-64 fee currency)
      const preferred = await getPreferredStablecoin(address, chainId);
      if (!preferred) {
        addLog("Low balance redirect triggered");
        redirectToDeposit();
        setClaimLoading(false);
        return;
      }
      
      addLog(`Paying network fee using preferred token: ${preferred.symbol}`);

      // 2. Fetch signed claim payload from backend
      const res = await fetch(`${apiBaseUrl}/api/claim`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_address: address,
          trail_id: activeTrail.id
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate backend signature");
      }

      addLog("Backend claim signature acquired successfully.");
      const { claim_payload } = data;

      // 3. Initiate Celo transaction using viem client
      if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("No Ethereum wallet found.");
      }

      const client = createWalletClient({
        chain: chainId === 42220 ? celo : celoSepolia,
        transport: custom(window.ethereum),
      });

      addLog("Sending on-chain transaction: claimReward...");
      
      const txHash = await client.writeContract({
        address: trailContractAddress as `0x${string}`,
        abi: GEOQUEST_TRAIL_ABI,
        functionName: "claimReward",
        args: [
          BigInt(claim_payload.trail_id),
          BigInt(claim_payload.reward_amount_wei),
          claim_payload.nonce,
          claim_payload.signature
        ],
        account: address,
        feeCurrency: preferred.feeCurrency, // Pay network fee in stablecoin!
      });

      addLog(`Claim transaction sent! Hash: ${txHash}`);
      setClaimTxHash(txHash);
      setQuestClaimed(true);
      
      // Update profile and balances
      refreshBalances(address, chainId);
      fetchProfile();
    } catch (err: any) {
      console.error(err);
      addLog(`Claim failed: ${err.message}`);
      alert(err.message || "Failed to submit claim transaction.");
    } finally {
      setClaimLoading(false);
    }
  };

  // Fetch Leaderboard
  const fetchLeaderboard = useCallback(async () => {
    setLeaderboardLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/users/leaderboard/top`);
      if (!res.ok) throw new Error("Failed to fetch leaderboard");
      const data = await res.json();
      setLeaderboard(data.leaderboard || []);
    } catch (err: any) {
      addLog(`Leaderboard fetch failed: ${err.message}`);
    } finally {
      setLeaderboardLoading(false);
    }
  }, [apiBaseUrl, addLog]);

  // Fetch User Profile
  const fetchProfile = useCallback(async () => {
    if (!address) return;
    setProfileLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/users/${address}`);
      if (!res.ok) throw new Error("Failed to fetch profile");
      const data = await res.json();
      setProfile(data.user || null);
    } catch (err: any) {
      addLog(`Profile fetch failed: ${err.message}`);
    } finally {
      setProfileLoading(false);
    }
  }, [address, apiBaseUrl, addLog]);

  // Trigger fetches on tab/GPS changes
  useEffect(() => {
    fetchNearbyTrails();
  }, [playerLat, playerLng, fetchNearbyTrails]);

  useEffect(() => {
    if (activeTab === "leaderboard") {
      fetchLeaderboard();
    } else if (activeTab === "profile") {
      fetchProfile();
    }
  }, [activeTab, fetchLeaderboard, fetchProfile]);

  // Auto-fetch profile once connected
  useEffect(() => {
    if (address) {
      fetchProfile();
    }
  }, [address, fetchProfile]);

  // Register merchant in database
  const registerMerchant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!address) {
      alert("Please connect your wallet first");
      return;
    }
    if (!mName || !mCategory || mLat === "" || mLng === "") {
      alert("All fields are required to register");
      return;
    }
    setMerchantLoading(true);
    try {
      const res = await fetch(`${apiBaseUrl}/api/merchants/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          business_name: mName,
          wallet_address: address,
          category: mCategory,
          address: mAddress || null,
          latitude: Number(mLat),
          longitude: Number(mLng)
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to register merchant");
      addLog(`Merchant registered successfully! DB ID: ${data.merchant_id}`);
      checkMerchantStatus(address);
    } catch (err: any) {
      alert(err.message || "Failed to register merchant");
    } finally {
      setMerchantLoading(false);
    }
  };

  // Add stop to stopsList
  const addStopToBuilder = () => {
    if (!sTitle || sLat === "" || sLng === "" || !sChallengePayload) {
      alert("Stop title, coordinates, and challenge answer are required!");
      return;
    }
    let payload = sChallengePayload;
    if (sChallengeType === "trivia") {
      const parsedOptions = ["Option A", "Option B", "Option C", sChallengePayload]; // Simple array format
      payload = JSON.stringify({
        question: sDesc || `Solve the trivia for ${sTitle}?`,
        options: parsedOptions,
        answer: sChallengePayload
      });
    }
    const newStop = {
      title: sTitle,
      description: sDesc || "",
      latitude: Number(sLat),
      longitude: Number(sLng),
      challenge_type: sChallengeType,
      challenge_payload: payload,
      geofence_radius_m: Number(sRadius),
      xp_reward: Number(sXpReward)
    };
    setStopsList([...stopsList, newStop]);
    // Clear stop inputs
    setSTitle("");
    setSDesc("");
    setSLat("");
    setSLng("");
    setSChallengePayload("");
    addLog(`Added stop "${newStop.title}" to builder list.`);
  };

  const removeStopFromBuilder = (idx: number) => {
    setStopsList(stopsList.filter((_, i) => i !== idx));
  };

  // Deploy Campaign E2E Workflow
  const deployMerchantCampaign = async () => {
    if (!address) {
      alert("Please connect your wallet first");
      return;
    }
    if (!tTitle || !tReward || stopsList.length === 0) {
      alert("Trail title, reward amount, and at least one stop are required!");
      return;
    }

    setDeployStep("creating_db");
    setDeployErrorMsg(null);
    setDeployTxHash(null);
    addLog("Step 1: Creating trail in backend database...");

    let trailId: number;
    try {
      const res = await fetch(`${apiBaseUrl}/api/merchants/trail/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address,
          title: tTitle,
          description: tDesc || null,
          category: tCategory,
          difficulty: tDifficulty,
          reward_amount: Number(tReward),
          estimated_duration_mins: Number(tDuration),
          stops: stopsList
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create database trail");
      trailId = data.trail_id;
      addLog(`✓ Backend trail created. ID: ${trailId}`);
    } catch (err: any) {
      setDeployStep("error");
      setDeployErrorMsg(`Database registration failed: ${err.message}`);
      return;
    }

    // Step 2: Deploy on-chain via smart contract
    setDeployStep("creating_onchain");
    addLog("Step 2: Sending transaction to create trail on Celo Sepolia...");
    
    let onChainTrailId: number;
    let preferred;
    try {
      preferred = await getPreferredStablecoin(address, chainId);
      if (!preferred) {
        addLog("Low balance redirect triggered: Please deposit stablecoins (USDm, USDC, or USDT)");
        redirectToDeposit();
        setDeployStep("error");
        setDeployErrorMsg("No stablecoins with balance found. Redirecting to deposit...");
        return;
      }
    } catch (err: any) {
      setDeployStep("error");
      setDeployErrorMsg(`Failed to determine preferred stablecoin: ${err.message}`);
      return;
    }

    try {
      if (typeof window === "undefined" || !window.ethereum) {
        throw new Error("No Ethereum provider found");
      }
      
      const client = createWalletClient({
        chain: chainId === 42220 ? celo : celoSepolia,
        transport: custom(window.ethereum),
      });

      const rewardWei = parseUnits(tReward, 18); // 18 decimals for USDm

      const deployTx = await client.writeContract({
        address: trailContractAddress as `0x${string}`,
        abi: GEOQUEST_TRAIL_ABI,
        functionName: "createTrail",
        args: [
          preferred.address,
          rewardWei
        ],
        account: address,
        feeCurrency: preferred.feeCurrency,
      });

      addLog(`Transaction sent! Tx: ${deployTx}. Waiting for confirmation...`);
      setDeployTxHash(deployTx);

      const publicClient = getPublicClient(chainId);
      await publicClient.waitForTransactionReceipt({ hash: deployTx });
      
      const nextId = await publicClient.readContract({
        address: trailContractAddress as `0x${string}`,
        abi: GEOQUEST_TRAIL_ABI,
        functionName: "nextTrailId",
      }) as bigint;

      onChainTrailId = Number(nextId) - 1;
      addLog(`✓ On-chain trail deployed successfully! ID: ${onChainTrailId}`);
    } catch (err: any) {
      setDeployStep("error");
      setDeployErrorMsg(`On-chain deployment failed: ${err.message}`);
      return;
    }

    // Step 3: Link on-chain ID back to database
    setDeployStep("approving");
    addLog(`Step 3: Linking database Trail #${trailId} to On-Chain ID #${onChainTrailId}...`);
    const totalBudget = Number(tReward) * 5; // seed with a budget of 5 rewards for testing
    const totalBudgetWei = parseUnits(totalBudget.toString(), 18);

    try {
      const linkRes = await fetch(`${apiBaseUrl}/api/merchants/trail/link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address,
          trail_id: trailId,
          on_chain_trail_id: onChainTrailId,
          total_budget: totalBudget
        })
      });
      if (!linkRes.ok) {
        const errorData = await linkRes.json();
        throw new Error(errorData.error || "Failed to link on-chain ID");
      }
      addLog("✓ On-chain ID linked in database.");
    } catch (err: any) {
      setDeployStep("error");
      setDeployErrorMsg(`Database linking failed: ${err.message}`);
      return;
    }

    // Step 4: Token Approval
    addLog(`Step 4: Prompting ERC-20 approval for ${totalBudget} USDm escrow budget...`);
    try {
      const client = createWalletClient({
        chain: chainId === 42220 ? celo : celoSepolia,
        transport: custom(window.ethereum),
      });

      const erc20Abi = ["function approve(address spender, uint256 amount) external returns (bool)"] as const;
      const approveTx = await client.writeContract({
        address: preferred.address,
        abi: erc20Abi,
        functionName: "approve",
        args: [trailContractAddress as `0x${string}`, totalBudgetWei],
        account: address,
        feeCurrency: preferred.feeCurrency,
      });

      addLog(`Approval sent! Waiting for transaction ${approveTx}...`);
      const publicClient = getPublicClient(chainId);
      await publicClient.waitForTransactionReceipt({ hash: approveTx });
      addLog("✓ Tokens approved.");
    } catch (err: any) {
      setDeployStep("error");
      setDeployErrorMsg(`Token approval failed: ${err.message}`);
      return;
    }

    // Step 5: Fund Trail Escrow
    setDeployStep("funding");
    addLog(`Step 5: Funding Escrow for On-Chain Trail #${onChainTrailId}...`);
    try {
      const client = createWalletClient({
        chain: chainId === 42220 ? celo : celoSepolia,
        transport: custom(window.ethereum),
      });

      const fundTx = await client.writeContract({
        address: trailContractAddress as `0x${string}`,
        abi: GEOQUEST_TRAIL_ABI,
        functionName: "fundTrail",
        args: [BigInt(onChainTrailId), totalBudgetWei],
        account: address,
        feeCurrency: preferred.feeCurrency,
      });

      addLog(`Funding transaction sent! Tx: ${fundTx}. Waiting for confirmation...`);
      const publicClient = getPublicClient(chainId);
      await publicClient.waitForTransactionReceipt({ hash: fundTx });
      addLog("✓ Escrow funded successfully.");
    } catch (err: any) {
      setDeployStep("error");
      setDeployErrorMsg(`Escrow funding failed: ${err.message}`);
      return;
    }

    // Step 6: Activate Trail on-chain
    setDeployStep("activating");
    addLog(`Step 6: Activating Trail #${onChainTrailId} on-chain...`);
    try {
      const client = createWalletClient({
        chain: chainId === 42220 ? celo : celoSepolia,
        transport: custom(window.ethereum),
      });

      const activeTx = await client.writeContract({
        address: trailContractAddress as `0x${string}`,
        abi: GEOQUEST_TRAIL_ABI,
        functionName: "setTrailActive",
        args: [BigInt(onChainTrailId), true],
        account: address,
        feeCurrency: preferred.feeCurrency,
      });

      addLog(`Activation transaction sent! Tx: ${activeTx}. Waiting for confirmation...`);
      const publicClient = getPublicClient(chainId);
      await publicClient.waitForTransactionReceipt({ hash: activeTx });
      addLog("✓ On-chain trail activated successfully.");

      const actRes = await fetch(`${apiBaseUrl}/api/merchants/trail/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          wallet_address: address,
          trail_id: trailId,
          active: 1
        })
      });
      if (!actRes.ok) throw new Error("Failed to activate trail in database");
      addLog("✓ Trail activated in database.");
    } catch (err: any) {
      setDeployStep("error");
      setDeployErrorMsg(`Activation failed: ${err.message}`);
      return;
    }

    setDeployStep("done");
    addLog("🎉 E2E Trail Deployment, Funding, and Activation Complete!");
    setTTitle("");
    setTDesc("");
    setStopsList([]);
    fetchNearbyTrails();
  };

  // Reset database function
  const resetDatabase = async () => {
    if (!confirm("Are you sure you want to reset the database? All custom trails and user completions will be cleared and Lagos dummy data will be re-seeded.")) return;
    try {
      addLog("Triggering database reset...");
      const res = await fetch(`${apiBaseUrl}/api/merchants/reset-db`, {
        method: "POST"
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      addLog(`✅ Reset Success: ${data.message}`);
      alert("Database reset successfully!");
      setActiveTrail(null);
      setActiveStop(null);
      setCompletedStopIds([]);
      setQuestClaimed(false);
      fetchNearbyTrails();
      if (address) checkMerchantStatus(address);
    } catch (err: any) {
      alert(`Reset failed: ${err.message}`);
    }
  };

  // ─── Proximity Distance Check for Active Stop ──────────────────────────────
  const activeStopDistance = useMemo(() => {
    if (!activeStop) return null;
    return getDistanceMeters(
      playerLat,
      playerLng,
      activeStop.latitude,
      activeStop.longitude
    );
  }, [playerLat, playerLng, activeStop]);

  const activeStopUnlocked = useMemo(() => {
    if (activeStopDistance === null || !activeStop) return false;
    return activeStopDistance <= activeStop.geofence_radius_m;
  }, [activeStopDistance, activeStop]);

  // Developer teleport utility
  const teleportToStop = (stop: Stop) => {
    setUseRealGps(false);
    setPlayerLat(stop.latitude);
    setPlayerLng(stop.longitude);
    addLog(`Developer: Teleported player to stop "${stop.title}" coordinates.`);
  };

  const currentQuestProgress = useMemo(() => {
    if (!activeTrail) return 0;
    if (activeTrail.stops!.length === 0) return 100;
    return Math.round((completedStopIds.length / activeTrail.stops!.length) * 100);
  }, [activeTrail, completedStopIds]);

  return (
    <div className="relative mx-auto w-full max-w-[480px] min-h-screen bg-[#f5f2eb] text-[#0d0d0b] font-sans flex flex-col shadow-xl border-x border-[rgba(13,13,11,0.08)]">
      {/* ─── Top Header ───────────────────────────────────────────────────────── */}
      <header className="px-6 py-4 bg-white border-b border-[rgba(13,13,11,0.08)] flex justify-between items-center sticky top-0 z-20">
        <div className="flex flex-col">
          <span className="text-[10px] font-mono tracking-widest text-[#6b6b5e] uppercase">GEOQUEST</span>
          <span className="text-xl font-bold font-serif italic text-[#2d6a4f]">Lagos Island</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Developer Mode trigger */}
          <button
            onClick={() => setIsDevDrawerOpen(true)}
            className="p-2 rounded-full border border-[rgba(13,13,11,0.08)] bg-[#f5f2eb] hover:bg-white transition-colors"
            title="Developer Settings"
          >
            <Sliders className="w-4 h-4 text-[#6b6b5e]" />
          </button>

          {/* Wallet Address / Connect Button */}
          {address ? (
            <div className="flex flex-col items-end">
              <span className="text-[10px] font-mono font-medium text-[#2d6a4f] bg-[rgba(45,106,79,0.08)] px-2 py-0.5 rounded-full">
                {address.substring(0, 6)}...{address.substring(38)}
              </span>
              <span className="text-[9px] font-mono text-muted">
                {balances.find(b => b.symbol === "USDm")?.human || "0.00"} USDm
              </span>
            </div>
          ) : isMiniPay ? (
            /* Inside MiniPay — auto-connecting, never show a Connect button */
            <span className="text-[10px] font-mono text-[#6b6b5e] animate-pulse">
              {walletLoading ? "Connecting…" : "No account"}
            </span>
          ) : (
            /* Outside MiniPay (desktop browser / MetaMask) — show manual connect */
            <button
              onClick={connectWalletOutsideMiniPay}
              className="px-3 py-1.5 rounded-full bg-[#2d6a4f] hover:bg-[#1e4d37] text-white text-xs font-bold transition-all uppercase tracking-wider"
            >
              Connect
            </button>
          )}
        </div>
      </header>

      {/* ─── Main Content Views ────────────────────────────────────────────────── */}
      <main className="flex-1 flex flex-col p-5 pb-24 overflow-y-auto">
        
        {/* Banner if outside MiniPay */}
        {!isMiniPay && (
          <div className="mb-4 p-3 bg-[rgba(233,196,106,0.15)] border border-[rgba(233,196,106,0.4)] rounded-xl flex gap-3 items-start">
            <AlertCircle className="w-4 h-4 text-[#e9c46a] shrink-0 mt-0.5" />
            <div className="flex flex-col text-[11px] text-[#6b6b5e] leading-relaxed">
              <span className="font-bold text-[#0d0d0b]">Browser Developer Sandbox</span>
              Using standard wallet. GPS simulation active.
            </div>
          </div>
        )}

        {/* TAB 1: EXPLORE */}
        {activeTab === "explore" && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {/* Proximity Map radar representation */}
            <div className="flex flex-col gap-2">
              <h2 className="text-sm font-bold uppercase tracking-wider text-muted font-mono">Presence Radar</h2>
              <RadarMap 
                playerLat={playerLat} 
                playerLng={playerLng} 
                stops={trails.flatMap(t => t.stops || []).map(s => ({
                  id: s.id,
                  title: s.title,
                  latitude: s.latitude,
                  longitude: s.longitude,
                  geofence_radius_m: s.geofence_radius_m
                }))}
                activeStopId={selectedTrail?.stops?.[0]?.id}
              />
            </div>

            {/* List of Nearby Trails */}
            <div className="flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <h2 className="text-sm font-bold uppercase tracking-wider text-muted font-mono">Nearby Trails</h2>
                <button 
                  onClick={fetchNearbyTrails} 
                  className="text-xs text-[#2d6a4f] hover:underline font-mono"
                  disabled={trailsLoading}
                >
                  {trailsLoading ? "Refreshing..." : "REFRESH"}
                </button>
              </div>

              {trailsLoading && (
                <div className="py-12 flex flex-col justify-center items-center gap-2">
                  <div className="w-8 h-8 rounded-full border-2 border-[#2d6a4f] border-t-transparent animate-spin" />
                  <span className="text-xs text-muted font-mono">Scanning locations...</span>
                </div>
              )}

              {!trailsLoading && trails.length === 0 && (
                <div className="py-12 border border-dashed border-[rgba(13,13,11,0.12)] rounded-2xl flex flex-col items-center justify-center text-center p-6">
                  <Compass className="w-8 h-8 text-muted mb-2 animate-pulse" />
                  <span className="text-xs font-bold">No quests found nearby.</span>
                  <span className="text-[10px] text-muted max-w-[200px] mt-1">
                    Try teleporting closer to Lagos Island (6.4314, 3.4144) using the dev panel.
                  </span>
                </div>
              )}

              {trails.map((trail) => (
                <div 
                  key={`trail-${trail.id}`}
                  onClick={() => setSelectedTrail(selectedTrail?.id === trail.id ? null : trail)}
                  className={`bg-white border rounded-2xl p-4 transition-all cursor-pointer ${
                    selectedTrail?.id === trail.id 
                      ? "border-[#2d6a4f] shadow-md" 
                      : "border-[rgba(13,13,11,0.08)] hover:border-[rgba(13,13,11,0.16)]"
                  }`}
                >
                  <div className="flex justify-between items-start gap-4">
                    <div className="flex flex-col gap-1">
                      <span className="text-[10px] font-mono uppercase tracking-widest text-[#6b6b5e]">
                        {trail.category} • {trail.difficulty}
                      </span>
                      <h3 className="font-bold text-sm leading-tight text-ink">{trail.title}</h3>
                    </div>
                    <div className="flex flex-col items-end shrink-0">
                      <span className="text-[#2d6a4f] font-bold text-sm bg-[rgba(45,106,79,0.08)] px-2 py-0.5 rounded-lg flex items-center gap-1">
                        <Coins className="w-3 h-3" />
                        {trail.reward_amount} {trail.reward_token}
                      </span>
                      <span className="text-[9px] font-mono text-muted mt-1">
                        {trail.distance_m ? `${(trail.distance_m / 1000).toFixed(1)} km away` : "near you"}
                      </span>
                    </div>
                  </div>

                  <p className="text-xs text-[#6b6b5e] mt-3 line-clamp-2">{trail.description}</p>

                  <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[rgba(13,13,11,0.06)] text-[10px] font-mono text-muted">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3 text-[#2d6a4f]" />
                      {trail.stop_count} stops
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="w-3 h-3 text-[#2d6a4f]" />
                      {trail.estimated_duration_mins} mins
                    </span>
                  </div>

                  {/* Expanded Detail Panel */}
                  {selectedTrail?.id === trail.id && (
                    <div className="mt-4 pt-4 border-t border-[rgba(13,13,11,0.08)] flex flex-col gap-3 animate-slideDown">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-[#f5f2eb] flex items-center justify-center font-bold text-xs uppercase font-serif text-[#2d6a4f] border border-[rgba(13,13,11,0.08)]">
                          {trail.merchant_name.substring(0, 2)}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[9px] font-mono text-muted">SPONSORED BY</span>
                          <span className="text-xs font-bold">{trail.merchant_name}</span>
                        </div>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          startTrailQuest(trail);
                        }}
                        className="w-full py-2.5 rounded-xl bg-[#2d6a4f] hover:bg-[#1e4d37] text-white font-bold text-xs transition-colors uppercase tracking-wider flex items-center justify-center gap-2"
                      >
                        <Zap className="w-3.5 h-3.5 fill-current" />
                        Start Quest
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 2: ACTIVE QUEST */}
        {activeTab === "quest" && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {!activeTrail ? (
              <div className="py-16 border border-dashed border-[rgba(13,13,11,0.12)] rounded-3xl flex flex-col items-center justify-center text-center p-8 bg-white">
                <Compass className="w-12 h-12 text-[#2d6a4f] opacity-30 mb-3 animate-pulse" />
                <h3 className="font-bold text-sm">No Active Quest</h3>
                <p className="text-xs text-muted max-w-[240px] mt-1.5 leading-relaxed">
                  Head over to the **Explore** tab to discover and launch a new location reward trail!
                </p>
                <button
                  onClick={() => setActiveTab("explore")}
                  className="mt-5 px-5 py-2 rounded-xl border border-[#2d6a4f] text-[#2d6a4f] hover:bg-[#2d6a4f] hover:text-white font-bold text-xs transition-all uppercase tracking-wider"
                >
                  Find Trails
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-5">
                {/* Quest Progress Header */}
                <div className="bg-white border border-[rgba(13,13,11,0.08)] rounded-2xl p-4 flex flex-col gap-3">
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-muted">ACTIVE QUEST</span>
                      <h3 className="font-bold text-sm leading-tight">{activeTrail.title}</h3>
                    </div>
                    <button
                      onClick={() => {
                        if (confirm("Abandon this quest? Your current progress will be lost.")) {
                          setActiveTrail(null);
                          setActiveStop(null);
                        }
                      }}
                      className="text-xs text-muted hover:text-[#e76f51] font-mono"
                    >
                      ABANDON
                    </button>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex flex-col gap-1.5 mt-2">
                    <div className="flex justify-between items-center text-[10px] font-mono text-muted">
                      <span>{completedStopIds.length} of {activeTrail.stops?.length || 0} Stops Verified</span>
                      <span>{currentQuestProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-[#f5f2eb] rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-[#2d6a4f] transition-all duration-500" 
                        style={{ width: `${currentQuestProgress}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Trail Stops Checklist */}
                <div className="flex flex-col gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-muted font-mono">Trail Milestones</h4>
                  <div className="flex flex-col gap-2 bg-white border border-[rgba(13,13,11,0.08)] rounded-2xl p-4">
                    {activeTrail.stops?.map((stop, index) => {
                      const isCompleted = completedStopIds.includes(stop.id);
                      const isNext = !isCompleted && (index === 0 || completedStopIds.includes(activeTrail.stops![index - 1].id));
                      
                      return (
                        <div 
                          key={`stop-${stop.id}`}
                          onClick={() => isNext && setActiveStop(stop)}
                          className={`flex items-center justify-between p-2 rounded-xl transition-colors ${
                            isNext ? "bg-[rgba(233,196,106,0.08)] border border-[rgba(233,196,106,0.2)] cursor-pointer" : ""
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono font-bold ${
                              isCompleted 
                                ? "bg-[#2d6a4f] text-white" 
                                : isNext 
                                  ? "bg-[#e9c46a] text-[#0d0d0b]" 
                                  : "bg-[#f5f2eb] text-[#6b6b5e]"
                            }`}>
                              {isCompleted ? "✓" : index + 1}
                            </div>
                            <div className="flex flex-col">
                              <span className={`text-xs font-bold ${isCompleted ? "line-through text-muted" : "text-ink"}`}>
                                {stop.title}
                              </span>
                              <span className="text-[8px] font-mono text-muted uppercase tracking-wide">
                                {stop.challenge_type} Challenge • {stop.xp_reward} XP
                              </span>
                            </div>
                          </div>
                          
                          {/* Developer convenience button */}
                          {isNext && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                teleportToStop(stop);
                              }}
                              className="text-[9px] font-mono text-[#2d6a4f] bg-[rgba(45,106,79,0.08)] hover:bg-[#2d6a4f] hover:text-white px-2 py-0.5 rounded-full transition-all"
                            >
                              TELEPORT
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Target Stop Details / Solver Panel */}
                {activeStop && (
                  <div className="bg-white border border-[rgba(13,13,11,0.08)] rounded-2xl p-5 flex flex-col gap-4 animate-slideDown">
                    <div className="flex flex-col">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-[#e76f51] font-bold">CURRENT DESTINATION</span>
                      <h3 className="font-bold text-sm mt-0.5">{activeStop.title}</h3>
                      <p className="text-xs text-[#6b6b5e] mt-1.5 leading-relaxed">{activeStop.description}</p>
                    </div>

                    {/* Geofence Proximity Status */}
                    <div className={`p-3.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 ${
                      activeStopUnlocked 
                        ? "bg-[rgba(45,106,79,0.05)] border-[rgba(45,106,79,0.25)] text-[#2d6a4f]" 
                        : "bg-[rgba(231,111,81,0.05)] border-[rgba(231,111,81,0.25)] text-[#e76f51]"
                    }`}>
                      {activeStopUnlocked ? (
                        <div className="flex flex-col items-center text-center">
                          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Sparkles className="w-4 h-4 fill-current animate-pulse" />
                            YOU ARE IN RANGE!
                          </span>
                          <span className="text-[9px] font-mono opacity-80 mt-0.5">
                            Stop unlocked (~{Math.round(activeStopDistance || 0)}m away)
                          </span>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center text-center">
                          <span className="text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                            <Lock className="w-3.5 h-3.5" />
                            TOO FAR AWAY
                          </span>
                          <span className="text-[9px] font-mono opacity-80 mt-0.5">
                            Proximity: {activeStopDistance ? `${Math.round(activeStopDistance)}m` : "Checking GPS..."} (Need &lt; {activeStop.geofence_radius_m}m)
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Challenge Submission Layout */}
                    <div className="pt-2 border-t border-[rgba(13,13,11,0.06)] flex flex-col gap-3">
                      <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted font-mono">
                        <QrCode className="w-4 h-4 text-[#2d6a4f]" />
                        Solve Challenge
                      </div>

                      {/* QR or Secret Code Entry */}
                      {(activeStop.challenge_type === "qr" || activeStop.challenge_type === "code") && (
                        <div className="flex flex-col gap-2">
                          <div className="flex gap-2">
                            <input
                              type="text"
                              placeholder={activeStop.challenge_type === "qr" ? "Enter scanned QR string (e.g. BOGOBIRI2025)" : "Enter secret code"}
                              value={challengeAnswer}
                              onChange={(e) => setChallengeAnswer(e.target.value)}
                              disabled={!activeStopUnlocked || verifyingStop}
                              className="flex-1 px-3.5 py-2.5 rounded-xl border border-[rgba(13,13,11,0.12)] bg-[#f5f2eb] text-xs font-mono text-ink placeholder:text-[#6b6b5e] focus:outline-none focus:border-[#2d6a4f] disabled:opacity-50"
                            />
                            {activeStop.challenge_type === "qr" && isMiniPay && (
                              <button
                                onClick={handleScanQr}
                                disabled={!activeStopUnlocked || verifyingStop}
                                className="px-4 py-2.5 rounded-xl bg-[#2d6a4f] hover:bg-[#1e4d37] text-white font-bold text-xs transition-colors uppercase tracking-wider flex items-center justify-center gap-1.5 disabled:opacity-50 shrink-0"
                              >
                                <QrCode className="w-3.5 h-3.5" />
                                Scan
                              </button>
                            )}
                          </div>
                          {activeStop.challenge_type === "qr" && (
                            <button
                              onClick={() => setChallengeAnswer(activeStop.challenge_payload || "")}
                              disabled={!activeStopUnlocked || verifyingStop}
                              className="text-[9px] font-mono text-muted text-right hover:underline"
                            >
                              [Simulate QR Scan (Autofill Code)]
                            </button>
                          )}
                        </div>
                      )}

                      {/* Trivia Challenge Entry */}
                      {activeStop.challenge_type === "trivia" && (
                        <div className="flex flex-col gap-2.5">
                          <p className="text-xs font-bold bg-[#f5f2eb] p-3 rounded-xl border border-[rgba(13,13,11,0.06)]">
                            {activeStop.question}
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            {activeStop.options?.map((opt) => (
                              <button
                                key={opt}
                                onClick={() => setChallengeAnswer(opt)}
                                disabled={!activeStopUnlocked || verifyingStop}
                                className={`p-2.5 rounded-xl text-[11px] font-bold border transition-all text-center ${
                                  challengeAnswer === opt 
                                    ? "bg-[#e9c46a] border-[#e9c46a] text-[#0d0d0b]"
                                    : "bg-white border-[rgba(13,13,11,0.08)] hover:border-[#6b6b5e]"
                                }`}
                              >
                                {opt}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Validation messages */}
                      {challengeError && (
                        <span className="text-[10px] text-[#e76f51] flex items-center gap-1 font-mono">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          {challengeError}
                        </span>
                      )}

                      {challengeSuccessMsg && (
                        <span className="text-[10px] text-[#2d6a4f] flex items-center gap-1 font-mono font-bold">
                          <CheckCircle className="w-3.5 h-3.5 shrink-0" />
                          {challengeSuccessMsg}
                        </span>
                      )}

                      <button
                        onClick={handleVerifyStop}
                        disabled={!activeStopUnlocked || verifyingStop || !challengeAnswer.trim()}
                        className="w-full py-2.5 rounded-xl bg-[#2d6a4f] hover:bg-[#1e4d37] text-white font-bold text-xs transition-colors uppercase tracking-wider flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {verifyingStop ? "Verifying..." : "Verify & Complete Stop"}
                      </button>
                    </div>
                  </div>
                )}

                {/* Claim Escrow Reward Panel (Once all stops completed) */}
                {completedStopIds.length === activeTrail.stops?.length && (
                  <div className="bg-white border-2 border-[#2d6a4f] rounded-3xl p-6 flex flex-col items-center text-center gap-4 animate-slideDown shadow-lg">
                    <div className="w-12 h-12 rounded-full bg-[rgba(45,106,79,0.1)] flex items-center justify-center">
                      <Trophy className="w-6 h-6 text-[#2d6a4f] animate-bounce" />
                    </div>

                    {!questClaimed ? (
                      <div className="flex flex-col items-center">
                        <h3 className="font-bold text-base font-serif italic text-[#2d6a4f]">Trail Completed!</h3>
                        <p className="text-xs text-muted max-w-[220px] mt-1 leading-relaxed">
                          You verified presence at all stops. Claim your stablecoin reward and stamp NFT!
                        </p>
                        
                        <button
                          onClick={handleClaimReward}
                          disabled={claimLoading}
                          className="mt-5 w-full max-w-[200px] py-3 rounded-2xl bg-[#e9c46a] hover:bg-[#dfb651] text-[#0d0d0b] font-bold text-xs transition-all uppercase tracking-widest shadow-md flex items-center justify-center gap-2"
                        >
                          {claimLoading ? (
                            <>
                              <div className="w-4 h-4 rounded-full border-2 border-[#0d0d0b] border-t-transparent animate-spin" />
                              Claiming...
                            </>
                          ) : (
                            <>
                              <Coins className="w-4 h-4 fill-current" />
                              Claim {activeTrail.reward_amount} USDm
                            </>
                          )}
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center gap-3">
                        <h3 className="font-bold text-base text-[#2d6a4f] font-serif">Reward Claimed!</h3>
                        <p className="text-xs text-muted max-w-[220px] leading-relaxed">
                          Your instant stablecoin reward has been sent. Your custom NFT stamp has been minted to your profile!
                        </p>

                        {claimTxHash && (
                          <a
                            href={`https://celo-sepolia.blockscout.com/tx/${claimTxHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[10px] font-mono text-[#2d6a4f] hover:underline flex items-center gap-1.5"
                          >
                            View Transaction
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}

                        <button
                          onClick={() => {
                            setActiveTrail(null);
                            setActiveStop(null);
                            setActiveTab("profile");
                          }}
                          className="mt-4 px-5 py-2 rounded-xl border border-[#2d6a4f] text-[#2d6a4f] font-bold text-xs hover:bg-[#2d6a4f] hover:text-white transition-all uppercase tracking-wider"
                        >
                          View My Stamp Box
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: LEADERBOARD */}
        {activeTab === "leaderboard" && (
          <div className="flex flex-col gap-5 animate-fadeIn">
            <div className="flex flex-col">
              <span className="text-[10px] font-mono tracking-widest text-[#6b6b5e] uppercase">SOCIAL EXPLORERS</span>
              <h2 className="text-lg font-bold font-serif italic text-[#2d6a4f]">Leaderboard</h2>
            </div>

            {leaderboardLoading ? (
              <div className="py-12 flex justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-[#2d6a4f] border-t-transparent animate-spin" />
              </div>
            ) : (
              <div className="bg-white border border-[rgba(13,13,11,0.08)] rounded-2xl overflow-hidden">
                <table className="w-full border-collapse text-left">
                  <thead>
                    <tr className="border-b border-[rgba(13,13,11,0.06)] text-[9px] font-mono text-[#6b6b5e] uppercase tracking-wider">
                      <th className="py-3.5 px-4 font-semibold w-12 text-center">Rank</th>
                      <th className="py-3.5 px-3 font-semibold">Explorer</th>
                      <th className="py-3.5 px-3 font-semibold text-right">XP</th>
                      <th className="py-3.5 px-4 font-semibold text-center w-16">Stamps</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[rgba(13,13,11,0.06)]">
                    {leaderboard.map((user, idx) => {
                      const isMe = address && user.wallet_address.toLowerCase() === address.toLowerCase();
                      const rank = idx + 1;
                      
                      return (
                        <tr 
                          key={user.wallet_address}
                          className={`text-xs ${isMe ? "bg-[rgba(45,106,79,0.04)] font-medium" : "hover:bg-[rgba(13,13,11,0.01)]"}`}
                        >
                          <td className="py-3.5 px-4 text-center font-mono text-muted">
                            {rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : rank}
                          </td>
                          <td className="py-3.5 px-3">
                            <div className="flex flex-col">
                              <span className="font-bold text-ink">
                                {user.username || `Explorer_${user.wallet_address.substring(2, 6)}`}
                              </span>
                              <span className="text-[9px] font-mono text-muted uppercase tracking-wide">
                                Level {user.level} • {user.streak_days}d streak
                              </span>
                            </div>
                          </td>
                          <td className="py-3.5 px-3 text-right font-mono text-[#2d6a4f] font-bold">
                            {user.xp}
                          </td>
                          <td className="py-3.5 px-4 text-center font-mono text-muted">
                            {user.trails_completed}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* TAB 4: MY PROFILE */}
        {activeTab === "profile" && (
          <div className="flex flex-col gap-6 animate-fadeIn">
            {profileLoading ? (
              <div className="py-12 flex justify-center">
                <div className="w-8 h-8 rounded-full border-2 border-[#2d6a4f] border-t-transparent animate-spin" />
              </div>
            ) : profile ? (
              <div className="flex flex-col gap-6">
                {/* Profile Avatar Card */}
                <div className="bg-white border border-[rgba(13,13,11,0.08)] rounded-3xl p-5 flex items-center gap-4 shadow-sm">
                  <div className="w-14 h-14 rounded-full bg-[#f5f2eb] border border-[rgba(13,13,11,0.08)] flex items-center justify-center text-[#2d6a4f] font-serif font-bold text-xl italic uppercase">
                    {(profile.username || "Ex").substring(0, 2)}
                  </div>
                  <div className="flex flex-col flex-1 gap-0.5">
                    <h3 className="font-bold text-sm text-ink">
                      {profile.username || `Explorer_${profile.wallet_address.substring(2, 6)}`}
                    </h3>
                    <div className="flex items-center gap-3 text-[10px] font-mono text-muted">
                      <span>Lvl {profile.level}</span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5 text-[#e76f51]">
                        🔥 {profile.streak_days} Day Streak
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-[#2d6a4f] font-bold text-sm">{profile.xp}</span>
                    <span className="text-[9px] font-mono text-muted">TOTAL XP</span>
                  </div>
                </div>

                {/* NFT Stamp Collection Box */}
                <div className="flex flex-col gap-3">
                  <div className="flex justify-between items-center">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-muted font-mono">My Exploration Stamps</h4>
                    <span className="text-[10px] font-mono text-muted">
                      {profile.completed_trails.length} Unlocked
                    </span>
                  </div>

                  {profile.completed_trails.length === 0 ? (
                    <div className="py-10 border border-dashed border-[rgba(13,13,11,0.12)] rounded-3xl flex flex-col items-center justify-center text-center p-6 bg-white">
                      <HelpCircle className="w-8 h-8 text-muted mb-2 animate-pulse" />
                      <span className="text-xs font-bold">No stamps collected yet.</span>
                      <span className="text-[9px] text-muted max-w-[180px] mt-1 leading-normal">
                        Complete locations and claim on-chain rewards to fill your book.
                      </span>
                    </div>
                  ) : (
                    // Stamps Grid
                    <div className="grid grid-cols-2 gap-4">
                      {profile.completed_trails.map((stamp) => (
                        <div 
                          key={`stamp-${stamp.trail_id}`}
                          className="bg-white border border-[rgba(13,13,11,0.08)] rounded-2xl p-4 flex flex-col gap-2 relative overflow-hidden shadow-sm hover:shadow-md transition-all group"
                          style={{
                            // Stamp look edges via CSS border dashed
                            backgroundImage: "radial-gradient(circle, transparent 20%, #ffffff 20%)",
                            backgroundSize: "8px 8px"
                          }}
                        >
                          {/* Inner border line to simulate postage stamp */}
                          <div className="absolute inset-2 border border-dashed border-[rgba(45,106,79,0.25)] rounded-xl pointer-events-none" />
                          
                          {/* Stamp Artwork Placeholder */}
                          <div className="w-full aspect-[4/3] bg-[#f5f2eb] rounded-lg flex flex-col items-center justify-center relative overflow-hidden p-2 pt-4">
                            <span className="text-[8px] font-mono text-muted absolute top-1 uppercase tracking-wider">
                              LAGOS • {stamp.category}
                            </span>
                            <MapIcon className="w-6 h-6 text-[#2d6a4f] opacity-40 group-hover:scale-110 transition-transform" />
                            <span className="text-[8px] font-mono text-muted absolute bottom-1">
                              ID: #{stamp.trail_id}
                            </span>
                          </div>

                          <div className="flex flex-col gap-0.5 text-center mt-1 z-10">
                            <span className="text-[10px] font-bold text-ink line-clamp-1">
                              {stamp.title}
                            </span>
                            <span className="text-[8px] font-mono text-muted">
                              {new Date(stamp.completed_at).toLocaleDateString()}
                            </span>
                          </div>

                          {/* Explorer links */}
                          {stamp.tx_hash && (
                            <a
                              href={`https://celo-sepolia.blockscout.com/tx/${stamp.tx_hash}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="absolute top-2 right-2 p-1 rounded-full bg-white border border-[rgba(13,13,11,0.08)] opacity-0 group-hover:opacity-100 transition-opacity z-10"
                            >
                              <ExternalLink className="w-2.5 h-2.5 text-[#2d6a4f]" />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="py-12 text-center text-xs text-muted font-mono">
                Connect your wallet to view exploration profile
              </div>
            )}
          </div>
        )}

        {/* TAB 5: MERCHANT CENTER */}
        {activeTab === "merchant" && (
          <div className="flex flex-col gap-6 animate-fadeIn pb-12">
            <div className="flex flex-col gap-1 border-b border-[rgba(13,13,11,0.08)] pb-4">
              <h2 className="text-xl font-bold font-serif italic text-[#2d6a4f]">Merchant Center</h2>
              <p className="text-xs text-[#6b6b5e]">Create, fund, and manage live geofenced campaign trails on-chain.</p>
            </div>

            {!address ? (
              <div className="py-12 text-center text-xs text-muted font-mono">
                Please connect your wallet to access the Merchant Center.
              </div>
            ) : isMerchantChecking ? (
              <div className="py-12 flex flex-col justify-center items-center gap-2">
                <div className="w-8 h-8 rounded-full border-2 border-[#2d6a4f] border-t-transparent animate-spin" />
                <span className="text-xs text-muted font-mono">Verifying merchant profile...</span>
              </div>
            ) : !merchant ? (
              /* MERCHANT REGISTRATION VIEW */
              <form onSubmit={registerMerchant} className="flex flex-col gap-4 bg-white p-5 rounded-2xl border border-[rgba(13,13,11,0.08)] shadow-sm">
                <h3 className="text-sm font-bold uppercase tracking-wider text-[#2d6a4f] font-mono">Register Business</h3>
                
                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-[#6b6b5e] uppercase">Business Name</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Nike Art Gallery"
                    value={mName}
                    onChange={(e) => setMName(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#f5f2eb] border border-transparent text-sm focus:border-[#2d6a4f] focus:bg-white outline-none transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-[#6b6b5e] uppercase">Category</label>
                  <select
                    value={mCategory}
                    onChange={(e) => setMCategory(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#f5f2eb] border border-transparent text-sm focus:border-[#2d6a4f] focus:bg-white outline-none transition-all"
                  >
                    <option value="Art & Culture">Art & Culture</option>
                    <option value="Food & Drink">Food & Drink</option>
                    <option value="Music">Music</option>
                    <option value="Retail">Retail</option>
                    <option value="Entertainment">Entertainment</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="text-[10px] font-mono text-[#6b6b5e] uppercase">Street Address</label>
                  <input
                    type="text"
                    placeholder="e.g. 2 Nike Art Gallery Road, Lekki"
                    value={mAddress}
                    onChange={(e) => setMAddress(e.target.value)}
                    className="px-3 py-2 rounded-xl bg-[#f5f2eb] border border-transparent text-sm focus:border-[#2d6a4f] focus:bg-white outline-none transition-all"
                  />
                </div>

                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono text-[#6b6b5e] uppercase">Location Coordinates</label>
                    <button
                      type="button"
                      onClick={() => {
                        if (playerLat && playerLng) {
                          setMLat(playerLat);
                          setMLng(playerLng);
                          addLog(`Autofilled merchant location with GPS: ${playerLat}, ${playerLng}`);
                        }
                      }}
                      className="text-[9px] font-mono text-[#2d6a4f] hover:underline"
                    >
                      Autofill My GPS
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="number"
                      step="0.000001"
                      required
                      placeholder="Latitude"
                      value={mLat}
                      onChange={(e) => setMLat(e.target.value === "" ? "" : Number(e.target.value))}
                      className="px-3 py-2 rounded-xl bg-[#f5f2eb] border border-transparent text-xs font-mono outline-none"
                    />
                    <input
                      type="number"
                      step="0.000001"
                      required
                      placeholder="Longitude"
                      value={mLng}
                      onChange={(e) => setMLng(e.target.value === "" ? "" : Number(e.target.value))}
                      className="px-3 py-2 rounded-xl bg-[#f5f2eb] border border-transparent text-xs font-mono outline-none"
                    />
                  </div>
                </div>

                {/* Map Selector */}
                <div className="flex flex-col gap-1">
                  <span className="text-[10px] font-mono text-muted uppercase">Or Click Map to Place Pin</span>
                  <div className="w-full h-48 rounded-xl overflow-hidden relative">
                    <LeafletMap
                      centerLat={playerLat || LAGOS_COORDS.lat}
                      centerLng={playerLng || LAGOS_COORDS.lng}
                      markers={mLat && mLng ? [{ id: "temp", title: mName || "Your Location", latitude: Number(mLat), longitude: Number(mLng) }] : []}
                      onMapClick={(lat, lng) => {
                        setMLat(lat);
                        setMLng(lng);
                        addLog(`Placed pin: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                      }}
                      interactive={true}
                      zoom={14}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={merchantLoading}
                  className="w-full py-3 rounded-xl bg-[#2d6a4f] text-white font-bold text-xs uppercase tracking-wider hover:bg-[#1e4d37] transition-all mt-2"
                >
                  {merchantLoading ? "Registering..." : "Register Business"}
                </button>
              </form>
            ) : (
              /* MERCHANT CAMPAIGN BUILDER VIEW */
              <div className="flex flex-col gap-6">
                {/* Merchant Card */}
                <div className="bg-[#2d6a4f] text-white p-5 rounded-2xl border border-[rgba(13,13,11,0.08)] shadow-sm relative overflow-hidden flex flex-col gap-2">
                  <div className="absolute top-0 right-0 w-24 h-24 bg-white/5 rounded-full blur-xl translate-x-4 -translate-y-4" />
                  <span className="text-[9px] font-mono bg-white/10 px-2 py-0.5 rounded-full self-start tracking-wider uppercase">
                    {merchant.category}
                  </span>
                  <h3 className="text-lg font-bold font-serif italic mt-1">{merchant.business_name}</h3>
                  <p className="text-[10px] font-mono text-white/70">Merchant Address: {merchant.wallet_address.substring(0, 10)}...{merchant.wallet_address.substring(34)}</p>
                  <p className="text-[10px] font-mono text-white/70">Location: {merchant.latitude.toFixed(5)}, {merchant.longitude.toFixed(5)}</p>
                </div>

                {/* Campaign Creator Form */}
                <div className="bg-white p-5 rounded-2xl border border-[rgba(13,13,11,0.08)] shadow-sm flex flex-col gap-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#2d6a4f] font-mono border-b border-[rgba(13,13,11,0.08)] pb-2">1. Campaign Info</h3>
                  
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-[#6b6b5e] uppercase">Quest Title</label>
                    <input
                      type="text"
                      placeholder="e.g. Lekki Culinary Adventure"
                      value={tTitle}
                      onChange={(e) => setTTitle(e.target.value)}
                      className="px-3 py-2 rounded-xl bg-[#f5f2eb] border border-transparent text-sm focus:border-[#2d6a4f] focus:bg-white outline-none transition-all"
                    />
                  </div>

                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-mono text-[#6b6b5e] uppercase">Description</label>
                    <textarea
                      placeholder="Give a brief overview of what players will experience on this quest."
                      value={tDesc}
                      onChange={(e) => setTDesc(e.target.value)}
                      rows={2}
                      className="px-3 py-2 rounded-xl bg-[#f5f2eb] border border-transparent text-sm focus:border-[#2d6a4f] focus:bg-white outline-none transition-all resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono text-[#6b6b5e] uppercase">Difficulty</label>
                      <select
                        value={tDifficulty}
                        onChange={(e) => setTDifficulty(e.target.value as any)}
                        className="px-3 py-2 rounded-xl bg-[#f5f2eb] text-xs outline-none"
                      >
                        <option value="easy">Easy</option>
                        <option value="medium">Medium</option>
                        <option value="hard">Hard</option>
                      </select>
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono text-[#6b6b5e] uppercase">Category</label>
                      <select
                        value={tCategory}
                        onChange={(e) => setTCategory(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-[#f5f2eb] text-xs outline-none"
                      >
                        <option value="Art & Culture">Art & Culture</option>
                        <option value="Food & Drink">Food & Drink</option>
                        <option value="Music">Music</option>
                        <option value="Retail">Retail</option>
                        <option value="Entertainment">Entertainment</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono text-[#6b6b5e] uppercase">Reward (USDm)</label>
                      <input
                        type="number"
                        step="0.05"
                        value={tReward}
                        onChange={(e) => setTReward(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-[#f5f2eb] text-xs font-mono outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] font-mono text-[#6b6b5e] uppercase">Est. Minutes</label>
                      <input
                        type="number"
                        value={tDuration}
                        onChange={(e) => setTDuration(e.target.value)}
                        className="px-3 py-2 rounded-xl bg-[#f5f2eb] text-xs font-mono outline-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Stops Builder */}
                <div className="bg-white p-5 rounded-2xl border border-[rgba(13,13,11,0.08)] shadow-sm flex flex-col gap-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#2d6a4f] font-mono border-b border-[rgba(13,13,11,0.08)] pb-2 flex justify-between items-center">
                    <span>2. Add Stops ({stopsList.length})</span>
                  </h3>

                  {stopsList.length > 0 && (
                    <div className="flex flex-col gap-2 max-h-48 overflow-y-auto mb-2 border-b border-[rgba(13,13,11,0.04)] pb-3">
                      {stopsList.map((stop, idx) => (
                        <div key={idx} className="flex justify-between items-center p-2 rounded-lg bg-[#f5f2eb] text-xs border border-[rgba(13,13,11,0.04)]">
                          <div className="flex flex-col">
                            <span className="font-bold font-mono">#{idx + 1} {stop.title}</span>
                            <span className="text-[9px] text-[#6b6b5e]">{stop.challenge_type.toUpperCase()} • Radius: {stop.geofence_radius_m}m</span>
                          </div>
                          <button
                            type="button"
                            onClick={() => removeStopFromBuilder(idx)}
                            className="p-1 text-[#e76f51] hover:bg-red-50 rounded-full"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Add Stop Form */}
                  <div className="flex flex-col gap-3 p-3 rounded-xl bg-[#f5f2eb]/50 border border-[rgba(13,13,11,0.06)]">
                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-mono text-[#6b6b5e] uppercase">Stop Name</label>
                      <input
                        type="text"
                        placeholder="e.g. Stop 1: Entrance Arch"
                        value={sTitle}
                        onChange={(e) => setSTitle(e.target.value)}
                        className="px-2 py-1.5 rounded-lg bg-white border border-[rgba(13,13,11,0.08)] text-xs outline-none"
                      />
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[9px] font-mono text-[#6b6b5e] uppercase">Stop Description / Clue</label>
                      <input
                        type="text"
                        placeholder="Describe where this stop is or enter trivia question"
                        value={sDesc}
                        onChange={(e) => setSDesc(e.target.value)}
                        className="px-2 py-1.5 rounded-lg bg-white border border-[rgba(13,13,11,0.08)] text-xs outline-none"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-mono text-[#6b6b5e] uppercase">Challenge Type</label>
                        <select
                          value={sChallengeType}
                          onChange={(e) => setSChallengeType(e.target.value as any)}
                          className="px-2 py-1.5 rounded-lg bg-white border border-[rgba(13,13,11,0.08)] text-xs outline-none"
                        >
                          <option value="qr">Scan QR Code</option>
                          <option value="code">Enter Secret Code</option>
                          <option value="trivia">Solve Trivia Question</option>
                        </select>
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="text-[9px] font-mono text-[#6b6b5e] uppercase">Correct Answer / Payload</label>
                        <input
                          type="text"
                          placeholder={sChallengeType === "qr" ? "e.g. QR_SECRET_KEY" : sChallengeType === "code" ? "e.g. SECRETCODE" : "Answer choice"}
                          value={sChallengePayload}
                          onChange={(e) => setSChallengePayload(e.target.value)}
                          className="px-2 py-1.5 rounded-lg bg-white border border-[rgba(13,13,11,0.08)] text-xs outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-mono text-[#6b6b5e] uppercase">Latitude</label>
                          <button
                            type="button"
                            onClick={() => {
                              if (playerLat) {
                                setSLat(playerLat);
                                addLog(`Stop latitude autofilled: ${playerLat}`);
                              }
                            }}
                            className="text-[8px] font-mono text-[#2d6a4f]"
                          >
                            My GPS
                          </button>
                        </div>
                        <input
                          type="number"
                          step="0.000001"
                          placeholder="Latitude"
                          value={sLat}
                          onChange={(e) => setSLat(e.target.value === "" ? "" : Number(e.target.value))}
                          className="px-2 py-1.5 rounded-lg bg-white border border-[rgba(13,13,11,0.08)] text-xs font-mono outline-none"
                        />
                      </div>
                      <div className="flex flex-col gap-1">
                        <div className="flex justify-between items-center">
                          <label className="text-[9px] font-mono text-[#6b6b5e] uppercase">Longitude</label>
                          <button
                            type="button"
                            onClick={() => {
                              if (playerLng) {
                                setSLng(playerLng);
                                addLog(`Stop longitude autofilled: ${playerLng}`);
                              }
                            }}
                            className="text-[8px] font-mono text-[#2d6a4f]"
                          >
                            My GPS
                          </button>
                        </div>
                        <input
                          type="number"
                          step="0.000001"
                          placeholder="Longitude"
                          value={sLng}
                          onChange={(e) => setSLng(e.target.value === "" ? "" : Number(e.target.value))}
                          className="px-2 py-1.5 rounded-lg bg-white border border-[rgba(13,13,11,0.08)] text-xs font-mono outline-none"
                        />
                      </div>
                    </div>

                    {/* Interactive Stop Map */}
                    <div className="flex flex-col gap-1 mt-1">
                      <span className="text-[9px] font-mono text-muted uppercase">Click map to pin stop location</span>
                      <div className="w-full h-32 rounded-lg overflow-hidden relative">
                        <LeafletMap
                          centerLat={playerLat || LAGOS_COORDS.lat}
                          centerLng={playerLng || LAGOS_COORDS.lng}
                          markers={stopsList.map((s, i) => ({ id: i, title: s.title, latitude: s.latitude, longitude: s.longitude }))}
                          onMapClick={(lat, lng) => {
                            setSLat(lat);
                            setSLng(lng);
                            addLog(`Stop pin dropped at: ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
                          }}
                          interactive={true}
                          zoom={15}
                        />
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={addStopToBuilder}
                      className="w-full py-2 bg-[#f5f2eb] hover:bg-white text-[#2d6a4f] text-[10px] font-mono font-bold uppercase tracking-wider rounded-lg border border-[rgba(13,13,11,0.08)] transition-all mt-1"
                    >
                      + Push Stop to List
                    </button>
                  </div>
                </div>

                {/* On-Chain Deployment Panel */}
                <div className="bg-white p-5 rounded-2xl border border-[rgba(13,13,11,0.08)] shadow-sm flex flex-col gap-4">
                  <h3 className="text-sm font-bold uppercase tracking-wider text-[#2d6a4f] font-mono border-b border-[rgba(13,13,11,0.08)] pb-2">3. Deploy & Escrow</h3>
                  
                  <div className="p-3 bg-[rgba(45,106,79,0.05)] border border-[rgba(45,106,79,0.15)] rounded-xl text-[11px] text-[#6b6b5e] leading-relaxed flex flex-col gap-2">
                    <span className="font-bold text-[#0d0d0b]">Escrow Funding Summary:</span>
                    <div className="flex justify-between items-center border-b border-[rgba(13,13,11,0.05)] pb-1.5">
                      <span>Reward size:</span>
                      <span className="font-mono text-ink">{tReward} USDm</span>
                    </div>
                    <div className="flex justify-between items-center border-b border-[rgba(13,13,11,0.05)] pb-1.5">
                      <span>Testing volume (Players):</span>
                      <span className="font-mono text-ink">5 Players</span>
                    </div>
                    <div className="flex justify-between items-center font-bold text-ink">
                      <span>Total USDm to Escrow:</span>
                      <span className="font-mono text-[#2d6a4f]">{(Number(tReward) * 5).toFixed(2)} USDm</span>
                    </div>
                  </div>

                  {deployStep !== "idle" && (
                    <div className="p-4 bg-[#f5f2eb] rounded-xl border border-[rgba(13,13,11,0.08)] flex flex-col gap-2 text-xs font-mono leading-relaxed">
                      <h4 className="font-bold text-[#2d6a4f] uppercase text-[10px] tracking-wider mb-1">Deployment Steps Progress</h4>
                      
                      <div className="flex flex-col gap-1.5">
                        <div className="flex justify-between items-center">
                          <span>1. DB Record Registration</span>
                          <span className={deployStep === "creating_db" ? "text-[#e9c46a] animate-pulse" : deployStep === "error" ? "text-[#e76f51]" : "text-[#2d6a4f] font-bold"}>
                            {deployStep === "creating_db" ? "RUNNING" : deployStep === "error" ? "FAILED" : "✓ DONE"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>2. On-Chain Contract Registry</span>
                          <span className={deployStep === "creating_onchain" ? "text-[#e9c46a] animate-pulse" : deployStep === "creating_db" ? "text-muted" : deployStep === "error" && deployErrorMsg?.includes("On-chain") ? "text-[#e76f51]" : deployStep === "error" ? "FAILED" : "✓ DONE"}>
                            {deployStep === "creating_onchain" ? "RUNNING" : ["creating_db"].includes(deployStep) ? "PENDING" : deployStep === "error" ? "FAILED" : "✓ DONE"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>3. ERC-20 Budget Allowance</span>
                          <span className={deployStep === "approving" ? "text-[#e9c46a] animate-pulse" : ["creating_db", "creating_onchain"].includes(deployStep) ? "text-muted" : deployStep === "error" ? "FAILED" : "✓ DONE"}>
                            {deployStep === "approving" ? "RUNNING" : ["creating_db", "creating_onchain"].includes(deployStep) ? "PENDING" : deployStep === "error" ? "FAILED" : "✓ DONE"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>4. Lock Escrow Rewards</span>
                          <span className={deployStep === "funding" ? "text-[#e9c46a] animate-pulse" : ["creating_db", "creating_onchain", "approving"].includes(deployStep) ? "text-muted" : deployStep === "error" ? "FAILED" : "✓ DONE"}>
                            {deployStep === "funding" ? "RUNNING" : ["creating_db", "creating_onchain", "approving"].includes(deployStep) ? "PENDING" : deployStep === "error" ? "FAILED" : "✓ DONE"}
                          </span>
                        </div>
                        <div className="flex justify-between items-center">
                          <span>5. Publish Campaign Active</span>
                          <span className={deployStep === "activating" ? "text-[#e9c46a] animate-pulse" : ["creating_db", "creating_onchain", "approving", "funding"].includes(deployStep) ? "text-muted" : deployStep === "error" ? "FAILED" : "✓ DONE"}>
                            {deployStep === "activating" ? "RUNNING" : ["creating_db", "creating_onchain", "approving", "funding"].includes(deployStep) ? "PENDING" : deployStep === "error" ? "FAILED" : "✓ DONE"}
                          </span>
                        </div>
                      </div>

                      {deployErrorMsg && (
                        <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-700 text-[10px]">
                          <b>Error Details:</b> {deployErrorMsg}
                        </div>
                      )}

                      {deployTxHash && (
                        <a
                          href={`https://celo-sepolia.blockscout.com/tx/${deployTxHash}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-1 text-[9px] text-[#2d6a4f] underline hover:text-[#1e4d37]"
                        >
                          View Transaction on Blockscout
                        </a>
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={deployMerchantCampaign}
                    disabled={deployStep !== "idle" && deployStep !== "done" && deployStep !== "error"}
                    className="w-full py-3 bg-[#2d6a4f] text-white hover:bg-[#1e4d37] font-bold text-xs uppercase tracking-wider rounded-xl transition-all"
                  >
                    {deployStep === "idle" ? "Deploy & Fund Campaign" : deployStep === "done" ? "Deploy Another Campaign" : "Retry Deployment"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* ─── Bottom Navigation Bar ────────────────────────────────────────────── */}
      <nav className="fixed bottom-0 left-0 right-0 mx-auto w-full max-w-[480px] bg-white border-t border-[rgba(13,13,11,0.08)] grid grid-cols-5 py-2.5 z-20">
        <button
          onClick={() => setActiveTab("explore")}
          className={`flex flex-col items-center gap-1 text-[9px] font-mono tracking-wider ${
            activeTab === "explore" ? "text-[#2d6a4f]" : "text-[#6b6b5e]"
          }`}
        >
          <Compass className="w-5 h-5" />
          EXPLORE
        </button>

        <button
          onClick={() => setActiveTab("quest")}
          className={`flex flex-col items-center gap-1 text-[9px] font-mono tracking-wider relative ${
            activeTab === "quest" ? "text-[#2d6a4f]" : "text-[#6b6b5e]"
          }`}
        >
          <MapPin className="w-5 h-5" />
          ACTIVE QUEST
          {activeTrail && !questClaimed && (
            <span className="absolute top-0 right-7 w-2 h-2 rounded-full bg-[#e76f51] animate-ping" />
          )}
        </button>

        <button
          onClick={() => setActiveTab("merchant")}
          className={`flex flex-col items-center gap-1 text-[9px] font-mono tracking-wider ${
            activeTab === "merchant" ? "text-[#2d6a4f]" : "text-[#6b6b5e]"
          }`}
        >
          <Sliders className="w-5 h-5" />
          MERCHANT
        </button>

        <button
          onClick={() => setActiveTab("leaderboard")}
          className={`flex flex-col items-center gap-1 text-[9px] font-mono tracking-wider ${
            activeTab === "leaderboard" ? "text-[#2d6a4f]" : "text-[#6b6b5e]"
          }`}
        >
          <Trophy className="w-5 h-5" />
          LEADERS
        </button>

        <button
          onClick={() => setActiveTab("profile")}
          className={`flex flex-col items-center gap-1 text-[9px] font-mono tracking-wider ${
            activeTab === "profile" ? "text-[#2d6a4f]" : "text-[#6b6b5e]"
          }`}
        >
          <User className="w-5 h-5" />
          MY BOX
        </button>
      </nav>

      {/* ─── Developer Proximity Simulator Drawer ─────────────────────────────── */}
      {isDevDrawerOpen && (
        <div className="absolute inset-0 bg-black/60 z-30 flex justify-end animate-fadeIn">
          <div className="w-[85%] max-w-[380px] h-full bg-[#0d0d0b] text-[#f5f2eb] p-5 overflow-y-auto flex flex-col gap-5 border-l border-[rgba(245,242,235,0.12)]">
            <div className="flex justify-between items-center border-b border-[rgba(245,242,235,0.12)] pb-3">
              <div className="flex items-center gap-2">
                <Sliders className="w-5 h-5 text-[#e9c46a]" />
                <span className="font-bold text-sm tracking-wider uppercase font-mono">Dev Simulator</span>
              </div>
              <button 
                onClick={() => setIsDevDrawerOpen(false)}
                className="p-1 rounded-full hover:bg-[rgba(245,242,235,0.12)]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* GPS Spoofing Controls */}
            <div className="flex flex-col gap-2.5">
              <h5 className="text-xs font-bold uppercase tracking-wider text-[#e9c46a] font-mono">Player Location</h5>
              
              <div className="flex gap-2">
                <button
                  onClick={() => setUseRealGps(true)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-mono border transition-all ${
                    useRealGps 
                      ? "bg-[#2d6a4f] border-[#2d6a4f] text-white" 
                      : "border-[rgba(245,242,235,0.2)] hover:border-[#f5f2eb]"
                  }`}
                >
                  REAL GPS
                </button>
                <button
                  onClick={() => setUseRealGps(false)}
                  className={`flex-1 py-1.5 rounded-lg text-[10px] font-mono border transition-all ${
                    !useRealGps 
                      ? "bg-[#2d6a4f] border-[#2d6a4f] text-white" 
                      : "border-[rgba(245,242,235,0.2)] hover:border-[#f5f2eb]"
                  }`}
                >
                  MANUAL/SPOOF
                </button>
              </div>

              {!useRealGps && (
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-mono text-muted">LATITUDE</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={playerLat}
                        onChange={(e) => setPlayerLat(parseFloat(e.target.value))}
                        className="px-2.5 py-1.5 rounded-lg bg-[#f5f2eb] text-[#0d0d0b] text-[11px] font-mono w-full"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="text-[8px] font-mono text-muted">LONGITUDE</label>
                      <input
                        type="number"
                        step="0.0001"
                        value={playerLng}
                        onChange={(e) => setPlayerLng(parseFloat(e.target.value))}
                        className="px-2.5 py-1.5 rounded-lg bg-[#f5f2eb] text-[#0d0d0b] text-[11px] font-mono w-full"
                      />
                    </div>
                  </div>

                  {/* Teleport Presets */}
                  <div className="flex flex-col gap-1.5 mt-1">
                    <span className="text-[8px] font-mono text-muted">LAGOS LOCATION PRESETS</span>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        onClick={() => { setPlayerLat(6.4314); setPlayerLng(3.4144); addLog("Simulated Terra Kulture"); }}
                        className="px-2 py-1 rounded bg-[rgba(245,242,235,0.1)] text-[9px] font-mono hover:bg-[rgba(245,242,235,0.2)]"
                      >
                        Terra Kulture (6.4314, 3.4144)
                      </button>
                      <button
                        onClick={() => { setPlayerLat(6.4344); setPlayerLng(3.4794); addLog("Simulated Nike Gallery"); }}
                        className="px-2 py-1 rounded bg-[rgba(245,242,235,0.1)] text-[9px] font-mono hover:bg-[rgba(245,242,235,0.2)]"
                      >
                        Nike Gallery (6.4344, 3.4794)
                      </button>
                      <button
                        onClick={() => { setPlayerLat(6.4488); setPlayerLng(3.4396); addLog("Simulated Bogobiri"); }}
                        className="px-2 py-1 rounded bg-[rgba(245,242,235,0.1)] text-[9px] font-mono hover:bg-[rgba(245,242,235,0.2)]"
                      >
                        Bogobiri (6.4488, 3.4396)
                      </button>
                      <button
                        onClick={() => { setPlayerLat(6.4294); setPlayerLng(3.4201); addLog("Simulated Yellow Chilli"); }}
                        className="px-2 py-1 rounded bg-[rgba(245,242,235,0.1)] text-[9px] font-mono hover:bg-[rgba(245,242,235,0.2)]"
                      >
                        Yellow Chilli (6.4294, 3.4201)
                      </button>
                      <button
                        onClick={() => { setPlayerLat(6.4503); setPlayerLng(3.4231); addLog("Simulated Jazzhole"); }}
                        className="px-2 py-1 rounded bg-[rgba(245,242,235,0.1)] text-[9px] font-mono hover:bg-[rgba(245,242,235,0.2)]"
                      >
                        Jazzhole (6.4503, 3.4231)
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Config overrides */}
            <div className="flex flex-col gap-2.5 border-t border-[rgba(245,242,235,0.12)] pt-4">
              <h5 className="text-xs font-bold uppercase tracking-wider text-[#e9c46a] font-mono">Endpoints & Smart Contracts</h5>
              
              <div className="flex flex-col gap-2 text-[10px] font-mono">
                <div className="flex flex-col gap-1">
                  <label className="text-muted">BACKEND API BASE URL</label>
                  <input
                    type="text"
                    value={apiBaseUrl}
                    onChange={(e) => setApiBaseUrl(e.target.value)}
                    className="px-2 py-1 rounded bg-[rgba(245,242,235,0.06)] border border-[rgba(245,242,235,0.15)] text-[10px]"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-muted">TRAIL REGISTRY ADDRESS</label>
                  <input
                    type="text"
                    value={trailContractAddress}
                    onChange={(e) => setTrailContractAddress(e.target.value)}
                    className="px-2 py-1 rounded bg-[rgba(245,242,235,0.06)] border border-[rgba(245,242,235,0.15)] text-[10px]"
                  />
                </div>
                
                {/* Reset Database Button */}
                <button
                  onClick={resetDatabase}
                  className="mt-2 py-2 rounded bg-[#e76f51] hover:bg-[#d85c3f] text-white font-bold text-xs uppercase tracking-wider transition-all"
                >
                  Reset / Reseed Database
                </button>
              </div>
            </div>

            {/* Live Telemetry / Debug Console */}
            <div className="flex-1 flex flex-col gap-2 border-t border-[rgba(245,242,235,0.12)] pt-4 overflow-hidden">
              <h5 className="text-xs font-bold uppercase tracking-wider text-[#e9c46a] font-mono flex justify-between items-center">
                <span>Console Logs</span>
                <button 
                  onClick={() => setDebugLogs([])} 
                  className="text-[8px] text-muted hover:underline"
                >
                  CLEAR
                </button>
              </h5>

              <div className="flex-1 bg-[rgba(245,242,235,0.04)] rounded-lg p-3 font-mono text-[9px] text-[#6b6b5e] overflow-y-auto leading-relaxed flex flex-col-reverse gap-1 select-text">
                {debugLogs.length === 0 ? (
                  <span className="italic">No events recorded. Teleport, scan, or verify to see logs.</span>
                ) : (
                  debugLogs.map((log, index) => (
                    <span key={index} className="block whitespace-pre-wrap">{log}</span>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
