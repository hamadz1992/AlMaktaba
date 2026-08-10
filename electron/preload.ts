import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("almaktaba", {
  login: (username: string, password: string) => ipcRenderer.invoke("auth:login", { username, password }),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getSession: () => ipcRenderer.invoke("auth:session"),
  listTransactions: () => ipcRenderer.invoke("transactions:list"),
  createTransaction: (input: unknown) => ipcRenderer.invoke("transactions:create", input),
  updateTransaction: (id: number, input: unknown) => ipcRenderer.invoke("transactions:update", { id, input }),
  voidTransaction: (id: number, reason: string) => ipcRenderer.invoke("transactions:void", { id, reason }),
  backup: () => ipcRenderer.invoke("system:backup"),
  changeOwnPassword: (oldPassword: string, newPassword: string) => ipcRenderer.invoke("auth:change-own-password", { oldPassword, newPassword })
});
