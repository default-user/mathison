# Mathison OI Kernel for macOS

Local, Mac-executable Mathison OI Kernel with BeamStore identity substrate and local LLM inference.

## Features

- **Local LLM**: llama.cpp integration with offline inference after initial model download
- **BeamStore Identity**: Identity persists across restarts; LLM context is not identity
- **CDI Governance**: Model cannot write memory directly; proposes STORE_BEAM_INTENT
- **Lifecycle Management**: Beams have states (ACTIVE, RETIRED, PENDING_TOMBSTONE, TOMBSTONED)
- **Device Binding**: Stable device ID derived from macOS IOPlatformUUID
- **Tombstone Safety**: Protected beams (SELF/POLICY/CARE) require human approval for deletion
- **Performance**: Boot time scales with active pinned beams, not total tombstones

## Requirements

- macOS (Intel or Apple Silicon)
- Node.js 18+
- pnpm 8+
- Git
- C++ compiler (Xcode Command Line Tools)

## Quick Start

### 1. Build the Kernel

```bash
# From repository root
pnpm install

# Build the kernel package
pnpm -C packages/mathison-kernel-mac build

# Or use the build script
cd packages/mathison-kernel-mac
./scripts/build-mac.sh
```

### 2. Build llama.cpp

```bash
./scripts/build-llama.sh
```

This will:
- Clone llama.cpp to `~/Library/Application Support/Mathison/llama.cpp/repo`
- Build `llama-server` for your platform
- Install the binary to `~/Library/Application Support/Mathison/llama.cpp/`

### 3. Initialize Mathison

```bash
./mathison init
```

This creates:
- SELF_ROOT beam (your identity anchor)
- Baseline POLICY beams
- Device binding
- BeamStore at `~/Library/Application Support/Mathison/beamstore/beamstore.sqlite`

### 4. Install Model

```bash
./mathison model install
```

Downloads the default model (Qwen2.5-7B-Instruct Q4_K_M, ~4.5GB) to:
```
~/Library/Application Support/Mathison/models/qwen2.5-7b-instruct-q4_k_m.gguf
```

**Note**: This requires internet connection and will take several minutes depending on your connection speed.

### 5. Start Chat

```bash
./mathison chat
```

This will:
1. Boot identity (load SELF_ROOT + pinned beams)
2. Verify device binding
3. Start llama-server
4. Enter interactive REPL

Type your messages and press Enter. Type `exit` to quit.

## CLI Commands

### Identity Management

```bash
# Initialize Mathison (create SELF_ROOT)
mathison init

# Show BeamStore statistics
mathison stats

# Start interactive chat
mathison chat
```

### Model Management

```bash
# Install default model (Qwen2.5-7B-Instruct Q4_K_M)
mathison model install

# List installed models
mathison model list

# Set active model (by name or absolute path)
mathison model set <path-or-name>
```

### Beam Management

```bash
# List beams (default: active only)
mathison beam list
mathison beam list --all         # Include tombstoned
mathison beam list --dead        # Show only tombstoned
mathison beam list --kind SELF   # Filter by kind

# Show beam details
mathison beam show <beam-id>

# Pin/unpin beams (affects SelfFrame)
mathison beam pin <beam-id>
mathison beam unpin <beam-id>

# Retire beam (soft delete)
mathison beam retire <beam-id> -r "reason"

# Tombstone beam (identity-dead; requires approval for protected kinds)
mathison beam tombstone <beam-id> -r "reason"
```

### Maintenance

```bash
# Compact BeamStore (marker-only old tombstones, trim events)
mathison compact
```

## Architecture

### Boot Order (Non-Negotiable)

1. Mount BeamStore
2. Verify schema
3. Load SELF_ROOT or enter AMNESIC_SAFE_MODE
4. Compile SelfFrame + hash
5. Start model / accept user input

### SelfFrame = Identity

```
SelfFrame = compile(SELF_ROOT + pinned ACTIVE beams)
```

- Excludes TOMBSTONED beams (identity-dead; no silent resurrection)
- Deterministic: stable hash across restarts
- Persona changes only through governed beam lifecycle operations

### CDI Gating

Model outputs are plain text but may contain:

```json
STORE_BEAM_INTENT {
  "op": "PUT" | "RETIRE" | "PIN" | "UNPIN" | "TOMBSTONE" | "PURGE",
  "beam": {
    "beam_id": "...",
    "kind": "SELF" | "POLICY" | "CARE" | "NOTE" | ...,
    "title": "...",
    "tags": [...],
    "body": "..."
  },
  "reason_code": "...",
  "approval_ref": { "method": "human_confirm", "ref": "..." }
}
```

Kernel parses intents and runs CDI checks:

- **Protected kinds** (SELF/POLICY/CARE): require `approval_ref` for TOMBSTONE/PURGE
- **SELF_ROOT**: cannot tombstone without explicit human confirmation
- **Rate limits**:
  - Soft: 20 tombstones/24h (requires approval after)
  - Hard: 100 tombstones/24h (deny after)
  - Spike detection: >50 tombstones in 10 minutes triggers INCIDENT_LOCKED mode
- **Reason code**: required for TOMBSTONE/PURGE

## Storage Locations

```
~/Library/Application Support/Mathison/
├── beamstore/
│   └── beamstore.sqlite          # BeamStore database
├── models/
│   └── *.gguf                    # Downloaded GGUF models
├── llama.cpp/
│   ├── repo/                     # llama.cpp source
│   └── llama-server              # Built binary
└── config.json                   # Kernel configuration
```

## Configuration

Config file: `~/Library/Application Support/Mathison/config.json`

```json
{
  "model_path": "/path/to/model.gguf",
  "llama_server_port": 8080,
  "device_id": "abc123..."
}
```

## Testing

```bash
# Run test suite
pnpm test
```

Tests cover:
1. Boot with missing SELF_ROOT => AMNESIC_SAFE_MODE
2. Create SELF_ROOT + pinned beam => SelfFrame hash stable across restart
3. Tombstone pinned beam => removed from SelfFrame; default queries exclude it
4. Protected tombstone without approval => denied
5. Tombstone spam simulation (200 in tests; scales to 10k+)
6. CDI incident mode: spike detection triggers lockdown
7. Compaction reduces old tombstone bodies to markers

## Design Principles

### Identity ≠ Context

LLM context is ephemeral. Identity comes from BeamStore.

### Boot Invariant

BeamStore is the first thing loaded. If SELF_ROOT is missing or inactive, boot fails explicitly (AMNESIC_SAFE_MODE).

### Append-Only → Lifecycle + Tombstones

Beams have lifecycle states. Tombstoned beams are identity-dead and cannot silently return.

### Model Cannot Write Directly

The model proposes `STORE_BEAM_INTENT`; CDI gates before committing.

### Performance: Boot Scales with Active Beams, Not Tombstones

- Boot time: O(pinned active beams)
- Tombstones stored in marker table (fast membership check)
- Compaction reduces old tombstone bodies to `[TOMBSTONED_MARKER]`

## Alternative Models

Default: **Qwen2.5-7B-Instruct Q4_K_M** (~4.5GB)

Alternatives:
- **Llama-3.1-8B-Instruct Q4_K_M** (~4.9GB)
  ```bash
  # Download manually from Hugging Face
  wget https://huggingface.co/...path-to-llama-3.1-8b-instruct-q4_k_m.gguf \
    -O ~/Library/Application\ Support/Mathison/models/llama-3.1-8b-instruct-q4_k_m.gguf

  # Set as active
  mathison model set llama-3.1-8b-instruct-q4_k_m.gguf
  ```

- **Smaller models** (for testing/low-memory):
  - Qwen2.5-3B-Instruct Q4_K_M (~2.3GB)
  - Phi-3-mini-4k-instruct Q4_K_M (~2.2GB)

## Troubleshooting

### "llama-server not built"

Run:
```bash
./scripts/build-llama.sh
```

### "Model not found"

Run:
```bash
mathison model install
```

Or set a custom model:
```bash
mathison model set /path/to/your/model.gguf
```

### "Device ID mismatch"

Identity is bound to your device. If you see this warning, you may be running on a different Mac. This is expected behavior for device binding.

### Boot fails with "AMNESIC_SAFE_MODE"

SELF_ROOT is missing. Run:
```bash
mathison init
```

### llama-server fails to start

Check port availability:
```bash
lsof -i :8080
```

Change port in config.json if needed.

## Development

### Build from Source

```bash
# Clone repository
git clone <repo-url>
cd mathison

# Install dependencies
pnpm install

# Build kernel package
pnpm -C packages/mathison-kernel-mac build

# Run tests
pnpm -C packages/mathison-kernel-mac test

# Build llama.cpp
cd packages/mathison-kernel-mac
./scripts/build-llama.sh
```

### Package Structure

```
packages/mathison-kernel-mac/
├── src/
│   ├── cli.ts          # CLI entry point
│   ├── kernel.ts       # Kernel boot + REPL
│   ├── llama.ts        # llama.cpp integration
│   ├── model.ts        # Model management
│   ├── device.ts       # Device binding
│   ├── config.ts       # Configuration
│   └── index.ts        # Exports
├── __tests__/
│   └── kernel.test.ts  # Test suite
├── scripts/
│   ├── build-llama.sh  # Build llama.cpp
│   └── build-mac.sh    # Build kernel executable
├── package.json
├── tsconfig.json
└── README.md
```

## License

See repository root for license information.

## Contributing

This is part of the Mathison monorepo. See main README for contribution guidelines.
