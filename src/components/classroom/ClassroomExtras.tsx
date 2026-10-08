import { useEffect, useState } from 'react';
import { PreJoin, type LocalUserChoices } from '@livekit/components-react';
import type { RoomOptions } from 'livekit-client';
import { PictureInPicture2 } from 'lucide-react';

export type { LocalUserChoices };

/** Room options carrying the mic/camera device the person picked in the lobby. */
export function roomOptionsFrom(c: LocalUserChoices): RoomOptions {
  return {
    audioCaptureDefaults: c.audioDeviceId ? { deviceId: c.audioDeviceId } : undefined,
    videoCaptureDefaults: c.videoDeviceId ? { deviceId: c.videoDeviceId } : undefined,
  };
}

/**
 * Google-Meet-style "Ready to join?" screen: camera preview, mic/camera
 * on-off toggles and device pickers, shown BEFORE anyone enters the room —
 * students, demo guests and trainers alike. The display name is fixed by the
 * server-issued token, so the name box is hidden.
 */
export function Lobby({ title, subtitle, name, joinLabel = 'Join now', onSubmit, onBack }: {
  title: string; subtitle?: string; name: string; joinLabel?: string;
  onSubmit: (c: LocalUserChoices) => void; onBack?: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-[#0f1115] z-50 overflow-y-auto" data-lk-theme="default">
      {/* The preview video was tall enough to push the Join button below the
          fold (and flex-centering made the overflow unscrollable) — cap the
          preview height and let the page scroll. */}
      <style>{`
        /* the Join button lives INSIDE .lk-username-container, so hide only the name input */
        .lk-username-container{display:flex !important;flex-direction:column;gap:0;width:100%}
        .lk-username-container input{display:none !important}
        .lk-username-container .lk-join-button{width:100%;padding:0.75rem 1rem;font-size:1rem;font-weight:600;background:#2563eb;color:#fff;border-radius:0.5rem}
        .lk-prejoin{width:100% !important;max-width:none !important;padding:0 !important}
        .lk-prejoin .lk-video-container{max-height:38vh}
        .lk-prejoin video{max-height:38vh;width:100%;object-fit:cover}
      `}</style>
      <div className="min-h-full flex items-center justify-center p-4">
      <div className="w-full max-w-xl space-y-4 py-4">
        <div className="text-center text-white space-y-1">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle && <p className="text-sm text-white/60">{subtitle}</p>}
          <p className="text-sm text-white/60">Ready to join? Check your camera and mic first.</p>
        </div>
        <PreJoin
          defaults={{ username: name, videoEnabled: true, audioEnabled: true }}
          joinLabel={joinLabel}
          persistUserChoices={false}
          onSubmit={onSubmit}
          onError={() => { /* permission errors are shown inside PreJoin itself */ }}
        />
        {onBack && <button onClick={onBack} className="block mx-auto px-4 py-2 text-sm rounded-lg bg-white/10 text-white hover:bg-white/20">Go back</button>}
      </div>
      </div>
    </div>
  );
}

/** Pick the video worth popping out: a screen share if there is one, else the largest playing video in the room. */
function pickVideo(): HTMLVideoElement | null {
  const vids = Array.from(document.querySelectorAll<HTMLVideoElement>('.lk-video-conference video, [data-lk-theme] video'))
    .filter((v) => v.readyState >= 2 && v.videoWidth > 0 && !v.paused);
  if (!vids.length) return null;
  const screen = vids.find((v) => v.closest('[data-lk-source="screen_share"]'));
  if (screen) return screen;
  return vids.sort((a, b) => b.videoWidth * b.videoHeight - a.videoWidth * a.videoHeight)[0];
}

/**
 * Picture-in-picture: pops the main class video (the trainer / shared screen)
 * into a small floating window that stays on top while the person works in
 * other tabs or apps. Also registers the browser's automatic PiP for
 * video-conferencing pages (Chrome), so switching tabs pops it out by itself.
 */
export function PipButton({ className = '' }: { className?: string }) {
  const [supported] = useState(() => typeof document !== 'undefined' && 'pictureInPictureEnabled' in document && document.pictureInPictureEnabled);
  const [active, setActive] = useState(false);

  const enter = async () => {
    const v = pickVideo();
    if (!v) return;
    try { v.disablePictureInPicture = false; await v.requestPictureInPicture(); } catch { /* denied / no gesture */ }
  };

  useEffect(() => {
    if (!supported) return undefined;
    const onEnter = () => setActive(true);
    const onLeave = () => setActive(false);
    document.addEventListener('enterpictureinpicture', onEnter, true);
    document.addEventListener('leavepictureinpicture', onLeave, true);
    try {
      // Chrome's "auto picture-in-picture for video calls" hook.
      (navigator.mediaSession as unknown as { setActionHandler: (a: string, h: (() => void) | null) => void })
        .setActionHandler('enterpictureinpicture', () => { void enter(); });
    } catch { /* unsupported action — button still works */ }
    return () => {
      document.removeEventListener('enterpictureinpicture', onEnter, true);
      document.removeEventListener('leavepictureinpicture', onLeave, true);
      try { (navigator.mediaSession as unknown as { setActionHandler: (a: string, h: null) => void }).setActionHandler('enterpictureinpicture', null); } catch { /* ignore */ }
    };
  }, [supported]);

  if (!supported) return null;
  return (
    <button
      onClick={() => { if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {}); else void enter(); }}
      title="Picture-in-picture: float the class video over other windows"
      className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium ${active ? 'bg-blue-500/40' : 'hover:bg-white/10'} ${className}`}
    >
      <PictureInPicture2 className="w-3.5 h-3.5" /> {active ? 'Exit PiP' : 'Pop out'}
    </button>
  );
}
