import { redirect } from "next/navigation";

type PageProps = {
  params: { token: string };
};

/** Magic-link entry — routes patients into Step 1 (layout validates the token). */
export default function IntakeEntryPage({ params }: PageProps) {
  const rawToken = params.token?.trim();
  if (!rawToken) {
    redirect("/");
  }

  redirect(`/intake/${encodeURIComponent(rawToken)}/step-one`);
}
