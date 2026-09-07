import type { JsonRecord, TrustZone } from "./common-types";

declare const safeBrand: unique symbol;
export type SafeResult = Readonly<{
  [safeBrand]: true;
  capability: string;
  requestId: string;
  trustZone: TrustZone;
  data: JsonRecord;
}>;
