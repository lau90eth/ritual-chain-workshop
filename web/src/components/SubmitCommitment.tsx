"use client";

import { useState } from "react";
import { useAccount } from "wagmi";
import { keccak256, encodePacked, toHex, toBytes } from "viem";
import { contractAddress } from "@/config/contract";
import { ritualChain } from "@/config/wagmi";
import privacyBountyAbi from "@/abi/PrivacyBountyJudge";
import { useWriteTx } from "@/hooks/useWriteTx";
import { Card, CardHeader, CardBody, Field, Input, Textarea, Button, TxStatus, Notice } from "@/components/ui";

const explorerBase = ritualChain.blockExplorers?.default.url;

function makeSalt(): `0x${string}` {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return toHex(arr) as `0x${string}`;
}

export function SubmitCommitment({ bountyId }: { bountyId: bigint }) {
  const { address, isConnected } = useAccount();
  const [answer, setAnswer] = useState("");
  const [salt, setSalt] = useState(() => makeSalt());
  const [commitment, setCommitment] = useState<`0x${string}` | null>(null);
  const [saved, setSaved] = useState(false);

  const tx = useWriteTx();

  function computeCommitment() {
    if (!address || !answer.trim()) return null;
    return keccak256(encodePacked(
      ["string", "bytes32", "address", "uint256"],
      [answer.trim(), salt as `0x${string}`, address, bountyId]
    ));
  }

  async function handleCommit(e: React.FormEvent) {
    e.preventDefault();
    if (!contractAddress || !address) return;
    const c = computeCommitment();
    if (!c) return;
    setCommitment(c);
    try {
      await tx.run({
        address: contractAddress,
        abi: privacyBountyAbi,
        functionName: "submitCommitment",
        args: [bountyId, c],
        chainId: ritualChain.id,
      });
    } catch { /* surfaced via tx.state */ }
  }

  return (
    <Card>
      <CardHeader title="Submit Commitment" subtitle="Your answer stays hidden until the reveal phase." />
      <CardBody>
        <Notice tone="amber">
          ⚠️ Save your answer and salt before submitting — you need them to reveal later.
        </Notice>
        <form onSubmit={handleCommit} className="mt-3 space-y-3">
          <Field label="Your Answer" hint="Write your answer. It will be hashed, not stored on-chain.">
            <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={4} placeholder="Your answer here…" />
          </Field>
          <Field label="Salt (auto-generated)" hint="Keep this secret until the reveal phase.">
            <div className="flex gap-2">
              <Input value={salt} readOnly className="font-mono text-xs" />
              <Button type="button" onClick={() => setSalt(makeSalt())} className="shrink-0">
                New
              </Button>
            </div>
          </Field>
          {commitment && (
            <div className="rounded-md bg-white/5 p-3 text-xs">
              <p className="text-zinc-400 mb-1">Commitment hash:</p>
              <p className="font-mono break-all text-emerald-400">{commitment}</p>
            </div>
          )}
          <div className="flex items-center gap-2">
            <input type="checkbox" id="saved" checked={saved} onChange={(e) => setSaved(e.target.checked)} className="h-4 w-4" />
            <label htmlFor="saved" className="text-xs text-zinc-400">
              I have saved my answer and salt in a safe place.
            </label>
          </div>
          <Button type="submit" disabled={!isConnected || !answer.trim() || !saved || tx.isBusy} className="w-full">
            {tx.isBusy ? "Submitting…" : "Submit commitment"}
          </Button>
          <TxStatus state={tx.state} error={tx.error} hash={tx.hash} explorerBase={explorerBase} />
        </form>
      </CardBody>
    </Card>
  );
}
