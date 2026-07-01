import { Building2, ClipboardCheck, ImagePlus, Link2, Megaphone, Plus, Save, Shield, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent, ComponentType } from "react";
import { SafetyBulletinModal } from "../components/SafetyBulletinModal";
import { BulletinItem, Button, Card, Field, Pagination } from "../components/ui";
import { UserManagementPanel } from "./UserManagementPanel";
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
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMessage, setLogoMessage] = useState("");

  useEffect(() => {
    setDraft(config);
  }, [config]);

  useEffect(() => {
    api.fetchAppSettings()
      .then((data) => setLogoUrl(data.logoUrl || null))
      .catch(() => {});
  }, []);

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
    api.fetchSafetyBulletins({ includeDrafts: true, includeDeleted: user?.role === "admin", page: 1, pageSize: 100 })
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
  }, [user?.role]);

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
    setCreatingBulletin(true);
    setBulletinModal(createBulletin());
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
        <a href="#admin-users">
          <Shield size={16} />
          <span>Tài khoản</span>
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
                {item.deleted ? <span className="draft-badge">{t("adminBulletinDeleted")}</span> : null}
              </div>
            ))
          ) : (
            <p className="empty-text compact">{t("noData")}</p>
          )}
        </div>
        <Pagination pagination={bulletins.pagination} onPageChange={setBulletinPage} />
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
    </div>
  );
}
