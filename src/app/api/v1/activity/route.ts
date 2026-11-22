import { listActivity } from "@/server/data/activity";
import { withStudent } from "@/server/http/with-student";
import { ActivityQuery } from "@/shared/schemas/activity";

export const GET = withStudent({ query: ActivityQuery }, ({ studentId, query }) => listActivity(studentId, query.cursor, query.filter));
