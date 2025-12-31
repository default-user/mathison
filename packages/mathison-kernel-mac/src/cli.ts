#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import * as readline from 'readline';
import { initKernel, bootKernel, startKernelRepl } from './kernel';
import { installDefaultModel, listModels, getModelPath } from './model';
import { buildLlamaCpp, isLlamaCppBuilt } from './llama';
import { ensureDirs, loadConfig, saveConfig } from './config';
import { SQLiteBeamStore, BeamQuery } from 'mathison-storage';
import { BEAMSTORE_PATH } from './config';
import { startServer } from './server';

const program = new Command();

program
  .name('mathison')
  .description('Mathison OI Kernel - Local LLM with BeamStore identity')
  .version('1.0.0');

// mathison init
program
  .command('init')
  .description('Initialize Mathison identity (create SELF_ROOT)')
  .action(async () => {
    try {
      ensureDirs();
      await initKernel();
    } catch (e: any) {
      console.error(chalk.red(`[ERROR] ${e.message}`));
      process.exit(1);
    }
  });

// mathison chat
program
  .command('chat')
  .description('Start interactive chat with Mathison')
  .action(async () => {
    try {
      ensureDirs();

      // Ensure llama.cpp is built
      if (!isLlamaCppBuilt()) {
        console.log(chalk.yellow('[KERNEL] llama.cpp not built yet'));
        console.log(chalk.yellow('[KERNEL] Building llama.cpp from source... (this may take a few minutes)'));
        buildLlamaCpp();
      }

      // Boot kernel
      const state = await bootKernel();

      // Start REPL
      await startKernelRepl(state);
    } catch (e: any) {
      console.error(chalk.red(`[ERROR] ${e.message}`));
      process.exit(1);
    }
  });

// mathison serve
program
  .command('serve')
  .description('Start HTTP server with WebSocket for browser UI')
  .option('-p, --port <port>', 'Port to listen on', '3000')
  .option('-h, --host <host>', 'Host to bind to', '0.0.0.0')
  .option('--cors <origin>', 'CORS origin', '*')
  .action(async (options) => {
    try {
      ensureDirs();

      // Ensure llama.cpp is built
      if (!isLlamaCppBuilt()) {
        console.log(chalk.yellow('[SERVER] llama.cpp not built yet'));
        console.log(chalk.yellow('[SERVER] Building llama.cpp from source... (this may take a few minutes)'));
        buildLlamaCpp();
      }

      // Start server
      await startServer({
        port: parseInt(options.port, 10),
        host: options.host,
        cors_origin: options.cors,
      });

      console.log('');
      console.log(chalk.bold.green('Mathison Server Ready'));
      console.log('');
      console.log(chalk.gray(`  HTTP API:   http://${options.host}:${options.port}`));
      console.log(chalk.gray(`  WebSocket:  ws://${options.host}:${options.port}`));
      console.log(chalk.gray(`  UI:         http://localhost:${options.port}`));
      console.log('');
      console.log(chalk.gray('Press Ctrl+C to stop'));

      // Keep process alive
      await new Promise(() => {});
    } catch (e: any) {
      console.error(chalk.red(`[ERROR] ${e.message}`));
      process.exit(1);
    }
  });

// mathison model install
program
  .command('model')
  .description('Model management commands')
  .addCommand(
    new Command('install')
      .description('Install default model (Qwen2.5-7B-Instruct Q4_K_M)')
      .action(async () => {
        try {
          ensureDirs();
          const modelPath = await installDefaultModel((downloaded, total) => {
            const percent = ((downloaded / total) * 100).toFixed(1);
            const mb = (downloaded / 1e6).toFixed(1);
            const totalMb = (total / 1e6).toFixed(1);
            process.stdout.write(`\r[MODEL] Downloading: ${percent}% (${mb}/${totalMb} MB)`);
          });
          console.log(''); // New line after progress
          console.log(chalk.green(`[MODEL] Installed: ${modelPath}`));

          // Set as default model
          const cfg = loadConfig();
          cfg.model_path = modelPath;
          saveConfig(cfg);
        } catch (e: any) {
          console.error(chalk.red(`[ERROR] ${e.message}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List installed models')
      .action(() => {
        try {
          const models = listModels();
          if (models.length === 0) {
            console.log(chalk.yellow('[MODEL] No models installed'));
            console.log(chalk.yellow('[MODEL] Run `mathison model install` to download default model'));
            return;
          }

          console.log(chalk.bold('[MODEL] Installed models:'));
          for (const model of models) {
            const sizeMb = (model.size / 1e6).toFixed(1);
            console.log(`  - ${model.name} (${sizeMb} MB)`);
            console.log(`    ${chalk.gray(model.path)}`);
          }
        } catch (e: any) {
          console.error(chalk.red(`[ERROR] ${e.message}`));
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('set')
      .description('Set active model')
      .argument('<path>', 'Path to GGUF model file')
      .action((path: string) => {
        try {
          const resolvedPath = getModelPath(path);
          if (!resolvedPath) {
            console.error(chalk.red(`[ERROR] Model not found: ${path}`));
            process.exit(1);
          }

          const cfg = loadConfig();
          cfg.model_path = resolvedPath;
          saveConfig(cfg);

          console.log(chalk.green(`[MODEL] Active model set to: ${resolvedPath}`));
        } catch (e: any) {
          console.error(chalk.red(`[ERROR] ${e.message}`));
          process.exit(1);
        }
      })
  );

// mathison beam commands
const beamCmd = program
  .command('beam')
  .description('BeamStore management commands');

beamCmd
  .command('list')
  .description('List beams')
  .option('--all', 'Include all beams (including tombstoned)')
  .option('--dead', 'Show only tombstoned beams')
  .option('--kind <kind>', 'Filter by kind')
  .action(async (options) => {
    try {
      const store = new SQLiteBeamStore({ filename: BEAMSTORE_PATH });
      await store.mount();

      const query: BeamQuery = {
        include_dead: options.all || options.dead || false,
        kinds: options.kind ? [options.kind] : undefined,
        limit: 100,
      };

      const beams = await store.query(query);

      // Filter for --dead
      const filtered = options.dead
        ? beams.filter((b) => b.status === 'TOMBSTONED')
        : beams;

      if (filtered.length === 0) {
        console.log(chalk.yellow('[BEAM] No beams found'));
        return;
      }

      console.log(chalk.bold(`[BEAM] Found ${filtered.length} beams:`));
      for (const beam of filtered) {
        const statusColor =
          beam.status === 'ACTIVE'
            ? chalk.green
            : beam.status === 'TOMBSTONED'
            ? chalk.red
            : chalk.yellow;

        const pinned = beam.pinned ? chalk.blue('[PINNED]') : '';
        console.log(
          `  ${statusColor(beam.status.padEnd(10))} ${beam.kind.padEnd(10)} ${beam.beam_id} ${pinned}`
        );
        console.log(`    ${chalk.gray(beam.title)}`);
      }
    } catch (e: any) {
      console.error(chalk.red(`[ERROR] ${e.message}`));
      process.exit(1);
    }
  });

beamCmd
  .command('show')
  .description('Show beam details')
  .argument('<id>', 'Beam ID')
  .action(async (id: string) => {
    try {
      const store = new SQLiteBeamStore({ filename: BEAMSTORE_PATH });
      await store.mount();

      const beam = await store.get(id);
      if (!beam) {
        console.error(chalk.red(`[ERROR] Beam not found: ${id}`));
        process.exit(1);
      }

      console.log(chalk.bold(`[BEAM] ${beam.beam_id}`));
      console.log(`  Kind:   ${beam.kind}`);
      console.log(`  Title:  ${beam.title}`);
      console.log(`  Status: ${beam.status}`);
      console.log(`  Pinned: ${beam.pinned ? 'Yes' : 'No'}`);
      console.log(`  Tags:   [${beam.tags.join(', ')}]`);
      console.log(`  Body:`);
      console.log(chalk.gray(beam.body.split('\n').map((l) => `    ${l}`).join('\n')));
    } catch (e: any) {
      console.error(chalk.red(`[ERROR] ${e.message}`));
      process.exit(1);
    }
  });

beamCmd
  .command('pin')
  .description('Pin a beam')
  .argument('<id>', 'Beam ID')
  .action(async (id: string) => {
    try {
      const store = new SQLiteBeamStore({ filename: BEAMSTORE_PATH });
      await store.mount();
      await store.pin(id);
      console.log(chalk.green(`[BEAM] Pinned: ${id}`));
    } catch (e: any) {
      console.error(chalk.red(`[ERROR] ${e.message}`));
      process.exit(1);
    }
  });

beamCmd
  .command('unpin')
  .description('Unpin a beam')
  .argument('<id>', 'Beam ID')
  .action(async (id: string) => {
    try {
      const store = new SQLiteBeamStore({ filename: BEAMSTORE_PATH });
      await store.mount();
      await store.unpin(id);
      console.log(chalk.green(`[BEAM] Unpinned: ${id}`));
    } catch (e: any) {
      console.error(chalk.red(`[ERROR] ${e.message}`));
      process.exit(1);
    }
  });

beamCmd
  .command('retire')
  .description('Retire a beam')
  .argument('<id>', 'Beam ID')
  .option('-r, --reason <reason>', 'Reason code')
  .action(async (id: string, options) => {
    try {
      const store = new SQLiteBeamStore({ filename: BEAMSTORE_PATH });
      await store.mount();
      await store.retire(id, { reason_code: options.reason });
      console.log(chalk.green(`[BEAM] Retired: ${id}`));
    } catch (e: any) {
      console.error(chalk.red(`[ERROR] ${e.message}`));
      process.exit(1);
    }
  });

beamCmd
  .command('tombstone')
  .description('Tombstone a beam (governed operation)')
  .argument('<id>', 'Beam ID')
  .option('-r, --reason <reason>', 'Reason code (required)')
  .action(async (id: string, options) => {
    try {
      if (!options.reason) {
        console.error(chalk.red('[ERROR] Reason code required for tombstone operation'));
        console.error(chalk.red('[ERROR] Use: mathison beam tombstone <id> -r "reason"'));
        process.exit(1);
      }

      const store = new SQLiteBeamStore({ filename: BEAMSTORE_PATH });
      await store.mount();

      const beam = await store.get(id);
      if (!beam) {
        console.error(chalk.red(`[ERROR] Beam not found: ${id}`));
        process.exit(1);
      }

      // Check if protected
      const protectedKinds = ['SELF', 'POLICY', 'CARE'];
      if (protectedKinds.includes(beam.kind) || beam.beam_id === 'SELF_ROOT') {
        console.log(chalk.yellow(`[WARNING] This is a protected beam (kind: ${beam.kind})`));
        console.log(chalk.yellow('[WARNING] Tombstoning this beam requires explicit confirmation'));
        console.log('');
        console.log(chalk.bold(`Type "YES" to confirm tombstone of ${id}:`));

        const rl = readline.createInterface({
          input: process.stdin,
          output: process.stdout,
        });

        const answer = await new Promise<string>((resolve) => {
          rl.question('', (ans) => {
            rl.close();
            resolve(ans);
          });
        });

        if (answer.trim() !== 'YES') {
          console.log(chalk.yellow('[ABORT] Tombstone cancelled'));
          process.exit(0);
        }

        // Apply with approval
        await store.tombstone(id, {
          reason_code: options.reason,
          approval_ref: { method: 'human_confirm', ref: `cli-${Date.now()}` },
        });
      } else {
        // Non-protected, apply directly
        await store.tombstone(id, { reason_code: options.reason });
      }

      console.log(chalk.green(`[BEAM] Tombstoned: ${id}`));
    } catch (e: any) {
      console.error(chalk.red(`[ERROR] ${e.message}`));
      process.exit(1);
    }
  });

// mathison compact
program
  .command('compact')
  .description('Compact BeamStore (marker-only old tombstones, trim events)')
  .action(async () => {
    try {
      const store = new SQLiteBeamStore({ filename: BEAMSTORE_PATH });
      await store.mount();

      console.log('[COMPACT] Compacting BeamStore...');
      await store.compact({ keep_event_days: 90, marker_only_after_days: 30 });

      const stats = await store.stats();
      console.log(chalk.green('[COMPACT] Done'));
      console.log(`  Active:       ${stats.active}`);
      console.log(`  Retired:      ${stats.retired}`);
      console.log(`  Tombstoned:   ${stats.tombstoned}`);
      console.log(`  Pinned (active): ${stats.pinned_active}`);
    } catch (e: any) {
      console.error(chalk.red(`[ERROR] ${e.message}`));
      process.exit(1);
    }
  });

// mathison stats
program
  .command('stats')
  .description('Show BeamStore statistics')
  .action(async () => {
    try {
      const store = new SQLiteBeamStore({ filename: BEAMSTORE_PATH });
      await store.mount();

      const stats = await store.stats();
      console.log(chalk.bold('[BEAMSTORE STATS]'));
      console.log(`  Active beams:        ${chalk.green(stats.active.toString())}`);
      console.log(`  Retired beams:       ${chalk.yellow(stats.retired.toString())}`);
      console.log(`  Tombstoned beams:    ${chalk.red(stats.tombstoned.toString())}`);
      console.log(`  Pinned (active):     ${chalk.blue(stats.pinned_active.toString())}`);
    } catch (e: any) {
      console.error(chalk.red(`[ERROR] ${e.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
