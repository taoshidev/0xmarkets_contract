import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvWithdrawalUtils",
  libraryNames: [
    "GasUtils",
    "GlvUtils",
    "GlvWithdrawalEventUtils",
    "GlvWithdrawalStoreUtils",
    "MarketStoreUtils",
    "MarketUtils",
    "ExecuteWithdrawalUtils",
    "WithdrawalEventUtils",
  ],
});

func.skip = async ({ network }: any) => network.name === "localhost";

export default func;
