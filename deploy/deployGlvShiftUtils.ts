import { createDeployFunction } from "../utils/deploy";

const func = createDeployFunction({
  contractName: "GlvShiftUtils",
  libraryNames: [
    "GasUtils",
    "GlvShiftEventUtils",
    "GlvShiftStoreUtils",
    "GlvUtils",
    "MarketStoreUtils",
    "MarketUtils",
    "ShiftEventUtils",
    "ShiftUtils",
  ],
});

func.skip = async ({ network }: any) => network.name === "localhost";

export default func;
