import { Volume2, VolumeX } from 'lucide-react';
import { music, toggleMusic } from '../audio/music.ts';
import { useStore } from '../app/store.ts';

export function MusicToggle({ size = 19 }: { size?: number }) {
  const on = useStore(music, (s) => s.on);
  return (
    <button className="icon-btn music-toggle" aria-pressed={on} onClick={toggleMusic} title={on ? 'Music on. Click to mute.' : 'Music off. Click to play.'} aria-label="Music">
      {on ? <Volume2 size={size} /> : <VolumeX size={size} />}
    </button>
  );
}
