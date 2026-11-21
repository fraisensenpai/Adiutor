import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ModelOption } from '@shared/types';
import { CheckIcon, ChevronDown, SearchIcon } from './Icons';

interface ModelPickerProps {
  models: ModelOption[];
  value: string;
  onChange: (model: string) => void;
  ariaLabel: string;
  providerLabel?: string;
  /** Araç çubuğu/başlık için tek satırlık görünüm. */
  compact?: boolean;
  id?: string;
  /** Popover'ı sağ kenara hizalar. */
  align?: 'left' | 'right';
  /** Listede olmayan bir model kimliğinin yazılmasına izin verir. */
  allowCustom?: boolean;
}

interface PopoverPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

const POPOVER_WIDTH = 348;

/**
 * Model seçici: okunur ad, sağlayıcı model kimliği ve kısa rol etiketiyle
 * aranabilir bir liste sunar. Liste bir portala çizilir; dar panellerde ve
 * tablolarda kırpılmaz. Listede olmayan kimlikler elle yazılabilir.
 */
export function ModelPicker({
  models,
  value,
  onChange,
  ariaLabel,
  providerLabel,
  compact = false,
  id,
  align = 'left',
  allowCustom = true,
}: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const selected = models.find((model) => model.id === value);

  const place = useCallback(() => {
    const trigger = rootRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(POPOVER_WIDTH, window.innerWidth - 24);
    const preferred = align === 'right' ? rect.right - width : rect.left;
    const left = Math.max(12, Math.min(preferred, window.innerWidth - width - 12));
    const spaceBelow = window.innerHeight - rect.bottom - 14;
    const spaceAbove = rect.top - 14;
    const openUp = spaceBelow < 260 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(180, Math.min(380, openUp ? spaceAbove : spaceBelow));
    const top = openUp ? Math.max(10, rect.top - maxHeight - 6) : rect.bottom + 6;
    setPosition({ left, top, width, maxHeight });
  }, [align]);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }
    place();
    const onViewportChange = () => place();
    window.addEventListener('resize', onViewportChange);
    window.addEventListener('scroll', onViewportChange, true);
    return () => {
      window.removeEventListener('resize', onViewportChange);
      window.removeEventListener('scroll', onViewportChange, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActive(0);
    const frame = requestAnimationFrame(() => searchRef.current?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return models;
    return models.filter(
      (model) =>
        model.id.toLowerCase().includes(needle) ||
        model.label.toLowerCase().includes(needle) ||
        (model.tag ?? '').toLowerCase().includes(needle),
    );
  }, [models, query]);

  const typed = query.trim();
  const customId = allowCustom && typed.length > 0 && !models.some((model) => model.id === typed) ? typed : null;
  const options: ModelOption[] = customId
    ? [...filtered, { id: customId, label: customId, tag: 'özel kimlik' }]
    : filtered;

  const pick = (model: string) => {
    if (!model) return;
    onChange(model);
    setOpen(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(Math.max(options.length - 1, 0), index + 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(0, index - 1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const chosen = options[active];
      if (chosen) pick(chosen.id);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
    }
  };

  const popover =
    open && position ? (
      <div
        ref={popoverRef}
        className="model-picker-pop"
        style={{
          left: position.left,
          top: position.top,
          width: position.width,
          maxHeight: position.maxHeight,
        }}
      >
        <div className="model-picker-search">
          <SearchIcon size={12} />
          <input
            ref={searchRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="Model ara veya kimlik yaz"
            aria-label="Model ara"
            spellCheck={false}
          />
        </div>

        <div className="model-picker-list" role="listbox" aria-label={ariaLabel}>
          {options.length === 0 ? (
            <div className="model-picker-empty">Eşleşen model yok. Kimliği olduğu gibi yazabilirsiniz.</div>
          ) : null}
          {options.map((model, index) => (
            <button
              key={model.id}
              type="button"
              role="option"
              aria-selected={model.id === value}
              className={`model-option${index === active ? ' is-active' : ''}`}
              onMouseEnter={() => setActive(index)}
              onClick={() => pick(model.id)}
            >
              <span className="model-option-main">
                <span className="model-option-label">{model.label}</span>
                {model.id !== model.label ? <span className="model-option-id">{model.id}</span> : null}
              </span>
              {model.tag ? <span className="model-option-tag">{model.tag}</span> : null}
              {model.id === value ? <CheckIcon size={12} /> : null}
            </button>
          ))}
        </div>

        <div className="model-picker-foot">
          <span>
            {providerLabel ? `${providerLabel} · ` : ''}
            {models.length} model
          </span>
          <span>Listede yoksa kimliği yazın</span>
        </div>
      </div>
    ) : null;

  return (
    <div className="model-picker" ref={rootRef}>
      <button
        id={id}
        type="button"
        className={`model-picker-trigger${compact ? ' is-compact' : ''}${open ? ' is-open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={selected ? `${selected.label} · ${selected.id}` : value}
        onClick={() => setOpen((current) => !current)}
      >
        {compact ? (
          <span className="model-picker-id">{selected?.label ?? value}</span>
        ) : (
          <span className="model-picker-value">
            <span className="model-picker-label">{selected?.label ?? 'Model seçin'}</span>
            <span className="model-picker-id">{value}</span>
          </span>
        )}
        <ChevronDown size={compact ? 11 : 13} />
      </button>

      {popover ? createPortal(popover, document.body) : null}
    </div>
  );
}
