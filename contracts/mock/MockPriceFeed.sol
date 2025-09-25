// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../oracle/IPriceFeed.sol";

// @title MockPriceFeed
// @dev Mock price feed for testing and testnets
contract MockPriceFeed is IPriceFeed {
    int256 public answer;
    uint80 public roundId;
    uint256 public startedAt;
    uint256 public updatedAt;
    uint80 public answeredInRound;

    // @dev set answer
    // @param _answer the answer to set to
    function setAnswer(int256 _answer) external {
        answer = _answer;
    }

    // @dev set latest round data
    // @param _roundId the round id
    // @param _answer the answer
    // @param _startedAt the started timestamp
    // @param _updatedAt the updated timestamp
    // @param _answeredInRound the answered in round
    function setLatestRoundData(
        uint80 _roundId,
        int256 _answer,
        uint256 _startedAt,
        uint256 _updatedAt,
        uint80 _answeredInRound
    ) external {
        roundId = _roundId;
        answer = _answer;
        startedAt = _startedAt;
        updatedAt = _updatedAt;
        answeredInRound = _answeredInRound;
    }

    function latestAnswer() external view returns (int256) {
        return answer;
    }

    // @dev get the latest data
    // @return (roundId, answer, startedAt, updatedAt, answeredInRound)
    function latestRoundData() external view returns (
        uint80,
        int256,
        uint256,
        uint256,
        uint80
    ) {
        return (
            roundId, // roundId
            answer, // answer
            startedAt, // startedAt
            updatedAt > 0 ? updatedAt : block.timestamp - 60, // updatedAt
            answeredInRound // answeredInRound
        );
    }
}
