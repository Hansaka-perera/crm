/**
 * ITGlow CRM shared browser utilities.
 *
 * The existing CRM is a static multi-page prototype, so this module deliberately
 * avoids imposing a new frontend framework. Shared browser behavior is written
 * in strict TypeScript and compiled to assets/js/app.js for direct file/server use.
 */

type ToastKind = "success" | "error" | "info";

interface ToastOptions {
  kind?: ToastKind;
  duration?: number;
}

interface BusyButtonState {
  html: string;
  disabled: boolean;
  ariaBusy: string | null;
}

interface ITGlowUIApi {
  toast(message: string, options?: ToastOptions): void;
  setBusy(button: HTMLButtonElement, busy: boolean, busyText?: string): void;
  escapeHtml(value: string): string;
  debounce<TArgs extends unknown[]>(callback: (...args: TArgs) => void, delay?: number): (...args: TArgs) => void;
}

type CrmEntity = "leads" | "contacts" | "organizations" | "deals" | "activities" | "inbox";
type ApiRecord = Record<string, unknown> & { id: number | string };
interface SnapshotRecord { databaseId: number; serialized: string; }

interface CollectionResponse { items: ApiRecord[]; page: number; limit: number; total: number; }
interface SessionResponse { user: { id: number; email: string; fullName: string }; workspace: { id: number; name: string; role: string }; csrfToken: string; }

interface ITGlowApiClient {
  request<T>(path: string, init?: RequestInit): Promise<T>;
  register(payload: { fullName: string; email: string; password: string; workspaceName?: string }): Promise<SessionResponse>;
  login(payload: { email: string; password: string }): Promise<SessionResponse>;
  me(): Promise<SessionResponse>;
  logout(): Promise<void>;
  list(entity: CrmEntity): Promise<ApiRecord[]>;
  create(entity: CrmEntity, record: Record<string, unknown>): Promise<ApiRecord>;
  update(entity: CrmEntity, id: number, record: Record<string, unknown>): Promise<ApiRecord>;
  remove(entity: CrmEntity, id: number): Promise<void>;
  syncCollection(entity: CrmEntity, current: ApiRecord[]): Promise<void>;
  getSettings(): Promise<{ settings: Record<string, unknown>; updatedAt: string | null }>;
  saveSettings(settings: Record<string, unknown>): Promise<Record<string, unknown>>;
  insights(): Promise<Record<string, number>>;
  workspace(): Promise<{ id: number; name: string }>;
  updateWorkspace(name: string): Promise<{ id: number; name: string }>;
}

interface Window {
  ITGlowUI: ITGlowUIApi;
  ITGlowAPI: ITGlowApiClient;
}

((): void => {
  "use strict";

  const TOAST_TIMEOUT_MS = 3200;
  const busyStates = new WeakMap<HTMLButtonElement, BusyButtonState>();
  const collectionSnapshots = new Map<CrmEntity, Map<string, SnapshotRecord>>();
  const collectionQueues = new Map<CrmEntity, Promise<void>>();
  let csrfToken = "";
  let toastTimer = 0;
  let toastElement: HTMLElement | null = null;
  let dialogTitleCounter = 0;

  const isReducedMotion = (): boolean =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
    const method = (init.method ?? "GET").toUpperCase();
    const headers = new Headers(init.headers);
    if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const isPublicAuthPost = /^\/api\/auth\/(?:register|login)$/.test(path);
    if (!["GET", "HEAD", "OPTIONS"].includes(method) && !isPublicAuthPost) {
      if (!csrfToken) await loadSession();
      headers.set("X-CSRF-Token", csrfToken);
    }
    const response = await fetch(path, { ...init, method, headers, credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      let message = `Request failed (${response.status}).`;
      try { message = (await response.json() as { error?: string }).error ?? message; } catch { /* Non-JSON server error. */ }
      const error = new Error(message) as Error & { status: number };
      error.status = response.status;
      throw error;
    }
    if (response.status === 204) return undefined as T;
    return await response.json() as T;
  }

  async function loadSession(): Promise<SessionResponse> {
    const session = await apiRequest<SessionResponse>("/api/auth/me");
    csrfToken = session.csrfToken;
    return session;
  }

  async function loadCollection(entity: CrmEntity): Promise<ApiRecord[]> {
    const items: ApiRecord[] = [];
    let page = 1;
    let total = 0;
    do {
      const result = await apiRequest<CollectionResponse>(`/api/${entity}?page=${page}&limit=100`);
      items.push(...result.items);
      total = result.total;
      page += 1;
    } while (items.length < total && page <= 1001);
    collectionSnapshots.set(entity, new Map(items.map((item): [string, SnapshotRecord] => [String(item.id), { databaseId: Number(item.id), serialized: stableRecord(item) }])));
    return items;
  }

  function stableRecord(record: ApiRecord): string {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = record;
    return JSON.stringify(data);
  }

  function syncCollection(entity: CrmEntity, current: ApiRecord[]): Promise<void> {
    const previous = collectionQueues.get(entity) ?? Promise.resolve();
    const operation = previous.catch((): void => undefined).then(async (): Promise<void> => {
      const snapshot = collectionSnapshots.get(entity) ?? new Map<string, SnapshotRecord>();
      const currentIds = new Set<string>();
      for (const record of current) {
        const localId = String(record.id);
        const prior = snapshot.get(localId);
        if (prior) {
          currentIds.add(localId);
          const serialized = stableRecord(record);
          if (prior.serialized !== serialized) {
            const saved = await apiRequest<ApiRecord>(`/api/${entity}/${prior.databaseId}`, { method: "PUT", body: JSON.stringify(recordWithoutId(record)) });
            snapshot.set(localId, { databaseId: prior.databaseId, serialized: stableRecord(saved) });
          }
        } else {
          const saved = await apiRequest<ApiRecord>(`/api/${entity}`, { method: "POST", body: JSON.stringify(recordWithoutId(record)) });
          currentIds.add(localId);
          snapshot.set(localId, { databaseId: Number(saved.id), serialized: stableRecord(saved) });
        }
      }
      for (const [localId, prior] of snapshot) {
        if (!currentIds.has(localId)) {
          await apiRequest<void>(`/api/${entity}/${prior.databaseId}`, { method: "DELETE" });
          snapshot.delete(localId);
        }
      }
      collectionSnapshots.set(entity, snapshot);
    });
    collectionQueues.set(entity, operation);
    return operation;
  }

  function recordWithoutId(record: ApiRecord): Record<string, unknown> {
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, ...data } = record;
    return data;
  }

  const apiClient: ITGlowApiClient = {
    request: apiRequest,
    register: async (payload): Promise<SessionResponse> => {
      await apiRequest<{ ok: boolean }>("/api/auth/register", { method: "POST", body: JSON.stringify(payload) });
      return await loadSession();
    },
    login: async (payload): Promise<SessionResponse> => {
      await apiRequest<{ ok: boolean }>("/api/auth/login", { method: "POST", body: JSON.stringify(payload) });
      return await loadSession();
    },
    me: loadSession,
    logout: async (): Promise<void> => { await apiRequest<void>("/api/auth/logout", { method: "POST", body: "{}" }); csrfToken = ""; },
    list: loadCollection,
    create: async (entity, record): Promise<ApiRecord> => await apiRequest<ApiRecord>(`/api/${entity}`, { method: "POST", body: JSON.stringify(record) }),
    update: async (entity, id, record): Promise<ApiRecord> => await apiRequest<ApiRecord>(`/api/${entity}/${id}`, { method: "PUT", body: JSON.stringify(record) }),
    remove: async (entity, id): Promise<void> => await apiRequest<void>(`/api/${entity}/${id}`, { method: "DELETE" }),
    syncCollection,
    getSettings: async () => await apiRequest("/api/settings"),
    saveSettings: async (settings) => await apiRequest<{ settings: Record<string, unknown> }>("/api/settings", { method: "PUT", body: JSON.stringify(settings) }).then((result) => result.settings),
    insights: async () => await apiRequest<Record<string, number>>("/api/insights"),
    workspace: async () => await apiRequest<{ id: number; name: string }>("/api/workspace"),
    updateWorkspace: async (name) => await apiRequest<{ id: number; name: string }>("/api/workspace", { method: "PUT", body: JSON.stringify({ name }) }),
  };
  window.ITGlowAPI = apiClient;

  function escapeHtml(value: string): string {
    return value.replace(/[&<>"']/g, (character: string): string => {
      const entities: Record<string, string> = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      };
      return entities[character] ?? character;
    });
  }

  function debounce<TArgs extends unknown[]>(
    callback: (...args: TArgs) => void,
    delay = 180,
  ): (...args: TArgs) => void {
    let timer = 0;
    return (...args: TArgs): void => {
      window.clearTimeout(timer);
      timer = window.setTimeout((): void => callback(...args), delay);
    };
  }

  function getToastElement(): HTMLElement {
    if (toastElement?.isConnected) return toastElement;

    // Reuse a page's existing toast when present, avoiding duplicate notifications.
    const existing = document.querySelector<HTMLElement>("#toast, [data-itglow-toast]");
    if (existing) {
      toastElement = existing;
      return existing;
    }

    const created = document.createElement("div");
    created.className = "itglow-toast";
    created.dataset.itglowToast = "true";
    created.setAttribute("role", "status");
    created.setAttribute("aria-live", "polite");
    created.setAttribute("aria-atomic", "true");
    document.body.append(created);
    toastElement = created;
    return created;
  }

  function showToast(message: string, options: ToastOptions = {}): void {
    const text = message.trim();
    if (!text) return;

    const kind = options.kind ?? "info";
    const element = getToastElement();
    element.textContent = text;
    element.dataset.kind = kind;
    element.setAttribute("role", kind === "error" ? "alert" : "status");
    const usesSharedToastStyles = element.classList.contains("itglow-toast");
    element.classList.add(usesSharedToastStyles ? "is-visible" : "show");

    window.clearTimeout(toastTimer);
    const duration = Math.max(1000, options.duration ?? TOAST_TIMEOUT_MS);
    toastTimer = window.setTimeout((): void => {
      element.classList.remove(usesSharedToastStyles ? "is-visible" : "show");
    }, duration);
  }

  function setBusy(button: HTMLButtonElement, busy: boolean, busyText = "Please wait…"): void {
    if (busy) {
      if (!busyStates.has(button)) {
        busyStates.set(button, {
          html: button.innerHTML,
          disabled: button.disabled,
          ariaBusy: button.getAttribute("aria-busy"),
        });
      }
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = busyText;
      return;
    }

    const previous = busyStates.get(button);
    if (!previous) return;

    button.innerHTML = previous.html;
    button.disabled = previous.disabled;
    if (previous.ariaBusy === null) button.removeAttribute("aria-busy");
    else button.setAttribute("aria-busy", previous.ariaBusy);
    busyStates.delete(button);
  }

  type NavigationKey = "setup" | "contacts" | "activities" | "deals" | "leads" | "insights" | "sales-inbox" | "more";
  type NavigationIconName = "setup" | "contacts" | "activities" | "deals" | "leads" | "insights" | "inbox" | "settings";

  interface NavigationItem {
    key: NavigationKey;
    label: string;
    path: string;
    icon: NavigationIconName;
    activeFiles: readonly string[];
  }

  interface RouteConfig {
    title: string;
    activeNavigation: NavigationKey;
    searchInputId?: string;
    notificationButtonId: string;
    profileButtonId: string;
    secondaryItems?: readonly { label: string; path: string; activeFiles: readonly string[] }[];
  }

  /** Route metadata drives the shared page title, breadcrumb, search and active navigation. */
  const routeConfig: Readonly<Record<string, RouteConfig>> = {
    "itglow-crm-setup-guide.html": { title: "Setup guide", activeNavigation: "setup", searchInputId: "workspaceSearch", notificationButtonId: "notificationsButton", profileButtonId: "profileButton" },
    "itglow-crm-contacts.html": { title: "Contacts", activeNavigation: "contacts", searchInputId: "globalSearch", notificationButtonId: "notificationsButton", profileButtonId: "profileButton", secondaryItems: [{ label: "People", path: "itglow-crm-contacts.html", activeFiles: ["itglow-crm-contacts.html", "itglow-crm-contact-detail.html"] }, { label: "Organizations", path: "itglow-crm-organizations.html", activeFiles: ["itglow-crm-organizations.html"] }] },
    "itglow-crm-contact-detail.html": { title: "Contacts", activeNavigation: "contacts", notificationButtonId: "notificationBtn", profileButtonId: "profileBtn", secondaryItems: [{ label: "People", path: "itglow-crm-contacts.html", activeFiles: ["itglow-crm-contacts.html", "itglow-crm-contact-detail.html"] }, { label: "Organizations", path: "itglow-crm-organizations.html", activeFiles: ["itglow-crm-organizations.html"] }] },
    "itglow-crm-organizations.html": { title: "Organizations", activeNavigation: "contacts", searchInputId: "globalSearch", notificationButtonId: "notificationBtn", profileButtonId: "profileBtn", secondaryItems: [{ label: "People", path: "itglow-crm-contacts.html", activeFiles: ["itglow-crm-contacts.html", "itglow-crm-contact-detail.html"] }, { label: "Organizations", path: "itglow-crm-organizations.html", activeFiles: ["itglow-crm-organizations.html"] }] },
    "itglow-crm-activities.html": { title: "Activities", activeNavigation: "activities", searchInputId: "globalSearch", notificationButtonId: "notificationBtn", profileButtonId: "profileBtn" },
    "itglow-crm-deals.html": { title: "Deals", activeNavigation: "deals", searchInputId: "searchInput", notificationButtonId: "notifyBtn", profileButtonId: "profileBtn" },
    "itglow_crm_leads.html": { title: "Leads", activeNavigation: "leads", searchInputId: "globalSearch", notificationButtonId: "notificationBtn", profileButtonId: "profileBtn" },
    "itglow_crm_insights.html": { title: "Insights", activeNavigation: "insights", notificationButtonId: "notificationBtn", profileButtonId: "profileBtn" },
    "itglow_crm_sales_inbox.html": { title: "Sales Inbox", activeNavigation: "sales-inbox", searchInputId: "workspaceSearch", notificationButtonId: "notificationBtn", profileButtonId: "profileBtn" },
    "itglow_crm_settings.html": { title: "More", activeNavigation: "more", notificationButtonId: "notificationBtn", profileButtonId: "profileBtn" },
  };

  /** One source of truth for every CRM navigation label, path, icon and active-route alias. */
  const navigationItems: readonly NavigationItem[] = [
    { key: "setup", label: "Setup guide", path: "itglow-crm-setup-guide.html", icon: "setup", activeFiles: ["itglow-crm-setup-guide.html"] },
    { key: "contacts", label: "Contacts", path: "itglow-crm-contacts.html", icon: "contacts", activeFiles: ["itglow-crm-contacts.html", "itglow-crm-contact-detail.html", "itglow-crm-organizations.html"] },
    { key: "activities", label: "Activities", path: "itglow-crm-activities.html", icon: "activities", activeFiles: ["itglow-crm-activities.html"] },
    { key: "deals", label: "Deals", path: "itglow-crm-deals.html", icon: "deals", activeFiles: ["itglow-crm-deals.html"] },
    { key: "leads", label: "Leads", path: "ITGlow_CRM_Leads.html", icon: "leads", activeFiles: ["itglow_crm_leads.html"] },
    { key: "insights", label: "Insights", path: "ITGlow_CRM_Insights.html", icon: "insights", activeFiles: ["itglow_crm_insights.html"] },
    { key: "sales-inbox", label: "Sales Inbox", path: "ITGlow_CRM_Sales_Inbox.html", icon: "inbox", activeFiles: ["itglow_crm_sales_inbox.html"] },
    { key: "more", label: "More", path: "ITGlow_CRM_Settings.html", icon: "settings", activeFiles: ["itglow_crm_settings.html"] },
  ];

  /** Inline SVG avoids adding a second icon dependency and keeps every icon the same size. */
  const navigationIcons: Record<NavigationIconName, string> = {
    setup: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 6 2 2 4-4M4 13l2 2 4-4M13 6h7M13 13h7M4 20h16"/></svg>',
    contacts: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM20 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    activities: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>',
    deals: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M15 3v18"/></svg>',
    leads: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11l9-8 9 8v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l2 3h4l2-3h5"/></svg>',
    insights: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3v18h18M7 14l4-4 4 3 6-7M7 18v-2M11 18v-4M15 18v-3"/></svg>',
    inbox: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
    settings: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19 13.5a7 7 0 0 0 0-3l2-1.5-2-3-2.3.8a7 7 0 0 0-2.5-1.4L14 3h-4l-.4 2.4A7 7 0 0 0 7 6.8L4.7 6l-2 3 2 1.5a7 7 0 0 0 0 3l-2 1.5 2 3 2.3-.8a7 7 0 0 0 2.5 1.4L10 21h4l.4-2.4a7 7 0 0 0 2.5-1.4l2.3.8 2-3z"/></svg>',
  };

  function getCurrentRouteFile(): string {
    const path = decodeURIComponent(window.location.pathname).replace(/\\/g, "/");
    return path.split("/").filter(Boolean).pop()?.toLowerCase() ?? "";
  }

  function renderSecondarySidebar(root: HTMLElement, route: RouteConfig, currentFile: string): void {
    if (!route.secondaryItems?.length) return;
    const secondary = document.createElement("nav");
    secondary.className = "itg-sidebar__secondary";
    secondary.setAttribute("aria-label", `${route.title} sections`);
    secondary.innerHTML = route.secondaryItems.map((item): string => {
      const active = item.activeFiles.includes(currentFile);
      return `<a class="itg-sidebar__secondary-link${active ? " is-active" : ""}" href="${item.path}"${active ? ' aria-current="page"' : ""}>${item.label}</a>`;
    }).join("");
    const primaryNav = root.querySelector(".itg-sidebar__nav");
    primaryNav?.after(secondary);
  }

  function renderSharedSidebar(root: HTMLElement): void {
    if (root.dataset.itglowRendered === "true") return;

    const links = navigationItems.map((item: NavigationItem): string =>
      `<a class="itg-sidebar__link" href="${item.path}" data-nav="${item.label}" data-route-key="${item.key}">${navigationIcons[item.icon]}<span class="itg-sidebar__label">${item.label}</span></a>`,
    ).join("");

    root.innerHTML = `
      <a class="itg-sidebar__brand" href="itglow-crm-setup-guide.html" aria-label="ITGlow home">ITGlow</a>
      <div class="itg-sidebar__workspace-meta">
        <div class="itg-sidebar__workspace-name">WhiteOnWhite</div>
        <div class="itg-sidebar__company">ITGlow Technology</div>
      </div>
      <nav class="itg-sidebar__nav" aria-label="Main navigation">${links}</nav>
      <section class="itg-sidebar__workspace-card" aria-label="Workspace plan">
        <h2>Your workspace</h2>
        <p>3 members · Starter plan</p>
        <button type="button" class="itg-sidebar__sample" id="reviewSampleBtn">Review sample</button>
      </section>
      <a class="itg-sidebar__help" href="mailto:support@itglow.com">Help &amp; support <span aria-hidden="true">↗</span></a>
    `;
    root.dataset.itglowRendered = "true";

    const currentFile = getCurrentRouteFile();
    const route = routeConfig[currentFile];
    if (route) renderSecondarySidebar(root, route, currentFile);

    // The workspace shortcut opens Leads from other modules. On the Leads route,
    // the page's existing delegated handler resets its filters without a reload.
    const sampleButton = root.querySelector<HTMLButtonElement>("#reviewSampleBtn");
    if (sampleButton && currentFile !== "itglow_crm_leads.html") {
      sampleButton.addEventListener("click", (): void => {
        window.location.href = "ITGlow_CRM_Leads.html";
      });
    }
  }

  function mountSharedSidebars(): void {
    document.querySelectorAll<HTMLElement>("[data-itglow-sidebar]").forEach(renderSharedSidebar);
  }

  /** Shared topbar component. Existing page script IDs are preserved via route metadata. */
  function renderTopbar(root: HTMLElement): void {
    if (root.dataset.itglowRendered === "true") return;
    const file = getCurrentRouteFile();
    const route = routeConfig[file];
    if (!route) return;

    const search = route.searchInputId
      ? `<label class="itg-topbar__search"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="7.2"/><path d="m16 16 5 5"/></svg><input id="${route.searchInputId}" type="search" placeholder="Search your workspace" aria-label="Search your workspace"></label>`
      : "";
    root.innerHTML = `<div class="itg-topbar__breadcrumb"><a href="itglow-crm-setup-guide.html">WhiteOnWhite</a><span aria-hidden="true">/</span><span>${route.title}</span></div>${search}<div class="itg-topbar__actions"><button class="itg-topbar__icon" type="button" id="${route.notificationButtonId}" aria-label="Notifications"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/></svg></button><button class="itg-topbar__avatar" type="button" id="${route.profileButtonId}" aria-label="User profile">CU</button></div>`;
    root.dataset.itglowRendered = "true";

    // Inbox search is intentionally page-local and reuses the existing message filter.
    if (file === "itglow_crm_sales_inbox.html") {
      const input = root.querySelector<HTMLInputElement>(`#${route.searchInputId}`);
      input?.addEventListener("input", (): void => {
        const target = document.querySelector<HTMLInputElement>("#messageSearch");
        if (!target) return;
        target.value = input.value;
        target.dispatchEvent(new Event("input", { bubbles: true }));
      });
    }
  }

  /** AppLayout composes the reusable shell into the static page's named mount points. */
  function mountAppLayout(): void {
    mountSharedSidebars();
    document.querySelectorAll<HTMLElement>("[data-itglow-topbar]").forEach(renderTopbar);
  }

  function syncCurrentNavigation(): void {
    const currentFile = getCurrentRouteFile();
    if (!currentFile) return;

    const activeKey = routeConfig[currentFile]?.activeNavigation
      ?? navigationItems.find((item: NavigationItem): boolean => item.activeFiles.includes(currentFile))?.key;
    if (!activeKey) return;

    document.querySelectorAll<HTMLAnchorElement>(".itg-sidebar__link[href]").forEach((link): void => {
      const active = link.dataset.routeKey === activeKey;
      link.classList.toggle("active", active);
      if (active) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  const OVERLAY_SELECTOR = ".modal-backdrop, .modal-bg, .modal-overlay, [data-modal-backdrop]";
  const VISIBLE_OVERLAY_SELECTOR = ".modal-backdrop.show, .modal-bg.show, .modal-overlay.show, [data-modal-backdrop].show";

  function syncOverlayAccessibility(root: ParentNode = document): void {
    root.querySelectorAll<HTMLElement>(OVERLAY_SELECTOR).forEach((overlay: HTMLElement): void => {
      const isOpen = overlay.classList.contains("show");
      const expectedHidden = String(!isOpen);
      if (overlay.getAttribute("aria-hidden") !== expectedHidden) {
        overlay.setAttribute("aria-hidden", expectedHidden);
      }

      const dialog = overlay.querySelector<HTMLElement>(".modal, [role='dialog'], [data-modal-dialog]");
      if (dialog) {
        if (!dialog.hasAttribute("role")) dialog.setAttribute("role", "dialog");
        dialog.setAttribute("aria-modal", "true");
        if (!dialog.hasAttribute("aria-label") && !dialog.hasAttribute("aria-labelledby")) {
          const heading = dialog.querySelector<HTMLElement>("h1, h2, h3, [data-modal-title]");
          if (heading) {
            if (!heading.id) heading.id = `itglow-dialog-title-${++dialogTitleCounter}`;
            dialog.setAttribute("aria-labelledby", heading.id);
          }
        }
      }
    });
  }

  function initOverlayAccessibility(): void {
    syncOverlayAccessibility();

    const observer = new MutationObserver((records: MutationRecord[]): void => {
      for (const record of records) {
        if (record.type === "attributes" && record.target instanceof HTMLElement) {
          syncOverlayAccessibility(record.target.parentElement ?? document);
        }
        record.addedNodes.forEach((node: Node): void => {
          if (node instanceof HTMLElement) syncOverlayAccessibility(node);
        });
      }
    });

    observer.observe(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["class", "aria-hidden"],
    });

    document.addEventListener("keydown", (event: KeyboardEvent): void => {
      if (event.key !== "Escape") return;
      const overlay = document.querySelector<HTMLElement>(VISIBLE_OVERLAY_SELECTOR);
      if (!overlay) return;

      // Prefer existing page-specific close logic (which may also reset form state).
      const closeControl = overlay.querySelector<HTMLElement>(
        "[data-modal-close], .modal-close, #closeModal, #modalCancel, [aria-label='Close dialog']",
      );
      if (closeControl) closeControl.click();
      else overlay.classList.remove("show");
      syncOverlayAccessibility();
    });
  }

  function initFocusPolish(): void {
    document.querySelectorAll<HTMLAnchorElement>(
      ".itg-sidebar__link[href]",
    ).forEach((link): void => {
      if (link.classList.contains("active") && !link.hasAttribute("aria-current")) {
        link.setAttribute("aria-current", "page");
      }
    });

    // Make target feedback predictable for keyboard users without hijacking form behavior.
    document.querySelectorAll<HTMLElement>(
      ".app button, .app [role='button'], .app-shell button, .app-shell [role='button']",
    ).forEach((control): void => {
      if (control instanceof HTMLButtonElement && control.disabled) {
        control.setAttribute("aria-disabled", "true");
      }
    });
  }

  function initPageMotion(): void {
    if (isReducedMotion()) return;
    requestAnimationFrame((): void => document.body.classList.add("itglow-ui-ready"));
  }

  const api: ITGlowUIApi = {
    toast: showToast,
    setBusy,
    escapeHtml,
    debounce,
  };

  window.ITGlowUI = api;

  function init(): void {
    mountAppLayout();
    syncCurrentNavigation();
    initOverlayAccessibility();
    initFocusPolish();
    initPageMotion();
    if (routeConfig[getCurrentRouteFile()]) {
      void loadSession().catch((error: Error & { status?: number }): void => {
        if (error.status === 401) window.location.replace("sign-in.html");
        else showToast(`API connection unavailable: ${error.message}`, { kind: "error", duration: 6000 });
      });
    }
  }

  // CRM pages load this script directly after their shell mount points so the
  // shared controls exist before page-specific scripts bind their event handlers.
  if (document.body) init();
  else document.addEventListener("DOMContentLoaded", init, { once: true });
})();
