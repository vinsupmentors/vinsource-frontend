import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { RootState } from '@/store';
import api from '@/lib/api';
import { LiveClass, formatTimeRange, formatClassDate, errMsg } from '@/lib/liveClasses';
import {
  LiveKitRoom, VideoConference, useParticipants, useLocalParticipant, useRoomContext, RoomAudioRenderer,
} from '@livekit/components-react';
import { RoomEvent } from 'livekit-client';
import '@livekit/components-styles';
import {
  Loader2, Video, Mic, MicOff, VideoOff, Users, X, LogOut, PhoneOff, ShieldAlert, AlertTriangle, Hand,
} from 'lucide-react';

interface JoinResponse {
  waitingForHost: boolean;
  canHost: boolean;
  token?: string;
  url?: string;
  roomName?: string;
}

/**
 * Standalone full-screen route (outside DashboardLayout/StudentLayout — a
 * classroom needs the whole viewport, not the app chrome). Reachable by both
 * staff and students; the backend's own /join endpoint decides what each
 * caller is allowed to see, this page just renders whatever it gets back.
 */
export default function LiveClassroom() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const user = useSelector((s: RootState) => s.auth.user);

  const [liveClass, setLiveClass] = useState<LiveClass | null>(null);
  const [join, setJoin] = useState<JoinResponse | null>(null);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [connected, setConnected] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadClass = useCallback(() => {
    if (!id) return;
    api.get(`/api/live-classes/${id}`).then((r) => setLiveClass(r.data.data)).catch((err) => setError(errMsg(err, 'Could not load this class.')));
  }, [id]);

  const attemptJoin = useCallback(() => {
    if (!id) return;
    api.post(`/api/live-classes/${id}/join`)
      .then((r) => setJoin(r.data.data))
      .catch((err) => setError(errMsg(err, 'Could not join this class.')));
  }, [id]);

  useEffect(() => { loadClass(); attemptJoin(); }, [loadClass, attemptJoin]);

  // While waiting for the host, poll every 8s so a student's screen flips to
  // the live room automatically the moment the trainer hits Start.
  useEffect(() => {
    if (join?.waitingForHost && !join.canHost) {
      pollRef.current = setInterval(attemptJoin, 8000);
      return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }
    return undefined;
  }, [join, attemptJoin]);

  const startClass = () => {
    if (!id) return;
    setStarting(true);
    api.post(`/api/live-classes/${id}/start`)
      .then((r) => setJoin({ waitingForHost: false, canHost: true, token: r.data.data.token, url: r.data.data.url, roomName: r.data.data.roomName }))
      .catch((err) => setError(errMsg(err, 'Could not start the class.')))
      .finally(() => setStarting(false));
  };

  const leaveRoom = useCallback(() => {
    if (id) api.post(`/api/live-classes/${id}/leave`).catch(() => {});
    navigate(-1);
  }, [id, navigate]);

  const endClass = () => {
    if (!id) return;
    if (!window.confirm('End this class for everyone? All participants will be disconnected.')) return;
    api.post(`/api/live-classes/${id}/end`)
      .then(() => navigate(-1))
      .catch((err) => setError(errMsg(err, 'Could not end the class.')));
  };

  if (error) {
    return (
      <FullScreenShell>
        <div className="max-w-md text-center space-y-3">
          <ShieldAlert className="w-10 h-10 text-red-500 mx-auto" />
          <p className="text-white font-medium">{error}</p>
          <button onClick={() => navigate(-1)} className="px-4 py-2 text-sm rounded-lg bg-white/10 text-white hover:bg-white/20">Go back</button>
        </div>
      </FullScreenShell>
    );
  }

  if (!liveClass || !join) {
    return (
      <FullScreenShell>
        <Loader2 className="w-8 h-8 animate-spin text-white" />
      </FullScreenShell>
    );
  }

  // Connected token in hand → render the room.
  if (join.token && join.url && join.roomName) {
    return (
      <LiveKitRoom
        serverUrl={join.url}
        token={join.token}
        connect
        video
        audio
        data-lk-theme="default"
        style={{ height: '100vh' }}
        onDisconnected={() => { if (id) api.post(`/api/live-classes/${id}/leave`).catch(() => {}); }}
        onConnected={() => setConnected(true)}
      >
        <RoomAudioRenderer />
        <ClassroomChrome
          liveClass={liveClass}
          canHost={join.canHost}
          onEnd={endClass}
          onLeave={() => { navigate(-1); }}
          connected={connected}
        />
        <VideoConference />
      </LiveKitRoom>
    );
  }

  // Not live yet.
  if (join.waitingForHost) {
    return (
      <FullScreenShell>
        <div className="max-w-md text-center space-y-4">
          <Video className="w-10 h-10 text-blue-400 mx-auto" />
          <div>
            <p className="text-white font-semibold text-lg">{liveClass.title}</p>
            <p className="text-white/60 text-sm">{liveClass.schedule.course.name} · {liveClass.schedule.batch.code}</p>
            <p className="text-white/60 text-sm">{formatClassDate(liveClass.scheduledDate)} · {formatTimeRange(liveClass.startTime, liveClass.endTime)}</p>
          </div>
          {join.canHost ? (
            <button onClick={startClass} disabled={starting} className="px-6 py-2.5 text-sm rounded-lg bg-blue-600 text-white font-medium disabled:opacity-50 inline-flex items-center gap-2">
              {starting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Video className="w-4 h-4" />} Start Class
            </button>
          ) : (
            <div className="space-y-2">
              <Loader2 className="w-5 h-5 animate-spin text-white/60 mx-auto" />
              <p className="text-white/60 text-sm">Waiting for the trainer to start the class...</p>
            </div>
          )}
          <button onClick={() => navigate(-1)} className="block mx-auto px-4 py-2 text-sm rounded-lg bg-white/10 text-white hover:bg-white/20">Go back</button>
        </div>
      </FullScreenShell>
    );
  }

  return (
    <FullScreenShell>
      <div className="text-center space-y-2">
        <AlertTriangle className="w-8 h-8 text-amber-400 mx-auto" />
        <p className="text-white/80 text-sm">Something unexpected happened. Try going back and joining again.</p>
        <button onClick={() => navigate(-1)} className="px-4 py-2 text-sm rounded-lg bg-white/10 text-white hover:bg-white/20">Go back</button>
      </div>
    </FullScreenShell>
  );
}

function FullScreenShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-[#0f1115] flex items-center justify-center z-50">
      {children}
    </div>
  );
}

/** Ephemeral, in-session only — raised hands live purely on LiveKit's data
 * channel (broadcast reliably to the whole room), not persisted anywhere.
 * There's no central authority: every client (including the sender) applies
 * messages to its own local Set the moment they're sent/received, so all
 * clients converge on the same state without a round trip through the
 * backend. A host's "Lower" action is just another broadcast message that
 * every client (including the raised student's own) applies identically —
 * which is also what makes the student's own button flip back off. */
type RaiseHandMessage = { type: 'raise_hand'; identity: string; raised: boolean } | { type: 'lower_hand'; identity: string };

function useRaiseHand() {
  const room = useRoomContext();
  const [raisedHands, setRaisedHands] = useState<Set<string>>(new Set());

  const applyLocally = useCallback((msg: RaiseHandMessage) => {
    setRaisedHands((prev) => {
      const next = new Set(prev);
      if (msg.type === 'raise_hand') {
        if (msg.raised) next.add(msg.identity); else next.delete(msg.identity);
      } else {
        next.delete(msg.identity);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const decoder = new TextDecoder();
    const handler = (payload: Uint8Array) => {
      try {
        const msg = JSON.parse(decoder.decode(payload)) as RaiseHandMessage;
        if (msg && (msg.type === 'raise_hand' || msg.type === 'lower_hand')) applyLocally(msg);
      } catch {
        // Ignore malformed/unrelated data-channel payloads.
      }
    };
    room.on(RoomEvent.DataReceived, handler);
    return () => { room.off(RoomEvent.DataReceived, handler); };
  }, [room, applyLocally]);

  const send = useCallback((msg: RaiseHandMessage) => {
    room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(msg)), { reliable: true });
    applyLocally(msg); // publishData doesn't loop back to the sender — apply it ourselves
  }, [room, applyLocally]);

  const myIdentity = room.localParticipant.identity;
  return {
    raisedHands,
    myRaised: raisedHands.has(myIdentity),
    toggleMine: () => send({ type: 'raise_hand', identity: myIdentity, raised: !raisedHands.has(myIdentity) }),
    lowerHand: (identity: string) => send({ type: 'lower_hand', identity }),
  };
}

/** Role is carried in the LiveKit participant's own `metadata` (set at token
 * mint time — see liveClasses.controller.ts `start`/`join`), so the UI can
 * show "who's hosting" without a separate REST fetch. Best-effort parse:
 * malformed/missing metadata (e.g. an older token) just shows no badge. */
function parseRole(metadata?: string): 'HOST' | 'CO_TRAINER' | 'STUDENT' | null {
  if (!metadata) return null;
  try {
    const role = JSON.parse(metadata)?.role;
    return role === 'HOST' || role === 'CO_TRAINER' || role === 'STUDENT' ? role : null;
  } catch {
    return null;
  }
}

const ROLE_LABEL: Record<'HOST' | 'CO_TRAINER' | 'STUDENT', string> = {
  HOST: 'Host', CO_TRAINER: 'Co-Trainer', STUDENT: 'Student',
};

/** Thin overlay bar above LiveKit's own VideoConference UI: class title, participant count, raise-hand, host-only End Class, everyone's Leave. */
function ClassroomChrome({ liveClass, canHost, onEnd, onLeave }: { liveClass: LiveClass; canHost: boolean; onEnd: () => void; onLeave: () => void; connected: boolean }) {
  const participants = useParticipants();
  const { localParticipant } = useLocalParticipant();
  const [showParticipants, setShowParticipants] = useState(false);
  const { raisedHands, myRaised, toggleMine, lowerHand } = useRaiseHand();
  const myRole = parseRole(localParticipant.metadata);

  return (
    <div className="absolute top-0 left-0 right-0 z-[60] flex items-center justify-between px-4 py-2 bg-black/60 backdrop-blur-sm text-white text-sm">
      <div className="flex items-center gap-3 min-w-0">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-red-400"><span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" /> LIVE</span>
        <span className="font-medium truncate">{liveClass.title}</span>
        <span className="text-white/50 hidden sm:inline truncate">{liveClass.schedule.course.name} · {liveClass.schedule.batch.code}</span>
        {canHost && myRole && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${myRole === 'HOST' ? 'bg-blue-500/30 text-blue-200' : 'bg-purple-500/30 text-purple-200'}`}>
            You: {ROLE_LABEL[myRole]}
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {!canHost && (
          <button
            onClick={toggleMine}
            title={myRaised ? 'Lower hand' : 'Raise hand'}
            className={`px-2.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 text-xs font-medium ${myRaised ? 'bg-amber-500 text-black' : 'hover:bg-white/10'}`}
          >
            <Hand className="w-3.5 h-3.5" /> {myRaised ? 'Hand raised' : 'Raise hand'}
          </button>
        )}
        <button onClick={() => setShowParticipants((v) => !v)} className="relative px-2.5 py-1.5 rounded-lg hover:bg-white/10 inline-flex items-center gap-1.5 text-xs">
          <Users className="w-3.5 h-3.5" /> {participants.length}
          {raisedHands.size > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-black text-[10px] font-bold flex items-center justify-center">{raisedHands.size}</span>
          )}
        </button>
        {canHost ? (
          <button onClick={onEnd} className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 inline-flex items-center gap-1.5 text-xs font-medium">
            <PhoneOff className="w-3.5 h-3.5" /> End Class
          </button>
        ) : (
          <button onClick={onLeave} className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 inline-flex items-center gap-1.5 text-xs font-medium">
            <LogOut className="w-3.5 h-3.5" /> Leave
          </button>
        )}
      </div>

      {showParticipants && (
        <div className="absolute top-12 right-4 w-72 max-h-96 overflow-y-auto bg-[#1a1d23] border border-white/10 rounded-xl shadow-xl">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/10">
            <span className="font-medium text-xs">Participants ({participants.length})</span>
            <button onClick={() => setShowParticipants(false)}><X className="w-3.5 h-3.5" /></button>
          </div>
          <div className="py-1">
            {participants
              .slice()
              .sort((a: (typeof participants)[number], b: (typeof participants)[number]) => Number(raisedHands.has(b.identity)) - Number(raisedHands.has(a.identity)))
              .map((p: (typeof participants)[number]) => (
                <ParticipantRow
                  key={p.identity}
                  identity={p.identity}
                  name={p.name || p.identity}
                  role={parseRole(p.metadata)}
                  isLocal={p.identity === localParticipant.identity}
                  isSpeaking={p.isSpeaking}
                  micMuted={p.isMicrophoneEnabled === false}
                  camOff={p.isCameraEnabled === false}
                  handRaised={raisedHands.has(p.identity)}
                  canHost={canHost}
                  liveClassId={liveClass.id}
                  onLowerHand={() => lowerHand(p.identity)}
                />
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ParticipantRow({ identity, name, role, isLocal, isSpeaking, micMuted, camOff, handRaised, canHost, liveClassId, onLowerHand }: {
  identity: string; name: string; role: 'HOST' | 'CO_TRAINER' | 'STUDENT' | null; isLocal: boolean; isSpeaking: boolean; micMuted: boolean; camOff: boolean; handRaised: boolean;
  canHost: boolean; liveClassId: string; onLowerHand: () => void;
}) {
  const hostAction = (action: 'mute' | 'remove') => {
    if (action === 'mute') {
      api.post(`/api/live-classes/${liveClassId}/host-actions/mute`, { userId: identity, kind: 'audio', muted: true }).catch(() => {});
    } else {
      if (!window.confirm(`Remove ${name} from the class?`)) return;
      api.post(`/api/live-classes/${liveClassId}/host-actions/remove`, { userId: identity }).catch(() => {});
    }
  };

  return (
    <div className={`flex items-center justify-between px-4 py-2 text-xs ${handRaised ? 'bg-amber-500/10' : isSpeaking ? 'bg-emerald-500/10' : ''}`}>
      <span className="truncate inline-flex items-center gap-1.5">
        {handRaised && <Hand className="w-3 h-3 text-amber-400 flex-shrink-0" />}
        {name}{isLocal ? ' (You)' : ''}
        {(role === 'HOST' || role === 'CO_TRAINER') && (
          <span className={`text-[9px] font-bold px-1 py-0.5 rounded flex-shrink-0 ${role === 'HOST' ? 'bg-blue-500/30 text-blue-200' : 'bg-purple-500/30 text-purple-200'}`}>
            {ROLE_LABEL[role]}
          </span>
        )}
      </span>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        {micMuted ? <MicOff className="w-3 h-3 text-white/40" /> : <Mic className="w-3 h-3 text-emerald-400" />}
        {camOff ? <VideoOff className="w-3 h-3 text-white/40" /> : <Video className="w-3 h-3 text-emerald-400" />}
        {canHost && handRaised && (
          <button onClick={onLowerHand} title="Lower hand" className="px-1.5 py-0.5 rounded bg-amber-500/80 hover:bg-amber-500 text-black">Lower</button>
        )}
        {canHost && !isLocal && (
          <>
            <button onClick={() => hostAction('mute')} title="Mute" className="ml-1 px-1.5 py-0.5 rounded bg-white/10 hover:bg-white/20">Mute</button>
            <button onClick={() => hostAction('remove')} title="Remove" className="px-1.5 py-0.5 rounded bg-red-600/70 hover:bg-red-600">Remove</button>
          </>
        )}
      </div>
    </div>
  );
}
