import { redirect } from "next/navigation";
import { getUser } from "@/lib/auth";
import { getSettings, listApps, seedDefaultApps } from "@/lib/apps";
import { Desktop } from "@/components/Desktop";

export const dynamic = "force-dynamic";

export default async function DesktopPage() {
  const user = await getUser();
  if (!user) redirect("/login");
  await seedDefaultApps(user.id); // adds any default app this desktop does not have yet
  const [apps, settings] = await Promise.all([listApps(user.id), getSettings(user.id)]);
  return <Desktop user={user} initialApps={apps} dockSlugs={settings.dock_slugs} wallpaper={settings.wallpaper_url ?? "/wallpaper.jpg"} prefs={settings.prefs ?? {}} />;
}
