interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => React.ReactNode);
  className?: string;
}

interface DataTableProps<T> {
  data: T[];
  columns: Column<T>[];
  keyExtractor: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  isLoading?: boolean;
}

export function DataTable<T>({ data, columns, keyExtractor, onRowClick, isLoading }: DataTableProps<T>) {
  if (isLoading) {
    return <div className="p-4 text-center text-[#6B7280]">Loading data...</div>;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[#E7E5E4] bg-neutral-900/30">
      <table className="w-full text-sm text-left text-[#111827]">
        <thead className="text-xs text-[#6B7280] uppercase bg-white border-b border-[#E7E5E4]">
          <tr>
            {columns.map((col, idx) => (
              <th key={idx} className={`px-6 py-4 font-medium ${col.className || ''}`}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="px-6 py-8 text-center text-[#6B7280]">
                No data available.
              </td>
            </tr>
          ) : (
            data.map((row) => (
              <tr 
                key={keyExtractor(row)} 
                onClick={() => onRowClick && onRowClick(row)}
                className={`border-b border-[#E7E5E4]/50 last:border-0 hover:bg-[#F5F5F3]/30 transition-colors ${onRowClick ? 'cursor-pointer' : ''}`}
              >
                {columns.map((col, idx) => (
                  <td key={idx} className={`px-6 py-4 whitespace-nowrap ${col.className || ''}`}>
                    {typeof col.accessor === 'function' ? col.accessor(row) : (row[col.accessor] as React.ReactNode)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
