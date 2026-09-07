import type { JsonRecord } from "./common-types";

declare const displayBrand: unique symbol;
export type AuthorizedDisplayResult = Readonly<{
  [displayBrand]: true;
  resultRef: string;
  type: "member_list" | "member_profile";
  items: JsonRecord[];
}>;
