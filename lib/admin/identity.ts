/**
 * The two-letter avatar the shell, the sidebar and the switch sheet all draw
 * (template 484 — `avatar(initials,…)`). Derived server-side from the staff
 * row's display name so every surface shows the same letters, and so no screen
 * has to invent its own rule.
 *
 * Not "server-only": the switch sheet renders rows the server sent, and a
 * newly-added row would otherwise have nowhere to get its initials from.
 */
export function initialsOf(nameOrEmail: string): string {
  const name = nameOrEmail.trim();
  if (!name) return "?";
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  const local = name.split("@")[0];
  return local.slice(0, 2).toUpperCase();
}
