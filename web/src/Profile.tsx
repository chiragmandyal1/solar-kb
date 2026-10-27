import { useEffect, useRef } from "react";
import type { Me } from "./api";

declare global {
  interface Window { google?: any } // Google Identity Services, loaded below
}

export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined;

function loadGoogle(): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts) return resolve(window.google);
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => resolve(window.google);
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

function GoogleButton({ onCredential, icon }: { onCredential: (c: string) => void; icon: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const cb = useRef(onCredential);
  cb.current = onCredential;
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;
    let live = true;
    loadGoogle().then((g) => {
      if (!live || !box.current) return;
      g.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: (r: { credential: string }) => cb.current(r.credential) });
      g.accounts.id.renderButton(box.current, { theme: "filled_black", size: "medium", shape: "pill", type: icon ? "icon" : "standard", text: "signin_with" });
    }).catch(() => {});
    return () => { live = false; };
  }, [icon]);
  return <div ref={box} className="gbtn" />;
}

type Props = { me: Me | null; narrow: boolean; onCredential: (c: string) => void; onSignOut: () => void };

export function Profile({ me, narrow, onCredential, onSignOut }: Props) {
  if (!me) return null;
  const { user, limit } = me;
  const left = user
    ? `${limit.remaining} of ${limit.max} questions left today`
    : limit.remaining > 0 ? `${limit.remaining} of ${limit.max} free questions left` : "Free questions used up";
  return (
    <div className={"profile glass" + (limit.remaining === 0 ? " empty" : "")}>
      {user ? (
        <>
          {user.picture ? <img className="avatar" src={user.picture} alt="" referrerPolicy="no-referrer" /> : <span className="avatar">{user.email[0].toUpperCase()}</span>}
          <span className="who">
            {!narrow && <strong title={user.email}>{user.email}</strong>}
            <small>{narrow ? `${limit.remaining} left today` : left}</small>
          </span>
          <button className="signout" onClick={onSignOut}>Sign out</button>
        </>
      ) : (
        <>
          <span className="who">
            <strong>Guest</strong>
            <small>{narrow ? `${limit.remaining} free left` : left}</small>
          </span>
          {GOOGLE_CLIENT_ID ? <GoogleButton onCredential={onCredential} icon={narrow} /> : <small className="nogoogle">Google sign-in not set up</small>}
        </>
      )}
    </div>
  );
}
