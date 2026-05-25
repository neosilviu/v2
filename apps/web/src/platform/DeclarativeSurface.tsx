import type { DeclarativeUi, SurfaceContribution } from "@v2/plugin-contracts";
import { declarativePageContributionSchema } from "@v2/ui-schema";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { TemplateRenderer } from "./TemplateRenderer";

export function DeclarativeBlock({ block }: { block: DeclarativeUi["body"][number] }) {
  if (block.type === "metric") return <div className="declarative-metric">
    <small>{block.label}</small>
    <strong>{block.value}</strong>
    {block.detail ? <p>{block.detail}</p> : null}
  </div>;
  if (block.type === "action") return <Button className={block.variant === "primary" ? "primary" : ""}>{block.label}</Button>;
  return <p className={`declarative-text ${block.tone}`}>{block.text}</p>;
}

export function DeclarativeBlocks({ schema }: { schema: DeclarativeUi }) {
  return <div className="declarative-body">{schema.body.map((block, index) => <DeclarativeBlock key={`${block.type}-${index}`} block={block} />)}</div>;
}

export function DeclarativeSurface({ surface, schema }: { surface: SurfaceContribution; schema: DeclarativeUi }) {
  const templatePage = declarativePageContributionSchema.safeParse(schema);
  if (templatePage.success) return <TemplateRenderer page={templatePage.data} data={templatePage.data.data} />;
  const blocks = schema.body.filter((block) => block.type !== "action");
  const actions = schema.body.filter((block) => block.type === "action").map((block, index) => ({
    id: `${surface.id}.action.${index}`,
    title: block.label,
    commandId: block.commandId,
    variant: block.variant,
  }));
  const page = declarativePageContributionSchema.parse({
    id: surface.id,
    title: surface.title,
    templateId: surface.kind === "settings" ? "admin.settings" : "public.contentPage",
    access: "private",
    actions,
    slots: [{ id: `${surface.id}.body`, slot: surface.kind === "settings" ? "header" : "body", blocks }],
  });
  return <TemplateRenderer page={page} data={page.data} />;
}

export function LegacyDeclarativeSurface({ surface, schema }: { surface: SurfaceContribution; schema: DeclarativeUi }) {
  return <SurfaceCard className="declarative-surface">
    <div className="surface-header"><div><small>runtime declarative</small><h2>{surface.title}</h2></div><Badge>{surface.kind}</Badge></div>
    <DeclarativeBlocks schema={schema} />
  </SurfaceCard>;
}
