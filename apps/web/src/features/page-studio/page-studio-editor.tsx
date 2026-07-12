import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import type {
  PageSectionInstance,
  PageStudioEditCommand,
  SectionCopySuggestion,
  PageVersionDetail,
  PageVersionSummary
} from "@localseo/contracts";
import { decideMovePageSection, getPageStudioSectionCapabilities } from "@localseo/domain";
import {
  pageRegistrySummary,
  getPageRegistryAiCopyFieldKeys,
  validatePageSectionProps,
  type PageRegistryEditorField,
  type PageRegistryEntrySummary
} from "@localseo/page-registry";
import { StatusPill } from "@localseo/ui";
import {
  cloneEditorValue,
  createEmptyEditorProps,
  editorListItemValue,
  isRecord,
  legalReplacementEntries,
  latestCopySuggestionForSection,
  normalizeEditorProps,
  orderedPageSections
} from "./page-studio-state.js";

type PageStudioPanelMode = "properties" | "replacement" | "copy";

export function PageStudioEditor(props: {
  copyActionError: Error | null;
  copySuggestions: readonly SectionCopySuggestion[];
  error: Error | null;
  isCopyActionPending: boolean;
  isCopySuggestionsError: boolean;
  isCopySuggestionsPending: boolean;
  isSaving: boolean;
  isVersionListError: boolean;
  isVersionListPending: boolean;
  latestVersion?: PageVersionSummary;
  pageVersion: PageVersionDetail;
  projectId: string;
  onApplyCopySuggestion: (suggestion: SectionCopySuggestion, props: Record<string, unknown>) => void;
  onCommand: (command: PageStudioEditCommand) => void;
  onDismissCopySuggestion: (suggestionId: string) => void;
  onRequestCopySuggestion: (sectionId: string, instruction: string) => void;
}) {
  const sections = orderedPageSections(props.pageVersion);
  const [selectedSectionId, setSelectedSectionId] = useState(sections[0]?.id ?? "");
  const [panelMode, setPanelMode] = useState<PageStudioPanelMode>("properties");
  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? sections[0];
  const replacementEntries = selectedSection
    ? legalReplacementEntries(props.pageVersion.pageJson, selectedSection.id, pageRegistrySummary)
    : [];
  const copyFieldKeys = selectedSection ? getPageRegistryAiCopyFieldKeys(selectedSection.registryKey) : [];
  const activePanelMode =
    panelMode === "replacement" && replacementEntries.length === 0
      ? "properties"
      : panelMode === "copy" && copyFieldKeys.length === 0
        ? "properties"
        : panelMode;
  const isLatest = props.latestVersion?.id === props.pageVersion.id;
  const canEdit = isLatest && props.pageVersion.status !== "superseded" && !props.isVersionListPending;
  const editorState = props.isVersionListPending
    ? "checking"
    : props.isVersionListError
      ? "unavailable"
      : canEdit
        ? `next v${props.pageVersion.versionNumber + 1}`
        : isLatest
          ? "locked"
          : "stale";

  return (
    <section className="page-studio-panel detail-panel">
      <div className="panel-heading">
        <div>
          <h2>Page Studio</h2>
          <p>{`Version ${props.pageVersion.versionNumber}`}</p>
        </div>
        <StatusPill tone={canEdit ? "success" : isLatest ? "warning" : "neutral"}>{editorState}</StatusPill>
      </div>

      {props.isVersionListPending ? <div className="notice notice--neutral">Checking latest version</div> : null}
      {props.isVersionListError ? (
        <div className="notice notice--danger">Latest-version state could not be loaded.</div>
      ) : null}
      {!isLatest && props.latestVersion ? (
        <div className="notice notice--neutral page-studio-stale-notice">
          <span>{`Version ${props.latestVersion.versionNumber} is now current.`}</span>
          <Link
            className="button-link"
            to="/projects/$projectId/pages/$pageId/preview"
            params={{ projectId: props.projectId, pageId: props.latestVersion.id }}
          >
            Open latest
          </Link>
        </div>
      ) : null}
      {props.error ? <div className="notice notice--danger">{props.error.message}</div> : null}
      {props.copyActionError ? <div className="notice notice--danger">{props.copyActionError.message}</div> : null}

      <div className="page-studio-outline" aria-label="Page section outline">
        {sections.map((section) => (
          <PageStudioSectionRow
            canEdit={canEdit}
            isSaving={props.isSaving}
            isSelected={section.id === selectedSection?.id}
            key={section.id}
            pageVersion={props.pageVersion}
            section={section}
            onCommand={props.onCommand}
            onSelect={() => {
              setSelectedSectionId(section.id);
              setPanelMode("properties");
            }}
          />
        ))}
      </div>

      {selectedSection ? (
        <>
          <PageStudioPanelModeControl
            canGenerateCopy={copyFieldKeys.length > 0}
            canReplace={replacementEntries.length > 0}
            mode={activePanelMode}
            onChange={setPanelMode}
          />
          {activePanelMode === "properties" ? (
            <SectionPropsForm
              canEdit={canEdit}
              isSaving={props.isSaving}
              key={`${props.pageVersion.id}:${selectedSection.id}:properties`}
              section={selectedSection}
              onSubmit={(sectionProps) =>
                props.onCommand({ type: "update_section_props", sectionId: selectedSection.id, props: sectionProps })
              }
            />
          ) : activePanelMode === "replacement" ? (
            <SectionReplacementForm
              canEdit={canEdit}
              entries={replacementEntries}
              isSaving={props.isSaving}
              key={`${props.pageVersion.id}:${selectedSection.id}:replacement`}
              section={selectedSection}
              onSubmit={(entry, variant, sectionProps) =>
                props.onCommand({
                  type: "replace_section",
                  sectionId: selectedSection.id,
                  registryKey: entry.registryKey,
                  variant,
                  props: sectionProps
                })
              }
            />
          ) : (
            <SectionCopySuggestionPanel
              canEdit={canEdit}
              isActionPending={props.isCopyActionPending || props.isSaving}
              isSuggestionsError={props.isCopySuggestionsError}
              isSuggestionsPending={props.isCopySuggestionsPending}
              key={`${props.pageVersion.id}:${selectedSection.id}:copy`}
              section={selectedSection}
              suggestions={props.copySuggestions}
              onApply={props.onApplyCopySuggestion}
              onDismiss={props.onDismissCopySuggestion}
              onRequest={props.onRequestCopySuggestion}
            />
          )}
        </>
      ) : null}
    </section>
  );
}

function PageStudioPanelModeControl(props: {
  canGenerateCopy: boolean;
  canReplace: boolean;
  mode: PageStudioPanelMode;
  onChange: (mode: PageStudioPanelMode) => void;
}) {
  return (
    <div aria-label="Section editor mode" className="page-studio-mode-control" role="group">
      <button
        aria-pressed={props.mode === "properties"}
        className={props.mode === "properties" ? "button-secondary button-secondary--active" : "button-secondary"}
        type="button"
        onClick={() => props.onChange("properties")}
      >
        Properties
      </button>
      <button
        aria-pressed={props.mode === "replacement"}
        className={props.mode === "replacement" ? "button-secondary button-secondary--active" : "button-secondary"}
        disabled={!props.canReplace}
        type="button"
        onClick={() => props.onChange("replacement")}
      >
        Replace section
      </button>
      <button
        aria-pressed={props.mode === "copy"}
        className={props.mode === "copy" ? "button-secondary button-secondary--active" : "button-secondary"}
        disabled={!props.canGenerateCopy}
        type="button"
        onClick={() => props.onChange("copy")}
      >
        AI copy
      </button>
    </div>
  );
}

function SectionCopySuggestionPanel(props: {
  canEdit: boolean;
  isActionPending: boolean;
  isSuggestionsError: boolean;
  isSuggestionsPending: boolean;
  section: PageSectionInstance;
  suggestions: readonly SectionCopySuggestion[];
  onApply: (suggestion: SectionCopySuggestion, props: Record<string, unknown>) => void;
  onDismiss: (suggestionId: string) => void;
  onRequest: (sectionId: string, instruction: string) => void;
}) {
  const [instruction, setInstruction] = useState("");
  const suggestion = latestCopySuggestionForSection(props.section.id, props.suggestions);
  const entry = pageRegistrySummary.find((candidate) => candidate.registryKey === props.section.registryKey);
  const isActive =
    suggestion?.status === "queued" || suggestion?.status === "generating" || suggestion?.status === "ready";

  if (!entry) {
    return <div className="notice notice--danger">AI copy controls are unavailable for this registry entry.</div>;
  }

  return (
    <section className="page-studio-copy-panel">
      <div className="page-studio-props-heading">
        <div>
          <h3>AI copy revision</h3>
          <p>{sectionLabel(props.section.type)}</p>
        </div>
        <StatusPill
          tone={suggestion?.status === "failed" ? "danger" : suggestion?.status === "ready" ? "success" : "neutral"}
        >
          {suggestion?.status ?? "new"}
        </StatusPill>
      </div>

      {props.isSuggestionsPending ? <div className="notice notice--neutral">Loading copy suggestions</div> : null}
      {props.isSuggestionsError ? (
        <div className="notice notice--danger">Copy suggestions could not be loaded.</div>
      ) : null}
      {suggestion?.status === "queued" || suggestion?.status === "generating" ? (
        <>
          <div className="notice notice--neutral">Copy revision is being generated.</div>
          <button
            className="button-secondary"
            disabled={!props.canEdit || props.isActionPending}
            type="button"
            onClick={() => props.onDismiss(suggestion.id)}
          >
            Cancel revision
          </button>
        </>
      ) : null}
      {suggestion?.status === "failed" ? (
        <div className="notice notice--danger">
          {suggestion.failureMessage ?? "Copy revision could not be generated."}
        </div>
      ) : null}

      {suggestion?.status === "ready" && suggestion.suggestedProps ? (
        <>
          <RegistryPropsForm
            canSubmit={props.canEdit}
            description="Review before creating the next version"
            entry={entry}
            initialProps={suggestion.suggestedProps}
            isSaving={props.isActionPending}
            requireDirty={false}
            savingLabel="Applying"
            submitLabel="Apply suggestion"
            title={sectionLabel(props.section.type)}
            variant={props.section.variant}
            onSubmit={(sectionProps) => props.onApply(suggestion, sectionProps)}
          />
          <button
            className="button-secondary"
            disabled={!props.canEdit || props.isActionPending}
            type="button"
            onClick={() => props.onDismiss(suggestion.id)}
          >
            Dismiss suggestion
          </button>
        </>
      ) : null}

      {!isActive ? (
        <div className="page-studio-copy-request">
          <label className="form-field">
            <span>Revision instruction</span>
            <textarea
              disabled={!props.canEdit || props.isActionPending}
              placeholder="Optional"
              value={instruction}
              onChange={(event) => setInstruction(event.currentTarget.value)}
            />
          </label>
          <button
            className="button-primary"
            disabled={!props.canEdit || props.isActionPending || props.isSuggestionsPending || props.isSuggestionsError}
            type="button"
            onClick={() => props.onRequest(props.section.id, instruction)}
          >
            {props.isActionPending
              ? "Queueing"
              : suggestion?.status === "failed"
                ? "Retry revision"
                : "Generate revision"}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function PageStudioSectionRow(props: {
  canEdit: boolean;
  isSaving: boolean;
  isSelected: boolean;
  pageVersion: PageVersionDetail;
  section: PageSectionInstance;
  onCommand: (command: PageStudioEditCommand) => void;
  onSelect: () => void;
}) {
  const capabilities = getPageStudioSectionCapabilities({
    pageJson: props.pageVersion.pageJson,
    sectionId: props.section.id,
    registryEntries: pageRegistrySummary
  });
  const moveUp = decideMovePageSection({
    pageJson: props.pageVersion.pageJson,
    sectionId: props.section.id,
    direction: "up",
    registryEntries: pageRegistrySummary
  });
  const moveDown = decideMovePageSection({
    pageJson: props.pageVersion.pageJson,
    sectionId: props.section.id,
    direction: "down",
    registryEntries: pageRegistrySummary
  });
  const controlsDisabled = !props.canEdit || props.isSaving;

  return (
    <div className={`page-studio-section-row${props.isSelected ? " page-studio-section-row--selected" : ""}`}>
      <button className="page-studio-section-select" type="button" onClick={props.onSelect}>
        <strong>{sectionLabel(props.section.type)}</strong>
        <span>{`${props.section.zone.replaceAll("_", " ")} / ${props.section.id}`}</span>
      </button>
      <div className="page-studio-section-tools">
        <button
          aria-label={`Move ${props.section.type} up`}
          className="button-icon"
          disabled={controlsDisabled || moveUp.kind !== "allow"}
          title="Move section up"
          type="button"
          onClick={() => props.onCommand({ type: "move_section", sectionId: props.section.id, direction: "up" })}
        >
          ↑
        </button>
        <button
          aria-label={`Move ${props.section.type} down`}
          className="button-icon"
          disabled={controlsDisabled || moveDown.kind !== "allow"}
          title="Move section down"
          type="button"
          onClick={() => props.onCommand({ type: "move_section", sectionId: props.section.id, direction: "down" })}
        >
          ↓
        </button>
        <label className="page-studio-variant-control">
          <span className="sr-only">{`${props.section.type} variant`}</span>
          <select
            aria-label={`${props.section.type} variant`}
            disabled={controlsDisabled || !capabilities.found || !capabilities.canSwitchVariant}
            value={props.section.variant}
            onChange={(event) =>
              props.onCommand({
                type: "switch_section_variant",
                sectionId: props.section.id,
                variant: event.currentTarget.value
              })
            }
          >
            {(capabilities.found ? capabilities.variants : [props.section.variant]).map((variant) => (
              <option key={variant} value={variant}>
                {variant}
              </option>
            ))}
          </select>
        </label>
      </div>
    </div>
  );
}

function SectionPropsForm(props: {
  canEdit: boolean;
  isSaving: boolean;
  section: PageSectionInstance;
  onSubmit: (props: Record<string, unknown>) => void;
}) {
  const entry = pageRegistrySummary.find((candidate) => candidate.registryKey === props.section.registryKey);

  if (!entry) {
    return <div className="notice notice--danger">Section controls are unavailable for this registry entry.</div>;
  }

  return (
    <RegistryPropsForm
      canSubmit={props.canEdit}
      description="Complete section properties"
      entry={entry}
      initialProps={props.section.props}
      isSaving={props.isSaving}
      savingLabel="Saving"
      submitLabel="Create next version"
      title={sectionLabel(props.section.type)}
      variant={props.section.variant}
      onSubmit={props.onSubmit}
    />
  );
}

function SectionReplacementForm(props: {
  canEdit: boolean;
  entries: readonly PageRegistryEntrySummary[];
  isSaving: boolean;
  section: PageSectionInstance;
  onSubmit: (entry: PageRegistryEntrySummary, variant: string, props: Record<string, unknown>) => void;
}) {
  const [registryKey, setRegistryKey] = useState(props.entries[0]?.registryKey ?? "");
  const entry = props.entries.find((candidate) => candidate.registryKey === registryKey) ?? props.entries[0];

  if (!entry) {
    return <div className="notice notice--neutral">No legal replacement is available for this section.</div>;
  }

  return (
    <section className="page-studio-replacement">
      <label className="form-field">
        <span>Replacement type</span>
        <select
          disabled={!props.canEdit || props.isSaving}
          value={entry.registryKey}
          onChange={(event) => setRegistryKey(event.currentTarget.value)}
        >
          {props.entries.map((candidate) => (
            <option key={candidate.registryKey} value={candidate.registryKey}>
              {`${sectionLabel(candidate.type)} / ${candidate.registryKey}`}
            </option>
          ))}
        </select>
      </label>
      <ReplacementTargetForm
        canEdit={props.canEdit}
        entry={entry}
        isSaving={props.isSaving}
        key={entry.registryKey}
        section={props.section}
        onSubmit={(variant, sectionProps) => props.onSubmit(entry, variant, sectionProps)}
      />
    </section>
  );
}

function ReplacementTargetForm(props: {
  canEdit: boolean;
  entry: PageRegistryEntrySummary;
  isSaving: boolean;
  section: PageSectionInstance;
  onSubmit: (variant: string, props: Record<string, unknown>) => void;
}) {
  const [variant, setVariant] = useState(props.entry.defaultVariant);

  return (
    <>
      <label className="form-field">
        <span>Replacement variant</span>
        <select
          disabled={!props.canEdit || props.isSaving}
          value={variant}
          onChange={(event) => setVariant(event.currentTarget.value)}
        >
          {props.entry.variants.map((candidate) => (
            <option key={candidate} value={candidate}>
              {candidate}
            </option>
          ))}
        </select>
      </label>
      <RegistryPropsForm
        canSubmit={props.canEdit}
        description={`Replaces ${sectionLabel(props.section.type)} in the same page slot`}
        entry={props.entry}
        initialProps={createEmptyEditorProps(props.entry.editorFields)}
        isSaving={props.isSaving}
        savingLabel="Replacing"
        submitLabel="Create replacement version"
        title={sectionLabel(props.entry.type)}
        variant={variant}
        onSubmit={(sectionProps) => props.onSubmit(variant, sectionProps)}
      />
    </>
  );
}

function RegistryPropsForm(props: {
  canSubmit: boolean;
  description: string;
  entry: PageRegistryEntrySummary;
  initialProps: Record<string, unknown>;
  isSaving: boolean;
  requireDirty?: boolean;
  savingLabel: string;
  submitLabel: string;
  title: string;
  variant: string;
  onSubmit: (props: Record<string, unknown>) => void;
}) {
  const [validationMessage, setValidationMessage] = useState<string>();
  const initialProps = cloneEditorValue(props.initialProps);
  const form = useForm({
    defaultValues: { props: isRecord(initialProps) ? initialProps : {} },
    onSubmit: ({ value }) => {
      const normalized = normalizeEditorProps(value.props, props.entry.editorFields);
      const validation = validatePageSectionProps(props.entry.registryKey, normalized);
      if (!validation.success) {
        setValidationMessage(validation.message);
        return;
      }

      setValidationMessage(undefined);
      props.onSubmit(validation.props);
    }
  });

  return (
    <form
      className="page-studio-props-form"
      onSubmit={(event) => {
        event.preventDefault();
        void form.handleSubmit();
      }}
    >
      <div className="page-studio-props-heading">
        <div>
          <h3>{props.title}</h3>
          <p>{props.description}</p>
        </div>
        <StatusPill tone="neutral">{props.variant}</StatusPill>
      </div>

      <form.Field name="props">
        {(field) => (
          <RegistryPropsFields
            disabled={!props.canSubmit || props.isSaving}
            fields={props.entry.editorFields}
            value={field.state.value}
            onChange={field.handleChange}
          />
        )}
      </form.Field>

      {validationMessage ? <div className="notice notice--danger">{validationMessage}</div> : null}

      <form.Subscribe selector={(state) => ({ isSubmitting: state.isSubmitting, isDirty: state.isDirty })}>
        {(state) => (
          <button
            className="button-primary"
            disabled={
              !props.canSubmit ||
              props.isSaving ||
              state.isSubmitting ||
              (props.requireDirty !== false && !state.isDirty)
            }
            type="submit"
          >
            {props.isSaving ? props.savingLabel : props.submitLabel}
          </button>
        )}
      </form.Subscribe>
    </form>
  );
}

function RegistryPropsFields(props: {
  disabled: boolean;
  fields: readonly PageRegistryEditorField[];
  value: Record<string, unknown>;
  onChange: (value: Record<string, unknown>) => void;
}) {
  return (
    <div className="page-studio-field-list">
      {props.fields.map((field) => (
        <RegistryField
          disabled={props.disabled}
          field={field}
          key={field.key}
          value={props.value[field.key]}
          onChange={(value) => props.onChange({ ...props.value, [field.key]: value })}
        />
      ))}
    </div>
  );
}

function RegistryField(props: {
  disabled: boolean;
  field: PageRegistryEditorField;
  value: unknown;
  onChange: (value: unknown) => void;
}) {
  const editorField = props.field;

  if (editorField.control === "list") {
    const items: unknown[] = Array.isArray(props.value) ? (props.value as unknown[]) : [];
    return (
      <fieldset className="page-studio-list-field">
        <legend>{editorField.label}</legend>
        {items.map((item, index) => (
          <div className="page-studio-list-item" key={`${editorField.key}:${index}`}>
            <div className="page-studio-list-item-heading">
              <strong>{`${editorField.itemLabel} ${index + 1}`}</strong>
              <button
                aria-label={`Remove ${editorField.itemLabel} ${index + 1}`}
                className="button-icon"
                disabled={props.disabled}
                title="Remove item"
                type="button"
                onClick={() => props.onChange(items.filter((_, itemIndex) => itemIndex !== index))}
              >
                ×
              </button>
            </div>
            <ListItemEditor
              disabled={props.disabled}
              item={editorListItemValue(item, editorField.itemTemplate)}
              multilineKeys={editorField.multilineItemKeys ?? []}
              onChange={(nextItem) =>
                props.onChange(items.map((current, itemIndex) => (itemIndex === index ? nextItem : current)))
              }
            />
          </div>
        ))}
        <button
          className="button-secondary page-studio-add-item"
          disabled={props.disabled}
          type="button"
          onClick={() => props.onChange([...items, cloneEditorValue(editorField.itemTemplate)])}
        >
          {`Add ${editorField.itemLabel.toLowerCase()}`}
        </button>
      </fieldset>
    );
  }

  const inputValue = typeof props.value === "string" ? props.value : "";
  return (
    <label className="form-field">
      <span>{props.field.label}</span>
      {editorField.control === "textarea" ? (
        <textarea
          disabled={props.disabled}
          value={inputValue}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
      ) : (
        <input
          disabled={props.disabled}
          value={inputValue}
          onChange={(event) => props.onChange(event.currentTarget.value)}
        />
      )}
    </label>
  );
}

function ListItemEditor(props: {
  disabled: boolean;
  item: unknown;
  multilineKeys: readonly string[];
  onChange: (value: unknown) => void;
}) {
  if (typeof props.item === "string") {
    return (
      <textarea
        aria-label="List item value"
        disabled={props.disabled}
        value={props.item}
        onChange={(event) => props.onChange(event.currentTarget.value)}
      />
    );
  }

  const item = props.item;
  if (!isRecord(item)) {
    return <div className="notice notice--danger">This list item cannot be edited.</div>;
  }

  return (
    <div className="page-studio-list-item-fields">
      {Object.entries(item).map(([key, value]) => {
        const textValue = typeof value === "string" ? value : "";
        return (
          <label className="form-field" key={key}>
            <span>{fieldLabel(key)}</span>
            {props.multilineKeys.includes(key) ? (
              <textarea
                disabled={props.disabled}
                value={textValue}
                onChange={(event) => props.onChange({ ...item, [key]: event.currentTarget.value })}
              />
            ) : (
              <input
                disabled={props.disabled}
                value={textValue}
                onChange={(event) => props.onChange({ ...item, [key]: event.currentTarget.value })}
              />
            )}
          </label>
        );
      })}
    </div>
  );
}

function fieldLabel(value: string): string {
  return value.replace(/([a-z])([A-Z])/gu, "$1 $2").replace(/^./u, (character) => character.toUpperCase());
}

function sectionLabel(value: string): string {
  return value.replace(/([a-z])([A-Z])/gu, "$1 $2");
}
