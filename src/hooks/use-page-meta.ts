import { useEffect } from "react";

export type PageMeta = {
  title: string;
  description: string;
  /** Extra tags, e.g. { "og:type": "website" }. og:/twitter: keys pick the right attribute. */
  extra?: Record<string, string>;
};

function setMeta(key: string, content: string) {
  const attr = key.startsWith("og:") ? "property" : "name";
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.content = content;
}

// Client-side replacement for TanStack Start's per-route `head()`.
export function usePageMeta({ title, description, extra = {} }: PageMeta) {
  useEffect(() => {
    document.title = title;
    setMeta("description", description);
    setMeta("og:title", title);
    setMeta("og:description", description);
    for (const [key, value] of Object.entries(extra)) setMeta(key, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, description, JSON.stringify(extra)]);
}
