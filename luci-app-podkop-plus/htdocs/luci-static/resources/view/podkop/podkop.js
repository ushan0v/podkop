"use strict";
"require view";
"require form";
"require baseclass";
"require uci";
"require ui";
"require view.podkop_plus.main as main";

// Global settings
"require view.podkop_plus.settings as settings";

// Sections
"require view.podkop_plus.section as section";

// Dashboard
"require view.podkop_plus.dashboard as dashboard";

// Diagnostic
"require view.podkop_plus.diagnostic as diagnostic";

const UCI_PACKAGE = main.PODKOP_UCI_PACKAGE;
const CBI_PREFIX = main.PODKOP_CBI_PREFIX;
const DEFAULT_ACTION_ROW_ID = "__podkop_default_action";
const DEFAULT_ACTION_SECTION_ID = "settings";

function getDefaultActionTitle() {
  return _("Default route (if no matches)");
}

function renderSectionAdd(sectionRef, extra_class) {
  const el = form.GridSection.prototype.renderSectionAdd.apply(sectionRef, [
    extra_class,
  ]);
  const nameEl = el.querySelector(".cbi-section-create-name");

  ui.addValidator(
    nameEl,
    "uciname",
    true,
    (value) => {
      const button = el.querySelector(".cbi-section-create > .cbi-button-add");
      const uciconfig = sectionRef.uciconfig || sectionRef.map.config;

      if (!value) {
        button.disabled = true;
        return true;
      }

      if (uci.get(uciconfig, value)) {
        button.disabled = true;
        return _("Expecting: %s").format(_("unique UCI identifier"));
      }

      button.disabled = null;
      return true;
    },
    "blur",
    "keyup",
  );

  return el;
}

function repaintRuleRowColors() {
  const container = document.getElementById(`cbi-${CBI_PREFIX}-rule`);
  if (!container) {
    return;
  }

  const rows = Array.from(
    container.querySelectorAll(".cbi-section-table-row"),
  ).filter(
    (row) =>
      row.closest(`#cbi-${CBI_PREFIX}-rule`) === container &&
      !row.classList.contains("placeholder"),
  );

  rows.forEach((row, index) => {
    row.classList.remove("cbi-rowstyle-1", "cbi-rowstyle-2");
    row.classList.add(index % 2 === 0 ? "cbi-rowstyle-1" : "cbi-rowstyle-2");
  });
}

function isDefaultActionRow(row) {
  return (
    row &&
    (row.getAttribute("data-sid") === DEFAULT_ACTION_ROW_ID ||
      row.classList.contains("pdk-default-action-row"))
  );
}

function clearRuleDropIndicators(container) {
  container
    .querySelectorAll(".drag-over-above, .drag-over-below")
    .forEach((row) => {
      row.classList.remove("drag-over-above");
      row.classList.remove("drag-over-below");
    });
}

function sanitizeRuleHeaderRows(root) {
  if (!root) {
    return;
  }

  const rows = [];

  if (
    typeof root.matches === "function" &&
    root.matches(".cbi-section-table-titles")
  ) {
    rows.push(root);
  }

  if (typeof root.querySelectorAll === "function") {
    rows.push(...root.querySelectorAll(".cbi-section-table-titles"));
  }

  rows.forEach((row) => {
    const sanitizedRow = row.cloneNode(true);

    sanitizedRow.removeAttribute("data-sort-direction");
    sanitizedRow.style.cursor = "default";
    sanitizedRow.querySelectorAll("[data-sortable-row]").forEach((cell) => {
      cell.removeAttribute("data-sortable-row");
      cell.removeAttribute("data-sort-direction");
      cell.style.cursor = "default";
    });

    if (row.parentNode) {
      row.parentNode.replaceChild(sanitizedRow, row);
      return;
    }

    row.removeAttribute("data-sort-direction");
    row.style.cursor = "default";
    row.querySelectorAll("[data-sortable-row]").forEach((cell) => {
      cell.removeAttribute("data-sortable-row");
      cell.removeAttribute("data-sort-direction");
      cell.style.cursor = "default";
    });
  });
}

function sanitizeRenderedRuleHeaders(output) {
  if (!output) {
    return output;
  }

  if (Array.isArray(output)) {
    output.forEach((item) => sanitizeRenderedRuleHeaders(item));
    return output;
  }

  sanitizeRuleHeaderRows(output);
  return output;
}

function showPendingChangeSaveError(error) {
  ui.showModal(_("Save error"), [
    E("p", {}, [_("An error occurred while saving the form:")]),
    E("p", {}, [
      E("em", { style: "white-space:pre-wrap" }, [
        error?.message || `${error}`,
      ]),
    ]),
    E("div", { class: "right" }, [
      E("button", { class: "cbi-button", click: ui.hideModal }, [_("Dismiss")]),
    ]),
  ]);
}

function rerenderGridSection(sectionRef) {
  const configName = sectionRef.uciconfig ?? sectionRef.map.config;
  const sectionNode = document.getElementById(
    `cbi-${configName}-${sectionRef.sectiontype}`,
  );

  if (!sectionNode) {
    return Promise.resolve();
  }

  const cfgsections = sectionRef.cfgsections();
  const renderTasks = cfgsections.map((sectionId) =>
    sectionRef.renderUCISection(sectionId),
  );

  return Promise.all(renderTasks).then((nodes) => {
    const nextNode = sectionRef.renderContents(cfgsections, nodes);
    sectionNode.replaceWith(nextNode);

    if (sectionRef.sectiontype === "rule") {
      sanitizeRuleHeaderRows(nextNode);
      window.setTimeout(() => {
        installRuleRowInteractionSync();
        repaintRuleRowColors();
      }, 0);
    }
  });
}

function removeRuleRowFromDom(sectionRef, section_id) {
  const configName = sectionRef.uciconfig ?? sectionRef.map.config;
  const sectionNode = document.getElementById(
    `cbi-${configName}-${sectionRef.sectiontype}`,
  );

  if (!sectionNode) {
    return;
  }

  const tbody = sectionNode.querySelector(".cbi-section-tbody");
  if (!tbody) {
    return;
  }

  const rows = Array.from(
    tbody.querySelectorAll(".cbi-section-table-row"),
  ).filter(
    (row) => !row.classList.contains("placeholder") && !isDefaultActionRow(row),
  );
  const currentRow = rows.find(
    (row) => row.getAttribute("data-sid") === section_id,
  );

  if (currentRow) {
    currentRow.remove();
  }

  tbody
    .querySelectorAll(".cbi-section-table-row.placeholder")
    .forEach((row) => {
      row.remove();
    });

  const remainingRows = Array.from(
    tbody.querySelectorAll(".cbi-section-table-row"),
  ).filter(
    (row) => !row.classList.contains("placeholder") && !isDefaultActionRow(row),
  );

  if (!remainingRows.length) {
    const defaultActionRow = tbody.querySelector(".pdk-default-action-row");
    const placeholderRow = E(
      "tr",
      { class: "tr cbi-section-table-row placeholder" },
      E("td", { class: "td" }, sectionRef.renderSectionPlaceholder()),
    );

    if (defaultActionRow) {
      tbody.insertBefore(placeholderRow, defaultActionRow);
    } else {
      tbody.appendChild(placeholderRow);
    }
  }

  const table = sectionNode.querySelector(".cbi-section-table");
  if (table && typeof sectionRef.stabilizeActionColumnWidth === "function") {
    try {
      sectionRef.stabilizeActionColumnWidth(table);
    } catch (_error) {}
  }

  repaintRuleRowColors();
}

function saveRulePendingChanges(sectionRef, mutate, options = {}) {
  const { rerenderSection = false, onSuccess = null } = options;

  sectionRef.__pdkRulePendingChangesPromise = Promise.resolve(
    sectionRef.__pdkRulePendingChangesPromise,
  )
    .catch(() => {})
    .then(() => mutate())
    .then(() => sectionRef.map.data.save())
    .then(() => ui.changes.init())
    .then(() => (typeof onSuccess === "function" ? onSuccess() : null))
    .then(() => (rerenderSection ? rerenderGridSection(sectionRef) : null))
    .catch((error) => {
      return sectionRef.map
        .load()
        .then(() => (rerenderSection ? rerenderGridSection(sectionRef) : null))
        .catch(() => {})
        .finally(() => showPendingChangeSaveError(error));
    });

  return sectionRef.__pdkRulePendingChangesPromise;
}

function saveDefaultActionModal(sectionRef, modalMap) {
  return modalMap
    .save(null, true)
    .then(() => sectionRef.map.load())
    .then(() => ui.changes.init())
    .then(() => rerenderGridSection(sectionRef))
    .then(() => ui.hideModal())
    .catch((error) => showPendingChangeSaveError(error));
}

function openDefaultActionModal(sectionRef, ev) {
  if (ev) {
    ev.preventDefault();
  }

  const modalMap = new form.Map(UCI_PACKAGE, null, null);
  modalMap.data = sectionRef.map.data;
  modalMap.parent = sectionRef.map;
  modalMap.readonly = sectionRef.map.readonly;

  const defaultActionSection = modalMap.section(
    form.NamedSection,
    DEFAULT_ACTION_SECTION_ID,
    "settings",
  );
  defaultActionSection.addremove = false;
  defaultActionSection.hidetitle = true;
  section.createDefaultActionContent(defaultActionSection);

  return modalMap.render().then((nodes) => {
    ui.showModal(getDefaultActionTitle(), [
      nodes,
      E("div", { class: "button-row" }, [
        E(
          "button",
          {
            class: "btn cbi-button",
            click: ui.hideModal,
          },
          [_("Dismiss")],
        ),
        " ",
        E(
          "button",
          {
            class: "btn cbi-button cbi-button-positive important",
            click: () => saveDefaultActionModal(sectionRef, modalMap),
            disabled: modalMap.readonly || null,
          },
          [_("Save")],
        ),
      ]),
    ], "cbi-modal");

    if (ui.tabs && typeof ui.tabs.init === "function") {
      window.setTimeout(() => ui.tabs.init(), 0);
    }
  });
}

function getOptionDisplayTitle(sectionRef, option) {
  const title = option?.title || "";

  if (typeof sectionRef.stripTags === "function") {
    return sectionRef.stripTags(title).trim();
  }

  return `${title}`.trim();
}

function getOptionDisplayDescription(sectionRef, option) {
  const description = option?.description || "";

  if (typeof sectionRef.stripTags === "function") {
    return sectionRef.stripTags(description).trim();
  }

  return `${description}`.trim();
}

function applyOptionWidth(cell, option) {
  if (option?.width == null) {
    return;
  }

  cell.style.width =
    typeof option.width === "number" ? `${option.width}px` : option.width;
}

function renderDefaultActionTableCell(sectionRef, option) {
  const title = getOptionDisplayTitle(sectionRef, option);
  const description = getOptionDisplayDescription(sectionRef, option);
  const cell = E("td", {
    class: "td cbi-value-field",
    "data-title": title !== "" ? title : null,
    "data-description": description !== "" ? description : null,
    "data-name": option.option,
    "data-widget": option.__name__,
  });

  applyOptionWidth(cell, option);

  switch (option.option) {
    case "enabled":
      cell.appendChild(
        E("input", {
          type: "checkbox",
          checked: "checked",
          disabled: "disabled",
          "aria-label": _("Enable"),
        }),
      );
      break;
    case "_action_display":
      cell.textContent = section.getDefaultActionDisplayValue();
      break;
    default:
      cell.appendChild(E("em", [_("none")]));
  }

  return cell;
}

function renderDefaultActionRowActions(sectionRef) {
  return E("td", {
    class: "td cbi-section-table-cell nowrap cbi-section-actions",
  }, [
    E("div", [
      E(
        "button",
        {
          type: "button",
          title: _("Drag to reorder"),
          class: "cbi-button drag-handle center pdk-default-action-disabled",
          style:
            "cursor:not-allowed; user-select:none; -webkit-user-select:none; display:inline-block;",
          disabled: "disabled",
          draggable: false,
        },
        ["\u2630"],
      ),
      E(
        "button",
        {
          type: "button",
          title: _("Edit"),
          class: "btn cbi-button cbi-button-edit",
          click: (ev) => openDefaultActionModal(sectionRef, ev),
        },
        [_("Edit")],
      ),
      E(
        "button",
        {
          type: "button",
          title: _("Delete"),
          class: "btn cbi-button cbi-button-remove pdk-default-action-disabled",
          disabled: "disabled",
        },
        [_("Delete")],
      ),
    ]),
  ]);
}

function renderDefaultActionRow(sectionRef) {
  const visibleOptions = (sectionRef.children || []).filter(
    (option) => !option.modalonly,
  );
  const maxCols = sectionRef.max_cols ?? visibleOptions.length;
  const visibleCells = visibleOptions
    .slice(0, maxCols)
    .map((option) => renderDefaultActionTableCell(sectionRef, option));

  return E(
    "tr",
    {
      class: "tr cbi-section-table-row pdk-default-action-row",
      id: `cbi-${UCI_PACKAGE}-${DEFAULT_ACTION_ROW_ID}`,
      "data-sid": DEFAULT_ACTION_ROW_ID,
      "data-title": getDefaultActionTitle(),
      "data-section-id": DEFAULT_ACTION_ROW_ID,
    },
    [...visibleCells, renderDefaultActionRowActions(sectionRef)],
  );
}

function appendDefaultActionRow(sectionRef, sectionNode) {
  if (!sectionNode || typeof sectionNode.querySelector !== "function") {
    return sectionNode;
  }

  const tbody = sectionNode.querySelector(".cbi-section-tbody");
  if (!tbody) {
    return sectionNode;
  }

  tbody.querySelectorAll(".pdk-default-action-row").forEach((row) => {
    row.remove();
  });

  tbody.appendChild(renderDefaultActionRow(sectionRef));

  return sectionNode;
}

function renderRuleSectionContents(sectionRef, originalRenderContents, args) {
  const rendered = originalRenderContents.apply(sectionRef, args);

  if (Array.isArray(rendered)) {
    return rendered.map((node) => appendDefaultActionRow(sectionRef, node));
  }

  return appendDefaultActionRow(sectionRef, rendered);
}

function installRulePendingChanges(sectionRef) {
  if (sectionRef.__pdkRulePendingChangesBound) {
    return;
  }

  sectionRef.__pdkRulePendingChangesBound = true;

  const originalHandleRemove = sectionRef.handleRemove;
  if (typeof originalHandleRemove === "function") {
    sectionRef.handleRemove = function (section_id, ev) {
      const configName = this.uciconfig ?? this.map.config;

      return saveRulePendingChanges(
        this,
        () => {
          this.map.data.remove(configName, section_id);
        },
        {
          onSuccess: () => removeRuleRowFromDom(this, section_id),
        },
      );
    };
  }
}

function installRuleRowInteractionSync() {
  const container = document.getElementById(`cbi-${CBI_PREFIX}-rule`);
  if (!container || container.__pdkRowColorSyncBound) {
    return;
  }

  sanitizeRuleHeaderRows(container);
  container.__pdkRowColorSyncBound = true;

  const schedule = () => {
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(repaintRuleRowColors);
    } else {
      window.setTimeout(repaintRuleRowColors, 0);
    }
  };

  const observer = new MutationObserver(schedule);
  observer.observe(container, { childList: true, subtree: true });

  container.addEventListener("dragend", () => {
    window.setTimeout(() => {
      clearRuleDropIndicators(container);
      schedule();
    }, 0);
  });

  container.addEventListener("drop", () => {
    window.setTimeout(() => {
      clearRuleDropIndicators(container);
      schedule();
    }, 0);
  });

  container.addEventListener("mouseleave", () => {
    window.setTimeout(() => {
      clearRuleDropIndicators(container);
      schedule();
    }, 0);
  });

  ["mouseup", "dragend", "drop"].forEach((eventName) => {
    container.addEventListener(eventName, schedule);
  });

  schedule();
}

function configureGridSection(sectionRef, type, title, addTitle) {
  sectionRef.anonymous = false;
  sectionRef.addremove = true;
  sectionRef.sortable = true;
  sectionRef.rowcolors = true;
  sectionRef.nodescriptions = true;
  sectionRef.modaltitle = function (section_id) {
    const label = uci.get(UCI_PACKAGE, section_id, "label");
    return section_id ? `${title}: ${label || section_id}` : addTitle;
  };
  sectionRef.sectiontitle = function (section_id) {
    return uci.get(UCI_PACKAGE, section_id, "label") || section_id;
  };
  sectionRef.renderSectionAdd = function (extra_class) {
    return renderSectionAdd(sectionRef, extra_class);
  };

  if (type === "rule") {
    const originalRenderContents = sectionRef.renderContents;
    if (typeof originalRenderContents === "function") {
      sectionRef.renderContents = function () {
        return renderRuleSectionContents(
          this,
          originalRenderContents,
          arguments,
        );
      };
    }

    const originalRenderHeaderRows = sectionRef.renderHeaderRows;
    if (typeof originalRenderHeaderRows === "function") {
      sectionRef.renderHeaderRows = function () {
        return sanitizeRenderedRuleHeaders(
          originalRenderHeaderRows.apply(this, arguments),
        );
      };
    }

    sectionRef.handleSort = function () {
      return false;
    };

    installRulePendingChanges(sectionRef);
  }
}

const EntryPoint = {
  async render() {
    main.injectGlobalStyles();

    const podkopMap = new form.Map(
      UCI_PACKAGE,
      _("Podkop Plus Settings"),
      _("Configuration for Podkop Plus service"),
    );
    podkopMap.tabbed = true;

    const rulesSection = podkopMap.section(
      form.GridSection,
      "rule",
      _("Sections"),
      _("Drag rows to change priority. The rule at the top is checked first."),
    );
    configureGridSection(
      rulesSection,
      "rule",
      _("Section"),
      _("Add a section"),
    );
    section.createSectionContent(rulesSection);

    const settingsSection = podkopMap.section(
      form.TypedSection,
      "settings",
      _("Settings"),
    );
    settingsSection.anonymous = true;
    settingsSection.addremove = false;
    settingsSection.cfgsections = function () {
      return ["settings"];
    };
    settings.createSettingsContent(settingsSection);

    const diagnosticSection = podkopMap.section(
      form.TypedSection,
      "diagnostic",
      _("Diagnostics"),
    );
    diagnosticSection.anonymous = true;
    diagnosticSection.addremove = false;
    diagnosticSection.cfgsections = function () {
      return ["diagnostic"];
    };
    diagnostic.createDiagnosticContent(diagnosticSection);

    const dashboardSection = podkopMap.section(
      form.TypedSection,
      "dashboard",
      _("Dashboard"),
    );
    dashboardSection.anonymous = true;
    dashboardSection.addremove = false;
    dashboardSection.cfgsections = function () {
      return ["dashboard"];
    };
    dashboard.createDashboardContent(dashboardSection);

    main.coreService();

    const rendered = await podkopMap.render();
    window.setTimeout(installRuleRowInteractionSync, 0);
    return rendered;
  },
};

return view.extend(EntryPoint);
