import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvDepositUtils",
  libraryNames: [
    "MarketUtils",
    "GlvUtils",
    "DepositEventUtils",
    "ExecuteDepositUtils",
    "GasUtils",
    "GlvDepositEventUtils",
    "GlvDepositStoreUtils",
    "MarketStoreUtils",
  ],
});

func.skip = async ({ network }: any) => network.name === "localhost";

export default func;
