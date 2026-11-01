import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdmin } from "@/lib/admin";
import { getUserDetail } from "@/lib/admin-data";
import { AdminLogin, AdminSignOut } from "@/components/AdminLogin";
import { when } from "../../format";
import styles from "../../admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "User · AI Mac admin", robots: { index: false, follow: false } };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await getAdmin();
  if (!admin) return <AdminLogin />;
  const { id } = await params;
  const uid = /^\d{1,12}$/.test(id) ? Number(id) : NaN;
  const detail = Number.isFinite(uid) ? await getUserDetail(uid) : null;
  if (!detail) notFound();
  const { user, apps, versions, files } = detail;
  const made = apps.filter((a) => a.custom && !a.deleted);

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={28} height={28} />
        <h1><Link href="/admin">AI Mac admin</Link> <span className={styles.crumb}>/ {user.name || user.email}</span></h1>
        <span className={styles.spacer} />
        <span className={styles.who}>{admin}</span>
        <AdminSignOut />
      </header>

      <section className={styles.stats} aria-label="User">
        <div className={styles.stat}><b className={styles.small}>{user.name || "—"}</b><span>Name</span><small>{user.email}</small></div>
        <div className={styles.stat}><b className={styles.small}>{when(user.created_at)}</b><span>Joined (UTC)</span></div>
        <div className={styles.stat}><b className={styles.small}>{when(user.last_sign_in)}</b><span>Last sign-in</span></div>
        <div className={styles.stat}><b>{apps.filter((a) => !a.deleted).length}</b><span>Apps</span><small>{made.length} made by them</small></div>
        <div className={styles.stat}><b>{files}</b><span>Files</span></div>
      </section>

      <section>
        <h2>Apps</h2>
        <div className={styles.tableWrap}>
          <table>
            <thead><tr><th>App</th><th>Brief</th><th>Created (UTC)</th><th className={styles.num}>Versions</th><th>Last written</th><th>Model</th><th className={styles.num}>Data keys</th></tr></thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} className={a.deleted ? styles.deleted : undefined}>
                  <td><b>{a.name}</b> <code>{a.slug}</code>{a.custom ? <span className={styles.tag}>made</span> : null}{a.deleted ? <span className={styles.tag}>in trash</span> : null}</td>
                  <td className={styles.brief}>{a.description}</td>
                  <td className={styles.nowrap}>{when(a.created_at)}</td>
                  <td className={styles.num}>{a.versions}</td>
                  <td className={styles.nowrap}>{when(a.last_built)}</td>
                  <td>{a.last_model ?? "—"}</td>
                  <td className={styles.num}>{a.data_keys}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <h2>What they asked for <small>apps they made or changed</small></h2>
        {versions.length === 0 ? <p className={styles.empty}>Nothing yet.</p> : (
          <div className={styles.history}>
            {apps.filter((a) => versions.some((v) => v.app_id === a.id)).map((a) => (
              <details key={a.id} open={a.custom && !a.deleted}>
                <summary><b>{a.name}</b> <code>{a.slug}</code> <span>{versions.filter((v) => v.app_id === a.id).length} versions</span></summary>
                <ol>
                  {versions.filter((v) => v.app_id === a.id).map((v) => (
                    <li key={v.version}><span className={styles.nowrap}>v{v.version} · {when(v.created_at)} · {v.model}</span><p>{v.prompt}</p></li>
                  ))}
                </ol>
              </details>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
