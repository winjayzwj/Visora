import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { Form } from "./heroui-compat";

test("Form compatibility provides useWatch for an imperative form instance", () => {
    expect(typeof Form.useWatch).toBe("function");

    function Probe() {
        const [form] = Form.useForm<{ title: string }>();
        form.setFieldsValue({ title: "映序素材" });
        return <span>{Form.useWatch("title", form)}</span>;
    }

    expect(renderToStaticMarkup(<Probe />)).toContain("映序素材");
});
