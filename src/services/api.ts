import type { HubConfig, SafetyBulletin } from "../core/hubCore";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

type ApiPayload = Record<string, unknown>;
type ApiError = Error & { code?: string; payload?: unknown; status?: number };
type QueryParams = Record<string, boolean | number | string | null | undefined>;
type ApiListResponse<T> = {
  items: T[];
  pagination?: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
  [key: string]: unknown;
};
export type AuthUser = {
  departmentId?: string | null;
  displayName?: string;
  id?: string;
  role?: string;
  username?: string;
  [key: string]: unknown;
};
type AuthResponse = {
  data?: {
    user?: AuthUser | null;
  };
};
export type DocumentRecord = {
  category?: string;
  createdAt?: string;
  departmentId?: string;
  departmentName?: string | Record<string, string>;
  fileName?: string;
  id?: string;
  language?: string;
  originalName?: string;
  previewStatus?: string;
  size?: number;
  title?: string;
  titleI18n?: Record<string, string | undefined>;
  updatedAt?: string;
  uploadedAt?: string;
  url?: string;
  version?: string;
  [key: string]: unknown;
};
type DocumentPreviewPayload = ApiPayload & {
  document?: DocumentRecord;
  kind?: string;
};
type ActivityRecord = Record<string, unknown>;
type BackupRecord = Record<string, unknown>;
export type AdminUserRecord = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  departmentId: string | null;
  createdAt?: string;
  lastLoginAt?: string;
  activeSessionId?: string | null;
};
type BulletinLogRecord = Record<string, unknown>;
type DocumentFormValue = Blob | boolean | number | object | string | null | undefined;
type DocumentForm = Record<string, DocumentFormValue>;
type UploadProgress = {
  lengthComputable: boolean;
  loaded: number;
  percent: number | null;
  total: number;
};
type UploadOptions = {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
};

const appendQueryParams = (query: URLSearchParams, params: QueryParams) => {
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, String(value));
  });
};

const payloadMessage = (payload: ApiPayload, fallback: string) =>
  typeof payload.message === "string" && payload.message ? payload.message : fallback;

const payloadCode = (payload: ApiPayload) => (typeof payload.code === "string" ? payload.code : undefined);

const parseJson = async <T = unknown>(response: Response): Promise<T> => {
  const contentType = response.headers.get("content-type") || "";
  const expectsBody = response.status !== 204 && response.status !== 205;
  if (expectsBody && !contentType.includes("application/json")) {
    const error = new Error(`Expected JSON response: ${response.status}`) as ApiError;
    error.status = response.status;
    throw error;
  }
  const payload = (expectsBody ? await response.json().catch(() => ({})) : {}) as ApiPayload;
  if (!response.ok) {
    const error = new Error(payloadMessage(payload, `Request failed: ${response.status}`)) as ApiError;
    error.status = response.status;
    error.code = payloadCode(payload);
    error.payload = payload;
    throw error;
  }
  return payload as T;
};

const documentFormData = (form: DocumentForm) => {
  const body = new FormData();
  Object.entries(form).forEach(([key, value]) => {
    if (!value) return;
    if (value instanceof Blob) {
      body.append(key, value);
    } else if (typeof value === "object") {
      body.append(key, JSON.stringify(value));
    } else {
      body.append(key, String(value));
    }
  });
  return body;
};

export const api = {
  async fetchCurrentUser() {
    return parseJson<AuthResponse>(await fetch(`${API_BASE}/api/auth/me`, { credentials: "include" }));
  },
  async login(username: string, password: string) {
    return parseJson<AuthResponse>(
      await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      })
    );
  },
  async logout() {
    return parseJson<ApiPayload>(
      await fetch(`${API_BASE}/api/auth/logout`, {
        method: "POST",
        credentials: "include"
      })
    );
  },
  async fetchConfig() {
    return parseJson<Partial<HubConfig>>(await fetch(`${API_BASE}/api/config`));
  },
  async fetchSafetyBulletins(params: QueryParams & { includeDeleted?: boolean; includeDrafts?: boolean } = {}) {
    const query = new URLSearchParams();
    appendQueryParams(query, params);
    return parseJson<ApiListResponse<SafetyBulletin>>(
      await fetch(`${API_BASE}/api/safety-bulletins?${query.toString()}`, {
        credentials: params.includeDrafts || params.includeDeleted ? "include" : "same-origin"
      })
    );
  },
  async createSafetyBulletin(form: unknown, pin = "") {
    return parseJson<SafetyBulletin>(
      await fetch(`${API_BASE}/api/safety-bulletins`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-PIN": pin
        },
        body: JSON.stringify(form)
      })
    );
  },
  async updateSafetyBulletin(id: string, form: unknown, pin = "") {
    return parseJson<SafetyBulletin>(
      await fetch(`${API_BASE}/api/safety-bulletins/${encodeURIComponent(id)}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-PIN": pin
        },
        body: JSON.stringify(form)
      })
    );
  },
  async deleteSafetyBulletin(id: string, pin = "") {
    return parseJson<SafetyBulletin>(
      await fetch(`${API_BASE}/api/safety-bulletins/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include",
        headers: { "X-Admin-PIN": pin }
      })
    );
  },
  async restoreSafetyBulletin(id: string, pin = "") {
    return parseJson<SafetyBulletin>(
      await fetch(`${API_BASE}/api/safety-bulletins/${encodeURIComponent(id)}/restore`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Admin-PIN": pin }
      })
    );
  },
  async fetchSafetyBulletinLogs(id: string, params: QueryParams = {}) {
    const query = new URLSearchParams();
    appendQueryParams(query, params);
    return parseJson<ApiListResponse<BulletinLogRecord>>(
      await fetch(`${API_BASE}/api/safety-bulletins/${encodeURIComponent(id)}/logs?${query.toString()}`, {
        credentials: "include"
      })
    );
  },
  async saveConfig(config: unknown, pin = "") {
    return parseJson<HubConfig>(
      await fetch(`${API_BASE}/api/config`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-PIN": pin
        },
        body: JSON.stringify(config)
      })
    );
  },
  async fetchSystemStatus() {
    return parseJson<ApiPayload>(await fetch(`${API_BASE}/api/system/status`, { credentials: "include" }));
  },
  async fetchSystemPreflight() {
    return parseJson<ApiPayload>(await fetch(`${API_BASE}/api/system/preflight`, { credentials: "include" }));
  },
  async fetchActivity(params: QueryParams = {}) {
    const query = new URLSearchParams();
    appendQueryParams(query, params);
    return parseJson<ApiListResponse<ActivityRecord>>(await fetch(`${API_BASE}/api/activity?${query.toString()}`, { credentials: "include" }));
  },
  async fetchBackups() {
    return parseJson<BackupRecord[]>(await fetch(`${API_BASE}/api/backups`, { credentials: "include" }));
  },
  async createBackup(pin: string, reason = "manual") {
    return parseJson<BackupRecord>(
      await fetch(`${API_BASE}/api/backups`, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-PIN": pin
        },
        body: JSON.stringify({ reason })
      })
    );
  },
  async fetchDocuments(params: QueryParams = {}) {
    const query = new URLSearchParams();
    appendQueryParams(query, params);
    return parseJson<ApiListResponse<DocumentRecord>>(await fetch(`${API_BASE}/api/documents?${query.toString()}`));
  },
  async fetchDocumentPreview(id: string) {
    const response = await fetch(`${API_BASE}/api/documents/${encodeURIComponent(id)}/preview`);
    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const error = new Error("Preview API is not available") as ApiError;
      error.status = response.status;
      error.code = "PREVIEW_API_UNAVAILABLE";
      throw error;
    }
    return parseJson<DocumentPreviewPayload>(response);
  },
  documentFileUrl(id: string, disposition = "inline") {
    const query = new URLSearchParams();
    if (disposition) query.set("disposition", disposition);
    return `${API_BASE}/api/documents/${encodeURIComponent(id)}/file?${query.toString()}`;
  },
  documentPreviewFileUrl(id: string, refresh = false) {
    const query = new URLSearchParams();
    if (refresh) query.set("refresh", "true");
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return `${API_BASE}/api/documents/${encodeURIComponent(id)}/preview-file${suffix}`;
  },
  documentExcelHtmlPreviewUrl(id: string, refresh = false) {
    const query = new URLSearchParams();
    if (refresh) query.set("refresh", "true");
    const suffix = query.toString() ? `?${query.toString()}` : "";
    return `${API_BASE}/api/documents/${encodeURIComponent(id)}/excel-html-preview/${suffix}`;
  },
  async uploadDocument(form: DocumentForm, pin = "", options: UploadOptions = {}) {
    const body = documentFormData(form);
    if (typeof options.onProgress === "function") {
      return new Promise<DocumentRecord>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        const cleanup = () => {
          options.signal?.removeEventListener?.("abort", abortUpload);
        };
        const rejectWith = (message: string, code: string) => {
          const error = new Error(message) as ApiError;
          error.code = code;
          reject(error);
        };
        const abortUpload = () => {
          xhr.abort();
        };

        xhr.open("POST", `${API_BASE}/api/documents`);
        xhr.withCredentials = true;
        xhr.setRequestHeader("X-Admin-PIN", pin);
        xhr.upload.onprogress = (event) => {
          options.onProgress({
            lengthComputable: event.lengthComputable,
            loaded: event.loaded,
            total: event.lengthComputable ? event.total : 0,
            percent: event.lengthComputable && event.total ? Math.round((event.loaded / event.total) * 100) : null
          });
        };
        xhr.onload = () => {
          cleanup();
          let payload: ApiPayload = {};
          try {
            payload = JSON.parse(xhr.responseText || "{}");
          } catch {
            payload = { message: xhr.responseText || "" };
          }
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(payload as DocumentRecord);
            return;
          }
          const error = new Error(payloadMessage(payload, `Request failed: ${xhr.status}`)) as ApiError;
          error.status = xhr.status;
          error.code = payloadCode(payload);
          error.payload = payload;
          reject(error);
        };
        xhr.onerror = () => {
          cleanup();
          rejectWith("Network error while uploading document", "UPLOAD_NETWORK_ERROR");
        };
        xhr.onabort = () => {
          cleanup();
          rejectWith("Upload cancelled", "UPLOAD_ABORTED");
        };

        if (options.signal) {
          if (options.signal.aborted) {
            abortUpload();
            return;
          }
          options.signal.addEventListener("abort", abortUpload, { once: true });
        }
        xhr.send(body);
      });
    }

    return parseJson<DocumentRecord>(
      await fetch(`${API_BASE}/api/documents`, {
        method: "POST",
        credentials: "include",
        headers: { "X-Admin-PIN": pin },
        body
      })
    );
  },
  async updateDocument(id: string, form: unknown, pin = "") {
    return parseJson<DocumentRecord>(
      await fetch(`${API_BASE}/api/documents/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          "X-Admin-PIN": pin
        },
        body: JSON.stringify(form)
      })
    );
  },
  async deleteDocument(id: string, pin = "") {
    const response = await fetch(`${API_BASE}/api/documents/${id}`, {
      method: "DELETE",
      credentials: "include",
      headers: { "X-Admin-PIN": pin }
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => ({}))) as ApiPayload;
      throw new Error(payloadMessage(payload, "Delete failed"));
    }
  },
  async fetchAppSettings() {
    return parseJson<{ hasLogo: boolean; logoUrl: string | null }>(
      await fetch(`${API_BASE}/api/app-settings`)
    );
  },
  async uploadLogo(file: File) {
    const body = new FormData();
    body.append("logo", file);
    return parseJson<{ success: boolean; logoUrl: string }>(
      await fetch(`${API_BASE}/api/app-settings/logo`, {
        method: "POST",
        credentials: "include",
        body
      })
    );
  },
  async deleteLogo() {
    return parseJson<{ success: boolean }>(
      await fetch(`${API_BASE}/api/app-settings/logo`, {
        method: "DELETE",
        credentials: "include"
      })
    );
  },
  async updateProfile(displayName: string) {
    return parseJson<{ data: { user: { displayName: string } } }>(
      await fetch(`${API_BASE}/api/auth/me`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName })
      })
    );
  },
  async changePassword(currentPassword: string, newPassword: string) {
    return parseJson<{ data: { ok: boolean } }>(
      await fetch(`${API_BASE}/api/auth/change-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword })
      })
    );
  },
  async listAdminUsers() {
    return parseJson<{ data: AdminUserRecord[] }>(
      await fetch(`${API_BASE}/api/admin/users`, { credentials: "include" })
    );
  },
  async createAdminUser(body: { username: string; displayName: string; password: string; role: string; departmentId: string }) {
    return parseJson<{ data: AdminUserRecord }>(
      await fetch(`${API_BASE}/api/admin/users`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
    );
  },
  async updateAdminUser(id: string, body: { displayName?: string; role?: string; departmentId?: string }) {
    return parseJson<{ data: AdminUserRecord }>(
      await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(id)}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
    );
  },
  async resetAdminUserPassword(id: string, password: string) {
    return parseJson<{ data: { ok: boolean } }>(
      await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(id)}/reset-password`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      })
    );
  },
  async deleteAdminUser(id: string) {
    return parseJson<{ data: { ok: boolean } }>(
      await fetch(`${API_BASE}/api/admin/users/${encodeURIComponent(id)}`, {
        method: "DELETE",
        credentials: "include"
      })
    );
  }
};
