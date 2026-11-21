import type { Appearance } from '@ea/shared';
import { BUST_VIEWBOX, PixelBust } from './pixel-art/character';
import { usePortrait } from './use-portrait';

interface AgentAvatarProps {
  agentId: string;
  /** The look the user chose; null or absent draws the robot of the id. */
  appearance?: Appearance | null;
  /** Rendered size in pixels. */
  size?: number;
  dimmed?: boolean;
}

export function AgentAvatar({
  agentId,
  appearance = null,
  size = 40,
  dimmed = false,
}: AgentAvatarProps) {
  const picture = usePortrait(agentId, appearance);
  // The same look in 3D, as in the office (the voxel figure); until it is drawn, or without WebGL, the 2D bust.
  if (picture)
    return (
      <img
        src={picture}
        alt=""
        aria-hidden
        width={size}
        height={size}
        draggable={false}
        className={`shrink-0 rounded-md bg-sheet-raised ${dimmed ? 'opacity-45' : ''}`}
      />
    );
  return (
    <svg
      viewBox={BUST_VIEWBOX}
      width={size}
      height={size}
      aria-hidden
      className="shrink-0 rounded-md bg-sheet-raised"
      opacity={dimmed ? 0.45 : 1}
    >
      <PixelBust agentId={agentId} appearance={appearance} />
    </svg>
  );
}
