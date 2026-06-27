import hre from "hardhat";
import { createPublicClient, createWalletClient, http, formatEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as dotenv from "dotenv";
dotenv.config();

const RITUAL_CHAIN = {
  id: 1979,
  name: "ritual",
  nativeCurrency: { name: "RITUAL", symbol: "RITUAL", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.ritualfoundation.org"] } },
} as const;

const RITUAL_ORACLE_PLACEHOLDER = "0x0000000000000000000000000000000000000001";

async function main() {
  const pk = process.env.DEPLOYER_PRIVATE_KEY as `0x${string}`;
  if (!pk) throw new Error("DEPLOYER_PRIVATE_KEY not set in .env");

  const account = privateKeyToAccount(pk);
  console.log("Deployer:", account.address);

  const pub    = createPublicClient({ chain: RITUAL_CHAIN, transport: http() });
  const wallet = createWalletClient({ account, chain: RITUAL_CHAIN, transport: http() });

  const balance = await pub.getBalance({ address: account.address });
  console.log("Balance:", formatEther(balance), "RITUAL");
  if (balance === 0n) throw new Error("Zero balance");

  const artifact = await hre.artifacts.readArtifact("PrivacyBountyJudgeAdvanced");

  console.log("\nDeploying PrivacyBountyJudgeAdvanced...");
  const deployHash = await wallet.deployContract({
    abi:      artifact.abi,
    bytecode: artifact.bytecode as `0x${string}`,
    args:     [RITUAL_ORACLE_PLACEHOLDER],
  });
  console.log("Deploy tx:", deployHash);

  const receipt = await pub.waitForTransactionReceipt({ hash: deployHash });
  console.log("Contract address:", receipt.contractAddress);
  console.log("Block:", receipt.blockNumber.toString());
  console.log("Gas used:", receipt.gasUsed.toString());

  const ownerOnChain = await pub.readContract({
    address:      receipt.contractAddress!,
    abi:          artifact.abi,
    functionName: "owner",
    args:         [],
  });
  const oracleOnChain = await pub.readContract({
    address:      receipt.contractAddress!,
    abi:          artifact.abi,
    functionName: "ritualOracle",
    args:         [],
  });

  console.log("\nOwner on-chain: ", ownerOnChain);
  console.log("Oracle on-chain:", oracleOnChain);
  console.log("\n✅ Deploy completato su Ritual testnet (chainId 1979)");
  console.log(`   Explorer: https://explorer.ritualfoundation.org/address/${receipt.contractAddress}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
