declare module "sql.js" {
  export interface Statement {
    bind(params?: any[]): void;
    step(): boolean;
    getAsObject(): Record<string, unknown>;
    free(): void;
  }

  export interface Database {
    run(sql: string, params?: any[]): void;
    prepare(sql: string): Statement;
    export(): Uint8Array;
  }

  interface SqlJsStatic {
    Database: new (data?: Uint8Array | ArrayBuffer | number[]) => Database;
  }

  type SqlJsConfig = {
    locateFile?: (file: string) => string;
  };

  const initSqlJs: (config?: SqlJsConfig) => Promise<SqlJsStatic>;
  export default initSqlJs;
}
