import { NextResponse } from "next/server";

export const ApiCode = {
  OK: 0,
  BAD_REQUEST: 1000,
  UNAUTHENTICATED: 1001,
  FORBIDDEN: 1002,
  NOT_FOUND: 1003,
  CONFLICT: 1004,
  BLACKLIST_BLOCKED: 1005,
  PROFILE_INVALID: 1006,
  FILE_UPLOAD_FAILED: 1007,
  EXPORT_FAILED: 1008,
  INTERNAL_ERROR: 2000,
} as const;

export type ApiCodeValue = (typeof ApiCode)[keyof typeof ApiCode];

export type ApiResponseBody<T> = {
  code: ApiCodeValue;
  message: string;
  data: T | null;
  requestId: string;
  timestamp: string;
};

export function getRequestId(request: Request): string {
  return (
    request.headers.get("x-request-id") ??
    request.headers.get("x-correlation-id") ??
    crypto.randomUUID()
  );
}

export function apiResponse<T>(
  request: Request,
  init: {
    code: ApiCodeValue;
    message: string;
    data: T | null;
    status?: number;
  },
): NextResponse<ApiResponseBody<T>> {
  return NextResponse.json(
    {
      code: init.code,
      message: init.message,
      data: init.data,
      requestId: getRequestId(request),
      timestamp: new Date().toISOString(),
    },
    { status: init.status },
  );
}

export function apiSuccess<T>(
  request: Request,
  data: T,
  message = "success",
): NextResponse<ApiResponseBody<T>> {
  return apiResponse(request, {
    code: ApiCode.OK,
    message,
    data,
    status: 200,
  });
}
