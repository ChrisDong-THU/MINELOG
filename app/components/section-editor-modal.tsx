"use client";

import { useState } from "react";
import type { Section } from "../content-types";
import { availableSectionIcons, MINECRAFT_UI_ICONS } from "../minecraft-icons";
import { GameModal } from "./game-modal";
import { GameSelect } from "./game-select";

export type EditableSection = Section;

export function SectionEditorModal({
  mode,
  sections,
  onClose,
  onSave,
  onDelete,
}: {
  mode: "new" | "edit";
  sections: EditableSection[];
  onClose: () => void;
  onSave: (value: Pick<EditableSection, "id" | "label" | "icon" | "description">) => void;
  onDelete: (id: string) => void;
}) {
  const first = sections[0];
  const initialIcons = availableSectionIcons(sections, mode === "edit" ? first?.id : undefined);
  const initialIcon = mode === "edit" && first && initialIcons.includes(first.icon) ? first.icon : initialIcons[0] ?? "";
  const [sectionId, setSectionId] = useState(first?.id ?? "");
  const [label, setLabel] = useState(mode === "edit" ? first?.label ?? "" : "");
  const [description, setDescription] = useState(mode === "edit" ? first?.description ?? "" : "");
  const [icon, setIcon] = useState(initialIcon);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const selected = sections.find((section) => section.id === sectionId);
  const iconOptions = availableSectionIcons(sections, mode === "edit" ? sectionId : undefined);
  const valid = label.trim().length > 0 && description.trim().length > 0 && Boolean(icon);

  const chooseSection = (id: string) => {
    const next = sections.find((section) => section.id === id);
    if (!next) return;
    setSectionId(next.id);
    setLabel(next.label);
    setDescription(next.description);
    const nextIcons = availableSectionIcons(sections, next.id);
    setIcon(nextIcons.includes(next.icon) ? next.icon : nextIcons[0] ?? "");
  };

  const randomizeIcon = () => {
    const choices = iconOptions.filter((item) => item !== icon);
    setIcon(choices[Math.floor(Math.random() * choices.length)] ?? iconOptions[0] ?? "");
  };

  if (deleteConfirm && selected) {
    return <GameModal
      eyebrow="DELETE SECTOR"
      title="确认删除整个板块？"
      description="板块内文章与本地正文修改也会一并移除，此操作无法撤销。"
      icon={selected.icon}
      onClose={() => setDeleteConfirm(false)}
      footer={<><button className="pixel-button" type="button" onClick={() => setDeleteConfirm(false)}>返回编辑</button><button className="pixel-button section-delete-confirm" type="button" onClick={() => onDelete(selected.id)}>确认删除</button></>}
    >
      <div className="section-delete-summary">
        <span>即将删除</span>
        <img src={selected.icon} alt="" />
        <strong>{selected.label}</strong>
        <small>{selected.description}</small>
      </div>
    </GameModal>;
  }

  return <GameModal
    eyebrow={mode === "edit" ? "EDIT SECTOR" : "NEW SECTOR"}
    title={mode === "edit" ? "编辑板块" : "新增板块"}
    description={mode === "edit" ? "选择板块并修改其图标、标题与副标题。" : "新板块会先收纳在“更多板块”页，不会占用快捷工具槽。"}
    icon={icon}
    onClose={onClose}
    footer={<>
      {mode === "edit" && selected ? <button className="pixel-button section-delete-button" type="button" onClick={() => setDeleteConfirm(true)}>删除板块</button> : <span className="section-editor-hint">LOCAL SECTOR</span>}
      <span className="section-editor-actions"><button className="pixel-button section-cancel-button" type="button" onClick={onClose}>取消</button><button className="pixel-button modal-done section-save-button" type="button" disabled={!valid} onClick={() => onSave({ id: sectionId, label: label.trim(), icon, description: description.trim() })}>保存板块</button></span>
    </>}
  >
    <div className="section-editor-form">
      {mode === "edit" && <div className="section-editor-field">
        <span>选择板块</span>
        <GameSelect
          value={sectionId}
          options={sections.map((section) => ({ value: section.id, label: section.label, icon: section.icon }))}
          ariaLabel="选择板块"
          onChange={chooseSection}
        />
      </div>}

      <fieldset className="section-icon-picker">
        <legend>板块图标</legend>
        <div><button className="section-random-icon" type="button" aria-label="随机选择板块图标" title="RANDOM · 随机选择" disabled={iconOptions.length === 0} onClick={randomizeIcon}><img src={MINECRAFT_UI_ICONS.random} alt="" /><small>RND</small></button>{iconOptions.map((item) => <button type="button" key={item} aria-label="选择板块图标" aria-pressed={icon === item} onClick={() => setIcon(item)}><img src={item} alt="" /></button>)}</div>
      </fieldset>

      <label className="section-editor-field">
        <span>板块大标题</span>
        <input value={label} maxLength={24} onChange={(event) => setLabel(event.target.value)} placeholder="例如：机器学习" />
      </label>
      <label className="section-editor-field">
        <span>板块副标题</span>
        <input value={description} maxLength={64} onChange={(event) => setDescription(event.target.value)} placeholder="简要说明该板块收录的内容" />
      </label>
    </div>
  </GameModal>;
}
