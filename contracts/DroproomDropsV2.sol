// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {DroproomDrops} from "./DroproomDrops.sol";

/// @notice New deployments only. This cannot change the existing V1 deployment.
contract DroproomDropsV2 is DroproomDrops {
    mapping(address creator => uint256 tokenId) public latestDropOf;

    error PreviousDropNotSoldOut(uint256 tokenId);

    constructor(address payable initialPlatformWallet, string memory initialContractURI)
        DroproomDrops(initialPlatformWallet, initialContractURI) {}

    function _beforeCreateDrop() internal override {
        uint256 previousId = latestDropOf[msg.sender];
        if (previousId != 0 && totalSupply(previousId) < drops[previousId].maxSupply) {
            revert PreviousDropNotSoldOut(previousId);
        }
        latestDropOf[msg.sender] = nextTokenId;
    }
}
