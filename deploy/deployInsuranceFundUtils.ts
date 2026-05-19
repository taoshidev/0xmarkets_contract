import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "InsuranceFundUtils",
  // InsuranceFundUtils.deposit / attemptInjectPool are external, so the library
  // ships as its own deployment and is delegate-called from the contracts that
  // link against it. InsuranceFundEventUtils is also external and gets linked
  // here too — its events are emitted from inside deposit / attemptInjectPool /
  // snapshotEpoch / topUp.
  libraryNames: ["InsuranceFundEventUtils", "MarketEventUtils"],
});

export default func;
