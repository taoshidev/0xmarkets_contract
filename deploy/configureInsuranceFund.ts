import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { setAddressIfDifferent } from "../utils/dataStore";

// Wires the deployed InsuranceVault into the DataStore under Keys.INSURANCE_FUND_ADDRESS
// (the slot that fee-addresses introduced for routing liquidation-fee insurance shares).
// DecreasePositionCollateralUtils._distributeLiquidationShares reads this slot and
// hands the slice to InsuranceFundUtils.deposit, which transfers the tokens out
// of MarketToken into the vault. Library call sites resolve at runtime — see
// design discussion in PR #31 thread.
const func = async ({ deployments }: HardhatRuntimeEnvironment) => {
  const insuranceVault = await deployments.get("InsuranceVault");
  await setAddressIfDifferent(keys.INSURANCE_FUND_ADDRESS, insuranceVault.address, "insurance vault");
};

func.tags = ["InsuranceFundConfig"];
func.dependencies = ["InsuranceVault", "DataStore", "Roles"];
export default func;
