/** Плоский список категорій для <select> з відступом за рівнем дерева */
export function flattenCategoriesForSelect(nodes, level = 0) {
  let out = [];
  (nodes || []).forEach((n) => {
    const id = n._id?.toString?.() || n._id;
    if (!id) return;
    out.push({ _id: id, name: n.name || '—', level, itemKind: n.itemKind });
    if (n.children?.length) {
      out = out.concat(flattenCategoriesForSelect(n.children, level + 1));
    }
  });
  return out;
}
