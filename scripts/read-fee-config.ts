import { ethers } from "hardhat";
import { keccak256 } from "ethers/lib/utils";

function encodeKey(name: string): string {
  return keccak256(ethers.utils.defaultAbiCoder.encode(["string"], [name]));
}

const KEYS = {
  FEE_RECEIVER: encodeKey("FEE_RECEIVER"),
  HOLDING_ADDRESS: encodeKey("HOLDING_ADDRESS"),
  POSITION_FEE_RECEIVER_FACTOR: encodeKey("POSITION_FEE_RECEIVER_FACTOR"),
  BORROWING_FEE_RECEIVER_FACTOR: encodeKey("BORROWING_FEE_RECEIVER_FACTOR"),
  LIQUIDATION_FEE_RECEIVER_FACTOR: encodeKey("LIQUIDATION_FEE_RECEIVER_FACTOR"),
  SWAP_FEE_RECEIVER_FACTOR: encodeKey("SWAP_FEE_RECEIVER_FACTOR"),
};

async function main() {
  const dataStore = await ethers.getContract("DataStore");

  console.log("=== Fee Configuration (on-chain) ===\n");

  // Address values
  const feeReceiver = await dataStore.getAddress(KEYS.FEE_RECEIVER);
  const holdingAddress = await dataStore.getAddress(KEYS.HOLDING_ADDRESS);

  console.log(`Fee Receiver:     ${feeReceiver}`);
  console.log(`Holding Address:  ${holdingAddress}`);
  console.log();

  // Factor values (as percentages)
  const positionFactor = await dataStore.getUint(KEYS.POSITION_FEE_RECEIVER_FACTOR);
  const borrowingFactor = await dataStore.getUint(KEYS.BORROWING_FEE_RECEIVER_FACTOR);
  const liquidationFactor = await dataStore.getUint(KEYS.LIQUIDATION_FEE_RECEIVER_FACTOR);
  const swapFactor = await dataStore.getUint(KEYS.SWAP_FEE_RECEIVER_FACTOR);

  const toPercent = (v: any) => {
    const num = Number(v.toString()) / 1e28; // FLOAT_PRECISION is 1e30, so factor/1e30 * 100
    return `${num.toFixed(4)}%`;
  };

  console.log("=== Fee Receiver Factors (% of fee going to protocol) ===\n");
  console.log(`Position Fee Receiver:    ${positionFactor.toString()} (${toPercent(positionFactor)})`);
  console.log(`Borrowing Fee Receiver:   ${borrowingFactor.toString()} (${toPercent(borrowingFactor)})`);
  console.log(`Liquidation Fee Receiver: ${liquidationFactor.toString()} (${toPercent(liquidationFactor)})`);
  console.log(`Swap Fee Receiver:        ${swapFactor.toString()} (${toPercent(swapFactor)})`);
}

main().catch(console.error);
