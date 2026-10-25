// A template re-mounts on every navigation, so the fade replays per page.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="fade-in">{children}</div>;
}
