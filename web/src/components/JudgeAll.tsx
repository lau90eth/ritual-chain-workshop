"use client";

import { useAccount } from "wagmi";
import { toHex, toBytes } from "viem";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import privacyBountyAbi from "@/abi/PrivacyBountyJudge";
import { useWriteTx } from "@/hooks/useWriteTx";
import { Card, CardHeader, CardBody, Button, TxStatus, Notice } from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function JudgeAll({ bountyId }: { bountyId: bigint }) {
  const { address } = useAccount();
  const tx = useWriteTx();

  async function handle() {
    if (!contractAddress) return;
    const prompt = toHex(toBytes(`Judge bounty #${bountyId}`));
    try {
      await tx.run({
        address: contractAddress,
        abi: privacyBountyAbi,
        functionName: "judgeAll",
        args: [bountyId, prompt],
        chainId: ritualChain.id,
      });
    } catch { /* surfaced via tx.state */ }
  }

  if (!address) return null;

  return (
    <Card>
      <CardHeader title="Request AI Judging" subtitle="Triggers Ritual TEE batch inference on all revealed answers." />
      <CardBody>
        <Notice tone="amber">Only the bounty owner can call this.</Notice>
        <Button onClick={handle} disabled={tx.isBusy} className="mt-3 w-full">
          {tx.isBusy ? "Requesting…" : "Judge all submissions"}
        </Button>
        <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
      </CardBody>
    </Card>
  );
}
