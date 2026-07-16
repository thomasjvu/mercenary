export const ERC20_MINIMAL_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
    outputs: [{ name: 'remaining', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'approve',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'spender', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'ok', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: 'balance', type: 'uint256' }],
  },
] as const;

export const BOUNTY_ESCROW_ABI = [
  {
    type: 'function',
    name: 'createBountyOnBehalf',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'poster', type: 'address' },
      { name: 'totalBudget', type: 'uint256' },
      { name: 'biddingDeadline', type: 'uint256' },
      { name: 'awardDeadline', type: 'uint256' },
      { name: 'deliveryDeadline', type: 'uint256' },
      { name: 'acceptDeadline', type: 'uint256' },
      { name: 'metadataUri', type: 'string' },
    ],
    outputs: [{ name: 'bountyId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'fundBountyOnBehalf',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'createAwardOnBehalf',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'bountyId', type: 'uint256' },
      { name: 'provider', type: 'address' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [{ name: 'awardId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'submitDeliveryOnBehalf',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'awardId', type: 'uint256' },
      { name: 'deliveryHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'acceptAwardOnBehalf',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'awardId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'claimPayout',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'awardId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'refundUnawarded',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'bountyId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'acceptAward',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'awardId', type: 'uint256' }],
    outputs: [],
  },
  {
    type: 'function',
    name: 'awards',
    stateMutability: 'view',
    inputs: [{ name: 'awardId', type: 'uint256' }],
    outputs: [
      { name: 'bountyId', type: 'uint256' },
      { name: 'provider', type: 'address' },
      { name: 'amount', type: 'uint256' },
      { name: 'deliveryHash', type: 'bytes32' },
      { name: 'status', type: 'uint8' },
      { name: 'deliveredAt', type: 'uint256' },
    ],
  },
  {
    type: 'event',
    name: 'BountyCreated',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'poster', type: 'address', indexed: true },
      { name: 'totalBudget', type: 'uint256', indexed: false },
    ],
  },
  {
    type: 'event',
    name: 'AwardCreated',
    inputs: [
      { name: 'bountyId', type: 'uint256', indexed: true },
      { name: 'awardId', type: 'uint256', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'amount', type: 'uint256', indexed: false },
    ],
  },
] as const;
