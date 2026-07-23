export type Role = "reader" | "writer";

export interface AuthedAccount {
  id: string;
  email: string;
  roles: Set<Role>;
}
