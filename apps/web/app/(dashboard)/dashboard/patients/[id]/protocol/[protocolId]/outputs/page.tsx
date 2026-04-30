import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAuth } from "@/lib/auth";
import { patientBelongsToTenant } from "@/lib/records";
import { getProtocol } from "@/lib/protocols";
import { getProtocolOutputs } from "@/lib/protocol-outputs";
import { Page, PageHeader } from "@/components/ui/page";
import { Badge } from "@/components/ui/badge";
import { ClientDocView } from "./client-doc-view";
import { CallDeckView } from "./call-deck-view";
import { EmailDraftView } from "./email-draft-view";

export default async function ProtocolOutputsPage({
  params,
}: {
  params: { id: string; protocolId: string };
}) {
  const user = await requireAuth();
  const ok = await patientBelongsToTenant(user.tenantId, params.id);
  if (!ok) notFound();

  const protocol = await getProtocol(user.tenantId, params.protocolId);
  if (!protocol || protocol.patientId !== params.id) notFound();

  const outputs = await getProtocolOutputs(user.tenantId, params.protocolId);

  const clientDoc = outputs.find((o) => o.outputType === "client_doc");
  const callDeck = outputs.find((o) => o.outputType === "call_deck");
  const emailDraft = outputs.find((o) => o.outputType === "follow_up_email");

  const noOutputs = outputs.length === 0;

  return (
    <Page>
      <div className="mb-2">
        <Link
          href={`/dashboard/patients/${params.id}/protocol/${params.protocolId}`}
          className="text-sm text-ink-subtle transition-colors hover:text-ink"
        >
          ← Back to protocol
        </Link>
      </div>

      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-3">
            <Badge tone={protocol.status === "approved" ? "success" : "neutral"}>
              {protocol.status}
            </Badge>
            <span>v{protocol.version}</span>
          </span>
        }
        title="Generated outputs"
        description={
          noOutputs
            ? "No outputs have been generated yet. Approve the protocol to trigger generation."
            : "These documents were auto-generated when you approved the protocol."
        }
      />

      {noOutputs && protocol.status !== "approved" && (
        <div className="rounded-xl border border-line bg-surface-sunken/40 p-8 text-center">
          <p className="text-sm text-ink-muted">
            Approve the protocol to auto-generate the client document, call deck, and follow-up email.
          </p>
          <Link
            href={`/dashboard/patients/${params.id}/protocol/${params.protocolId}`}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-ink-inverse transition-colors hover:bg-accent-hover"
          >
            Go to protocol
          </Link>
        </div>
      )}

      {noOutputs && protocol.status === "approved" && (
        <div className="rounded-xl border border-line bg-surface-sunken/40 p-8 text-center">
          <p className="text-sm text-ink-muted">
            Outputs are being generated. This usually takes 30-60 seconds. Refresh to check progress.
          </p>
        </div>
      )}

      {!noOutputs && (
        <div className="flex flex-col gap-8">
          {/* Client Document */}
          <section>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-lg font-semibold text-ink">Client document</h2>
              {clientDoc && (
                <Badge tone={clientDoc.status === "complete" ? "success" : clientDoc.status === "failed" ? "danger" : "warning"}>
                  {clientDoc.status}
                </Badge>
              )}
            </div>
            {clientDoc?.status === "complete" ? (
              <ClientDocView content={clientDoc.content} />
            ) : clientDoc?.status === "failed" ? (
              <ErrorCard message={clientDoc.errorMessage} />
            ) : clientDoc ? (
              <GeneratingCard />
            ) : null}
          </section>

          {/* Call Deck */}
          <section>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-lg font-semibold text-ink">Call deck</h2>
              {callDeck && (
                <Badge tone={callDeck.status === "complete" ? "success" : callDeck.status === "failed" ? "danger" : "warning"}>
                  {callDeck.status}
                </Badge>
              )}
            </div>
            {callDeck?.status === "complete" ? (
              <CallDeckView content={callDeck.content} />
            ) : callDeck?.status === "failed" ? (
              <ErrorCard message={callDeck.errorMessage} />
            ) : callDeck ? (
              <GeneratingCard />
            ) : null}
          </section>

          {/* Email Draft */}
          <section>
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-lg font-semibold text-ink">Follow-up email</h2>
              {emailDraft && (
                <Badge tone={emailDraft.status === "complete" ? "success" : emailDraft.status === "failed" ? "danger" : "warning"}>
                  {emailDraft.status}
                </Badge>
              )}
            </div>
            {emailDraft?.status === "complete" ? (
              <EmailDraftView content={emailDraft.content} />
            ) : emailDraft?.status === "failed" ? (
              <ErrorCard message={emailDraft.errorMessage} />
            ) : emailDraft ? (
              <GeneratingCard />
            ) : null}
          </section>
        </div>
      )}
    </Page>
  );
}

function GeneratingCard() {
  return (
    <div className="rounded-xl border border-line bg-surface-sunken/40 p-6 text-center">
      <p className="text-sm text-ink-muted">Generating… refresh in a few seconds.</p>
    </div>
  );
}

function ErrorCard({ message }: { message: string | null }) {
  return (
    <div className="rounded-xl border border-danger-soft bg-danger-soft/20 p-6">
      <p className="text-sm text-danger">Generation failed: {message ?? "Unknown error"}</p>
    </div>
  );
}
