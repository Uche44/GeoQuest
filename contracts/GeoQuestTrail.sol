// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import "./GeoQuestStamp.sol";

/**
 * @title GeoQuestTrail
 * @dev Handles trail registration, reward escrow in whitelisted stablecoins, and verification of claims via backend signature.
 */
contract GeoQuestTrail is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    struct Trail {
        uint256 id;
        address merchant;
        address rewardToken;
        uint256 rewardPerPlayer;
        uint256 totalBudget;
        uint256 remainingBudget;
        bool active;
    }

    // Reference to the ERC-1155 Stamp NFT contract
    GeoQuestStamp public stampContract;

    // Address of the authorized backend signer
    address public backendSigner;

    // Counter for trail IDs
    uint256 public nextTrailId;

    // Mapping of trail ID to Trail struct
    mapping(uint256 => Trail) public trails;

    // Tracks if a user has completed a specific trail
    mapping(address => mapping(uint256 => bool)) public hasCompletedTrail;

    // Tracks used signatures/nonces to prevent replay attacks
    mapping(bytes32 => bool) public usedNonces;

    // Whitelisted tokens for rewards (e.g. USDm, USDC, USDT)
    mapping(address => bool) public isTokenWhitelisted;

    event TrailCreated(uint256 indexed trailId, address indexed merchant, address indexed rewardToken, uint256 rewardPerPlayer);
    event TrailFunded(uint256 indexed trailId, uint256 amount);
    event TrailStatusChanged(uint256 indexed trailId, bool active);
    event RewardClaimed(address indexed player, uint256 indexed trailId, uint256 amount, uint256 stampId);
    event FundsWithdrawn(uint256 indexed trailId, address indexed merchant, uint256 amount);
    event BackendSignerChanged(address indexed oldSigner, address indexed newSigner);
    event StampContractChanged(address indexed oldContract, address indexed newContract);
    event TokenWhitelistChanged(address indexed token, bool whitelisted);

    modifier onlyTrailMerchant(uint256 trailId) {
        require(trails[trailId].merchant == msg.sender, "GeoQuestTrail: Caller is not the trail merchant");
        _;
    }

    constructor(address _backendSigner, address _stampContract) Ownable(msg.sender) {
        require(_backendSigner != address(0), "GeoQuestTrail: Signer cannot be zero address");
        backendSigner = _backendSigner;
        stampContract = GeoQuestStamp(_stampContract);
        emit BackendSignerChanged(address(0), _backendSigner);
        emit StampContractChanged(address(0), _stampContract);
    }

    /**
     * @dev Sets whitelist status of a reward token.
     */
    function setTokenWhitelist(address token, bool whitelisted) external onlyOwner {
        require(token != address(0), "GeoQuestTrail: Token cannot be zero address");
        isTokenWhitelisted[token] = whitelisted;
        emit TokenWhitelistChanged(token, whitelisted);
    }

    /**
     * @dev Set the authorized backend signer address.
     */
    function setBackendSigner(address _backendSigner) external onlyOwner {
        require(_backendSigner != address(0), "GeoQuestTrail: Signer cannot be zero address");
        emit BackendSignerChanged(backendSigner, _backendSigner);
        backendSigner = _backendSigner;
    }

    /**
     * @dev Set the stamp contract address.
     */
    function setStampContract(address _stampContract) external onlyOwner {
        require(_stampContract != address(0), "GeoQuestTrail: Contract cannot be zero address");
        emit StampContractChanged(address(stampContract), _stampContract);
        stampContract = GeoQuestStamp(_stampContract);
    }

    /**
     * @dev Creates a new quest trail.
     */
    function createTrail(
        address rewardToken,
        uint256 rewardPerPlayer
    ) external returns (uint256) {
        require(isTokenWhitelisted[rewardToken], "GeoQuestTrail: Token is not whitelisted");
        require(rewardPerPlayer > 0, "GeoQuestTrail: Reward must be greater than zero");

        uint256 trailId = nextTrailId++;
        trails[trailId] = Trail({
            id: trailId,
            merchant: msg.sender,
            rewardToken: rewardToken,
            rewardPerPlayer: rewardPerPlayer,
            totalBudget: 0,
            remainingBudget: 0,
            active: false
        });

        emit TrailCreated(trailId, msg.sender, rewardToken, rewardPerPlayer);
        return trailId;
    }

    /**
     * @dev Funds an existing trail by transferring stablecoins into escrow.
     */
    function fundTrail(uint256 trailId, uint256 amount) external nonReentrant {
        Trail storage trail = trails[trailId];
        require(trail.merchant != address(0), "GeoQuestTrail: Trail does not exist");
        require(amount > 0, "GeoQuestTrail: Funding amount must be greater than zero");

        IERC20(trail.rewardToken).safeTransferFrom(msg.sender, address(this), amount);
        
        trail.totalBudget += amount;
        trail.remainingBudget += amount;

        emit TrailFunded(trailId, amount);
    }

    /**
     * @dev Toggles active status of a trail.
     */
    function setTrailActive(uint256 trailId, bool active) external nonReentrant {
        Trail storage trail = trails[trailId];
        require(trail.merchant != address(0), "GeoQuestTrail: Trail does not exist");
        require(msg.sender == trail.merchant || msg.sender == owner(), "GeoQuestTrail: Unauthorized");

        trail.active = active;
        emit TrailStatusChanged(trailId, active);
    }

    /**
     * @dev Claims the reward for completing a trail, verified by a backend signature.
     */
    function claimReward(
        uint256 trailId,
        uint256 rewardAmount,
        bytes32 nonce,
        bytes calldata signature
    ) external nonReentrant {
        Trail storage trail = trails[trailId];
        require(trail.active, "GeoQuestTrail: Trail is not active");
        require(!hasCompletedTrail[msg.sender][trailId], "GeoQuestTrail: Trail already completed");
        require(!usedNonces[nonce], "GeoQuestTrail: Nonce already used");
        require(trail.remainingBudget >= rewardAmount, "GeoQuestTrail: Insufficient reward pool balance");
        require(rewardAmount == trail.rewardPerPlayer, "GeoQuestTrail: Claim amount does not match trail reward");

        // Verify the backend signature
        bytes32 messageHash = keccak256(abi.encodePacked(msg.sender, trailId, rewardAmount, nonce));
        bytes32 ethSignedMessageHash = MessageHashUtils.toEthSignedMessageHash(messageHash);
        address recoveredSigner = ECDSA.recover(ethSignedMessageHash, signature);
        
        require(recoveredSigner == backendSigner, "GeoQuestTrail: Invalid signature");

        // Mark nonce and completion status
        usedNonces[nonce] = true;
        hasCompletedTrail[msg.sender][trailId] = true;
        trail.remainingBudget -= rewardAmount;

        // Transfer stablecoin rewards
        IERC20(trail.rewardToken).safeTransfer(msg.sender, rewardAmount);

        // Mint stamp NFT
        stampContract.mintStamp(msg.sender, trailId, 1, "");

        emit RewardClaimed(msg.sender, trailId, rewardAmount, trailId);
    }

    /**
     * @dev Allows merchant to withdraw remaining funds and pause the trail.
     */
    function withdrawRemainingFunds(uint256 trailId) external onlyTrailMerchant(trailId) nonReentrant {
        Trail storage trail = trails[trailId];
        uint256 withdrawAmount = trail.remainingBudget;
        require(withdrawAmount > 0, "GeoQuestTrail: No remaining budget to withdraw");

        trail.remainingBudget = 0;
        trail.active = false;

        IERC20(trail.rewardToken).safeTransfer(msg.sender, withdrawAmount);

        emit TrailStatusChanged(trailId, false);
        emit FundsWithdrawn(trailId, msg.sender, withdrawAmount);
    }
}
