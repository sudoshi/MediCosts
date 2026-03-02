/**
 * ClearNetwork Widget — Embeddable network status checker
 *
 * Usage:
 *   <clear-network-check
 *     plan-id="UUID"
 *     provider-npi="1234567890"
 *     api-base="https://api.example.com/v1"
 *     show-alternatives="true"
 *   ></clear-network-check>
 *
 *   <script src="https://cdn.example.com/clearnetwork-widget.js"></script>
 */

const WIDGET_VERSION = "0.1.0";

class ClearNetworkCheck extends HTMLElement {
  static get observedAttributes() {
    return ["plan-id", "provider-npi", "api-base", "show-alternatives"];
  }

  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._data = null;
    this._loading = false;
    this._error = null;
  }

  connectedCallback() {
    this._render();
    this._fetchStatus();
  }

  attributeChangedCallback() {
    if (this.isConnected) {
      this._fetchStatus();
    }
  }

  get apiBase() {
    return this.getAttribute("api-base") || "";
  }

  get planId() {
    return this.getAttribute("plan-id");
  }

  get providerNpi() {
    return this.getAttribute("provider-npi");
  }

  get showAlternatives() {
    return this.getAttribute("show-alternatives") === "true";
  }

  async _fetchStatus() {
    if (!this.planId || !this.providerNpi) {
      this._error = "Missing plan-id or provider-npi attribute";
      this._render();
      return;
    }

    this._loading = true;
    this._error = null;
    this._render();

    try {
      const url = `${this.apiBase}/plans/${this.planId}/network?provider_npi=${this.providerNpi}`;
      const resp = await fetch(url);

      if (!resp.ok) {
        const body = await resp.json().catch(() => ({}));
        throw new Error(body.detail || `HTTP ${resp.status}`);
      }

      const json = await resp.json();
      this._data = json.data;
      this._loading = false;
      this._render();

      if (this.showAlternatives && this._data && !this._data.in_network) {
        await this._fetchAlternatives();
      }
    } catch (err) {
      this._loading = false;
      this._error = err.message;
      this._render();
    }
  }

  async _fetchAlternatives() {
    try {
      const url =
        `${this.apiBase}/providers/search?` +
        `specialty=${encodeURIComponent(this._data.provider?.specialty_primary || "")}&` +
        `plan_id=${this.planId}&limit=5`;
      const resp = await fetch(url);
      if (resp.ok) {
        const json = await resp.json();
        this._data.alternatives = json.data || [];
        this._render();
      }
    } catch {
      // Silently fail — alternatives are optional
    }
  }

  _render() {
    const theme = this._getTheme();

    if (this._loading) {
      this.shadowRoot.innerHTML = `
        <style>${theme}</style>
        <div class="cn-widget">
          <div class="cn-loading">
            <div class="cn-spinner"></div>
            <span>Checking network status...</span>
          </div>
        </div>
      `;
      return;
    }

    if (this._error) {
      this.shadowRoot.innerHTML = `
        <style>${theme}</style>
        <div class="cn-widget">
          <div class="cn-error">
            <span class="cn-icon">!</span>
            <span>${this._escapeHtml(this._error)}</span>
          </div>
        </div>
      `;
      return;
    }

    if (!this._data) {
      this.shadowRoot.innerHTML = `
        <style>${theme}</style>
        <div class="cn-widget">
          <div class="cn-empty">Set plan-id and provider-npi to check network status.</div>
        </div>
      `;
      return;
    }

    const d = this._data;
    const inNetwork = d.in_network;
    const statusClass = inNetwork ? "cn-in-network" : "cn-out-network";
    const statusIcon = inNetwork ? "&#10003;" : "&#10007;";
    const statusText = inNetwork ? "In-Network" : "Out-of-Network";

    let tierHtml = "";
    if (d.tier) {
      tierHtml = `<span class="cn-tier">Tier ${this._escapeHtml(d.tier)}</span>`;
    }

    let providerHtml = "";
    if (d.provider) {
      providerHtml = `
        <div class="cn-provider">
          <div class="cn-provider-name">${this._escapeHtml(d.provider.name || "")}</div>
          <div class="cn-provider-specialty">${this._escapeHtml(d.provider.specialty_primary || "")}</div>
        </div>
      `;
    }

    let alternativesHtml = "";
    if (d.alternatives && d.alternatives.length > 0) {
      const items = d.alternatives
        .map(
          (a) => `
        <li class="cn-alt-item">
          <span class="cn-alt-name">${this._escapeHtml(a.name_canonical || "")}</span>
          <span class="cn-alt-specialty">${this._escapeHtml(a.specialty_primary || "")}</span>
        </li>
      `
        )
        .join("");
      alternativesHtml = `
        <div class="cn-alternatives">
          <div class="cn-alt-header">In-Network Alternatives</div>
          <ul class="cn-alt-list">${items}</ul>
        </div>
      `;
    }

    this.shadowRoot.innerHTML = `
      <style>${theme}</style>
      <div class="cn-widget">
        ${providerHtml}
        <div class="cn-status ${statusClass}">
          <span class="cn-status-icon">${statusIcon}</span>
          <span class="cn-status-text">${statusText}</span>
          ${tierHtml}
        </div>
        <div class="cn-plan">
          <span class="cn-plan-name">${this._escapeHtml(d.plan_name || "")}</span>
        </div>
        ${alternativesHtml}
        <div class="cn-disclaimer">
          Network status changes frequently. Verify with your insurer before receiving care.
          Data sourced from CMS-mandated insurer disclosures per 45 CFR &sect;147.211.
        </div>
        <div class="cn-branding">
          Powered by ClearNetwork v${WIDGET_VERSION}
        </div>
      </div>
    `;
  }

  _escapeHtml(str) {
    const el = document.createElement("span");
    el.textContent = str;
    return el.innerHTML;
  }

  _getTheme() {
    return `
      :host {
        display: block;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        font-size: 14px;
        line-height: 1.5;
        color: #1a1a2e;
      }

      .cn-widget {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        padding: 16px;
        background: #ffffff;
        max-width: 400px;
      }

      /* Loading */
      .cn-loading {
        display: flex;
        align-items: center;
        gap: 10px;
        padding: 8px 0;
        color: #64748b;
      }
      .cn-spinner {
        width: 18px;
        height: 18px;
        border: 2px solid #e2e8f0;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: cn-spin 0.6s linear infinite;
      }
      @keyframes cn-spin {
        to { transform: rotate(360deg); }
      }

      /* Error */
      .cn-error {
        display: flex;
        align-items: center;
        gap: 8px;
        color: #dc2626;
        padding: 8px 0;
      }
      .cn-error .cn-icon {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: 20px;
        height: 20px;
        border-radius: 50%;
        background: #fef2f2;
        color: #dc2626;
        font-weight: 700;
        font-size: 12px;
      }

      /* Status badge */
      .cn-status {
        display: flex;
        align-items: center;
        gap: 8px;
        padding: 10px 14px;
        border-radius: 8px;
        font-weight: 600;
        margin: 8px 0;
      }
      .cn-in-network {
        background: #f0fdf4;
        color: #166534;
        border: 1px solid #bbf7d0;
      }
      .cn-out-network {
        background: #fef2f2;
        color: #991b1b;
        border: 1px solid #fecaca;
      }
      .cn-status-icon {
        font-size: 18px;
      }
      .cn-tier {
        margin-left: auto;
        font-size: 12px;
        padding: 2px 8px;
        border-radius: 4px;
        background: rgba(0,0,0,0.06);
      }

      /* Provider info */
      .cn-provider {
        margin-bottom: 4px;
      }
      .cn-provider-name {
        font-weight: 600;
        font-size: 15px;
      }
      .cn-provider-specialty {
        color: #64748b;
        font-size: 13px;
      }

      /* Plan */
      .cn-plan {
        color: #64748b;
        font-size: 13px;
        margin-bottom: 8px;
      }

      /* Alternatives */
      .cn-alternatives {
        border-top: 1px solid #e2e8f0;
        margin-top: 12px;
        padding-top: 12px;
      }
      .cn-alt-header {
        font-weight: 600;
        font-size: 13px;
        margin-bottom: 8px;
        color: #334155;
      }
      .cn-alt-list {
        list-style: none;
        margin: 0;
        padding: 0;
      }
      .cn-alt-item {
        display: flex;
        justify-content: space-between;
        padding: 4px 0;
        font-size: 13px;
        border-bottom: 1px solid #f1f5f9;
      }
      .cn-alt-item:last-child {
        border-bottom: none;
      }
      .cn-alt-name {
        font-weight: 500;
      }
      .cn-alt-specialty {
        color: #64748b;
      }

      /* Disclaimer */
      .cn-disclaimer {
        margin-top: 12px;
        padding-top: 10px;
        border-top: 1px solid #e2e8f0;
        font-size: 11px;
        color: #94a3b8;
        line-height: 1.4;
      }

      /* Branding */
      .cn-branding {
        margin-top: 8px;
        font-size: 10px;
        color: #cbd5e1;
        text-align: right;
      }

      /* Empty state */
      .cn-empty {
        color: #94a3b8;
        font-size: 13px;
        padding: 8px 0;
      }

      /* Dark mode */
      @media (prefers-color-scheme: dark) {
        .cn-widget {
          background: #141416;
          border-color: #2a2a2d;
          color: #e4e4e7;
        }
        .cn-loading { color: #a1a1aa; }
        .cn-spinner { border-color: #2a2a2d; border-top-color: #3b82f6; }
        .cn-in-network { background: #052e16; color: #4ade80; border-color: #166534; }
        .cn-out-network { background: #450a0a; color: #fca5a5; border-color: #991b1b; }
        .cn-tier { background: rgba(255,255,255,0.08); }
        .cn-provider-specialty { color: #71717a; }
        .cn-plan { color: #71717a; }
        .cn-alternatives { border-top-color: #2a2a2d; }
        .cn-alt-header { color: #a1a1aa; }
        .cn-alt-item { border-bottom-color: #1e1e21; }
        .cn-alt-specialty { color: #71717a; }
        .cn-disclaimer { border-top-color: #2a2a2d; color: #52525b; }
        .cn-branding { color: #3f3f46; }
        .cn-empty { color: #52525b; }
        .cn-error { color: #fca5a5; }
        .cn-error .cn-icon { background: #450a0a; color: #fca5a5; }
      }
    `;
  }
}

if (!customElements.get("clear-network-check")) {
  customElements.define("clear-network-check", ClearNetworkCheck);
}
