import { describe, it } from "node:test";
import hre from "hardhat";
import { parseEther } from "viem";

describe("debug", async () => {
  await it("getBountyInfo shape", async () => {
    const conn = await hre.network.getOrCreate();
    const pub  = await conn.viem.getPublicClient();
    const wcs  = await conn.viem.getWalletClients();
    const owner = wcs[0];

    const artifact = await hre.artifacts.readArtifact("PrivacyBountyJudge");
    const abi = artifact.abi;

    const deployHash = await owner.deployContract({
      abi, bytecode: artifact.bytecode as `0x${string}`, args: [],
    });
    const receipt = await pub.waitForTransactionReceipt({ hash: deployHash });
    const addr = receipt.contractAddress!;

    const now = (await pub.getBlock()).timestamp;
    const hash = await owner.writeContract({
      address: addr, abi, functionName: "createBounty",
      args: [1n, "Test", now + 86400n, now + 259200n],
      value: parseEther("1"),
    });
    await pub.waitForTransactionReceipt({ hash });

    const info = await pub.readContract({ address: addr, abi, functionName: "getBountyInfo", args: [1n] });
    console.log("info:", JSON.stringify(info, (_, v) => typeof v === "bigint" ? v.toString() : v, 2));
    console.log("type:", typeof info, Array.isArray(info));
  });
});
