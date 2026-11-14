import { useState } from 'preact/hooks';
import type { Bit } from '../lib/types';
import { useApp } from '../lib/context';

/** Foto eines Bits vom Beyblade Wiki (verlinkt); ohne Foto das Kürzel als Plakette. */
export function BitImage({ bit, size = 'sm' }: { bit: Bit; size?: 'sm' | 'md' }) {
  const { images } = useApp();
  const img = images.bits?.[bit.id];
  const [failed, setFailed] = useState(false);
  if (img && !failed) {
    return (
      <span class={`bit-img bit-img-${size}`}>
        <img src={img.thumb} alt={bit.name} loading="lazy" decoding="async" referrerpolicy="no-referrer" onError={() => setFailed(true)} />
      </span>
    );
  }
  return <span class={`bit-img bit-img-${size} bit-fallback type-fg-${bit.type}`}>{bit.id}</span>;
}
