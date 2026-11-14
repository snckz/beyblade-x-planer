import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import type { Bit, Ratchet } from '../lib/types';
import { useApp } from '../lib/context';

type Size = 'sm' | 'md';

/** Foto eines Teils vom Beyblade Wiki (verlinkt); bei Ladefehler greift der Fallback. */
function PartPhoto({ src, alt, size, fallback }: { src?: string; alt: string; size: Size; fallback: ComponentChildren }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    return (
      <span class={`bit-img bit-img-${size}`}>
        <img src={src} alt={alt} loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setFailed(true)} />
      </span>
    );
  }
  return <>{fallback}</>;
}

/** Foto eines Bits; ohne Foto das Kürzel als Plakette. */
export function BitImage({ bit, size = 'sm' }: { bit: Bit; size?: Size }) {
  const { images } = useApp();
  return (
    <PartPhoto
      src={images.bits?.[bit.id]?.thumb}
      alt={bit.name}
      size={size}
      fallback={<span class={`bit-img bit-img-${size} bit-fallback type-fg-${bit.type}`}>{bit.id}</span>}
    />
  );
}

/** Eigenes Ratchet-Emblem: Ring mit so vielen Zacken, wie der Ratchet hat. */
function RatchetEmblem({ contacts }: { contacts: number }) {
  const n = Math.max(0, Math.min(12, contacts));
  return (
    <svg viewBox="0 0 40 40" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <rect key={i} x="17" y="3.5" width="6" height="8" rx="1.5" class="ratchet-tooth" transform={`rotate(${(360 / n) * i} 20 20)`} />
      ))}
      <circle cx="20" cy="20" r="11" class="ratchet-ring" />
      <circle cx="20" cy="20" r="4.5" class="ratchet-hub" />
    </svg>
  );
}

/** Foto eines Ratchets; ohne Foto ein gezeichnetes Emblem. */
export function RatchetImage({ ratchet, size = 'sm' }: { ratchet: Ratchet; size?: Size }) {
  const { images } = useApp();
  return (
    <PartPhoto
      src={images.ratchets?.[ratchet.id]?.thumb}
      alt={`Ratchet ${ratchet.id}`}
      size={size}
      fallback={
        <span class={`bit-img bit-img-${size} ratchet-fallback`}>
          <RatchetEmblem contacts={ratchet.contacts ?? 0} />
        </span>
      }
    />
  );
}
