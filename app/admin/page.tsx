import type { Metadata } from "next";
import Link from "next/link";
import { getAdmin } from "@/lib/admin";
import { getOverview, listUsers, recentCustomApps } from "@/lib/admin-data";
import { AdminLogin, AdminSignOut } from "@/components/AdminLogin";
import { when } from "./format";
import styles from "./admin.module.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "AI Mac admin", robots: { index: false, follow: false } };

export default async function AdminPage() {
  const admin = await getAdmin();
  if (!admin) return <AdminLogin />;

  const [o, users, apps] = await Promise.all([getOverview(), listUsers(), recentCustomApps()]);
  const stats: [string, number, string?][] = [
    ["Users", o.users, `${o.usersToday} today, ${o.usersWeek} this week`],
    ["Apps", o.apps, `${o.builtApps} built`],
    ["Apps people made", o.customApps, "from “New app”"],
    ["Versions written", o.versions],
    ["App data keys", o.dataKeys],
    ["Files", o.files],
    ["Sign-ins, 24h", o.signIns24h],
  ];

  return (
    <div className={styles.shell}>
      <header className={styles.top}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.svg" alt="" width={28} height={28} />
        <h1>AI Mac admin</h1>
        <span className={styles.spacer} />
        <span className={styles.who}>{admin}</span>
        <AdminSignOut />
      </header>

      <section className={styles.stats} aria-label="Overview">
        {stats.map(([label, value, note]) => (
          <div key={label} className={styles.stat}>
            <b>{value.toLocaleString("en-US")}</b>
            <span>{label}</span>
            {note ? <small>{note}</small> : null}
          </div>
        ))}
      </section>

      <section>
        <h2>Apps people made <small>newest {apps.length}</small></h2>
        {apps.length === 0 ? <p className={styles.empty}>Nobody has made an app with “New app” yet.</p> : (
          <div className={styles.tableWrap}>
            <table>
              <thead><tr><th>Created (UTC)</th><th>App</th><th>By</th><th>What it is</th><th className={styles.num}>Versions</th></tr></thead>
              <tbody>
                {apps.map((a) => (
                  <tr key={a.id} className={a.deleted ? styles.deleted : undefined}>
                    <td className={styles.nowrap}>{when(a.created_at)}</td>
                    <td><b>{a.name}</b> <code>{a.slug}</code>{a.deleted ? <span className={styles.tag}>in trash</span> : null}</td>
                    <td><Link href={`/admin/users/${a.user_id}`}>{a.user_name || a.user_email}</Link></td>
                    <td className={styles.brief}>{a.description}</td>
                    <td className={styles.num}>{a.versions}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>Users <small>{users.length === 500 ? "newest 500" : users.length}</small></h2>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Joined (UTC)</th><th>Last sign-in</th><th className={styles.num}>Apps</th><th className={styles.num}>Made</th><th className={styles.num}>Versions</th><th>Last build</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><Link href={`/admin/users/${u.id}`}>{u.name || <i>no name</i>}</Link></td>
                  <td>{u.email}</td>
                  <td className={styles.nowrap}>{when(u.created_at)}</td>
                  <td className={styles.nowrap}>{when(u.last_sign_in)}</td>
                  <td className={styles.num}>{u.apps}</td>
                  <td className={styles.num}>{u.custom_apps}</td>
                  <td className={styles.num}>{u.versions}</td>
                  <td className={styles.nowrap}>{when(u.last_build)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <p className={styles.note}>Read-only. This panel shows accounts and what people asked for. It never shows app data, file contents or generated code.</p>
    </div>
  );
}
