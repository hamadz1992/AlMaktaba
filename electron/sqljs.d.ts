declare module "sql.js" {
  export class Database {
    constructor(data?: Uint8Array | ArrayBuffer | number[]);
    run(sql: string, params?: any[]): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  export interface Statement {
    bind(params?: any[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  interface SqlJsStatic {
    Database: typeof Database;
  }

  type SqlJsConfig = {
    locateFile?: (file: string) => string;
  };

  export default function initSqlJs(config?: SqlJsConfig): Promise<SqlJsStatic>;
}