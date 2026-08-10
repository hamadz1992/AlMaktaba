declare global {
  interface Window {
    almaktaba: {
      login(username: string, password: string): Promise<any>;
      logout(): Promise<any>;
      getSession(): Promise<any>;
      listTransactions(): Promise<any[]>;
      createTransaction(input: any): Promise<any>;
      updateTransaction(id: number, input: any): Promise<any>;
      voidTransaction(id: number, reason: string): Promise<any>;
      backup(): Promise<any>;
      changeOwnPassword(oldPassword: string, newPassword: string): Promise<any>;
    };
  }
}
export {};
