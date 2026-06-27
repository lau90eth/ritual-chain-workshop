const abi = [
  { inputs: [], name: "NotOwner", type: "error" },
  { inputs: [], name: "BountyNotFound", type: "error" },
  { inputs: [], name: "BountyAlreadyExists", type: "error" },
  { inputs: [], name: "CommitPhaseOver", type: "error" },
  { inputs: [], name: "CommitPhaseNotOver", type: "error" },
  { inputs: [], name: "RevealPhaseOver", type: "error" },
  { inputs: [], name: "RevealPhaseNotOver", type: "error" },
  { inputs: [], name: "AlreadyCommitted", type: "error" },
  { inputs: [], name: "NoCommitFound", type: "error" },
  { inputs: [], name: "AlreadyRevealed", type: "error" },
  { inputs: [], name: "InvalidReveal", type: "error" },
  { inputs: [], name: "WinnerAlreadyFinalized", type: "error" },
  { inputs: [], name: "InvalidWinnerIndex", type: "error" },
  { inputs: [], name: "NothingToJudge", type: "error" },
  { inputs: [], name: "ZeroCommitment", type: "error" },
  { inputs: [], name: "EmptyAnswer", type: "error" },
  { inputs: [], name: "ZeroSalt", type: "error" },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "bountyId", type: "uint256" },
      { indexed: true, name: "creator", type: "address" },
      { indexed: false, name: "title", type: "string" },
      { indexed: false, name: "commitDeadline", type: "uint256" },
      { indexed: false, name: "revealDeadline", type: "uint256" },
    ],
    name: "BountyCreated", type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "bountyId", type: "uint256" },
      { indexed: true, name: "participant", type: "address" },
      { indexed: false, name: "commitment", type: "bytes32" },
    ],
    name: "CommitmentSubmitted", type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "bountyId", type: "uint256" },
      { indexed: true, name: "participant", type: "address" },
      { indexed: false, name: "answer", type: "string" },
    ],
    name: "AnswerRevealed", type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "bountyId", type: "uint256" },
      { indexed: false, name: "revealCount", type: "uint256" },
      { indexed: false, name: "llmInput", type: "bytes" },
    ],
    name: "JudgeRequested", type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "bountyId", type: "uint256" },
      { indexed: true, name: "winner", type: "address" },
      { indexed: false, name: "winnerIndex", type: "uint256" },
      { indexed: false, name: "prize", type: "uint256" },
    ],
    name: "WinnerFinalized", type: "event",
  },
  {
    anonymous: false,
    inputs: [
      { indexed: true, name: "bountyId", type: "uint256" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
    name: "PrizeDeposited", type: "event",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [{ name: "", type: "address" }],
    stateMutability: "view", type: "function",
  },
  {
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "title", type: "string" },
      { name: "commitDeadline", type: "uint256" },
      { name: "revealDeadline", type: "uint256" },
    ],
    name: "createBounty",
    outputs: [],
    stateMutability: "payable", type: "function",
  },
  {
    inputs: [{ name: "bountyId", type: "uint256" }],
    name: "depositPrize",
    outputs: [],
    stateMutability: "payable", type: "function",
  },
  {
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "commitment", type: "bytes32" },
    ],
    name: "submitCommitment",
    outputs: [],
    stateMutability: "nonpayable", type: "function",
  },
  {
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "answer", type: "string" },
      { name: "salt", type: "bytes32" },
    ],
    name: "revealAnswer",
    outputs: [],
    stateMutability: "nonpayable", type: "function",
  },
  {
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "llmInput", type: "bytes" },
    ],
    name: "judgeAll",
    outputs: [],
    stateMutability: "nonpayable", type: "function",
  },
  {
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "winnerIndex", type: "uint256" },
    ],
    name: "finalizeWinner",
    outputs: [],
    stateMutability: "nonpayable", type: "function",
  },
  {
    inputs: [{ name: "bountyId", type: "uint256" }],
    name: "getBountyInfo",
    outputs: [
      { name: "creator", type: "address" },
      { name: "title", type: "string" },
      { name: "commitDeadline", type: "uint256" },
      { name: "revealDeadline", type: "uint256" },
      { name: "prize", type: "uint256" },
      { name: "finalized", type: "bool" },
      { name: "winner", type: "address" },
      { name: "submissionCount", type: "uint256" },
    ],
    stateMutability: "view", type: "function",
  },
  {
    inputs: [{ name: "bountyId", type: "uint256" }],
    name: "getRevealedSubmissions",
    outputs: [
      { name: "participants", type: "address[]" },
      { name: "answers", type: "string[]" },
    ],
    stateMutability: "view", type: "function",
  },
  {
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "participant", type: "address" },
    ],
    name: "hasCommitted",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view", type: "function",
  },
  {
    inputs: [
      { name: "bountyId", type: "uint256" },
      { name: "participant", type: "address" },
    ],
    name: "hasRevealed",
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "view", type: "function",
  },
  {
    inputs: [
      { name: "answer", type: "string" },
      { name: "salt", type: "bytes32" },
      { name: "participant", type: "address" },
      { name: "bountyId", type: "uint256" },
    ],
    name: "computeCommitment",
    outputs: [{ name: "", type: "bytes32" }],
    stateMutability: "pure", type: "function",
  },
] as const;

export default abi;
