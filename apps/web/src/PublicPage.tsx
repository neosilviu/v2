import { useEffect, useState } from "react";
import type { DeclarativePageContribution } from "@v2/ui-schema";
import { loadPublicPage } from "./api";
import { TemplateRenderer } from "./platform/TemplateRenderer";

export function PublicPage() {
  const [page, setPage] = useState<DeclarativePageContribution | null>(null);
  const [routeParams, setRouteParams] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void loadPublicPage(window.location.pathname).then((result) => { setPage(result.page); setRouteParams(result.routeParams); }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "Public page unavailable"));
  }, []);

  if (error) return <main className="public-content"><p className="message">{error}</p></main>;
  if (!page) return <main className="public-content"><p className="message">Loading public page...</p></main>;
  return <TemplateRenderer page={page} data={{ ...page.data, routeParams }} />;
}
