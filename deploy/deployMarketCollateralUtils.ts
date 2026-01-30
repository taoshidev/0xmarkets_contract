import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "MarketCollateralUtils",
  libraryNames: ["MarketEventUtils", "MarketUtils"],
});

export default func;
