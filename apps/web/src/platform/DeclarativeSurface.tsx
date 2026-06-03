import {
  declarativeUiSchema,
  type SurfaceContribution,
} from "@v2/plugin-contracts";
import { declarativePageContributionSchema } from "@v2/ui-schema";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { TemplateRenderer } from "./TemplateRenderer";

type LegacyDeclarativeUi = {
  body: Array<
    | { type: "text"; text: string; tone: "default" | "muted" | "accent" }
    | {
        type: "metric";
        label: string;
        value: string;
        detail?: string | undefined;
      }
    | {
        type: "action";
        label: string;
        commandId: string;
        variant: "default" | "primary";
      }
  >;
};

export function DeclarativeBlock({
  block,
}: {
  block: LegacyDeclarativeUi["body"][number];
}) {
  if (block.type === "metric")
    return (
      <div className="declarative-metric">
        <small>{block.label}</small>
        <strong>{block.value}</strong>
        {block.detail ? <p>{block.detail}</p> : null}
      </div>
    );
  if (block.type === "action")
    return (
      <Button className={block.variant === "primary" ? "primary" : ""}>
        {block.label}
      </Button>
    );
  return <p className={`declarative-text ${block.tone}`}>{block.text}</p>;
}

export function DeclarativeBlocks({ schema }: { schema: LegacyDeclarativeUi }) {
  return (
    <div className="declarative-body">
      {schema.body.map((block, index) => (
        <DeclarativeBlock key={`${block.type}-${index}`} block={block} />
      ))}
    </div>
  );
}

export function DeclarativeSurface({
  surface,
  schema,
}: {
  surface: SurfaceContribution;
  schema: unknown;
}) {
  const templatePage = declarativePageContributionSchema.safeParse(schema);
  if (templatePage.success)
    return (
      <TemplateRenderer
        page={templatePage.data}
        data={templatePage.data.data}
        runtime={{ contributionId: surface.id }}
      />
    );
  const legacy = declarativeUiSchema.parse(schema);
  const blocks = legacy.body.filter((block) => block.type !== "action");
  const actions = legacy.body
    .filter((block) => block.type === "action")
    .map((block, index) => ({
      id: `${surface.id}.action.${index}`,
      title: block.label,
      commandId: block.commandId,
      variant: block.variant,
    }));
  const page = declarativePageContributionSchema.parse({
    id: surface.id,
    title: surface.title,
    templateId:
      surface.kind === "settings" ? "admin.settings" : "public.contentPage",
    access: "private",
    actions,
    slots: [
      {
        id: `${surface.id}.body`,
        slot: surface.kind === "settings" ? "header" : "body",
        blocks,
      },
    ],
  });
  return (
    <TemplateRenderer
      page={page}
      data={page.data}
      runtime={{ contributionId: surface.id }}
    />
  );
}

export function LegacyDeclarativeSurface({
  surface,
  schema,
}: {
  surface: SurfaceContribution;
  schema: LegacyDeclarativeUi;
}) {
  return (
    <SurfaceCard className="declarative-surface">
      <div className="surface-header">
        <div>
          <small>runtime declarative</small>
          <h2>{surface.title}</h2>
        </div>
        <Badge>{surface.kind}</Badge>
      </div>
      <DeclarativeBlocks schema={schema} />
    </SurfaceCard>
  );
}
