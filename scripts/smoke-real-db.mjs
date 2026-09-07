#!/usr/bin/env node

const baseUrl = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3100";
const storeId = process.env.DEMO_STORE_ID ?? "demo-store-shanghai";
const email = process.env.SMOKE_EMAIL ?? "admin@meetra.local";
const password = process.env.SMOKE_PASSWORD ?? process.env.DEMO_SEED_PASSWORD ?? "Demo@123456";

const jar = new Map();

function rememberCookies(response) {
  const setCookie = response.headers.getSetCookie?.() ?? [];

  for (const cookie of setCookie) {
    const [pair] = cookie.split(";");
    const [name, value] = pair.split("=");
    if (name && value) {
      jar.set(name.trim(), value.trim());
    }
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function request(path, options = {}) {
  const headers = new Headers(options.headers);
  headers.set("accept", "application/json");

  const cookies = cookieHeader();
  if (cookies) {
    headers.set("cookie", cookies);
  }

  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
    redirect: "manual",
  });
  rememberCookies(response);

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }

  return { response, body };
}

function assert(condition, message, details) {
  if (!condition) {
    const suffix = details === undefined ? "" : `\n${JSON.stringify(details, null, 2)}`;
    throw new Error(`${message}${suffix}`);
  }
}

function assertOk(result, label) {
  assert(result.response.ok, `${label} HTTP failed: ${result.response.status}`, result.body);
  assert(result.body?.code === 0, `${label} API code failed`, result.body);
  assert(result.body?.requestId, `${label} missing requestId`, result.body);
  assert(result.body?.timestamp, `${label} missing timestamp`, result.body);
}

async function login() {
  const csrf = await request("/api/auth/csrf");
  assert(csrf.response.ok, "CSRF request failed", csrf.body);
  assert(csrf.body?.csrfToken, "CSRF token missing", csrf.body);

  const form = new URLSearchParams({
    csrfToken: csrf.body.csrfToken,
    email,
    password,
    json: "true",
    redirect: "false",
  });

  const loginResult = await request("/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  assert(
    loginResult.response.status >= 200 && loginResult.response.status < 400,
    `login failed for ${email}`,
    loginResult.body,
  );

  console.log(`[smoke] 登录账号: ${email}`);
}

async function main() {
  console.log(`[smoke] baseUrl=${baseUrl}`);
  console.log(`[smoke] storeId=${storeId}`);

  await login();

  const me = await request("/api/v1/me");
  assertOk(me, "GET /api/v1/me");
  assert(me.body.data?.email === email, "logged-in employee mismatch", me.body);
  assert(Array.isArray(me.body.data?.permissions), "permissions missing from /me", me.body);
  console.log(`[smoke] 当前员工: ${me.body.data.name} (${me.body.data.roleCodes.join(", ")})`);

  const staffList = await request("/api/v1/staff");
  assertOk(staffList, "GET /api/v1/staff");
  assert(Array.isArray(staffList.body.data?.items), "staff list items missing", staffList.body);
  console.log(`[smoke] 员工列表: total=${staffList.body.data.items.length}`);

  const staffStamp = String(Date.now());
  const createdStaff = await request("/api/v1/staff", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      email: `smoke-staff-${staffStamp}@meetra.local`,
      name: "冒烟员工",
      password: "Demo@123456",
      roleLevel: "staff",
    }),
  });
  assertOk(createdStaff, "POST /api/v1/staff");
  assert(createdStaff.response.status === 201, "staff create should return 201", createdStaff.body);
  assert(createdStaff.body.data?.roleLevel === "staff", "created staff role mismatch", createdStaff.body);
  console.log(`[smoke] 新增员工: ${createdStaff.body.data.email}`);

  const promotedStaff = await request(`/api/v1/staff/${encodeURIComponent(createdStaff.body.data.id)}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      roleLevel: "manager",
    }),
  });
  assertOk(promotedStaff, "PATCH /api/v1/staff/{id} roleLevel");
  assert(promotedStaff.body.data?.roleLevel === "manager", "staff promotion role mismatch", promotedStaff.body);
  console.log(`[smoke] 任命店长: ${promotedStaff.body.data.email}`);

  const members = await request(`/api/v1/members?page=1&pageSize=10&storeId=${encodeURIComponent(storeId)}`);
  assertOk(members, "GET /api/v1/members");
  assert(Array.isArray(members.body.data?.items), "member list items missing", members.body);
  assert(members.body.data.items.length > 0, "seed member list is empty", members.body);
  const member = members.body.data.items.find((item) => item.status !== "BLACKLISTED") ?? members.body.data.items[0];
  assert(member?.id, "member id missing from list", members.body);
  console.log(`[smoke] 会员列表: total=${members.body.data.total}, selected=${member.memberNo}`);

  const stamp = new Date().toISOString();
  const createdMember = await request("/api/v1/members", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      name: "冒烟会员",
      phone: `139${String(Date.now()).slice(-8)}`,
      gender: "UNKNOWN",
      source: "smoke-test",
    }),
  });
  assertOk(createdMember, "POST /api/v1/members");
  assert(createdMember.response.status === 201, "member create should return 201", createdMember.body);
  assert(createdMember.body.data?.id, "created member id missing", createdMember.body);
  console.log(`[smoke] 新增会员: ${createdMember.body.data.memberNo}`);
  const targetMember = createdMember.body.data;

  const detail = await request(
    `/api/v1/members/${encodeURIComponent(targetMember.id)}?storeId=${encodeURIComponent(storeId)}`,
  );
  assertOk(detail, "GET /api/v1/members/{id}");
  assert(detail.body.data?.id === targetMember.id, "member detail id mismatch", detail.body);
  assert(Array.isArray(detail.body.data?.followups), "member detail followups missing", detail.body);
  console.log(`[smoke] 会员详情: ${detail.body.data.memberNo}, followups=${detail.body.data.followups.length}`);

  const followup = await request("/api/v1/followups", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      storeId,
      memberId: targetMember.id,
      type: "CALL",
      content: `真实数据库冒烟跟进 ${stamp}`,
      nextAction: "smoke test follow-up review",
      nextAt: new Date(Date.now() + 86400000).toISOString(),
    }),
  });
  assertOk(followup, "POST /api/v1/followups");
  assert(followup.response.status === 201, "followup should return 201", followup.body);
  assert(followup.body.data?.id, "created followup id missing", followup.body);
  console.log(`[smoke] 新增跟进: ${followup.body.data.id}`);

  const blacklist = await request("/api/v1/blacklists", {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      storeId,
      memberId: targetMember.id,
      reason: `真实数据库冒烟黑名单登记 ${stamp}`,
      severity: "LOW",
    }),
  });
  assertOk(blacklist, "POST /api/v1/blacklists");
  assert(blacklist.response.status === 201, "blacklist should return 201", blacklist.body);
  assert(blacklist.body.data?.id, "created blacklist id missing", blacklist.body);
  assert(!("phone" in blacklist.body.data), "blacklist leaked raw phone", blacklist.body);
  assert(!("idCard" in blacklist.body.data), "blacklist leaked raw idCard", blacklist.body);
  console.log(`[smoke] 登记黑名单: ${blacklist.body.data.id}`);

  const audits = await request(
    `/api/v1/audits?page=1&pageSize=20&storeId=${encodeURIComponent(storeId)}`,
  );
  assertOk(audits, "GET /api/v1/audits");
  assert(Array.isArray(audits.body.data?.items), "audit list items missing", audits.body);
  const hasFollowupAudit = audits.body.data.items.some(
    (item) => item.resourceType === "FollowUpRecord" && item.resourceId === followup.body.data.id,
  );
  const hasBlacklistAudit = audits.body.data.items.some(
    (item) => item.resourceType === "BlacklistEntry" && item.resourceId === blacklist.body.data.id,
  );
  assert(hasFollowupAudit, "created followup audit not found", audits.body.data.items);
  assert(hasBlacklistAudit, "created blacklist audit not found", audits.body.data.items);
  console.log(`[smoke] 审计读取: total=${audits.body.data.total}`);

  console.log("[smoke] 真实数据库 V1 关键链路通过");
}

main().catch((error) => {
  console.error("[smoke] failed");
  console.error(error);
  process.exit(1);
});
