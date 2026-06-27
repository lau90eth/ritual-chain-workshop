# Privacy-Preserving AI Bounty Judge

**Ritual Academy Assignment — Commit-Reveal Bounty**  
**Author:** lau90.eth | **Tests:** 14/14 passing

## Lifecycle
CREATE → COMMIT PHASE → REVEAL PHASE → JUDGE → FINALIZE

| Phase | Who | Deadline | Action |
|---|---|---|---|
| Create | Anyone | — | Deploy bounty + ETH prize |
| Commit | Participants | `≤ commitDeadline` | Submit `keccak256(answer, salt, sender, bountyId)` |
| Reveal | Participants | `commitDeadline < t ≤ revealDeadline` | Reveal plaintext + salt, contract verifies hash |
| Judge | Owner | `> revealDeadline` | `judgeAll()` emits event → AI oracle evaluates |
| Finalize | Owner | After judging | `finalizeWinner()` pays ETH to winner |

## Commitment Hash

```solidity
keccak256(abi.encodePacked(answer, salt, msg.sender, bountyId))
```

- `salt` — random 32 bytes, kept secret until reveal
- `msg.sender` — prevents front-running/replay
- `bountyId` — prevents cross-bounty replay

## Contract

`hardhat/contracts/PrivacyBountyJudge.sol`

Key functions:
- `submitCommitment(uint256 bountyId, bytes32 commitment)`
- `revealAnswer(uint256 bountyId, string calldata answer, bytes32 salt)`
- `judgeAll(uint256 bountyId, bytes calldata llmInput)`
- `finalizeWinner(uint256 bountyId, uint256 winnerIndex)`

## Test Plan

`hardhat/test/PrivacyBountyJudge.test.ts` — 14 test cases:

| ID | Description | Expected |
|---|---|---|
| T-01 | Deploy | owner set correctly |
| T-02 | createBounty | prize stored |
| T-03 | submitCommitment | hasCommitted = true |
| T-04 | Two participants | submissionCount = 2 |
| R-01 | Valid reveal | hasRevealed = true |
| R-02 | Wrong salt | InvalidReveal |
| R-03 | Wrong answer | InvalidReveal |
| R-04 | Double reveal | AlreadyRevealed |
| R-05 | Reveal during commit phase | CommitPhaseNotOver |
| R-06 | Reveal after deadline | RevealPhaseOver |
| R-07 | Reveal without commit | NoCommitFound |
| C-01 | Double commit | AlreadyCommitted |
| F-01 | Full flow | Winner receives ETH |
| F-02 | Non-owner finalize | NotOwner |

```bash
cd hardhat && npx hardhat test
# 14 passing
```

## Architecture Note

Commit-Reveal prevents front-running: only a hash is public during submission. The salt (random 32 bytes) makes brute-force infeasible even for short answers. The `msg.sender` binding prevents replay. `judgeAll()` is an event-based AI oracle trigger — in production it calls Ritual's Infernet for verifiable off-chain LLM inference. `finalizeWinner()` uses Checks-Effects-Interactions (zero before transfer) to prevent reentrancy.

## Reflection

In a commit-reveal bounty, the commitment hash should be public — it proves a submission exists at a fixed point in time without exposing content. The plaintext answer and salt must stay hidden until the reveal deadline, because early disclosure defeats the scheme entirely. After the reveal deadline, all revealed answers should become public on-chain so any participant can verify the judging process saw the same inputs they submitted. AI should decide answer quality evaluation — specifically when judgment requires semantic understanding that is hard to encode as deterministic on-chain logic; an LLM with a verifiable inference trace can act as a credibly neutral arbiter. Human or multisig control must remain over the final financial action — triggering the prize transfer — because AI inference is not yet provably secure against adversarial prompt injection at the oracle boundary. A hybrid architecture where AI ranks submissions and a timelock gives participants a dispute window before funds are released combines machine efficiency with human accountability.

---

## Advanced Track — Ritual TEE Hidden Submissions

**Contract:** `hardhat/contracts/PrivacyBountyJudgeAdvanced.sol`  
**Deployed on Ritual testnet (chainId 1979):**  
`0x48561dabae5133a8157633aa9b20ce2292b7ad39`  
[Explorer](https://explorer.ritualfoundation.org/address/0x48561dabae5133a8157633aa9b20ce2292b7ad39)

### Where does plaintext live?

| Location | What is stored |
|---|---|
| On-chain | ECIES ciphertext + commitment hash |
| Ritual TEE | Plaintext (decrypted inside secure enclave, never exposed) |
| Off-chain (participant) | Plaintext answer + salt (until submission) |
| LLM | Receives decrypted batch inside TEE — never leaves enclave |

### TEE Flow
Participant → encrypt(answer, TEE_pubkey) → submitEncrypted(ciphertext, commitment)

↓

BatchJudgeRequested event

↓

Ritual Infernet TEE listens → decrypts all ciphertexts

↓

Single LLM batch inference (not N calls)

↓

postWinner(bountyId, winnerIndex) on-chain

### Tests: 12/12 passing

```bash
cd hardhat && npx hardhat test test/PrivacyBountyJudgeAdvanced.test.ts
```
