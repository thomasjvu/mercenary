import { ERC20_MINIMAL_ABI } from '@bossraid/raid-core';

export const erc20MinimalAbi = ERC20_MINIMAL_ABI;

export const registryAbi = [
  {
    type: 'function',
    name: 'createRaid',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'taskHash', type: 'bytes32' }],
    outputs: [{ name: 'raidId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'linkChildJob',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'raidId', type: 'uint256' },
      { name: 'jobId', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'finalizeRaid',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'raidId', type: 'uint256' },
      { name: 'evaluationHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'RaidCreated',
    inputs: [
      { name: 'raidId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'taskHash', type: 'bytes32', indexed: false },
    ],
  },
] as const;

export const escrowAbi = [
  {
    type: 'function',
    name: 'createJob',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'provider', type: 'address' },
      { name: 'evaluator', type: 'address' },
      { name: 'expiresAt', type: 'uint256' },
      { name: 'description', type: 'string' },
    ],
    outputs: [{ name: 'jobId', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'setBudget',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'amount', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'fund',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'expectedBudget', type: 'uint256' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'submit',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'deliverableHash', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'complete',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'reason', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'function',
    name: 'reject',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'jobId', type: 'uint256' },
      { name: 'reason', type: 'bytes32' },
    ],
    outputs: [],
  },
  {
    type: 'event',
    name: 'JobCreated',
    inputs: [
      { name: 'jobId', type: 'uint256', indexed: true },
      { name: 'client', type: 'address', indexed: true },
      { name: 'provider', type: 'address', indexed: true },
      { name: 'evaluator', type: 'address', indexed: false },
    ],
  },
] as const;
