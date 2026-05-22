import { ethers } from "hardhat";
import { keccak256 } from "ethers/lib/utils";

function encodeKey(name: string): string {
  return keccak256(ethers.utils.defaultAbiCoder.encode(["string"], [name]));
}

const KEYS = {
  VEALPHA_FEE_RECEIVER: encodeKey("VEALPHA_FEE_RECEIVER"),
  TREASURY_FEE_RECEIVER: encodeKey("TREASURY_FEE_RECEIVER"),
  BUYBACK_FEE_RECEIVER: encodeKey("BUYBACK_FEE_RECEIVER"),
  VALIDATOR_FEE_RECEIVER: encodeKey("VALIDATOR_FEE_RECEIVER"),
  INSURANCE_FUND_ADDRESS: encodeKey("INSURANCE_FUND_ADDRESS"),
  HOLDING_ADDRESS: encodeKey("HOLDING_ADDRESS"),
  POSITION_FEE_VEALPHA_FACTOR: encodeKey("POSITION_FEE_VEALPHA_FACTOR"),
  POSITION_FEE_TREASURY_FACTOR: encodeKey("POSITION_FEE_TREASURY_FACTOR"),
  POSITION_FEE_BUYBACK_FACTOR: encodeKey("POSITION_FEE_BUYBACK_FACTOR"),
  LIQUIDATION_FEE_VALIDATOR_FACTOR: encodeKey("LIQUIDATION_FEE_VALIDATOR_FACTOR"),
  LIQUIDATION_FEE_INSURANCE_FACTOR: encodeKey("LIQUIDATION_FEE_INSURANCE_FACTOR"),
};

async function main() {
  const dataStore = await ethers.getContract("DataStore");

  console.log("=== Fee Configuration (on-chain) ===\n");

  const veAlpha = await dataStore.getAddress(KEYS.VEALPHA_FEE_RECEIVER);
  const treasury = await dataStore.getAddress(KEYS.TREASURY_FEE_RECEIVER);
  const buyback = await dataStore.getAddress(KEYS.BUYBACK_FEE_RECEIVER);
  const validator = await dataStore.getAddress(KEYS.VALIDATOR_FEE_RECEIVER);
  const insurance = await dataStore.getAddress(KEYS.INSURANCE_FUND_ADDRESS);
  const holdingAddress = await dataStore.getAddress(KEYS.HOLDING_ADDRESS);

  console.log(`veAlpha Fee Receiver:    ${veAlpha}`);
  console.log(`Treasury Fee Receiver:   ${treasury}`);
  console.log(`Buyback Fee Receiver:    ${buyback}`);
  console.log(`Validator Fee Receiver:  ${validator}`);
  console.log(`Insurance Fund Address:  ${insurance}`);
  console.log(`Holding Address:         ${holdingAddress}`);
  console.log();

  const veAlphaFactor = await dataStore.getUint(KEYS.POSITION_FEE_VEALPHA_FACTOR);
  const treasuryFactor = await dataStore.getUint(KEYS.POSITION_FEE_TREASURY_FACTOR);
  const buybackFactor = await dataStore.getUint(KEYS.POSITION_FEE_BUYBACK_FACTOR);
  const validatorFactor = await dataStore.getUint(KEYS.LIQUIDATION_FEE_VALIDATOR_FACTOR);
  const insuranceFactor = await dataStore.getUint(KEYS.LIQUIDATION_FEE_INSURANCE_FACTOR);

  const toPercent = (v: any) => {
    const num = Number(v.toString()) / 1e28; // FLOAT_PRECISION is 1e30, so factor/1e30 * 100
    return `${num.toFixed(4)}%`;
  };

  console.log("=== Position Fee Split Factors ===\n");
  console.log(`veAlpha:  ${veAlphaFactor.toString()} (${toPercent(veAlphaFactor)})`);
  console.log(`Treasury: ${treasuryFactor.toString()} (${toPercent(treasuryFactor)})`);
  console.log(`Buyback:  ${buybackFactor.toString()} (${toPercent(buybackFactor)})`);
  console.log();
  console.log("=== Liquidation Fee Split Factors ===\n");
  console.log(`Validator: ${validatorFactor.toString()} (${toPercent(validatorFactor)})`);
  console.log(`Insurance: ${insuranceFactor.toString()} (${toPercent(insuranceFactor)})`);
}

main().catch(console.error);
