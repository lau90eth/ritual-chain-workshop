"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import privacyBountyAbi from "@/abi/PrivacyBountyJudge";
import { useWriteTx } from "@/hooks/useWriteTx";
import { Card, CardHeader, CardBody, Field, Input, Textarea, Button, TxStatus } from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

export function RevealAnswer({ bountyId }: { bountyId: bigint }) {
  const { isConnected } = useAccount();
  const [answer, setAnswer] = useState("");
  const [salt, setSalt] = useState("");
  const tx = useWriteTx();

  async function handleReveal(e: React.FormEvent) {
    e.preventDefault();
    if (!contractAddress || !answer.trim() || !salt.trim()) return;
    try {
      await tx.run({
        address: contractAddress,
        abi: privacyBountyAbi,
        functionName: "revealAnswer",
        args: [bountyId, answer.trim(), salt.trim() as `0x${string}`],
        chainId: ritualChain.id,
      });
    } catch { /* surfaced via tx.state */ }
  }

  return (
    <Card>
      <CardHeader title="Reveal Answer" subtitle="Enter the answer and salt you saved during the commit phase." />
      <CardBody>
        <form onSubmit={handleReveal} className="mt-3 space-y-3">
          <Field label="Your Answer">
            <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} placeholder="Your original answer…" />
          </Field>
          <Field label="Salt" hint="The salt you saved when you committed.">
            <Input value={salt} onChange={(e) => setSalt(e.target.value)} placeholder="0x…" className="font-mono text-xs" />
          </Field>
          <Button type="submit" disabled={!isConnected || !answer.trim() || !salt.trim() || tx.isBusy} className="w-full">
            {tx.isBusy ? "Revealing…" : "Reveal answer"}
          </Button>
          <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
        </form>
      </CardBody>
    </Card>
  );
}
