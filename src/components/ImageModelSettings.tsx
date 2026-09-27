// Per-model image switch for a custom OpenAI-compatible engine. Off by
// default: a text-only model on the same endpoint never inherits vision.
import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";

import { api, useStore, type InstanceInfo } from "@/state/store";
import { t } from "@/lib/i18n";

const COMPACT_COUNT = 8;

export function ImageModelSettings({ instance }: { instance: InstanceInfo }) {
  const { refreshInstances } = useStore();
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const models = instance.models.options;
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? models.filter((option) => option.label.toLowerCase().includes(needle) || option.id.toLowerCase().includes(needle))
      : models;
    return [...matches.filter((option) => option.images), ...matches.filter((option) => !option.images)];
  }, [models, query]);
  const visible = query || showAll ? filtered : filtered.slice(0, Math.max(COMPACT_COUNT, filtered.filter((option) => option.images).length));

  const toggle = (id: string, images: boolean) => {
    if (pending) return;
    setPending(id);
    setError(null);
    api(`/api/instances/${encodeURIComponent(instance.instanceId)}`, {
      method: "PATCH",
      body: JSON.stringify({ modelImages: { [id]: images } }),
    })
      .then(() => refreshInstances())
      .catch((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)))
      .finally(() => setPending(null));
  };

  return (
    <section className="mt-3 rounded-xl border border-hairline/40 px-3 py-2.5" aria-label={t("engines.images.title")}>
      <h3 className="text-[12px] font-medium text-ink">{t("engines.images.title")}</h3>
      <p className="mt-1 text-[12px] leading-relaxed text-ink-secondary">{t("engines.images.help")}</p>
      {models.length > COMPACT_COUNT && (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("engines.images.filter")}
          aria-label={t("engines.images.filter")}
          className="mt-2 w-full rounded-lg border border-hairline/40 bg-inset px-3 py-1.5 text-[12px] text-ink placeholder:text-ink-secondary focus:border-hairline focus:outline-none"
        />
      )}
      {models.length === 0 ? (
        <p className="mt-2 text-[12px] text-ink-secondary">{t("engines.images.empty")}</p>
      ) : (
        <ul className="mt-2 flex max-h-64 flex-col gap-1 overflow-y-auto">
          {visible.map((option) => {
            const saving = pending === option.id;
            return (
              <li key={option.id}>
                <label className="flex items-center gap-2 rounded-lg px-1 py-1 text-[12px] text-ink hover:bg-raised/40">
                  <input
                    type="checkbox"
                    checked={option.images === true}
                    disabled={pending !== null}
                    aria-label={t("engines.images.toggleAria", { model: option.label })}
                    onChange={(event) => toggle(option.id, event.target.checked)}
                  />
                  <span className="min-w-0 flex-1 truncate" title={option.id}>{option.label}</span>
                  {saving && <Loader2 size={12} aria-label={t("engines.images.saving")} className="animate-spin text-ink-secondary" />}
                  <span className="shrink-0 text-ink-secondary">{t("engines.images.toggle")}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
      {!query && filtered.length > visible.length && (
        <button type="button" onClick={() => setShowAll(true)} className="mt-1 text-[12px] text-ink-secondary hover:text-ink">
          {t("engines.images.showAll")}
        </button>
      )}
      {!query && showAll && filtered.length > COMPACT_COUNT && (
        <button type="button" onClick={() => setShowAll(false)} className="mt-1 text-[12px] text-ink-secondary hover:text-ink">
          {t("engines.images.showFewer")}
        </button>
      )}
      {error && <p role="alert" className="mt-1 text-[12px] text-danger">{error}</p>}
    </section>
  );
}
