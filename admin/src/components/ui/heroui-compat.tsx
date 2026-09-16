import {
    AlertDialog,
    Button as HeroButton,
    Card as HeroCard,
    Drawer as HeroDrawer,
    Dropdown as HeroDropdown,
    InputGroup as HeroInputGroup,
    ListBox as HeroListBox,
    ListBoxItem as HeroListBoxItem,
    Modal as HeroModal,
    NumberField as HeroNumberField,
    Radio as HeroRadio,
    RadioGroup as HeroRadioGroup,
    Select as HeroSelect,
    Slider as HeroSlider,
    Skeleton as HeroSkeleton,
    Spinner as HeroSpinner,
    Switch as HeroSwitch,
    Table as HeroTable,
    Tabs as HeroTabs,
    Toast,
    toast,
} from "@heroui/react";
import { ChevronDown, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Children, cloneElement, createContext, forwardRef, isValidElement, useContext, useMemo, useState } from "react";

const cn = (...values: Array<string | false | null | undefined>) => values.filter(Boolean).join(" ");

type AnyProps = Record<string, any>;
type FormStore = {
    values: Record<string, unknown>;
    getFieldsValue: () => Record<string, unknown>;
    setFieldsValue: (next: Record<string, unknown>) => void;
    resetFields: () => void;
    validateFields: () => Promise<Record<string, unknown>>;
    subscribe: (listener: () => void) => () => void;
    submit: () => void;
    bindSubmit: (submit: () => void) => void;
};

const FormContext = createContext<FormStore | null>(null);

function createForm(initialValues: Record<string, unknown> = {}): FormStore {
    let values = { ...initialValues };
    let submit: () => void = () => undefined;
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
        submit: () => submit(),
        bindSubmit: (next) => {
            submit = next;
        },
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
                    <AlertDialog.Dialog className="max-w-md">
                        <AlertDialog.Header>
                            <AlertDialog.Heading>{config?.title}</AlertDialog.Heading>
                        </AlertDialog.Header>
                        {config?.content ? <AlertDialog.Body>{config.content}</AlertDialog.Body> : null}
                        <AlertDialog.Footer>
                            <HeroButton slot="close" variant="tertiary" onPress={() => { config?.onCancel?.(); close(); }}>{config?.cancelText || "取消"}</HeroButton>
                            <HeroButton slot="close" variant={config?.okButtonProps?.danger ? "danger" : "primary"} onPress={() => { void config?.onOk?.(); close(); }}>{config?.okText || "确认"}</HeroButton>
                        </AlertDialog.Footer>
                    </AlertDialog.Dialog>
                </AlertDialog.Container>
            </AlertDialog.Backdrop>
        </>
    );
}

export function App({ children }: { children: ReactNode }) {
    return <>{children}<ConfirmHost /></>;
}

App.useApp = () => ({ message, modal: { confirm: (config: ConfirmConfig) => openConfirm?.(config) || { destroy: () => undefined } } });
export const ConfigProvider = ({ children }: { children: ReactNode } & AnyProps) => <>{children}</>;

export const Button = forwardRef<HTMLButtonElement, AnyProps>(function Button({ type, danger, loading, disabled, block, icon, iconPlacement, children, className, onClick, ...props }, ref) {
    return <HeroButton ref={ref} {...props} fullWidth={block} isDisabled={disabled} isPending={loading} variant={danger ? "danger" : type === "primary" ? "primary" : type === "text" || type === "link" ? "tertiary" : "secondary"} className={cn(block && "w-full", className)} onPress={onClick}>{icon && iconPlacement !== "end" ? icon : null}{children}{icon && iconPlacement === "end" ? icon : null}</HeroButton>;
});

export function Card({ children, className, cover, hoverable, styles, bodyStyle, ...props }: AnyProps) {
    const body = styles?.body || bodyStyle;
    return <HeroCard {...props} className={cn("overflow-hidden rounded-xl", hoverable && "transition-colors hover:bg-surface-secondary", className)}>{cover}{<HeroCard.Content style={body}>{children}</HeroCard.Content>}</HeroCard>;
}

export function Tag({ children, color, className, bordered, ...props }: AnyProps) {
    return <span {...props} className={cn("inline-flex items-center gap-1 rounded-md border border-border bg-surface-secondary px-2 py-0.5 text-xs text-muted", color === "error" && "border-danger/30 bg-danger-soft text-danger-soft-foreground", color === "success" && "border-success/30 bg-success-soft text-success-soft-foreground", bordered === false && "border-transparent", className)}>{children}</span>;
}
Tag.CheckableTag = ({ checked, onChange, children, className, ...props }: AnyProps) => <HeroButton {...props} size="sm" variant={checked ? "secondary" : "tertiary"} aria-pressed={checked} onPress={() => onChange?.(!checked)} className={className}>{children}</HeroButton>;

function InputBase({ className, prefix, suffix, addonAfter, allowClear, onChange, value, defaultValue, ...props }: AnyProps, kind: "input" | "textarea" = "input") {
    return <HeroInputGroup fullWidth className={cn("admin-input", className)}>{prefix ? <HeroInputGroup.Prefix>{prefix}</HeroInputGroup.Prefix> : null}{kind === "textarea" ? <HeroInputGroup.TextArea {...props} value={value} defaultValue={defaultValue} onChange={onChange} /> : <HeroInputGroup.Input {...props} value={value} defaultValue={defaultValue} onChange={onChange} />}{allowClear && value ? <HeroInputGroup.Suffix><HeroButton isIconOnly size="sm" variant="tertiary" onPress={() => onChange?.({ target: { value: "" } })} aria-label="清除"><X className="size-3.5" /></HeroButton></HeroInputGroup.Suffix> : null}{suffix || addonAfter ? <HeroInputGroup.Suffix>{suffix}{addonAfter}</HeroInputGroup.Suffix> : null}</HeroInputGroup>;
}
export const Input = forwardRef<HTMLInputElement, AnyProps>(function Input(props, ref) { return <InputBase {...props} ref={ref} />; }) as any;
Input.TextArea = (props: AnyProps) => <InputBase {...props} kind="textarea" />;
Input.Password = (props: AnyProps) => <InputBase {...props} type="password" />;
Input.Search = ({ enterButton, ...props }: AnyProps) => <InputBase {...props} suffix={enterButton || <Search className="size-4" />} />;
export const InputNumber = ({ value, onChange, className, ...props }: AnyProps) => <HeroNumberField {...props} value={value ?? undefined} onChange={onChange} fullWidth className={className}><HeroNumberField.Group><HeroNumberField.Input /></HeroNumberField.Group></HeroNumberField>;

export function Checkbox({ children, checked, defaultChecked, onChange, disabled, className, ...props }: AnyProps) {
    return <HeroSwitch {...props} isSelected={checked} defaultSelected={defaultChecked} isDisabled={disabled} onChange={onChange} className={className}>{children}</HeroSwitch>;
}
Checkbox.Group = ({ options, value = [], onChange, children, className }: AnyProps) => <div className={cn("flex flex-wrap gap-3", className)}>{options ? options.map((option: any) => <Checkbox key={option.value ?? option} checked={value.includes(option.value ?? option)} onChange={(event: React.ChangeEvent<HTMLInputElement>) => onChange?.(event.target.checked ? [...value, option.value ?? option] : value.filter((item: unknown) => item !== (option.value ?? option)))}>{option.label ?? option}</Checkbox>) : children}</div>;

export function Switch({ checked, defaultChecked, onChange, disabled, checkedChildren, unCheckedChildren, className, ...props }: AnyProps) {
    return <HeroSwitch {...props} isSelected={checked} defaultSelected={defaultChecked} isDisabled={disabled} onChange={onChange} className={className}>{checked ? checkedChildren : unCheckedChildren}</HeroSwitch>;
}

export function Slider({ value, min = 0, max = 100, step = 1, onChange, disabled, className, ...props }: AnyProps) {
    return <HeroSlider {...props} className={className} minValue={min} maxValue={max} step={step} value={value ?? min} isDisabled={disabled} onChange={onChange}><HeroSlider.Track><HeroSlider.Fill /><HeroSlider.Thumb /></HeroSlider.Track></HeroSlider>;
}

function ModalShell({ open, onCancel, title, footer, children, width, onOk, okText, cancelText, okButtonProps, styles, className }: AnyProps) {
    return <HeroModal.Backdrop isOpen={open} onOpenChange={(isOpen) => !isOpen && onCancel?.()}><HeroModal.Container className={typeof width === "number" ? `max-w-[${width}px]` : undefined}><HeroModal.Dialog className={className}><HeroModal.Header><HeroModal.Heading>{title}</HeroModal.Heading></HeroModal.Header><HeroModal.Body style={styles?.body}>{children}</HeroModal.Body>{footer === null ? null : <HeroModal.Footer>{footer || <><HeroButton variant="tertiary" onPress={onCancel}>{cancelText || "取消"}</HeroButton><HeroButton variant={okButtonProps?.danger ? "danger" : "primary"} onPress={() => void onOk?.()}>{okText || "确认"}</HeroButton></>}</HeroModal.Footer>}</HeroModal.Dialog></HeroModal.Container></HeroModal.Backdrop>;
}
export const Modal = ModalShell as any;

export function Drawer({ open, onClose, title, children, placement = "right", width, height, className }: AnyProps) {
    const side = placement === "left" ? "left" : placement === "bottom" ? "bottom" : "right";
    return <HeroDrawer.Backdrop isOpen={open} onOpenChange={(isOpen) => !isOpen && onClose?.()}><HeroDrawer.Content placement={side as any} className={cn(className, typeof width === "number" && `w-[${width}px]`, typeof height === "string" && side === "bottom" && `h-[${height}]`)}><HeroDrawer.Dialog><HeroDrawer.Header><HeroDrawer.Heading>{title}</HeroDrawer.Heading><HeroDrawer.CloseTrigger /></HeroDrawer.Header><HeroDrawer.Body>{children}</HeroDrawer.Body></HeroDrawer.Dialog></HeroDrawer.Content></HeroDrawer.Backdrop>;
}

export function Select({ options = [], value, defaultValue, onChange, mode, placeholder, className, disabled, ...props }: AnyProps) {
    const selectedKey = value === undefined || value === null || value === "" ? null : String(value);
    return <HeroSelect {...props} className={cn("admin-select", className)} defaultSelectedKey={defaultValue === undefined ? undefined : String(defaultValue)} isDisabled={disabled} selectedKey={selectedKey} onSelectionChange={(key) => onChange?.(String(key))}><HeroSelect.Trigger><HeroSelect.Value>{placeholder || "请选择"}</HeroSelect.Value><HeroSelect.Indicator><ChevronDown className="size-4" /></HeroSelect.Indicator></HeroSelect.Trigger><HeroSelect.Popover><HeroListBox>{options.map((option: any) => <HeroListBoxItem key={String(option.value)} id={String(option.value)} isDisabled={option.disabled}>{option.label ?? option.value}</HeroListBoxItem>)}</HeroListBox></HeroSelect.Popover></HeroSelect>;
}

export function Segmented({ options = [], value, onChange, className, size }: AnyProps) {
    return <div className={cn("inline-flex gap-1", className)}>{options.map((option: any) => { const item = typeof option === "object" ? option : { value: option, label: option }; return <HeroButton key={String(item.value)} isDisabled={item.disabled} size={size === "small" ? "sm" : "md"} variant={item.value === value ? "secondary" : "tertiary"} onPress={() => onChange?.(item.value)}>{item.icon}{item.label}</HeroButton>; })}</div>;
}

export function Tooltip({ title, children }: AnyProps) { return isValidElement(children) ? cloneElement(children as any, { title: typeof title === "string" ? title : undefined }) : <>{children}</>; }
export function Popover({ content, children, title }: AnyProps) { return <span className="relative inline-flex" title={typeof content === "string" ? content : typeof title === "string" ? title : undefined}>{children}</span>; }
export function Popconfirm({ title, onConfirm, children }: AnyProps) { return isValidElement(children) ? cloneElement(children as any, { onClick: () => openConfirm?.({ title, onOk: onConfirm }) }) : <>{children}</>; }

export function Dropdown({ children, menu, open, onOpenChange }: AnyProps) {
    return <HeroDropdown isOpen={open} onOpenChange={onOpenChange}><HeroDropdown.Trigger>{children}</HeroDropdown.Trigger><HeroDropdown.Popover><HeroDropdown.Menu items={menu?.items || []}>{(item: any) => <HeroDropdown.Item id={String(item.key)} isDisabled={item.disabled} variant={item.danger ? "danger" : "default"} onAction={() => item.onClick?.({ key: item.key })}>{item.icon}{item.label}</HeroDropdown.Item>}</HeroDropdown.Menu></HeroDropdown.Popover></HeroDropdown>;
}

export function Empty({ description, image, className }: AnyProps) { return <div className={cn("flex min-h-28 flex-col items-center justify-center gap-2 text-sm text-muted", className)}>{image === Empty.PRESENTED ? null : null}<span>{description || "暂无内容"}</span></div>; }
Empty.PRESENTED = "presented";
Empty.PRESENTED_IMAGE_SIMPLE = "presented";
export function Alert({ type = "info", message: title, description, className, showIcon, ...props }: AnyProps) { return <div {...props} className={cn("admin-alert rounded-lg border border-accent/20 bg-accent-soft px-3 py-2 text-sm text-accent-soft-foreground", type === "error" && "border-danger/20 bg-danger-soft text-danger-soft-foreground", type === "warning" && "border-warning/20 bg-warning-soft text-warning-soft-foreground", type === "success" && "border-success/20 bg-success-soft text-success-soft-foreground", className)}>{title ? <p className="font-medium">{title}</p> : null}{description ? <p className="mt-1 opacity-80">{description}</p> : null}</div>; }
export const Spin = ({ spinning = true, children, className }: AnyProps) => spinning ? <span className={cn("inline-flex items-center justify-center p-4", className)}><HeroSpinner /></span> : <>{children}</>;
export const Progress = ({ percent = 0, className }: AnyProps) => <div className={cn("h-1.5 overflow-hidden rounded-full bg-surface-secondary", className)}><div className="h-full bg-accent transition-all" style={{ width: `${percent}%` }} /></div>;

export function Pagination({ current = 1, pageSize = 10, total = 0, onChange, className }: AnyProps) {
    const pages = Math.max(1, Math.ceil(total / pageSize));
    return <div className={cn("flex items-center gap-1", className)}><HeroButton isIconOnly size="sm" variant="tertiary" isDisabled={current <= 1} onPress={() => onChange?.(current - 1)}><ChevronLeft className="size-4" /></HeroButton><span className="min-w-12 text-center text-sm tabular-nums">{current} / {pages}</span><HeroButton isIconOnly size="sm" variant="tertiary" isDisabled={current >= pages} onPress={() => onChange?.(current + 1)}><ChevronRight className="size-4" /></HeroButton></div>;
}

export function Space({ children, className, direction }: AnyProps) { return <div className={cn(direction === "vertical" ? "flex flex-col gap-2" : "flex flex-wrap items-center gap-2", className)}>{children}</div>; }
Space.Compact = ({ children, className }: AnyProps) => <div className={cn("flex [&>*]:rounded-none [&>*:first-child]:rounded-l-lg [&>*:last-child]:rounded-r-lg", className)}>{children}</div>;
export function Typography({ children }: AnyProps) { return <>{children}</>; }
Typography.Title = ({ children, level = 2, className, ...props }: AnyProps) => { const TagName = `h${level}` as keyof React.JSX.IntrinsicElements; return <TagName {...props} className={cn("font-semibold tracking-tight", className)}>{children}</TagName>; };
Typography.Text = ({ children, type, className, ...props }: AnyProps) => <span {...props} className={cn(type === "secondary" && "text-muted", className)}>{children}</span>;
Typography.Paragraph = ({ children, className, ...props }: AnyProps) => <p {...props} className={cn("text-sm leading-6 text-muted", className)}>{children}</p>;

export function Form<T extends Record<string, unknown> = Record<string, unknown>>({ children, form, initialValues, className, onFinish, ...props }: AnyProps) {
    const internal = useMemo(() => form || createForm(initialValues), [form]);
    const [, update] = useState(0);
    useState(() => internal.subscribe(() => update((value) => value + 1)));
    internal.bindSubmit(() => void onFinish?.(internal.getFieldsValue()));
    return <FormContext.Provider value={internal}><form {...props} className={cn("space-y-4", className)} onSubmit={(event) => { event.preventDefault(); void onFinish?.(internal.getFieldsValue()); }}>{children}</form></FormContext.Provider>;
}
Form.useForm = <T extends Record<string, unknown>>() => [useMemo(() => createForm(), [])] as [FormStore & { getFieldsValue: () => T; setFieldsValue: (values: Partial<T>) => void }];
Form.Item = ({ name, label, extra, children, className }: AnyProps) => {
    const form = useContext(FormContext);
    const child = isValidElement(children) && name ? cloneElement(children as any, { value: form?.getFieldsValue()[name] ?? (children as any).props.value, onChange: (value: any) => { const next = value?.target ? value.target.value : value; form?.setFieldsValue({ [name]: next }); (children as any).props.onChange?.(value); } }) : children;
    return <label className={cn("block space-y-1.5", className)}>{label ? <span className="block text-sm font-medium">{label}</span> : null}{child}{extra ? <span className="block text-xs text-muted">{extra}</span> : null}</label>;
};

export function Tabs({ items, activeKey, defaultActiveKey, onChange, className }: AnyProps) {
    const [selected, setSelected] = useState(activeKey || defaultActiveKey || items?.[0]?.key);
    const current = activeKey || selected;
    return <HeroTabs className={cn("admin-tabs", className)} selectedKey={current} onSelectionChange={(key) => { setSelected(String(key)); onChange?.(String(key)); }}><HeroTabs.List>{items?.map((item: any) => <HeroTabs.Tab key={item.key} id={item.key}>{item.label}</HeroTabs.Tab>)}</HeroTabs.List>{items?.map((item: any) => <HeroTabs.Panel key={item.key} id={item.key}>{item.children}</HeroTabs.Panel>)}</HeroTabs>;
}

export function Collapse({ items = [], className }: AnyProps) { return <div className={cn("divide-y divide-border rounded-lg border border-border", className)}>{items.map((item: any) => <details key={item.key}><summary className="cursor-pointer px-3 py-2 text-sm font-medium">{item.label}</summary><div className="px-3 pb-3">{item.children}</div></details>)}</div>; }
export function Timeline({ items = [] }: AnyProps) { return <ol className="space-y-4 border-l border-border pl-4">{items.map((item: any, index: number) => <li key={item.key || index} className="relative text-sm before:absolute before:-left-[21px] before:top-1.5 before:size-2 before:rounded-full before:bg-accent">{item.children}</li>)}</ol>; }
export type TableColumnsType<T extends Record<string, any>> = Array<{ align?: "left" | "center" | "right"; dataIndex?: keyof T & string; key?: string; render?: (value: any, row: T, index: number) => ReactNode; title: ReactNode; width?: number }>;
export function Table<T extends Record<string, any>>({ columns = [], dataSource = [], rowKey = "key", className, ...props }: { columns?: TableColumnsType<T>; dataSource?: T[]; rowKey?: keyof T & string; className?: string } & AnyProps) { return <HeroTable {...props} className={cn("admin-table", className)}><HeroTable.ScrollContainer><HeroTable.Content aria-label="数据列表"><HeroTable.Header columns={columns as any}>{(column: any) => <HeroTable.Column id={column.key || column.dataIndex}>{column.title}</HeroTable.Column>}</HeroTable.Header><HeroTable.Body items={dataSource as any}>{(row: T) => <HeroTable.Row id={String(row[rowKey])}>{columns.map((column, index) => <HeroTable.Cell key={column.key || column.dataIndex}>{column.render ? column.render(column.dataIndex ? row[column.dataIndex] : undefined, row, index) : column.dataIndex ? row[column.dataIndex] as ReactNode : null}</HeroTable.Cell>)}</HeroTable.Row>}</HeroTable.Body></HeroTable.Content></HeroTable.ScrollContainer></HeroTable>; }
export const Skeleton = ({ className }: AnyProps) => <HeroSkeleton className={cn("admin-skeleton min-h-24 w-full", className)} />;
export const Radio = Object.assign(HeroRadio, { Group: ({ options = [], value, onChange, className }: AnyProps) => <HeroRadioGroup className={className} value={value} onChange={(next) => onChange?.({ target: { value: next } })}>{options.map((option: any) => <HeroRadio key={String(option.value)} value={String(option.value)}>{option.label}</HeroRadio>)}</HeroRadioGroup> });

export function Image({ src, alt = "", className, preview, ...props }: AnyProps) { return <img {...props} src={src} alt={alt} className={cn("max-w-full", preview && "cursor-zoom-in", className)} onClick={() => preview?.onVisibleChange?.(true)} />; }
Image.PreviewGroup = ({ children }: AnyProps) => <>{children}</>;

export const theme = { useToken: () => ({ token: { colorPrimary: "var(--accent)", colorText: "var(--foreground)", colorTextSecondary: "var(--muted)", colorBgContainer: "var(--surface)", colorBorder: "var(--border)" } }) };
export type MenuProps = AnyProps;
export type ThemeConfig = AnyProps;
