import Table from './ui/Table.jsx'

/**
 * ServerTable — tableau SERVEUR : la pagination et la recherche sont gérées par
 * le parent, qui consomme les métadonnées de `paginate()` de Laravel.
 *
 * Depuis le Lot 1 du design system, ce n'est plus qu'une enveloppe autour de
 * `ui/Table.jsx` en mode `server`. **L'API publique est inchangée** : les pages
 * Data Center, Centres de domiciliation et Paramètres fonctionnent à
 * l'identique, avec les mêmes appels API.
 */
export default function ServerTable({
  columns,
  rows,
  meta,
  search,
  onSearchChange,
  perPage,
  onPerPageChange,
  onPageChange,
  loading,
  rowActions,
  actionsHeader = '',
  emptyText = 'Aucune donnée trouvée',
  ...rest
}) {
  return (
    <Table
      mode="server"
      columns={columns}
      rows={rows}
      meta={meta}
      search={search}
      onSearchChange={onSearchChange}
      perPage={perPage}
      onPerPageChange={onPerPageChange}
      onPageChange={onPageChange}
      loading={loading}
      rowActions={rowActions}
      actionsHeader={actionsHeader}
      emptyText={emptyText}
      {...rest}
    />
  )
}
