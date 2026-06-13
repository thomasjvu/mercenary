import { createSettlementExecutor } from './settlement-executor.js';
import { createPersistenceBackend } from './persistence-backend.js';
import { findWorkspaceRoot, resolveWorkspacePath } from '@bossraid/constants/workspace';

type CliArgs = {
  raidId?: string;
  stateFile?: string;
  sqliteFile?: string;
  latestFinal: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const parsed: CliArgs = {
    latestFinal: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === '--') {
      continue;
    }

    if (value === '--raid-id') {
      parsed.raidId = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === '--state-file') {
      parsed.stateFile = argv[index + 1];
      index += 1;
      continue;
    }

    if (value === '--latest-final') {
      parsed.latestFinal = true;
      continue;
    }

    if (value === '--sqlite-file') {
      parsed.sqliteFile = argv[index + 1];
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${value}`);
  }

  return parsed;
}

function selectRaidId(
  raids: Array<{
    id: string;
    status: string;
    createdAt: string;
    parentRaidId?: string;
  }>,
  args: CliArgs
): string {
  if (args.raidId) {
    return args.raidId;
  }

  if (!args.latestFinal) {
    throw new Error('Pass --raid-id <id> or --latest-final.');
  }

  const latest = raids
    .filter((raid) => raid.status === 'final' && raid.parentRaidId == null)
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt))[0];

  if (!latest) {
    throw new Error('No finalized raid found in state.');
  }

  return latest.id;
}

async function main(): Promise<void> {
  const workspaceRoot = findWorkspaceRoot(process.cwd());
  const args = parseArgs(process.argv.slice(2));
  const persistence = createCliPersistence(args, workspaceRoot);
  const snapshot = await persistence.loadState();
  const raidId = selectRaidId(snapshot.raids, args);
  const raid = snapshot.raids.find((item) => item.id === raidId);

  if (!raid) {
    throw new Error(`Raid not found: ${raidId}`);
  }

  if (raid.status !== 'final') {
    throw new Error(`Raid ${raidId} is not final. Current status: ${raid.status}`);
  }

  if (raid.parentRaidId) {
    throw new Error(
      `Raid ${raidId} is a child raid. Settle the parent raid ${raid.parentRaidId} instead.`
    );
  }

  const executor = createSettlementExecutor(process.env, workspaceRoot);
  const settlementExecution = await executor.execute(raid);
  if (!settlementExecution) {
    throw new Error(`No settlement record produced for raid ${raidId}.`);
  }

  raid.settlementExecution = settlementExecution;
  raid.updatedAt = new Date().toISOString();
  await persistence.saveState({
    ...snapshot,
    savedAt: new Date().toISOString(),
    raids: snapshot.raids.map((item) => (item.id === raid.id ? raid : item)),
  });

  process.stdout.write(
    `${JSON.stringify(
      {
        raidId,
        mode: settlementExecution.mode,
        registryRaidRef: settlementExecution.registryRaidRef,
        artifactPath: settlementExecution.artifactPath,
        transactions: settlementExecution.transactionHashes?.length ?? 0,
        jobIds: settlementExecution.jobIds?.length ?? 0,
      },
      null,
      2
    )}\n`
  );
}

void main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});

function createCliPersistence(args: CliArgs, workspaceRoot: string) {
  const sqliteFile = resolveWorkspacePath(
    args.sqliteFile ?? process.env.BOSSRAID_SQLITE_FILE ?? './temp/bossraid-state.sqlite',
    workspaceRoot
  );

  return createPersistenceBackend({
    storageBackend: 'sqlite',
    sqliteFile,
  });
}
