// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title GeoQuestStamp
 * @dev ERC1155 multi-token contract representing location stamps and achievements.
 * Mints are authorized by GeoQuestTrail or other designated minters.
 */
contract GeoQuestStamp is ERC1155, Ownable {
    // Custom URIs for specific token IDs
    mapping(uint256 => string) private _tokenURIs;
    
    // Whitelisted addresses allowed to mint stamps
    mapping(address => bool) public isMinter;

    event MinterStatusChanged(address indexed minter, bool isMinter);
    event TokenURIChanged(uint256 indexed tokenId, string newURI);

    modifier onlyMinter() {
        require(isMinter[msg.sender] || msg.sender == owner(), "GeoQuestStamp: Caller is not a minter or owner");
        _;
    }

    constructor(string memory baseUri) ERC1155(baseUri) Ownable(msg.sender) {
        isMinter[msg.sender] = true;
        emit MinterStatusChanged(msg.sender, true);
    }

    /**
     * @dev Set minter status for an address.
     */
    function setMinter(address minter, bool status) external onlyOwner {
        isMinter[minter] = status;
        emit MinterStatusChanged(minter, status);
    }

    /**
     * @dev Mints a stamp to an address.
     */
    function mintStamp(
        address to,
        uint256 id,
        uint256 amount,
        bytes memory data
    ) external onlyMinter {
        _mint(to, id, amount, data);
    }

    /**
     * @dev Mints multiple stamps in batch.
     */
    function batchMint(
        address to,
        uint256[] memory ids,
        uint256[] memory amounts,
        bytes memory data
    ) external onlyMinter {
        _mintBatch(to, ids, amounts, data);
    }

    /**
     * @dev Sets a custom URI for a specific token.
     */
    function setTokenURI(uint256 tokenId, string calldata newURI) external onlyOwner {
        _tokenURIs[tokenId] = newURI;
        emit TokenURIChanged(tokenId, newURI);
    }

    /**
     * @dev Sets the base URI for all tokens.
     */
    function setBaseURI(string calldata newBaseURI) external onlyOwner {
        _setURI(newBaseURI);
    }

    /**
     * @dev Returns the URI for a given token ID.
     */
    function uri(uint256 tokenId) public view override returns (string memory) {
        string memory customUri = _tokenURIs[tokenId];
        if (bytes(customUri).length > 0) {
            return customUri;
        }
        return super.uri(tokenId);
    }
}
