import { useCallback, useEffect, useState } from "react";
import { Laptop, LogOut, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";

/**
 * FR-AUTH-09: the signed-in user's recent sign-ins, and FR-AUTH-11's "sign out
 * everywhere". Both actions are entirely server-side - this component only
 * renders what `GET /auth/sessions` returns and calls `DELETE /auth/sessions`
 * to revoke, so it can be dropped into any role's Settings screen.
 */
const formatWhen = (value) => {
  if (!value) return "Unknown time";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : date.toLocaleString();
};

// A compact, human-readable device label from the raw User-Agent string.
const describeDevice = (userAgent) => {
  if (!userAgent) return "Unknown device";
  if (/mobile|android|iphone/i.test(userAgent)) return "Mobile browser";
  if (/edg\//i.test(userAgent)) return "Edge browser";
  if (/chrome\//i.test(userAgent)) return "Chrome browser";
  if (/firefox\//i.test(userAgent)) return "Firefox browser";
  if (/safari\//i.test(userAgent)) return "Safari browser";
  return "Web browser";
};

export default function ActiveSessions({ className = "" }) {
  const { getSessions, revokeAllSessions } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [revoking, setRevoking] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      setSessions(await getSessions());
    } catch (error) {
      // This must never fall back to an empty list. "No recent sign-ins to show"
      // is a claim that the account looks clean, and rendering that after a
      // failed request would tell someone their sessions were checked when they
      // were not - on the one screen whose whole job is spotting a stranger.
      setLoadError(error.response?.data?.message || "Could not load your sessions.");
      setSessions([]);
    } finally {
      setLoading(false);
    }
  }, [getSessions]);

  useEffect(() => {
    load();
  }, [load]);

  const signOutEverywhere = async () => {
    setRevoking(true);
    try {
      await revokeAllSessions();
      toast.success("Signed out of all devices.");
      // The local session is revoked too; the auth guard returns to /login.
    } catch (error) {
      toast.error(error.response?.data?.message || "Could not sign out of every device.");
      setRevoking(false);
    }
  };

  return (
    <section className={`rounded-2xl border border-deept/10 bg-white p-6 shadow-sm ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-heading text-lg font-bold text-teal-deep">Sessions &amp; devices</h2>
          <p className="mt-0.5 text-sm text-ink-soft">
            Recent sign-ins to your account. If you see one you do not recognise, sign out everywhere.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          className="inline-flex items-center gap-1.5 rounded-full border border-deept/20 px-3 py-1.5 text-xs font-semibold text-teal-deep transition hover:bg-softteal/40"
        >
          <RefreshCw className="size-3.5" />
          Refresh
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <p className="text-sm text-ink-soft">Loading sessions...</p>
        ) : loadError ? (
          <p className="text-sm font-semibold text-coral-dark">
            {loadError} Use Refresh above to try again.
          </p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-ink-soft">No recent sign-ins to show.</p>
        ) : (
          <ul className="divide-y divide-deept/10">
            {sessions.map((session) => (
              <li key={session.id} className="flex items-start gap-3 py-3">
                <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-softteal/50 text-teal-deep">
                  <Laptop className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-teal-deep">
                    {describeDevice(session.userAgent)}
                    {session.current && (
                      <span className="rounded-full bg-teal-mid/15 px-2 py-0.5 text-[11px] font-bold text-teal-deep">
                        This device
                      </span>
                    )}
                    {session.remember && (
                      <span className="rounded-full bg-softlavender/50 px-2 py-0.5 text-[11px] font-semibold text-teal-deep">
                        Remembered
                      </span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-soft">
                    {session.ip || "Unknown address"} {"\u00b7"} {formatWhen(session.signedInAt)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-deept/10 pt-4">
        <p className="flex items-center gap-2 text-xs text-ink-soft">
          <ShieldCheck className="size-4 text-teal-mid" />
          Signing out everywhere ends every session at once.
        </p>
        <button
          type="button"
          onClick={signOutEverywhere}
          disabled={revoking}
          className="inline-flex items-center gap-1.5 rounded-full bg-coral-dark px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-60"
        >
          <LogOut className="size-4" />
          {revoking ? "Signing out..." : "Sign out of all devices"}
        </button>
      </div>
    </section>
  );
}
