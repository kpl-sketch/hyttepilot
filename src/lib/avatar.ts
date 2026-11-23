/*
 * Adressene til profilbilder. Filen brukes både i nettleseren og på serveren,
 * så den skal ikke importere noe som bare finnes ett av stedene.
 *
 * `version` kommer fra tjenestelaget (profilePhotoVersion) og er null når
 * personen ikke har bilde. Da gir funksjonene null, og siden viser initialen.
 */

/** Bildet av et medlem, for innloggede. Reglene ligger i getProfilePhotoForViewer. */
export function avatarSrc(
  userId: string,
  version: string | null | undefined,
  size: "liten" | "stor" = "liten",
): string | null {
  if (!version) return null;
  const base = `/profilbilder/${encodeURIComponent(userId)}?v=${encodeURIComponent(version)}`;
  return size === "liten" ? `${base}&s=liten` : base;
}

/**
 * Bildet av den som sendte en invitasjon, hentet med nøkkelen i lenken. Virker
 * også uten innlogging, så lenge invitasjonen gjelder.
 */
export function inviterAvatarSrc(
  token: string,
  version: string | null | undefined,
): string | null {
  if (!version) return null;
  return `/invitasjon/${token}/avsender?v=${encodeURIComponent(version)}`;
}
