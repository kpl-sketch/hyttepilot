"use client";

import { useState } from "react";
import { photoSrc } from "./cabin-photo";

type Photo = { id: string; width: number; height: number };

/**
 * Bildene på hyttesiden: ett stort bilde, og små bilder under som velger
 * hvilket som vises.
 */
export function PhotoGallery({ photos, cabinName }: { photos: Photo[]; cabinName: string }) {
  const [selected, setSelected] = useState(0);
  if (photos.length === 0) return null;
  const index = Math.min(selected, photos.length - 1);
  const shown = photos[index];
  // Liggende bilder fyller rammen. Stående bilder vises hele, uten beskjæring.
  const upright = shown.height > shown.width;

  return (
    <div className="mb-10">
      {/* Bildene ligger bak innlogging og er allerede forminsket på serveren. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        key={shown.id}
        src={photoSrc(shown.id)}
        alt={`${cabinName}, bilde ${index + 1} av ${photos.length}`}
        width={shown.width}
        height={shown.height}
        decoding="async"
        className={`aspect-[3/2] w-full rounded-lg border border-line bg-surface ${
          upright ? "object-contain" : "object-cover"
        }`}
      />
      {photos.length > 1 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {photos.map((photo, i) => (
            <li key={photo.id}>
              <button
                type="button"
                onClick={() => setSelected(i)}
                aria-label={`Vis bilde ${i + 1} av ${photos.length}`}
                aria-pressed={i === index}
                className={`block cursor-pointer overflow-hidden rounded-md border-2 ${
                  i === index ? "border-pine" : "border-transparent hover:border-line"
                }`}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photoSrc(photo.id, true)}
                  alt=""
                  loading="lazy"
                  decoding="async"
                  className="h-14 w-20 object-cover sm:h-16 sm:w-24"
                />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
