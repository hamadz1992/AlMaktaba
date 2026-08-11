import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("almaktaba", {
  login: (username: string, password: string) => ipcRenderer.invoke("auth:login", { username, password }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getSession: () => ipcRenderer.invoke("auth:session"),
  updateProfile: (username: string, displayName: string) => ipcRenderer.invoke("auth:update-profile", { username, displayName }),
  changeOwnPassword: (oldPassword: string, newPassword: string) => ipcRenderer.invoke("auth:change-own-password", { oldPassword, newPassword }),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  listTransactions: () => ipcRenderer.invoke("transactions:list"),
  listTransactionAudit: () => ipcRenderer.invoke("audit:transactions"),
  createTransaction: (input: unknown) => ipcRenderer.invoke("transactions:create", input),
  updateTransaction: (id: number, input: unknown) => ipcRenderer.invoke("transactions:update", { id, input }),
  voidTransaction: (id: number, reason: string) => ipcRenderer.invoke("transactions:void", { id, reason }),
  listProducts: () => ipcRenderer.invoke("products:list"),
  createProduct: (input: unknown) => ipcRenderer.invoke("products:create-safe", input),
  updateProduct: (id: number, input: unknown) => ipcRenderer.invoke("products:update", { id, input }),
  deleteProduct: (id: number) => ipcRenderer.invoke("products:delete", id),
  backup: () => ipcRenderer.invoke("system:backup")
});
