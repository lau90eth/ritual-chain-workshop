"use client";

import { useAccount } from "wagmi";
import { formatEther } from "viem";
import { useBounty } from "@/hooks/useBounty";
import { SubmitCommitment } from "@/components/SubmitCommitment";
import { RevealAnswer } from "@/components/RevealAnswer";
import { JudgeAll } from "@/components/JudgeAll";
import { FinalizeWinner } from "@/components/FinalizeWinner";
import { shortenAddress } from "@/lib/format";
import { Card, CardHeader, CardBody, Notice } from "@/components/ui";

function PhaseLabel({ now, commitDL, revealDL, finalized }: {
  now: bigint; commitDL: bigint; revealDL: bigint; finalized: boolean;
}) {
  if (finalized) return <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs text-emerald-300">Finalized</span>;
  if (now <= commitDL) return <span className="rounded-full bg-indigo-500/20 px-2 py-0.5 text-xs text-indigo-300">Commit phase</span>;
  if (now <= revealDL) return <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-xs text-amber-300">Reveal phase</span>;
  return <span className="rounded-full bg-zinc-500/20 px-2 py-0.5 text-xs text-zinc-300">Judging phase</span>;
}

export function BountyView({ bountyId }: { bountyId: bigint }) {
  const { address } = useAccount();
  const b = useBounty(bountyId);
  const now = BigInt(Math.floor(Date.now() / 1000));

  if (b.isLoading) return <p className="text-sm text-zinc-500">Loading bounty…</p>;
  if (b.error || !b.title) return (
    <Notice tone="amber">Bounty #{bountyId.toString()} not found.</Notice>
  );

  const commitDL = b.commitDeadline ?? 0n;
  const revealDL = b.revealDeadline ?? 0n;
  const inCommit = now <= commitDL;
  const inReveal = now > commitDL && now <= revealDL;
  const inJudge  = now > revealDL && !b.finalized;

  return (
    <div className="space-y-4">
      {/* Info card */}
      <Card>
        <CardHeader
          title={`#${bountyId.toString()} — ${b.title}`}
          subtitle={
            <span className="flex items-center gap-2">
              <PhaseLabel now={now} commitDL={commitDL} revealDL={revealDL} finalized={b.finalized ?? false} />
              <span className="text-zinc-500">·</span>
              <span>{b.submissionCount?.toString() ?? "0"} commits</span>
              <span className="text-zinc-500">·</span>
              <span>{b.prize !== undefined ? formatEther(b.prize) : "?"} RITUAL</span>
            </span>
          }
        />
        <CardBody>
          <div className="grid grid-cols-2 gap-3 text-xs sm:grid-cols-4">
            <div>
              <p className="text-zinc-500">Creator</p>
              <p className="font-mono">{b.creator ? shortenAddress(b.creator, 6) : "—"}</p>
            </div>
            <div>
              <p className="text-zinc-500">Commit deadline</p>
              <p>{commitDL ? new Date(Number(commitDL) * 1000).toLocaleString() : "—"}</p>
            </div>
            <div>
              <p className="text-zinc-500">Reveal deadline</p>
              <p>{revealDL ? new Date(Number(revealDL) * 1000).toLocaleString() : "—"}</p>
            </div>
            <div>
              <p className="text-zinc-500">Winner</p>
              <p className="font-mono">{b.winner && b.winner !== "0x0000000000000000000000000000000000000000" ? shortenAddress(b.winner, 6) : "—"}</p>
            </div>
          </div>
          {b.finalized && b.winner && (
            <Notice tone="green">
              Winner: <span className="font-mono">{b.winner}</span>
            </Notice>
          )}
        </CardBody>
      </Card>

      {/* Phase-specific actions */}
      {inCommit && <SubmitCommitment bountyId={bountyId} />}
      {inReveal && <RevealAnswer bountyId={bountyId} />}
      {inJudge  && address && <JudgeAll bountyId={bountyId} />}
      {inJudge  && address && <FinalizeWinner bountyId={bountyId} submissionCount={Number(b.submissionCount ?? 0n)} />}
    </div>
  );
}
