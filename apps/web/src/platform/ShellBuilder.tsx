import { useEffect, useState, type FormEvent } from "react";
import { Badge, Button, SurfaceCard } from "@v2/ui-kit";
import { createManualInterfacePage, deleteManualInterfacePage, loadInterfaceContributions, updateInterfaceContribution, type InterfaceContribution } from "../api";

type Draft = { title: string; slug: string; label: string; icon: string; section: "user" | "administration"; body: string };

function sourceLabel(source: InterfaceContribution["source"]) {
  return source === "platform" ? "Platform" : source === "plugin" ? "Plugin" : "Manual";
}

function accessLabel(item: InterfaceContribution) {
  if (!item.requiredPermission) return "Workspace member";
  return item.section === "administration" ? "Administrator access" : "Restricted access";
}

function destinationLabel(item: InterfaceContribution) {
  if (!item.path) return "Not shown in navigation";
  return item.source === "manual" ? "Manual workspace page" : item.section === "administration" ? "Administration page" : "Workspace page";
}

export function ShellBuilder() {
  const [items, setItems] = useState<InterfaceContribution[]>([]);
  const [status, setStatus] = useState("Loading interface...");
  const [draft, setDraft] = useState<Draft>({ title: "Operations", slug: "operations", label: "Operations", icon: "list", section: "user", body: "Operational notes and links for this workspace." });
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = async () => {
    setStatus("Loading interface...");
    try {
      setItems(await loadInterfaceContributions());
      setStatus("Interface loaded");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Interface unavailable");
    }
  };

  useEffect(() => { void refresh(); }, []);

  const update = async (item: InterfaceContribution, input: Record<string, unknown>) => {
    setBusy(item.id);
    try {
      await updateInterfaceContribution(item.id, input);
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Change could not be saved");
    } finally {
      setBusy(null);
    }
  };

  const create = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setBusy("manual");
    try {
      await createManualInterfacePage({
        title: draft.title,
        slug: draft.slug,
        label: draft.label,
        icon: draft.icon,
        navigationSection: draft.section,
        blocks: [{ type: "heading", text: draft.title }, { type: "text", text: draft.body }],
        enabled: true,
        visibleInNavigation: true,
        displayOrder: 500,
      });
      setStatus("Manual page created");
      await refresh();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Manual page could not be created");
    } finally {
      setBusy(null);
    }
  };

  const navigation = items.filter((item) => item.kind === "page").sort((left, right) => left.displayOrder - right.displayOrder);
  const userItems = navigation.filter((item) => item.section === "user");
  const adminItems = navigation.filter((item) => item.section === "administration");

  return <div className="shell-builder">
    <div className="surface-header">
      <div>
        <small>workspace interface</small>
        <h2>Shell Builder</h2>
        <p>{status}</p>
      </div>
      <Button onClick={() => void refresh()} disabled={Boolean(busy)}>Refresh</Button>
    </div>

    <section className="settings-subpanel">
      <div className="surface-header"><div><h3>Navigation</h3><p>Main pages grouped by user and administration sections.</p></div><Badge>{navigation.length}</Badge></div>
      <div className="template-table-wrap domain-table">
        <table>
          <thead><tr><th>Label</th><th>Destination</th><th>Source</th><th>Section</th><th>Visible</th><th>Order</th><th>Required access</th><th>Actions</th></tr></thead>
          <tbody>{navigation.map((item) => <tr key={item.id}>
            <td><strong>{item.label}</strong><small>{item.configurable.canRename ? "Editable display" : "Protected display"}</small></td>
            <td>{destinationLabel(item)}</td>
            <td>{sourceLabel(item.source)}</td>
            <td>{item.section === "administration" ? "Administration" : "User"}</td>
            <td>{item.visibleInNavigation ? "Visible" : "Hidden"}</td>
            <td>{item.displayOrder}</td>
            <td>{accessLabel(item)}</td>
            <td><div className="plugin-actions">
              <Button disabled={!item.configurable.canHide || busy === item.id} onClick={() => void update(item, { visibleInNavigation: !item.visibleInNavigation })}>{item.visibleInNavigation ? "Hide" : "Show"}</Button>
              <Button disabled={!item.configurable.canReorder || busy === item.id} onClick={() => void update(item, { displayOrder: item.displayOrder - 10 })}>Move up</Button>
              <Button disabled={!item.configurable.canReorder || busy === item.id} onClick={() => void update(item, { displayOrder: item.displayOrder + 10 })}>Move down</Button>
              <Button disabled={!item.configurable.canMoveSection || busy === item.id} onClick={() => void update(item, { section: item.section === "user" ? "administration" : "user" })}>Move section</Button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>

    <section className="settings-subpanel">
      <div className="surface-header"><div><h3>Layout</h3><p>Primary navigation and content areas currently supported by the shell.</p></div></div>
      <div className="settings-access-grid">
        <div className="settings-access-card"><small>Top bar</small><strong>Workspace switcher and account menu</strong><p>Fixed platform area.</p></div>
        <div className="settings-access-card"><small>Sidebar</small><strong>{userItems.length + adminItems.length} navigation items</strong><p>User and administration groups.</p></div>
        <div className="settings-access-card"><small>Main content</small><strong>Runtime page renderer</strong><p>Native or declarative page output.</p></div>
        <div className="settings-access-card"><small>Secondary area</small><strong>Available for active panels</strong><p>Shown only when a contribution uses it.</p></div>
      </div>
    </section>

    <section className="settings-subpanel">
      <div className="surface-header"><div><h3>Pages</h3><p>Create a declarative manual page without custom JavaScript.</p></div></div>
      <form className="mail-form" onSubmit={create}>
        <label>Title<input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.currentTarget.value })} required /></label>
        <label>Path slug<input value={draft.slug} onChange={(event) => setDraft({ ...draft, slug: event.currentTarget.value })} required /></label>
        <label>Navigation label<input value={draft.label} onChange={(event) => setDraft({ ...draft, label: event.currentTarget.value })} required /></label>
        <label>Icon<input value={draft.icon} onChange={(event) => setDraft({ ...draft, icon: event.currentTarget.value })} /></label>
        <label>Navigation section<select value={draft.section} onChange={(event) => setDraft({ ...draft, section: event.currentTarget.value as Draft["section"] })}><option value="user">User</option><option value="administration">Administration</option></select></label>
        <label>Text<textarea value={draft.body} onChange={(event) => setDraft({ ...draft, body: event.currentTarget.value })} /></label>
        <div className="plugin-actions"><Button className="primary" type="submit" disabled={busy === "manual"}>Create page</Button></div>
      </form>
      <div className="plugin-list">{items.filter((item) => item.source === "manual").map((item) => <div className="plugin-row" key={item.id}>
        <div><strong>{item.label}</strong><small>{item.visibleInNavigation ? "Published in navigation" : "Hidden from navigation"}</small></div>
        <div className="plugin-actions"><Badge>{item.active ? "active" : "inactive"}</Badge><Button className="danger" disabled={!item.configurable.canDelete || busy === item.id} onClick={async () => { setBusy(item.id); await deleteManualInterfacePage(item.id).catch((error) => setStatus(error instanceof Error ? error.message : "Delete failed")); setBusy(null); await refresh(); }}>Delete</Button></div>
      </div>)}</div>
    </section>

    <section className="settings-subpanel">
      <div className="surface-header"><div><h3>Contributions</h3><p>Available Platform, Plugin and Manual UI contributions.</p></div><Badge>{items.length}</Badge></div>
      <div className="plugin-list">{items.map((item) => <div className="plugin-row" key={`${item.source}:${item.id}`}>
        <div><strong>{item.label}</strong><small>{sourceLabel(item.source)} · {item.kind} · {destinationLabel(item)} · {accessLabel(item)}</small></div>
        <div className="plugin-actions"><Badge>{item.status}</Badge><Button disabled={busy === item.id} onClick={() => void update(item, { visibleInNavigation: !item.visibleInNavigation })}>{item.visibleInNavigation ? "Remove from navigation" : "Add to navigation"}</Button></div>
      </div>)}</div>
    </section>
  </div>;
}
