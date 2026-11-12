import { apiFetch } from "@/shared/api/client"
import type { AuthRole } from "./types"

export interface AdminAccount {
  id: number
  nom: string
  prenom: string
  email: string
  role: AuthRole
  active: boolean
}

export interface CreateAdminAccountInput {
  nom: string
  prenom: string
  email: string
  password: string
  role: AuthRole
}

export async function fetchAdminAccounts(): Promise<AdminAccount[]> {
  const response = await apiFetch<{ admins: AdminAccount[] }>("/api/admins")
  return response.admins
}

export async function createAdminAccount(
  input: CreateAdminAccountInput,
): Promise<AdminAccount> {
  const response = await apiFetch<{ admin: AdminAccount }>("/api/admins", {
    method: "POST",
    body: input,
  })
  return response.admin
}
