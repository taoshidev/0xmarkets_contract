// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../bank/StrictBank.sol";

// @title InsuranceVault
// @dev Singleton vault that custodies per-market insurance reserves.
// Per-market and per-token segregation is bookkeeping in DataStore via
// insuranceFundBalanceKey(market, token); this contract holds the physical
// ERC-20 balances. transferOut is gated by Bank's onlyController modifier.
contract InsuranceVault is StrictBank {
    constructor(RoleStore _roleStore, DataStore _dataStore) StrictBank(_roleStore, _dataStore) {}
}
