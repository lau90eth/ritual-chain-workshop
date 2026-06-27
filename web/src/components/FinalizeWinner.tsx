"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import privacyBountyAbi from "@/abi/PrivacyBountyJudge";
import { useWriteTx } from "@/hooks/useWriteTx";
import { Card, CardHeader, CardBody, Field, Input, Button, TxStatus, Notice } from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function FinalizeWinner({ bountyId, submissionCount }: { bountyId: bigint; submissionCount: number }) {
  const { address } = useAccount();
  const [winnerIndex, setWinnerIndex] = useState("0");
  const tx = useWriteTx();

  async function handle(e: React.FormEvent) {
    e.preventDefault();
    if (!contractAddress) return;
    try {
      await tx.run({
        address: contractAddress,
        abi: privacyBountyAbi,
        functionName: "finalizeWinner",
        args: [bountyId, BigInt(winnerIndex)],
        chainId: ritualChain.id,
      });
    } catch { /* surfaced via tx.state */ }
  }

  if (!address) return null;

  return (
    <Card>
      <CardHeader title="Finalize Winner" subtitle="Pay out the prize to the winning submission." />
      <CardBody>
        <Notice tone="amber">Only the bounty owner can finalize. {submissionCount} submission(s) total.</Notice>
        <form onSubmit={handle} className="mt-3 space-y-3">
          <Field label="Winner index" hint="0-based index of the winning submission.">
            <Input
              type="number" min="0" max={String(submissionCount - 1)}
              value={winnerIndex} onChange={(e) => setWinnerIndex(e.target.value)}
            />
          </Field>
          <Button type="submit" disabled={tx.isBusy} className="w-full">
            {tx.isBusy ? "Finalizing…" : "Finalize winner"}
          </Button>
          <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
        </form>
      </CardBody>
    </Card>
  );
}
