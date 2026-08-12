declare global {
  interface Window {
    almaktaba: {
      login(username: string, password: string): Promise<any>;
      logout(): Promise<any>;
      getSession(): Promise<any>;
      updateProfile(username: string, displayName: string): Promise<any>;
      changeOwnPassword(oldPassword: string, newPassword: string): Promise<any>;
      minimizeWindow(): Promise<any>;
      closeWindow(): Promise<any>;
      listTransactions(): Promise<any[]>;
      listTransactionAudit(): Promise<{ok:boolean;rows?:any[];error?:string}>;
      createTransaction(input: any): Promise<any>;
      updateTransaction(id: number, input: any): Promise<any>;
      voidTransaction(id: number, reason: string): Promise<any>;
      listProducts(): Promise<any[]>;
      createProduct(input: any): Promise<any>;
      updateProduct(id: number, input: any): Promise<any>;
      deleteProduct(id: number): Promise<any>;

      getPartnerCapital(): Promise<any>;
      setPartnerCapital(partnerRole: "partner1" | "partner2", amount: number): Promise<any>;
      getAnnualSettlement(year: number): Promise<any>;

      backup(): Promise<any>;
      backupNow(): Promise<any>;
      getBackupSettings(): Promise<{ok:boolean;intervalMinutes:number;backupDir?:string;error?:string}>;
      setBackupInterval(intervalMinutes: number): Promise<{ok:boolean;intervalMinutes?:number;backupDir?:string;error?:string}>;
    };
  }
}
export {};
