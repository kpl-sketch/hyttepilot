import { AreaMap } from "@/components/area-map";
import { Avatar } from "@/components/avatar";
import { PhotoGallery } from "@/components/photo-gallery";
import { ButtonLink, buttonClass, Panel } from "@/components/ui";
import { APP_NAME, WHAT_IT_IS } from "@/lib/brand";
import { firstName } from "@/lib/emails";
import type { Position } from "@/lib/position";

export type InvitationCabin = {
  area: string;
  areaPosition: Position | null;
  photos: { id: string; width: number; height: number }[];
};

/**
 * Det den inviterte ser etter ett klikk, uten innlogging: hvem som låner bort
 * hytta, bildene, området på kart og ideen. Neste steg er å logge inn.
 *
 * Brukes både på invitasjonssiden og i eierens forhåndsvisning. Uten
 * `loginHref` er det en forhåndsvisning: knappen vises, men leder ingen steder.
 * Feltene er bare dem getInvitationPreview gir, så forhåndsvisningen kan ikke
 * vise mer enn den inviterte faktisk ser.
 */
export function InvitationCabinPreview({
  inviterName,
  inviterAvatar = null,
  accepted,
  cabin,
  photoBase,
  loginHref,
}: {
  inviterName: string;
  /** Adressen til bildet av den som inviterer, se inviterAvatarSrc. Null uten bilde. */
  inviterAvatar?: string | null;
  accepted: boolean;
  cabin: InvitationCabin;
  /** Hvor bildene hentes fra, se photoSrc. */
  photoBase?: string;
  loginHref?: string;
}) {
  const inviter = firstName(inviterName);
  const buttonText = accepted ? "Logg inn og se ledige datoer" : "Bli med og se ledige datoer";
  return (
    <>
      {/* Bildet av den som inviterer, står først: en du kjenner, ikke en tjeneste. */}
      {inviterAvatar && (
        <p className="mb-4 flex items-center gap-3 text-lg font-semibold">
          <Avatar name={inviterName} src={inviterAvatar} size="lg" />
          <span>{inviterName}</span>
        </p>
      )}
      <h1 className="max-w-[22ch] text-4xl font-bold leading-tight tracking-tight sm:text-5xl">
        {inviter} låner deg hytta si
      </h1>
      <p className="mt-4 max-w-[56ch] text-xl">
        Har du hytte, kan du velge å låne bort din også.
      </p>

      <div className="mt-8">
        <PhotoGallery photos={cabin.photos} cabinName={`Hytta i ${cabin.area}`} base={photoBase} />
      </div>

      <section aria-labelledby="hvor" className="mb-10">
        <h2 id="hvor" className="text-xl font-bold">
          Hytta ligger i {cabin.area}
        </h2>
        {cabin.areaPosition && <AreaMap position={cabin.areaPosition} area={cabin.area} />}
        <p className="mt-2 max-w-[60ch] text-sm text-muted">
          Kartet viser området, ikke selve hytta. Adressen får du når lånet er betalt.
        </p>
      </section>

      <section aria-labelledby="ideen" className="mb-10 max-w-[60ch] space-y-3 text-lg">
        <h2 id="ideen" className="text-xl font-bold">
          Slik virker {APP_NAME}
        </h2>
        <p>
          I {APP_NAME} {WHAT_IT_IS}.
        </p>
        <p>
          {inviter} bestemmer når hytta er ledig, og svarer ja eller nei på hver forespørsel.
          {inviter} setter prisen, og du betaler med Vipps.
        </p>
      </section>

      <Panel>
        <h2 className="text-2xl font-bold">Vil du låne hytta?</h2>
        <p className="mt-2 max-w-[56ch]">
          {accepted
            ? "Logg inn for å se når hytta er ledig, og be om å låne den."
            : `Bli med for å se når hytta er ledig, hva den koster, og be ${inviter} om å låne den. Du får en kode på e-post. Det finnes ingen passord.`}
        </p>
        {loginHref ? (
          <ButtonLink href={loginHref} className="mt-4">
            {buttonText}
          </ButtonLink>
        ) : (
          <span aria-disabled="true" className={buttonClass("primary", "mt-4 cursor-default")}>
            {buttonText}
          </span>
        )}
      </Panel>
    </>
  );
}
