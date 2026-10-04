import { useCallback, useEffect, useRef, useState } from 'react';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import { Maximize, Minimize } from 'lucide-react';

const PLAYBACK_RATES = [1, 1.5, 2, 4];
const WATERMARK_COUNT = 4;
const WATERMARK_MOVE_MS = 6000;

type Spot = { top: number; left: number; rotate: number };

function randomSpots(): Spot[] {
  return Array.from({ length: WATERMARK_COUNT }, () => ({
    top: 6 + Math.random() * 78,
    left: 2 + Math.random() * 62,
    rotate: -20 + Math.random() * 40,
  }));
}

/**
 * Class-recording player with the usual "don't let it walk out the door"
 * deterrents:
 *
 *  - no download button, no right-click menu, no Picture-in-Picture / cast,
 *    and the browser's own fullscreen is replaced by one on our wrapper (so
 *    the watermark below stays on screen in fullscreen too);
 *  - the viewer's own email drifts around the picture at 25% opacity, so any
 *    screen recording or phone-camera capture of the playback carries the
 *    name of whoever leaked it;
 *  - playback pauses whenever the tab/window is hidden.
 *
 * Honest limits: a web page cannot stop OS-level screen capture or a
 * determined person with dev tools — real "records as a black screen"
 * protection needs DRM-encrypted streaming (Widevine/FairPlay), which is a
 * different video pipeline from the plain signed-URL files used here.
 */
export default function ProtectedVideoPlayer({ url }: { url: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const email = useSelector((s: RootState) => s.auth.user?.email) || '';
  const [rate, setRate] = useState(1);
  const [spots, setSpots] = useState<Spot[]>(randomSpots);
  const [isFullscreen, setIsFullscreen] = useState(false);

  // Drift the watermarks to new random spots every few seconds (the CSS
  // transition on each one makes it a slow glide rather than a jump).
  useEffect(() => {
    const t = setInterval(() => setSpots(randomSpots()), WATERMARK_MOVE_MS);
    return () => clearInterval(t);
  }, []);

  // Pause when the tab/window loses visibility.
  useEffect(() => {
    const onHide = () => { if (document.hidden) videoRef.current?.pause(); };
    document.addEventListener('visibilitychange', onHide);
    return () => document.removeEventListener('visibilitychange', onHide);
  }, []);

  useEffect(() => {
    const onFs = () => setIsFullscreen(document.fullscreenElement === wrapRef.current);
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  const setPlaybackRate = (r: number) => {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  };

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else wrapRef.current?.requestFullscreen().catch(() => {});
  }, []);

  return (
    <div className="space-y-2">
      <div
        ref={wrapRef}
        className={`relative overflow-hidden bg-black select-none ${isFullscreen ? 'flex items-center justify-center' : 'rounded-lg'}`}
        onContextMenu={(e) => e.preventDefault()}
      >
        <video
          ref={videoRef}
          src={url}
          controls
          autoPlay
          controlsList="nodownload nofullscreen noremoteplayback"
          disablePictureInPicture
          playsInline
          onContextMenu={(e) => e.preventDefault()}
          onDragStart={(e) => e.preventDefault()}
          className={`w-full bg-black ${isFullscreen ? 'h-full max-h-screen' : 'max-h-[50vh]'}`}
        />

        {/* Floating viewer-email watermark. pointer-events-none so it never
            blocks the player controls underneath. */}
        {email && (
          <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
            {spots.map((s, i) => (
              <span
                key={i}
                className="absolute whitespace-nowrap text-sm font-semibold text-white"
                style={{
                  top: `${s.top}%`,
                  left: `${s.left}%`,
                  opacity: 0.25,
                  transform: `rotate(${s.rotate}deg)`,
                  textShadow: '0 0 3px rgba(0,0,0,0.7)',
                  transition: `top ${WATERMARK_MOVE_MS}ms linear, left ${WATERMARK_MOVE_MS}ms linear, transform ${WATERMARK_MOVE_MS}ms linear`,
                }}
              >
                {email}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1.5 flex-wrap">
        <span className="text-xs text-muted-foreground mr-1">Speed:</span>
        {PLAYBACK_RATES.map((r) => (
          <button
            key={r}
            onClick={() => setPlaybackRate(r)}
            className={`px-2.5 py-1 text-xs rounded-md border font-medium ${rate === r ? 'bg-blue-600 text-white border-blue-600' : 'hover:bg-muted'}`}
          >
            {r}x
          </button>
        ))}
        <button onClick={toggleFullscreen} className="ml-auto px-2.5 py-1 text-xs rounded-md border font-medium hover:bg-muted inline-flex items-center gap-1">
          {isFullscreen ? <Minimize className="w-3 h-3" /> : <Maximize className="w-3 h-3" />} {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
      </div>
    </div>
  );
}
