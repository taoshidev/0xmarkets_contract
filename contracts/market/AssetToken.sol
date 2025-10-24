// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// @title AssetToken
// @dev The asset token is a dummy token for non-ERC20 assets such as Euro, GBP, Gold, ...
contract AssetToken is ERC20 {
    constructor(string memory name, string memory symbol) ERC20(name, symbol) {}
}
