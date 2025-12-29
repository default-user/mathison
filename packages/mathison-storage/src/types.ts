export type StoreBackend = "FILE" | "SQLITE";

export class StoreMisconfiguredError extends Error {
  code = "STORE_MISCONFIGURED" as const;
  constructor(message: string) {
    super(message);
    this.name = "StoreMisconfiguredError";
  }
}

export interface StoreConfig {
  backend: StoreBackend;
  path: string; // FILE: dir root, SQLITE: db file path
}

export function loadStoreConfigFromEnv(env = process.env): StoreConfig {
  const backendRaw = (env.MATHISON_STORE_BACKEND || "").trim().toUpperCase();
  const path = (env.MATHISON_STORE_PATH || "").trim();

  if (!backendRaw) throw new StoreMisconfiguredError("Missing MATHISON_STORE_BACKEND (FILE|SQLITE).");
  if (backendRaw !== "FILE" && backendRaw !== "SQLITE") {
    throw new StoreMisconfiguredError(`Invalid MATHISON_STORE_BACKEND: ${backendRaw} (expected FILE|SQLITE).`);
  }
  if (!path) throw new StoreMisconfiguredError("Missing MATHISON_STORE_PATH.");

  return { backend: backendRaw as StoreBackend, path };
}
