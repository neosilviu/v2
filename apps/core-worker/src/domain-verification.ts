export type VerifiableDomain = {
  hostname: string;
  verificationMethod: "manual" | "dns-txt" | "dns-cname";
  verificationInstructions: Record<string, unknown> | null;
};

export async function verifyDnsDomain(
  domain: VerifiableDomain,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (domain.verificationMethod === "manual")
    return {
      ok: false,
      error: "Manual verification requires an explicit audited recovery path.",
    };
  const record =
    domain.verificationMethod === "dns-cname"
      ? typeof domain.verificationInstructions?.cnameRecord === "string"
        ? domain.verificationInstructions.cnameRecord
        : `_v2-verify.${domain.hostname}`
      : typeof domain.verificationInstructions?.txtRecord === "string"
        ? domain.verificationInstructions.txtRecord
        : `_v2-verify.${domain.hostname}`;
  const expected =
    domain.verificationMethod === "dns-cname"
      ? typeof domain.verificationInstructions?.target === "string"
        ? domain.verificationInstructions.target.toLowerCase()
        : ""
      : typeof domain.verificationInstructions?.token === "string"
        ? domain.verificationInstructions.token.toLowerCase()
        : "";
  if (!expected)
    return { ok: false, error: "Domain verification target is missing." };
  const type = domain.verificationMethod === "dns-cname" ? "CNAME" : "TXT";
  const response = await fetch(
    `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(record)}&type=${type}`,
    { headers: { accept: "application/dns-json" } },
  );
  if (!response.ok)
    return { ok: false, error: "DNS verification lookup failed." };
  const body = (await response.json()) as { Answer?: Array<{ data?: string }> };
  const answers = (body.Answer ?? []).map((answer) =>
    String(answer.data ?? "")
      .replaceAll('"', "")
      .toLowerCase(),
  );
  return answers.some((answer) => answer.includes(expected))
    ? { ok: true }
    : { ok: false, error: "Expected DNS verification record was not found." };
}
