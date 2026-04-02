/**
 * Login (Google OAuth) só é exigido com AUTH_ENABLED=true.
 * Sem isso, a app usa um usuário local no PostgreSQL (ver dev-user.ts).
 */
export const authEnabled = process.env.AUTH_ENABLED === "true";
