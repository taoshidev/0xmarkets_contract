import { HardhatRuntimeEnvironment } from "hardhat/types";
import * as keys from "../utils/keys";
import { setAddressIfDifferent } from "../utils/dataStore";

// Wires the deployed InsuranceVault into the DataStore under Keys.INSURANCE_VAULT
// so InsuranceFundUtils.deposit / attemptInjectPool can resolve the vault at
// runtime. Library-based call sites (e.g. DecreasePositionCollateralUtils) read
// this address rather than receiving the vault by constructor — see spec §4.2.
const func = async ({ deployments }: HardhatRuntimeEnvironment) => {
  const insuranceVault = await deployments.get("InsuranceVault");
  await setAddressIfDifferent(keys.INSURANCE_VAULT, insuranceVault.address, "insurance vault");
};

func.tags = ["InsuranceFundConfig"];
func.dependencies = ["InsuranceVault", "DataStore", "Roles"];
export default func;
