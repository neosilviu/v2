import { Hono } from "hono";
import { errorResponse, failure } from "@v2/feedback-runtime";
import { websiteStudioManifest } from "../manifest";
import type { WebsiteStudioEnv } from "./env";

const app = new Hono<{ Bindings: WebsiteStudioEnv }>();

type PageInput = {
  slug?: unknown;
  title?: unknown;
  seoTitle?: unknown;
  seoDescription?: unknown;
};
type SectionInput = {
  kind?: unknown;
  content?: unknown;
  aiContextEnabled?: unknown;
};

function slugFor(input: unknown) {
  const value = String(input ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return value || "home";
}

function text(input: unknown, fallback = "") {
  const value = typeof input === "string" ? input.trim() : "";
  return value || fallback;
}

function nullableText(input: unknown) {
  const value = typeof input === "string" ? input.trim() : "";
  return value || null;
}

function rowToPage(row: Record<string, unknown>) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    status: row.status,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
  };
}

async function pageWithSections(
  db: D1Database,
  workspaceId: string,
  pageId: string,
) {
  const page = await db
    .prepare(
      `SELECT id, slug, title, status, seo_title, seo_description, published_at, updated_at
    FROM website_pages WHERE workspace_id = ? AND id = ?`,
    )
    .bind(workspaceId, pageId)
    .first<Record<string, unknown>>();
  if (!page) return null;
  const sections = await db
    .prepare(
      `SELECT id, kind, sort_order, content_json, ai_context_enabled, updated_at
    FROM website_sections WHERE page_id = ? ORDER BY sort_order`,
    )
    .bind(pageId)
    .all<Record<string, unknown>>();
  return {
    ...rowToPage(page),
    sections: sections.results.map((section) => ({
      id: section.id,
      kind: section.kind,
      sortOrder: section.sort_order,
      content: JSON.parse(String(section.content_json ?? "{}")) as unknown,
      aiContextEnabled: section.ai_context_enabled === 1,
      updatedAt: section.updated_at,
    })),
  };
}

async function upsertPage(
  db: D1Database,
  workspaceId: string,
  input: PageInput,
) {
  const slug = slugFor(input.slug ?? input.title);
  const id = `${workspaceId}:page:${slug}`;
  const title = text(
    input.title,
    slug === "home" ? "Home" : slug.replaceAll("-", " "),
  );
  await db
    .prepare(
      `INSERT INTO website_pages
    (id, workspace_id, slug, title, status, seo_title, seo_description, updated_at)
    VALUES (?, ?, ?, ?, 'draft', ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(workspace_id, slug) DO UPDATE SET
      title = excluded.title,
      seo_title = excluded.seo_title,
      seo_description = excluded.seo_description,
      updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      id,
      workspaceId,
      slug,
      title,
      text(input.seoTitle, title),
      nullableText(input.seoDescription),
    )
    .run();
  return id;
}

async function upsertSection(
  db: D1Database,
  pageId: string,
  sortOrder: number,
  input: SectionInput,
) {
  const kind = text(input.kind, "text");
  const id = `${pageId}:section:${sortOrder}`;
  await db
    .prepare(
      `INSERT INTO website_sections
    (id, page_id, kind, sort_order, content_json, ai_context_enabled, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(id) DO UPDATE SET
      kind = excluded.kind,
      sort_order = excluded.sort_order,
      content_json = excluded.content_json,
      ai_context_enabled = excluded.ai_context_enabled,
      updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      id,
      pageId,
      kind,
      sortOrder,
      JSON.stringify(input.content ?? {}),
      input.aiContextEnabled === true ? 1 : 0,
    )
    .run();
}

async function installDefaults(db: D1Database, workspaceId: string) {
  const pageId = await upsertPage(db, workspaceId, {
    slug: "home",
    title: "Home",
    seoDescription: "Workspace homepage scaffold",
  });
  await upsertSection(db, pageId, 10, {
    kind: "hero",
    content: {
      heading: "Workspace homepage",
      body: "Edit this page in Website Studio before publishing.",
      cta: "Get started",
    },
    aiContextEnabled: true,
  });
  await upsertSection(db, pageId, 20, {
    kind: "text",
    content: {
      heading: "About",
      body: "This is an operational default, not demo data.",
    },
    aiContextEnabled: true,
  });
  await db
    .prepare(
      `INSERT INTO website_context_shares
    (id, workspace_id, page_id, surface_id, readable_json, allowed_tools_json, enabled, updated_at)
    VALUES (?, ?, ?, 'website-studio.editor', ?, ?, 0, CURRENT_TIMESTAMP)
    ON CONFLICT(workspace_id, surface_id, page_id) DO UPDATE SET readable_json = excluded.readable_json, allowed_tools_json = excluded.allowed_tools_json, updated_at = CURRENT_TIMESTAMP`,
    )
    .bind(
      `${workspaceId}:context:${pageId}`,
      workspaceId,
      pageId,
      JSON.stringify({
        pageId,
        fields: ["title", "slug", "sections.heading", "sections.body"],
      }),
      JSON.stringify(["website.readPageContext"]),
    )
    .run();
  return pageWithSections(db, workspaceId, pageId);
}

async function installDemo(db: D1Database, workspaceId: string) {
  await installDefaults(db, workspaceId);
  const servicesId = await upsertPage(db, workspaceId, {
    slug: "services",
    title: "Services",
    seoDescription: "Demo service page",
  });
  await upsertSection(db, servicesId, 10, {
    kind: "hero",
    content: {
      heading: "Services",
      body: "Demo content installed explicitly from Website Studio.",
    },
    aiContextEnabled: true,
  });
  await upsertSection(db, servicesId, 20, {
    kind: "cards",
    content: {
      cards: [
        { title: "Strategy", body: "Plan the workspace." },
        { title: "Launch", body: "Publish safely." },
      ],
    },
    aiContextEnabled: false,
  });
  const contactId = await upsertPage(db, workspaceId, {
    slug: "contact",
    title: "Contact",
    seoDescription: "Demo contact page",
  });
  await upsertSection(db, contactId, 10, {
    kind: "contact",
    content: {
      heading: "Contact",
      body: "Replace this demo copy before going live.",
    },
    aiContextEnabled: false,
  });
}

app.use("*", async (c, next) => {
  const url = new URL(c.req.url);
  const localRuntimeBridge =
    (url.hostname === "localhost" || url.hostname === "127.0.0.1") &&
    c.req.header("x-v2-runtime-bridge-dev") === "1";
  if (
    (!localRuntimeBridge && url.hostname !== "plugin-runtime.internal") ||
    c.req.header("origin")
  ) {
    return c.json(
      errorResponse(
        failure(
          "not_authorized",
          "Website Studio runtime is only available through the internal Core binding.",
        ),
      ),
      403,
    );
  }
  await next();
});
app.get("/health", (c) => c.json({ ok: true, service: "website-studio" }));
app.post("/runtime/execute", async (c) => {
  const request = (await c.req.json().catch(() => null)) as {
    workspaceId?: unknown;
    operationId?: unknown;
    input?: unknown;
  } | null;
  const workspaceId =
    typeof request?.workspaceId === "string" ? request.workspaceId : "";
  const operationId =
    typeof request?.operationId === "string" ? request.operationId : "";
  const input =
    request?.input && typeof request.input === "object"
      ? (request.input as Record<string, unknown>)
      : {};
  const routeParams =
    request &&
    "routeParams" in request &&
    request.routeParams &&
    typeof request.routeParams === "object"
      ? (request.routeParams as Record<string, unknown>)
      : {};
  if (!workspaceId || !operationId)
    return c.json(
      errorResponse(
        failure("validation_failed", "A valid runtime operation is required."),
      ),
      400,
    );
  const operation = websiteStudioManifest.api.operations.find(
    (item) => item.id === operationId,
  );
  if (!operation)
    return c.json(
      errorResponse(
        failure("not_found", "Runtime operation is not available."),
      ),
      404,
    );
  if (operationId === "website.listPages") {
    const rows = await c.env.WEBSITE_DB.prepare(
      "SELECT id, slug, title, status, seo_title, seo_description, published_at, updated_at FROM website_pages WHERE workspace_id = ? ORDER BY updated_at DESC",
    )
      .bind(workspaceId)
      .all<Record<string, unknown>>();
    return c.json({ pages: rows.results.map(rowToPage) });
  }
  if (operationId === "website.installDefaults")
    return c.json(
      {
        status: "seeded",
        demo: false,
        page: await installDefaults(c.env.WEBSITE_DB, workspaceId),
      },
      201,
    );
  if (operationId === "website.installDemoData") {
    await installDemo(c.env.WEBSITE_DB, workspaceId);
    const rows = await c.env.WEBSITE_DB.prepare(
      "SELECT id, slug, title, status, seo_title, seo_description, published_at, updated_at FROM website_pages WHERE workspace_id = ? ORDER BY slug",
    )
      .bind(workspaceId)
      .all<Record<string, unknown>>();
    return c.json(
      { status: "installed", demo: true, pages: rows.results.map(rowToPage) },
      201,
    );
  }
  const pageId = typeof input.pageId === "string" ? input.pageId : "";
  if (operationId === "website.updateSection" && pageId) {
    const page = await pageWithSections(c.env.WEBSITE_DB, workspaceId, pageId);
    if (!page)
      return c.json(
        errorResponse(failure("not_found", "Website page is not available.")),
        404,
      );
    await upsertSection(
      c.env.WEBSITE_DB,
      pageId,
      Number(input.sortOrder ?? Date.now()),
      input,
    );
    const updatedPage = await pageWithSections(
      c.env.WEBSITE_DB,
      workspaceId,
      pageId,
    );
    if (c.env.WEBSITE_KV && updatedPage) {
      const cacheKey = `published:${workspaceId}:${updatedPage.slug}`;
      if (updatedPage.status === "published") {
        await c.env.WEBSITE_KV.put(cacheKey, JSON.stringify(updatedPage), {
          expirationTtl: 3600,
        });
      } else {
        await c.env.WEBSITE_KV.delete(cacheKey);
      }
    }
    return c.json({ page: updatedPage });
  }
  if (operationId === "website.publishPage" && pageId) {
    const result = await c.env.WEBSITE_DB.prepare(
      "UPDATE website_pages SET status = 'published', published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE workspace_id = ? AND id = ?",
    )
      .bind(workspaceId, pageId)
      .run();
    if (result.meta.changes === 0)
      return c.json(
        errorResponse(failure("not_found", "Website page is not available.")),
        404,
      );
    const page = await pageWithSections(c.env.WEBSITE_DB, workspaceId, pageId);
    if (c.env.WEBSITE_KV && page) {
      const cacheKey = `published:${workspaceId}:${page.slug}`;
      await c.env.WEBSITE_KV.put(cacheKey, JSON.stringify(page), {
        expirationTtl: 3600,
      });
    }
    return c.json({ page });
  }
  if (operationId === "website.readPageContext" && pageId) {
    const result = await c.env.WEBSITE_DB.prepare(
      "SELECT surface_id, readable_json, allowed_tools_json FROM website_context_shares WHERE workspace_id = ? AND page_id = ? AND enabled = 1 LIMIT 1",
    )
      .bind(workspaceId, pageId)
      .first();
    if (!result)
      return c.json(
        errorResponse(
          failure("not_found", "Approved page context is not available."),
        ),
        404,
      );
    return c.json({ context: result });
  }
  if (operationId === "website.readPageContext") {
    const slug =
      typeof routeParams.slug === "string" ? routeParams.slug : "home";
    const cacheKey = `published:${workspaceId}:${slug}`;
    if (c.env.WEBSITE_KV) {
      const cached = await c.env.WEBSITE_KV.get(cacheKey);
      if (cached) {
        try {
          return c.json({ page: JSON.parse(cached) });
        } catch {
          // Fallback to database on JSON parse failure
        }
      }
    }
    const row = await c.env.WEBSITE_DB.prepare(
      "SELECT id FROM website_pages WHERE workspace_id = ? AND slug = ? AND status = 'published' LIMIT 1",
    )
      .bind(workspaceId, slug)
      .first<{ id: string }>();
    if (!row)
      return c.json(
        errorResponse(failure("not_found", "Published page is not available.")),
        404,
      );
    const page = await pageWithSections(c.env.WEBSITE_DB, workspaceId, row.id);
    if (c.env.WEBSITE_KV && page) {
      await c.env.WEBSITE_KV.put(cacheKey, JSON.stringify(page), {
        expirationTtl: 3600,
      });
    }
    return c.json({ page });
  }
  return c.json(
    errorResponse(failure("not_found", "Runtime operation is not available.")),
    404,
  );
});

export default app;
