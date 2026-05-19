// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

import "../event/EventEmitter.sol";
import "../event/EventUtils.sol";
import "../utils/Cast.sol";

// @title InsuranceFundEventUtils
// @dev Emits the per-action events for the insurance fund.
// Mirrors the MarketEventUtils style so the subsquid indexer can pick these
// up with the same EventEmitter routing.
library InsuranceFundEventUtils {
    using EventUtils for EventUtils.AddressItems;
    using EventUtils for EventUtils.UintItems;
    using EventUtils for EventUtils.IntItems;
    using EventUtils for EventUtils.BoolItems;
    using EventUtils for EventUtils.Bytes32Items;
    using EventUtils for EventUtils.BytesItems;
    using EventUtils for EventUtils.StringItems;

    // Emitted when the per-close liquidation/position-fee slice is moved from
    // MarketToken into the InsuranceVault and the reserve bucket is incremented.
    function emitInsuranceFundDeposit(
        EventEmitter eventEmitter,
        address market,
        address token,
        bytes32 orderKey,
        uint256 amount,
        uint256 newBalance
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "orderKey", orderKey);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "newBalance", newBalance);

        eventEmitter.emitEventLog1(
            "InsuranceFundDeposit",
            Cast.toBytes32(market),
            eventData
        );
    }

    // Emitted when reserves are transferred from the InsuranceVault into MarketToken
    // and credited to the pool via applyDeltaToPoolAmount.
    function emitInsuranceFundInjection(
        EventEmitter eventEmitter,
        address market,
        address token,
        bytes32 orderKey,
        uint256 amount,
        uint256 newPoolAmount,
        uint256 newReserveBalance,
        uint256 drawdownBefore,
        uint256 drawdownAfter
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "orderKey", orderKey);

        eventData.uintItems.initItems(5);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "newPoolAmount", newPoolAmount);
        eventData.uintItems.setItem(2, "newReserveBalance", newReserveBalance);
        eventData.uintItems.setItem(3, "drawdownBefore", drawdownBefore);
        eventData.uintItems.setItem(4, "drawdownAfter", drawdownAfter);

        eventEmitter.emitEventLog1(
            "InsuranceFundInjection",
            Cast.toBytes32(market),
            eventData
        );
    }

    // Emitted when an injection was requested but the (market, token) reserve
    // could not cover the full amount. paid == 0 means nothing was injected.
    // Distinct from InsuranceFundInjection because operators alert on this:
    // a recurring shortfall means the reserve is undersized for the market.
    function emitInsuranceFundShortfall(
        EventEmitter eventEmitter,
        address market,
        address token,
        bytes32 orderKey,
        uint256 requested,
        uint256 paid
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(2);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);

        eventData.bytes32Items.initItems(1);
        eventData.bytes32Items.setItem(0, "orderKey", orderKey);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "requested", requested);
        eventData.uintItems.setItem(1, "paid", paid);

        eventEmitter.emitEventLog1(
            "InsuranceFundShortfall",
            Cast.toBytes32(market),
            eventData
        );
    }

    // Emitted when SettlementHandler snapshots pool value at epoch start.
    function emitInsuranceFundEpochReset(
        EventEmitter eventEmitter,
        address market,
        uint256 epochPoolValue,
        uint256 timestamp
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(1);
        eventData.addressItems.setItem(0, "market", market);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "epochPoolValue", epochPoolValue);
        eventData.uintItems.setItem(1, "timestamp", timestamp);

        eventEmitter.emitEventLog1(
            "InsuranceFundEpochReset",
            Cast.toBytes32(market),
            eventData
        );
    }

    // Emitted on governance-initiated topUp from treasury (out-of-band seeding).
    function emitInsuranceFundManualDeposit(
        EventEmitter eventEmitter,
        address market,
        address token,
        address depositor,
        uint256 amount,
        uint256 newBalance
    ) external {
        EventUtils.EventLogData memory eventData;

        eventData.addressItems.initItems(3);
        eventData.addressItems.setItem(0, "market", market);
        eventData.addressItems.setItem(1, "token", token);
        eventData.addressItems.setItem(2, "depositor", depositor);

        eventData.uintItems.initItems(2);
        eventData.uintItems.setItem(0, "amount", amount);
        eventData.uintItems.setItem(1, "newBalance", newBalance);

        eventEmitter.emitEventLog1(
            "InsuranceFundManualDeposit",
            Cast.toBytes32(market),
            eventData
        );
    }
}
