declare module "sql.js" {
  export interface SqlJsConfig {
    locateFile?: (file: string) => string;
  }

  export class Database {
    constructor(data?: Uint8Array);
    export(): Uint8Array;
    prepare(sql: string): Statement;
    run(sql: string, params?: unknown[]): void;
  }

  export interface Statement {
    bind(params?: unknown[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  interface InitSqlJs {
    (config?: SqlJsConfig): Promise<typeof SQLModule>;
  }

  const initSqlJs: InitSqlJs;
  const SQLModule: {
    Database: typeof Database;
  };
  export default initSqlJs;
}