import type { ReactNode } from 'react';

export interface Column<Row> {
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  readonly align?: 'left' | 'right';
  /** Hidden below the `sm` breakpoint to keep narrow screens readable. */
  readonly wideOnly?: boolean;
}

interface DataTableProps<Row> {
  caption: string;
  columns: readonly Column<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
}

export function DataTable<Row>({ caption, columns, rows, rowKey }: DataTableProps<Row>) {
  const cellClass = (column: Column<Row>) =>
    `px-4 py-2.5 ${column.align === 'right' ? 'whitespace-nowrap text-right' : 'text-left'} ${
      column.wideOnly ? 'hidden sm:table-cell' : ''
    }`;

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-sheet-raised/40 text-dim">
            {columns.map((column) => (
              <th
                key={column.header}
                scope="col"
                className={`text-xs font-medium ${cellClass(column)}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              className="border-b border-line transition-colors last:border-b-0 hover:bg-sheet-raised/40"
            >
              {columns.map((column) => (
                <td key={column.header} className={cellClass(column)}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
