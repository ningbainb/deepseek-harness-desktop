export function needsShimPass(
  records: readonly MutationRecord[],
  sidebar: Element | null,
  columns: readonly Element[],
): boolean {
  if (!sidebar?.isConnected || columns.length === 0 || columns.some(column => !column.isConnected)) return true
  return records.some(record => {
    const target = record.target
    if (record.type === 'attributes') {
      if (target === sidebar) return true
      if (record.attributeName === 'class' && (target.contains(sidebar) || columns.includes(target as Element))) return true
      return sidebar.contains(target) && Boolean((target as Element).matches?.('[data-slot="sidebar.footer.action"]'))
    }
    if (target === sidebar || target.contains(sidebar)) return true
    return [...record.addedNodes, ...record.removedNodes].some(node => {
      if (columns.some(column => node === column || node.contains(column))) return true
      const element = node as Element
      const selector = '[class*="sidebarCol"], [class*="centerCol"], [class*="detailsCol"]'
      const footer = '[data-slot="sidebar.footer.action"]'
      return Boolean(element.matches?.(selector) || element.querySelector?.(selector)
        || (sidebar.contains(target) && (element.matches?.(footer) || element.querySelector?.(footer))))
    })
  })
}
