import type { DeclarativeUi, SurfaceContribution } from "@v2/plugin-contracts";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";

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
  return <SurfaceCard className="declarative-surface">
    <div className="surface-header"><div><small>runtime declarative</small><h2>{surface.title}</h2></div><Badge>{surface.kind}</Badge></div>
    <DeclarativeBlocks schema={schema} />
  </SurfaceCard>;
}
