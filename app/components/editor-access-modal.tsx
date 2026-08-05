"use client";

import { useEffect, useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from "react";
import { verifyEditorAccess } from "../editor-auth-client";
import { GameModal } from "./game-modal";

const DIGIT_COUNT = 6;

export function EditorAccessModal({ onAuthorized, onClose }: { onAuthorized: () => void; onClose: () => void }) {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [shaking, setShaking] = useState(false);
  const inputs = useRef<Array<HTMLInputElement | null>>([]);
  const verifying = useRef(false);

  useEffect(() => { inputs.current[0]?.focus(); }, []);

  const focus = (index: number) => inputs.current[Math.max(0, Math.min(DIGIT_COUNT - 1, index))]?.focus();
  const resetError = () => {
    if (error) setError("");
    if (shaking) setShaking(false);
  };
  const verifyCompleteKey = async (candidate: string) => {
    if (candidate.length !== DIGIT_COUNT || verifying.current) return;
    verifying.current = true;
    setSubmitting(true);
    setError("");
    setShaking(false);
    try {
      const result = await verifyEditorAccess(candidate);
      if (result.authorized) onAuthorized();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "密钥验证失败，请重新输入");
      setKey("");
      window.requestAnimationFrame(() => {
        setShaking(true);
        focus(0);
      });
    } finally {
      verifying.current = false;
      setSubmitting(false);
    }
  };
  const applyKey = (next: string, focusIndex: number) => {
    const normalized = next.replace(/\D/g, "").slice(0, DIGIT_COUNT);
    setKey(normalized);
    resetError();
    if (normalized.length === DIGIT_COUNT) {
      void verifyCompleteKey(normalized);
    } else {
      focus(focusIndex);
    }
  };
  const updateDigit = (index: number, value: string) => {
    const digit = value.replace(/\D/g, "").slice(-1);
    const digits = key.split("");
    if (digit) {
      digits[index] = digit;
      applyKey(digits.join(""), index + 1);
    } else {
      digits.splice(index, 1);
      applyKey(digits.join(""), index);
    }
  };
  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Backspace" && !key[index] && index > 0) {
      event.preventDefault();
      const digits = key.split("");
      digits.splice(index - 1, 1);
      applyKey(digits.join(""), index - 1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      focus(index - 1);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      focus(index + 1);
    }
  };
  const handlePaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, DIGIT_COUNT);
    if (!pasted) return;
    event.preventDefault();
    applyKey(pasted, Math.min(pasted.length, DIGIT_COUNT - 1));
  };
  const preventSubmit = (event: FormEvent) => event.preventDefault();

  return <GameModal
    className="editor-access-modal"
    eyebrow="EDITOR ACCESS"
    title="验证编辑密钥"
    description="请输入 6 位数字密钥，填写完成后将自动验证。"
    onClose={onClose}
  >
    <form className="editor-access-form" onSubmit={preventSubmit} aria-busy={submitting}>
      <fieldset disabled={submitting} aria-label="6 位数字密钥">
        <div className={`editor-key-digits${error ? " is-error" : ""}${shaking ? " is-shaking" : ""}`} onPaste={handlePaste}>
          {Array.from({ length: DIGIT_COUNT }, (_, index) => <input
            key={index}
            ref={(element) => { inputs.current[index] = element; }}
            className={key[index] ? "is-filled" : ""}
            type="password"
            inputMode="numeric"
            pattern="[0-9]*"
            autoComplete={index === 0 ? "one-time-code" : "off"}
            maxLength={1}
            value={key[index] ?? ""}
            aria-label={`密钥第 ${index + 1} 位`}
            aria-invalid={Boolean(error)}
            aria-describedby="editor-access-feedback"
            onChange={(event) => updateDigit(index, event.target.value)}
            onKeyDown={(event) => handleKeyDown(index, event)}
            onFocus={(event) => event.currentTarget.select()}
          />)}
        </div>
      </fieldset>
      <p className={`editor-access-feedback${error ? " is-error" : ""}`} id="editor-access-feedback" role={error ? "alert" : "status"}>{error || (submitting ? "正在验证密钥…" : "输入完成后自动验证")}</p>
    </form>
  </GameModal>;
}
