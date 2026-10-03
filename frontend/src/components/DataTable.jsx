import Table from './ui/Table.jsx'

/**
 * DataTable — tableau CLIENT (toutes les lignes sont en mémoire).
 *
 * Ce n'est plus qu'une enveloppe autour de `ui/Table.jsx` en mode `client`.
 * **L'API publique est inchangée** : les 17 pages qui l'utilisent n'ont eu
 * besoin d'aucune modification.
 *
 * Props conservées : columns, rows, pageSize, pageSizeOptions, showSizePicker,
 * searchable, rowActions, actionsHeader, rowClassName, emptyText.
 * Les props supplémentaires (title, actions, loading, filter…) sont transmises
 * telles quelles à `ui/Table.jsx`.
 */
export default function DataTable({
  columns,
  rows,
  pageSize = 10,
  pageSizeOptions,
  showSizePicker = true,
  searchable = true,
  rowActions,
  actionsHeader = '',
  rowClassName,
  emptyText = 'Aucune donnée trouvée',
  ...rest
}) {
  return (
    <Table
      mode="client"
      columns={columns}
      rows={rows}
      pageSize={pageSize}
      pageSizeOptions={pageSizeOptions}
      showSizePicker={showSizePicker}
      searchable={searchable}
      rowActions={rowActions}
      actionsHeader={actionsHeader}
      rowClassName={rowClassName}
      emptyText={emptyText}
      {...rest}
    />
  )
}
