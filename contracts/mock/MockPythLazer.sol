// SPDX-License-Identifier: BUSL-1.1

pragma solidity ^0.8.0;

contract MockPythLazer {
    uint256 public verification_fee = 0;

    function verifyUpdate(
        bytes calldata update
    ) public payable returns (bytes calldata payload, address signer) {
        if (update.length < 71) {
            revert("input too short");
        }
        uint16 payload_len = uint16(bytes2(update[69:71]));
        if (update.length < 71 + payload_len) {
            revert("input too short");
        }
        payload = update[71:71 + payload_len];
        signer = address(0);
    }

    function isValidSigner(address) external pure returns (bool) {
        return true;
    }
}
