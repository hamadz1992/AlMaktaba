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
      createTransaction(input: any): Promise<any>;
      updateTransaction(id: number, input: any): Promise<any>;
      voidTransaction(id: number, reason: string): Promise<any>;
      listProducts(): Promise<any[]>;
      createProduct(input: any): Promise<any>;
      updateProduct(id: number, input: any): Promise<any>;
      deleteProduct(id: number): Promise<any>;
      backup(): Promise<any>;
    };
  }
}
export {};
