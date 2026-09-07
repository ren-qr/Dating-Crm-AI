export type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T | null;
  requestId: string;
  timestamp: string;
};

export type PaginatedResponse<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
};

export class ApiError extends Error {
  constructor(
    message: string,
    readonly code: number,
    readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** Parses the project's standard API envelope for all browser feature clients. */
export async function request<T>(url: string, init: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: "include",
  });
  const payload = await response.json().catch(() => null) as ApiEnvelope<T> | null;

  if (!response.ok) {
    throw new ApiError(payload?.message ?? `请求失败：${response.status}`, payload?.code ?? response.status, payload?.requestId);
  }

  if (!payload) {
    throw new ApiError("接口未返回有效 JSON", 2000);
  }

  if (payload.code !== 0) {
    throw new ApiError(payload.message || "业务请求失败", payload.code, payload.requestId);
  }

  if (payload.data === null) {
    throw new ApiError("接口未返回数据", 2000, payload.requestId);
  }

  return payload.data;
}
