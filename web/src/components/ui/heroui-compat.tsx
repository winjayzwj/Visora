import { AlertDialog, Button as HeroButton, Card as HeroCard, Drawer as HeroDrawer, Modal as HeroModal, Slider as HeroSlider, Spinner as HeroSpinner, Switch as HeroSwitch, Toast, toast } from "@heroui/react";
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Children, cloneElement, createContext, forwardRef, isValidElement, useContext, useMemo, useState, useSyncExternalStore } from "react";

import { cn } from "@/lib/utils";
import "./overlay-controls.css";

type AnyProps = Record<string, any>;
type FormStore = {
    values: Record<string, unknown>;
    getFieldsValue: () => Record<string, unknown>;
    setFieldsValue: (next: Record<string, unknown>) => void;
    resetFields: () => void;
    validateFields: () => Promise<Record<string, unknown>>;
    subscribe: (listener: () => void) => () => void;
};

const FormContext = createContext<FormStore | null>(null);

function createForm(initialValues: Record<string, unknown> = {}): FormStore {
    let values = { ...initialValues };
    const listeners = new Set<() => void>();
    const update = (next: Record<string, unknown>) => {
        values = { ...values, ...next };
        listeners.forEach((listener) => listener());
    };
    return {
        values,
        getFieldsValue: () => ({ ...values }),
        setFieldsValue: update,
        resetFields: () => {
            values = {};
            listeners.forEach((listener) => listener());
        },
        validateFields: async () => ({ ...values }),
        subscribe: (listener) => (listeners.add(listener), () => listeners.delete(listener)),
    };
}

function feedbackText(value: unknown) {
    return typeof value === "object" && value && "content" in value ? String((value as { content: unknown }).content) : String(value ?? "");
}

const message = {
    success: (value: unknown) => toast.success(feedbackText(value)),
    error: (value: unknown) => toast.danger(feedbackText(value)),
    warning: (value: unknown) => toast.warning(feedbackText(value)),
    info: (value: unknown) => toast.info(feedbackText(value)),
    loading: (value: unknown) => {
        const id = toast(feedbackText(value), { variant: "default" });
        return () => toast.close(id);
    },
};

type ConfirmConfig = AnyProps & { title?: ReactNode; content?: ReactNode; okText?: ReactNode; cancelText?: ReactNode; okButtonProps?: AnyProps; onOk?: () => void | Promise<void>; onCancel?: () => void };
let openConfirm: ((config: ConfirmConfig) => { destroy: () => void }) | null = null;

function ConfirmHost() {
    const [config, setConfig] = useState<ConfirmConfig | null>(null);
    openConfirm = (next) => {
        setConfig(next);
        return { destroy: () => setConfig(null) };
    };
    const close = () => setConfig(null);
    return (
        <>
            <Toast.Provider placement="top end" />
            <AlertDialog.Backdrop isOpen={Boolean(config)} onOpenChange={(isOpen) => !isOpen && close()}>
                <AlertDialog.Container>
                    <AlertDialog.Dialog className="relative max-w-md">
                        <AlertDialog.Header className="visora-overlay-header">
                            <AlertDialog.Heading>{config?.title}</AlertDialog.Heading>
                            <OverlayCloseButton />
                        </AlertDialog.Header>
                        {config?.content ? <AlertDialog.Body>{config.content}</AlertDialog.Body> : null}
                        <AlertDialog.Footer>
                            <HeroButton
                                slot="close"
                                variant="tertiary"
                                onPress={() => {
                                    config?.onCancel?.();
                                    close();
                                }}
                            >
                                {config?.cancelText || "取消"}
                            </HeroButton>
                            <HeroButton
                                slot="close"
                                variant={config?.okButtonProps?.danger ? "danger" : "primary"}
                                onPress={() => {
                                    void config?.onOk?.();
                                    close();
                                }}
                            >
                                {config?.okText || "确认"}
                            </HeroButton>
                        </AlertDialog.Footer>
                    </AlertDialog.Dialog>
                </AlertDialog.Container>
            </AlertDialog.Backdrop>
        </>
    );
}

export function App({ children }: { children: ReactNode }) {
    return (
        <>
            {children}
            <ConfirmHost />
        </>
    );
}

App.useApp = () => ({ message, modal: { confirm: (config: ConfirmConfig) => openConfirm?.(config) || { destroy: () => undefined } } });
export const ConfigProvider = ({ children }: { children: ReactNode }) => <>{children}</>;

export const Button = forwardRef<HTMLButtonElement, AnyProps>(function Button({ type, danger, loading, disabled, block, icon, iconPlacement, children, className, onClick, ...props }, ref) {
    const variant = danger ? "danger" : type === "primary" ? "primary" : type === "text" || type === "link" ? "tertiary" : "secondary";
    return (
        <HeroButton
            ref={ref}
            {...props}
            fullWidth={block}
            isDisabled={disabled}
            isPending={loading}
            variant={variant}
            className={cn(block && "w-full", variant !== "primary" && variant !== "danger" && "visora-default-button", className)}
            onPress={onClick}
        >
            {icon && iconPlacement !== "end" ? icon : null}
            {children}
            {icon && iconPlacement === "end" ? icon : null}
        </HeroButton>
    );
});

export function Card({ children, className, cover, hoverable, styles, bodyStyle, ...props }: AnyProps) {
    const body = styles?.body || bodyStyle;
    return (
        <HeroCard {...props} className={cn("overflow-hidden rounded-xl", hoverable && "transition-colors hover:bg-surface-secondary", className)}>
            {cover}
            {<HeroCard.Content style={body}>{children}</HeroCard.Content>}
        </HeroCard>
    );
}

export function Tag({ children, color, className, bordered, ...props }: AnyProps) {
    return (
        <span
            {...props}
            className={cn(
                "inline-flex items-center gap-1 rounded-md border border-border bg-surface-secondary px-2 py-0.5 text-xs text-muted",
                color === "error" && "border-danger/30 bg-danger-soft text-danger-soft-foreground",
                color === "success" && "border-success/30 bg-success-soft text-success-soft-foreground",
                bordered === false && "border-transparent",
                className,
            )}
        >
            {children}
        </span>
    );
}
Tag.CheckableTag = ({ checked, onChange, children, className, ...props }: AnyProps) => (
    <HeroButton {...props} size="sm" variant={checked ? "secondary" : "tertiary"} aria-pressed={checked} onPress={() => onChange?.(!checked)} className={className}>
        {children}
    </HeroButton>
);

function InputBase({ className, prefix, suffix, addonAfter, allowClear, onChange, value, defaultValue, ...props }: AnyProps, kind: "input" | "textarea" = "input") {
    const control =
        kind === "textarea" ? (
            <textarea {...props} value={value} defaultValue={defaultValue} onChange={onChange} className={cn("min-h-20 w-full resize-y bg-transparent outline-none", className)} />
        ) : (
            <input {...props} value={value} defaultValue={defaultValue} onChange={onChange} className={cn("min-w-0 flex-1 bg-transparent outline-none", className)} />
        );
    return (
        <span className="flex min-h-9 w-full items-center gap-2 rounded-lg border border-border bg-field-background px-3 text-sm shadow-xs focus-within:ring-2 focus-within:ring-focus/30">
            {prefix}
            {control}
            {allowClear && value ? (
                <button type="button" onClick={() => onChange?.({ target: { value: "" } })} aria-label="清除">
                    <X className="size-3.5" />
                </button>
            ) : null}
            {suffix}
            {addonAfter}
        </span>
    );
}
export const Input = forwardRef<HTMLInputElement, AnyProps>(function Input(props, ref) {
    return <InputBase {...props} ref={ref} />;
}) as any;
Input.TextArea = (props: AnyProps) => <InputBase {...props} kind="textarea" />;
Input.Password = (props: AnyProps) => <InputBase {...props} type="password" />;
Input.Search = ({ enterButton, ...props }: AnyProps) => <InputBase {...props} suffix={enterButton || <Search className="size-4" />} />;
export const InputNumber = ({ value, onChange, className, ...props }: AnyProps) => (
    <InputBase {...props} type="number" value={value ?? ""} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange?.(event.target.value === "" ? null : Number(event.target.value))} className={className} />
);

export function Checkbox({ children, checked, defaultChecked, onChange, disabled, className, ...props }: AnyProps) {
    return (
        <label className={cn("inline-flex items-center gap-2 text-sm", className)}>
            <input {...props} type="checkbox" checked={checked} defaultChecked={defaultChecked} disabled={disabled} onChange={onChange} className="size-4 accent-[var(--accent)]" />
            {children}
        </label>
    );
}
Checkbox.Group = ({ options, value = [], onChange, children, className }: AnyProps) => (
    <div className={cn("flex flex-wrap gap-3", className)}>
        {options
            ? options.map((option: any) => (
                  <Checkbox
                      key={option.value ?? option}
                      checked={value.includes(option.value ?? option)}
                      onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange?.(event.target.checked ? [...value, option.value ?? option] : value.filter((item: unknown) => item !== (option.value ?? option)))}
                  >
                      {option.label ?? option}
                  </Checkbox>
              ))
            : children}
    </div>
);

export function Switch({ checked, defaultChecked, onChange, disabled, checkedChildren, unCheckedChildren, className, ...props }: AnyProps) {
    return (
        <HeroSwitch {...props} isSelected={checked} defaultSelected={defaultChecked} isDisabled={disabled} onChange={onChange} className={className}>
            {checked ? checkedChildren : unCheckedChildren}
        </HeroSwitch>
    );
}

export function Slider({ value, min = 0, max = 100, step = 1, onChange, disabled, className, ...props }: AnyProps) {
    return (
        <HeroSlider {...props} className={className} minValue={min} maxValue={max} step={step} value={value ?? min} isDisabled={disabled} onChange={onChange}>
            <HeroSlider.Track>
                <HeroSlider.Fill />
                <HeroSlider.Thumb />
            </HeroSlider.Track>
        </HeroSlider>
    );
}

function toCssSize(value: unknown) {
    return typeof value === "number" ? `${value}px` : typeof value === "string" ? value : undefined;
}

function OverlayCloseButton() {
    return (
        <HeroButton slot="close" isIconOnly variant="tertiary" aria-label="关闭弹窗" className="visora-overlay-close">
            <X className="size-4" strokeWidth={1.75} />
        </HeroButton>
    );
}

function ModalShell({ open, onCancel, title, footer, children, width, onOk, okText, cancelText, okButtonProps, styles, className }: AnyProps) {
    const containerStyle = width ? ({ "--modal-width": toCssSize(width) } as CSSProperties) : undefined;
    return (
        <HeroModal.Backdrop isOpen={open} onOpenChange={(isOpen) => !isOpen && onCancel?.()}>
            <HeroModal.Container scroll="inside" className={cn(width && "heroui-compat-modal-container")} style={containerStyle as any}>
                <HeroModal.Dialog className={cn(width && "!w-full !max-w-none", className)}>
                    <HeroModal.Header className="visora-overlay-header">
                        <HeroModal.Heading>{title}</HeroModal.Heading>
                        <OverlayCloseButton />
                    </HeroModal.Header>
                    <HeroModal.Body style={styles?.body}>{children}</HeroModal.Body>
                    {footer === null ? null : (
                        <HeroModal.Footer>
                            {footer || (
                                <>
                                    <HeroButton variant="tertiary" onPress={onCancel}>
                                        {cancelText || "取消"}
                                    </HeroButton>
                                    <HeroButton variant={okButtonProps?.danger ? "danger" : "primary"} onPress={() => void onOk?.()}>
                                        {okText || "确认"}
                                    </HeroButton>
                                </>
                            )}
                        </HeroModal.Footer>
                    )}
                </HeroModal.Dialog>
            </HeroModal.Container>
        </HeroModal.Backdrop>
    );
}
export const Modal = ModalShell as any;

export function Drawer({ open, onClose, title, children, placement = "right", width, height, size, className }: AnyProps) {
    const side = placement === "left" ? "left" : placement === "bottom" ? "bottom" : "right";
    const dimensionStyle: CSSProperties = side === "bottom" ? { height: toCssSize(height) || (size === "large" ? "min(78dvh, 760px)" : undefined) } : { width: toCssSize(width) || (size === "large" ? "min(720px, calc(100vw - 24px))" : undefined) };
    return (
        <HeroDrawer.Backdrop isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose?.()}>
            <HeroDrawer.Content placement={side as any} className={cn("max-w-[calc(100vw-24px)]", className)} style={dimensionStyle as any}>
                <HeroDrawer.Dialog className="relative">
                    <HeroDrawer.Header className="visora-overlay-header">
                        <HeroDrawer.Heading>{title}</HeroDrawer.Heading>
                        <OverlayCloseButton />
                    </HeroDrawer.Header>
                    <HeroDrawer.Body>{children}</HeroDrawer.Body>
                </HeroDrawer.Dialog>
            </HeroDrawer.Content>
        </HeroDrawer.Backdrop>
    );
}

export function Select({ options = [], value, defaultValue, onChange, mode, placeholder, className, disabled, ...props }: AnyProps) {
    const values = Array.isArray(value) ? value : undefined;
    return (
        <span className={cn("relative inline-flex min-h-9 min-w-24 items-center rounded-lg border border-border bg-field-background", className)}>
            <select
                {...props}
                disabled={disabled}
                multiple={mode === "multiple" || mode === "tags"}
                value={values || (value ?? "")}
                defaultValue={defaultValue}
                onChange={(event) => onChange?.(mode === "multiple" || mode === "tags" ? Array.from(event.target.selectedOptions, (option) => option.value) : event.target.value)}
                className="h-9 w-full appearance-none bg-transparent px-3 pr-8 text-sm outline-none"
            >
                <option value="" disabled>
                    {placeholder || "请选择"}
                </option>
                {options.map((option: any) => (
                    <option key={String(option.value)} value={option.value} disabled={option.disabled}>
                        {option.label ?? option.value}
                    </option>
                ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-4 text-muted" />
        </span>
    );
}

export function Segmented({ options = [], value, onChange, className, size }: AnyProps) {
    return (
        <div className={cn("inline-flex rounded-lg bg-surface-secondary p-1", size === "small" && "text-xs", className)}>
            {options.map((option: any) => {
                const item = typeof option === "object" ? option : { value: option, label: option };
                const active = item.value === value;
                return (
                    <button
                        type="button"
                        key={String(item.value)}
                        disabled={item.disabled}
                        onClick={() => onChange?.(item.value)}
                        className={cn("rounded-md px-2.5 py-1.5 transition-colors", active && "bg-surface text-foreground shadow-xs", !active && "text-muted hover:text-foreground")}
                    >
                        {item.icon}
                        {item.label}
                    </button>
                );
            })}
        </div>
    );
}

export function Tooltip({ title, children }: AnyProps) {
    return isValidElement(children) ? cloneElement(children as any, { title: typeof title === "string" ? title : undefined }) : <>{children}</>;
}
export function Popover({ content, children, title }: AnyProps) {
    return (
        <span className="relative inline-flex" title={typeof content === "string" ? content : typeof title === "string" ? title : undefined}>
            {children}
        </span>
    );
}
export function Popconfirm({ title, onConfirm, children }: AnyProps) {
    return isValidElement(children) ? cloneElement(children as any, { onClick: () => openConfirm?.({ title, onOk: onConfirm }) }) : <>{children}</>;
}

export function Dropdown({ children, menu, open, onOpenChange }: AnyProps) {
    const [localOpen, setLocalOpen] = useState(false);
    const visible = open ?? localOpen;
    const setVisible = (next: boolean) => {
        setLocalOpen(next);
        onOpenChange?.(next);
    };
    return (
        <span className="relative inline-flex">
            <span onClick={() => setVisible(!visible)}>{children}</span>
            {visible ? (
                <div className="absolute right-0 top-full z-50 mt-2 min-w-40 rounded-lg border border-border bg-overlay p-1 shadow-lg">
                    {(menu?.items || []).map((item: any) => (
                        <button
                            key={String(item.key)}
                            type="button"
                            disabled={item.disabled}
                            onClick={() => {
                                item.onClick?.({ key: item.key });
                                setVisible(false);
                            }}
                            className={cn("flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm hover:bg-surface-secondary", item.danger && "text-danger")}
                        >
                            {item.icon}
                            {item.label}
                        </button>
                    ))}
                </div>
            ) : null}
        </span>
    );
}

export function Empty({ description, image, className }: AnyProps) {
    return (
        <div className={cn("flex min-h-28 flex-col items-center justify-center gap-2 text-sm text-muted", className)}>
            {image === Empty.PRESENTED ? null : null}
            <span>{description || "暂无内容"}</span>
        </div>
    );
}
Empty.PRESENTED = "presented";
Empty.PRESENTED_IMAGE_SIMPLE = "presented";
export function Alert({ type = "info", message: title, description, className, showIcon, ...props }: AnyProps) {
    return (
        <div
            {...props}
            className={cn(
                "rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-sm text-accent-soft-foreground",
                type === "error" && "border-danger/20 bg-danger-soft text-danger-soft-foreground",
                type === "warning" && "border-warning/20 bg-warning-soft text-warning-soft-foreground",
                type === "success" && "border-success/20 bg-success-soft text-success-soft-foreground",
                className,
            )}
        >
            {title ? <p className="font-medium">{title}</p> : null}
            {description ? <p className="mt-1 opacity-80">{description}</p> : null}
        </div>
    );
}
export const Spin = ({ spinning = true, children, className }: AnyProps) =>
    spinning ? (
        <span className={cn("inline-flex items-center justify-center p-4", className)}>
            <HeroSpinner />
        </span>
    ) : (
        <>{children}</>
    );
export const Progress = ({ percent = 0, className }: AnyProps) => (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-secondary", className)}>
        <div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} />
    </div>
);

export function Pagination({ current = 1, pageSize = 10, total = 0, onChange, className }: AnyProps) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return (
        <div className={cn("flex items-center gap-1", className)}>
            <HeroButton isIconOnly size="sm" variant="tertiary" isDisabled={current <= 1} onPress={() => onChange?.(current - 1)}>
                <ChevronLeft className="size-4" />
            </HeroButton>
            <span className="min-w-12 text-center text-sm tabular-nums">
                {current} / {pages}
            </span>
            <HeroButton isIconOnly size="sm" variant="tertiary" isDisabled={current >= pages} onPress={() => onChange?.(current + 1)}>
                <ChevronRight className="size-4" />
            </HeroButton>
        </div>
    );
}

export function Space({ children, className, direction }: AnyProps) {
    return <div className={cn(direction === "vertical" ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2", className)}>{children}</div>;
}
Space.Compact = ({ children, className }: AnyProps) => <div className={cn("flex [&>*]:rounded-none [&>*:first-child]:rounded-l-lg [&>*:last-child]:rounded-r-lg", className)}>{children}</div>;
export function Typography({ children }: AnyProps) {
    return <>{children}</>;
}
Typography.Title = ({ children, level = 2, className, ...props }: AnyProps) => {
    const TagName = `h${level}` as keyof React.JSX.IntrinsicElements;
    return (
        <TagName {...props} className={cn("font-semibold tracking-tight", className)}>
            {children}
        </TagName>
    );
};
Typography.Text = ({ children, type, className, ...props }: AnyProps) => (
    <span {...props} className={cn(type === "secondary" && "text-muted", className)}>
        {children}
    </span>
);
Typography.Paragraph = ({ children, className, ...props }: AnyProps) => (
    <p {...props} className={cn("text-sm leading-6 text-muted", className)}>
        {children}
    </p>
);

export function Form({ children, form, initialValues, className, onFinish, ...props }: AnyProps) {
    const internal = useMemo(() => form || createForm(initialValues), [form]);
    const [, update] = useState(0);
    useState(() => internal.subscribe(() => update((value) => value + 1)));
    return (
        <FormContext.Provider value={internal}>
            <form
                {...props}
                className={cn("space-y-4", className)}
                onSubmit={(event) => {
                    event.preventDefault();
                    void onFinish?.(internal.getFieldsValue());
                }}
            >
                {children}
            </form>
        </FormContext.Provider>
    );
}
Form.useForm = <T extends Record<string, unknown>>() => [useMemo(() => createForm(), [])] as [FormStore & { getFieldsValue: () => T; setFieldsValue: (values: Partial<T>) => void }];
Form.useWatch = (name: string, form?: FormStore) => {
    const contextForm = useContext(FormContext);
    const watchedForm = form || contextForm;
    return useSyncExternalStore(
        (listener) => watchedForm?.subscribe(listener) || (() => undefined),
        () => watchedForm?.getFieldsValue()[name],
        () => watchedForm?.getFieldsValue()[name],
    );
};
Form.Item = ({ name, label, extra, children, className }: AnyProps) => {
    const form = useContext(FormContext);
    const child =
        isValidElement(children) && name
            ? cloneElement(children as any, {
                  value: form?.getFieldsValue()[name] ?? (children as any).props.value,
                  onChange: (value: any) => {
                      const next = value?.target ? value.target.value : value;
                      form?.setFieldsValue({ [name]: next });
                      (children as any).props.onChange?.(value);
                  },
              })
            : children;
    return (
        <label className={cn("block space-y-1.5", className)}>
            {label ? <span className="block text-sm font-medium">{label}</span> : null}
            {child}
            {extra ? <span className="block text-xs text-muted">{extra}</span> : null}
        </label>
    );
};

export function Tabs({ items, activeKey, defaultActiveKey, onChange, className }: AnyProps) {
    const [selected, setSelected] = useState(activeKey || defaultActiveKey || items?.[0]?.key);
    const current = activeKey || selected;
    return (
        <div className={cn("space-y-4", className)}>
            <div className="flex gap-1 border-b border-border">
                {items?.map((item: any) => (
                    <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                            setSelected(item.key);
                            onChange?.(item.key);
                        }}
                        className={cn("border-b-2 px-3 py-2 text-sm", current === item.key ? "border-accent text-foreground" : "border-transparent text-muted")}
                    >
                        {item.label}
                    </button>
                ))}
            </div>
            {items?.find((item: any) => item.key === current)?.children}
        </div>
    );
}

export function Collapse({ items = [], className }: AnyProps) {
    return (
        <div className={cn("divide-y divide-border rounded-lg border border-border", className)}>
            {items.map((item: any) => (
                <details key={item.key}>
                    <summary className="cursor-pointer px-3 py-2 text-sm font-medium">{item.label}</summary>
                    <div className="px-3 pb-3">{item.children}</div>
                </details>
            ))}
        </div>
    );
}
export function Timeline({ items = [] }: AnyProps) {
    return (
        <ol className="space-y-4 border-l border-border pl-4">
            {items.map((item: any, index: number) => (
                <li key={item.key || index} className="relative text-sm before:absolute before:-left-[21px] before:top-1.5 before:size-2 before:rounded-full before:bg-accent">
                    {item.children}
                </li>
            ))}
        </ol>
    );
}
export function Table({ columns = [], dataSource = [], rowKey = "key", pagination = false, ...props }: AnyProps) {
    return (
        <div className="overflow-x-auto rounded-lg border border-border">
            <table {...props} className="w-full text-left text-sm">
                <thead className="bg-surface-secondary text-muted">
                    <tr>
                        {columns.map((column: any) => (
                            <th key={column.key || column.dataIndex} className="px-3 py-2 font-medium">
                                {column.title}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {dataSource.map((row: any, index: number) => (
                        <tr key={row[rowKey] || index} className="border-t border-border">
                            {columns.map((column: any) => (
                                <td key={column.key || column.dataIndex} className="px-3 py-2">
                                    {column.render ? column.render(row[column.dataIndex], row, index) : row[column.dataIndex]}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

export function Image({ src, alt = "", className, preview, ...props }: AnyProps) {
    return <img {...props} src={src} alt={alt} className={cn("max-w-full", preview && "cursor-zoom-in", className)} onClick={() => preview?.onVisibleChange?.(true)} />;
}
Image.PreviewGroup = ({ children }: AnyProps) => <>{children}</>;

export const theme = { useToken: () => ({ token: { colorPrimary: "var(--accent)", colorText: "var(--foreground)", colorTextSecondary: "var(--muted)", colorBgContainer: "var(--surface)", colorBorder: "var(--border)" } }) };
export type MenuProps = AnyProps;
export type ThemeConfig = AnyProps;
