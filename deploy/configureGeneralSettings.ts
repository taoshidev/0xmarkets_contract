import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { setAddressIfDifferent, setUintIfDifferent, setBoolIfDifferent } from "../utils/dataStore";
import { updateGeneralConfig } from "../scripts/updateGeneralConfigUtils";

const func = async ({ gmx }: HardhatRuntimeEnvironment) => {
  const generalConfig = await gmx.getGeneral();

  if (generalConfig.veAlphaFeeReceiver !== undefined) {
    await setAddressIfDifferent(keys.VEALPHA_FEE_RECEIVER, generalConfig.veAlphaFeeReceiver, "veAlpha fee receiver");
  }
  if (generalConfig.treasuryFeeReceiver !== undefined) {
    await setAddressIfDifferent(keys.TREASURY_FEE_RECEIVER, generalConfig.treasuryFeeReceiver, "treasury fee receiver");
  }
  if (generalConfig.buybackFeeReceiver !== undefined) {
    await setAddressIfDifferent(keys.BUYBACK_FEE_RECEIVER, generalConfig.buybackFeeReceiver, "buyback fee receiver");
  }
  if (generalConfig.validatorFeeReceiver !== undefined) {
    await setAddressIfDifferent(
      keys.VALIDATOR_FEE_RECEIVER,
      generalConfig.validatorFeeReceiver,
      "validator fee receiver"
    );
  }
  if (generalConfig.insuranceFundAddress !== undefined) {
    await setAddressIfDifferent(
      keys.INSURANCE_FUND_ADDRESS,
      generalConfig.insuranceFundAddress,
      "insurance fund address"
    );
  }

  await setAddressIfDifferent(keys.HOLDING_ADDRESS, generalConfig.holdingAddress, "holding address");

  await setBoolIfDifferent(
    keys.SKIP_BORROWING_FEE_FOR_SMALLER_SIDE,
    generalConfig.skipBorrowingFeeForSmallerSide,
    "skip borrowing fee for smaller side"
  );

  await setUintIfDifferent(
    keys.CLAIMABLE_COLLATERAL_TIME_DIVISOR,
    generalConfig.claimableCollateralTimeDivisor,
    "claimable collateral time divisor"
  );

  await setUintIfDifferent(
    keys.MAX_EXECUTION_FEE_MULTIPLIER_FACTOR,
    generalConfig.maxExecutionFeeMultiplierFactor,
    "max execution fee multiplier factor"
  );

  // Insurance fund epoch globals. EPOCH_LENGTH gates SettlementHandler's
  // idempotency guard (re-snapshot is rejected before block.timestamp >=
  // lastEpochStart + epochLength). MAX_EPOCH_AGE disables drawdown injection
  // when the snapshot is older than that — guards against a missed keeper run
  // poisoning a stale baseline. Both are seconds.
  if (generalConfig.insuranceFundEpochLength !== undefined) {
    await setUintIfDifferent(
      keys.INSURANCE_FUND_EPOCH_LENGTH,
      generalConfig.insuranceFundEpochLength,
      "insurance fund epoch length"
    );
  }
  if (generalConfig.insuranceFundMaxEpochAge !== undefined) {
    await setUintIfDifferent(
      keys.INSURANCE_FUND_MAX_EPOCH_AGE,
      generalConfig.insuranceFundMaxEpochAge,
      "insurance fund max epoch age"
    );
  }

  const write = process.env.FOR_EXISTING_MAINNET_DEPLOYMENT ? false : true;
  if (write) {
    await updateGeneralConfig({ write: true });
  }
};

func.tags = ["GeneralSettings"];
func.dependencies = ["DataStore", "Config", "Multicall", "Roles"];
export default func;
