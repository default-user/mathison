// Public API exports - DO NOT export raw backends or makeStoresFromEnv
// to prevent governance bypass via direct storage access
export * from "./types";
export * from "./checkpoint_store";
export * from "./receipt_store";
export * from "./graph_store";
export * from "./knowledge_store";
export * from "./beam_store";

// Storage adapter factory (gated by governance seal)
export * from "./storage-adapter";

// Storage sealing mechanism
export * from "./storage-seal";

// Receipt chain
export * from "./receipt-chain";

// Export Stores interface from factory (but not the factory function itself)
export type { Stores } from "./factory";

// INTERNAL USE ONLY - DO NOT RE-EXPORT
// These are available via internal imports but not from package root:
// - src/factory: makeStoresFromEnv (use makeStorageAdapterFromEnv instead)
// - src/backends/file: File* constructors
// - src/backends/sqlite: SQLite* constructors
