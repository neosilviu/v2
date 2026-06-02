import { useState, useEffect } from "react";
import { Badge, Button, SurfaceCard, Select, ColorPicker, FormGroup, ToggleGroup, KeyRecorder, Grid, Flex } from "@v2/ui-kit";

interface Shortcut {
  id: string;
  name: string;
  key: string;
}

export function ThemeStudioSurface() {
  const [accent, setAccent] = useState("#3b82f6");
  const [density, setDensity] = useState<"compact" | "comfortable" | string>("comfortable");
  const [fontFamily, setFontFamily] = useState("Inter");
  const [isDark, setIsDark] = useState(true);
  
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([
    { id: "save", name: "Save Changes", key: "control+s" },
    { id: "darkmode", name: "Toggle Light/Dark Mode", key: "alt+d" },
    { id: "search", name: "Search Workspace", key: "control+k" },
    { id: "agent", name: "Open AI Agent", key: "control+/" },
  ]);

  const [recordingId, setRecordingId] = useState<string | null>(null);

  // Apply styles to the document elements for real-time preview (CSS Variables)
  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--v2-accent-color", accent);
    root.style.setProperty("--v2-font-family", fontFamily);
    root.style.setProperty("--v2-density-padding", density === "compact" ? "6px" : "12px");
  }, [accent, fontFamily, density]);

  const handleResetShortcuts = () => {
    setShortcuts([
      { id: "save", name: "Save Changes", key: "control+s" },
      { id: "darkmode", name: "Toggle Light/Dark Mode", key: "alt+d" },
      { id: "search", name: "Search Workspace", key: "control+k" },
      { id: "agent", name: "Open AI Agent", key: "control+/" },
    ]);
  };

  return (
    <SurfaceCard>
      <Grid
        cols="1.2fr 1fr"
        gap="24px"
        style={{
          color: "#f3f4f6",
          background: "#111827",
          borderRadius: "12px",
          padding: "24px",
          fontFamily: `${fontFamily}, sans-serif`,
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.3)"
        }}
      >
        <Flex direction="column" gap="20px">
          <Flex align="center" justify="space-between" style={{ borderBottom: "1px solid #374151", paddingBottom: "12px" }}>
            <h1 style={{ fontSize: "20px", fontWeight: 700, color: "#ffffff", margin: 0 }}>Theme Studio</h1>
            <Badge>Native Surface</Badge>
          </Flex>

          {/* Core Appearance Options */}
          <div style={{ background: "#1f2937", borderRadius: "8px", padding: "16px", border: "1px solid #374151" }}>
            <div style={{ fontSize: "14px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", marginBottom: "12px", letterSpacing: "0.05em" }}>
              Design Customization
            </div>
            
            <FormGroup label="Accent Color">
              <ColorPicker
                value={accent}
                onChange={setAccent}
                presets={["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6"]}
              />
            </FormGroup>

            <FormGroup label="Font Family">
              <Select value={fontFamily} onChange={(e) => setFontFamily(e.target.value)}>
                <option value="Inter">Inter</option>
                <option value="Roboto">Roboto</option>
                <option value="Outfit">Outfit</option>
                <option value="Courier New">Monospace</option>
              </Select>
            </FormGroup>

            <FormGroup label="Layout Density">
              <ToggleGroup
                value={density}
                onChange={setDensity}
                options={[
                  { value: "compact", label: "Compact" },
                  { value: "comfortable", label: "Comfortable" }
                ]}
              />
            </FormGroup>
          </div>

          {/* Keyboard Shortcuts configurator */}
          <div style={{ background: "#1f2937", borderRadius: "8px", padding: "16px", border: "1px solid #374151" }}>
            <Flex align="center" justify="space-between" style={{ marginBottom: "12px" }}>
              <div style={{ fontSize: "14px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Keyboard Shortcuts
              </div>
              <button
                style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "11px", cursor: "pointer", textDecoration: "underline" }}
                onClick={handleResetShortcuts}
              >
                Reset Defaults
              </button>
            </Flex>
            <Flex direction="column" gap="8px">
              {shortcuts.map((shortcut) => (
                <Flex key={shortcut.id} align="center" justify="space-between" style={{ padding: "8px 0", borderBottom: "1px solid #374151" }}>
                  <span style={{ fontSize: "13px", color: "#e5e7eb" }}>{shortcut.name}</span>
                  <KeyRecorder
                    value={shortcut.key}
                    onChange={(newKey) => {
                      setShortcuts((prev) =>
                        prev.map((s) => (s.id === shortcut.id ? { ...s, key: newKey } : s))
                      );
                      setRecordingId(null);
                    }}
                    isRecording={recordingId === shortcut.id}
                    onStartRecording={() => setRecordingId(shortcut.id)}
                  />
                </Flex>
              ))}
            </Flex>
          </div>

          <Flex gap="10px" style={{ marginTop: "10px" }}>
            <Button style={{ flex: 1 }}>Save Theme</Button>
          </Flex>
        </Flex>

        {/* Live Preview Pane */}
        <Flex direction="column" gap="12px">
          <div style={{ fontSize: "14px", fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", marginBottom: "8px", letterSpacing: "0.05em" }}>
            Live Workspace Preview
          </div>
          <Flex
            direction="column"
            gap="16px"
            style={{
              background: isDark ? "#1f2937" : "#f9fafb",
              color: isDark ? "#ffffff" : "#111827",
              border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
              borderRadius: "8px",
              padding: "20px",
              boxShadow: "inset 0 2px 4px 0 rgba(0, 0, 0, 0.06)",
              transition: "background-color 0.3s, color 0.3s",
              flex: 1
            }}
          >
            <Flex align="center" justify="space-between" style={{ borderBottom: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`, paddingBottom: "10px" }}>
              <div style={{ fontSize: "16px", fontWeight: 700, color: accent }}>V2 Platform</div>
              <Flex gap="6px" align="center">
                <button
                  onClick={() => setIsDark(!isDark)}
                  style={{ background: "none", border: "none", fontSize: "14px", cursor: "pointer" }}
                >
                  {isDark ? "☀️" : "🌙"}
                </button>
                <Badge>{density}</Badge>
              </Flex>
            </Flex>
            
            <Flex direction="column" gap="12px" style={{ padding: density === "compact" ? "8px 0" : "16px 0" }}>
              <div
                style={{
                  background: isDark ? "#111827" : "#ffffff",
                  border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                  borderRadius: "6px",
                  padding: density === "compact" ? "8px 12px" : "14px 18px"
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Dashboard Summary</div>
                <div style={{ fontSize: "11px", color: isDark ? "#9ca3af" : "#4b5563" }}>
                  This mock widget demonstrates font size, density settings, and accent colors in real-time.
                </div>
              </div>

              <div
                style={{
                  background: isDark ? "#111827" : "#ffffff",
                  border: `1px solid ${isDark ? "#374151" : "#e5e7eb"}`,
                  borderRadius: "6px",
                  padding: density === "compact" ? "8px 12px" : "14px 18px"
                }}
              >
                <div style={{ fontSize: "13px", fontWeight: 600, marginBottom: "4px" }}>Active Database Connections</div>
                <div style={{ fontSize: "11px", color: isDark ? "#9ca3af" : "#4b5563" }}>
                  Cloudflare D1 active. Caching metrics optimal.
                </div>
              </div>
              
              <Button style={{ alignSelf: "flex-start", background: accent, color: "#ffffff", border: "none" }}>
                Interactive Action
              </Button>
            </Flex>
          </Flex>
        </Flex>
      </Grid>
    </SurfaceCard>
  );
}
