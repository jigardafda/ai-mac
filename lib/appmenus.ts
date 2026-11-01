"use client";

import { useSyncExternalStore } from "react";
import type { Menu } from "@/components/MenuBar";

/**
 * Built-in apps publish their own menu bar menus and keyboard handlers here.
 * The desktop shows an app's menus while one of its windows is frontmost, the
 * way macOS swaps the menu bar for the active application.
 */
export type AppMenus = { menus: Menu[]; onKey?: (e: KeyboardEvent) => boolean };

const registry = new Map<string, AppMenus>();
const listeners = new Set<() => void>();
let version = 0;

export function setAppMenus(slug: string, value: AppMenus | null) {
  if (value) registry.set(slug, value); else registry.delete(slug);
  version++;
  listeners.forEach((l) => l());
}

export function useAppMenus(slug: string | undefined): AppMenus | undefined {
  useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => version, () => 0);
  return slug ? registry.get(slug) : undefined;
}
