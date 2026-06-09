import { redirect } from "next/navigation";

export default function IntakeReviewRedirectPage({
  params,
}: {
  params: { id: string };
}) {
  redirect(`/dashboard/patients/${params.id}/intake`);
}
