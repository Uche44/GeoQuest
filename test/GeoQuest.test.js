import { expect } from "chai";
import pkg from "hardhat";
const { ethers } = pkg;

describe("GeoQuest Smart Contracts", function () {
  let mockToken;
  let stampContract;
  let trailContract;
  let owner;
  let merchant;
  let player;
  let backendSigner;
  let rewardPerPlayer;

  beforeEach(async function () {
    // Get signers
    [owner, merchant, player, backendSigner] = await ethers.getSigners();

    rewardPerPlayer = ethers.parseEther("0.1"); // 0.1 tokens

    // Deploy Mock Token
    const MockToken = await ethers.getContractFactory("MockToken");
    mockToken = await MockToken.deploy("Mock Stablecoin", "MUSD");
    await mockToken.waitForDeployment();

    // Deploy Stamp Contract
    const GeoQuestStamp = await ethers.getContractFactory("GeoQuestStamp");
    stampContract = await GeoQuestStamp.deploy("https://api.geoquest.xyz/stamps/{id}");
    await stampContract.waitForDeployment();

    // Deploy Trail Contract
    const GeoQuestTrail = await ethers.getContractFactory("GeoQuestTrail");
    trailContract = await GeoQuestTrail.deploy(backendSigner.address, await stampContract.getAddress());
    await trailContract.waitForDeployment();

    // Authorize Trail Contract in Stamp Contract to mint NFTs
    await stampContract.setMinter(await trailContract.getAddress(), true);

    // Whitelist token in Trail Contract
    await trailContract.setTokenWhitelist(await mockToken.getAddress(), true);
  });

  describe("Setup & Configurations", function () {
    it("Should initialize with correct addresses", async function () {
      expect(await trailContract.backendSigner()).to.equal(backendSigner.address);
      expect(await trailContract.stampContract()).to.equal(await stampContract.getAddress());
    });

    it("Should allow owner to whitelist tokens", async function () {
      expect(await trailContract.isTokenWhitelisted(await mockToken.getAddress())).to.be.true;
      
      const randomTokenAddress = ethers.Wallet.createRandom().address;
      await trailContract.setTokenWhitelist(randomTokenAddress, true);
      expect(await trailContract.isTokenWhitelisted(randomTokenAddress)).to.be.true;
    });

    it("Should prevent non-owners from modifying configurations", async function () {
      const nonOwner = merchant;
      await expect(
        trailContract.connect(nonOwner).setBackendSigner(player.address)
      ).to.be.revertedWithCustomError(trailContract, "OwnableUnauthorizedAccount");
    });
  });

  describe("Trail Creation & Funding", function () {
    let trailId;

    beforeEach(async function () {
      // Merchant creates a trail
      const tx = await trailContract.connect(merchant).createTrail(await mockToken.getAddress(), rewardPerPlayer);
      const receipt = await tx.wait();
      
      // The event is: TrailCreated(uint256 indexed trailId, address indexed merchant, address indexed rewardToken, uint256 rewardPerPlayer)
      // Retrieve the trail ID from the event parameters
      const event = receipt.logs.find(log => {
        try {
          const parsed = trailContract.interface.parseLog(log);
          return parsed.name === "TrailCreated";
        } catch {
          return false;
        }
      });
      const parsedEvent = trailContract.interface.parseLog(event);
      trailId = parsedEvent.args[0];
    });

    it("Should create a trail in inactive state with 0 budget", async function () {
      const trail = await trailContract.trails(trailId);
      expect(trail.merchant).to.equal(merchant.address);
      expect(trail.rewardToken).to.equal(await mockToken.getAddress());
      expect(trail.rewardPerPlayer).to.equal(rewardPerPlayer);
      expect(trail.totalBudget).to.equal(0n);
      expect(trail.remainingBudget).to.equal(0n);
      expect(trail.active).to.be.false;
    });

    it("Should allow merchant to fund and activate the trail", async function () {
      const fundAmount = ethers.parseEther("10"); // Fund with 10 tokens
      
      // Mint tokens to merchant and approve the trail contract
      await mockToken.mint(merchant.address, fundAmount);
      await mockToken.connect(merchant).approve(await trailContract.getAddress(), fundAmount);

      // Fund
      await expect(trailContract.connect(merchant).fundTrail(trailId, fundAmount))
        .to.emit(trailContract, "TrailFunded")
        .withArgs(trailId, fundAmount);

      // Activate
      await expect(trailContract.connect(merchant).setTrailActive(trailId, true))
        .to.emit(trailContract, "TrailStatusChanged")
        .withArgs(trailId, true);

      const trail = await trailContract.trails(trailId);
      expect(trail.totalBudget).to.equal(fundAmount);
      expect(trail.remainingBudget).to.equal(fundAmount);
      expect(trail.active).to.be.true;
    });
  });

  describe("Claiming Rewards & Stamps", function () {
    let trailId;
    let fundAmount;

    beforeEach(async function () {
      // Create, fund, and activate trail
      const tx = await trailContract.connect(merchant).createTrail(await mockToken.getAddress(), rewardPerPlayer);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = trailContract.interface.parseLog(log);
          return parsed.name === "TrailCreated";
        } catch {
          return false;
        }
      });
      const parsedEvent = trailContract.interface.parseLog(event);
      trailId = parsedEvent.args[0];

      fundAmount = ethers.parseEther("1.0"); // 1 token = 10 claims
      await mockToken.mint(merchant.address, fundAmount);
      await mockToken.connect(merchant).approve(await trailContract.getAddress(), fundAmount);
      await trailContract.connect(merchant).fundTrail(trailId, fundAmount);
      await trailContract.connect(merchant).setTrailActive(trailId, true);
    });

    it("Should allow a player to claim reward with a valid backend signature", async function () {
      const nonce = ethers.randomBytes(32);
      
      // Prepare backend signature
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "bytes32"],
        [player.address, trailId, rewardPerPlayer, nonce]
      );
      const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));

      // Player claims reward
      const initialBalance = await mockToken.balanceOf(player.address);
      
      await expect(trailContract.connect(player).claimReward(trailId, rewardPerPlayer, nonce, signature))
        .to.emit(trailContract, "RewardClaimed")
        .withArgs(player.address, trailId, rewardPerPlayer, trailId);

      // Verify token reward received
      const finalBalance = await mockToken.balanceOf(player.address);
      expect(finalBalance - initialBalance).to.equal(rewardPerPlayer);

      // Verify NFT stamp minted
      const nftBalance = await stampContract.balanceOf(player.address, trailId);
      expect(nftBalance).to.equal(1n);

      // Verify trail remaining budget updated
      const trail = await trailContract.trails(trailId);
      expect(trail.remainingBudget).to.equal(fundAmount - rewardPerPlayer);

      // Verify player marked as completed
      expect(await trailContract.hasCompletedTrail(player.address, trailId)).to.be.true;

      // Verify nonce is used
      expect(await trailContract.usedNonces(nonce)).to.be.true;
    });

    it("Should fail if the signature is invalid or signed by wrong address", async function () {
      const nonce = ethers.randomBytes(32);
      
      // Sign with player's key instead of backend signer key
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "bytes32"],
        [player.address, trailId, rewardPerPlayer, nonce]
      );
      const invalidSignature = await player.signMessage(ethers.getBytes(messageHash));

      await expect(
        trailContract.connect(player).claimReward(trailId, rewardPerPlayer, nonce, invalidSignature)
      ).to.be.revertedWith("GeoQuestTrail: Invalid signature");
    });

    it("Should fail if the player tries to claim twice", async function () {
      const nonce1 = ethers.randomBytes(32);
      const messageHash1 = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "bytes32"],
        [player.address, trailId, rewardPerPlayer, nonce1]
      );
      const signature1 = await backendSigner.signMessage(ethers.getBytes(messageHash1));

      // First claim succeeds
      await trailContract.connect(player).claimReward(trailId, rewardPerPlayer, nonce1, signature1);

      // Second claim with a new nonce fails because user has completed the trail
      const nonce2 = ethers.randomBytes(32);
      const messageHash2 = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "bytes32"],
        [player.address, trailId, rewardPerPlayer, nonce2]
      );
      const signature2 = await backendSigner.signMessage(ethers.getBytes(messageHash2));

      await expect(
        trailContract.connect(player).claimReward(trailId, rewardPerPlayer, nonce2, signature2)
      ).to.be.revertedWith("GeoQuestTrail: Trail already completed");
    });

    it("Should fail if the player tries to reuse the same nonce", async function () {
      const nonce = ethers.randomBytes(32);
      
      const messageHash1 = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "bytes32"],
        [player.address, trailId, rewardPerPlayer, nonce]
      );
      const signature1 = await backendSigner.signMessage(ethers.getBytes(messageHash1));

      // Player 1 claims
      await trailContract.connect(player).claimReward(trailId, rewardPerPlayer, nonce, signature1);

      // Player 2 tries to use the same nonce (even if signed for player 2)
      const anotherPlayer = owner;
      const messageHash2 = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "bytes32"],
        [anotherPlayer.address, trailId, rewardPerPlayer, nonce]
      );
      const signature2 = await backendSigner.signMessage(ethers.getBytes(messageHash2));

      await expect(
        trailContract.connect(anotherPlayer).claimReward(trailId, rewardPerPlayer, nonce, signature2)
      ).to.be.revertedWith("GeoQuestTrail: Nonce already used");
    });

    it("Should fail if trail is inactive", async function () {
      // Deactivate trail
      await trailContract.connect(merchant).setTrailActive(trailId, false);

      const nonce = ethers.randomBytes(32);
      const messageHash = ethers.solidityPackedKeccak256(
        ["address", "uint256", "uint256", "bytes32"],
        [player.address, trailId, rewardPerPlayer, nonce]
      );
      const signature = await backendSigner.signMessage(ethers.getBytes(messageHash));

      await expect(
        trailContract.connect(player).claimReward(trailId, rewardPerPlayer, nonce, signature)
      ).to.be.revertedWith("GeoQuestTrail: Trail is not active");
    });
  });

  describe("Merchant Funds Withdrawal", function () {
    let trailId;
    let fundAmount;

    beforeEach(async function () {
      // Create, fund, and activate trail
      const tx = await trailContract.connect(merchant).createTrail(await mockToken.getAddress(), rewardPerPlayer);
      const receipt = await tx.wait();
      
      const event = receipt.logs.find(log => {
        try {
          const parsed = trailContract.interface.parseLog(log);
          return parsed.name === "TrailCreated";
        } catch {
          return false;
        }
      });
      const parsedEvent = trailContract.interface.parseLog(event);
      trailId = parsedEvent.args[0];

      fundAmount = ethers.parseEther("5.0");
      await mockToken.mint(merchant.address, fundAmount);
      await mockToken.connect(merchant).approve(await trailContract.getAddress(), fundAmount);
      await trailContract.connect(merchant).fundTrail(trailId, fundAmount);
    });

    it("Should allow the merchant to withdraw remaining funds", async function () {
      const initialBalance = await mockToken.balanceOf(merchant.address);

      // Withdraw remaining budget
      await expect(trailContract.connect(merchant).withdrawRemainingFunds(trailId))
        .to.emit(trailContract, "FundsWithdrawn")
        .withArgs(trailId, merchant.address, fundAmount);

      const finalBalance = await mockToken.balanceOf(merchant.address);
      expect(finalBalance - initialBalance).to.equal(fundAmount);

      const trail = await trailContract.trails(trailId);
      expect(trail.remainingBudget).to.equal(0n);
      expect(trail.active).to.be.false; // Should deactivate trail
    });

    it("Should prevent non-merchants from withdrawing remaining funds", async function () {
      await expect(
        trailContract.connect(player).withdrawRemainingFunds(trailId)
      ).to.be.revertedWith("GeoQuestTrail: Caller is not the trail merchant");
    });
  });
});
