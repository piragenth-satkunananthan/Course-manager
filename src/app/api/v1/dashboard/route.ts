import { getDashboard } from "@/server/data/dashboard";
import { withStudent } from "@/server/http/with-student";

export const GET = withStudent({}, ({ studentId }) => getDashboard(studentId));
