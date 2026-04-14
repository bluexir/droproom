// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Address} from "@openzeppelin/contracts/utils/Address.sol";
import {ERC1155} from "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import {ERC1155Pausable} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Pausable.sol";
import {ERC1155Supply} from "@openzeppelin/contracts/token/ERC1155/extensions/ERC1155Supply.sol";
import {ERC2981} from "@openzeppelin/contracts/token/common/ERC2981.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract DroproomDrops is ERC1155, ERC1155Supply, ERC1155Pausable, ERC2981, Ownable, ReentrancyGuard {
    using Address for address payable;

    uint16 public constant MAX_EDITION_SUPPLY = 999;
    uint96 public constant PLATFORM_FEE_BPS = 1_000;
    uint96 public constant MAX_ROYALTY_BPS = 1_000;
    uint96 private constant BPS_DENOMINATOR = 10_000;

    struct Drop {
        address creator;
        uint16 maxSupply;
        uint128 price;
        bool active;
        string metadataURI;
    }

    uint256 public nextTokenId = 1;
    address payable public platformWallet;
    string private _contractMetadataURI;

    mapping(uint256 tokenId => Drop) public drops;

    event DropCreated(
        uint256 indexed tokenId,
        address indexed creator,
        string metadataURI,
        uint256 maxSupply,
        uint256 price
    );
    event DropMinted(
        uint256 indexed tokenId,
        address indexed collector,
        uint256 quantity,
        uint256 totalMinted,
        uint256 paid,
        uint256 platformFee
    );
    event DropActiveSet(uint256 indexed tokenId, bool active);
    event DropMetadataUpdated(uint256 indexed tokenId, string metadataURI);
    event PlatformWalletUpdated(address indexed platformWallet);
    event ContractURIUpdated(string contractURI);

    error InvalidAddress();
    error InvalidSupply();
    error InvalidMetadataURI();
    error InvalidQuantity();
    error DropDoesNotExist();
    error DropInactive();
    error SoldOut();
    error WrongPayment();
    error RoyaltyTooHigh();
    error MetadataLocked();
    error NotDropCreatorOrOwner();

    constructor(address payable initialPlatformWallet, string memory initialContractURI)
        ERC1155("")
        Ownable(msg.sender)
    {
        if (initialPlatformWallet == address(0)) revert InvalidAddress();
        platformWallet = initialPlatformWallet;
        _contractMetadataURI = initialContractURI;
        emit PlatformWalletUpdated(initialPlatformWallet);
        emit ContractURIUpdated(initialContractURI);
    }

    function createDrop(
        string calldata metadataURI,
        uint16 maxSupply,
        uint128 price,
        uint96 royaltyBps
    ) external whenNotPaused returns (uint256 tokenId) {
        if (bytes(metadataURI).length == 0) revert InvalidMetadataURI();
        if (maxSupply == 0 || maxSupply > MAX_EDITION_SUPPLY) revert InvalidSupply();
        if (royaltyBps > MAX_ROYALTY_BPS) revert RoyaltyTooHigh();

        tokenId = nextTokenId++;
        drops[tokenId] = Drop({
            creator: msg.sender,
            maxSupply: maxSupply,
            price: price,
            active: true,
            metadataURI: metadataURI
        });

        if (royaltyBps > 0) {
            _setTokenRoyalty(tokenId, msg.sender, royaltyBps);
        }

        emit DropCreated(tokenId, msg.sender, metadataURI, maxSupply, price);
    }

    function mint(uint256 tokenId, uint256 quantity) external payable nonReentrant whenNotPaused {
        Drop memory drop = _requireDrop(tokenId);
        if (!drop.active) revert DropInactive();
        if (quantity == 0) revert InvalidQuantity();

        uint256 minted = totalSupply(tokenId);
        if (minted + quantity > drop.maxSupply) revert SoldOut();

        uint256 requiredValue = uint256(drop.price) * quantity;
        if (msg.value != requiredValue) revert WrongPayment();

        _mint(msg.sender, tokenId, quantity, "");

        uint256 platformFee = 0;
        if (msg.value > 0) {
            platformFee = (msg.value * PLATFORM_FEE_BPS) / BPS_DENOMINATOR;
            if (platformFee > 0) {
                platformWallet.sendValue(platformFee);
            }
            payable(drop.creator).sendValue(msg.value - platformFee);
        }

        emit DropMinted(tokenId, msg.sender, quantity, minted + quantity, msg.value, platformFee);
    }

    function setDropActive(uint256 tokenId, bool active) external {
        _requireDropCreatorOrOwner(tokenId);
        drops[tokenId].active = active;
        emit DropActiveSet(tokenId, active);
    }

    function updateDropMetadata(uint256 tokenId, string calldata metadataURI) external {
        _requireDropCreatorOrOwner(tokenId);
        if (bytes(metadataURI).length == 0) revert InvalidMetadataURI();
        if (totalSupply(tokenId) != 0) revert MetadataLocked();

        drops[tokenId].metadataURI = metadataURI;
        emit DropMetadataUpdated(tokenId, metadataURI);
    }

    function setPlatformWallet(address payable nextPlatformWallet) external onlyOwner {
        if (nextPlatformWallet == address(0)) revert InvalidAddress();
        platformWallet = nextPlatformWallet;
        emit PlatformWalletUpdated(nextPlatformWallet);
    }

    function setContractURI(string calldata nextContractURI) external onlyOwner {
        _contractMetadataURI = nextContractURI;
        emit ContractURIUpdated(nextContractURI);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    function withdrawStuckETH(address payable recipient) external onlyOwner {
        if (recipient == address(0)) revert InvalidAddress();
        recipient.sendValue(address(this).balance);
    }

    function uri(uint256 tokenId) public view override returns (string memory) {
        Drop memory drop = _requireDrop(tokenId);
        return drop.metadataURI;
    }

    function contractURI() external view returns (string memory) {
        return _contractMetadataURI;
    }

    function isSoldOut(uint256 tokenId) external view returns (bool) {
        Drop memory drop = _requireDrop(tokenId);
        return totalSupply(tokenId) >= drop.maxSupply;
    }

    function remainingSupply(uint256 tokenId) external view returns (uint256) {
        Drop memory drop = _requireDrop(tokenId);
        return drop.maxSupply - totalSupply(tokenId);
    }

    function supportsInterface(bytes4 interfaceId) public view override(ERC1155, ERC2981) returns (bool) {
        return super.supportsInterface(interfaceId);
    }

    function _update(address from, address to, uint256[] memory ids, uint256[] memory values)
        internal
        override(ERC1155, ERC1155Supply, ERC1155Pausable)
    {
        super._update(from, to, ids, values);
    }

    function _requireDrop(uint256 tokenId) private view returns (Drop memory drop) {
        drop = drops[tokenId];
        if (drop.creator == address(0)) revert DropDoesNotExist();
    }

    function _requireDropCreatorOrOwner(uint256 tokenId) private view {
        Drop memory drop = _requireDrop(tokenId);
        if (msg.sender != drop.creator && msg.sender != owner()) revert NotDropCreatorOrOwner();
    }
}
