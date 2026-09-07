import { prisma } from "@/lib/server/prisma";
import type { CapabilityRequest } from "../contracts/capability-request";
import type { GatewayStop } from "../contracts/gateway-result";
import type { RuntimeContext } from "../runtime/runtime-context";
import type { WorkingState } from "../state/working-state";

export class MemberReferenceResolver {
  async resolve(
    request: CapabilityRequest,
    state: WorkingState,
    context: RuntimeContext,
  ): Promise<{ memberId: string } | GatewayStop> {
    const ref = request.args.memberRef;
    if (ref?.kind === "reference") {
      if (ref.ref === "selected_member") {
        return state.selectedMemberId
          ? this.checkCurrentScope(state.selectedMemberId, context)
          : clarify("memberRef", "no_selected_member", "请先从当前查询结果中选择一位会员。");
      }
      if (ref.ref === "result_item" || ref.ref === "selected_refs") {
        const index = itemIndex(ref.value);
        if (!index || !state.activeQuery) {
          return clarify("memberRef", "no_result_reference", "请先查询会员，或说明要查看第几位会员。");
        }
        const memberId = state.activeQuery.resultMemberIds[index - 1];
        return memberId
          ? this.checkCurrentScope(memberId, context)
          : clarify("memberRef", "result_index_out_of_range", "当前结果中没有这一位会员。");
      }
    }

    const memberNo = exactText(request.args.memberNo);
    const name = exactText(request.args.memberName);
    if (!memberNo && !name) {
      return clarify("memberRef", "member_reference_required", "请指定要查看的会员，或从当前结果中选择一位。");
    }
    const members = await prisma.member.findMany({
      where: {
        storeId: context.storeId ?? undefined,
        ownerEmployeeId: context.operatorId,
        ...(memberNo ? { memberNo } : { name: { equals: normalizeName(name!), mode: "insensitive" } }),
      },
      select: { id: true },
      take: 2,
    });
    if (members.length === 0) return { status: "NotFound", message: "未找到当前可访问的会员。" };
    if (members.length > 1) {
      return clarify("memberRef", "member_name_ambiguous", "该姓名对应多位当前可访问会员，请从列表中选择。");
    }
    return { memberId: members[0].id };
  }

  private async checkCurrentScope(memberId: string, context: RuntimeContext) {
    const member = await prisma.member.findFirst({
      where: {
        id: memberId,
        storeId: context.storeId ?? undefined,
        ownerEmployeeId: context.operatorId,
      },
      select: { id: true },
    });
    return member ? { memberId: member.id } : { status: "NotFound" as const, message: "该会员当前不可访问。" };
  }
}

function exactText(argument: CapabilityRequest["args"][string] | undefined) {
  return argument?.kind === "exact" && typeof argument.value === "string" ? argument.value.trim() : null;
}
function normalizeName(value: string) {
  return value.trim().replace(/\s+/g, " ");
}
function itemIndex(value: string | number | undefined) {
  if (typeof value === "number") return value;
  const matched = typeof value === "string" ? /^item-(\d+)$/.exec(value) : null;
  return matched ? Number(matched[1]) : null;
}
function clarify(field: string, reason: string, question: string): GatewayStop {
  return { status: "ClarificationRequired", message: question, clarification: { field, reason, question, options: [] } };
}
