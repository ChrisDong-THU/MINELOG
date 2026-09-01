"use client";

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type DragEvent,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import {
  alignMarkdownTableCells,
  clearMarkdownTableCells,
  markdownTableCellKey,
  setMarkdownTableCells,
  type MarkdownTableStyle,
} from "../markdown-table-style";
import type { MarkdownTableAction } from "../markdown-table-model";

type CellPosition = { row: number; column: number };
type CellSelection = { anchor: CellPosition; focus: CellPosition };
type Axis = "row" | "column";
type MenuState = { kind: Axis | "cell" | "table"; index: number; anchor: { left: number; top: number } };
type Metric = { start: number; size: number };

function selectionRange(selection: CellSelection) {
  return {
    top: Math.min(selection.anchor.row, selection.focus.row),
    right: Math.max(selection.anchor.column, selection.focus.column),
    bottom: Math.max(selection.anchor.row, selection.focus.row),
    left: Math.min(selection.anchor.column, selection.focus.column),
  };
}

function sameCellPosition(left: CellPosition | null, right: CellPosition | null) {
  return left === right || Boolean(left && right && left.row === right.row && left.column === right.column);
}

function positionForCell(table: HTMLTableElement, target: EventTarget | null): CellPosition | null {
  if (!(target instanceof Element)) return null;
  const cell = target.closest<HTMLTableCellElement>("th, td");
  const row = cell?.parentElement;
  if (!cell || !(row instanceof HTMLTableRowElement) || !table.contains(cell)) return null;
  return { row: row.rowIndex, column: cell.cellIndex };
}

function GripIcon() {
  return <svg viewBox="0 0 10 14" aria-hidden="true"><circle cx="3" cy="3" r="1"/><circle cx="7" cy="3" r="1"/><circle cx="3" cy="7" r="1"/><circle cx="7" cy="7" r="1"/><circle cx="3" cy="11" r="1"/><circle cx="7" cy="11" r="1"/></svg>;
}

function MenuIcon({ name }: { name: "plus" | "copy" | "trash" | "header" | "fit" | "clear" }) {
  const paths = {
    plus: "M8 3v10M3 8h10",
    copy: "M5 5h8v8H5zM3 11H2V2h9v1",
    trash: "M4 5h8M6 5V3h4v2M5 5l1 9h4l1-9",
    header: "M2 3h12v10H2zM2 7h12",
    fit: "M2 5V2h3M11 2h3v3M14 11v3h-3M5 14H2v-3",
    clear: "M4 12l8-8M5 4l7 7-3 3H6l-4-4z",
  } as const;
  return <svg viewBox="0 0 16 16" aria-hidden="true"><path d={paths[name]} /></svg>;
}

function AlignIcon({ value }: { value: "left" | "center" | "right" }) {
  const lines = value === "left"
    ? [[2, 4, 14], [2, 8, 11], [2, 12, 14]]
    : value === "right"
      ? [[2, 4, 14], [5, 8, 14], [2, 12, 14]]
      : [[2, 4, 14], [4, 8, 12], [2, 12, 14]];
  return <svg viewBox="0 0 16 16" aria-hidden="true">{lines.map(([x1, y, x2]) => <path key={y} d={`M${x1} ${y}h${x2 - x1}`} />)}</svg>;
}

function MoreVerticalIcon() {
  return <svg viewBox="0 0 12 16" aria-hidden="true"><circle cx="6" cy="3" r="1.5"/><circle cx="6" cy="8" r="1.5"/><circle cx="6" cy="13" r="1.5"/></svg>;
}

function SettingsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M19.43 12.98c.04-.32.07-.65.07-.98s-.03-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.5 7.5 0 0 0-1.69-.98l-.38-2.65A.5.5 0 0 0 14 2h-4a.5.5 0 0 0-.5.42l-.38 2.65c-.61.25-1.17.58-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65a7.8 7.8 0 0 0 0 1.96l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46a.5.5 0 0 0 .6.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.04.24.25.42.5.42h4a.5.5 0 0 0 .5-.42l.38-2.65c.61-.25 1.17-.58 1.69-.98l2.49 1a.5.5 0 0 0 .6-.22l2-3.46a.5.5 0 0 0-.12-.64zM12 15.5a3.5 3.5 0 1 1 0-7 3.5 3.5 0 0 1 0 7" /></svg>;
}

export function EditableMarkdownTable({
  children,
  presentation,
  editable,
  cellSources,
  onPresentationChange,
  onStructureChange,
  ...tableProps
}: ComponentProps<"table"> & {
  children: ReactNode;
  presentation: MarkdownTableStyle;
  editable: boolean;
  cellSources?: string[][];
  onPresentationChange?: (style: MarkdownTableStyle) => void;
  onStructureChange?: (action: MarkdownTableAction) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const dirtyCells = useRef(new Set<string>());
  const pendingFocus = useRef<CellPosition | null>(null);
  const resizeDrag = useRef<{ startX: number; index: number; widths: number[]; latest: number[] } | null>(null);
  const selectionCleanup = useRef<(() => void) | null>(null);
  const [hovered, setHovered] = useState<CellPosition | null>(null);
  const [activeCell, setActiveCell] = useState<CellPosition | null>(null);
  const [selection, setSelection] = useState<CellSelection | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);
  const [dragging, setDragging] = useState<{ axis: Axis; index: number } | null>(null);
  const [draftWidths, setDraftWidths] = useState<number[] | null>(null);
  const [columns, setColumns] = useState<Metric[]>([]);
  const [rows, setRows] = useState<Metric[]>([]);
  const [tableBox, setTableBox] = useState({ left: 0, top: 0, width: 0, height: 0 });
  const effectiveWidths = draftWidths ?? presentation.widths;

  const measureWidths = () => Array.from(tableRef.current?.rows[0]?.cells ?? [], (cell) => Math.round(cell.getBoundingClientRect().width));

  useLayoutEffect(() => {
    const table = tableRef.current;
    const stage = stageRef.current;
    if (!table || !stage) return;
    const measure = () => {
      const stageRect = stage.getBoundingClientRect();
      const tableRect = table.getBoundingClientRect();
      const left = tableRect.left - stageRect.left;
      const top = tableRect.top - stageRect.top;
      setTableBox({ left, top, width: tableRect.width, height: tableRect.height });
      setColumns(Array.from(table.rows[0]?.cells ?? [], (cell) => {
        const rect = cell.getBoundingClientRect();
        return { start: rect.left - stageRect.left, size: rect.width };
      }));
      setRows(Array.from(table.rows, (row) => {
        const rect = row.getBoundingClientRect();
        return { start: rect.top - stageRect.top, size: rect.height };
      }));
    };
    const frame = requestAnimationFrame(measure);
    const observer = new ResizeObserver(measure);
    observer.observe(table);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  }, [children, effectiveWidths]);

  useLayoutEffect(() => {
    const table = tableRef.current;
    if (!table) return;
    const dark = new Set(presentation.dark);
    const bold = new Set(presentation.bold);
    for (const row of Array.from(table.rows)) {
      for (const cell of Array.from(row.cells)) {
        const key = markdownTableCellKey(row.rowIndex, cell.cellIndex);
        cell.classList.toggle("is-table-cell-dark", dark.has(key));
        cell.classList.toggle("is-table-cell-bold", bold.has(key));
        cell.classList.toggle("is-table-header-column", presentation.headerColumn && cell.cellIndex === 0);
        cell.style.textAlign = presentation.align[key] ?? "";
        if (editable) {
          cell.setAttribute("contenteditable", "plaintext-only");
          cell.setAttribute("spellcheck", "true");
          cell.setAttribute("tabindex", "0");
        } else {
          cell.removeAttribute("contenteditable");
          cell.removeAttribute("spellcheck");
          cell.removeAttribute("tabindex");
        }
      }
    }
    table.classList.toggle("has-header-row", presentation.headerRow);
  }, [editable, presentation]);

  const interactionActive = editable && Boolean(menu || selection);
  useEffect(() => {
    if (!interactionActive) return;
    const dismiss = (event: globalThis.PointerEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        setMenu(null);
        setSelection(null);
      }
    };
    window.addEventListener("pointerdown", dismiss);
    return () => window.removeEventListener("pointerdown", dismiss);
  }, [interactionActive]);

  useEffect(() => () => selectionCleanup.current?.(), []);

  const run = (action: MarkdownTableAction) => {
    setMenu(null);
    setActiveCell(null);
    setSelection(null);
    onStructureChange?.(action);
  };

  const openMenu = (next: Omit<MenuState, "anchor">, event: MouseEvent<HTMLButtonElement>) => {
    const rootRect = rootRef.current?.getBoundingClientRect();
    const anchorRect = event.currentTarget.getBoundingClientRect();
    if (next.kind !== "cell") setSelection(null);
    setMenu({
      ...next,
      anchor: {
        left: anchorRect.right - (rootRect?.left ?? 0),
        top: anchorRect.bottom - (rootRect?.top ?? 0),
      },
    });
  };

  const selectedKeys = () => {
    if (menu?.kind === "row") return columns.map((_, column) => markdownTableCellKey(menu.index, column));
    if (menu?.kind === "column") return rows.map((_, row) => markdownTableCellKey(row, menu.index));
    if (selection) {
      const range = selectionRange(selection);
      const keys: string[] = [];
      for (let row = range.top; row <= range.bottom; row += 1) {
        for (let column = range.left; column <= range.right; column += 1) {
          keys.push(markdownTableCellKey(row, column));
        }
      }
      return keys;
    }
    return activeCell ? [markdownTableCellKey(activeCell.row, activeCell.column)] : [];
  };

  const startCellSelection = (event: PointerEvent<HTMLDivElement>) => {
    const table = tableRef.current;
    if (!editable || !table || event.button !== 0 || event.target instanceof Element && event.target.closest("button")) return;
    const anchor = positionForCell(table, event.target);
    if (!anchor) return;

    selectionCleanup.current?.();
    setSelection({ anchor, focus: anchor });
    setActiveCell(anchor);
    setMenu(null);

    const startX = event.clientX;
    const startY = event.clientY;
    let selecting = false;
    const finish = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      document.documentElement.classList.remove("is-selecting-markdown-table");
      selectionCleanup.current = null;
    };
    const move = (moveEvent: globalThis.PointerEvent) => {
      if (!selecting && Math.hypot(moveEvent.clientX - startX, moveEvent.clientY - startY) < 4) return;
      if (!selecting) {
        selecting = true;
        document.documentElement.classList.add("is-selecting-markdown-table");
      }
      moveEvent.preventDefault();
      window.getSelection()?.removeAllRanges();
      const focus = positionForCell(table, document.elementFromPoint(moveEvent.clientX, moveEvent.clientY));
      if (focus) setSelection((current) => current && sameCellPosition(current.anchor, anchor) && sameCellPosition(current.focus, focus)
        ? current
        : { anchor, focus });
    };
    selectionCleanup.current = finish;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  const align = (value: "left" | "center" | "right") => {
    const keys = selectedKeys();
    if (keys.length) onPresentationChange?.(alignMarkdownTableCells(presentation, keys, value));
  };

  const toggleStyle = (property: "dark" | "bold") => {
    const keys = selectedKeys();
    if (!keys.length) return;
    const current = new Set(presentation[property]);
    onPresentationChange?.(setMarkdownTableCells(presentation, keys, property, !keys.every((key) => current.has(key))));
  };

  const clearStyle = () => {
    const keys = selectedKeys();
    if (keys.length) onPresentationChange?.(clearMarkdownTableCells(presentation, keys));
  };

  const handleBlur = (event: FocusEvent<HTMLDivElement>) => {
    if (!editable || !tableRef.current) return;
    const position = positionForCell(tableRef.current, event.target);
    if (!position) return;
    const key = markdownTableCellKey(position.row, position.column);
    if (!dirtyCells.current.delete(key)) return;
    const cell = event.target instanceof HTMLElement ? event.target.closest<HTMLTableCellElement>("th, td") : null;
    const current = cellSources?.[position.row]?.[position.column] ?? "";
    const next = (cell?.innerText ?? "").replace(/\r?\n+/g, " ").trim();
    if (next !== current) run({ kind: "update-cell", ...position, value: next });
  };

  const focusCell = (row: number, column: number) => {
    const table = tableRef.current;
    const target = table?.rows[row]?.cells[column] as HTMLElement | undefined;
    target?.focus({ preventScroll: true });
  };

  useEffect(() => {
    const next = pendingFocus.current;
    if (!next) return;
    pendingFocus.current = null;
    requestAnimationFrame(() => focusCell(next.row, next.column));
  }, [children]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!tableRef.current) return;
    const position = positionForCell(tableRef.current, event.target);
    if (!position) return;
    if (event.key === "Escape") {
      (event.target as HTMLElement).blur();
      setMenu(null);
      setSelection(null);
      return;
    }
    if (event.key !== "Tab" && event.key !== "Enter") return;
    event.preventDefault();
    const columnCount = columns.length;
    let index = position.row * columnCount + position.column + (event.shiftKey ? -1 : 1);
    if (index >= rows.length * columnCount) {
      pendingFocus.current = { row: rows.length, column: 0 };
      run({ kind: "insert-row", at: rows.length });
      return;
    }
    index = Math.max(0, index);
    pendingFocus.current = { row: Math.floor(index / columnCount), column: index % columnCount };
    focusCell(pendingFocus.current.row, pendingFocus.current.column);
  };

  const startResize = (index: number, event: PointerEvent<HTMLButtonElement>) => {
    const widths = measureWidths();
    if (!widths[index]) return;
    resizeDrag.current = { startX: event.clientX, index, widths, latest: widths };
    setDraftWidths(widths);
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
    event.stopPropagation();
  };

  const resizeColumn = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = resizeDrag.current;
    if (!drag) return;
    const next = [...drag.widths];
    next[drag.index] = Math.max(80, Math.min(800, Math.round(drag.widths[drag.index] + event.clientX - drag.startX)));
    drag.latest = next;
    setDraftWidths(next);
  };

  const finishResize = () => {
    const drag = resizeDrag.current;
    if (!drag) return;
    resizeDrag.current = null;
    setDraftWidths(null);
    onPresentationChange?.({ ...presentation, widths: drag.latest });
  };

  const resizeColumnWithKeyboard = (index: number, event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    event.stopPropagation();
    const widths = measureWidths();
    if (!widths[index]) return;
    const step = event.shiftKey ? 40 : 10;
    widths[index] = Math.max(80, Math.min(800, widths[index] + (event.key === "ArrowRight" ? step : -step)));
    onPresentationChange?.({ ...presentation, widths });
  };

  const dragStart = (axis: Axis, index: number, event: DragEvent<HTMLButtonElement>) => {
    setDragging({ axis, index });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `${axis}:${index}`);
  };

  const dropAt = (axis: Axis, index: number, event: DragEvent<HTMLButtonElement>) => {
    event.preventDefault();
    if (!dragging || dragging.axis !== axis || dragging.index === index) return setDragging(null);
    run(axis === "row"
      ? { kind: "move-row", from: dragging.index, to: index }
      : { kind: "move-column", from: dragging.index, to: index });
    setDragging(null);
  };

  const tableWidth = effectiveWidths.reduce((sum, width) => sum + width, 0);
  const range = selection ? selectionRange(selection) : null;
  const selectionBox = range && columns[range.left] && columns[range.right] && rows[range.top] && rows[range.bottom] ? {
    left: columns[range.left].start,
    top: rows[range.top].start,
    width: columns[range.right].start + columns[range.right].size - columns[range.left].start,
    height: rows[range.bottom].start + rows[range.bottom].size - rows[range.top].start,
  } : null;
  const selectionCount = range ? (range.right - range.left + 1) * (range.bottom - range.top + 1) : 0;
  const selectedAlignments = menu?.kind === "cell" || menu?.kind === "column"
    ? selectedKeys().map((key) => presentation.align[key] ?? "left")
    : [];
  const selectionAlignment = selectedAlignments.length > 0 && selectedAlignments.every((value) => value === selectedAlignments[0])
    ? selectedAlignments[0]
    : undefined;

  return <div ref={rootRef} className={`markdown-table${editable ? " is-editable" : ""}${selection ? " has-cell-selection" : ""}`}>
    <div className="table-scroll">
      <div ref={stageRef} className="markdown-table-stage" onPointerDown={startCellSelection} onPointerMove={(event) => {
        if (tableRef.current) {
          const position = positionForCell(tableRef.current, event.target);
          setHovered((current) => sameCellPosition(current, position) ? current : position);
        }
      }} onPointerLeave={() => !menu && setHovered(null)} onFocusCapture={(event) => {
        if (tableRef.current) {
          const position = positionForCell(tableRef.current, event.target);
          setActiveCell((current) => sameCellPosition(current, position) ? current : position);
          if (position) setSelection((current) => current && sameCellPosition(current.anchor, position) && sameCellPosition(current.focus, position)
            ? current
            : { anchor: position, focus: position });
        }
      }} onInputCapture={(event) => {
        const position = tableRef.current ? positionForCell(tableRef.current, event.target) : null;
        if (position) dirtyCells.current.add(markdownTableCellKey(position.row, position.column));
      }} onBlurCapture={handleBlur} onKeyDown={handleKeyDown}>
        <table
          ref={tableRef}
          {...tableProps}
          className={`${tableProps.className ?? ""}${effectiveWidths.length ? " has-column-widths" : ""} is-table-align-${presentation.tableAlign}`.trim()}
          style={tableWidth ? { ...tableProps.style, width: `${tableWidth}px` } : tableProps.style}
        >
          {effectiveWidths.length > 0 && <colgroup>{effectiveWidths.map((width, index) => <col key={index} style={{ width: `${width}px` }} />)}</colgroup>}
          {children}
        </table>

        {editable && <>
          <button type="button" className="notion-table-options" style={{ left: tableBox.left - 25, top: tableBox.top - 25 }} aria-label="表格设置" onClick={(event) => openMenu({ kind: "table", index: 0 }, event)}><SettingsIcon /></button>
          {columns.map((metric, index) => <button
            key={`column-${index}`}
            type="button"
            draggable
            className={`notion-table-handle is-column${hovered?.column === index || menu?.kind === "column" && menu.index === index ? " is-visible" : ""}${dragging?.axis === "column" && dragging.index === index ? " is-dragging" : ""}`}
            style={{ left: metric.start, top: tableBox.top - 25, width: metric.size }}
            aria-label={`第 ${index + 1} 列菜单`}
            onClick={(event) => openMenu({ kind: "column", index }, event)}
            onDragStart={(event) => dragStart("column", index, event)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(event) => dragging?.axis === "column" && event.preventDefault()}
            onDrop={(event) => dropAt("column", index, event)}
          ><GripIcon /></button>)}
          {rows.map((metric, index) => <button
            key={`row-${index}`}
            type="button"
            draggable
            className={`notion-table-handle is-row${hovered?.row === index || menu?.kind === "row" && menu.index === index ? " is-visible" : ""}${dragging?.axis === "row" && dragging.index === index ? " is-dragging" : ""}`}
            style={{ left: tableBox.left - 25, top: metric.start, height: metric.size }}
            aria-label={`第 ${index + 1} 行菜单`}
            onClick={(event) => openMenu({ kind: "row", index }, event)}
            onDragStart={(event) => dragStart("row", index, event)}
            onDragEnd={() => setDragging(null)}
            onDragOver={(event) => dragging?.axis === "row" && event.preventDefault()}
            onDrop={(event) => dropAt("row", index, event)}
          ><GripIcon /></button>)}
          {columns.map((metric, index) => <button
            key={`resize-${index}`}
            type="button"
            className="markdown-table-resize-handle"
            style={{ left: metric.start + metric.size, top: tableBox.top, height: tableBox.height }}
            aria-label={`调整第 ${index + 1} 列宽度`}
            onPointerDown={(event) => startResize(index, event)}
            onPointerMove={resizeColumn}
            onPointerUp={finishResize}
            onPointerCancel={finishResize}
            onKeyDown={(event) => resizeColumnWithKeyboard(index, event)}
          />)}
          <button type="button" className="notion-table-add is-column" style={{ left: tableBox.left + tableBox.width + 4, top: tableBox.top, height: tableBox.height }} aria-label="添加列" onClick={() => run({ kind: "insert-column", at: columns.length })}><MenuIcon name="plus" /></button>
          <button type="button" className="notion-table-add is-row" style={{ left: tableBox.left, top: tableBox.top + tableBox.height + 4, width: tableBox.width }} aria-label="添加行" onClick={() => run({ kind: "insert-row", at: rows.length })}><MenuIcon name="plus" /></button>
          {selectionBox && <>
            <div className="notion-cell-selection" style={selectionBox} aria-hidden="true" />
            <button
              type="button"
              className="notion-cell-menu-button"
              style={{ left: selectionBox.left + selectionBox.width - 7, top: selectionBox.top + selectionBox.height / 2 - 9 }}
              aria-label={`设置所选 ${selectionCount} 个单元格的格式`}
              aria-haspopup="menu"
              aria-expanded={menu?.kind === "cell"}
              onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
              onClick={(event) => openMenu({ kind: "cell", index: 0 }, event)}
            ><MoreVerticalIcon /></button>
          </>}
        </>}
      </div>
    </div>
    {editable && menu && <TableMenu
      menu={menu}
      presentation={presentation}
      selectionAlignment={selectionAlignment}
      onRun={run}
      onAlign={align}
      onToggleStyle={toggleStyle}
      onClearStyle={clearStyle}
      onPresentationChange={(style) => onPresentationChange?.(style)}
    />}
  </div>;
}

function TableMenu({ menu, presentation, selectionAlignment, onRun, onAlign, onToggleStyle, onClearStyle, onPresentationChange }: {
  menu: MenuState;
  presentation: MarkdownTableStyle;
  selectionAlignment?: "left" | "center" | "right";
  onRun: (action: MarkdownTableAction) => void;
  onAlign: (value: "left" | "center" | "right") => void;
  onToggleStyle: (property: "dark" | "bold") => void;
  onClearStyle: () => void;
  onPresentationChange: (style: MarkdownTableStyle) => void;
}) {
  return <div className="notion-table-menu" style={menu.anchor} role="menu">
    {menu.kind === "row" && <>
      <button type="button" onClick={() => onRun({ kind: "insert-row", at: menu.index })}><MenuIcon name="plus"/>在上方插入</button>
      <button type="button" onClick={() => onRun({ kind: "insert-row", at: menu.index + 1 })}><MenuIcon name="plus"/>在下方插入</button>
      <button type="button" onClick={() => onRun({ kind: "duplicate-row", row: menu.index })}><MenuIcon name="copy"/>复制行</button>
      {menu.index === 0 && <button type="button" aria-pressed={presentation.headerRow} onClick={() => onPresentationChange({ ...presentation, headerRow: !presentation.headerRow })}><MenuIcon name="header"/>表头行<span className="notion-menu-check">{presentation.headerRow ? "✓" : ""}</span></button>}
      <i />
      <button type="button" className="is-danger" onClick={() => onRun({ kind: "delete-rows", rows: [menu.index] })}><MenuIcon name="trash"/>删除行</button>
    </>}
    {menu.kind === "column" && <>
      <button type="button" onClick={() => onRun({ kind: "insert-column", at: menu.index })}><MenuIcon name="plus"/>在左侧插入</button>
      <button type="button" onClick={() => onRun({ kind: "insert-column", at: menu.index + 1 })}><MenuIcon name="plus"/>在右侧插入</button>
      <button type="button" onClick={() => onRun({ kind: "duplicate-column", column: menu.index })}><MenuIcon name="copy"/>复制列</button>
      {menu.index === 0 && <button type="button" aria-pressed={presentation.headerColumn} onClick={() => onPresentationChange({ ...presentation, headerColumn: !presentation.headerColumn })}><MenuIcon name="header"/>表头列<span className="notion-menu-check">{presentation.headerColumn ? "✓" : ""}</span></button>}
      <AlignmentButtons label="内容对齐" value={selectionAlignment} onAlign={onAlign} />
      <i />
      <button type="button" className="is-danger" onClick={() => onRun({ kind: "delete-columns", columns: [menu.index] })}><MenuIcon name="trash"/>删除列</button>
    </>}
    {menu.kind === "cell" && <>
      <AlignmentButtons label="内容对齐" value={selectionAlignment} onAlign={onAlign} />
      <button type="button" onClick={() => onToggleStyle("bold")}><strong>B</strong>加粗</button>
      <button type="button" onClick={() => onToggleStyle("dark")}><span className="notion-color-swatch"/>背景色</button>
      <button type="button" onClick={onClearStyle}><MenuIcon name="clear"/>清除格式</button>
    </>}
    {menu.kind === "table" && <>
      <AlignmentButtons
        label="表格对齐"
        value={presentation.tableAlign}
        onAlign={(tableAlign) => onPresentationChange({ ...presentation, tableAlign })}
      />
      <button type="button" aria-pressed={presentation.headerRow} onClick={() => onPresentationChange({ ...presentation, headerRow: !presentation.headerRow })}><MenuIcon name="header"/>表头行<span className="notion-menu-check">{presentation.headerRow ? "✓" : ""}</span></button>
      <button type="button" aria-pressed={presentation.headerColumn} onClick={() => onPresentationChange({ ...presentation, headerColumn: !presentation.headerColumn })}><MenuIcon name="header"/>表头列<span className="notion-menu-check">{presentation.headerColumn ? "✓" : ""}</span></button>
      <button type="button" onClick={() => onPresentationChange({ ...presentation, widths: [] })}><MenuIcon name="fit"/>适应页面宽度</button>
    </>}
  </div>;
}

function AlignmentButtons({ label, value, onAlign }: {
  label: string;
  value?: "left" | "center" | "right";
  onAlign: (value: "left" | "center" | "right") => void;
}) {
  return <div className="notion-menu-align">
    <span>{label}</span>
    {(["left", "center", "right"] as const).map((alignment) => <button
      key={alignment}
      type="button"
      aria-label={`${label}：${alignment === "left" ? "左对齐" : alignment === "center" ? "居中对齐" : "右对齐"}`}
      title={alignment === "left" ? "左对齐" : alignment === "center" ? "居中对齐" : "右对齐"}
      aria-pressed={value === alignment}
      onClick={() => onAlign(alignment)}
    ><AlignIcon value={alignment} /></button>)}
  </div>;
}
