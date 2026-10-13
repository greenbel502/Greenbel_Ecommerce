export type HeaderAccount = {
  name: string;
  email: string;
  avatarUrl: string | null;
  staffEntry: { href: "/admin/catalogo" | "/admin/inventario"; label: string } | null;
};
