import { Activity } from "lucide-react";
import { ComingSoon } from "@/components/app/coming-soon";

// shortcut: placeholder until the Activity Log ships with Auto Changes (#12).
export default function ActivityPage() {
  return <ComingSoon title="Activity" icon={Activity}>Changes the AI makes from your WhatsApp groups will show here, each with Undo.</ComingSoon>;
}
