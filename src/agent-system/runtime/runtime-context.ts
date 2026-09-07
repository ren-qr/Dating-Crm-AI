import type { AuthContext } from "@/lib/server/route-helpers";
import type { TrustZone } from "../contracts/common-types";

export type RuntimeContext = Readonly<{
  auth: AuthContext;
  operatorId: string;
  storeId: string | null;
  sessionId: string;
  traceId: string;
  trustZone: TrustZone;
}>;
