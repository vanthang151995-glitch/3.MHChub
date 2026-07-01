export const formatVietnamDate = (date: Date) => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric"
  }).formatToParts(date);
  const valueFor = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${valueFor("year")}-${valueFor("month")}-${valueFor("day")}`;
};

export const currentDate = () => formatVietnamDate(new Date());
export const currentMonth = () => currentDate().slice(0, 7);

export const addDaysDate = (days: number) => {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return formatVietnamDate(value);
};

export const apiFetch = async <T,>(url: string, options: RequestInit = {}): Promise<T> => {
  const response = await fetch(url, {
    credentials: "include",
    headers: {
      ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...(options.headers || {})
    },
    ...options
  });
  const contentType = response.headers.get("content-type") || "";
  const expectsBody = response.status !== 204 && response.status !== 205;
  if (expectsBody && !contentType.includes("application/json")) {
    const error = new Error(`Expected JSON response from ${url}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  const payload = expectsBody ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    const error = new Error(payload.message || `Request failed: ${response.status}`);
    (error as Error & { status?: number }).status = response.status;
    throw error;
  }
  return payload;
};

export const asArray = <T,>(payload: unknown): T[] => {
  if (Array.isArray(payload)) return payload as T[];
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  if (Array.isArray(record.items)) return record.items as T[];
  if (Array.isArray(record.data)) return record.data as T[];
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  if (Array.isArray(data.items)) return data.items as T[];
  return [];
};

export const apiFetchArray = async <T,>(url: string, options: RequestInit = {}): Promise<T[]> =>
  asArray<T>(await apiFetch<unknown>(url, options));

export type PaginationMeta = {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
};

export type PagedResponse<T> = {
  items: T[];
  pagination: PaginationMeta;
};

const numberMeta = (value: unknown, fallback: number) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const asPagination = (payload: unknown, itemCount = 0, fallbackPageSize = 20): PaginationMeta => {
  const record = payload && typeof payload === "object" ? (payload as Record<string, unknown>) : {};
  const data = record.data && typeof record.data === "object" ? (record.data as Record<string, unknown>) : {};
  const pagination = record.pagination && typeof record.pagination === "object"
    ? (record.pagination as Record<string, unknown>)
    : data.pagination && typeof data.pagination === "object"
      ? (data.pagination as Record<string, unknown>)
      : null;

  if (!pagination) {
    return {
      page: 1,
      pageSize: itemCount || fallbackPageSize,
      totalItems: itemCount,
      totalPages: 1
    };
  }

  const page = Math.max(1, numberMeta(pagination.page, 1));
  const pageSize = Math.max(1, numberMeta(pagination.pageSize, fallbackPageSize));
  const totalItems = Math.max(0, numberMeta(pagination.totalItems, itemCount));
  const totalPages = Math.max(1, numberMeta(pagination.totalPages, Math.ceil(totalItems / pageSize) || 1));

  return { page, pageSize, totalItems, totalPages };
};

export const asPaged = <T,>(payload: unknown, fallbackPageSize = 20): PagedResponse<T> => {
  const items = asArray<T>(payload);
  return {
    items,
    pagination: asPagination(payload, items.length, fallbackPageSize)
  };
};

export const apiFetchPaged = async <T,>(url: string, options: RequestInit = {}, fallbackPageSize = 20): Promise<PagedResponse<T>> =>
  asPaged<T>(await apiFetch<unknown>(url, options), fallbackPageSize);

export const postJson = <T,>(url: string, body: unknown): Promise<T> =>
  apiFetch<T>(url, { method: "POST", body: JSON.stringify(body) });

export const putJson = <T,>(url: string, body: unknown): Promise<T> =>
  apiFetch<T>(url, { method: "PUT", body: JSON.stringify(body) });

export const patchJson = <T,>(url: string, body: unknown): Promise<T> =>
  apiFetch<T>(url, { method: "PATCH", body: JSON.stringify(body) });

export const deleteJson = <T,>(url: string): Promise<T> =>
  apiFetch<T>(url, { method: "DELETE" });
