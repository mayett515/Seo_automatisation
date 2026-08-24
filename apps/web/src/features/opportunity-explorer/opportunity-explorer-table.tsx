import { useMemo } from "react";
import { createColumnHelper, flexRender, getCoreRowModel, useReactTable, type Row } from "@tanstack/react-table";
import { StatusPill } from "@localseo/ui";
import type { OpportunityExplorerOpportunity } from "@localseo/contracts";
import { classificationTone, label } from "./opportunity-explorer-utils";

const opportunityColumn = createColumnHelper<OpportunityExplorerOpportunity>();

export function useOpportunityTable(rows: OpportunityExplorerOpportunity[]) {
  const columns = useMemo(
    () => [
      opportunityColumn.accessor(
        (row) => row.research?.candidate.service ?? row.evidenceJson?.service ?? "Unknown service",
        {
          id: "service",
          header: "Service",
          cell: (info) => <strong>{info.getValue()}</strong>
        }
      ),
      opportunityColumn.accessor(
        (row) => row.research?.candidate.area ?? row.evidenceJson?.location.name ?? "Unknown Ort",
        {
          id: "location",
          header: "Ort",
          cell: (info) => info.getValue()
        }
      ),
      opportunityColumn.accessor((row) => row.research?.lane ?? row.classification, {
        id: "lane",
        header: "Lane",
        cell: (info) => (
          <StatusPill tone={classificationTone(info.getValue())}>{label(info.getValue() ?? "unclassified")}</StatusPill>
        )
      }),
      opportunityColumn.accessor((row) => row.research?.portfolioOrder ?? row.score, {
        id: "portfolio",
        header: "Portfolio",
        cell: (info) => info.getValue()?.toString() ?? "-"
      }),
      opportunityColumn.accessor(
        (row) => row.research?.evidenceReadiness ?? row.evidenceJson?.recommendedAction ?? row.status,
        {
          id: "evidence",
          header: "Evidence",
          cell: (info) => label(info.getValue())
        }
      )
    ],
    []
  );

  return useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel()
  });
}

export function OpportunityTable(props: {
  table: ReturnType<typeof useOpportunityTable>;
  isPending: boolean;
  isError: boolean;
  selectedId?: string;
  onSelect: (id: string) => void;
  rowCount: number;
}) {
  if (props.isPending) {
    return <section className="table-panel">Loading opportunities</section>;
  }

  if (props.isError) {
    return <section className="notice notice--danger">Opportunities could not be loaded.</section>;
  }

  return (
    <section className="table-panel">
      <h2>Opportunities</h2>
      <div className="data-table data-table--opportunities">
        {props.table.getHeaderGroups().map((headerGroup) => (
          <div className="data-table__row data-table__row--head data-table__row--opportunity" key={headerGroup.id}>
            {headerGroup.headers.map((header) => (
              <span key={header.id}>{flexRender(header.column.columnDef.header, header.getContext())}</span>
            ))}
          </div>
        ))}
        {props.table.getRowModel().rows.map((row) => (
          <OpportunityRow key={row.id} onSelect={props.onSelect} row={row} selectedId={props.selectedId} />
        ))}
        {props.rowCount === 0 ? <div className="data-table__row">No opportunities yet.</div> : null}
      </div>
    </section>
  );
}

function OpportunityRow(props: {
  onSelect: (id: string) => void;
  row: Row<OpportunityExplorerOpportunity>;
  selectedId?: string;
}) {
  const isSelected = props.selectedId === props.row.original.id;

  return (
    <button
      className={`data-table__row data-table__row--opportunity data-table__row--button${
        isSelected ? " data-table__row--selected" : ""
      }`}
      type="button"
      onClick={() => props.onSelect(props.row.original.id)}
    >
      {props.row.getVisibleCells().map((cell) => (
        <span key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</span>
      ))}
    </button>
  );
}
