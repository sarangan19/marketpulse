import { Skel } from "../ui/bits";

export function PageSkeleton() {
  return (
    <div className="wrap page" aria-busy="true" aria-label="Loading">
      <Skel w={120} h={14} />
      <Skel w={260} h={52} style={{ marginTop: 12 }} />
      <Skel w={200} h={14} style={{ marginTop: 12 }} />
      <div style={{ marginTop: 40, display: "grid", gap: 18 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <Skel key={i} h={40} />
        ))}
      </div>
    </div>
  );
}
