import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvDepositEventUtils",
});

func.skip = async ({ network }: any) => network.name === "localhost";

export default func;
