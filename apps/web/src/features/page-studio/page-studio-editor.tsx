import { useState } from "react";
import { useForm } from "@tanstack/react-form";
import { Link } from "@tanstack/react-router";
import type {
  PageSectionInstance,
  PageStudioEditCommand,
  PageVersionDetail,
  PageVersionSummary
} from "@localseo/contracts";
import { decideMovePageSection, getPageStudioSectionCapabilities } from "@localseo/domain";
import { pageRegistrySummary, validatePageSectionProps, type PageRegistryEditorField } from "@localseo/page-registry";
import { StatusPill } from "@localseo/ui";
import {
  cloneEditorValue,
  editorListItemValue,
  isRecord,
  normalizeEditorProps,
  orderedPageSections
} from "./page-studio-state.js";

export function PageStudioEditor(props: {
  error: Error | null;
  isSaving: boolean;
  isVersionListError: boolean;
  isVersionListPending: boolean;
  latestVersion?: PageVersionSummary;
  pageVersion: PageVersionDetail;
  projectId: string;
  onCommand: (command: PageStudioEditCommand) => void;
}) {
  const sections = orderedPageSections(props.pageVersion);
  const [selectedSectionId, setSelectedSectionId] = useState(sections[0]?.id ?? "");
  const selectedSection = sections.find((section) => section.id === selectedSectionId) ?? sections[0];
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
            onSelect={() => setSelectedSectionId(section.id)}
          />
        ))}
      </div>

      {selectedSection ? (
        <SectionPropsForm
          canEdit={canEdit}
          isSaving={props.isSaving}
          key={`${props.pageVersion.id}:${selectedSection.id}`}
          section={selectedSection}
          onSubmit={(sectionProps) =>
            props.onCommand({ type: "update_section_props", sectionId: selectedSection.id, props: sectionProps })
          }
        />
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
  const [validationMessage, setValidationMessage] = useState<string>();
  const entry = pageRegistrySummary.find((candidate) => candidate.registryKey === props.section.registryKey);
  const initialProps = cloneEditorValue(props.section.props);
  const form = useForm({
    defaultValues: { props: isRecord(initialProps) ? initialProps : {} },
    onSubmit: ({ value }) => {
      if (!entry) {
        setValidationMessage("This section is not available in the Page Registry.");
        return;
      }

      const normalized = normalizeEditorProps(value.props, entry.editorFields);
      const validation = validatePageSectionProps(entry.registryKey, normalized);
      if (!validation.success) {
        setValidationMessage(validation.message);
        return;
      }

      setValidationMessage(undefined);
      props.onSubmit(validation.props);
    }
  });

  if (!entry) {
    return <div className="notice notice--danger">Section controls are unavailable for this registry entry.</div>;
  }

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
          <h3>{sectionLabel(props.section.type)}</h3>
          <p>Complete section properties</p>
        </div>
        <StatusPill tone="neutral">{props.section.variant}</StatusPill>
      </div>

      <form.Field name="props">
        {(field) => (
          <RegistryPropsFields
            disabled={!props.canEdit || props.isSaving}
            fields={entry.editorFields}
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
            disabled={!props.canEdit || props.isSaving || state.isSubmitting || !state.isDirty}
            type="submit"
          >
            {props.isSaving ? "Saving" : "Create next version"}
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
