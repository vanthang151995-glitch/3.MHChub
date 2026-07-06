import { Building2, ClipboardCheck, Eye, Factory, GitBranch, ImagePlus, Link2, Megaphone, Plus, RotateCcw, Save, Shield, Trash2 } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ComponentType } from "react";
import { SafetyBulletinModal } from "../components/SafetyBulletinModal";
import { SafetyBulletinCreateModal } from "../components/SafetyBulletinCreateModal";
const SafetyBulletinViewModal = lazy(() =>
  import("../components/SafetyBulletinViewModal").then((m) => ({ default: m.SafetyBulletinViewModal }))
);
import { BulletinItem, Button, Card, Field, Pagination } from "../components/ui";
import { UserManagementPanel } from "./UserManagementPanel";
import { OnlineUsersPanel } from "../components/OnlineUsersPanel";
import { AuthAuditPanel } from "../components/AuthAuditPanel";
import { OrgStructurePage } from "./OrgStructurePage";
import {
  createAction,
  createBulletin,
  createDepartment,
  createLink,
  listToText,
  normalizeHubConfig,
  paginateItems,
  textToList
} from "../core/hubCore";
import type { HubConfig, LocalizedString, LocalizedStringList, SafetyBulletin } from "../core/hubCore";
import { getText } from "../i18n";
import type { HubLanguage, HubTranslate } from "../i18n-context";
import { api } from "../services/api";
import type { AuthUser } from "../services/api";
import "./operations-admin.css";

const updateAt = <T,>(items: T[], index: number, patch: Partial<T>) =>
  items.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item));

const removeAt = <T,>(items: T[], index: number) => items.filter((_item, itemIndex) => itemIndex !== index);

const updateLang = <T extends LocalizedString | LocalizedStringList>(value: T | undefined, lang: HubLanguage, text: T[string]) =>
  ({ ...(value || {}), [lang]: text }) as T;

type AdminPageProps = {
  config: HubConfig;
  lang: HubLanguage;
  setConfig: (config: HubConfig) => void;
  t: HubTranslate;
  user?: AuthUser | null;
  [key: string]: unknown;
};

function AdminHeroSummaryItem({
  icon: Icon,
  label,
  value,
  tone = "blue"
}: {
  icon: ComponentType<{ size?: number | string }>;
  label: string;
  tone?: string;
  value: number | string;
}) {
  return (
    <div className={`control-summary-card ${tone}`}>
      <Icon size={16} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

export function AdminPage({ config, setConfig, lang, t, user }: AdminPageProps) {
  const [draft, setDraft] = useState<HubConfig>(config);
  const [message, setMessage] = useState("");
  const [linkPage, setLinkPage] = useState(1);
  const [deptPage, setDeptPage] = useState(1);
  const [bulletinPage, setBulletinPage] = useState(1);
  const [actionPage, setActionPage] = useState(1);
  const [saving, setSaving] = useState(false);
  const [bulletinItems, setBulletinItems] = useState<SafetyBulletin[]>([]);
  const [bulletinModal, setBulletinModal] = useState<SafetyBulletin | null>(null);
  const [creatingBulletin, setCreatingBulletin] = useState(false);
  const [bulletinLoading, setBulletinLoading] = useState(false);
  const [showNewBulletinCreate, setShowNewBulletinCreate] = useState(false);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMessage, setLogoMessage] = useState("");
  const [trashOpen, setTrashOpen] = useState(false);
  const [trashItems, setTrashItems] = useState<SafetyBulletin[]>([]);
  const [trashLoading, setTrashLoading] = useState(false);
  const [trashError, setTrashError] = useState("");
  const [trashBusy, setTrashBusy] = useState<Record<string, string>>({});
  const [trashPreview, setTrashPreview] = useState<SafetyBulletin | null>(null);
  const [githubSyncing, setGithubSyncing] = useState(false);
  const [githubSyncResult, setGithubSyncResult] = useState<{ ok: boolean; message: string; committed?: boolean } | null>(null);
  const [githubStatus, setGithubStatus] = useState<{ configured: boolean; repo: string; scheduleHours: number; debounceSeconds: number; isSyncing: boolean; pendingSync: boolean; pendingReason: string | null; lastSyncTime: string | null; lastSyncStatus: Record<string, unknown> | null } | null>(null);

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    api.fetchAppSettings()
      .then((data) => setLogoUrl(data.logoUrl || null))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/admin/github-sync/status", { credentials: "include" })
      .then((r) => r.json())
      .then((data) => setGithubStatus(data))
      .catch(() => {});
  }, []);

  const handleGithubSync = async () => {
    if (githubSyncing) return;
    setGithubSyncing(true);
    setGithubSyncResult(null);
    try {
      const res = await fetch("/api/admin/github-sync/run", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ triggeredBy: "admin-manual" }),
      });
      const data = await res.json();
      setGithubSyncResult(data);
      fetch("/api/admin/github-sync/status", { credentials: "include" })
        .then((r) => r.json())
        .then((s) => setGithubStatus(s))
        .catch(() => {});
    } catch {
      setGithubSyncResult({ ok: false, message: "Lỗi kết nối server" });
    } finally {
      setGithubSyncing(false);
    }
  };

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setLogoUploading(true);
    setLogoMessage("");
    try {
      const result = await api.uploadLogo(file);
      setLogoUrl(result.logoUrl + "?v=" + Date.now());
      window.dispatchEvent(new Event("logo-updated"));
      setLogoMessage("Logo đã được cập nhật thành công.");
    } catch (err: unknown) {
      setLogoMessage(err instanceof Error ? err.message : "Lỗi khi tải logo lên.");
    } finally {
      setLogoUploading(false);
      event.target.value = "";
    }
  };

  const handleLogoDelete = async () => {
    setLogoUploading(true);
    setLogoMessage("");
    try {
      await api.deleteLogo();
      setLogoUrl(null);
      window.dispatchEvent(new Event("logo-updated"));
      setLogoMessage("Logo đã được xóa.");
    } catch (err: unknown) {
      setLogoMessage(err instanceof Error ? err.message : "Lỗi khi xóa logo.");
    } finally {
      setLogoUploading(false);
    }
  };

  useEffect(() => {
    let alive = true;
    setBulletinLoading(true);
    api.fetchSafetyBulletins({ includeDrafts: true, page: 1, pageSize: 100 })
      .then((payload) => {
        if (alive) setBulletinItems((payload.items || []) as SafetyBulletin[]);
      })
      .catch((error) => {
        if (alive) setMessage(error.message);
      })
      .finally(() => {
        if (alive) setBulletinLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  const links = paginateItems(draft.utilityLinks || [], linkPage, 4);
  const departments = paginateItems(draft.departments || [], deptPage, 3);
  const bulletins = paginateItems(bulletinItems, bulletinPage, 3);
  const actions = paginateItems(draft.safetyActions || [], actionPage, 5);
  const isDirty = useMemo(() => JSON.stringify(draft) !== JSON.stringify(config), [draft, config]);
  const saveStatusLabel = saving ? t("saving") : isDirty ? t("unsavedChanges") : t("allChangesSaved");

  const save = async () => {
    if (!isDirty || saving) return;
    setMessage("");
    setSaving(true);
    try {
      const saved = await api.saveConfig(draft);
      setConfig(normalizeHubConfig(saved as Partial<HubConfig>));
      setMessage(t("saved"));
    } catch (err: unknown) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const openCreateBulletin = () => {
    setShowNewBulletinCreate(true);
  };

  const openEditBulletin = (bulletin: SafetyBulletin) => {
    setCreatingBulletin(false);
    setBulletinModal(bulletin);
  };

  const handleBulletinSaved = (saved: SafetyBulletin) => {
    setBulletinItems((items) => [saved, ...items.filter((item) => item.id !== saved.id)]);
    setBulletinModal(saved);
    setCreatingBulletin(false);
    setMessage(t("saved"));
  };

  const handleBulletinDeleted = (updated: SafetyBulletin) => {
    setBulletinItems((items) => items.map((item) => (item.id === updated.id ? updated : item)));
    setBulletinModal(updated);
    setMessage(t("saved"));
  };

  useEffect(() => {
    if (!trashOpen) return;
    let alive = true;
    setTrashLoading(true);
    setTrashError("");
    api.fetchSafetyBulletins({ includeDeleted: true, includeDrafts: true, page: 1, pageSize: 200 })
      .then((payload) => {
        if (!alive) return;
        const deleted = ((payload.items || []) as SafetyBulletin[]).filter((b) => !!(b as Record<string, unknown>).deletedAt);
        setTrashItems(deleted);
      })
      .catch((err) => { if (alive) setTrashError(err.message || "Lỗi tải dữ liệu"); })
      .finally(() => { if (alive) setTrashLoading(false); });
    return () => { alive = false; };
  }, [trashOpen]);

  const handleTrashRestore = async (id: string) => {
    setTrashBusy((p) => ({ ...p, [id]: "restore" }));
    setTrashError("");
    try {
      const restored = await api.restoreSafetyBulletin(id);
      setTrashItems((items) => items.filter((b) => b.id !== id));
      setBulletinItems((items) => [restored, ...items.filter((b) => b.id !== id)]);
    } catch (err: unknown) {
      setTrashError(err instanceof Error ? err.message : "Khôi phục thất bại");
    } finally {
      setTrashBusy((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  };

  const handleTrashPurge = async (id: string, title: string) => {
    if (!window.confirm(`Xóa vĩnh viễn "${title}"?\n\nHành động này KHÔNG thể hoàn tác.`)) return;
    setTrashBusy((p) => ({ ...p, [id]: "purge" }));
    setTrashError("");
    try {
      await api.purgeSafetyBulletin(id);
      setTrashItems((items) => items.filter((b) => b.id !== id));
    } catch (err: unknown) {
      setTrashError(err instanceof Error ? err.message : "Xóa vĩnh viễn thất bại");
    } finally {
      setTrashBusy((p) => { const n = { ...p }; delete n[id]; return n; });
    }
  };

  return (
    <div className="page admin-page">
      <section className="title-band admin-title-band">
        <div className="admin-title-copy">
          <h1>{t("adminTitle")}</h1>
          <p>{t("adminSubtitle")}</p>
          <div className="control-hero-summary admin-hero-summary">
            <AdminHeroSummaryItem
              icon={Link2}
              label={t("systemLinks")}
              tone="blue"
              value={draft.utilityLinks?.length || 0}
            />
            <AdminHeroSummaryItem
              icon={Building2}
              label={t("departments")}
              tone="good"
              value={draft.departments?.length || 0}
            />
            <AdminHeroSummaryItem
              icon={Megaphone}
              label={t("adminBulletinSection")}
              tone="violet"
              value={bulletinItems.length}
            />
            <AdminHeroSummaryItem
              icon={ClipboardCheck}
              label={t("actionConfig")}
              tone="watch"
              value={draft.safetyActions?.length || 0}
            />
            <AdminHeroSummaryItem
              icon={Save}
              label={t("save")}
              tone={isDirty ? "alert" : "good"}
              value={message || saveStatusLabel}
            />
          </div>
        </div>
        <div className="admin-save-box">
          <p className="admin-auth-note">{t("adminLoginActive")}</p>
          <p className={`admin-sync-note ${isDirty ? "dirty" : "clean"}`}>{saveStatusLabel}</p>
          <Button className="primary-button" disabled={!isDirty || saving} onClick={save}>
            <Save size={18} />
            {saving ? t("saving") : t("save")}
          </Button>
          {message ? <p className="form-message">{message}</p> : null}
        </div>
      </section>

      <nav aria-label={t("adminQuickNav")} className="admin-quick-nav">
        <a href="#admin-logo">
          <ImagePlus size={16} />
          <span>Logo</span>
        </a>
        <a href="#admin-links">
          <Link2 size={16} />
          <span>{t("systemLinks")}</span>
          <strong>{draft.utilityLinks?.length || 0}</strong>
        </a>
        <a href="#admin-departments">
          <Building2 size={16} />
          <span>{t("departmentConfig")}</span>
          <strong>{draft.departments?.length || 0}</strong>
        </a>
        <a href="#admin-bulletins">
          <Megaphone size={16} />
          <span>{t("adminBulletinSection")}</span>
          <strong>{bulletinItems.length}</strong>
        </a>
        <a href="#admin-actions">
          <ClipboardCheck size={16} />
          <span>{t("actionConfig")}</span>
          <strong>{draft.safetyActions?.length || 0}</strong>
        </a>
        <a href="#admin-trash">
          <Trash2 size={16} />
          <span>Thùng rác</span>
          {trashItems.length > 0 && <strong>{trashItems.length}</strong>}
        </a>
        <a href="#admin-users">
          <Shield size={16} />
          <span>Tài khoản</span>
        </a>
        <a href="#admin-org">
          <Factory size={16} />
          <span>Cấu trúc tổ chức</span>
        </a>
      </nav>

      <section className="admin-section" id="admin-logo">
        <div className="panel-header">
          <h2>Logo công ty</h2>
        </div>
        <div className="logo-upload-card">
          <div className="logo-preview-area">
            {logoUrl ? (
              <img
                alt="Logo hiện tại"
                className="logo-preview-img"
                onError={(e) => { e.currentTarget.style.display = "none"; }}
                src={logoUrl}
              />
            ) : (
              <div className="logo-placeholder">
                <ImagePlus size={32} />
                <span>Chưa có logo</span>
              </div>
            )}
          </div>
          <div className="logo-upload-controls">
            <p className="logo-hint">
              Upload logo công ty (PNG, JPG, SVG, WebP, tối đa 5 MB). Logo sẽ hiển thị trên thanh điều hướng trên cùng.
            </p>
            <div className="logo-btn-row">
              <label className={`logo-upload-btn${logoUploading ? " logo-upload-btn--loading" : ""}`}>
                <ImagePlus size={15} />
                {logoUploading ? "Đang tải lên..." : "Chọn ảnh logo"}
                <input
                  accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                  disabled={logoUploading}
                  onChange={handleLogoUpload}
                  style={{ display: "none" }}
                  type="file"
                />
              </label>
              {logoUrl ? (
                <Button
                  className="icon-button danger"
                  disabled={logoUploading}
                  onClick={handleLogoDelete}
                  variant="danger"
                >
                  <Trash2 size={15} />
                  Xóa logo
                </Button>
              ) : null}
            </div>
            {logoMessage ? <p className="logo-upload-message">{logoMessage}</p> : null}
          </div>
        </div>
      </section>

      <section className="admin-section" id="admin-links">
        <div className="panel-header">
          <h2>{t("systemLinks")}</h2>
          <Button
            className="secondary-button small"
            onClick={() => setDraft({ ...draft, utilityLinks: [...draft.utilityLinks, createLink()] })}
            size="sm"
            variant="secondary"
          >
            <Plus size={16} />
            {t("add")}
          </Button>
        </div>
        <div className="admin-grid">
          {links.items.map((item, index) => {
            const actualIndex = (links.pagination.page - 1) * links.pagination.pageSize + index;
            return (
              <Card as="article" className="admin-card" key={item.id}>
                <div className="admin-card-header">
                  <strong>{getText(item.title, lang)}</strong>
                  <Button
                    aria-label={`${t("delete")}: ${getText(item.title, lang)}`}
                    className="icon-button danger"
                    iconOnly
                    onClick={() => setDraft({ ...draft, utilityLinks: removeAt(draft.utilityLinks, actualIndex) })}
                    title={t("delete")}
                    variant="danger"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
                <Field label={`${t("title")} VI`}>
                  <input
                    value={item.title?.vi || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        utilityLinks: updateAt(draft.utilityLinks, actualIndex, {
                          title: updateLang(item.title, "vi", event.target.value)
                        })
                      })
                    }
                  />
                </Field>
                <Field label={t("description")}>
                  <input
                    value={item.description?.vi || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        utilityLinks: updateAt(draft.utilityLinks, actualIndex, {
                          description: updateLang(item.description, "vi", event.target.value)
                        })
                      })
                    }
                  />
                </Field>
                <div className="form-row">
                  <Field label={t("url")}>
                    <input
                      value={item.url || ""}
                      onChange={(event) =>
                        setDraft({ ...draft, utilityLinks: updateAt(draft.utilityLinks, actualIndex, { url: event.target.value }) })
                      }
                    />
                  </Field>
                  <Field label={t("riskLevel")}>
                    <select
                      value={item.health}
                      onChange={(event) =>
                        setDraft({ ...draft, utilityLinks: updateAt(draft.utilityLinks, actualIndex, { health: event.target.value }) })
                      }
                    >
                      <option value="good">{t("statusGood")}</option>
                      <option value="watch">{t("statusWatch")}</option>
                      <option value="alert">{t("statusAlert")}</option>
                    </select>
                  </Field>
                </div>
              </Card>
            );
          })}
        </div>
        <Pagination pagination={links.pagination} onPageChange={setLinkPage} />
      </section>

      <section className="admin-section" id="admin-departments">
        <div className="panel-header">
          <h2>{t("departmentConfig")}</h2>
          <Button
            className="secondary-button small"
            onClick={() => setDraft({ ...draft, departments: [...draft.departments, createDepartment()] })}
            size="sm"
            variant="secondary"
          >
            <Plus size={16} />
            {t("add")}
          </Button>
        </div>
        <div className="admin-grid two">
          {departments.items.map((item, index) => {
            const actualIndex = (departments.pagination.page - 1) * departments.pagination.pageSize + index;
            return (
              <Card as="article" className="admin-card" key={item.id}>
                <div className="admin-card-header">
                  <strong>{getText(item.name, lang)}</strong>
                  <Button
                    aria-label={`${t("delete")}: ${getText(item.name, lang)}`}
                    className="icon-button danger"
                    iconOnly
                    onClick={() => setDraft({ ...draft, departments: removeAt(draft.departments, actualIndex) })}
                    title={t("delete")}
                    variant="danger"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
                <div className="form-row">
                  <Field label="ID">
                    <input
                      value={item.id}
                      onChange={(event) =>
                        setDraft({ ...draft, departments: updateAt(draft.departments, actualIndex, { id: event.target.value }) })
                      }
                    />
                  </Field>
                  <Field label={t("owner")}>
                    <input
                      value={item.owner || ""}
                      onChange={(event) =>
                        setDraft({ ...draft, departments: updateAt(draft.departments, actualIndex, { owner: event.target.value }) })
                      }
                    />
                  </Field>
                </div>
                <Field label={`${t("department")} VI`}>
                  <input
                    value={item.name?.vi || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        departments: updateAt(draft.departments, actualIndex, {
                          name: updateLang(item.name, "vi", event.target.value)
                        })
                      })
                    }
                  />
                </Field>
                <div className="form-row">
                  <Field label={t("score")}>
                    <input
                      max="100"
                      min="0"
                      type="number"
                      value={item.score}
                      onChange={(event) =>
                        setDraft({ ...draft, departments: updateAt(draft.departments, actualIndex, { score: event.target.value }) })
                      }
                    />
                  </Field>
                  <Field label={t("training")}>
                    <input
                      max="100"
                      min="0"
                      type="number"
                      value={item.trainingRate}
                      onChange={(event) =>
                        setDraft({
                          ...draft,
                          departments: updateAt(draft.departments, actualIndex, { trainingRate: event.target.value })
                        })
                      }
                    />
                  </Field>
                </div>
                <div className="form-row">
                  <Field label={t("openActions")}>
                    <input
                      min="0"
                      type="number"
                      value={item.openActions}
                      onChange={(event) =>
                        setDraft({ ...draft, departments: updateAt(draft.departments, actualIndex, { openActions: event.target.value }) })
                      }
                    />
                  </Field>
                  <Field label={t("riskLevel")}>
                    <select
                      value={item.riskLevel}
                      onChange={(event) =>
                        setDraft({ ...draft, departments: updateAt(draft.departments, actualIndex, { riskLevel: event.target.value }) })
                      }
                    >
                      <option value="good">{t("statusGood")}</option>
                      <option value="watch">{t("statusWatch")}</option>
                      <option value="alert">{t("statusAlert")}</option>
                    </select>
                  </Field>
                </div>
                <Field label={t("keyRisks")}>
                  <textarea
                    value={listToText(item.risks?.vi)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        departments: updateAt(draft.departments, actualIndex, {
                          risks: updateLang(item.risks, "vi", textToList(event.target.value))
                        })
                      })
                    }
                  />
                </Field>
                <Field label={t("checklist")}>
                  <textarea
                    value={listToText(item.checklist?.vi)}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        departments: updateAt(draft.departments, actualIndex, {
                          checklist: updateLang(item.checklist, "vi", textToList(event.target.value))
                        })
                      })
                    }
                  />
                </Field>
              </Card>
            );
          })}
        </div>
        <Pagination pagination={departments.pagination} onPageChange={setDeptPage} />
      </section>

      <section className="admin-section" id="admin-bulletins">
        <div className="panel-header">
          <h2>{t("adminBulletinSection")}</h2>
          <Button className="secondary-button small" onClick={openCreateBulletin} size="sm" variant="secondary">
            <Plus size={16} />
            {t("adminBulletinAdd")}
          </Button>
        </div>
        <div className="admin-grid bulletin-admin-grid">
          {bulletinLoading ? (
            <p className="empty-text compact">{t("loading")}</p>
          ) : bulletins.items.length ? (
            bulletins.items.map((item) => (
              <div className="bulletin-admin-card" key={item.id}>
                <BulletinItem bulletin={item} lang={lang} onOpen={openEditBulletin} showInlineMore t={t} />
                {item.published === false ? <span className="draft-badge">{t("adminBulletinDraft")}</span> : null}
              </div>
            ))
          ) : (
            <p className="empty-text compact">{t("noData")}</p>
          )}
        </div>
        <Pagination pagination={bulletins.pagination} onPageChange={setBulletinPage} />
      </section>

      <section className="admin-section" id="admin-trash">
        <div className="panel-header">
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Trash2 size={18} style={{ color: "#dc2626" }} />
            Thùng rác bảng tin
          </h2>
          <button
            type="button"
            onClick={() => setTrashOpen((v) => !v)}
            style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: "1px solid #e2e8f0", background: trashOpen ? "#fef2f2" : "#f8fafc", color: trashOpen ? "#dc2626" : "#475569", fontSize: 13, fontWeight: 600, cursor: "pointer" }}
          >
            <Trash2 size={14} />
            {trashOpen ? "Ẩn thùng rác" : "Xem thùng rác"}
          </button>
        </div>

        {trashOpen && (
          <div style={{ marginTop: 0 }}>
            {trashError && (
              <div style={{ padding: "8px 14px", borderRadius: 8, background: "#fef2f2", border: "1px solid #fecaca", color: "#dc2626", fontSize: 13, marginBottom: 12 }}>
                ⚠ {trashError}
              </div>
            )}

            {trashLoading ? (
              <p className="empty-text compact">Đang tải...</p>
            ) : trashItems.length === 0 ? (
              <div style={{ padding: "32px 0", textAlign: "center" }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🗑️</div>
                <p style={{ fontSize: 14, color: "#94a3b8" }}>Thùng rác trống — chưa có bảng tin nào bị xóa.</p>
              </div>
            ) : (
              <div style={{ border: "1px solid #fecaca", borderRadius: 12, overflow: "hidden", marginTop: 4 }}>
                <div style={{ padding: "8px 16px", background: "#fef2f2", borderBottom: "1px solid #fecaca", fontSize: 12, fontWeight: 700, color: "#b91c1c", display: "flex", alignItems: "center", gap: 6 }}>
                  <Trash2 size={13} />
                  {trashItems.length} bảng tin đã xóa mềm — có thể khôi phục hoặc xóa vĩnh viễn
                </div>
                {trashItems.map((item, idx) => {
                  const raw = item as Record<string, unknown>;
                  const title = typeof raw.title === "object" ? ((raw.title as Record<string,string>)?.vi || "") : String(raw.title || "");
                  const deletedAt = raw.deletedAt ? new Date(raw.deletedAt as string).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
                  const busy = trashBusy[item.id];
                  const isLast = idx === trashItems.length - 1;
                  return (
                    <div key={item.id} style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 180px auto auto auto", gap: 12, alignItems: "center", padding: "12px 16px", background: "#fff", borderBottom: isLast ? "none" : "1px solid #fee2e2" }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: "#0f172a", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{title || "(Chưa có tiêu đề)"}</div>
                        <div style={{ fontSize: 11.5, color: "#94a3b8", marginTop: 2 }}>ID: {item.id} · Xóa lúc: {deletedAt}</div>
                      </div>
                      <div style={{ fontSize: 11.5, color: "#64748b" }}>
                        {raw.updatedBy ? `bởi ${raw.updatedBy}` : "—"}
                      </div>
                      <button
                        type="button"
                        onClick={() => setTrashPreview(item)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, border: "1px solid #e2e8f0", background: "#f8fafc", color: "#475569", fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        <Eye size={12} />
                        Xem
                      </button>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => handleTrashRestore(item.id)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, border: "1px solid #bbf7d0", background: busy === "restore" ? "#d1fae5" : "#f0fdf4", color: "#059669", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap", opacity: busy ? 0.7 : 1 }}
                      >
                        <RotateCcw size={12} />
                        {busy === "restore" ? "Đang khôi phục..." : "Khôi phục"}
                      </button>
                      <button
                        type="button"
                        disabled={!!busy}
                        onClick={() => handleTrashPurge(item.id, title)}
                        style={{ display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 7, border: "1px solid #fecaca", background: busy === "purge" ? "#fee2e2" : "#fef2f2", color: "#dc2626", fontSize: 12, fontWeight: 700, cursor: busy ? "default" : "pointer", whiteSpace: "nowrap", opacity: busy ? 0.7 : 1 }}
                      >
                        <Trash2 size={12} />
                        {busy === "purge" ? "Đang xóa..." : "Xóa vĩnh viễn"}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="admin-section" id="admin-github-sync">
        <div className="panel-header">
          <h2 style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <GitBranch size={18} style={{ color: "#2563eb" }} />
            Đồng bộ GitHub
          </h2>
        </div>
        <div style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 12, padding: "20px 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, marginBottom: githubSyncResult ? 16 : 0 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: "#0f172a", marginBottom: 4 }}>
                Repository:{" "}
                <a href={githubStatus?.repo || "https://github.com/thang0105199509-netizen/mhchub"} target="_blank" rel="noreferrer"
                  style={{ color: "#2563eb", textDecoration: "none", fontFamily: "monospace", fontSize: 12 }}>
                  {(githubStatus?.repo || "https://github.com/thang0105199509-netizen/mhchub").replace("https://github.com/", "")}
                </a>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", display: "flex", flexDirection: "column", gap: 2 }}>
                <span>
                  Tự động mỗi <strong>{githubStatus?.scheduleHours ?? 6} giờ</strong>
                  {" · "}Gom thay đổi sau <strong>{githubStatus?.debounceSeconds ?? 60}s</strong>
                  {githubStatus?.lastSyncTime ? (
                    <> · Lần cuối: <strong>{new Date(githubStatus.lastSyncTime).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</strong></>
                  ) : " · Chưa sync lần nào"}
                </span>
                {githubStatus?.pendingSync && (
                  <span style={{ color: "#d97706", fontWeight: 600 }}>
                    ⏳ Đang chờ sync — {githubStatus.pendingReason}
                  </span>
                )}
              </div>
            </div>
            <button
              type="button"
              disabled={githubSyncing || !githubStatus?.configured}
              onClick={handleGithubSync}
              style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 20px", borderRadius: 8, border: "none", background: githubSyncing ? "#93c5fd" : "#2563eb", color: "#fff", fontSize: 13, fontWeight: 700, cursor: githubSyncing ? "default" : "pointer", whiteSpace: "nowrap", transition: "background 0.15s" }}
            >
              <GitBranch size={15} />
              {githubSyncing ? "Đang sync..." : "Sync ngay"}
            </button>
          </div>
          {githubSyncResult && (
            <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: githubSyncResult.ok ? "#f0fdf4" : "#fef2f2", border: `1px solid ${githubSyncResult.ok ? "#bbf7d0" : "#fecaca"}`, color: githubSyncResult.ok ? "#166534" : "#b91c1c", fontSize: 13 }}>
              {githubSyncResult.ok ? "✅" : "❌"} {githubSyncResult.message}
            </div>
          )}
          <div style={{ marginTop: 14, padding: "10px 14px", borderRadius: 8, background: "#f1f5f9", border: "1px solid #cbd5e1", fontSize: 12, color: "#475569", lineHeight: 1.7 }}>
            💡 <strong>Đổi tài khoản GitHub:</strong> Chỉ cần cập nhật 2 biến trong <strong>Secrets</strong> — không cần sửa code:
            <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 3 }}>
              <span><code style={{ background: "#e2e8f0", borderRadius: 4, padding: "1px 6px" }}>GITHUB_TOKEN</code> — Personal Access Token mới của tài khoản mới</span>
              <span><code style={{ background: "#e2e8f0", borderRadius: 4, padding: "1px 6px" }}>GITHUB_REPO_URL</code> — URL repo mới (vd: <em>https://github.com/username/mhchub.git</em>)</span>
            </div>
          </div>
          {!githubStatus?.configured && (
            <div style={{ marginTop: 8, padding: "10px 14px", borderRadius: 8, background: "#fffbeb", border: "1px solid #fde68a", color: "#92400e", fontSize: 12 }}>
              ⚠️ Chưa cấu hình <code>GITHUB_TOKEN</code> — Vào mục Secrets để thêm token.
            </div>
          )}
        </div>
      </section>

      <section className="admin-section" id="admin-actions">
        <div className="panel-header">
          <h2>{t("actionConfig")}</h2>
          <Button
            className="secondary-button small"
            onClick={() =>
              setDraft({
                ...draft,
                safetyActions: [...draft.safetyActions, createAction(draft.departments[0]?.id)]
              })
            }
            size="sm"
            variant="secondary"
          >
            <Plus size={16} />
            {t("add")}
          </Button>
        </div>
        <div className="admin-table">
          {actions.items.map((item, index) => {
            const actualIndex = (actions.pagination.page - 1) * actions.pagination.pageSize + index;
            return (
              <Card as="article" className="admin-row" key={item.id}>
                <Field label={t("title")}>
                  <input
                    value={item.title?.vi || ""}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        safetyActions: updateAt(draft.safetyActions, actualIndex, {
                          title: updateLang(item.title, "vi", event.target.value)
                        })
                      })
                    }
                  />
                </Field>
                <Field label={t("department")}>
                  <select
                    value={item.departmentId}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        safetyActions: updateAt(draft.safetyActions, actualIndex, { departmentId: event.target.value })
                      })
                    }
                  >
                    {draft.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {getText(department.name, lang)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label={t("severity")}>
                  <select
                    value={item.severity}
                    onChange={(event) =>
                      setDraft({ ...draft, safetyActions: updateAt(draft.safetyActions, actualIndex, { severity: event.target.value }) })
                    }
                  >
                    <option value="low">{t("severityLow")}</option>
                    <option value="medium">{t("severityMedium")}</option>
                    <option value="high">{t("severityHigh")}</option>
                  </select>
                </Field>
                <Field label={t("dueDate")}>
                  <input
                    type="date"
                    value={item.due}
                    onChange={(event) =>
                      setDraft({ ...draft, safetyActions: updateAt(draft.safetyActions, actualIndex, { due: event.target.value }) })
                    }
                  />
                </Field>
                <Button
                  aria-label={`${t("delete")}: ${getText(item.title, lang)}`}
                  className="icon-button danger"
                  iconOnly
                  onClick={() => setDraft({ ...draft, safetyActions: removeAt(draft.safetyActions, actualIndex) })}
                  title={t("delete")}
                  variant="danger"
                >
                  <Trash2 size={16} />
                </Button>
              </Card>
            );
          })}
        </div>
        <Pagination pagination={actions.pagination} onPageChange={setActionPage} />
      </section>
      {showNewBulletinCreate ? (
        <SafetyBulletinCreateModal
          onClose={() => setShowNewBulletinCreate(false)}
          onSaved={(saved) => {
            setBulletinItems((items) => [saved as SafetyBulletin, ...items.filter((item) => item.id !== (saved as SafetyBulletin).id)]);
            setShowNewBulletinCreate(false);
            setMessage(t("saved"));
          }}
        />
      ) : null}

      {bulletinModal ? (
        <SafetyBulletinModal
          bulletin={bulletinModal}
          bulletins={bulletinItems}
          isNew={creatingBulletin}
          lang={lang}
          onClose={() => {
            setBulletinModal(null);
            setCreatingBulletin(false);
          }}
          onDeleted={handleBulletinDeleted}
          onSaved={handleBulletinSaved}
          startEditing={creatingBulletin}
          t={t}
        />
      ) : null}

      <UserManagementPanel currentUserId={String(user?.id || "")} />
      <OnlineUsersPanel />
      <AuthAuditPanel />

      <section className="admin-section" id="admin-org" style={{ paddingTop: 24 }}>
        <OrgStructurePage user={user} />
      </section>

      {trashPreview && (
        <Suspense fallback={null}>
          <SafetyBulletinViewModal
            bulletins={[trashPreview]}
            initialId={trashPreview.id}
            lang={lang}
            user={user ?? undefined}
            onClose={() => setTrashPreview(null)}
            onEdited={(updated) => {
              const raw = updated as Record<string, unknown>;
              if (!raw.deletedAt) {
                setTrashItems((items) => items.filter((b) => b.id !== updated.id));
                setBulletinItems((items) => [updated, ...items.filter((b) => b.id !== updated.id)]);
                setTrashPreview(null);
              } else {
                setTrashItems((items) => items.map((b) => (b.id === updated.id ? updated : b)));
                setTrashPreview(updated);
              }
            }}
          />
        </Suspense>
      )}
    </div>
  );
}
